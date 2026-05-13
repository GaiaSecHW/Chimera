import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy,
  FolderOpen, Loader2, PlayCircle, RefreshCw, RotateCcw, Search, ScrollText,
  Trash2, XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  AppEaEvaluationRound,
  AppEaSessionEvent,
  AppEaSessionMeta,
  AppEaSessionSnapshot,
  AppEaStageEvent,
  AppEaTaskDetail,
  AppEaTaskEvaluation,
  AppEaTaskResult,
} from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  hasBinarySecurityReturnTarget,
  navigateBackByTaskOrigin,
  navigateBackToBinarySecurityTask,
} from '../../utils/executionReturnContext';
import { AgentSessionViewer } from './AgentSessionViewer';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { blobToText, buildSessionSnapshotFromText } from './sessionParsing';
import { TaskOriginCard } from './taskOrigin';

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

const STAGE_STEPS = [
  { key: 'init', label: '模块加载', desc: '扫描目标路径，加载模块文件', triggers: ['task_start', 'module_load', 'task_resume'], artifactSubpath: 'run' },
  { key: 'analyse', label: '入口分析', desc: 'Worker 分析入口点并生成候选结果', triggers: ['round_start', 'worker_start', 'master_worker_start'], artifactSubpath: 'run/sessions' },
  { key: 'judge', label: '裁判综合', desc: 'Judge 评审 Worker 输出并投票', triggers: ['judge_start', 'judge_eval', 'judge_end'], artifactSubpath: 'run' },
  { key: 'finish', label: '生成结果', desc: '输出 Markdown、functions.list 与运行报告', triggers: ['round_end', 'task_end'], artifactSubpath: 'output' },
];

