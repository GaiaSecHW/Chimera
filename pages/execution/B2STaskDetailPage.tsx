import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Code2,
  Cpu,
  FileCode2,
  FileJson2,
  FileText,
  Gauge,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Waypoints,
  X,
  XCircle,
} from 'lucide-react';

import {
  B2SAgentRuntimeEntry,
  B2SArtifactsResponse,
  B2SReviewAnalytics,
  B2SSessionFile,
  B2SSessionIndex,
  B2SSessionNode,
  B2STaskEvent,
  B2STaskDetail,
  B2STaskObservability,
  B2STaskRelationship,
  B2STaskResultSummary,
} from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { FileWatchMessage, fileserverApi } from '../../clients/fileserver';
import { showConfirm } from '../../components/DialogService';
import {
  B2SPhaseBadge,
  B2SProgressBar,
  B2SStatusBadge,
  B2S_TERMINAL_STATUSES,
  formatB2SOverallProgressBasis,
  formatB2SOverallProgressSummary,
  formatBytes,
  formatDateTime,
  pct,
} from './b2sPresentation';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { ReviewEffectivenessPanel } from './b2s-advanced/ReviewEffectivenessPanel';
import { B2SSessionPreview } from './b2s-detail/B2SSessionPreview';
import {
  hasBinarySecurityReturnTarget,
  hasExecutionReturnContext,
  navigateBackByTaskOrigin,
  navigateBackToBinarySecurityTask,
  navigateBackToExecutionView,
  saveExecutionReturnContext,
} from '../../utils/executionReturnContext';
import { parseAgentSessionJsonlDelta } from './agentSessionParsing';
import { TaskOriginCard } from './taskOrigin';
import { WarningListPanel } from './WarningListPanel';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
  onOpenAdvanced?: (itemId: string) => void;
}

type B2SItem = B2STaskDetail['items'][number];
type DetailTab = 'overview' | 'run-config' | 'timeline' | 'session' | 'relationship' | 'result' | 'evaluation';
type ItemFilter = '__all__' | string;

const PHASE_ORDER = ['queued', 'ida', 'batching', 'header', 'body', 'merge', 'completed'];
const PHASE_LABELS: Record<string, string> = {
  queued: '排队',
  ida: 'IDA',
  batching: 'Batch 切分',
  header: '头文件生成',
  body: '函数体还原',
  merge: '合并输出',
  completed: '完成',
};

const fileNameOf = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || path;
};

const parseBackendTimeMs = (value?: string | null) => {
  if (!value) return NaN;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs == null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const formatDuration = (start?: string | null, end?: string | null, nowMs: number = Date.now()) => {
  if (!start) return '-';
  const startMs = parseBackendTimeMs(start);
  const endMs = end ? parseBackendTimeMs(end) : nowMs;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return '-';
  return formatDurationMs(endMs - startMs);
};

const compactText = (value?: string | null, fallback = '-') => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
};

const failureSuggestion = (item: B2SItem) => {
  const reason = `${item.failure_type || ''} ${item.error_reason || ''} ${item.phase_message || ''}`.toLowerCase();
  if (reason.includes('ida') && reason.includes('timeout')) {
    return 'IDA 静态分析超时，优先检查 ELF 规模/架构识别/IDA 日志；可单独重跑该 item 或调大 IDA 分析超时。';
  }
  if (reason.includes('openrouter') || reason.includes('api key')) {
    return '模型 Provider 或 API Key 异常，检查配置中心 Provider、pi-re-agent models.json 与任务冻结配置。';
  }
  if (reason.includes('not found') || reason.includes('missing')) {
    return '上游 job 或产物缺失，通常适合重新派发/重跑，必要时检查 PVC 路径是否存在。';
  }
  if (reason.includes('timeout')) {
    return '执行超时，检查对应智能体会话、worker 负载和超时重试配置。';
  }
  return '查看 pi job、worker 日志和当前阶段消息，确认是输入、执行器还是模型侧异常。';
};

const languageFromName = (name?: string | null) => {
  const lower = fileNameOf(name).toLowerCase();
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.hpp')) return 'cpp';
  if (lower.endsWith('.json') || lower.endsWith('.jsonl')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.py')) return 'python';
  return 'plaintext';
};

const formatSessionUpdatedAt = (value?: string | null) => {
  if (!value) return '-';
  return formatDateTime(value);
};

const sessionGroupLabel = (group: string) => {
  return group === 'root' ? '根会话' : group;
};

const extractFsRelPath = (absolutePath: string, projectId: string): string | null => {
  const prefix = `/data/files/${projectId}`;
  if (!absolutePath.startsWith(prefix)) return null;
  const rel = absolutePath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
};

const tabButtonTone = (active: boolean) => (
  active
    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_10px_28px_rgba(15,23,42,0.18)]'
    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
);

const timelineLevelTone = (level?: string | null) => {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'error') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'warning' || normalized === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const formatTimelineEventTypeLabel = (eventType?: string | null) => {
  const normalized = String(eventType || '').trim();
  if (!normalized) return '-';
  const map: Record<string, string> = {
    task_created: '任务创建',
    task_status_changed: '任务状态变更',
    task_cancel_requested: '任务取消请求',
    task_retry_requested: '任务重试请求',
    task_rerun_requested: '任务重跑请求',
    item_registered: '任务项登记',
    item_queue_prepared: '进入派发队列',
    dispatch_requested: '请求派发',
    item_dispatched: '派发成功',
    dispatch_failed: '派发失败',
    dispatch_conflicted: '派发冲突',
    pi_job_bound: '绑定 Pi Job',
    worker_assigned: '分配 Worker',
    item_status_changed: '任务项状态变更',
    phase_changed: '阶段切换',
    batch_started: 'Batch 开始',
    batch_attempt_started: 'Batch Attempt 开始',
    function_progress: '函数推进',
    batch_completed: 'Batch 完成',
    progress_snapshot_synced: '进度快照同步',
    runtime_metrics_updated: '运行指标更新',
    runtime_metrics_missing: '运行指标缺失',
    missing_job_requeued: '丢失任务重排',
    pi_recovery_observed: '恢复动作',
    pi_recovery_warning: '恢复告警',
    pi_job_conflict_observed: '冲突任务',
    sync_observation_failed: '同步失败',
    job_completed: '任务完成',
    job_failed: '任务失败',
    job_cancelled: '任务取消',
    output_cleaned: '输出清理',
    item_requeued: '任务项重排',
  };
  return map[normalized] || normalized.replace(/_/g, ' ');
};

const tileTone = (tone: 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet' = 'slate') => {
  const map = {
    slate: 'border-slate-200 bg-slate-50/90 text-slate-900',
    blue: 'border-blue-100 bg-blue-50/90 text-blue-900',
    emerald: 'border-emerald-100 bg-emerald-50/90 text-emerald-900',
    rose: 'border-rose-100 bg-rose-50/90 text-rose-900',
    amber: 'border-amber-100 bg-amber-50/90 text-amber-900',
    violet: 'border-violet-100 bg-violet-50/90 text-violet-900',
  } as const;
  return map[tone];
};

