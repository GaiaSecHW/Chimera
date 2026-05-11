import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy,
  FolderOpen, Loader2, RefreshCw, RotateCcw, Search, ScrollText, Trash2, XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  AppDfaEvaluationRound,
  AppDfaSessionEvent,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppDfaStageEvent,
  AppDfaTaskDetail,
  AppDfaTaskEvaluation,
  AppDfaTaskResult,
} from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnTarget, navigateBackByTaskOrigin, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { AgentSessionViewer } from './AgentSessionViewer';
import { TaskOriginCard } from './taskOrigin';
import { buildSessionSnapshotFromText, parseSessionJsonlDelta } from './sessionParsing';

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
  { key: 'init', label: '任务准备', desc: '解析配置，初始化工作区', artifactSubpath: 'run' },
  { key: 'worker', label: 'Worker 分析', desc: '并行追踪函数数据流', artifactSubpath: 'run/sessions' },
  { key: 'judge', label: 'Judge 评估', desc: '评估数据流分析可信度', artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告输出', desc: '生成数据流 Markdown 和结构化结果', artifactSubpath: 'output' },
];

const EVT_STAGE: Record<string, number> = {
  task_start: 0, trace_start: 0, trace_skip: 0, trace_callees: 0,
  round_start: 1, worker_start: 1, worker_done: 1,
  judge_start: 2, judge_eval: 2, judge_summary: 2, judge_done: 2, judge_result: 2,
  task_end: 3,
};