type DetailTab = 'overview' | 'session' | 'result' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatLiveDuration(startedAt?: string | null, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const secs = Math.max(0, nowSecs - Math.floor(new Date(startedAt).getTime() / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatNumber(value: unknown, digits = 0): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatCost(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(4)}` : '-';
}

function formatRate(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num * 100)}%` : '-';
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

function stageLabel(stage: string | undefined): string {
  const labels: Record<string, string> = {
    init: '模块加载',
    analyse: '入口分析',
    judge: '裁判综合',
    finish: '生成结果',
  };
  return labels[stage || ''] || stage || '-';
}

function evaluationStatusTone(status?: string) {
  if (status === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'skipped') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function evaluationRoundKey(round: AppEaEvaluationRound): string {
  return [
    round.round ?? '',
    round.stage_round ?? '',
    round.stage ?? '',
    round.module_name ?? '',
    round.source_path ?? '',
  ].join('::');
}

function extractFsRelPath(path: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: fsPath } }));
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  return `${basePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function parseParts(content: unknown): Array<Record<string, any>> {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  return content.map((item) => {
    const part = item && typeof item === 'object' ? item as Record<string, any> : {};
    if (part.type === 'text') return { type: 'text', text: part.text || '' };
    if (part.type === 'thinking') return { type: 'thinking', text: part.thinking || '' };
    if (part.type === 'toolCall') return { type: 'toolCall', name: part.name || '', id: part.id || '', arguments: part.arguments || {} };
    if (part.type === 'toolResult') return { type: 'toolResult', text: part.text || '' };
    return { type: 'unknown', detail: JSON.stringify(part).slice(0, 200) };
  });
}

function parseSessionDelta(lines: string[], startLine: number): { events: AppEaSessionEvent[]; warnings: string[]; sessionMeta: Record<string, any> | null } {
  const events: AppEaSessionEvent[] = [];
  const warnings: string[] = [];
  let sessionMeta: Record<string, any> | null = null;
  lines.forEach((raw, index) => {
    const lineNo = startLine + index;
    const line = String(raw || '').trim();
    if (!line) return;
    let obj: Record<string, any>;
    try {
      obj = JSON.parse(line);
    } catch {
      warnings.push(`第 ${lineNo} 行 JSON 解析失败`);
      events.push({ type: 'raw', line: lineNo, event_index: lineNo, raw_line: line.slice(0, 200), summary: line.slice(0, 200) });
      return;
    }
    if (obj.type === 'session') {
      sessionMeta = { id: obj.id || '', version: obj.version || '', timestamp: obj.timestamp || '', cwd: obj.cwd || '' };
      return;
    }
    if (obj.type === 'model_change') {
      events.push({ type: 'model_change', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', provider: obj.provider || '', modelId: obj.modelId || '', raw_line: line });
      return;
    }
    if (obj.type === 'thinking_level_change') {
      events.push({ type: 'thinking_level_change', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', thinkingLevel: obj.thinkingLevel || '', thinkingLevelClass: `thinking-${obj.thinkingLevel || 'off'}`, raw_line: line });
      return;
    }
    if (obj.type === 'message') {
      const msg = obj.message && typeof obj.message === 'object' ? obj.message : {};
      const role = String(msg.role || '');
      const eventData: AppEaSessionEvent = { type: 'message', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', role, render_role: role, parts: parseParts(msg.content || []), raw_line: line };
      if (role === 'toolResult') {
        eventData.toolCallId = msg.toolCallId || msg.tool_call_id || '';
        eventData.toolName = msg.toolName || msg.tool_name || '';
        eventData.isError = Boolean(msg.isError || msg.is_error);
      }
      events.push(eventData);
      return;
    }
    events.push({ type: String(obj.type || 'unknown_event'), line: lineNo, event_index: lineNo, display_timestamp: obj.timestamp || '', raw_line: line, summary: JSON.stringify(obj).slice(0, 200) });
  });
  return { events, warnings, sessionMeta };
}

function deriveStepStatuses(taskStatus: string, events: AppEaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');
  let last = -1;
  for (const evt of events) {
    STAGE_STEPS.forEach((step, index) => {
      if (step.triggers.includes(evt.type)) last = Math.max(last, index);
    });
  }
  if (last < 0) {
    statuses[0] = taskStatus === 'running' ? 'running' : ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'pending';
    return statuses;
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (i < last) statuses[i] = 'completed';
    if (i === last) statuses[i] = ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'running';
  }
  return statuses;
}

function formatEvent(evt: AppEaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data || {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'task_resume': return `[${ts}] 断点续跑 start_round=${d.start_round ?? ''}`;
    case 'module_load': return `[${ts}] ▶ 加载模块: ${d.module ?? ''}`;
    case 'module_found': return `[${ts}] │ 模块文件: ${d.file_count ?? ''} 个`;
    case 'module_ready': return `[${ts}] ✓ 模块就绪: ${d.entry_count ?? ''} 个入口点`;
    case 'round_start': return `[${ts}] ▶ 第 ${d.round ?? ''} 轮开始`;
    case 'worker_start': return `[${ts}] │ Worker ${d.worker_id ?? d.worker_idx ?? ''}: ${d.entry ?? ''}`;
    case 'worker_end': return `[${ts}] ✓ Worker ${d.worker_idx ?? ''} 完成`;
    case 'master_worker_start': return `[${ts}] ▶ Master Worker Round ${d.round ?? ''} 开始合并`;
    case 'master_worker_done': return `[${ts}] ✓ Master Worker Round ${d.round ?? ''} 合并完成`;
    case 'judge_start': return `[${ts}] ▶ Judge ${d.judge_id ?? d.judge_idx ?? ''} 开始评审`;
    case 'judge_end': return `[${ts}] ✓ Judge ${d.judge_idx ?? ''} 评审完成 passed=${d.passed ?? ''}`;
    case 'round_end': return `[${ts}] ✓ 第 ${d.round ?? ''} 轮结束 passed=${d.passed ?? ''}`;
    case 'error': return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束 status=${d.status ?? ''}`;
    default: return `[${ts}] ${evt.type}: ${String(d.text ?? d.output ?? JSON.stringify(d)).replace(/\n+/g, ' ').slice(0, 150)}`;
  }
}

