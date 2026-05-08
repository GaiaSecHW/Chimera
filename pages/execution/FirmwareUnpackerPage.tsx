import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Clock,
  FolderOpen, Loader2, Package, Play, RefreshCw,
  Square, Trash2, XCircle, ListTodo, RotateCcw, Search, X, Plus, Terminal, Sparkles,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import { FirmwareTaskEvent, FirmwareTaskLog, FirmwareTaskProgress, FirmwareTaskResourceUsage, FirmwareTaskResult, FirmwareUnpackTask, TaskListQuery } from '../../clients/firmwareUnpacker';
import { AppSaSessionEvent, AppSaSessionMeta, AppSaSessionSnapshot, SecurityProject } from '../../types/types';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnContext, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard, TaskOriginInline } from './taskOrigin';
import { AgentSessionViewer } from './AgentSessionViewer';
import { blobToText, buildFirmwareSessionMeta, buildSessionSnapshotFromText, FirmwareSessionIndexItem, normalizeFirmwareSessionIndex, parseSessionJsonlDelta } from './sessionParsing';

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

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  const relative = relativePath.replace(/^\/+/, '');
  return `${base}/${relative}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function resultEntryKindLabel(kind: string | null | undefined): string {
  return String(kind || '').toLowerCase() === 'dir' ? '目录' : '文件';
}

function inferTimelineTone(event: FirmwareTaskEvent) {
  return {
    icon: Sparkles,
    line: 'from-sky-200 via-blue-300 to-cyan-100',
    node: 'border-sky-200 bg-sky-50 text-sky-700',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    glow: 'shadow-sky-100/80',
  };
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

function phaseDisplayLabel(phaseKey: string | null | undefined) {
  const mapping: Record<string, string> = {
    preprocess: '预处理',
    tool_match: '工具匹配执行',
    llm_unpack: 'LLM 解包',
    llm_review: 'LLM 评审',
    llm_cleanup: 'LLM 清理',
  };
  return mapping[String(phaseKey || '')] || String(phaseKey || '任务');
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
  logModalOpen,
  logModalTitle,
  logModalPhase,
  taskLog,
  taskLogLoading,
  onOpenPhaseLog,
  onCloseLogModal,
  deletingTaskId,
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
  logModalOpen: boolean;
  logModalTitle: string;
  logModalPhase: string;
  taskLog: FirmwareTaskLog | null;
  taskLogLoading: boolean;
  onOpenPhaseLog: (taskId: string, phaseKey: string, phaseLabel: string) => void;
  onCloseLogModal: () => void;
  deletingTaskId: string;
  onBack: () => void;
  onRefresh: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const fileserverApi = api.domains.assets.fileserver;
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'session' | 'result'>('overview');
  const [activeResultDoc, setActiveResultDoc] = useState<'summary' | 'reason'>('summary');
  const [timeline, setTimeline] = useState<FirmwareTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [result, setResult] = useState<FirmwareTaskResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState('');
  const [sessionItems, setSessionItems] = useState<FirmwareSessionIndexItem[]>([]);
  const [sessions, setSessions] = useState<AppSaSessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const sessionSocketRef = useRef<WebSocket | null>(null);

  const closeSessionSocket = useCallback(() => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  }, []);

  const loadTimeline = useCallback(async () => {
    if (!task?.id) return;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const res = await fwApi.getTaskEvents(task.id, 200);
      setTimeline(res.items || []);
    } catch (e: any) {
      setTimeline([]);
      setTimelineError(e?.message || '加载事件失败');
    } finally {
      setTimelineLoading(false);
    }
  }, [task?.id]);

  const loadResult = useCallback(async () => {
    if (!task?.id) return;
    setResultLoading(true);
    setResultError('');
    try {
      const res = await fwApi.getTaskResult(task.id);
      setResult(res);
    } catch (e: any) {
      setResult(null);
      setResultError(e?.message || '加载结果失败');
    } finally {
      setResultLoading(false);
    }
  }, [task?.id]);

  const sessionIndexFsPath = useMemo(() => {
    if (!task?.output_path || !task?.project_id) return null;
    const runPath = deriveRunPath(task.output_path);
    if (!runPath) return null;
    return extractFsRelPath(`${runPath}/sessions/index.json`, task.project_id);
  }, [task?.output_path, task?.project_id]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, AppSaSessionMeta[]>();
    sessions.forEach((item) => {
      const list = groups.get(item.stage_group || '未分类') || [];
      list.push(item);
      groups.set(item.stage_group || '未分类', list);
    });
    return Array.from(groups.entries());
  }, [sessions]);

  const selectedSessionMeta = useMemo(
    () => sessions.find((item) => item.relative_path === selectedSessionPath) || null,
    [sessions, selectedSessionPath],
  );

  const selectedSessionItem = useMemo(
    () => sessionItems.find((item) => item.session_file === selectedSessionPath) || null,
    [sessionItems, selectedSessionPath],
  );

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!sessionIndexFsPath || !task?.project_id) {
      setSessionItems([]);
      setSessions([]);
      setSelectedSessionPath(null);
      setSessionsError('');
      return;
    }
    if (!options?.silent) {
      setSessionsLoading(true);
      setSessionsError('');
    }
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(task.project_id, sessionIndexFsPath);
      const content = await blobToText(blob);
      const parsed = normalizeFirmwareSessionIndex(JSON.parse(content));
      const nextItems = parsed.items;
      const nextSessions = nextItems.map(buildFirmwareSessionMeta);
      setSessionItems(nextItems);
      setSessions(nextSessions);
      setSelectedSessionPath((current) => {
        if (current && nextItems.some((item) => item.session_file === current)) return current;
        const active = nextItems.find((item) => item.status === 'running');
        return active?.session_file || nextItems[0]?.session_file || null;
      });
    } catch (e: any) {
      const message = e?.message || String(e);
      if (/404/.test(message)) {
        setSessionItems([]);
        setSessions([]);
        setSelectedSessionPath(null);
        setSessionsError('');
      } else {
        setSessionsError(message || '加载会话失败');
      }
    } finally {
      if (!options?.silent) setSessionsLoading(false);
    }
  }, [fileserverApi, sessionIndexFsPath, task?.project_id]);

  const loadSessionFile = useCallback(async (sessionFile: string) => {
    if (!task?.project_id || !task?.output_path || !sessionFile) return;
    const runPath = deriveRunPath(task.output_path);
    const fsPath = extractFsRelPath(`${runPath}/sessions/${sessionFile}`, task.project_id);
    if (!fsPath) {
      setSessionError('当前会话路径不在 fileserver 项目目录下');
      return;
    }
    setSessionLoading(true);
    setSessionError('');
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(task.project_id, fsPath);
      const content = await blobToText(blob);
      const snapshot = buildSessionSnapshotFromText(sessionFile, content);
      setSessionSnapshot(snapshot);
      setSessionEvents(snapshot.events || []);
      setSessionWarnings(snapshot.warnings || []);
      setSessionWatchStartLine(snapshot.line_count || 0);
    } catch (e: any) {
      setSessionSnapshot(null);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionWatchStartLine(0);
      setSessionError(e?.message || '加载会话内容失败');
    } finally {
      setSessionLoading(false);
    }
  }, [fileserverApi, task?.output_path, task?.project_id]);

  useEffect(() => {
    setActiveTab('overview');
    setTimeline([]);
    setTimelineError('');
    setTimelineLoading(false);
    setResult(null);
    setResultError('');
    setActiveResultDoc('summary');
    setSessionItems([]);
    setSessions([]);
    setSelectedSessionPath(null);
    setSessionSnapshot(null);
    setSessionEvents([]);
    setSessionWarnings([]);
    setSessionError('');
    closeSessionSocket();
  }, [closeSessionSocket, task?.id]);

  useEffect(() => {
    if (activeTab !== 'events' || !task?.id) return;
    void loadTimeline();
  }, [activeTab, loadTimeline, task?.id]);

  useEffect(() => {
    if (activeTab !== 'result' || !task?.id) return;
    void loadResult();
  }, [activeTab, loadResult, task?.id]);

  useEffect(() => {
    if (activeTab !== 'session') {
      closeSessionSocket();
      return;
    }
    void loadSessions();
  }, [activeTab, closeSessionSocket, loadSessions]);

  useEffect(() => {
    if (activeTab !== 'session') return;
    if (!task || !['pending', 'running', 'cancelling'].includes(task.status)) return;
    const timer = window.setInterval(() => void loadSessions({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadSessions, task]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath) {
      if (activeTab !== 'session') {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
        setSessionError('');
      }
      return;
    }
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, closeSessionSocket, loadSessionFile, selectedSessionPath]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath || !selectedSessionItem || !task?.project_id || !task?.output_path) return;
    if (selectedSessionItem.status !== 'running' || !['pending', 'running', 'cancelling'].includes(task.status)) {
      setSessionLive(false);
      return;
    }
    const sessionAbsPath = normalizeJoinPath(`${deriveRunPath(task.output_path)}/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(sessionAbsPath, task.project_id);
    if (!watchPath) {
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(task.project_id, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: sessionWatchStartLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => setSessionLive(true);
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
          const parsed = parseSessionJsonlDelta(deltaLines, (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length > 0) setSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length > 0) {
            setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          setSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setSessionWatchStartLine(message.to_line ?? sessionWatchStartLine);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setSessionLive(false);
            setSessionError('会话文件已重置，正在重新加载');
            void loadSessionFile(selectedSessionPath);
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
        setSessionError(e?.message || String(e));
      }
    };
    socket.onerror = () => setSessionLive(false);
    socket.onclose = () => setSessionLive(false);
    return () => {
      if (sessionSocketRef.current === socket) closeSessionSocket();
      else socket.close();
    };
  }, [
    activeTab,
    closeSessionSocket,
    fileserverApi,
    loadSessionFile,
    selectedSessionItem,
    selectedSessionPath,
    sessionWatchStartLine,
    task,
  ]);

  const timelineItems = useMemo(() => {
    const events = timeline.slice(-80);
    return events.map((event, index) => ({
      ...event,
      _key: event.id || `${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: index + 1,
      _tone: inferTimelineTone(event),
    }));
  }, [timeline]);

  const resultDocumentState = useMemo(() => {
    const hasSummary = Boolean(result?.summary_text);
    const hasReason = Boolean(result?.reason_text);
    const selectedDoc = activeResultDoc === 'reason' && hasReason
      ? 'reason'
      : hasSummary
        ? 'summary'
        : hasReason
          ? 'reason'
          : activeResultDoc;
    const selectedText = selectedDoc === 'reason' ? (result?.reason_text || null) : (result?.summary_text || null);
    const selectedPath = selectedDoc === 'reason' ? (result?.reason_path || null) : (result?.summary_path || null);
    return {
      hasSummary,
      hasReason,
      selectedDoc,
      selectedText,
      selectedPath,
    };
  }, [activeResultDoc, result?.reason_path, result?.reason_text, result?.summary_path, result?.summary_text]);

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
            onClick={() => {
              onRefresh(task.id);
              if (activeTab === 'events') void loadTimeline();
              if (activeTab === 'result') void loadResult();
              if (activeTab === 'session') void loadSessions();
            }}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="刷新详情"
          >
            {loading || timelineLoading || resultLoading || sessionsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
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
              disabled={deletingTaskId === task.id}
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingTaskId === task.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} 删除
            </button>
          )}
        </div>
        <div className="mt-4">
          <TaskOriginCard origin={task} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'overview' as const, label: '总览' },
              { id: 'events' as const, label: '事件记录' },
              { id: 'session' as const, label: '智能体会话' },
              { id: 'result' as const, label: '结果' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'overview' ? (
          <>
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
                                <div className="mt-2 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => onOpenPhaseLog(task.id, phase.key, phase.label)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                                  >
                                    <Terminal size={11} /> 查看日志
                                  </button>
                                </div>
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
          </>
        ) : null}

        {activeTab === 'events' ? (
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">事件时间线</h2>
                <p className="mt-1 text-sm text-slate-500">按时间顺序展示后台记录的关键事件</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">总事件数</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{timeline.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">
                    {timelineItems.length > 0 ? `${fmtTime(timelineItems[0].created_at)} -> ${fmtTime(timelineItems[timelineItems.length - 1].created_at)}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              {timelineLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  加载事件时间线中...
                </div>
              ) : timelineError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  {timelineError}
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                  暂无事件
                </div>
              ) : (
                <div className="relative pl-2">
                  <div className="absolute bottom-0 left-[19px] top-0 w-px bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200" />
                  <div className="space-y-3">
                    {timelineItems.map((event) => {
                      const tone = event._tone;
                      const Icon = tone.icon;
                      return (
                        <div key={event._key} className="relative flex gap-4">
                          <div className="relative z-10 flex w-10 shrink-0 justify-center">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-2xl border shadow-lg ${tone.node} ${tone.glow}`}>
                              <Icon size={14} />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 pb-1">
                            <div className="rounded-[1.25rem] border bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                              <div className="flex items-center gap-3">
                                <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${tone.badge}`}>
                                      {event.event_type || 'event'}
                                    </span>
                                    {event.stage_key ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                        {event.stage_key}
                                      </span>
                                    ) : null}
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                      #{event._index}
                                    </span>
                                  </div>
                                  <div className="min-w-0 truncate text-sm font-black text-slate-900">
                                    {event.summary || '系统事件'}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-xs font-black text-slate-700">{fmtTime(event.created_at)}</div>
                                  <div className="text-[10px] text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString('zh-CN') : '-'}</div>
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span className={`inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br ${tone.line}`} />
                                <span>固件解包事件</span>
                                {event.created_by ? <span>· {event.created_by}</span> : null}
                                {event.owner_id ? <span>· {event.owner_id}</span> : null}
                              </div>

                              {event.detail && Object.keys(event.detail).length > 0 ? (
                                <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-700">
                                  {JSON.stringify(event.detail, null, 2)}
                                </pre>
                              ) : null}
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

        {activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div>
                  <div className="mt-1 text-xs text-slate-500">{sessionItems.length} 个会话文件</div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="刷新会话"
                >
                  <RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}
              {sessionsLoading && sessions.length === 0 ? (
                <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  加载会话中...
                </div>
              ) : sessions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  暂无智能体会话
                </div>
              ) : (
                <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
                  {groupedSessions.map(([group, items]) => (
                    <div key={group}>
                      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group}</div>
                      <div className="space-y-2">
                        {items.map((session) => {
                          const indexItem = sessionItems.find((item) => item.session_file === session.relative_path);
                          const selected = session.relative_path === selectedSessionPath;
                          return (
                            <button
                              key={session.relative_path}
                              type="button"
                              onClick={() => setSelectedSessionPath(session.relative_path)}
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? 'border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black">{session.display_name}</div>
                                  <div className={`mt-1 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {session.relative_path}
                                  </div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                                  indexItem?.status === 'running'
                                    ? selected ? 'bg-emerald-400/20 text-emerald-100' : 'bg-emerald-50 text-emerald-700'
                                    : selected ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
                                }`}>
                                  {indexItem?.status === 'running' ? '运行中' : '历史'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>

            <div className="space-y-4">
              {sessionWarnings.length > 0 ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm">
                  <div className="font-bold">会话文件存在部分异常行，已跳过不可解析内容</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                    {sessionWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <AgentSessionViewer
                sessionMeta={selectedSessionMeta}
                sessionHeader={sessionSnapshot?.session_meta}
                events={sessionEvents}
                loading={sessionLoading}
                live={sessionLive}
                error={sessionError || null}
              />
            </div>
          </section>
        ) : null}

        {activeTab === 'result' ? (
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出文件数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.output_file_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出目录数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.output_dir_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.output_total_size_bytes ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">顶层条目数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.top_level_entry_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最大文件大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.largest_file_size_bytes ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">平均文件大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.avg_file_size_bytes ?? 0)}</div>
              </div>
            </div>

            {resultLoading ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  加载结果中...
                </div>
              </section>
            ) : resultError ? (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
                {resultError}
              </section>
            ) : !result?.available ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                {result?.warnings?.[0] || '任务完成后可查看结果'}
              </section>
            ) : (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出结构</div>
                      <div className="mt-1 text-sm text-slate-500">按 output 顶层条目聚合结果分布</div>
                    </div>
                    <div className="text-xs text-slate-400">按大小降序</div>
                  </div>
                  {result.summary.top_level_entries.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      当前 output 目录为空
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-left text-sm text-slate-600">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                              <th className="px-3 py-2">名称</th>
                              <th className="px-3 py-2">类型</th>
                              <th className="px-3 py-2">文件数</th>
                              <th className="px-3 py-2">目录数</th>
                              <th className="px-3 py-2">总大小</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.summary.top_level_entries.slice(0, 8).map((entry) => (
                              <tr key={`${entry.kind}-${entry.name}`} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-mono text-xs text-slate-700">{entry.name || '-'}</td>
                                <td className="px-3 py-2">{resultEntryKindLabel(entry.kind)}</td>
                                <td className="px-3 py-2">{entry.file_count}</td>
                                <td className="px-3 py-2">{entry.dir_count}</td>
                                <td className="px-3 py-2 font-bold text-slate-800">{formatBytes(entry.total_size_bytes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {result.summary.top_level_entries.length > 8 ? (
                        <div className="mt-3 text-xs text-slate-500">
                          还有 {result.summary.top_level_entries.length - 8} 项未展开
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">文件画像</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">小文件 &lt; 4 KiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.small_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">中文件 4 KiB - 1 MiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.medium_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">大文件 ≥ 1 MiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.large_file_count}</div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div>
                          <div className="text-xs font-black text-slate-500">扩展名分布</div>
                          {result.summary.file_extension_breakdown.length === 0 ? (
                            <div className="mt-3 text-sm text-slate-500">暂无统计数据</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {result.summary.file_extension_breakdown.slice(0, 8).map((item) => (
                                <div key={item.extension} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                  <span className="font-mono text-slate-700">{item.extension}</span>
                                  <span className="text-slate-500">{item.file_count} 个</span>
                                  <span className="font-bold text-slate-800">{formatBytes(item.total_size_bytes)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-500">最大文件 Top 10</div>
                          {result.summary.largest_files.length === 0 ? (
                            <div className="mt-3 text-sm text-slate-500">暂无统计数据</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {result.summary.largest_files.map((item, index) => (
                                <div key={item.path} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-bold text-slate-500">#{index + 1}</span>
                                    <span className="font-bold text-slate-800">{formatBytes(item.size_bytes)}</span>
                                  </div>
                                  <div className="mt-1 break-all font-mono text-slate-700">{item.path}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">文本结果与关键路径</div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {[
                                {
                                  id: 'summary' as const,
                                  label: '报告总结',
                                  file: 'summary.txt',
                                  available: resultDocumentState.hasSummary,
                                },
                                {
                                  id: 'reason' as const,
                                  label: '改进总结',
                                  file: 'reason.txt',
                                  available: resultDocumentState.hasReason,
                                },
                              ].map((doc) => {
                                const selected = resultDocumentState.selectedDoc === doc.id;
                                return (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => setActiveResultDoc(doc.id)}
                                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                                      selected
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : doc.available
                                          ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                          : 'border-slate-200 bg-slate-100 text-slate-400'
                                    }`}
                                  >
                                    <div>{doc.label}</div>
                                    <div className={`mt-1 text-[10px] ${selected ? 'text-slate-300' : doc.available ? 'text-slate-500' : 'text-slate-400'}`}>
                                      {doc.file} · {doc.available ? '已生成' : '未生成'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {!resultDocumentState.hasSummary && !resultDocumentState.hasReason ? (
                              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                暂无结果文档
                              </div>
                            ) : !resultDocumentState.selectedText ? (
                              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                {resultDocumentState.selectedDoc === 'summary' ? '当前文档未生成' : '当前文档未生成'}
                              </div>
                            ) : (
                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                  {resultDocumentState.selectedDoc === 'summary' ? '报告总结' : '改进总结'}
                                </div>
                                <div className="mt-2 break-all font-mono text-[11px] text-slate-500">
                                  {resultDocumentState.selectedPath || '-'}
                                </div>
                                <div className="mt-4 prose prose-slate max-w-none text-sm">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultDocumentState.selectedText}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <aside className="space-y-3 text-xs text-slate-600">
                          <div>
                            <div className="font-bold text-slate-500">output_root</div>
                            <div className="mt-1 break-all font-mono">{result.output_root || '-'}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">run_root</div>
                            <div className="mt-1 break-all font-mono">{result.run_root || '-'}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">largest_file</div>
                            <div className="mt-1 break-all font-mono">{result.summary.largest_file_path || '-'}</div>
                            <div className="mt-1 text-slate-400">{formatBytes(result.summary.largest_file_size_bytes)}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">deepest_path</div>
                            <div className="mt-1 break-all font-mono">{result.summary.deepest_path?.path || '-'}</div>
                            <div className="mt-1 text-slate-400">depth: {result.summary.deepest_path?.depth ?? '-'}</div>
                          </div>
                        </aside>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">运行统计</div>
                      <div className="mt-4 space-y-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-3"><span>状态</span><span className="font-bold text-slate-800">{result.status}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>会话数</span><span className="font-bold text-slate-800">{result.summary.session_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>事件数</span><span className="font-bold text-slate-800">{result.summary.event_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>执行轮次</span><span className="font-bold text-slate-800">{result.summary.executor_rounds}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>耗时</span><span className="font-bold text-slate-800">{result.summary.duration_seconds == null ? '-' : `${result.summary.duration_seconds}s`}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>命中工具</span><span className="max-w-[180px] truncate font-bold text-slate-800">{result.summary.matched_skill || '-'}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>回退到 LLM</span><span className="font-bold text-slate-800">{result.summary.fallback_to_llm ? '是' : '否'}</span></div>
                      </div>
                    </div>

                    {result.warnings.length > 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">警告</div>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                          {result.warnings.map((warning, index) => (
                            <li key={`${warning}-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </aside>
                </section>
              </>
            )}
          </section>
        ) : null}
      </div>

      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Stage Log</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">{logModalTitle}</h3>
                <p className="mt-1 text-xs text-slate-500">阶段标识：<span className="font-mono text-slate-600">{logModalPhase || '-'}</span></p>
              </div>
              <button
                type="button"
                onClick={onCloseLogModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-auto px-6 py-5">
              {taskLogLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" /> 加载日志中...
                </div>
              ) : !taskLog?.available ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {taskLog?.message || '当前阶段日志不可用'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志目录</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{taskLog.run_path || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志文件</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{taskLog.files?.join(', ') || '-'}</p>
                    </div>
                  </div>
                  <pre className="min-h-[320px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-[12px] leading-6 text-slate-100 whitespace-pre-wrap break-words">{taskLog.log_text || taskLog.message || '暂无日志内容'}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
  const [deletingTaskId, setDeletingTaskId] = useState('');
  const [resourceUsage, setResourceUsage] = useState<FirmwareTaskResourceUsage | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [progress, setProgress] = useState<FirmwareTaskProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [taskLog, setTaskLog] = useState<FirmwareTaskLog | null>(null);
  const [taskLogLoading, setTaskLogLoading] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTitle, setLogModalTitle] = useState('');
  const [logModalPhase, setLogModalPhase] = useState('');

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
      setTaskLog(null);
      setTaskLogLoading(false);
      setLogModalOpen(false);
      setLogModalTitle('');
      setLogModalPhase('');
      return;
    }
    loadResourceUsage(activeTaskId);
    loadTaskProgress(activeTaskId);
  }, [activeTaskId, loadResourceUsage, loadTaskProgress]);

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
    setDeletingTaskId(id);
    try {
      await fwApi.deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeTaskId === id) {
        setActiveTaskId('');
        setDetailLoading(false);
        setResourceUsage(null);
        setResourceLoading(false);
        setProgress(null);
        setProgressLoading(false);
        setTaskLog(null);
        setTaskLogLoading(false);
        setLogModalOpen(false);
        setLogModalTitle('');
        setLogModalPhase('');
      }
      await fetchTasks(taskItems.length <= 1 && page > 0);
      notify('任务已删除', 'success');
    } catch (e: any) {
      notify(`删除失败: ${e?.message}`, 'error');
    } finally {
      setDeletingTaskId('');
    }
  }, [activeTaskId, fetchTasks, notify, page, taskItems]);

  const handleRetry = async (id: string) => {
    try {
      const result = await fwApi.retryTask(id);
      notify(`已重试，新任务 ID: ${result.new_task_id}`, 'success');
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(`重试失败: ${e?.message}`, 'error');
    }
  };

  const handleOpenPhaseLog = useCallback(async (taskId: string, phaseKey: string, phaseLabel: string) => {
    setLogModalTitle(`${phaseLabel} 日志`);
    setLogModalPhase(phaseKey);
    setTaskLog(null);
    setTaskLogLoading(true);
    setLogModalOpen(true);
    try {
      const next = await fwApi.getTaskLogs(taskId, phaseKey);
      setTaskLog(next);
    } catch (e: any) {
      setTaskLog({
        task_id: taskId,
        run_path: null,
        available: false,
        log_text: '',
        files: [],
        phase: phaseKey,
        message: e?.message || '加载阶段日志失败',
      });
    } finally {
      setTaskLogLoading(false);
    }
  }, []);

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
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  当前任务使用的 LLM 配置会在提交时从“执行 → 参数配置 → LLM Role Binding”读取并冻结，执行过程中不会再跟随后续配置变更。
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
          logModalOpen={logModalOpen}
          logModalTitle={logModalTitle}
          logModalPhase={logModalPhase}
          taskLog={taskLog}
          taskLogLoading={taskLogLoading}
          onOpenPhaseLog={handleOpenPhaseLog}
          onCloseLogModal={() => setLogModalOpen(false)}
          deletingTaskId={deletingTaskId}
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