const MetricTile: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'slate', icon }) => (
  <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${tileTone(tone)}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{label}</div>
        <div className="mt-0.5 break-words text-xl font-black tracking-tight">{value}</div>
      </div>
      {icon ? <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">{icon}</div> : null}
    </div>
    {hint ? <div className="mt-1 truncate text-[11px] font-semibold opacity-70" title={hint}>{hint}</div> : null}
  </div>
);

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, description, children, right }) => (
  <section className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[11px] text-slate-500">{description}</p> : null}
      </div>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

const FilePreviewDialog: React.FC<{
  title: string;
  subtitle?: string | null;
  content: string;
  language: string;
  loading?: boolean;
  onClose: () => void;
}> = ({ title, subtitle, content, language, loading, onClose }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-6">
    <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-white">{title}</div>
          {subtitle ? <div className="mt-1 truncate text-xs text-slate-400">{subtitle}</div> : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 hover:bg-slate-800">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />加载中...</div>
        ) : language === 'json' && title.toLowerCase().endsWith('.jsonl') ? (
          <B2SSessionPreview name={title} content={content} />
        ) : title.toLowerCase().endsWith('.jsonl') ? (
          <B2SSessionPreview name={title} content={content} />
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true }}
          />
        )}
      </div>
    </div>
  </div>
);

function useSelectedItem(detail: B2STaskDetail | null, selectedItemId: ItemFilter) {
  return useMemo(() => {
    if (!detail || selectedItemId === '__all__') return null;
    return detail.items.find((item) => item.id === selectedItemId) || null;
  }, [detail, selectedItemId]);
}