function normalizeSessionDisplayPath(path: string): string {
  return path.replace(/^.*\/run\/sessions\//, '').replace(/^\/+/, '');
}

function resolveRoundActorSessionPath(rawPathInput: unknown, detail: AppEaTaskDetail | null, projectId: string): { fsPath: string; displayPath: string; rawPath: string } | null {
  const rawPath = String(rawPathInput || '').trim();
  if (!rawPath) return null;
  const taskRoot = detail?.output_path ? `${detail.output_path.replace(/\/+$/, '')}/${detail.task_id}` : '';
  let absolutePath = rawPath;
  if (!rawPath.startsWith('/')) {
    const relative = rawPath.replace(/^\/+/, '');
    absolutePath = relative.startsWith('run/') ? `${taskRoot}/${relative}` : `${taskRoot}/run/sessions/${relative}`;
  }
  const fsPath = extractFsRelPath(absolutePath, projectId);
  if (!fsPath) return null;
  return {
    fsPath,
    displayPath: normalizeSessionDisplayPath(rawPath),
    rawPath,
  };
}

function buildJudgeRoundSessionMeta(sessionPath: { displayPath: string; rawPath: string } | null, round: AppEaEvaluationRound | null, judge: Record<string, any> | null): AppEaSessionMeta | null {
  if (!sessionPath || !round || !judge) return null;
  const sessionName = sessionPath.displayPath.split('/').pop() || sessionPath.displayPath;
  return {
    session_id: sessionName,
    session_name: sessionName,
    relative_path: sessionPath.displayPath,
    stage_group: stageLabel(round.stage),
    role_name: 'judge',
    size: 0,
    mtime: 0,
    event_count: 0,
    line_count: 0,
    is_active: round.status === 'running',
    display_name: `${stageLabel(round.stage)} · ${round.module_name || '入口分析'} · ${judge.judge_id || 'Judge'}`,
    warnings: [],
  };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-xs text-slate-400">{label}</span><span className="text-xs text-slate-700 break-all">{value}</span></div>;
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div><div className="text-slate-400">{icon}</div></div><div className="mt-3 text-2xl font-black text-slate-900">{value}</div></div>;
}

function MarkdownContent({ content }: { content: string }) {
  return <article className="prose prose-slate max-w-none prose-headings:font-black prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-code:text-rose-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>;
}

export const EntryAnalysisTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appEntryAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<AppEaTaskDetail | null>(null);
  const hasReturnContext = hasBinarySecurityReturnTarget(detail);
  const [result, setResult] = useState<AppEaTaskResult | null>(null);
  const [evaluation, setEvaluation] = useState<AppEaTaskEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [resultView, setResultView] = useState<'final' | 'functions' | 'report' | 'json'>('final');
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AppEaSessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppEaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppEaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const [evaluationKeyword, setEvaluationKeyword] = useState('');
  const [evaluationStatus, setEvaluationStatus] = useState('');
  const [selectedEvaluationRoundKey, setSelectedEvaluationRoundKey] = useState<string | null>(null);
  const [selectedEvaluationJudgeKey, setSelectedEvaluationJudgeKey] = useState<string | null>(null);
  const [judgeSessionSnapshot, setJudgeSessionSnapshot] = useState<AppEaSessionSnapshot | null>(null);
  const [judgeSessionWatchStartLine, setJudgeSessionWatchStartLine] = useState(0);
  const [judgeSessionEvents, setJudgeSessionEvents] = useState<AppEaSessionEvent[]>([]);
  const [judgeSessionWarnings, setJudgeSessionWarnings] = useState<string[]>([]);
  const [judgeSessionLoading, setJudgeSessionLoading] = useState(false);
  const [judgeSessionError, setJudgeSessionError] = useState<string | null>(null);
  const [judgeSessionLive, setJudgeSessionLive] = useState(false);
  const judgeSessionSocketRef = useRef<WebSocket | null>(null);

  const handleBack = () => {
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try { setDetail(await appApi.getTask(taskId)); }
    catch (err: any) { notify(`加载任务详情失败: ${err?.message || err}`, 'error'); }
    finally { setLoading(false); }
  };

  const loadResult = async () => {
    setResultLoading(true);
    try { setResult(await appApi.getTaskResult(taskId)); }
    catch (err: any) { notify(`加载任务结果失败: ${err?.message || err}`, 'error'); }
    finally { setResultLoading(false); }
  };

  const loadEvaluation = async () => {
    setEvaluationLoading(true);
    try { setEvaluation(await appApi.getTaskEvaluation(taskId)); }
    catch (err: any) { notify(`加载观测指标失败: ${err?.message || err}`, 'error'); }
    finally { setEvaluationLoading(false); }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  const closeJudgeSessionSocket = () => {
    if (judgeSessionSocketRef.current) {
      judgeSessionSocketRef.current.close();
      judgeSessionSocketRef.current = null;
    }
    setJudgeSessionLive(false);
  };

  const loadSessions = async (silent = false) => {
    if (!silent) setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await appApi.listTaskSessions(taskId);
      setSessions(data);
      setSelectedSessionPath((current) => current && data.some((item) => item.relative_path === current)
        ? current
        : data.find((item) => item.is_active)?.relative_path || data[0]?.relative_path || null);
    } catch (err: any) {
      setSessionsError(err?.message || String(err));
    } finally {
      if (!silent) setSessionsLoading(false);
    }
  };

  const loadSessionFile = async (path: string) => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const snapshot = await appApi.getTaskSessionFile(taskId, path);
      setSessionSnapshot(snapshot);
      setSessionWatchStartLine(snapshot.line_count || 0);
      setSessionEvents(snapshot.events || []);
      setSessionWarnings(snapshot.warnings || []);
    } catch (err: any) {
      setSessionSnapshot(null);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionError(err?.message || String(err));
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => { void loadDetail(); }, [taskId]);
  useEffect(() => () => { closeSessionSocket(); closeJudgeSessionSocket(); }, []);
  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);
  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);
  useEffect(() => {
    if (logsExpanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.stages_json?.events?.length, logsExpanded]);
  useEffect(() => { if (activeTab === 'result') void loadResult(); }, [activeTab, taskId]);
  useEffect(() => { if (activeTab === 'evaluation') void loadEvaluation(); }, [activeTab, taskId]);
  useEffect(() => {
    if (activeTab !== 'evaluation') {
      closeJudgeSessionSocket();
    }
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'session') { closeSessionSocket(); return; }
    void loadSessions();
  }, [activeTab, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' || !detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadSessions(true), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath) return;
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, selectedSessionPath, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath || !sessionSnapshot || !detail?.output_path || !['pending', 'running'].includes(detail.status)) return;
    const absPath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(absPath, projectId);
    if (!watchPath) return;
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
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
        if (message.type === 'delta' && message.read_mode === 'line') {
          const parsed = parseSessionDelta(message.lines || [], (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length) setSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length) setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          setSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...current.session_meta, ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
        } else if (message.type === 'file_event' && ['truncated', 'renamed'].includes(message.event)) {
          void loadSessionFile(selectedSessionPath);
        } else if (message.type === 'error') {
          setSessionError(message.message || '会话订阅失败');
        }
      } catch (err: any) {
        setSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setSessionLive(false);
    socket.onclose = () => setSessionLive(false);
    return () => { if (sessionSocketRef.current === socket) closeSessionSocket(); else socket.close(); };
  }, [activeTab, selectedSessionPath, sessionSnapshot?.path, sessionWatchStartLine, detail?.status, detail?.output_path, detail?.task_id, projectId]);

  const handleCancel = async () => {
    if (!detail) return;
    try { await appApi.cancelTask(detail.task_id); notify('任务已取消', 'success'); await loadDetail(); }
    catch (err: any) { notify(`取消失败: ${err?.message || err}`, 'error'); }
  };
  const handleDelete = async () => {
    if (!detail) return;
    const ok = await showConfirm({ title: '删除任务', message: `确定要删除任务「${detail.task_name}」及其所有输出文件吗？此操作不可撤销。`, confirmText: '确认删除', cancelText: '取消', danger: true });
    if (!ok) return;
    try { await appApi.deleteTask(detail.task_id, true); notify('任务已删除', 'success'); handleBack(); }
    catch (err: any) { notify(`删除失败: ${err?.message || err}`, 'error'); }
  };
  const handleRestart = async () => {
    if (!detail) return;
    setRestarting(true);
    try { await appApi.restartTask(detail.task_id); notify('任务已重新启动', 'success'); await loadDetail(); if (activeTab === 'result') await loadResult(); }
    catch (err: any) { notify(`重启失败: ${err?.message || err}`, 'error'); }
    finally { setRestarting(false); }
  };
  const handleResume = async () => {
    if (!detail) return;
    setResuming(true);
    try { await appApi.resumeTask(detail.task_id); notify('已从断点继续', 'success'); await loadDetail(); if (activeTab === 'result') await loadResult(); }
    catch (err: any) { notify(`断点续跑失败: ${err?.message || err}`, 'error'); }
    finally { setResuming(false); }
  };

  const events = detail?.stages_json?.events || [];
  const statusSteps = detail ? deriveStepStatuses(detail.status, events) : STAGE_STEPS.map((): StepStatus => 'pending');
  const logLines = events.map(formatEvent);
  const groupedSessions = useMemo(() => {
    const map = new Map<string, AppEaSessionMeta[]>();
    sessions.forEach((session) => map.set(session.stage_group, [...(map.get(session.stage_group) || []), session]));
    return Array.from(map.entries());
  }, [sessions]);
  const selectedSession = sessions.find((item) => item.relative_path === selectedSessionPath) || null;
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const resultContent = resultView === 'final'
    ? result?.result_markdown || ''
    : resultView === 'functions'
      ? result?.functions_list_markdown || ''
      : resultView === 'report'
        ? result?.run_report_markdown || ''
        : JSON.stringify(result?.result_json || {}, null, 2);
  const markdownResultContent = resultView === 'functions' ? `\`\`\`text\n${resultContent}\n\`\`\`` : resultContent;
  const evaluationRounds = evaluation?.rounds || [];
  const statuses = Array.from(new Set(evaluationRounds.map((item) => item.status).filter(Boolean) as string[]));
  const filteredRounds = evaluationRounds.filter((round) => {
    const keyword = evaluationKeyword.trim().toLowerCase();
    if (keyword && !String(round.module_name || '').toLowerCase().includes(keyword)) return false;
    if (evaluationStatus && round.status !== evaluationStatus) return false;
    return true;
  });
  const avgJudgeScore = (() => {
    const scores = evaluationRounds.map((item) => Number(item.metrics?.avg_judge_score)).filter(Number.isFinite);
    return scores.length ? scores.reduce((sum, item) => sum + item, 0) / scores.length : null;
  })();
  const selectedEvaluationRound = useMemo<AppEaEvaluationRound | null>(
    () => evaluationRounds.find((item) => evaluationRoundKey(item) === selectedEvaluationRoundKey) || null,
    [evaluationRounds, selectedEvaluationRoundKey],
  );
  const selectedEvaluationJudge = useMemo<Record<string, any> | null>(
    () => (selectedEvaluationRound?.judges || []).find((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey) || null,
    [selectedEvaluationJudgeKey, selectedEvaluationRound],
  );
  const selectedEvaluationJudgeSessionPath = useMemo(
    () => selectedEvaluationJudge ? resolveRoundActorSessionPath(selectedEvaluationJudge.session_file, detail, projectId) : null,
    [detail, projectId, selectedEvaluationJudge],
  );
  const selectedEvaluationJudgeSessionMeta = useMemo(
    () => buildJudgeRoundSessionMeta(selectedEvaluationJudgeSessionPath, selectedEvaluationRound, selectedEvaluationJudge),
    [selectedEvaluationJudge, selectedEvaluationJudgeSessionPath, selectedEvaluationRound],
  );

  useEffect(() => {
    const judges = selectedEvaluationRound?.judges || [];
    const currentValid = judges.some((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey);
    if (currentValid) return;
    const firstWithSession = judges.find((item) => Boolean(String(item?.session_file || '').trim()));
    setSelectedEvaluationJudgeKey(firstWithSession ? `${firstWithSession.judge_id || 0}::${firstWithSession.model || ''}` : null);
  }, [selectedEvaluationJudgeKey, selectedEvaluationRound]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath) {
      if (activeTab === 'evaluation' && selectedEvaluationJudge && !selectedEvaluationJudgeSessionPath) {
        setJudgeSessionSnapshot(null);
        setJudgeSessionEvents([]);
        setJudgeSessionWarnings([]);
        setJudgeSessionError('该 Judge 未记录可读取的会话文件');
      }
      closeJudgeSessionSocket();
      return;
    }
    closeJudgeSessionSocket();
    const load = async () => {
      setJudgeSessionLoading(true);
      setJudgeSessionError(null);
      setJudgeSessionSnapshot(null);
      setJudgeSessionWatchStartLine(0);
      setJudgeSessionEvents([]);
      setJudgeSessionWarnings([]);
      try {
        const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, selectedEvaluationJudgeSessionPath.fsPath);
        const content = await blobToText(blob);
        const snapshot = buildSessionSnapshotFromText(selectedEvaluationJudgeSessionPath.displayPath, content);
        setJudgeSessionSnapshot(snapshot as AppEaSessionSnapshot);
        setJudgeSessionWatchStartLine(snapshot.line_count || 0);
        setJudgeSessionEvents((snapshot.events || []) as AppEaSessionEvent[]);
        setJudgeSessionWarnings(snapshot.warnings || []);
      } catch (err: any) {
        setJudgeSessionError(err?.message || String(err));
      } finally {
        setJudgeSessionLoading(false);
      }
    };
    void load();
  }, [activeTab, selectedEvaluationJudgeKey, selectedEvaluationJudgeSessionPath?.fsPath, fileserverApi, projectId, selectedEvaluationJudge]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath || !judgeSessionSnapshot || !detail || !['pending', 'running'].includes(detail.status)) return;
    closeJudgeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, selectedEvaluationJudgeSessionPath.fsPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: judgeSessionWatchStartLine,
    });
    judgeSessionSocketRef.current = socket;
    socket.onopen = () => setJudgeSessionLive(true);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'delta' && message.read_mode === 'line') {
          const parsed = parseSessionDelta(message.lines || [], (message.from_line ?? judgeSessionWatchStartLine) + 1);
          if (parsed.events.length) setJudgeSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length) setJudgeSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          setJudgeSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setJudgeSessionWatchStartLine(message.to_line ?? judgeSessionWatchStartLine);
        } else if (message.type === 'file_event' && ['truncated', 'renamed'].includes(message.event)) {
          setJudgeSessionLive(false);
          setJudgeSessionError('Judge 会话文件已重置，正在重新加载');
        } else if (message.type === 'error') {
          setJudgeSessionError(message.message || 'Judge 会话订阅失败');
        }
      } catch (err: any) {
        setJudgeSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setJudgeSessionLive(false);
    socket.onclose = () => setJudgeSessionLive(false);
    return () => { if (judgeSessionSocketRef.current === socket) closeJudgeSessionSocket(); else socket.close(); };
  }, [activeTab, detail, fileserverApi, judgeSessionSnapshot, judgeSessionWatchStartLine, projectId, selectedEvaluationJudge, selectedEvaluationJudgeKey, selectedEvaluationJudgeSessionPath]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={handleBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <ArrowLeft size={14} />{hasReturnContext ? '返回原任务' : '返回任务列表'}
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{detail?.task_name || '任务详情'}</h1>
              {detail ? <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status]}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate-500 break-all">{detail?.input_path || '正在加载任务详情。'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && ['running', 'pending'].includes(detail.status) ? <button onClick={() => void handleCancel()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">取消任务</button> : null}
            {detail && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void handleRestart()} disabled={restarting} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{restarting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}重新运行</button> : null}
            {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="entry_analysis" task={detail} /> : null}
            {detail && detail.started_at && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void handleResume()} disabled={resuming} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">{resuming ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}断点续跑</button> : null}
            {detail ? <button onClick={() => void handleDelete()} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"><Trash2 size={13} />删除任务</button> : null}
            <button onClick={() => { void loadDetail(); if (activeTab === 'result') void loadResult(); if (activeTab === 'evaluation') void loadEvaluation(); }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={loading || resultLoading || evaluationLoading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        {detail ? <div className="mt-5"><TaskOriginCard origin={detail} /></div> : null}
      </section>

      {loading && !detail ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm"><div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载中...</div></section> : null}

      {detail ? <>
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">{[
            ['overview', '总览'], ['session', '智能体会话'], ['result', '结果'], ['evaluation', '观测指标'],
          ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{label}</button>)}</div>
        </section>

        {activeTab === 'overview' ? <>
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
              <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="模块目录" value={<span className="font-mono">{detail.input_path}</span>} />
                <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="源码目录" value={detail.source_path ? <span className="font-mono">{detail.source_path}</span> : '-'} />
                <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="分析模块" value={detail.module_name || '-'} />
                <InfoRow label="耗时" value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
                <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono">{detail.output_path}</span> : '-'} />
                <InfoRow label="描述" value={detail.task_description || '-'} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
              <div className="mt-4 space-y-3">{STAGE_STEPS.map((step, index) => {
                const state = statusSteps[index];
                const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : '';
                const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                return <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><div className="flex items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${state === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : state === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600' : state === 'failed' ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-400'}`}>{state === 'completed' ? <CheckCircle2 size={16} /> : state === 'running' ? <Loader2 size={14} className="animate-spin" /> : state === 'failed' ? <XCircle size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{step.label}</p><p className="mt-1 text-xs text-slate-500">{step.desc}</p>{artifactFsPath && state !== 'pending' ? <button onClick={() => openInFileExplorer(artifactFsPath)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"><FolderOpen size={11} />打开阶段输出</button> : null}</div></div></div>;
              })}</div>
            </div>
          </section>
          {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><button onClick={() => setLogsExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2><p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{logsExpanded ? logLines.length === 0 ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">暂无阶段事件</div> : <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300">{logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-400' : line.includes('▶') ? 'text-violet-300' : line.includes('✓') ? 'text-emerald-400' : line.includes('│') ? 'text-slate-400 text-[11px]' : 'text-slate-300'}>{line}</div>)}</div> : null}</section>
          {detail.prompt_content ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre></details></section> : null}
        </> : activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div><div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => <div key={group}><div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group === 'root' ? '根会话' : group}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{session.relative_path}</div></div><span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{session.is_active ? '活跃' : '历史'}</span></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>)}</div>}</aside>
            <div className="space-y-4">{sessionWarnings.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm"><div className="font-bold">会话文件存在部分异常行，已跳过不可解析内容</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">{sessionWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : null}<AgentSessionViewer sessionMeta={selectedSession} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents} loading={sessionLoading} live={sessionLive} error={sessionError} /></div>
          </section>
        ) : activeTab === 'result' ? (
          <section className="space-y-4"><div className="grid gap-4 xl:grid-cols-5"><MetricCard label="函数数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div><div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>{resultLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">加载结果中...</section> : !result ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">暂无结果数据</section> : !result.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center text-sm text-slate-500">任务完成后可查看结果，当前状态：{STATUS_LABEL[result.status] || result.status}</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]"><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终结果'], ['functions', 'functions.list'], ['report', '运行报告'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}>{label}</button>)}</div></aside><main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="border-b border-slate-200 pb-4 text-2xl font-black tracking-tight text-slate-900">{resultView === 'final' ? '最终结果' : resultView === 'functions' ? '函数列表' : resultView === 'report' ? '运行报告' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{resultContent}</pre> : <MarkdownContent content={markdownResultContent} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">函数列表</div><div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">{result.functions.length ? result.functions.map((fn) => <div key={fn} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">{fn}</div>) : <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">没有 functions.list 内容</div>}</div></aside></section>}</section>
        ) : (
          <section className="space-y-4">{evaluationLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">加载观测指标中...</section> : !evaluation || !evaluation.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><BarChart3 size={20} /></div><div className="mt-4 text-base font-bold text-slate-800">当前任务尚未生成观测指标</div><div className="mt-2 text-sm text-slate-500">任务至少完成一个 Worker/Judge 轮次后会出现观测数据。</div></section> : <>{evaluation.warnings.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-bold text-amber-800"><ScrollText size={16} />部分观测文件读取异常</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">{evaluation.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : null}<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="总轮数" value={formatNumber(evaluation.summary?.round_count ?? evaluation.rounds.length)} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={formatNumber(evaluation.summary?.passed_round_count)} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(evaluation.summary?.total_tokens)} icon={<ScrollText size={18} />} /><MetricCard label="总 Cost" value={formatCost(evaluation.summary?.total_cost)} icon={<ScrollText size={18} />} /><MetricCard label="平均 Judge 分" value={avgJudgeScore == null ? '-' : formatNumber(avgJudgeScore, 1)} icon={<BarChart3 size={18} />} /><MetricCard label="最终通过率" value={formatRate(evaluation.summary?.effectiveness?.final_round_pass_rate)} icon={<CheckCircle2 size={18} />} /></section>{selectedEvaluationRound ? <section className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" onClick={() => setSelectedEvaluationRoundKey(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={14} />返回轮次列表</button><div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Round Detail</div><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">#{selectedEvaluationRound.round ?? '-'} · {selectedEvaluationRound.module_name || detail.module_name || '入口分析'}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className={`rounded-full border px-3 py-1 font-bold ${evaluationStatusTone(selectedEvaluationRound.status)}`}>{selectedEvaluationRound.status || '-'}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">{stageLabel(selectedEvaluationRound.stage)}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono font-bold text-slate-600">Stage Round {selectedEvaluationRound.stage_round ?? '-'}</span></div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"><div className="font-black text-slate-700">来源文件</div><div className="mt-1 max-w-xl break-all font-mono">{selectedEvaluationRound.source_path || detail.source_path || '-'}</div></div></div></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="耗时" value={formatMs(selectedEvaluationRound.duration_ms)} icon={<BarChart3 size={18} />} /><MetricCard label="Token" value={formatNumber(selectedEvaluationRound.metrics?.token_total)} icon={<ScrollText size={18} />} /><MetricCard label="Cost" value={formatCost(selectedEvaluationRound.metrics?.cost)} icon={<ScrollText size={18} />} /><MetricCard label="Judge 均分" value={formatNumber(selectedEvaluationRound.metrics?.avg_judge_score, 1)} icon={<CheckCircle2 size={18} />} /></section><section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">本轮执行摘要</h3><div className="mt-4 space-y-3"><InfoRow label="开始时间" value={selectedEvaluationRound.started_at ? new Date(selectedEvaluationRound.started_at).toLocaleString('zh-CN') : '-'} /><InfoRow label="结束时间" value={selectedEvaluationRound.ended_at ? new Date(selectedEvaluationRound.ended_at).toLocaleString('zh-CN') : '-'} /><InfoRow label="完成原因" value={selectedEvaluationRound.completion_reason || '-'} /><InfoRow label="模块完成" value={selectedEvaluationRound.module_completed ? '是' : '否'} /><InfoRow label="通过投票" value={selectedEvaluationRound.metrics?.passed_by_vote ? '通过' : '未通过'} /><InfoRow label="通过率" value={formatRate(selectedEvaluationRound.metrics?.review_pass_rate)} /></div><div className="mt-4 flex flex-wrap gap-2 text-xs">{selectedEvaluationRound.effectiveness?.needed_reflection ? <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700">需要反思</span> : null}{selectedEvaluationRound.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-700">触发重分类</span> : null}{!selectedEvaluationRound.effectiveness?.needed_reflection && !selectedEvaluationRound.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600">无额外调整</span> : null}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Worker</h3><div className="mt-4 space-y-3"><InfoRow label="模型" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.model || '-'}</span>} /><InfoRow label="会话文件" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.session_file || '-'}</span>} /><InfoRow label="错误" value={selectedEvaluationRound.worker?.error || '-'} /></div>{Array.isArray(selectedEvaluationRound.worker?.artifact_paths) && selectedEvaluationRound.worker.artifact_paths.length > 0 ? <div className="mt-4"><div className="text-xs font-bold text-slate-500">产物路径</div><div className="mt-2 space-y-2">{(selectedEvaluationRound.worker?.artifact_paths || []).slice(0, 8).map((path: string) => <div key={path} className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">{path}</div>)}</div></div> : null}</section></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 评审</h3><p className="mt-1 text-xs text-slate-400">展示本轮所有 Judge 的评分、通过状态、会话文件和反馈摘要</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{selectedEvaluationRound.judges?.length || 0} 个 Judge</span></div><div className="mt-4 space-y-3">{(selectedEvaluationRound.judges || []).map((judge, index) => <div key={`${judge.judge_id || index}-${judge.model || ''}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-mono text-xs font-bold text-slate-700">{judge.judge_id || `judge-${index + 1}`}</div><div className="flex flex-wrap gap-2 text-[11px]">{judge.session_file ? <button type="button" onClick={() => setSelectedEvaluationJudgeKey(`${judge.judge_id || index}::${judge.model || ''}`)} className={`rounded-full border px-2 py-0.5 font-bold ${selectedEvaluationJudgeKey === `${judge.judge_id || index}::${judge.model || ''}` ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>查看会话</button> : null}<span className={`rounded-full px-2 py-0.5 font-bold ${judge.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{judge.passed ? '通过' : '未通过'}</span><span className="rounded-full bg-white px-2 py-0.5 font-bold text-slate-600">评分 {formatNumber(judge.score)}</span></div></div><div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.model || '-'}</div><div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.session_file || '未记录会话文件'}</div>{judge.feedback_excerpt ? <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">{judge.feedback_excerpt}</div> : null}</div>)}{(selectedEvaluationRound.judges || []).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">本轮没有 Judge 明细</div> : null}</div></section></section>{selectedEvaluationJudge ? <section className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 会话</h3><p className="mt-1 text-xs text-slate-400">通过 fileserver 读取当前选中 Judge 的 session 文件；任务运行中会实时监听追加内容。</p></div>{selectedEvaluationJudgeSessionPath ? <div className="max-w-xl break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">{selectedEvaluationJudgeSessionPath.fsPath}</div> : null}</div></section>{judgeSessionWarnings.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm"><div className="font-bold">Judge 会话文件存在部分异常行，已跳过不可解析内容</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">{judgeSessionWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : null}<AgentSessionViewer sessionMeta={selectedEvaluationJudgeSessionMeta} sessionHeader={judgeSessionSnapshot?.session_meta} events={judgeSessionEvents} loading={judgeSessionLoading} live={judgeSessionLive} error={judgeSessionError} /></section> : null}<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">原始 JSON</h3><p className="mt-1 text-xs text-slate-400">保留完整观测文件内容，便于核对字段。</p></div></div><pre className="mt-4 max-h-[480px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedEvaluationRound, null, 2)}</pre></section></section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2><p className="mt-1 text-xs text-slate-400">展示每一轮 Worker/Judge 的观测指标，点击行进入轮次详情页</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" /><input value={evaluationKeyword} onChange={(e) => setEvaluationKeyword(e.target.value)} placeholder="模块过滤" className="rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs" /></div><select value={evaluationStatus} onChange={(e) => setEvaluationStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">全部状态</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></div><div className="mt-4 overflow-auto rounded-2xl border border-slate-200"><table className="min-w-full divide-y divide-slate-200 text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Round</th><th className="px-3 py-3">阶段</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">耗时</th><th className="px-3 py-3">Judge 分</th><th className="px-3 py-3">通过率</th><th className="px-3 py-3">Token</th><th className="px-3 py-3">Cost</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{filteredRounds.map((round) => <tr key={evaluationRoundKey(round)} onClick={() => setSelectedEvaluationRoundKey(evaluationRoundKey(round))} className="cursor-pointer hover:bg-slate-50"><td className="px-3 py-3 font-mono text-slate-700">{round.round}</td><td className="px-3 py-3 font-semibold text-slate-700">{stageLabel(round.stage)}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 font-bold ${evaluationStatusTone(round.status)}`}>{round.status || '-'}</span></td><td className="px-3 py-3 text-slate-600">{formatMs(round.duration_ms)}</td><td className="px-3 py-3">{formatNumber(round.metrics?.avg_judge_score, 1)}</td><td className="px-3 py-3">{formatRate(round.metrics?.review_pass_rate)}</td><td className="px-3 py-3">{formatNumber(round.metrics?.token_total)}</td><td className="px-3 py-3">{formatCost(round.metrics?.cost)}</td></tr>)}</tbody></table>{filteredRounds.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的轮次</div> : null}</div></section>}</>}</section>
        )}
      </> : !loading ? <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div> : null}
    </div>
  );
};