type DetailTab = 'overview' | 'session' | 'result' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function extractFsRelPath(path: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  return `${basePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: fsPath } }));
}

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

function deriveStepStatuses(taskStatus: string, events: AppDfaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');
  let stage = -1;
  for (const evt of events) {
    if (evt.type === 'round_end') {
      if (evt.data?.passed) stage = 3;
    } else if (evt.type !== 'round_reflection') {
      const mapped = EVT_STAGE[evt.type];
      if (mapped !== undefined) stage = mapped;
    }
  }
  if (stage === -1) {
    statuses[0] = taskStatus === 'running' ? 'running' : ['error', 'failed', 'cancelled'].includes(taskStatus) ? 'failed' : 'pending';
    return statuses;
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (i < stage) statuses[i] = 'completed';
    else if (i === stage) statuses[i] = ['error', 'failed', 'cancelled'].includes(taskStatus) ? 'failed' : 'running';
  }
  return statuses;
}

function formatEventLog(evt: AppDfaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data || {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'trace_start': return `[${ts}] ▶ 追踪函数: ${d.function || d.task || ''}`;
    case 'trace_callees': return `[${ts}] ✓ 发现调用: ${(d.callees || []).join(', ')}`;
    case 'round_start': return `[${ts}] ▶ 第 ${d.round || ''} 轮 Worker 分析`;
    case 'worker_start': return `[${ts}] │ Worker ${d.worker_id || d.worker_idx || ''} 开始`;
    case 'worker_done': return `[${ts}] ✓ Worker ${d.worker_id || d.worker_idx || ''} 完成`;
    case 'judge_start': return `[${ts}] ▶ Judge ${d.judge_id || d.judge_idx || ''} 开始`;
    case 'judge_done': return `[${ts}] ✓ Judge ${d.judge_id || d.judge_idx || ''} 完成`;
    case 'round_end': return `[${ts}] ✓ 第 ${d.round || ''} 轮结束 passed=${d.passed ?? ''}`;
    case 'error': return `[${ts}] ✗ 错误: ${d.error || JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束 status=${d.status || ''}`;
    default: return `[${ts}] ${evt.type}: ${String(d.text || d.output || JSON.stringify(d)).replace(/\n+/g, ' ').slice(0, 150)}`;
  }
}

interface DfaTreeNode {
  name: string;
  depth: number;
  status: 'pending' | 'running' | 'done';
  children: DfaTreeNode[];
}

function buildDfaTree(events: AppDfaStageEvent[], taskStatus: string): DfaTreeNode | null {
  const calleesMap = new Map<string, string[]>();
  const nodeDepth = new Map<string, number>();
  const nodeStatus = new Map<string, 'running' | 'done'>();
  let rootName: string | null = null;
  for (const evt of events) {
    const d = evt.data || {};
    if (evt.type === 'trace_start') {
      const fn = String(d.function || d.task || '').trim();
      if (!fn) continue;
      const depth = Number(d.depth ?? 0);
      if (!nodeDepth.has(fn) || (nodeDepth.get(fn) || 0) > depth) nodeDepth.set(fn, depth);
      if (!nodeStatus.has(fn)) nodeStatus.set(fn, 'running');
      if (!rootName && depth === 0) rootName = fn;
    }
    if (evt.type === 'trace_callees') {
      const fn = String(d.function || '').trim();
      const callees = Array.isArray(d.callees) ? d.callees.map(String) : [];
      if (fn) {
        // Merge with any previously seen callees (union) to handle duplicate events on resume
        const existing = calleesMap.get(fn) ?? [];
        const merged = existing.length === 0 ? callees : [...new Set([...existing, ...callees])];
        calleesMap.set(fn, merged);
        nodeStatus.set(fn, 'done');
      }
    }
  }
  if (!['running', 'pending'].includes(taskStatus)) {
    nodeStatus.forEach((status, fn) => { if (status === 'running') nodeStatus.set(fn, 'done'); });
  }
  if (!rootName) return null;
  const build = (name: string, inheritDepth: number, visited = new Set<string>()): DfaTreeNode => {
    if (visited.has(name)) return { name, depth: inheritDepth, status: 'done', children: [] };
    visited.add(name);
    const depth = nodeDepth.get(name) ?? inheritDepth;
    return {
      name,
      depth,
      status: nodeStatus.get(name) || 'pending',
      children: (calleesMap.get(name) || []).map((child) => build(child, depth + 1, new Set(visited))),
    };
  };
  return build(rootName, 0);
}

function TreeNodeView({ node }: { node: DfaTreeNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
        <span className={`h-2 w-2 rounded-full ${node.status === 'done' ? 'bg-emerald-500' : node.status === 'running' ? 'bg-blue-500' : 'bg-slate-300'}`} />
        <span className="font-mono text-slate-700">{node.name}</span>
      </div>
      {node.children.length ? <div className="ml-5 border-l border-slate-200 pl-3 space-y-2">{node.children.map((child) => <TreeNodeView key={`${node.name}-${child.name}-${child.depth}`} node={child} />)}</div> : null}
    </div>
  );
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

export const DataflowAnalysisTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appDataflowAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<AppDfaTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [result, setResult] = useState<AppDfaTaskResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultView, setResultView] = useState<'final' | 'report' | 'dataflow' | 'json'>('final');
  const [selectedDataflowFile, setSelectedDataflowFile] = useState<string>('');
  const [evaluation, setEvaluation] = useState<AppDfaTaskEvaluation | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationKeyword, setEvaluationKeyword] = useState('');
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [sessions, setSessions] = useState<AppDfaSessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppDfaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppDfaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      setDetail(await appApi.getTask(taskId));
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadResult = async () => {
    if (!taskId || resultLoading) return;
    setResultLoading(true);
    try {
      const data = await appApi.getTaskResult(taskId);
      setResult(data);
      if (!selectedDataflowFile && data.dataflow_files?.[0]) setSelectedDataflowFile(data.dataflow_files[0].relative_path);
    } catch (err: any) {
      notify(`加载结果失败: ${err?.message || err}`, 'error');
    } finally {
      setResultLoading(false);
    }
  };

  const loadEvaluation = async () => {
    if (!taskId || evaluationLoading) return;
    setEvaluationLoading(true);
    try {
      setEvaluation(await appApi.getTaskEvaluation(taskId));
    } catch (err: any) {
      notify(`加载观测指标失败: ${err?.message || err}`, 'error');
    } finally {
      setEvaluationLoading(false);
    }
  };

  const loadSessions = async () => {
    if (!taskId) return;
    setSessionsLoading(true);
    try {
      const data = await appApi.listTaskSessions(taskId);
      const items = data.items || [];
      setSessions(items);
      setSelectedSessionPath((current) => current || items.find((item) => item.is_active)?.relative_path || items[0]?.relative_path || null);
    } catch (err: any) {
      setSessionError(`加载会话列表失败: ${err?.message || err}`);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSessionFile = async (path: string) => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const snapshot = await appApi.getTaskSessionFile(taskId, path);
      const text = (snapshot.events || []).map((event: any) => event.raw_line).filter(Boolean).join('\n');
      const parsed = text ? buildSessionSnapshotFromText(path, text) : null;
      setSessionSnapshot({ ...snapshot, session_meta: snapshot.session_meta || parsed?.session_meta || null });
      setSessionEvents((parsed?.events || snapshot.events || []) as AppDfaSessionEvent[]);
      setSessionWarnings([...(snapshot.warnings || []), ...((parsed?.warnings || []) as string[])]);
    } catch (err: any) {
      setSessionError(`加载会话失败: ${err?.message || err}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  useEffect(() => { void loadDetail(); }, [taskId]);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (activeTab === 'result' && !result && !resultLoading) void loadResult();
    if (activeTab === 'evaluation' && !evaluation && !evaluationLoading) void loadEvaluation();
    if (activeTab === 'session' && sessions.length === 0 && !sessionsLoading) void loadSessions();
  }, [activeTab]);
  useEffect(() => {
    if (!logsExpanded || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.stages_json?.events?.length, logsExpanded]);
  useEffect(() => {
    if (detail?.status !== 'running') return;
    const timer = setInterval(() => void loadDetail(), 8000);
    return () => clearInterval(timer);
  }, [detail?.status, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' || detail?.status !== 'running') return;
    const timer = setInterval(() => void loadSessions(), 12000);
    return () => clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);
  useEffect(() => {
    closeSessionSocket();
    if (activeTab !== 'session' || !selectedSessionPath) return;
    void loadSessionFile(selectedSessionPath);
    return closeSessionSocket;
  }, [activeTab, selectedSessionPath, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath || !detail?.output_path || detail.status !== 'running') return;
    const runFilePath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run`, selectedSessionPath);
    const watchPath = extractFsRelPath(runFilePath, projectId);
    if (!watchPath) return;
    const startLine = sessionSnapshot?.line_count || 0;
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: startLine > 0 ? 'tail' : 'head',
      start_line: startLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => setSessionLive(true);
    socket.onclose = () => setSessionLive(false);
    socket.onerror = () => setSessionLive(false);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot' || message.type === 'heartbeat') return;
        if (message.type === 'error') {
          setSessionError(message.message || '会话实时监听失败');
          setSessionLive(false);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'deleted') {
            setSessionError('会话文件已删除，实时监听已停止');
            setSessionLive(false);
          } else if (message.event === 'truncated' || message.event === 'renamed') {
            void loadSessionFile(selectedSessionPath);
          }
          return;
        }
        if (message.type !== 'delta' || message.read_mode !== 'line') return;
        const parsed = parseSessionJsonlDelta(message.lines || [], (message.from_line ?? startLine) + 1);
        if (parsed.events.length) setSessionEvents((current) => [...current, ...(parsed.events as AppDfaSessionEvent[])]);
        if (parsed.warnings.length) setSessionWarnings((current) => [...current, ...parsed.warnings]);
        setSessionSnapshot((current) => current ? { ...current, line_count: Math.max(current.line_count || 0, message.to_line || current.line_count || 0) } : current);
      } catch (err) {
        console.warn('Failed to parse dataflow session watch message', err);
      }
    };
    return closeSessionSocket;
  }, [activeTab, selectedSessionPath, detail?.output_path, detail?.status, sessionSnapshot?.line_count, projectId]);

  const events = detail?.stages_json?.events || [];
  const statusSteps = detail ? deriveStepStatuses(detail.status, events) : STAGE_STEPS.map((): StepStatus => 'pending');
  const logLines = events.map(formatEventLog).filter(Boolean);
  const dfaTree = detail ? buildDfaTree(events, detail.status) : null;
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, AppDfaSessionMeta[]>();
    sessions.forEach((session) => {
      const key = session.stage_group || 'root';
      groups.set(key, [...(groups.get(key) || []), session]);
    });
    return Array.from(groups.entries());
  }, [sessions]);
  const selectedSession = sessions.find((item) => item.relative_path === selectedSessionPath) || null;
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const selectedDataflow = result?.dataflow_files?.find((file) => file.relative_path === selectedDataflowFile) || result?.dataflow_files?.[0] || null;
  const resultContent = resultView === 'final'
    ? result?.result_markdown || ''
    : resultView === 'report'
      ? result?.run_report_markdown || ''
      : resultView === 'dataflow'
        ? selectedDataflow?.markdown || ''
        : JSON.stringify(result?.result_json || {}, null, 2);
  const filteredRounds = useMemo(() => {
    const keyword = evaluationKeyword.trim().toLowerCase();
    return (evaluation?.rounds || []).filter((round) => {
      if (!keyword) return true;
      return JSON.stringify(round).toLowerCase().includes(keyword);
    });
  }, [evaluation?.rounds, evaluationKeyword]);
  const hasReturnContext = hasBinarySecurityReturnTarget(detail);

  const cancelTask = async () => {
    if (!detail) return;
    await appApi.cancelTask(detail.task_id);
    notify('任务已取消', 'success');
    await loadDetail();
  };
  const restartTask = async () => {
    if (!detail) return;
    await appApi.restartTask(detail.task_id);
    notify('任务已重新启动', 'success');
    await loadDetail();
  };
  const resumeTask = async () => {
    if (!detail) return;
    await appApi.resumeTask(detail.task_id);
    notify('已从断点继续', 'success');
    await loadDetail();
  };
  const deleteTask = async () => {
    if (!detail) return;
    const confirmed = await showConfirm({
      title: '删除数据流分析任务',
      message: `确定要删除任务「${detail.task_name}」及其输出文件吗？此操作不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    await appApi.deleteTask(detail.task_id, true);
    notify('任务已删除', 'success');
    onBack();
  };

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <button onClick={handleBack} className="mt-1 rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm hover:bg-slate-50"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-black tracking-tight text-slate-900">{detail?.task_name || '数据流分析任务详情'}</h1>
              {detail ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[detail.status] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
              {hasReturnContext ? <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">来自二进制安全总任务</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate-500">查看数据流追踪、智能体会话、结果产物和观测指标。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadDetail()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
          {detail && ['pending', 'running'].includes(detail.status) ? <button onClick={() => void cancelTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><XCircle size={15} />取消</button> : null}
          {detail && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void restartTask()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><RotateCcw size={15} />重试</button> : null}
          {detail?.started_at ? <button onClick={() => void resumeTask()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={15} />继续</button> : null}
          {detail ? <button onClick={() => void deleteTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={15} />删除</button> : null}
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          ['overview', '总览'],
          ['session', '智能体会话'],
          ['result', '结果'],
          ['evaluation', '观测指标'],
        ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}
      </div>

      {loading && !detail ? <div className="py-20 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-3 animate-spin" />加载任务详情中...</div> : detail ? (
        activeTab === 'overview' ? (
          <section className="space-y-4">
            <TaskOriginCard origin={detail} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务信息</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                  <InfoRow label="创建时间" value={new Date(detail.created_at).toLocaleString('zh-CN')} />
                  <InfoRow label="输入路径" value={<span className="font-mono">{detail.input_path}</span>} />
                  <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono">{detail.output_path}</span> : '-'} />
                  <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="耗时" value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
                  <InfoRow label="描述" value={detail.task_description || '-'} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
                <div className="mt-4 space-y-3">{STAGE_STEPS.map((step, index) => {
                  const state = statusSteps[index];
                  const artifactPath = detail.output_path ? extractFsRelPath(`${detail.output_path}/${detail.task_id}/${step.artifactSubpath}`, projectId) : null;
                  return <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><div className="flex items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${state === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : state === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600' : state === 'failed' ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-400'}`}>{state === 'completed' ? <CheckCircle2 size={16} /> : state === 'running' ? <Loader2 size={14} className="animate-spin" /> : state === 'failed' ? <XCircle size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{step.label}</p><p className="mt-1 text-xs text-slate-500">{step.desc}</p>{artifactPath && state !== 'pending' ? <button onClick={() => openInFileExplorer(artifactPath)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"><FolderOpen size={11} />打开阶段输出</button> : null}</div></div></div>;
                })}</div>
              </div>
            </div>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">数据流调用树</h2>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">{dfaTree ? <TreeNodeView node={dfaTree} /> : <div className="py-10 text-center text-sm text-slate-400">暂无调用树事件</div>}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <button onClick={() => setLogsExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2><p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                {logsExpanded ? <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300">{logLines.length ? logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-400' : line.includes('▶') ? 'text-violet-300' : line.includes('✓') ? 'text-emerald-400' : 'text-slate-300'}>{line}</div>) : <div className="text-slate-500">暂无阶段事件</div>}</div> : null}
              </div>
            </section>
            {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
            {detail.prompt_content ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre></details></section> : null}
          </section>
        ) : activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div><div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => <div key={group}><div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group === 'root' ? '根会话' : group}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{session.relative_path}</div></div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{session.is_active ? '活跃' : '历史'}</span></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>)}</div>}</aside>
            <div className="space-y-4">{sessionWarnings.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm"><div className="font-bold">会话文件存在部分异常行，已跳过不可解析内容</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">{sessionWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : null}<AgentSessionViewer sessionMeta={selectedSession as any} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents as any} loading={sessionLoading} live={sessionLive} error={sessionError} /></div>
          </section>
        ) : activeTab === 'result' ? (
          <section className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-5"><MetricCard label="追踪函数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div><div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>
            {resultLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">加载结果中...</section> : !result || !result.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">当前任务尚未生成可展示结果。</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]"><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终报告'], ['report', '运行报告'], ['dataflow', '函数级结果'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}>{label}</button>)}</div>{resultView === 'dataflow' ? <div className="mt-4 max-h-80 space-y-2 overflow-auto">{result.dataflow_files.map((file) => <button key={file.relative_path} onClick={() => setSelectedDataflowFile(file.relative_path)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${selectedDataflow?.relative_path === file.relative_path ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-600'}`}>{file.name}</button>)}</div> : null}</aside><main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="border-b border-slate-200 pb-4 text-2xl font-black tracking-tight text-slate-900">{resultView === 'final' ? '最终报告' : resultView === 'report' ? '运行报告' : resultView === 'dataflow' ? selectedDataflow?.name || '函数级结果' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{resultContent}</pre> : <MarkdownContent content={resultContent} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">关键文件</div><div className="mt-3 space-y-2">{[...(result.output_files || []), ...(result.dataflow_files || [])].map((file) => <div key={file.relative_path} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="font-mono text-[11px] text-slate-700 break-all">{file.relative_path}</div><div className="mt-1 text-[10px] text-slate-400">{formatNumber(file.size)} bytes</div></div>)}</div></aside></section>}
          </section>
        ) : (
          <section className="space-y-4">{evaluationLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">加载观测指标中...</section> : !evaluation || !evaluation.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><BarChart3 size={20} /></div><div className="mt-4 text-base font-bold text-slate-800">当前任务尚未生成观测指标</div></section> : <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><MetricCard label="总轮数" value={formatNumber(evaluation.summary.round_count)} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={formatNumber(evaluation.summary.passed_round_count)} icon={<CheckCircle2 size={18} />} /><MetricCard label="追踪函数" value={formatNumber(evaluation.summary.function_count)} icon={<ScrollText size={18} />} /><MetricCard label="总 Token" value={formatNumber(evaluation.summary.total_tokens)} icon={<ScrollText size={18} />} /><MetricCard label="总 Cost" value={formatCost(evaluation.summary.total_cost)} icon={<ScrollText size={18} />} /></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2><p className="mt-1 text-xs text-slate-400">展示每一轮 Worker/Judge 的观测指标，点击行展开完整 JSON</p></div><div className="relative"><Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" /><input value={evaluationKeyword} onChange={(e) => setEvaluationKeyword(e.target.value)} placeholder="过滤轮次" className="rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs" /></div></div><div className="mt-4 overflow-auto rounded-2xl border border-slate-200"><table className="min-w-full divide-y divide-slate-200 text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Round</th><th className="px-3 py-3">函数</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">通过率</th><th className="px-3 py-3">Token</th><th className="px-3 py-3">Cost</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{filteredRounds.map((round: AppDfaEvaluationRound, index) => { const roundNo = Number(round.round ?? index + 1); const metrics = round.metrics || {}; return <React.Fragment key={`${roundNo}-${index}`}><tr onClick={() => setExpandedRound(expandedRound === roundNo ? null : roundNo)} className="cursor-pointer hover:bg-slate-50"><td className="px-3 py-3 font-mono text-slate-700">{round.round ?? index + 1}</td><td className="px-3 py-3 font-mono text-slate-700">{round.function || round.func || round.entry || '-'}</td><td className="px-3 py-3 font-bold text-slate-700">{round.status || (round.passed ? 'passed' : '-')}</td><td className="px-3 py-3">{formatRate(metrics.review_pass_rate)}</td><td className="px-3 py-3">{formatNumber(metrics.token_total ?? round.token_usage?.total_tokens)}</td><td className="px-3 py-3">{formatCost(metrics.cost ?? round.token_usage?.cost)}</td></tr>{expandedRound === roundNo ? <tr><td colSpan={6} className="bg-slate-950 p-4"><pre className="max-h-96 overflow-auto text-xs text-slate-100">{JSON.stringify(round, null, 2)}</pre></td></tr> : null}</React.Fragment>; })}</tbody></table>{filteredRounds.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的轮次</div> : null}</div></section></>}</section>
        )
      ) : !loading ? <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div> : null}
    </div>
  );
};