export const B2STaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack, onOpenAdvanced }) => {
  const executionApi = api.domains.execution.binaryToSource;
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [clockNow, setClockNow] = useState(Date.now());
  const [selectedItemId, setSelectedItemId] = useState<ItemFilter>('__all__');
  const [timeline, setTimeline] = useState<B2STaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [deletingTimelineEventId, setDeletingTimelineEventId] = useState<string>('');
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<string>('');
  const [timelinePhaseFilter, setTimelinePhaseFilter] = useState<string>('__all__');
  const [timelineEventTypeFilter, setTimelineEventTypeFilter] = useState<string>('__all__');
  const [timelineLevelFilter, setTimelineLevelFilter] = useState<string>('__all__');
  const [result, setResult] = useState<B2STaskResultSummary | null>(null);
  const [observability, setObservability] = useState<B2STaskObservability | null>(null);
  const [sessions, setSessions] = useState<B2SSessionIndex | null>(null);
  const [relationship, setRelationship] = useState<B2STaskRelationship | null>(null);
  const [selectedSessionNodeId, setSelectedSessionNodeId] = useState<string>('');
  const [pendingSessionTarget, setPendingSessionTarget] = useState<{ itemId?: string | null; relativePath?: string | null; fullPath?: string | null } | null>(null);
  const [selectedSessionContent, setSelectedSessionContent] = useState<string>('');
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [itemArtifacts, setItemArtifacts] = useState<B2SArtifactsResponse | null>(null);
  const [artifactContent, setArtifactContent] = useState('');
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('');
  const [itemAnalytics, setItemAnalytics] = useState<B2SReviewAnalytics | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{ title: string; subtitle?: string | null; content: string; language: string; loading?: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const sessionLineCountRef = useRef(0);

  const selectedItem = useSelectedItem(detail, selectedItemId);
  const hasReturnContext = hasExecutionReturnContext() || hasBinarySecurityReturnTarget(detail);
  const failedItems = detail?.items.filter((item) => item.status === 'failed') || [];
  const handleBack = () => {
    if (navigateBackToExecutionView()) return;
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await executionApi.getTask(projectId, taskId);
      setDetail(data);
      if (selectedItemId !== '__all__' && !data.items.some((item) => item.id === selectedItemId)) {
        setSelectedItemId('__all__');
      }
    } catch (e: any) {
      if (!silent) {
        setError(e?.message || '加载任务详情失败');
        setDetail(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [executionApi, projectId, selectedItemId, taskId]);

  const loadResult = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    try {
      setResult(await executionApi.getTaskResult(projectId, taskId));
    } catch (e: any) {
      if (!options?.silent) {
        setError(e?.message || '加载结果摘要失败');
      }
    }
  }, [executionApi, projectId, taskId]);

  const loadObservability = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    try {
      setObservability(await executionApi.getTaskObservability(projectId, taskId));
    } catch (e: any) {
      if (!options?.silent) {
        setError(e?.message || '加载观测指标失败');
      }
    }
  }, [executionApi, projectId, taskId]);

  const loadTimeline = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    if (!options?.silent) setTimelineLoading(true);
    try {
      const payload = await executionApi.getTaskTimeline(projectId, taskId);
      setTimeline(payload.events || []);
    } catch (e: any) {
      if (!options?.silent) {
        setError(e?.message || '加载事件时间线失败');
      }
    } finally {
      if (!options?.silent) setTimelineLoading(false);
    }
  }, [executionApi, projectId, taskId]);

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    try {
      const payload = await executionApi.getTaskSessions(projectId, taskId);
      setSessions(payload);
      if (!selectedSessionNodeId && payload.nodes[0]) setSelectedSessionNodeId(payload.nodes[0].node_id);
    } catch (e: any) {
      if (!options?.silent) {
        setError(e?.message || '加载智能体会话失败');
      }
    }
  }, [executionApi, projectId, selectedSessionNodeId, taskId]);

  const filteredSessionNodes = useMemo(() => {
    const nodes = sessions?.nodes || [];
    if (selectedItemId === '__all__') return nodes;
    return nodes.filter((node) => node.item_id === selectedItemId);
  }, [sessions, selectedItemId]);

  const groupedSessionNodes = useMemo(() => {
    const groups = new Map<string, B2SSessionNode[]>();
    filteredSessionNodes.forEach((node) => {
      const key = `#${node.sequence_no} ${node.item_name || '未知 Item'}`;
      groups.set(key, [...(groups.get(key) || []), node]);
    });
    return Array.from(groups.entries());
  }, [filteredSessionNodes]);

  const selectedSessionNode = useMemo(
    () => filteredSessionNodes.find((node) => node.node_id === selectedSessionNodeId) || null,
    [filteredSessionNodes, selectedSessionNodeId],
  );

  const focusSession = useCallback((target: { itemId?: string | null; nodeId?: string | null; relativePath?: string | null; fullPath?: string | null }) => {
    setActiveTab('session');
    setSelectedItemId(target.itemId || '__all__');
    const allNodes = sessions?.nodes || [];
    const matched = (target.nodeId
      ? allNodes.find((node) => node.node_id === target.nodeId)
      : allNodes.find((node) => {
          if (target.itemId && node.item_id !== target.itemId) return false;
          if (target.fullPath && node.full_path === target.fullPath) return true;
          return !!target.relativePath && node.relative_path === target.relativePath;
        })) || null;
    if (matched) {
      setSelectedSessionNodeId(matched.node_id);
      setPendingSessionTarget(null);
      return;
    }
    if (target.relativePath || target.fullPath) {
      setPendingSessionTarget({
        itemId: target.itemId,
        relativePath: target.relativePath,
        fullPath: target.fullPath,
      });
    }
  }, [sessions]);

  useEffect(() => {
    if (filteredSessionNodes.length === 0) {
      if (selectedSessionNodeId) setSelectedSessionNodeId('');
      return;
    }
    if (!selectedSessionNodeId || !filteredSessionNodes.some((node) => node.node_id === selectedSessionNodeId)) {
      setSelectedSessionNodeId(filteredSessionNodes[0].node_id);
    }
  }, [filteredSessionNodes, selectedSessionNodeId]);

  useEffect(() => {
    if (!pendingSessionTarget) return;
    const allNodes = sessions?.nodes || [];
    const matched = allNodes.find((node) => {
      if (pendingSessionTarget.itemId && node.item_id !== pendingSessionTarget.itemId) return false;
      if (pendingSessionTarget.fullPath && node.full_path === pendingSessionTarget.fullPath) return true;
      return !!pendingSessionTarget.relativePath && node.relative_path === pendingSessionTarget.relativePath;
    });
    if (!matched) return;
    setSelectedSessionNodeId(matched.node_id);
    setPendingSessionTarget(null);
  }, [pendingSessionTarget, sessions]);

  const closeSessionSocket = useCallback(() => {
    if (!sessionSocketRef.current) return;
    try {
      if (sessionSocketRef.current.readyState === WebSocket.OPEN) {
        sessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
      }
    } catch {
      // ignore close send errors
    }
    try {
      sessionSocketRef.current.close();
    } catch {
      // ignore socket close errors
    }
    sessionSocketRef.current = null;
    setSessionLive(false);
  }, []);

  const loadSessionFile = useCallback(async (node: B2SSessionNode | null) => {
    if (!projectId || !taskId || !node?.relative_path) return null;
    setSelectedSessionLoading(true);
    setSessionError(null);
    try {
      const payload: B2SSessionFile = await executionApi.getTaskSessionFile(projectId, taskId, node.relative_path, {
        itemId: node.item_id,
        nodeId: node.node_id,
      });
      setSelectedSessionContent(payload.content || '');
      sessionLineCountRef.current = (payload.content || '').split(/\r?\n/).filter(Boolean).length;
      return payload;
    } catch (e: any) {
      setSelectedSessionContent('');
      sessionLineCountRef.current = 0;
      setSessionError(e?.message || '加载会话内容失败');
      return null;
    } finally {
      setSelectedSessionLoading(false);
    }
  }, [executionApi, projectId, taskId]);

  const loadRelationship = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId || !taskId) return;
    try {
      setRelationship(await executionApi.getTaskRelationship(projectId, taskId));
    } catch (e: any) {
      if (!options?.silent) {
        setError(e?.message || '加载智能体关系失败');
      }
    }
  }, [executionApi, projectId, taskId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => () => {
    closeSessionSocket();
  }, [closeSessionSocket]);

  const isTaskRunning = !!detail && !B2S_TERMINAL_STATUSES.has(detail.status);

  useEffect(() => {
    if (!isTaskRunning) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isTaskRunning]);

  useEffect(() => {
    if (activeTab === 'result' && !result) void loadResult();
    if (activeTab === 'evaluation' && !observability) void loadObservability();
    if (activeTab === 'timeline' && timeline.length === 0) void loadTimeline();
    if (activeTab === 'session' && !sessions) void loadSessions();
    if (activeTab === 'relationship' && !relationship) void loadRelationship();
  }, [activeTab, loadObservability, loadRelationship, loadResult, loadSessions, loadTimeline, observability, relationship, result, sessions, timeline.length]);

  useEffect(() => {
    if (!isTaskRunning) return undefined;

    if (activeTab === 'overview') {
      const timer = window.setInterval(() => { void loadDetail({ silent: true }); }, 5000);
      return () => window.clearInterval(timer);
    }

    if (activeTab === 'result') {
      const timer = window.setInterval(() => {
        void loadDetail({ silent: true });
        void loadResult({ silent: true });
      }, 5000);
      return () => window.clearInterval(timer);
    }

    if (activeTab === 'evaluation') {
      const timer = window.setInterval(() => {
        void loadDetail({ silent: true });
        void loadObservability({ silent: true });
      }, 5000);
      return () => window.clearInterval(timer);
    }

    if (activeTab === 'timeline') {
      const timer = window.setInterval(() => {
        void loadDetail({ silent: true });
        void loadTimeline({ silent: true });
      }, 5000);
      return () => window.clearInterval(timer);
    }

    if (activeTab === 'session') {
      const timer = window.setInterval(() => { void loadSessions({ silent: true }); }, 5000);
      return () => window.clearInterval(timer);
    }

    if (activeTab === 'relationship') {
      const timer = window.setInterval(() => { void loadRelationship({ silent: true }); }, 10000);
      return () => window.clearInterval(timer);
    }

    return undefined;
  }, [activeTab, isTaskRunning, loadDetail, loadObservability, loadRelationship, loadResult, loadSessions, loadTimeline]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionNode) {
      closeSessionSocket();
      return;
    }
    void loadSessionFile(selectedSessionNode);
  }, [activeTab, selectedSessionNode, loadSessionFile, closeSessionSocket]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionNode || !isTaskRunning) {
      closeSessionSocket();
      return;
    }
    if (!selectedSessionNode?.full_path) {
      setSessionLive(false);
      setSessionError('当前会话缺少 full_path，无法建立实时监听');
      return;
    }
    const watchPath = extractFsRelPath(selectedSessionNode.full_path, projectId);
    if (!watchPath) {
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }

    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: sessionLineCountRef.current,
    });
    sessionSocketRef.current = socket;

    socket.onopen = () => {
      setSessionLive(true);
      setSessionError(null);
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot') {
          setSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          setSelectedSessionContent((current) => {
            const prefix = current && !current.endsWith('\n') ? '\n' : '';
            return `${current || ''}${prefix}${deltaLines.join('\n')}`;
          });
          const parsed = parseAgentSessionJsonlDelta(deltaLines, (message.from_line ?? sessionLineCountRef.current) + 1);
          if (parsed.sessionMeta?.id || parsed.sessionMeta?.cwd || parsed.sessionMeta?.timestamp) {
            // keep parser side effects available for future viewer migration
          }
          sessionLineCountRef.current = message.to_line ?? (sessionLineCountRef.current + deltaLines.length);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setSessionLive(false);
            setSessionError('会话文件已重置，正在重新加载');
            void loadSessionFile(selectedSessionNode);
            return;
          }
          if (message.event === 'deleted') {
            setSessionLive(false);
            setSessionError('会话文件已删除');
            closeSessionSocket();
          }
          return;
        }
        if (message.type === 'error') {
          setSessionLive(false);
          setSessionError(message.message || '会话订阅失败');
        }
      } catch (e: any) {
        setSessionLive(false);
        setSessionError(e?.message || '解析会话增量消息失败');
      }
    };
    socket.onerror = () => {
      setSessionLive(false);
    };
    socket.onclose = () => {
      setSessionLive(false);
    };

    return () => {
      if (sessionSocketRef.current === socket) {
        closeSessionSocket();
      } else {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [activeTab, selectedSessionNode, isTaskRunning, projectId, loadSessionFile, closeSessionSocket]);

  useEffect(() => {
    if (!selectedItem || activeTab !== 'result') return;
    let cancelled = false;
    const loadItemArtifacts = async () => {
      try {
        const payload = await executionApi.getTaskItemArtifacts(projectId, taskId, selectedItem.id);
        if (!cancelled) {
          setItemArtifacts(payload);
          if (!selectedArtifactId && payload.artifacts[0]) setSelectedArtifactId(payload.artifacts[0].id);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '加载结果文件失败');
      }
    };
    void loadItemArtifacts();
    return () => { cancelled = true; };
  }, [selectedItem?.id, activeTab, projectId, taskId]);

  useEffect(() => {
    if (!selectedItem || activeTab !== 'evaluation') return;
    let cancelled = false;
    const loadAnalytics = async () => {
      try {
        const payload = await executionApi.getTaskItemReviewAnalytics(projectId, taskId, selectedItem.id);
        if (!cancelled) setItemAnalytics(payload);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '加载评审观测失败');
      }
    };
    void loadAnalytics();
    return () => { cancelled = true; };
  }, [selectedItem?.id, activeTab, projectId, taskId]);

  useEffect(() => {
    setExpandedTimelineEventId('');
  }, [taskId, selectedItemId, timelinePhaseFilter, timelineEventTypeFilter, timelineLevelFilter]);

  useEffect(() => {
    if (!selectedItem || !itemArtifacts || !selectedArtifactId) return;
    let cancelled = false;
    const loadArtifactContent = async () => {
      setArtifactLoading(true);
      try {
        const payload = await executionApi.getTaskItemArtifactContent(projectId, taskId, selectedItem.id, selectedArtifactId);
        if (!cancelled) setArtifactContent(payload.content || '');
      } catch (e: any) {
        if (!cancelled) {
          setArtifactContent('');
          setError(e?.message || '加载结果文件内容失败');
        }
      } finally {
        if (!cancelled) setArtifactLoading(false);
      }
    };
    void loadArtifactContent();
    return () => { cancelled = true; };
  }, [selectedItem?.id, itemArtifacts?.item_id, selectedArtifactId, projectId, taskId]);

  const cancelTask = async () => {
    const confirmed = await showConfirm({
      title: '取消二进制逆向任务',
      message: '确认取消该二进制逆向任务？运行中的 item 会请求终止，已生成的输入、输出和中间文件会保留。',
      confirmText: '确认取消',
      cancelText: '继续运行',
      danger: true,
    });
    if (!confirmed) return;
    setCancelling(true);
    try {
      await executionApi.terminateTask(projectId, taskId);
      await loadDetail();
    } catch (e: any) {
      setError(e?.message || '取消任务失败');
    } finally {
      setCancelling(false);
    }
  };

  const rerunTask = async () => {
    const confirmed = await showConfirm({
      title: '清空并从头重跑',
      message: `确认清空并从头重跑任务 ${taskId}？系统会保留 input，清理各 item 输出目录并重新提交所有 ELF item。`,
      confirmText: '确认重跑',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setRerunning(true);
    try {
      await executionApi.rerunTask(projectId, taskId);
      await loadDetail();
    } catch (e: any) {
      setError(e?.message || '重跑任务失败');
    } finally {
      setRerunning(false);
    }
  };

  const deleteTask = async () => {
    const confirmed = await showConfirm({
      title: '彻底删除任务',
      message: `确认删除任务 ${taskId}？这会删除任务记录及输入、输出和中间文件，且不可恢复。`,
      confirmText: '确认删除',
      cancelText: '保留任务',
      danger: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await executionApi.deleteTask(projectId, taskId);
      handleBack();
    } catch (e: any) {
      setError(e?.message || '删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const clearTimeline = async () => {
    const confirmed = await showConfirm({
      title: '清空事件时间线',
      message: '将删除当前任务的全部时间线事件。该操作不影响任务状态、产物和会话文件，删除后不可恢复。',
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setTimelineClearing(true);
    try {
      await executionApi.clearTaskTimeline(projectId, taskId);
      setTimeline([]);
      setExpandedTimelineEventId('');
    } catch (e: any) {
      setError(e?.message || '清空事件时间线失败');
    } finally {
      setTimelineClearing(false);
    }
  };

  const deleteTimelineEvent = async (eventId: string) => {
    const confirmed = await showConfirm({
      title: '删除事件',
      message: '该操作只删除当前事件记录，不影响任务执行状态与产物，删除后不可恢复。',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingTimelineEventId(eventId);
    try {
      await executionApi.deleteTaskTimelineEvent(projectId, taskId, eventId);
      setTimeline((current) => current.filter((event) => event.id !== eventId));
      setExpandedTimelineEventId((current) => (current === eventId ? '' : current));
    } catch (e: any) {
      setError(e?.message || '删除事件失败');
    } finally {
      setDeletingTimelineEventId('');
    }
  };

  const timelinePhaseOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.phase || '').trim()).filter(Boolean))), [timeline]);
  const timelineEventTypeOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.event_type || '').trim()).filter(Boolean))), [timeline]);
  const timelineLevelOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.level || '').trim()).filter(Boolean))), [timeline]);
  const filteredTimeline = useMemo(() => {
    return timeline.filter((event) => {
      if (selectedItemId !== '__all__' && event.item_id !== selectedItemId) return false;
      if (timelinePhaseFilter !== '__all__' && (event.phase || '__none__') !== timelinePhaseFilter) return false;
      if (timelineEventTypeFilter !== '__all__' && (event.event_type || '__none__') !== timelineEventTypeFilter) return false;
      if (timelineLevelFilter !== '__all__' && (event.level || '__none__') !== timelineLevelFilter) return false;
      return true;
    });
  }, [selectedItemId, timeline, timelineEventTypeFilter, timelineLevelFilter, timelinePhaseFilter]);
  const overall = detail?.overall_progress;
  const primaryProgress = overall?.percent ?? 0;
  const progressBasisLabel = formatB2SOverallProgressBasis(overall?.percent_basis);
  const progressSummaryLabel = formatB2SOverallProgressSummary(overall);
  const resultSummary = detail?.result_summary || result;
  const observabilitySummary = detail?.observability_summary || observability;
  const activeAgents = detail?.agent_runtime_summary?.active_agents || [];
  const relationshipNodes = useMemo(() => {
    const nodes = relationship?.nodes || [];
    if (selectedItemId === '__all__') return nodes;
    return nodes.filter((node) => !node.item_id || node.item_id === selectedItemId);
  }, [relationship, selectedItemId]);
  const relationshipEdges = useMemo(() => {
    const nodeIds = new Set(relationshipNodes.map((node) => node.node_id));
    return (relationship?.edges || []).filter((edge) => nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id));
  }, [relationship?.edges, relationshipNodes]);
  const selectedArtifact = itemArtifacts?.artifacts.find((artifact) => artifact.id === selectedArtifactId) || null;
  const selectedItemResultSummary = resultSummary?.items.find((item) => item.item_id === selectedItem?.id) || null;

  const summaryLine = observabilitySummary
    ? `${observabilitySummary.total_review_attempts}/${observabilitySummary.avg_quality_score || 0}/${observabilitySummary.issue_remaining}`
    : '-';

  const taskDuration = detail
    ? formatDuration(
        detail.items.map((item) => item.started_at).filter(Boolean).sort()[0] || null,
        B2S_TERMINAL_STATUSES.has(detail.status)
          ? detail.items.map((item) => item.finished_at).filter(Boolean).sort().reverse()[0] || null
          : null,
        clockNow,
      )
    : '-';

  if (!taskId) {
    return <div className="px-6 pb-8 pt-6 text-sm text-slate-500">未指定任务，请返回列表重新选择。</div>;
  }

  const renderOverview = () => (
    <div className="space-y-4">
      <SectionCard
        title="阶段进度"
        description="按 B2S 语义展示任务的当前推进位置。"
        right={<div className="text-xs font-black text-slate-500">任务进度 {progressSummaryLabel}</div>}
      >
        <div className="grid gap-2 lg:grid-cols-7">
          {PHASE_ORDER.map((phase, index) => {
            const count = detail?.items.filter((item) => {
              const currentIndex = Math.max(0, PHASE_ORDER.indexOf(item.phase || 'queued'));
              return currentIndex === index;
            }).length || 0;
            const completed = detail?.items.filter((item) => {
              const currentIndex = Math.max(0, PHASE_ORDER.indexOf(item.phase || 'queued'));
              return currentIndex > index || item.status === 'success';
            }).length || 0;
            return (
              <div key={phase} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className={`h-1.5 rounded-full ${count ? 'bg-blue-500' : completed ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                <div className="mt-2 text-sm font-black text-slate-900">{PHASE_LABELS[phase]}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">当前 {count} · 已过 {completed}</div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="当前运行智能体"
        description="展示当前任务里的活跃 agent，会话点击后直接弹出实时对话。"
        right={<div className="text-xs font-black text-slate-500">Header/Executor/Validator {detail?.agent_runtime_summary?.header_agent_count || 0}/{detail?.agent_runtime_summary?.executor_agent_count || 0}/{detail?.agent_runtime_summary?.validator_agent_count || 0}</div>}
      >
        {activeAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">当前没有运行中的智能体。快速模式或已完成任务可能不会保留活跃会话。</div>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {activeAgents.map((agent) => (
              <button
                key={agent.key}
                type="button"
                onClick={() => {
                  focusSession({
                    itemId: agent.item_id,
                    relativePath: agent.relative_path,
                    fullPath: agent.full_path,
                  });
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">{agent.label}</div>
                    <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{agent.item_name} · {agent.stage || '-'} · {agent.run_name || '-'}</div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{agent.role || 'session'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-600">
                  {agent.batch_no ? <span className="rounded-full bg-slate-100 px-2 py-0.5">Batch {agent.batch_no}</span> : null}
                  {agent.attempt_no ? <span className="rounded-full bg-slate-100 px-2 py-0.5">第 {agent.attempt_no} 轮</span> : null}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{agent.updated_at ? formatDateTime(agent.updated_at) : '实时'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="ELF 完成" value={`${overall?.completed_items || 0}/${overall?.total_items || detail?.total_items || 0}`} hint={`${detail?.running_items || 0} 个运行中`} tone="blue" icon={<Cpu size={18} />} />
        <MetricTile label="Batch 总数" value={observabilitySummary?.total_batches || 0} hint={`均值 ${observabilitySummary?.avg_batches_per_item || 0}`} tone="violet" icon={<Layers3 size={18} />} />
        <MetricTile label="评审轮次" value={observabilitySummary?.total_review_attempts || 0} hint={`均值 ${observabilitySummary?.avg_review_attempts || 0}`} tone="emerald" icon={<GitBranch size={18} />} />
        <MetricTile label="会话数" value={resultSummary?.session_file_count || detail?.agent_runtime_summary?.total_sessions || 0} hint={`活跃 ${detail?.agent_runtime_summary?.active_agent_count || 0}`} tone="slate" icon={<Bot size={18} />} />
        <MetricTile label="结果文件" value={resultSummary?.result_file_count || 0} hint="任务级汇总" tone="emerald" icon={<Code2 size={18} />} />
        <MetricTile label="任务耗时" value={taskDuration} hint={B2S_TERMINAL_STATUSES.has(detail?.status || '') ? '已结束' : '实时计时中'} tone="slate" icon={<Clock3 size={18} />} />
      </div>

      <SectionCard title="快速风险" description="优先展示失败项、评审未通过项和结果缺失项。">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-500">失败 Item</div>
            <div className="mt-2.5 space-y-1.5">
              {failedItems.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setActiveTab('result');
                  }}
                  className="w-full rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold text-rose-800 ring-1 ring-rose-100 transition hover:bg-rose-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{`#${item.sequence_no} ${fileNameOf(item.elf_path)}`}</span>
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">{item.failure_type || item.phase || 'failed'}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] font-semibold text-rose-600" title={compactText(item.error_reason || item.phase_message)}>
                    {compactText(item.error_reason || item.phase_message, '无详细错误信息')}
                  </div>
                </button>
              ))}
              {failedItems.length === 0 ? <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-500">暂无失败项</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">评审未通过</div>
            <div className="mt-2.5 space-y-1.5">
              {(resultSummary?.items.filter((item) => String(item.final_verdict || '').toUpperCase() !== 'PASS').slice(0, 4) || []).map((item) => (
                <div key={item.item_id} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700">{`#${item.sequence_no} ${item.item_name} · ${item.final_verdict_label || item.final_verdict || '-'}`}</div>
              ))}
              {(resultSummary?.items.filter((item) => String(item.final_verdict || '').toUpperCase() !== 'PASS').length || 0) === 0 ? <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-500">暂无未通过项</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">结果缺失</div>
            <div className="mt-2.5 space-y-1.5">
              {(resultSummary?.items.filter((item) => item.result_file_count === 0).slice(0, 4) || []).map((item) => (
                <div key={item.item_id} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">{`#${item.sequence_no} ${item.item_name}`}</div>
              ))}
              {(resultSummary?.items.filter((item) => item.result_file_count === 0).length || 0) === 0 ? <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-500">所有 item 都已有结果文件</div> : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderTimeline = () => (
    <SectionCard
      title="事件时间线"
      description="按时间查看任务编排事件与 pi-re-agent 执行推进事件。"
      right={(
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadTimeline()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void clearTimeline()}
            disabled={timelineClearing || timelineLoading || timeline.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {timelineClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            清空
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-2.5 md:grid-cols-4">
          <MetricTile label="事件总数" value={detail?.event_summary?.total_events || timeline.length} tone="blue" icon={<Clock3 size={18} />} />
          <MetricTile label="最新事件" value={formatTimelineEventTypeLabel(detail?.event_summary?.latest_event_type)} hint={detail?.event_summary?.latest_event_at ? formatDateTime(detail.event_summary.latest_event_at) : '-'} tone="slate" icon={<RefreshCw size={18} />} />
          <MetricTile label="最近 Batch" value={detail?.event_summary?.last_batch_id ?? '-'} hint={detail?.event_summary?.current_attempt != null ? `Attempt ${detail.event_summary.current_attempt}` : '-'} tone="violet" icon={<Layers3 size={18} />} />
          <MetricTile label="当前函数" value={detail?.event_summary?.current_function || '-'} tone="emerald" icon={<Code2 size={18} />} />
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <select value={timelinePhaseFilter} onChange={(event) => setTimelinePhaseFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400">
            <option value="__all__">全部阶段</option>
            {timelinePhaseOptions.map((value) => <option key={value} value={value}>{PHASE_LABELS[value] || value}</option>)}
          </select>
          <select value={timelineEventTypeFilter} onChange={(event) => setTimelineEventTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400">
            <option value="__all__">全部事件</option>
            {timelineEventTypeOptions.map((value) => <option key={value} value={value}>{formatTimelineEventTypeLabel(value)}</option>)}
          </select>
          <select value={timelineLevelFilter} onChange={(event) => setTimelineLevelFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400">
            <option value="__all__">全部级别</option>
            {timelineLevelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
            当前显示 <span className="font-black text-slate-900">{filteredTimeline.length}</span> / {timeline.length}
          </div>
        </div>
        {timelineLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载事件时间线中...</div>
        ) : filteredTimeline.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前筛选条件下没有事件记录。</div>
        ) : (
          <div className="space-y-2">
            {filteredTimeline.map((event) => {
              const expanded = expandedTimelineEventId === event.id;
              const payloadText = event.payload && Object.keys(event.payload).length ? JSON.stringify(event.payload, null, 2) : '';
              return (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedTimelineEventId((current) => (current === event.id ? '' : event.id))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${timelineLevelTone(event.level)}`}>{event.level || 'info'}</span>
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700">{event.source === 'pi_re_agent' ? 'PI' : 'B2S'}</span>
                        {event.phase ? <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">{PHASE_LABELS[event.phase] || event.phase}</span> : null}
                        {event.batch_id != null ? <span className="inline-flex rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">Batch {event.batch_id}</span> : null}
                        {event.attempt != null ? <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">Attempt {event.attempt}</span> : null}
                        {event.function_name ? <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">{event.function_name}</span> : null}
                      </div>
                      <div className="mt-2 text-sm font-black text-slate-900">{event.message}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                        <span>{formatDateTime(event.created_at)}</span>
                        <span>{formatTimelineEventTypeLabel(event.event_type)}</span>
                        <span>{event.sequence_no != null ? `Item #${event.sequence_no}` : event.item_id || '-'}</span>
                        <span>{event.pi_job_id || '-'}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTimelineEvent(event.id)}
                      disabled={deletingTimelineEventId === event.id || timelineClearing}
                      className="inline-flex items-center gap-1.5 self-start rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingTimelineEventId === event.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      删除
                    </button>
                  </div>
                  {expanded && payloadText ? (
                    <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">{payloadText}</pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );

  const renderConfig = () => {
    const snapshot = detail?.task_config_snapshot;
    if (!snapshot) {
      return <SectionCard title="任务配置"><div className="text-sm text-slate-500">当前任务没有可展示的冻结配置。</div></SectionCard>;
    }
    return (
      <div className="space-y-4">
        <SectionCard title="基本配置" description="展示任务创建时冻结的任务级配置。">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="任务名" value={snapshot.name || '-'} />
            <MetricTile label="优先级" value={snapshot.priority} />
            <MetricTile label="模式" value={snapshot.mode_label || snapshot.mode || '-'} tone="violet" />
            <MetricTile label="引擎" value={snapshot.engine || '-'} tone="blue" />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">描述</div>
              <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-700">{snapshot.description || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">标签</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{snapshot.tags.length ? snapshot.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-black text-slate-700">{tag}</span>) : <span className="text-sm text-slate-500">-</span>}</div>
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="模型配置">
            <div className="grid gap-2.5 md:grid-cols-2">
              <MetricTile label="Provider Key" value={snapshot.llm_provider_key || '-'} tone="blue" />
              <MetricTile label="模型" value={snapshot.llm_provider_model || '-'} tone="blue" />
              <MetricTile label="显示名" value={snapshot.llm_provider_display_name || '-'} />
              <MetricTile label="Provider Type" value={snapshot.llm_provider_type || '-'} />
            </div>
          </SectionCard>
          <SectionCard title="执行策略">
            <div className="grid gap-2.5 md:grid-cols-2">
              <MetricTile label="并发" value={snapshot.concurrency || '-'} tone="violet" />
              <MetricTile label="超时秒数" value={snapshot.agent_run_timeout_seconds || '-'} tone="amber" />
              <MetricTile label="超时重试" value={snapshot.agent_timeout_retry_enabled ? '开启' : '关闭'} tone="amber" />
              <MetricTile label="最大超时重试" value={snapshot.agent_timeout_max_retries || '-'} tone="amber" />
              <MetricTile label="缓存策略" value={snapshot.reuse_cache === false ? '不复用并覆盖' : '复用已有缓存'} tone="emerald" />
            </div>
          </SectionCard>
        </div>

        <SectionCard title="任务来源">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="来源类型" value={snapshot.origin_label || snapshot.task_origin_type || '-'} />
            <MetricTile label="父任务" value={snapshot.parent_task_id || '-'} />
            <MetricTile label="父任务类型" value={snapshot.parent_task_type || '-'} />
            <MetricTile label="父阶段" value={snapshot.parent_stage_name || '-'} />
          </div>
        </SectionCard>

        <SectionCard title="输入配置" description={`当前任务共包含 ${snapshot.input_count} 个 ELF 输入。`}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/90 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">序号</th>
                  <th className="px-4 py-3">ELF</th>
                  <th className="px-4 py-3">Output Subdir</th>
                  <th className="px-4 py-3">函数白名单</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {snapshot.input_items.map((item) => (
                  <tr key={item.item_id}>
                    <td className="px-3 py-2.5 text-sm font-black text-slate-900">#{item.sequence_no}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-semibold text-slate-900">{fileNameOf(item.source_elf_path || item.elf_path)}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={item.source_elf_path || item.elf_path}>{item.source_elf_path || item.elf_path}</div>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{item.output_subdir || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{item.file_list.length ? `${item.file_list.length} 项` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    );
  };

  const renderSessions = () => (
    <SectionCard
      title="智能体会话"
      description="参考系统分析任务详情页的查看方式，按会话索引 + 右侧统一预览展示 B2S 智能体会话。"
      right={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" title="刷新会话">
            <RefreshCw size={14} />
          </button>
          <span className={`rounded-xl px-3 py-2 text-xs font-black ${sessionLive ? 'bg-emerald-50 text-emerald-700' : isTaskRunning ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            {sessionLive ? 'WebSocket 实时中' : isTaskRunning ? '等待实时连接' : '历史会话'}
          </span>
        </div>
      }
    >
      {!sessions ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载会话索引中...</div>
      ) : filteredSessionNodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前任务未生成智能体会话。快速模式或尚未进入深度阶段时会出现这个状态。</div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div>
                <div className="mt-1 text-xs text-slate-500">{filteredSessionNodes.length} 个会话文件</div>
              </div>
              <button type="button" onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="刷新会话">
                <RefreshCw size={14} className={selectedSessionLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {sessionError && activeTab === 'session' ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                {sessionError}
              </div>
            ) : null}

            <WarningListPanel
              title="索引生成提示"
              items={sessions.warnings?.slice(0, 5) || []}
              className="mt-4 text-xs"
            />

            <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
              {groupedSessionNodes.map(([group, nodes]) => (
                <div key={group}>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {sessionGroupLabel(group)}
                  </div>
                  <div className="space-y-2">
                    {nodes.map((node) => {
                      const selected = node.node_id === selectedSessionNodeId;
                      return (
                        <button
                          key={node.node_id}
                          type="button"
                          onClick={() => setSelectedSessionNodeId(node.node_id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black">{node.agent || node.role || fileNameOf(node.relative_path)}</div>
                              <div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                {node.relative_path}
                              </div>
                            </div>
                            <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              node.is_active
                                ? selected
                                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : selected
                                  ? 'border-slate-500 bg-slate-800 text-slate-100'
                                  : 'border-slate-200 bg-white text-slate-500'
                            }`}>
                              {node.is_active ? '活跃' : '历史'}
                            </span>
                          </div>
                          <div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                            <span>{node.stage || '-'}</span>
                            <span>{node.run_name || '-'}</span>
                            <span>更新时间 {formatSessionUpdatedAt(node.updated_at)}</span>
                          </div>
                          <div className={`mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold ${selected ? 'text-slate-200' : 'text-slate-600'}`}>
                            {node.batch_no ? <span>Batch {node.batch_no}</span> : null}
                            {node.attempt_no ? <span>第 {node.attempt_no} 轮</span> : null}
                            {node.role ? <span>{node.role}</span> : null}
                            {node.section ? <span>{node.section}</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="space-y-4">
            <B2SSessionPreview
              name={fileNameOf(selectedSessionNode?.relative_path)}
              content={selectedSessionContent}
              loading={selectedSessionLoading}
              emptyHint="请选择左侧会话"
              meta={selectedSessionNode ? {
                displayName: selectedSessionNode.agent || selectedSessionNode.role || fileNameOf(selectedSessionNode.relative_path),
                relativePath: selectedSessionNode.relative_path,
                sessionId: selectedSessionNode.node_id,
                startedAt: selectedSessionNode.updated_at || null,
                workingDir: selectedSessionNode.full_path || null,
                live: sessionLive,
                stats: [
                  `Item #${selectedSessionNode.sequence_no} ${selectedSessionNode.item_name}`,
                  selectedSessionNode.stage || '-',
                  selectedSessionNode.run_name || '-',
                  selectedSessionNode.role || 'session',
                ],
              } : undefined}
            />
          </div>
        </section>
      )}
    </SectionCard>
  );

  const renderRelationship = () => (
    <SectionCard
      title="智能体关系"
      description="展示 item、run、batch、review 与 agent 会话之间的关联。"
      right={<button type="button" onClick={() => void loadRelationship()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">刷新关系图</button>}
    >
      {!relationship ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载关系图中...</div>
      ) : relationshipNodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前任务未生成可展示的智能体关系数据。</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2.5 md:grid-cols-4">
            <MetricTile label="节点" value={relationshipNodes.length} tone="blue" icon={<Waypoints size={18} />} />
            <MetricTile label="边" value={relationshipEdges.length} tone="violet" icon={<Link2 size={18} />} />
            <MetricTile label="Agent 节点" value={relationshipNodes.filter((node) => node.node_type === 'agent').length} tone="emerald" icon={<Bot size={18} />} />
            <MetricTile label="Batch/Review" value={`${relationshipNodes.filter((node) => node.node_type === 'batch').length}/${relationshipNodes.filter((node) => node.node_type === 'review').length}`} tone="slate" icon={<Network size={18} />} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.entries(relationshipNodes.reduce<Record<string, typeof relationshipNodes>>((acc, node) => {
              const key = node.node_type;
              acc[key] = acc[key] || [];
              acc[key].push(node);
              return acc;
            }, {})).map(([group, nodes]) => (
              <div key={group} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{group}</div>
                <div className="space-y-1.5">
                  {nodes.slice(0, 24).map((node) => {
                    const relatedEdges = relationshipEdges.filter((edge) => edge.source_node_id === node.node_id || edge.target_node_id === node.node_id);
                    return (
                      <button
                        key={node.node_id}
                        type="button"
                        onClick={() => {
                          if (node.relative_path) {
                            focusSession({
                              itemId: node.item_id,
                              relativePath: node.relative_path,
                              fullPath: node.full_path,
                            });
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900">{node.title}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">{node.subtitle || '-'} · 关联 {relatedEdges.length}</div>
                          </div>
                          {node.node_type === 'agent' ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">会话</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );

  const renderResult = () => (
    <div className="space-y-4">
      <SectionCard
        title="结果摘要"
        description="任务级汇总和当前 item 的关键产物。"
        right={selectedItem && onOpenAdvanced ? (
          <button
            type="button"
            onClick={() => {
              saveExecutionReturnContext({ view: 'pentest-exec-b2s-detail', b2sTaskId: taskId });
              onOpenAdvanced(selectedItem.id);
            }}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
          >
            查看高级视图
          </button>
        ) : null}
      >
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile label="成功" value={resultSummary?.success_items || 0} tone="emerald" icon={<CheckCircle2 size={18} />} />
          <MetricTile label="部分成功" value={resultSummary?.partial_items || 0} tone="violet" icon={<Sparkles size={18} />} />
          <MetricTile label="失败" value={resultSummary?.failed_items || 0} tone="rose" icon={<AlertTriangle size={18} />} />
          <MetricTile label="结果文件" value={resultSummary?.result_file_count || 0} tone="blue" icon={<FileCode2 size={18} />} />
          <MetricTile label="会话/评审" value={`${resultSummary?.session_file_count || 0}/${resultSummary?.review_round_count || 0}`} tone="slate" icon={<GitBranch size={18} />} />
        </div>
      </SectionCard>

      {selectedItem ? (
        <SectionCard title={`当前 Item 结果 · #${selectedItem.sequence_no} ${fileNameOf(selectedItem.elf_path)}`} description={`状态 ${selectedItem.status} · Verdict ${selectedItemResultSummary?.final_verdict_label || selectedItemResultSummary?.final_verdict || '-'}`}>
          {selectedItem.status === 'failed' || selectedItem.error_reason ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 font-black">
                  <AlertTriangle size={16} />
                  失败原因
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
                  <span className="rounded-full bg-white px-2 py-0.5 text-rose-700 ring-1 ring-rose-100">类型：{selectedItem.failure_type || '-'}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-rose-700 ring-1 ring-rose-100">阶段：{selectedItem.phase_label || selectedItem.phase || '-'}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-rose-700 ring-1 ring-rose-100">pi job：{selectedItem.pi_job_id || '-'}</span>
                </div>
              </div>
              <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
                <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-rose-100">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-400">Error</div>
                  <div className="mt-1 break-words font-semibold">{compactText(selectedItem.error_reason || selectedItem.phase_message, '无详细错误信息')}</div>
                </div>
                <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-rose-100">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-400">定位建议</div>
                  <div className="mt-1 font-semibold">{failureSuggestion(selectedItem)}</div>
                  {selectedItem.pi_worker_url ? <div className="mt-1 truncate text-[11px] text-rose-500" title={selectedItem.pi_worker_url}>Worker: {selectedItem.pi_worker_url}</div> : null}
                </div>
              </div>
            </div>
          ) : null}
          {!itemArtifacts ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载结果文件中...</div>
          ) : itemArtifacts.artifacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前 item 还没有可展示的结果文件。</div>
          ) : (
            <div className="grid min-h-[600px] grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="border-b border-slate-200 bg-slate-50/80 xl:border-b-0 xl:border-r">
                <div className="max-h-[600px] overflow-auto p-2.5">
                  {itemArtifacts.artifacts.map((artifact) => {
                    const active = selectedArtifactId === artifact.id;
                    return (
                      <button key={artifact.id} type="button" onClick={() => setSelectedArtifactId(artifact.id)} className={`mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'}`}>
                        <div className="truncate text-sm font-black">{artifact.name}</div>
                        <div className={`mt-0.5 truncate text-[10px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>{artifact.stage || artifact.kind} · {artifact.section || '-'}</div>
                      </button>
                    );
                  })}
                </div>
              </aside>
              <div className="min-h-[600px] bg-slate-950">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5 text-sm font-black text-slate-100">
                  <div className="truncate">{selectedArtifact?.name || '请选择左侧文件'}</div>
                  {selectedArtifact ? (
                    <button
                      type="button"
                      onClick={() => setPreviewDialog({ title: selectedArtifact.name, subtitle: selectedArtifact.path, content: artifactContent, language: languageFromName(selectedArtifact.name), loading: artifactLoading })}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      弹窗查看
                    </button>
                  ) : null}
                </div>
                <div className="h-[546px]">
                  {selectedArtifact ? (
                    artifactLoading ? (
                      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />加载文件中...</div>
                    ) : selectedArtifact.name.toLowerCase().endsWith('.jsonl') ? (
                      <B2SSessionPreview name={selectedArtifact.name} content={artifactContent} />
                    ) : (
                      <Editor
                        height="100%"
                        language={languageFromName(selectedArtifact.name)}
                        value={artifactContent}
                        theme="vs-dark"
                        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true }}
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">请选择左侧文件</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="按 Item 查看结果" description="请先通过顶部 ELF Item 选择器切到某个 item。">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前处于任务级汇总视角。切换到具体 item 后会展示源码、头文件、中间产物、评审文件和会话文件。</div>
        </SectionCard>
      )}
    </div>
  );

  const renderObservability = () => (
    <div className="space-y-4">
      <SectionCard title="观测摘要" description="任务级聚合的运行效率、评审质量和过程质量。">
        {!observabilitySummary ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载观测指标中...</div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm font-black text-slate-800">
              轮次/均分/残留&nbsp;&nbsp;{summaryLine}
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="总耗时" value={formatDurationMs(observabilitySummary.total_duration_ms)} tone="slate" icon={<Clock3 size={18} />} />
              <MetricTile label="Batch" value={`${observabilitySummary.total_batches}/${observabilitySummary.avg_batches_per_item}`} tone="violet" icon={<Layers3 size={18} />} />
              <MetricTile label="评审" value={`${observabilitySummary.total_review_attempts}/${observabilitySummary.avg_review_attempts}`} tone="emerald" icon={<GitBranch size={18} />} />
              <MetricTile label="问题" value={`${observabilitySummary.issue_total}/${observabilitySummary.issue_remaining}`} tone="amber" icon={<AlertTriangle size={18} />} />
            </div>
            <div className="mt-2.5 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="函数完成率" value={`${observabilitySummary.completed_functions}/${observabilitySummary.total_functions}`} tone="blue" icon={<FileCode2 size={18} />} />
              <MetricTile label="字节完成率" value={`${formatBytes(observabilitySummary.completed_bytes)}/${formatBytes(observabilitySummary.total_bytes)}`} tone="blue" icon={<FileText size={18} />} />
              <MetricTile label="平均置信度" value={observabilitySummary.avg_confidence} tone="emerald" icon={<Gauge size={18} />} />
              <MetricTile label="平均质量分" value={observabilitySummary.avg_quality_score} tone="emerald" icon={<Sparkles size={18} />} />
            </div>
          </>
        )}
      </SectionCard>

      {selectedItem ? (
        <SectionCard title={`Item 观测明细 · #${selectedItem.sequence_no} ${fileNameOf(selectedItem.elf_path)}`} description="直接复用现有评审效果面板。">
          {itemAnalytics ? <ReviewEffectivenessPanel analytics={itemAnalytics} /> : <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载 item 观测中...</div>}
        </SectionCard>
      ) : (
        <SectionCard title="按 Item 查看观测" description="切换到具体 item 后可查看完整评审效果面板。">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">当前处于任务级汇总视角。切换到具体 item 后可查看该 item 的逐轮评审指标、维度评分与问题收敛情况。</div>
        </SectionCard>
      )}
    </div>
  );

  return (
    <div className="space-y-4 px-6 pb-8 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button type="button" onClick={handleBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回二进制逆向'}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadDetail()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
          {detail && !B2S_TERMINAL_STATUSES.has(detail.status) ? (
            <button type="button" onClick={() => void cancelTask()} disabled={cancelling} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-60">
              <XCircle size={16} />
              {cancelling ? '取消中...' : '取消任务'}
            </button>
          ) : null}
          <button type="button" onClick={() => void rerunTask()} disabled={rerunning} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-bold text-violet-700 shadow-sm hover:bg-violet-100 disabled:opacity-60">
            <RotateCcw size={16} />
            {rerunning ? '重跑中...' : '从头重跑'}
          </button>
          <button type="button" onClick={() => void deleteTask()} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 disabled:opacity-60">
            <Trash2 size={16} />
            {deleting ? '删除中...' : '删除任务'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        {loading && !detail ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载中...</div>
        ) : detail ? (
          <>
            <div className="bg-[radial-gradient(circle_at_top_left,#eff6ff_0,#ffffff_42%,#f8fafc_100%)] p-3.5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <B2SStatusBadge status={detail.status} />
                    {detail.mode_label ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 ring-1 ring-indigo-200"><Sparkles size={13} />{detail.mode_label}</span> : null}
                  </div>
                  <h1 className="mt-1.5 break-words text-[1.5rem] font-black leading-tight tracking-tight text-slate-950">{detail.name || detail.id}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span className="font-mono">任务 ID：{detail.id}</span>
                    <span>创建：{formatDateTime(detail.created_at)}</span>
                    <span>更新：{formatDateTime(detail.updated_at)}</span>
                  </div>
                  <div className="mt-2.5 rounded-[1.25rem] border border-white/80 bg-white/75 p-2.5 shadow-sm backdrop-blur">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">任务进度</div>
                        <div className="mt-0.5 text-[1.6rem] font-black tracking-tight text-slate-950">{pct(primaryProgress).toFixed(1)}%</div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">{progressBasisLabel} · ELF 完成 {overall?.completed_items || 0}/{overall?.total_items || detail.total_items || 0}</div>
                      </div>
                      <div className="text-right text-[11px] font-bold text-slate-500">{progressBasisLabel}</div>
                    </div>
                    <div className="mt-2.5">
                      <B2SProgressBar value={primaryProgress} tone={B2S_TERMINAL_STATUSES.has(detail.status) ? 'emerald' : 'blue'} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600">
                      <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">运行中：<span className="font-black text-slate-800">{detail.running_items}</span></div>
                      <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">ELF：<span className="font-black text-slate-800">{detail.total_items}</span></div>
                      <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">会话：<span className="font-black text-slate-800">{detail.agent_runtime_summary?.total_sessions || 0}</span></div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <TaskOriginCard origin={detail} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3">
              <div className="grid gap-2.5 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ELF Item 选择器</div>
                  <select
                    value={selectedItemId}
                    onChange={(event) => {
                      setSelectedItemId(event.target.value as ItemFilter);
                      setItemArtifacts(null);
                      setSelectedArtifactId('');
                      setItemAnalytics(null);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
                  >
                    <option value="__all__">全部汇总</option>
                    {detail.items.map((item) => (
                      <option key={item.id} value={item.id}>{`#${item.sequence_no} ${fileNameOf(item.elf_path)}`}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'overview' as DetailTab, label: '总览', icon: <Gauge size={14} /> },
                    { id: 'run-config' as DetailTab, label: '任务配置', icon: <Settings2 size={14} /> },
                    { id: 'timeline' as DetailTab, label: '事件时间线', icon: <Clock3 size={14} /> },
                    { id: 'session' as DetailTab, label: '智能体会话', icon: <Bot size={14} /> },
                    { id: 'relationship' as DetailTab, label: '智能体关系', icon: <Waypoints size={14} /> },
                    { id: 'result' as DetailTab, label: '结果', icon: <FileJson2 size={14} /> },
                    { id: 'evaluation' as DetailTab, label: '观测指标', icon: <Gauge size={14} /> },
                  ].map((tab) => (
                    <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-black transition ${tabButtonTone(activeTab === tab.id)}`}>
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {detail && !B2S_TERMINAL_STATUSES.has(detail.status) ? (
                <div className="mt-2.5 border-t border-slate-200 pt-2.5">
                  <DownstreamTaskCreator projectId={projectId} task={detail} sourceKind="binary_to_source" />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      {detail ? (
        activeTab === 'overview' ? renderOverview()
          : activeTab === 'run-config' ? renderConfig()
            : activeTab === 'timeline' ? renderTimeline()
              : activeTab === 'session' ? renderSessions()
                : activeTab === 'relationship' ? renderRelationship()
                  : activeTab === 'result' ? renderResult()
                    : renderObservability()
      ) : null}

      {previewDialog ? (
        <FilePreviewDialog
          title={previewDialog.title}
          subtitle={previewDialog.subtitle}
          content={previewDialog.content}
          language={previewDialog.language}
          loading={previewDialog.loading}
          onClose={() => setPreviewDialog(null)}
        />
      ) : null}
    </div>
  );
};
