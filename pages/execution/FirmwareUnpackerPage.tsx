import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Clock,
  FolderOpen, Loader2, Package, Play, RefreshCw,
  Square, Trash2, XCircle, ListTodo, RotateCcw, Search, X, Plus, PauseCircle, Sparkles,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareTaskEvent, FirmwareTaskProgress, FirmwareTaskResourceUsage, FirmwareUnpackTask, TaskListQuery } from '../../clients/firmwareUnpacker';
import { SecurityProject } from '../../types/types';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnContext, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard, TaskOriginInline } from './taskOrigin';

interface Props {
  projectId: string;
  projects?: SecurityProject[];
}

const fwApi = api.domains.execution.firmwareUnpacker;

const TERMINAL = new Set(['success', 'failed', 'cancelled', 'max_retries_reached']);
const isTerminal = (s: string) => TERMINAL.has(s);

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'running', label: '运行中' },
  { value: 'cancelling', label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
];

const FILESERVER_CONTAINER_ROOT = '/data/files';
const TASK_WORKSPACE_SEGMENT = 'app/secflow-app-firmware-unpacker';

function buildWorkspacePreview(projectId: string, taskId = '<task-id>') {
  const base = `${FILESERVER_CONTAINER_ROOT}/${projectId}/${TASK_WORKSPACE_SEGMENT}/${taskId}`;
  return {
    input: `${base}/input`,
    output: `${base}/output`,
    run: `${base}/run`,
  };
}

function deriveRunPath(outputPath: string) {
  const normalized = String(outputPath || '').replace(/\/+$/, '');
  if (!normalized) return '';
  if (normalized.endsWith('/output')) {
    return `${normalized.slice(0, -'/output'.length)}/run`;
  }
  return '';
}

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtDuration(s: string | null, e: string | null) {
  if (!s) return '-';
  const ms = (e ? new Date(e).getTime() : Date.now()) - new Date(s).getTime();
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function fmtPercent(used: number | null, limit: number | null, unitSuffix = '') {
  if (used == null || limit == null || limit <= 0) return '-';
  const percent = Math.max(0, (used / limit) * 100);
  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%${unitSuffix}`;
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    pending: { icon: <Clock size={12} />, cls: 'bg-amber-50 text-amber-700 border-amber-200', label: '排队中' },
    running: { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-blue-50 text-blue-700 border-blue-200', label: '运行中' },
    cancelling: { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-orange-50 text-orange-700 border-orange-200', label: '取消中' },
    cancelled: { icon: <XCircle size={12} />, cls: 'bg-slate-50 text-slate-500 border-slate-200', label: '已取消' },
    success: { icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '成功' },
    failed: { icon: <XCircle size={12} />, cls: 'bg-red-50 text-red-700 border-red-200', label: '失败' },
    max_retries_reached: { icon: <XCircle size={12} />, cls: 'bg-red-50 text-red-700 border-red-200', label: '超限' },
  };
  const { icon, cls, label } = cfg[status] ?? { icon: null, cls: 'bg-slate-50 text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

function PhaseStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-500',
    running: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-amber-100 text-amber-700',
  };
  const labels: Record<string, string> = {
    pending: '待执行',
    running: '进行中',
    success: '已完成',
    failed: '失败',
    skipped: '跳过',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg[status] || cfg.pending}`}>
      {labels[status] || status}
    </span>
  );
}

function PhaseNodeStatusIcon({ status, index }: { status: string; index: number }) {
  if (status === 'success') {
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  }
  if (status === 'running') {
    return <Loader2 size={14} className="animate-spin text-blue-500" />;
  }
  if (status === 'failed') {
    return <XCircle size={16} className="text-red-500" />;
  }
  return <span>{index + 1}</span>;
}

function inferTaskEventTone(event: FirmwareTaskEvent) {
  const raw = `${event.event_type || ''} ${event.status || ''} ${event.summary || ''}`.toLowerCase();
  if (raw.includes('failed') || raw.includes('error') || raw.includes('expired') || raw.includes('lost')) {
    return {
      icon: XCircle,
      dot: 'bg-red-400',
      badge: 'border-red-200 bg-red-50 text-red-700',
      text: 'text-red-700',
    };
  }
  if (raw.includes('cancel')) {
    return {
      icon: PauseCircle,
      dot: 'bg-orange-400',
      badge: 'border-orange-200 bg-orange-50 text-orange-700',
      text: 'text-orange-700',
    };
  }
  if (raw.includes('success') || raw.includes('complete') || raw.includes('succeeded')) {
    return {
      icon: CheckCircle2,
      dot: 'bg-emerald-400',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      text: 'text-emerald-700',
    };
  }
  if (raw.includes('start') || raw.includes('running') || raw.includes('claimed') || raw.includes('renewed') || raw.includes('stage_changed')) {
    return {
      icon: Loader2,
      dot: 'bg-blue-400',
      badge: 'border-blue-200 bg-blue-50 text-blue-700',
      text: 'text-blue-700',
    };
  }
  return {
    icon: Sparkles,
    dot: 'bg-slate-300',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    text: 'text-slate-600',
  };
}

