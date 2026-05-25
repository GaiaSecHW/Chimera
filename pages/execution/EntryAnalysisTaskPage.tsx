import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownUp, CheckCircle2, ChevronDown, ChevronUp, FolderOpen, Loader2, PlayCircle, Plus, RefreshCw, RotateCcw, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppEaStageEvent, AppEaStagesJson, AppEaTaskDetail, AppEaTaskItem, EntryAnalyseSlotClusterSummary } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { useUiFeedback } from '../../components/UiFeedback';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { TaskOriginCard } from './taskOrigin';
import { saveExecutionReturnContext } from '../../utils/executionReturnContext';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const SLOT_TASK_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  pending: '等待中',
  cancelled: '已取消',
  failed: '失败',
  error: '错误',
  passed: '通过',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const startSecs = Math.floor(new Date(startedAt).getTime() / 1000);
  const endSecs = finishedAt ? Math.floor(new Date(finishedAt).getTime() / 1000) : nowSecs;
  const secs = Math.max(0, endSecs - startSecs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatTsDuration(startTs: number | null, endTs: number | null): string {
  if (!startTs || !endTs || endTs <= startTs) return '';
  const diff = endTs - startTs;
  if (diff < 1) return `${Math.round(diff * 1000)}ms`;
  const secs = Math.round(diff);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN');
}

function formatSlotStage(task: { entry_id?: string | null; status?: string | null }): string {
  const parts = [
    '阶段 entry_analysis',
    task.entry_id ? `入口 ${task.entry_id}` : '',
    task.status ? `状态 ${SLOT_TASK_STATUS_LABEL[task.status] || task.status}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  const normalizedPath = fsPath.startsWith('/') ? fsPath : `/${fsPath}`;
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', normalizedPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: normalizedPath } }));
}

function getTaskMode(task: Pick<AppEaTaskItem, 'task_origin_type' | 'parent_task_type'>): 'manual' | 'binary' | 'source' {
  if (String(task.task_origin_type || '').trim() !== 'binary_security') return 'manual';
  return String(task.parent_task_type || '').trim() === 'source' ? 'source' : 'binary';
}

function getTaskModeLabel(task: Pick<AppEaTaskItem, 'task_origin_type' | 'parent_task_type'>): string {
  const mode = getTaskMode(task);
  if (mode === 'manual') return '手动';
  return mode === 'source' ? '源码模式' : '二进制模式';
}

function getTaskModeBadgeClassName(task: Pick<AppEaTaskItem, 'task_origin_type' | 'parent_task_type'>): string {
  const mode = getTaskMode(task);
  if (mode === 'manual') return 'bg-slate-100 text-slate-700';
  return mode === 'source' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700';
}

function getQuickFilterButtonClassName(active: boolean, baseClassName: string): string {
  return `${baseClassName} transition-all ${active ? 'ring-2 ring-violet-200 ring-offset-1' : 'hover:opacity-80'}`;
}

function getEntryAnalysisRiskPreset(riskKey: string): { label: string; description: string; suggestedStatus: string; statusReason: string } | null {
  if (riskKey === 'queue-pressure') {
    return {
      label: '排队堆积',
      description: '优先看等待中任务，确认排队是否持续放大，以及是否存在长时间未被调度的任务。',
      suggestedStatus: 'pending',
      statusReason: '默认切到“等待中”以优先查看队列背压任务。',
    };
  }
  if (riskKey === 'timeout-high') {
    return {
      label: '超时偏高',
      description: '优先看失败任务，核查是否由长耗时、超时或重试放大导致任务提前结束。',
      suggestedStatus: 'failed',
      statusReason: '默认切到“失败”以更快定位超时异常样本。',
    };
  }
  if (riskKey === 'low-pass-rate') {
    return {
      label: '最终通过率偏低',
      description: '优先看失败任务，检查评审闭环、重试与重分类是否没有收敛。',
      suggestedStatus: 'failed',
      statusReason: '默认切到“失败”以优先查看最终未通过的任务。',
    };
  }
  if (riskKey === 'healthy') {
    return {
      label: '整体平稳',
      description: '优先看运行中任务，确认当前活跃样本在各阶段是否持续推进。',
      suggestedStatus: 'running',
      statusReason: '默认切到“分析中”以便抽样观察当前活跃任务。',
    };
  }
  return null;
}

function getEntryAnalysisRiskMatch(task: Pick<AppEaTaskItem, 'status'>, riskKey: string): { matched: boolean; label: string } | null {
  if (riskKey === 'queue-pressure') {
    return { matched: task.status === 'pending', label: '命中排队排查' };
  }
  if (riskKey === 'timeout-high') {
    return { matched: task.status === 'failed' || task.status === 'error', label: '命中超时排查' };
  }
  if (riskKey === 'low-pass-rate') {
    return { matched: task.status === 'failed' || task.status === 'error', label: '命中低通过率排查' };
  }
  if (riskKey === 'healthy') {
    return { matched: task.status === 'running' || task.status === 'pending', label: '命中活跃观测' };
  }
  return null;
}

function getEntryAnalysisRecommendationReason(
  task: Pick<AppEaTaskItem, 'status' | 'updated_at' | 'created_at'>,
  stageFocusHint: string,
  riskPreset: { label: string; description: string; suggestedStatus: string; statusReason: string } | null,
): string {
  const updatedAt = new Date(task.updated_at || task.created_at).getTime() || 0;
  const freshness = updatedAt > 0 ? `最近更新时间 ${new Date(updatedAt).toLocaleString('zh-CN')}` : '最近有更新';
  if (riskPreset?.suggestedStatus === 'pending' && task.status === 'pending') {
    return `因为当前在排查${riskPreset.label}，而这条任务处于等待中，最适合先看队列背压。${freshness}。`;
  }
  if (riskPreset?.suggestedStatus === 'failed' && (task.status === 'failed' || task.status === 'error')) {
    return `因为当前在排查${riskPreset.label}，而这条任务已经失败，更容易直接定位异常样本。${freshness}。`;
  }
  if ((task.status === 'running' || task.status === 'pending') && stageFocusHint) {
    return `因为当前带着 ${stageFocusHint} 阶段线索，这条任务仍在活跃或等待状态，更可能保留对应阶段的会话与日志。${freshness}。`;
  }
  if (task.status === 'running' || task.status === 'pending') {
    return `因为这条任务仍处于活跃状态，更适合观察实时推进与当前会话。${freshness}。`;
  }
  return `因为这条任务在当前筛选下更新时间靠前，可作为最近样本继续排查。${freshness}。`;
}

const STAGE_STEPS = [
  { key: 'init',    label: '模块加载', desc: '扫描目标路径，加载模块文件', triggers: ['task_start', 'module_load', 'task_resume'], artifactSubpath: 'workspace' },
  { key: 'analyse', label: '入口分析', desc: 'Worker 逐一分析各入口点',    triggers: ['round_start', 'worker_start'],               artifactSubpath: 'workspace' },
  { key: 'judge',   label: '裁判综合', desc: '综合多轮 Worker 分析结果',   triggers: ['judge_start', 'judge_eval'],                  artifactSubpath: 'workspace' },
  { key: 'finish',  label: '生成报告', desc: '输出最终分析结果',           triggers: ['round_end', 'task_end'],                      artifactSubpath: 'output' },
];

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function deriveStepStatuses(taskStatus: string, events: AppEaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');

  // 追踪【最后一个】事件对应的步骤（而非最大值），这样评审不通过回到下一轮时能正确退回 step 1
  let lastStep = -1;
  for (const evt of events) {
    const t = evt.type;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((trigger) => trigger === t)) {
        lastStep = i;
        break;
      }
    }
  }

  if (lastStep === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled') statuses[0] = 'failed';
    return statuses;
  }

  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (i < lastStep) {
      statuses[i] = 'completed';
    } else if (i === lastStep) {
      statuses[i] = taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled'
        ? 'failed'
        : 'running';
    }
  }
  return statuses;
}

function computeStageTimes(events: AppEaStageEvent[]): Array<{ startTs: number | null; endTs: number | null }> {
  const result = STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  let taskEndTs: number | null = null;
  for (const evt of events) {
    if (evt.type === 'task_end') taskEndTs = evt.ts;
  }
  for (const evt of events) {
    const t = evt.type;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((trigger) => trigger === t)) {
        if (result[i].startTs === null) result[i].startTs = evt.ts;
        break;
      }
    }
  }
  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (result[i].startTs === null) continue;
    let endTs = taskEndTs;
    for (let j = i + 1; j < STAGE_STEPS.length; j++) {
      if (result[j].startTs !== null) { endTs = result[j].startTs; break; }
    }
    result[i].endTs = endTs;
  }
  return result;
}

function computeFileProgress(events: AppEaStageEvent[]): { done: number; total: number } | null {
  let done = 0;
  let total = 0;
  for (const evt of events) {
    if (evt.type === 'worker_done' && evt.data?.done != null && evt.data?.total != null) {
      if (evt.data.done > done) done = evt.data.done;
      total = evt.data.total;
    }
  }
  return total > 0 ? { done, total } : null;
}

function formatEventLog(evt: AppEaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start':    return `[${ts}] 任务开始  task=${d.task ?? ''}  round_max=${d.round_max ?? ''}`;
    case 'task_resume':   return `[${ts}] 断点续跑  start_stage=${d.start_stage ?? ''}`;
    case 'module_load':   return `[${ts}] \u25b6 加载模块: ${d.module ?? ''}`;
    case 'module_found':  return `[${ts}] \u2502 模块文件: ${d.file_count ?? ''} 个`;
    case 'module_ready':  return `[${ts}] \u2713 模块就绪: ${d.entry_count ?? ''} 个入口点`;
    case 'round_start':   return `[${ts}] \u25b6 第 ${d.round ?? ''} 轮开始`;
    case 'worker_start':  return `[${ts}] \u2502 Worker ${d.worker_id ?? ''}: ${d.entry ?? ''}`;
    case 'worker_file':   return `[${ts}] \u2502   \u2192 ${d.file ?? ''}`;
    case 'workers_skipped': return `[${ts}] \u23ed Round ${d.round ?? ''} 跳过文件重分析，Master Worker 根据反馈修正`;
    case 'master_worker_start': return `[${ts}] \u25b6 Master Worker Round ${d.round ?? ''} 开始合并`;
    case 'master_worker_done': return `[${ts}] \u2713 Master Worker Round ${d.round ?? ''} 合并完成`;
    case 'worker_done': {
      if (d.done != null && d.total != null) {
        return `[${ts}] \u2713 (${d.done}/${d.total}) 已完成${d.done} 共${d.total}个文件`;
      }
      return `[${ts}] \u2713 Worker ${d.worker_id ?? ''} 完成`;
    }
    case 'judge_start':   return `[${ts}] \u25b6 Judge ${d.judge_id ?? ''} 开始综合`;
    case 'judge_eval': {
      const text = (d.summary ?? '').toString().replace(/\n+/g, ' ').trim().slice(0, 100);
      return text ? `[${ts}] \u2502 Judge 评估: ${text}` : '';
    }
    case 'judge_summary': {
      const text = (d.summary ?? '').toString().replace(/\n+/g, ' ').trim().slice(0, 100);
      return `[${ts}] \u2713 Judge 综合完成${text ? ': ' + text : ''}`;
    }
    case 'round_end':     return `[${ts}] \u2713 第 ${d.round ?? ''} 轮结束  passed=${d.passed ?? ''} failed=${d.failed ?? ''}`;
    case 'task_end':      return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    case 'error':         return `[${ts}] \u2717 错误: ${d.error ?? JSON.stringify(d)}`;
    default:              return `[${ts}] ${evt.type}: ${JSON.stringify(d)}`;
  }
}

const emptyForm = {
  task_name: '',
  input_path: '',    // SA输出目录
  module_name: '',   // 具体模块名
  source_path: '',   // 源码根目录
  output_path: '',
  task_description: '',
};

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'finished_at', label: '结束时间' },
  { value: 'status', label: '任务状态' },
  { value: 'task_name', label: '任务名称' },
];

const HEADER_SORT_FIELDS: Partial<Record<'task' | 'module' | 'status' | 'origin' | 'created_at' | 'duration', string>> = {
  task: 'task_name',
  status: 'status',
  created_at: 'created_at',
  duration: 'started_at',
};

type SortableHeaderProps = {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick?: () => void;
  className?: string;
};

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, active, direction, onClick, className }) => {
  if (!onClick) return <ExecutionTableTh className={className}>{label}</ExecutionTableTh>;
  return (
    <ExecutionTableTh className={className}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
        title={`按${label}排序`}
      >
        <span>{label}</span>
        <ArrowDownUp size={13} className={active ? 'text-sky-600' : 'text-slate-400'} />
        {active ? <span className="text-[10px] text-sky-600">{direction === 'asc' ? '升序' : '降序'}</span> : null}
      </button>
    </ExecutionTableTh>
  );
};

export const EntryAnalysisTaskPage: React.FC<{ projectId: string; onOpenTask?: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.appEntryAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();
  const stageFocusStorageKey = 'secflow:entryAnalysisStageFocus';
  const riskFocusStorageKey = 'secflow:entryAnalysisRiskFocus';
  const autoRefreshStorageKey = `secflow:entryAnalysis:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey = `secflow:entryAnalysis:refreshInterval:${projectId || 'default'}`;

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchRestarting, setBatchRestarting] = useState(false);
  const [tasks, setTasks] = useState<AppEaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<'' | 'manual' | 'binary' | 'source'>('');
  const [parentTaskIdFilter, setParentTaskIdFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [stageFocusHint, setStageFocusHint] = useState('');
  const [riskFocusHint, setRiskFocusHint] = useState('');
  const [slotCluster, setSlotCluster] = useState<EntryAnalyseSlotClusterSummary | null>(null);
  const [slotClusterError, setSlotClusterError] = useState('');
  const [slotDetailOpen, setSlotDetailOpen] = useState(false);
  const [expandedWorkerIds, setExpandedWorkerIds] = useState<string[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<AppEaTaskDetail | null>(null);
  const [detailLogs, setDetailLogs] = useState<AppEaStagesJson>({ events: [] });
  const detailLogsCountRef = useRef<number>(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'source' | 'output'>('input');
  const logScrollRef = useRef<HTMLDivElement>(null);
  const riskPresetAppliedRef = useRef('');

  const handleHeaderSort = (field: 'task' | 'module' | 'status' | 'origin' | 'created_at' | 'duration') => {
    const mapped = HEADER_SORT_FIELDS[field];
    if (!mapped) return;
    if (sortBy === mapped) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(mapped);
      setSortOrder(field === 'task' || field === 'status' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const toggleStatusQuickFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? '' : status));
    setPage(1);
  };

  const toggleModeQuickFilter = (mode: '' | 'manual' | 'binary' | 'source') => {
    setModeFilter((current) => (current === mode ? '' : mode));
    setPage(1);
  };

  const toggleParentTaskQuickFilter = (parentTaskId: string) => {
    if (!parentTaskId) return;
    setParentTaskIdFilter((current) => (current === parentTaskId ? '' : parentTaskId));
    setPage(1);
  };

  // Pre-fill input_path from FileExplorer right-click
  useEffect(() => {
    const stored = sessionStorage.getItem('secflow:entryAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('secflow:entryAnalysisInputPath');
      setCreateModalOpen(true);
      setSelectedTaskId('');
      const newForm = { ...emptyForm, input_path: stored, output_path: `/data/files/${projectId}/app/secflow-app-entry-analyse` };
      setForm(newForm);
      void loadModulesForPath(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:entryAnalysisTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('secflow:entryAnalysisTaskId');
    if (onOpenTask) onOpenTask(storedTaskId);
  }, [onOpenTask]);

  useEffect(() => {
    const stored = sessionStorage.getItem(stageFocusStorageKey) || '';
    const normalized = stored.trim().toUpperCase();
    setStageFocusHint(['R1', 'R2', 'R3', 'R4'].includes(normalized) ? normalized : '');
  }, [stageFocusStorageKey]);

  useEffect(() => {
    const stored = sessionStorage.getItem(riskFocusStorageKey) || '';
    setRiskFocusHint(stored.trim());
  }, [riskFocusStorageKey]);

  useEffect(() => {
    if (!riskFocusHint) {
      riskPresetAppliedRef.current = '';
      return;
    }
    if (riskPresetAppliedRef.current === riskFocusHint) return;
    const preset = getEntryAnalysisRiskPreset(riskFocusHint);
    if (!preset) return;
    riskPresetAppliedRef.current = riskFocusHint;
    setStatusFilter(preset.suggestedStatus);
    setSortBy('updated_at');
    setSortOrder('desc');
    setPage(1);
  }, [riskFocusHint]);

  // ── Load task list ──────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await appApi.listTasks({
        project_id: projectId,
        page: p,
        per_page: perPage,
        status: statusFilter,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, perPage, statusFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  const loadSlotCluster = useCallback(async () => {
    if (!projectId) return;
    try {
      const snapshot = await appApi.getSlotCluster(projectId);
      setSlotCluster(snapshot);
      setSlotClusterError('');
    } catch (err: any) {
      setSlotCluster(null);
      setSlotClusterError(err?.message || '槽位信息加载失败');
    }
  }, [appApi, projectId]);

  useEffect(() => { void loadTasks(page); }, [projectId, page, perPage, statusFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);
  useEffect(() => { void loadSlotCluster(); }, [loadSlotCluster]);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(autoRefreshStorageKey);
    const storedInterval = localStorage.getItem(refreshIntervalStorageKey);
    setAutoRefreshEnabled(storedEnabled === 'true');
    if (storedInterval) {
      const parsed = Number(storedInterval);
      setRefreshIntervalSec(Number.isFinite(parsed) ? Math.max(5, Math.floor(parsed)) : 10);
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
    setSelectedTaskIds((current) => {
      const validIds = new Set(tasks.map((task) => task.task_id));
      const next = new Set<string>();
      current.forEach((taskId) => {
        if (validIds.has(taskId)) next.add(taskId);
      });
      return next;
    });
  }, [tasks]);

  // ── Load task detail ────────────────────────────────────────────────────

  const loadDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const d = await appApi.getTask(taskId);
      setDetail(d);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadDetailLogs = async (taskId: string, incremental: boolean) => {
    try {
      const since = incremental ? detailLogsCountRef.current : 0;
      const resp = await appApi.getTaskLogs(taskId, since);
      // 兼容新旧两种响应格式
      const respEvents: AppEaStageEvent[] = Array.isArray((resp as any).events)
        ? (resp as any).events
        : Array.isArray((resp as any).stages_json?.events)
          ? (resp as any).stages_json.events
          : [];
      const respFinal: boolean = (resp as any).final ?? (resp as any).stages_json?.final ?? false;
      const respTotal: number = typeof (resp as any).total_event_count === 'number'
        ? (resp as any).total_event_count
        : respEvents.length;

      if (!incremental) {
        setDetailLogs({ events: respEvents, final: respFinal });
        detailLogsCountRef.current = respTotal;
      } else if (respEvents.length > 0) {
        setDetailLogs((prev) => ({ events: [...prev.events, ...respEvents], final: respFinal }));
        detailLogsCountRef.current = respTotal;
      } else {
        setDetailLogs((prev) => ({ ...prev, final: respFinal }));
      }
    } catch {
      // 静默失败
    }
  };

  const handleSelectTask = (taskId: string) => {
    if (onOpenTask) {
      onOpenTask(taskId);
      return;
    }
    saveExecutionReturnContext({ view: 'entry-analysis-task' });
    window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-detail', entryAnalysisTaskId: taskId } }));
  };

  // ── Auto-poll when tasks are running or pending ─────────────────────────
  const hasActiveTasks = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  const hasActiveDetail = Boolean(detail && (detail.status === 'running' || detail.status === 'pending'));
  useEffect(() => {
    if (!hasActiveTasks && !hasActiveDetail) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, hasActiveDetail]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!hasActiveTasks && !hasActiveDetail) return;
    const timer = setInterval(() => {
      void loadTasks(page);
      void loadSlotCluster();
      if (selectedTaskId && modalOpen) { void loadDetail(selectedTaskId); void loadDetailLogs(selectedTaskId, true); }
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, hasActiveDetail, projectId, page, selectedTaskId, modalOpen, loadSlotCluster]);

  // Auto-scroll logs to bottom when new events arrive
  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detailLogs.events.length, logsExpanded]);

  const loadModulesForPath = async (basePath: string) => {
    if (!basePath.trim()) { setAvailableModules([]); return; }
    setLoadingModules(true);
    try {
      const resp = await appApi.listModules(basePath.trim());
      setAvailableModules(resp.modules || []);
    } catch {
      setAvailableModules([]);
    } finally {
      setLoadingModules(false);
    }
  };

  const handleSaPathChange = (value: string) => {
    setForm((prev) => ({ ...prev, input_path: value, module_name: '' }));
    void loadModulesForPath(value);
  };

  // ── Create task ─────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.task_name.trim()) { notify('任务名称不能为空', 'error'); return; }
    if (!form.input_path.trim()) { notify('模块目录不能为空', 'error'); return; }
    if (!form.module_name.trim()) { notify('请选择要分析的模块', 'error'); return; }
    if (!form.output_path.trim()) { notify('输出路径不能为空', 'error'); return; }
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        module_name: form.module_name.trim(),
        source_path: form.source_path.trim() || undefined,
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
      setForm({ ...emptyForm });
      setAvailableModules([]);
      setCreateModalOpen(false);
      setPage(1);
      await loadTasks(1);
    } catch (err: any) {
      notify(`任务创建失败: ${err?.message || err}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await appApi.cancelTask(taskId);
      notify('任务已取消', 'success');
      if (selectedTaskId === taskId) void loadDetail(taskId);
      await loadTasks(page);
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleDelete = async (taskId: string, taskName: string) => {
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${taskName}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(taskId, true);
      notify('任务已删除', 'success');
      if (selectedTaskId === taskId) { setModalOpen(false); setSelectedTaskId(''); }
      setSelectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      await loadTasks(page);
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const toggleAllPageSelection = (checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) tasks.forEach((task) => next.add(task.task_id));
      else tasks.forEach((task) => next.delete(task.task_id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const taskIds = Array.from(selectedTaskIds);
    if (taskIds.length === 0) {
      notify('请先选择要删除的任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message: `确定要批量删除 ${taskIds.length} 个入口分析任务及其输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of taskIds) {
      try {
        await appApi.deleteTask(taskId, true);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchDeleting(false);
    setSelectedTaskIds(new Set());
    if (selectedTaskId && taskIds.includes(selectedTaskId)) {
      closeModal();
    }
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量删除成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量删除完成，成功 ${success} / ${taskIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量删除失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchCancel = async () => {
    const activeIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && (task.status === 'pending' || task.status === 'running'))
      .map((task) => task.task_id);
    if (activeIds.length === 0) {
      notify('已选择任务中没有可取消的等待中或运行中任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量取消任务',
      message: `确定要取消 ${activeIds.length} 个等待中/运行中的入口分析任务吗？任务记录和输出文件会保留。`,
      confirmText: '确认取消',
      cancelText: '返回',
      danger: false,
    });
    if (!confirmed) return;

    setBatchCancelling(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of activeIds) {
      try {
        await appApi.cancelTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchCancelling(false);
    await loadTasks(page);
    if (selectedTaskId && activeIds.includes(selectedTaskId)) {
      void loadDetail(selectedTaskId);
    }

    if (failed === 0) {
      notify(`批量取消成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量取消完成，成功 ${success} / ${activeIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量取消失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchRestart = async () => {
    const restartableIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && task.status !== 'pending' && task.status !== 'running')
      .map((task) => task.task_id);
    if (restartableIds.length === 0) {
      notify('已选择任务中没有可重试的终态任务', 'error');
      return;
    }
    const skipped = selectedTaskIds.size - restartableIds.length;
    const confirmed = await showConfirm({
      title: '批量重试任务',
      message: `确定要重试 ${restartableIds.length} 个入口分析任务吗？${skipped > 0 ? `将跳过 ${skipped} 个等待中/运行中的任务。` : ''}`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;

    setBatchRestarting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of restartableIds) {
      try {
        await appApi.restartTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchRestarting(false);
    await loadTasks(page);
    if (selectedTaskId && restartableIds.includes(selectedTaskId)) {
      void loadDetail(selectedTaskId);
    }

    if (failed === 0) {
      notify(`批量重试成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量重试完成，成功 ${success} / ${restartableIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量重试失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleRestart = async (taskId: string) => {
    setRestarting(true);
    try {
      await appApi.restartTask(taskId);
      notify('任务已重新启动', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) {
        setDetailLogs({ events: [] });
        detailLogsCountRef.current = 0;
        void loadDetail(taskId);
      }
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleResume = async (taskId: string) => {
    setResuming(true);
    try {
      await appApi.resumeTask(taskId);
      notify('已从断点继续', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) { void loadDetail(taskId); }
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedTaskId('');
    setDetail(null);
    setDetailLogs({ events: [] });
    detailLogsCountRef.current = 0;
  };

  const totalPages = Math.ceil(total / perPage);
  const allPageSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.task_id));
  const hasSelection = selectedTaskIds.size > 0;
  const riskPreset = useMemo(() => getEntryAnalysisRiskPreset(riskFocusHint), [riskFocusHint]);
  const recommendedTasks = useMemo(() => {
    if (!stageFocusHint && !riskPreset) return [];
    const statusWeight = (status: AppEaTaskItem['status']) => {
      if (riskPreset?.suggestedStatus === 'pending') {
        if (status === 'pending') return 6;
        if (status === 'running') return 5;
        if (status === 'failed' || status === 'error') return 3;
        if (status === 'cancelled') return 2;
        return 1;
      }
      if (riskPreset?.suggestedStatus === 'failed') {
        if (status === 'failed' || status === 'error') return 6;
        if (status === 'running') return 4;
        if (status === 'pending') return 3;
        if (status === 'cancelled') return 2;
        return 1;
      }
      if (status === 'running') return 5;
      if (status === 'pending') return 4;
      if (status === 'failed' || status === 'error') return 3;
      if (status === 'cancelled') return 2;
      return 1;
    };
    return [...tasks]
      .sort((left, right) => {
        const statusGap = statusWeight(right.status) - statusWeight(left.status);
        if (statusGap !== 0) return statusGap;
        const rightUpdated = new Date(right.updated_at || right.created_at).getTime() || 0;
        const leftUpdated = new Date(left.updated_at || left.created_at).getTime() || 0;
        return rightUpdated - leftUpdated;
      })
      .slice(0, 6)
      .map((task) => ({
        task,
        reason: getEntryAnalysisRecommendationReason(task, stageFocusHint, riskPreset),
      }));
  }, [riskPreset, stageFocusHint, tasks]);
  const recommendedTaskIds = useMemo(() => new Set(recommendedTasks.map((item) => item.task.task_id)), [recommendedTasks]);

  const stageStatuses = detail
    ? deriveStepStatuses(detail.status, detailLogs.events)
    : STAGE_STEPS.map((): StepStatus => 'pending');

  const stageTimes = detail
    ? computeStageTimes(detailLogs.events)
    : STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));

  const fileProgress = detail ? computeFileProgress(detailLogs.events) : null;

  const logLines = detailLogs.events.map(formatEventLog);
  const slotSummaryCards = slotCluster ? [
    { label: '总槽位', value: slotCluster.total_capacity, className: 'bg-slate-50 border-slate-200 text-slate-800' },
    { label: '占用槽位', value: slotCluster.busy_slots, className: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: '空闲槽位', value: slotCluster.available_slots, className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { label: '排队任务', value: slotCluster.queued_tasks, className: 'bg-amber-50 border-amber-200 text-amber-700' },
  ] : [];

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      {slotDetailOpen && slotCluster ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSlotDetailOpen(false)} />
          <div className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Slot Detail</div>
                <h2 className="mt-1 text-lg font-black text-slate-900">执行槽位明细</h2>
              </div>
              <button onClick={() => setSlotDetailOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              {slotCluster.workers.map((worker) => {
                const expanded = expandedWorkerIds.includes(worker.worker_id);
                return (
                  <div key={worker.worker_id} className={`rounded-2xl border px-4 py-4 ${worker.healthy ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/50'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{worker.pod_name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {worker.healthy ? 'Healthy' : worker.source === 'stale_owner' ? 'Stale Owner' : 'Stale'}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            活动任务 {worker.active_tasks.length}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {worker.pod_ip || '-'} · 心跳 {formatDateTime(worker.last_heartbeat_at)}
                        </div>
                        {worker.error ? <div className="mt-1 text-xs text-rose-600">{worker.error}</div> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                        <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">排队 {worker.queued_jobs}</span>
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">空闲 {worker.available_slots}</span>
                        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500">来源 {worker.source || 'capacity'}</span>
                        <button
                          type="button"
                          onClick={() => setExpandedWorkerIds((current) => current.includes(worker.worker_id) ? current.filter((item) => item !== worker.worker_id) : [...current, worker.worker_id])}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50"
                        >
                          {expanded ? '收起任务' : `展开任务（${worker.active_tasks.length}）`}
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      worker.active_tasks.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {worker.active_tasks.map((task) => (
                            <div key={`${worker.worker_id}:${task.task_id}`} className={`rounded-2xl border px-4 py-4 text-xs ${worker.healthy ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200 bg-amber-50/80'}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => handleSelectTask(task.task_id)} className="font-mono font-semibold text-violet-700 hover:text-violet-900">
                                      {task.task_id}
                                    </button>
                                    <span className={`rounded-full px-2 py-0.5 font-semibold ${worker.healthy ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>
                                      已关联任务
                                    </span>
                                  </div>
                                  <div className="mt-1 break-all text-[11px] text-slate-500">{formatSlotStage(task)}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                                  <div className="font-semibold text-slate-700">owner pod</div>
                                  <div className="mt-1 font-mono">{worker.pod_name}</div>
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">归属任务</div>
                                  <div className="mt-2 font-mono text-[11px] font-semibold text-slate-700">{task.task_id}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">入口 {task.entry_id || '-'}</div>
                                </div>
                                <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">运行状态</div>
                                  <div className="mt-2 text-[11px] font-semibold text-slate-700">{SLOT_TASK_STATUS_LABEL[task.status] || task.status}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">租约到期 {formatDateTime(task.lease_expires_at)}</div>
                                </div>
                                <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">槽位映射</div>
                                  <div className="mt-2 text-[11px] font-semibold text-slate-700">{worker.source || 'worker_registry'}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">{worker.url || worker.pod_ip || worker.pod_name}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">当前槽位无运行任务</div>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {stageFocusHint ? (
        <section className="rounded-[2rem] border border-indigo-200 bg-indigo-50/80 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">Stage Focus</div>
          <div className="mt-2 text-sm font-bold text-indigo-900">当前从性能看板带入了 {stageFocusHint} 阶段线索</div>
          <div className="mt-1 text-xs leading-6 text-indigo-800">
            打开任务详情后，系统会优先尝试切到该阶段的智能体会话视角，帮助你直接查看对应阶段的 session 和日志。
          </div>
        </section>
      ) : null}
      {riskPreset ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Risk Focus</div>
              <div className="mt-2 text-sm font-bold text-amber-900">当前正按“{riskPreset.label}”风险意图排查任务</div>
              <div className="mt-1 text-xs leading-6 text-amber-800">
                {riskPreset.description} {riskPreset.statusReason}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(riskPreset.suggestedStatus);
                  setPage(1);
                }}
                className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100"
              >
                应用推荐状态筛选
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(riskFocusStorageKey);
                  setRiskFocusHint('');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                清除风险线索
              </button>
            </div>
          </div>
        </section>
      ) : null}
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'output') {
            setForm((p) => ({ ...p, output_path: containerPath }));
          } else if (pickerTarget === 'source') {
            setForm((p) => ({ ...p, source_path: containerPath }));
          } else {
            handleSaPathChange(containerPath);
          }
        }}
      />

      {/* Task Detail Modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              {detail ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-lg font-black text-slate-900 truncate">{detail.task_name}</h2>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
              ) : (
                <h2 className="text-lg font-black text-slate-900">任务详情</h2>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {detail && (detail.status === 'running' || detail.status === 'pending') ? (
                  <button onClick={() => void handleCancel(detail.task_id)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">取消</button>
                ) : null}
                {detail && !['pending', 'running'].includes(detail.status) ? (
                  <>
                    <button
                      onClick={() => void handleRestart(detail.task_id)}
                      disabled={restarting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                    >
                      {restarting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      重新运行
                    </button>
                    {detail.started_at ? (
                      <button
                        onClick={() => void handleResume(detail.task_id)}
                        disabled={resuming}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {resuming ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                        断点续跑
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button onClick={() => detail && void loadDetail(detail.task_id)} title="刷新"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700"><RefreshCw size={14} /></button>
                <button onClick={closeModal} title="关闭"
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>

            {/* Modal body */}
            {detailLoading && !detail ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />加载中...
              </div>
            ) : detail ? (
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                  <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                  {detail.module_name ? <InfoRow label="分析模块" value={<span className="font-mono font-semibold text-violet-700">{detail.module_name}</span>} /> : <div />}
                  {detail.started_at ? <InfoRow label="开始时间" value={new Date(detail.started_at).toLocaleString('zh-CN')} /> : <div />}
                  <InfoRow label="模块目录" value={<span className="font-mono break-all">{detail.input_path}</span>} />
                  {detail.finished_at ? <InfoRow label="完成时间" value={new Date(detail.finished_at).toLocaleString('zh-CN')} /> : <div />}
                  {detail.source_path ? <InfoRow label="源码目录" value={<span className="font-mono break-all">{detail.source_path}</span>} /> : null}
                  {detail.output_path ? <InfoRow label="输出路径" value={<span className="font-mono break-all">{detail.output_path}</span>} /> : <div />}
                  {detail.task_description ? <InfoRow label="描述" value={detail.task_description} /> : null}
                  {detail.started_at ? <InfoRow label="耗时" value={formatDuration(detail.started_at, detail.finished_at ?? undefined, clockNow)} /> : null}
                </div>

                {/* Stage Progress */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">分析阶段进度</h3>
                  <div className="relative flex items-start gap-0">
                    {STAGE_STEPS.map((step, i) => {
                      const st = stageStatuses[i];
                      const timing = stageTimes[i];
                      const timingStr = (st === 'completed' || st === 'failed') ? formatTsDuration(timing.startTs, timing.endTs) : '';
                      const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : null;
                      const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                      return (
                        <div key={step.key} className="flex-1 flex flex-col items-center relative">
                          {i < STAGE_STEPS.length - 1 ? (
                            <div className={`absolute top-4 left-1/2 w-full h-0.5 ${st === 'completed' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          ) : null}
                          <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold
                            ${st === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                              : st === 'running'   ? 'border-blue-500 bg-blue-50 text-blue-600'
                              : st === 'failed'    ? 'border-red-400 bg-red-50 text-red-600'
                              : 'border-slate-200 bg-white text-slate-400'}`}>
                            {st === 'completed' ? <CheckCircle2 size={16} className="text-emerald-500" />
                              : st === 'running'  ? <Loader2 size={14} className="animate-spin text-blue-500" />
                              : st === 'failed'   ? <XCircle size={16} className="text-red-500" />
                              : <span>{i + 1}</span>}
                          </div>
                          <div className={`mt-2 text-center px-1 ${st === 'running' ? 'text-blue-600' : st === 'completed' ? 'text-emerald-600' : st === 'failed' ? 'text-red-500' : 'text-slate-400'}`}>
                            <div className="text-xs font-semibold">{step.label}</div>
                            <div className="text-[10px] text-slate-400 leading-tight mt-0.5 hidden sm:block">{step.desc}</div>
                            {timingStr ? <div className="text-[10px] font-mono text-slate-500 mt-0.5">⏱ {timingStr}</div> : null}
                            {artifactFsPath && (st === 'completed' || st === 'running') ? (
                              <button
                                onClick={() => openInFileExplorer(artifactFsPath)}
                                className="mt-1 inline-flex items-center gap-0.5 rounded border border-violet-200 px-1 py-0.5 text-[10px] text-violet-600 hover:bg-violet-50"
                              >
                                <FolderOpen size={9} />输出
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* File Progress Bar — 并行模式下显示文件处理进度 */}
                {fileProgress ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                      <span className="font-semibold">文件处理进度</span>
                      <span className="font-mono text-slate-700 font-semibold">{fileProgress.done}/{fileProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-violet-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(fileProgress.done / fileProgress.total * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      已完成 <span className="font-semibold text-slate-600">{fileProgress.done}</span> 共 <span className="font-semibold text-slate-600">{fileProgress.total}</span> 个文件
                      {fileProgress.done < fileProgress.total && detail.status === 'running'
                        ? <span className="ml-2 text-violet-500">({Math.round(fileProgress.done / fileProgress.total * 100)}%)</span>
                        : null}
                    </div>
                  </div>
                ) : null}

                {/* Error */}
                {detail.error ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1">错误信息</h3>
                    <pre className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap break-all max-h-32 overflow-auto">{detail.error}</pre>
                  </div>
                ) : null}

                {/* Analysis Logs */}
                <div>
                  <button
                    type="button"
                    onClick={() => setLogsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 mb-1"
                  >
                    <span>分析日志 <span className="normal-case font-normal text-slate-400">({logLines.length} 条事件)</span></span>
                    {logsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {logsExpanded ? (
                    logLines.length === 0 ? (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-xs text-slate-400">
                        {detail.status === 'pending' ? '任务尚未开始，暂无日志' : '暂无阶段事件（日志在任务运行期间每3个事件刷新一次）'}
                      </div>
                    ) : (
                      <div
                        ref={logScrollRef}
                        className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-300 font-mono max-h-60 overflow-auto space-y-0.5 leading-relaxed"
                      >
                        {logLines.map((line, idx) => (
                          <div key={idx} className={
                            !line ? 'h-1' :
                            line.includes('\u2717') ? 'text-red-400' :
                            line.includes('\u25b6') ? 'text-violet-300' :
                            line.includes('\u2713') ? 'text-emerald-400' :
                            line.includes('\u2502') ? 'text-slate-400 text-[11px]' :
                            'text-slate-300'
                          }>{line}</div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>

                {/* Prompt */}
                {detail.prompt_content ? (
                  <details className="rounded-lg border border-slate-200">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">分析 Prompt</summary>
                    <pre className="px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap break-all max-h-48 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre>
                  </details>
                ) : null}

                {/* Result */}
                {detail.result_json ? (
                  <details className="rounded-lg border border-slate-200" open={false}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">分析结果 (JSON)</summary>
                    <pre className="px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-auto border-t border-slate-100">{JSON.stringify(detail.result_json, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">入口分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">指定目标模块路径，自动生成 Prompt 并启动入口点分析任务。</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '总任务', value: total, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
            { label: '运行中', value: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
            { label: '已通过', value: tasks.filter((t) => t.status === 'passed').length, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
            { label: '失败/取消', value: tasks.filter((t) => t.status === 'failed' || t.status === 'error' || t.status === 'cancelled').length, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
          ].map((s) => (
            <div key={s.label} className={`min-w-[96px] rounded-xl border ${s.border} ${s.bg} px-3 py-2`}>
              <p className={`text-lg font-black ${s.text}`}>{s.value}</p>
              <p className="mt-1 text-[11px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Execution Slots</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">执行槽位总览</h2>
            <p className="mt-2 text-sm text-slate-500">展示入口分析 Worker Pod 的真实槽位占用、空闲容量与失联 Owner。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void loadSlotCluster()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} />
            </button>
            {slotCluster ? (
              <button
                type="button"
                onClick={() => setSlotDetailOpen(true)}
                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                查看 Worker 明细
              </button>
            ) : null}
          </div>
        </div>
        {slotCluster ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {slotSummaryCards.map((item) => (
                <div key={item.label} className={`min-w-[96px] rounded-xl border px-3 py-3 ${item.className}`}>
                  <p className="text-lg font-black">{item.value}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">Worker {slotCluster.worker_count}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Healthy {slotCluster.healthy_workers}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${slotCluster.stale_workers > 0 ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}>Stale {slotCluster.stale_workers}</span>
              <span className="text-xs text-slate-400">更新时间：{formatDateTime(slotCluster.updated_at)}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {slotCluster.workers.slice(0, 6).map((worker) => (
                <div key={worker.worker_id} className={`rounded-2xl border px-4 py-4 ${worker.healthy ? 'border-slate-200 bg-slate-50/70' : 'border-rose-200 bg-rose-50/70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{worker.pod_name}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">{worker.url || worker.pod_ip || '-'}</div>
                    </div>
                    {!worker.healthy ? <AlertTriangle size={16} className="shrink-0 text-rose-500" /> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                    <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">排队 {worker.queued_jobs}</span>
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">空闲 {worker.available_slots}</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">心跳：{formatDateTime(worker.last_heartbeat_at)}</div>
                  <div className="mt-1 text-[11px] text-slate-400">来源：{worker.source || 'worker_registry'} · 活动任务 {worker.active_tasks.length}</div>
                  {worker.error ? <div className="mt-1 text-[11px] text-rose-600">{worker.error}</div> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {slotClusterError || '暂无可用槽位信息'}
          </div>
        )}
      </section>

      {stageFocusHint || riskPreset ? (
        <section className="rounded-[2rem] border border-indigo-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_38%),linear-gradient(180deg,#ffffff_0%,#eef2ff_100%)] p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">Stage Guided Tasks</div>
              <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">{stageFocusHint || '风险引导'} 推荐任务</h2>
              <div className="mt-1 max-w-3xl text-xs leading-6 text-slate-600">
                当前列表接口没有直接返回“任务正处于哪个阶段”的结构化字段，所以这里使用启发式排序：
                优先推荐{riskPreset?.suggestedStatus === 'pending' ? '等待中' : riskPreset?.suggestedStatus === 'failed' ? '失败' : '运行中'}、最近更新的任务，
                帮助你更快进入最可能仍保留 {stageFocusHint || '当前'} 线索的任务详情。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(stageFocusStorageKey);
                  setStageFocusHint('');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                清除阶段线索
              </button>
              {riskPreset ? (
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem(riskFocusStorageKey);
                    setRiskFocusHint('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                >
                  清除风险线索
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendedTasks.length ? (
              recommendedTasks.map(({ task, reason }) => (
                <button
                  key={task.task_id}
                  type="button"
                  onClick={() => handleSelectTask(task.task_id)}
                  className="rounded-2xl border border-indigo-100 bg-white/85 px-4 py-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{task.task_name}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{task.task_id}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[task.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[task.status] ?? task.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-slate-500">
                    <div>模块：<span className="font-semibold text-slate-700">{task.module_name || '-'}</span></div>
                    <div>更新时间：<span className="font-semibold text-slate-700">{new Date(task.updated_at || task.created_at).toLocaleString('zh-CN')}</span></div>
                    <div>输入路径：<span className="font-mono text-slate-600">{task.input_path}</span></div>
                  </div>
                  <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] leading-5 text-indigo-900">
                    <span className="font-black">推荐依据：</span>{reason}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                当前页还没有可推荐的任务，请先刷新任务列表或切换筛选条件。
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Task list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
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
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="任务状态筛选"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={modeFilter}
              onChange={(e) => { setModeFilter((e.target.value as '' | 'manual' | 'binary' | 'source') || ''); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="模式筛选"
            >
              <option value="">全部模式</option>
              <option value="manual">手动</option>
              <option value="binary">二进制模式</option>
              <option value="source">源码模式</option>
            </select>
            <input
              value={parentTaskIdFilter}
              onChange={(e) => { setParentTaskIdFilter(e.target.value); setPage(1); }}
              placeholder="筛选主任务ID"
              className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-400"
              title="按主任务 ID 筛选"
            />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序字段"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>按{option.label}排序</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序方向"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="每页显示条数"
            >
              {[50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}条/页</option>)}
            </select>
            <button onClick={() => { void loadTasks(page); void loadSlotCluster(); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => { setCreateModalOpen(true); setAvailableModules([]); setForm({ ...emptyForm, output_path: `/data/files/${projectId}/app/secflow-app-entry-analyse` }); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}
          </span>
          {autoRefreshEnabled && !hasActiveTasks && !hasActiveDetail ? (
            <span className="text-amber-600">当前无运行中任务，自动刷新暂不触发</span>
          ) : null}
          {autoRefreshEnabled && (hasActiveTasks || hasActiveDetail) ? (
            <span className="text-violet-600">检测到活跃任务，按设定间隔自动刷新</span>
          ) : null}
        </div>

        {hasSelection ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                />
                全选当前页（{tasks.length} 条）
              </label>
              <span className="text-sm font-semibold text-violet-700">已选择 {selectedTaskIds.size} 个任务</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleBatchCancel()}
                disabled={batchCancelling || batchDeleting || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {batchCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                批量取消
              </button>
              <button
                onClick={() => void handleBatchRestart()}
                disabled={batchRestarting || batchCancelling || batchDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                {batchRestarting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                批量重试
              </button>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                清除选择
              </button>
              <button
                onClick={() => void handleBatchDelete()}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                批量删除（{selectedTaskIds.size}）
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6"><Loader2 size={14} className="animate-spin" />加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无任务，点击右上角「新建任务」创建</div>
        ) : (
          <ExecutionTable minWidth={1560}>
            <ExecutionTableHead>
              <tr>
                <ExecutionTableTh className="w-12">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => toggleAllPageSelection(e.target.checked)}
                    aria-label="全选当前页任务"
                  />
                </ExecutionTableTh>
                <SortableHeader
                  label="任务"
                  active={sortBy === 'task_name'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('task')}
                />
                <ExecutionTableTh>模块</ExecutionTableTh>
                <ExecutionTableTh>模式</ExecutionTableTh>
                <SortableHeader
                  label="状态"
                  active={sortBy === 'status'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('status')}
                />
                <ExecutionTableTh>来源</ExecutionTableTh>
                <ExecutionTableTh>执行槽位</ExecutionTableTh>
                <ExecutionTableTh>租约到期</ExecutionTableTh>
                <ExecutionTableTh>取消状态</ExecutionTableTh>
                <SortableHeader
                  label="创建时间"
                  active={sortBy === 'created_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('created_at')}
                />
                <SortableHeader
                  label="耗时"
                  active={sortBy === 'started_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('duration')}
                />
                <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
              </tr>
            </ExecutionTableHead>
            <tbody>
              {tasks.map((t) => {
                const recommended = recommendedTaskIds.has(t.task_id);
                const riskMatch = riskFocusHint ? getEntryAnalysisRiskMatch(t, riskFocusHint) : null;
                const matchedRisk = Boolean(riskMatch?.matched);
                const recommendationReason = recommended ? getEntryAnalysisRecommendationReason(t, stageFocusHint, riskPreset) : '';
                const contextualRowClassName = selectedTaskIds.has(t.task_id)
                  ? 'bg-violet-50/60'
                  : recommended
                    ? 'bg-indigo-50/40'
                    : matchedRisk
                      ? 'bg-amber-50/40'
                      : '';
                return (
                <tr
                  key={t.task_id}
                  className={`${executionTableRowClassName} ${contextualRowClassName}`.trim()}
                >
                  <ExecutionTableTd>
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(t.task_id)}
                      onChange={(e) => toggleTaskSelection(t.task_id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择任务 ${t.task_name}`}
                    />
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => handleSelectTask(t.task_id)}
                      className="text-left text-sm font-bold text-slate-900 hover:text-violet-700"
                      title={`查看任务 ${t.task_name}`}
                    >
                      {t.task_name}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recommended ? (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                          推荐任务
                        </span>
                      ) : null}
                      {matchedRisk && riskMatch ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                          {riskMatch.label}
                        </span>
                      ) : null}
                      {stageFocusHint ? (
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-700">
                          {stageFocusHint} 阶段线索
                        </span>
                      ) : null}
                    </div>
                    {recommended || matchedRisk ? (
                      <div className="mt-2 text-[11px] leading-5 text-slate-500">
                        {recommended ? recommendationReason : riskMatch?.label}
                      </div>
                    ) : null}
                    {t.abnormal_reason_title && ['failed', 'error', 'cancelled'].includes(t.status) ? (
                      <div className="mt-2 text-[11px] leading-5 text-red-600">
                        <span className="font-bold">{t.abnormal_reason_title}</span>
                        {t.abnormal_reason_code ? <span className="ml-2 font-mono uppercase tracking-[0.12em] text-red-500">{t.abnormal_reason_code}</span> : null}
                      </div>
                    ) : null}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[150px]">
                    <div className="text-sm font-semibold text-slate-700">{t.module_name || '-'}</div>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleModeQuickFilter(getTaskMode(t))}
                      className={getQuickFilterButtonClassName(
                        modeFilter === getTaskMode(t),
                        `shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getTaskModeBadgeClassName(t)}`
                      )}
                      title={modeFilter === getTaskMode(t) ? '再次点击取消模式筛选' : '点击按模式快速筛选'}
                    >
                      {getTaskModeLabel(t)}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <button
                      type="button"
                      onClick={() => toggleStatusQuickFilter(t.status)}
                      className={getQuickFilterButtonClassName(
                        statusFilter === t.status,
                        `shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`
                      )}
                      title={statusFilter === t.status ? '再次点击取消状态筛选' : '点击按状态快速筛选'}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[150px]">
                    {t.parent_task_id ? (
                      <button
                        type="button"
                        onClick={() => toggleParentTaskQuickFilter(t.parent_task_id || '')}
                        className={getQuickFilterButtonClassName(
                          parentTaskIdFilter === t.parent_task_id,
                          'inline-flex max-w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700'
                        )}
                        title={parentTaskIdFilter === t.parent_task_id ? '再次点击取消主任务筛选' : '点击按主任务 ID 快速筛选'}
                      >
                        <span className="truncate" title={t.parent_task_id}>{t.parent_task_id}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[160px]">
                    {t.owner_pod ? (
                      <div className="space-y-1">
                        <div className="font-mono text-xs font-semibold text-slate-700">{t.owner_pod}</div>
                        {slotCluster?.workers.some((worker) => worker.pod_name === t.owner_pod && !worker.healthy) ? (
                          <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            stale owner
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">未分配</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(t.lease_expires_at)}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap">
                    {t.cancel_requested ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">取消中</span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {formatDuration(t.started_at, t.finished_at, clockNow)}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(t.task_id, t.task_name); }}
                      title="删除任务及输出文件"
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </ExecutionTableTd>
                </tr>
              );})}
            </tbody>
          </ExecutionTable>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">上一页</button>
            <span className="text-slate-500">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">下一页</button>
          </div>
        ) : null}
      </section>

      {/* Create Task Modal */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="p-6 space-y-4">
              {detail ? <TaskOriginCard origin={detail} /> : null}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">新建任务</h2>
                <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>

              {/* 任务名称 */}
              <label className="block text-sm text-slate-600">
                任务名称 <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_name}
                  onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))}
                  placeholder="例：分析IPSec模块入口-2025"
                />
              </label>

              {/* 模块目录 */}
              <label className="block text-sm text-slate-600">
                模块目录 <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-slate-400">(含 files.list 或子模块目录)</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.input_path}
                    onChange={(e) => handleSaPathChange(e.target.value)}
                    placeholder="/data/files/<project>/entry_analyse"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              {/* 选择模块 */}
              <label className="block text-sm text-slate-600">
                <span className="flex items-center gap-2">
                  选择模块 <span className="text-red-500">*</span>
                  {loadingModules ? <Loader2 size={12} className="animate-spin text-violet-500" /> : null}
                  {!loadingModules && availableModules.length > 0 ? <span className="text-xs text-slate-400">找到 {availableModules.length} 个模块</span> : null}
                  {!loadingModules && form.input_path.trim() && availableModules.length === 0 ? <span className="text-xs text-red-400">未找到模块</span> : null}
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono bg-white disabled:opacity-50"
                  value={form.module_name}
                  onChange={(e) => setForm((p) => ({ ...p, module_name: e.target.value }))}
                  disabled={loadingModules || availableModules.length === 0}
                >
                  <option value="">-- 请先填写模块目录 --</option>
                  {availableModules.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>

              {/* 源码根目录 */}
              <label className="block text-sm text-slate-600">
                源码根目录 <span className="text-slate-400 text-xs">(可选，files.list中路径的解析基准；默认使用模块目录)</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.source_path}
                    onChange={(e) => setForm((p) => ({ ...p, source_path: e.target.value }))}
                    placeholder="/data/files/<project>/source"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('source'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              {/* 输出路径 */}
              <label className="block text-sm text-slate-600">
                输出路径 <span className="text-red-500">*</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.output_path}
                    onChange={(e) => setForm((p) => ({ ...p, output_path: e.target.value }))}
                    placeholder="/data/files/<project>/output"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              {/* 任务描述 */}
              <label className="block text-sm text-slate-600">
                任务描述 <span className="text-slate-400 text-xs">(可选)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_description}
                  onChange={(e) => setForm((p) => ({ ...p, task_description: e.target.value }))}
                  placeholder="简要说明分析目标或背景"
                />
              </label>

              <button
                onClick={() => void handleCreate()}
                disabled={creating || !form.task_name.trim() || !form.input_path.trim() || !form.module_name.trim() || !form.output_path.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                创建分析任务
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700 min-w-0">{value}</span>
    </div>
  );
}