function formatEventDetail(detail: Record<string, any> | null) {
  if (!detail) return '';
  return JSON.stringify(detail, null, 2);
}

function TaskRow({
  task, selected, active, onSelect, onOpenDetail,
}: {
  task: FirmwareUnpackTask;
  selected: boolean;
  active: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpenDetail: (id: string) => void;
}) {
  const running = !isTerminal(task.status);

  return (
    <div
      className={`cursor-pointer rounded-xl border transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50/50 shadow-sm'
          : selected
            ? 'border-slate-300 bg-slate-50/70'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
      }`}
      onClick={() => onOpenDetail(task.id)}
    >
      <div
        className="flex items-center gap-2 px-3 py-3"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(task.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-slate-300 text-blue-600"
        />
        <TaskStatusBadge status={task.status} />
        <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-600">{task.firmware_path}</span>
        <div onClick={(e) => e.stopPropagation()} className="hidden 2xl:block max-w-[240px] overflow-hidden">
          <TaskOriginInline origin={task} compact />
        </div>
        {task.worker_id && (
          <span className="hidden xl:inline max-w-[120px] truncate text-[10px] text-slate-400">{task.worker_id}</span>
        )}
        {running && <Loader2 size={11} className="shrink-0 animate-spin text-blue-400" />}
        <span className="hidden lg:inline shrink-0 text-[10px] text-slate-500">{fmtDuration(task.started_at, task.completed_at)}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{fmtTime(task.created_at)}</span>
        <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${active ? 'translate-x-0.5 text-blue-500' : ''}`} />
      </div>
    </div>
  );
}

function TaskDetailPanel({
  task,
  loading,
  resourceUsage,
  resourceLoading,
  hasReturnContext,
  progress,
  progressLoading,
  events,
  eventsLoading,
  eventsError,
  onBack,
  onRefresh,
  onCancel,
  onDelete,
  onRetry,
}: {
  task: FirmwareUnpackTask | null;
  loading: boolean;
  resourceUsage: FirmwareTaskResourceUsage | null;
  resourceLoading: boolean;
  hasReturnContext: boolean;
  progress: FirmwareTaskProgress | null;
  progressLoading: boolean;
  events: FirmwareTaskEvent[];
  eventsLoading: boolean;
  eventsError: string;
  onBack: () => void;
  onRefresh: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (!task) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-slate-100 p-4 text-slate-400">
            <ChevronRight size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">选择任务查看详情</p>
            <p className="mt-1 text-xs text-slate-400">这里会展示解包任务的输入、输出目录、运行状态和日志摘要。</p>
          </div>
        </div>
      </div>
    );
  }

  const running = !isTerminal(task.status);
  const canDelete = isTerminal(task.status);
  const canRetry = task.status === 'failed' || task.status === 'cancelled' || task.status === 'max_retries_reached';
  const orderedEvents = [...events].reverse();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回任务列表'}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="mt-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              {task.worker_id && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                  {task.worker_id}
                </span>
              )}
            </div>
            <h3 className="mt-3 break-all text-lg font-black text-slate-900">{task.firmware_path}</h3>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-500">{task.id}</p>
          </div>
          <button
            onClick={() => onRefresh(task.id)}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="刷新详情"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {running && (
            <button
              onClick={() => onCancel(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
            >
              <Square size={13} /> 停止
            </button>
          )}
          {canRetry && (
            <button
              onClick={() => onRetry(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <RotateCcw size={13} /> 重试
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
            >
              <Trash2 size={13} /> 删除
            </button>
          )}
        </div>
        <div className="mt-4">
          <TaskOriginCard origin={task} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['任务 ID', <span className="font-mono">{task.id}</span>],
            ['Worker', task.worker_id || '-'],
            ['固件路径', <span className="font-mono break-all">{task.firmware_path}</span>],
            ['输出目录', <span className="font-mono break-all">{task.output_path}</span>],
            ['运行目录', <span className="font-mono break-all">{deriveRunPath(task.output_path) || '-'}</span>],
            ['创建时间', fmtTime(task.created_at)],
            ['开始时间', fmtTime(task.started_at)],
            ['完成时间', fmtTime(task.completed_at)],
            ['耗时', fmtDuration(task.started_at, task.completed_at)],
            ['AI 轮次', task.rounds ?? '-'],
          ].map(([label, value], index) => (
            <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
              <div className="text-xs text-slate-700">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">实时进展</p>
          {progressLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> 加载阶段进展中...
            </div>
          ) : !progress ? (
            <div className="text-xs text-slate-500">暂无阶段进展数据</div>
          ) : (
            <div className="space-y-3">
              {progress.summary && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  {progress.summary}
                </div>
              )}
              <div className="overflow-x-auto pb-1">
                <div className="relative flex min-w-[720px] items-start gap-0">
                  {progress.phases.map((phase, index) => {
                    const isCompleted = phase.status === 'success';
                    const isRunning = phase.status === 'running';
                    const isFailed = phase.status === 'failed';
                    const lineClass = isCompleted ? 'bg-emerald-400' : isFailed ? 'bg-red-300' : 'bg-slate-200';
                    const nodeClass = isCompleted
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                      : isRunning
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : isFailed
                          ? 'border-red-400 bg-red-50 text-red-600'
                          : phase.status === 'skipped'
                            ? 'border-amber-400 bg-amber-50 text-amber-600'
                            : 'border-slate-200 bg-white text-slate-400';
                    const textClass = isRunning
                      ? 'text-blue-600'
                      : isCompleted
                        ? 'text-emerald-600'
                        : isFailed
                          ? 'text-red-500'
                          : phase.status === 'skipped'
                            ? 'text-amber-600'
                            : 'text-slate-400';

                    return (
                      <div key={phase.key} className="relative flex-1">
                        {index < progress.phases.length - 1 ? (
                          <div className={`absolute left-1/2 top-4 h-0.5 w-full ${lineClass}`} />
                        ) : null}
                        <div className="relative z-10 flex flex-col items-center px-2 text-center">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${nodeClass}`}>
                            <PhaseNodeStatusIcon status={phase.status} index={index} />
                          </div>
                          <div className={`mt-2 px-1 ${textClass}`}>
                            <div className="text-xs font-semibold">{phase.label}</div>
                            <div className="mt-1 flex justify-center">
                              <PhaseStatusBadge status={phase.status} />
                            </div>
                            <div className="mt-1 text-[10px] leading-tight text-slate-500">
                              {phase.detail || '-'}
                            </div>
                            {phase.updated_at && (
                              <div className="mt-1 text-[10px] text-slate-400">
                                {fmtTime(phase.updated_at)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">事件时间轴</p>
              <p className="mt-1 text-[11px] text-slate-500">默认展示最近任务事件，最新事件在上</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500">
                总事件数 <span className="font-bold text-slate-800">{events.length}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500">
                最近事件 <span className="font-bold text-slate-800">{orderedEvents[0]?.created_at ? fmtTime(orderedEvents[0].created_at) : '-'}</span>
              </div>
            </div>
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> 加载任务事件中...
            </div>
          ) : eventsError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {eventsError}
            </div>
          ) : orderedEvents.length === 0 ? (
            <div className="text-xs text-slate-500">暂无任务事件</div>
          ) : (
            <div className="space-y-2">
              {orderedEvents.map((event) => {
                const tone = inferTaskEventTone(event);
                const Icon = tone.icon;
                const detailText = formatEventDetail(event.detail);
                return (
                  <details key={event.id} className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-slate-700">
                      <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                      <Icon size={13} className={`shrink-0 ${tone.text} ${Icon === Loader2 ? 'group-open:animate-spin' : ''}`} />
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                        {event.event_type}
                      </span>
                      {event.stage_key ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {event.stage_key}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{event.summary}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{fmtTime(event.created_at)}</span>
                    </summary>
                    {detailText ? (
                      <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 px-3 py-2 text-[10px] leading-5 text-slate-100">{detailText}</pre>
                    ) : null}
                  </details>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">资源使用情况</p>
          {resourceLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> 加载资源指标中...
            </div>
          ) : !resourceUsage?.available ? (
            <div className="text-xs text-slate-500">
              {resourceUsage?.message || '暂无资源指标'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-400">CPU 占用</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {fmtPercent(resourceUsage.cpu_millicores, resourceUsage.pod_cpu_limit_millicores)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-400">内存占用</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {fmtPercent(resourceUsage.memory_mib, resourceUsage.pod_memory_limit_mib)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {task.result_message && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">结果摘要</p>
            <div className="text-xs leading-6 text-slate-700">{task.result_message}</div>
          </div>
        )}

        {task.error_message && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-red-500">错误信息</p>
            <div className="break-all font-mono text-xs leading-6 text-red-700">{task.error_message}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export const FirmwareUnpackerPage: React.FC<Props> = ({ projectId, projects = [] }) => {
  const { notify, feedbackNodes } = useUiFeedback();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [firmwarePath, setFirmwarePath] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [tasks, setTasks] = useState<FirmwareUnpackTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTaskId, setActiveTaskId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [resourceUsage, setResourceUsage] = useState<FirmwareTaskResourceUsage | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [progress, setProgress] = useState<FirmwareTaskProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [events, setEvents] = useState<FirmwareTaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:firmwareUnpackerTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('secflow:firmwareUnpackerTaskId');
    setActiveTaskId(storedTaskId);
  }, []);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskItems = Array.isArray(tasks) ? tasks : [];
  const activeProject = useMemo(
    () => projects.find((item) => item.id === projectId) || null,
    [projects, projectId],
  );
  const workspacePreview = useMemo(
    () => (projectId ? buildWorkspacePreview(projectId) : null),
    [projectId],
  );
  const activeTask = useMemo(
    () => taskItems.find((task) => task.id === activeTaskId) || null,
    [taskItems, activeTaskId],
  );

  const resetCreateForm = useCallback(() => {
    setFirmwarePath('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setCreateModalOpen(true);
  }, [resetCreateForm]);

  const fetchTasks = useCallback(async (resetPage = false) => {
    if (!projectId) {
      if (resetPage) setPage(0);
      setTasks([]);
      setTotal(0);
      setSelected(new Set());
      setListError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setListError('');
    const currentPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    try {
      const query: TaskListQuery = {
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
      };
      if (filterStatus) query.status = filterStatus;
      if (filterWorker) query.worker_id = filterWorker;
      if (filterSearch) query.search = filterSearch;
      const res = await fwApi.listTasks(query);
      setTasks(res.items);
      setTotal(res.total);
    } catch (e: any) {
      setListError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, projectId, filterStatus, filterSearch, filterWorker]);

  const refreshOne = useCallback(async (id: string) => {
    if (activeTaskId === id) setDetailLoading(true);
    try {
      const task = await fwApi.getTask(id);
      setTasks((prev) => prev.map((item) => (item.id === id ? task : item)));
      if (activeTaskId === id) {
        const [usage, taskProgress] = await Promise.all([
          fwApi.getTaskResourceUsage(id),
          fwApi.getTaskProgress(id),
        ]);
        setResourceUsage(usage);
        setProgress(taskProgress);
        try {
          const taskEvents = await fwApi.getTaskEvents(id);
          setEvents(taskEvents.items);
          setEventsError('');
        } catch (eventError: any) {
          setEvents([]);
          setEventsError(eventError?.message || '加载任务事件失败');
        }
      }
    } catch {
    } finally {
      if (activeTaskId === id) setDetailLoading(false);
    }
  }, [activeTaskId]);

  const loadResourceUsage = useCallback(async (id: string) => {
    setResourceLoading(true);
    try {
      const usage = await fwApi.getTaskResourceUsage(id);
      setResourceUsage(usage);
    } catch {
      setResourceUsage(null);
    } finally {
      setResourceLoading(false);
    }
  }, []);

  const loadTaskProgress = useCallback(async (id: string) => {
    setProgressLoading(true);
    try {
      const next = await fwApi.getTaskProgress(id);
      setProgress(next);
    } catch {
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const loadTaskEvents = useCallback(async (id: string) => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const next = await fwApi.getTaskEvents(id);
      setEvents(next.items);
    } catch (e: any) {
      setEvents([]);
      setEventsError(e?.message || '加载任务事件失败');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const hasRunning = useMemo(() => taskItems.some((task) => !isTerminal(task.status)), [taskItems]);

  useEffect(() => {
    if (hasRunning) {
      pollingRef.current = setInterval(() => {
        taskItems.filter((task) => !isTerminal(task.status)).forEach((task) => refreshOne(task.id));
      }, 5000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [hasRunning, taskItems, refreshOne]);

  useEffect(() => {
    fetchTasks(true);
    setSelected(new Set());
    setActiveTaskId('');
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
  }, [page]);

  useEffect(() => {
    if (!taskItems.length && activeTaskId) {
      setActiveTaskId('');
      return;
    }
    if (activeTaskId && !taskItems.some((task) => task.id === activeTaskId)) {
      setActiveTaskId('');
    }
  }, [taskItems, activeTaskId]);

  useEffect(() => {
    if (!activeTaskId) {
      setResourceUsage(null);
      setResourceLoading(false);
      setProgress(null);
      setProgressLoading(false);
      setEvents([]);
      setEventsLoading(false);
      setEventsError('');
      return;
    }
    loadResourceUsage(activeTaskId);
    loadTaskProgress(activeTaskId);
    loadTaskEvents(activeTaskId);
  }, [activeTaskId, loadResourceUsage, loadTaskProgress, loadTaskEvents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      notify('请先选择项目', 'error');
      return;
    }
    if (!firmwarePath.trim()) {
      notify('请先选择要解包的固件文件', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await fwApi.unpack({
        firmware_path: firmwarePath.trim(),
        project_id: projectId,
      });
      const messageParts = [`任务已提交！ID: ${result.task_id}`];
      if (result.output_path) messageParts.push(`output: ${result.output_path}`);
      if (result.run_path) messageParts.push(`run: ${result.run_path}`);
      notify(messageParts.join('，'), 'success');
      setCreateModalOpen(false);
      resetCreateForm();
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(e?.message || '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await fwApi.cancelTask(id);
      notify('任务停止请求已提交', 'success');
      refreshOne(id);
    } catch (e: any) {
      notify(`停止失败: ${e?.message}`, 'error');
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    const target = taskItems.find((task) => task.id === id);
    if (target && !isTerminal(target.status)) {
      notify('运行中的任务不能删除，请先停止', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '删除任务',
      message: '确认删除当前解包任务记录吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await fwApi.deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeTaskId === id) setActiveTaskId('');
      notify('任务已删除', 'success');
    } catch (e: any) {
      notify(`删除失败: ${e?.message}`, 'error');
    }
  }, [activeTaskId, notify, taskItems]);

  const handleRetry = async (id: string) => {
    try {
      const result = await fwApi.retryTask(id);
      notify(`已重试，新任务 ID: ${result.new_task_id}`, 'success');
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(`重试失败: ${e?.message}`, 'error');
    }
  };

  const handleBatchDelete = useCallback(async () => {
    const selectedTasks = taskItems.filter((task) => selected.has(task.id));
    const deletableIds = selectedTasks.filter((task) => isTerminal(task.status)).map((task) => task.id);
    const runningCount = selectedTasks.length - deletableIds.length;

    if (!selectedTasks.length) return;
    if (!deletableIds.length) {
      notify('所选任务中包含运行中任务，请先停止后再删除', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message: `确认删除 ${deletableIds.length} 条记录${runningCount > 0 ? `，并跳过 ${runningCount} 条运行中任务` : ''}？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await fwApi.batchDelete(deletableIds);
      setSelected((prev) => {
        const next = new Set(prev);
        deletableIds.forEach((taskId) => next.delete(taskId));
        return next;
      });
      if (activeTaskId && deletableIds.includes(activeTaskId)) setActiveTaskId('');
      fetchTasks(true);
      notify(`已删除 ${deletableIds.length} 条任务记录`, 'success');
    } catch (e: any) {
      notify(`批量删除失败: ${e?.message}`, 'error');
    }
  }, [activeTaskId, fetchTasks, notify, selected, taskItems]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(taskItems.map((task) => task.id)) : new Set());
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showingDetail = Boolean(activeTaskId);
  const hasReturnContext = hasBinarySecurityReturnContext();
  const handleDetailBack = () => {
    if (navigateBackToBinarySecurityTask()) return;
    setActiveTaskId('');
  };

  return (
    <div className="p-4 space-y-4">
      {feedbackNodes}

      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        mode="file"
        containerRoot={FILESERVER_CONTAINER_ROOT}
        title="选择固件文件"
        description="从项目文件系统中选择要解包的固件文件"
        confirmText="选择文件"
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          setFirmwarePath(containerPath);
        }}
      />

      {createModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Firmware Unpacker</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">新建解包任务</h3>
                <p className="mt-2 text-sm text-slate-500">使用右上角当前项目，从该项目文件系统中选择待解包固件文件。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setPickerOpen(false);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-5 px-6 py-6" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">所属项目</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{activeProject?.name || '未选择项目'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  项目 ID: <span className="font-mono text-slate-600">{projectId || '-'}</span>
                </p>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                固件文件
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                    <input
                      value={firmwarePath}
                      onChange={(e) => setFirmwarePath(e.target.value)}
                      placeholder={`${FILESERVER_CONTAINER_ROOT}/<project>/<subproject>/firmware.bin`}
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-9 pr-4 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!projectId}
                  onClick={() => {
                      if (!projectId) {
                        notify('请先选择项目', 'error');
                        return;
                      }
                      setPickerOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FolderOpen size={14} /> 选择文件
                  </button>
                </div>
                <span className="mt-2 block text-xs font-normal text-slate-500">支持手工输入路径，也支持从项目文件系统直接选择固件文件。</span>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-700">任务工作目录</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  提交后会在当前项目根目录自动创建 `app/secflow-app-firmware-unpacker/&lt;task-id&gt;`，
                  并在其中生成 `input`、`output`、`run` 三个目录。`input` 目录中只会写入一份 JSON 清单，记录原始固件路径、
                  输出目录和运行日志目录，解包时直接使用原始固件文件。
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-500">input</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.input || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">output</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.output || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">run</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.run || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setPickerOpen(false);
                  }}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectId || !firmwarePath.trim()}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" />提交中...</> : <><Play size={14} />提交任务</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-indigo-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {showingDetail ? '固件解包 · 任务详情' : '固件解包 · 任务列表'}
            </h2>
            {hasRunning && <p className="animate-pulse text-xs font-semibold text-blue-600">● 有任务运行中，每5秒自动刷新</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchTasks(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <RefreshCw size={12} /> 刷新列表
          </button>
        </div>
      </div>

      {showingDetail ? (
        <TaskDetailPanel
          task={projectId ? activeTask : null}
          loading={detailLoading}
          resourceUsage={resourceUsage}
          resourceLoading={resourceLoading}
          hasReturnContext={hasReturnContext}
          progress={progress}
          progressLoading={progressLoading}
          events={events}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          onBack={handleDetailBack}
          onRefresh={refreshOne}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onRetry={handleRetry}
        />
      ) : (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              ['总计', total, 'text-slate-700'],
              ['运行', taskItems.filter((task) => task.status === 'running').length, 'text-blue-600'],
              ['成功', taskItems.filter((task) => task.status === 'success').length, 'text-emerald-600'],
              ['失败', taskItems.filter((task) => task.status === 'failed').length, 'text-red-600'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 py-1.5">
                <p className={`text-base font-black ${color}`}>{count}</p>
                <p className="text-[10px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ListTodo size={14} className="shrink-0 text-violet-600" />
                <h3 className="text-lg font-black text-slate-900">任务列表</h3>
                <span className="text-sm font-normal text-slate-400">({total})</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {activeProject?.name ? `当前项目：${activeProject.name}` : projectId ? `当前项目 ID：${projectId}` : '当前未选择项目'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTasks(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={12} /> 刷新列表
              </button>
              <button
                onClick={openCreateModal}
                disabled={!projectId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus size={13} /> 新建任务
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                fetchTasks(true);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTasks(true)}
                placeholder="搜索固件路径..."
                className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-8 text-xs text-slate-700 outline-none focus:border-blue-300"
              />
              {filterSearch && (
                <button
                  onClick={() => {
                    setFilterSearch('');
                    fetchTasks(true);
                  }}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <input
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTasks(true)}
              placeholder="Worker ID 过滤..."
              className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-300"
            />

            <button
              onClick={() => fetchTasks(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              <Search size={11} /> 查询
            </button>

            {selected.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
              >
                <Trash2 size={11} /> 批量删除 ({selected.size})
              </button>
            )}
          </div>

          {listError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} /> {listError}
            </div>
          )}

          {taskItems.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
              <input
                type="checkbox"
                checked={selected.size === taskItems.length && taskItems.length > 0}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span className="text-xs text-slate-500">全选当前页 ({taskItems.length} 条)</span>
            </div>
          )}

          {!projectId ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              请先在右上角选择项目，再查看该项目下的固件解包任务
            </div>
          ) : loading && taskItems.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="mr-2 animate-spin" /> 加载中...
            </div>
          ) : taskItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              暂无任务记录
            </div>
          ) : (
            <div className="space-y-1.5">
              {taskItems.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  active={activeTaskId === task.id}
                  onSelect={toggleSelect}
                  onOpenDetail={setActiveTaskId}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                上一页
              </button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
