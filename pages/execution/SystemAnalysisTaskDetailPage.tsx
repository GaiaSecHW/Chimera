import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FolderOpen,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import {
  AppSaResultModule,
  AppSaSessionEvent,
  AppSaSessionMeta,
  AppSaSessionSnapshot,
  AppSaStageEvent,
  AppSaTaskDetail,
  AppSaTaskResult,
} from '../../types/types';
import { FileWatchMessage } from '../../clients/fileserver';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnContext, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard } from './taskOrigin';
import { AgentSessionViewer } from './AgentSessionViewer';

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
  { key: 'preprocess', label: '预处理', desc: '文件过滤 / 目录探索 / 预扫描', triggers: ['filter', 'explore', 'prescan'], artifactSubpath: 'run/workspace' },
  { key: 'classify', label: '全局分类', desc: '全局文件类型分类与脚本检查', triggers: [1, '1'], artifactSubpath: 'run/sessions' },
  { key: 'refine', label: '细分类', desc: '子文件夹细分类与模块划分', triggers: [2, '2'], artifactSubpath: 'run/sessions' },
  { key: 'analyse', label: '安全分析', desc: '各模块安全威胁深度分析', triggers: [3, '3'], artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告生成', desc: '完整性检查 + 最终安全报告', triggers: [4, '4'], artifactSubpath: 'output' },
];

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';
type DetailTab = 'overview' | 'session' | 'result';
type ResultSelection = { type: 'report' } | { type: 'module'; moduleName: string };

const SESSION_THINKING_LEVEL_MAP: Record<string, string> = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  'x-high': 'xhigh',
};

type SessionDeltaParseResult = {
  sessionMeta: Record<string, any> | null;
  events: AppSaSessionEvent[];
  warnings: string[];
  lineCount: number;
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatTsDuration(startTs: number | null, endTs: number | null): string {
  if (!startTs || !endTs || endTs <= startTs) return '';
  const secs = Math.round(endTs - startTs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function computeStageTimes(events: AppSaStageEvent[]): Array<{ startTs: number | null; endTs: number | null }> {
  const result = STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  let taskEndTs: number | null = null;
  for (const evt of events) {
    if (evt.type === 'task_end') taskEndTs = evt.ts;
  }
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (result[i].startTs === null) result[i].startTs = evt.ts;
        break;
      }
    }
  }
  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (result[i].startTs === null) continue;
    let endTs = taskEndTs;
    for (let j = i + 1; j < STAGE_STEPS.length; j++) {
      if (result[j].startTs !== null) {
        endTs = result[j].startTs;
        break;
      }
    }
    result[i].endTs = endTs;
  }
  return result;
}

function deriveStepStatuses(taskStatus: string, events: AppSaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');

  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');

  let lastSeenStep = -1;
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (i > lastSeenStep) lastSeenStep = i;
      }
    }
  }

  if (lastSeenStep === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled') statuses[0] = 'failed';
    return statuses;
  }

  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (i < lastSeenStep) statuses[i] = 'completed';
    else if (i === lastSeenStep) {
      statuses[i] = taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled' ? 'failed' : 'running';
    }
  }

  if ((taskStatus === 'error' || taskStatus === 'failed') && lastSeenStep >= 0) {
    statuses[lastSeenStep] = 'failed';
  }

  return statuses;
}

function formatEventLog(evt: AppSaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'stage': {
      const s = d.stage;
      if (s === 'filter') return `[${ts}] ▶ 开始文件类型过滤  types=${d.types ?? ''} arch=${d.arch ?? ''}`;
      if (s === 'explore') return `[${ts}] ▶ 开始目录探索`;
      if (s === 'prescan') return `[${ts}] ▶ 开始关键词预扫描`;
      if (String(s) === '1') return `[${ts}] ▶ Stage 1 全局分类  第 ${d.attempt ?? 1} 轮`;
      if (String(s) === '2') return `[${ts}] ▶ Stage 2 细分类`;
      if (String(s) === '3') return `[${ts}] ▶ Stage 3 安全分析`;
      if (String(s) === '4') return `[${ts}] ▶ Stage 4 报告生成`;
      return `[${ts}] ▶ Stage ${s}`;
    }
    case 'stage_result': {
      const s = d.stage;
      if (s === 'filter') return `[${ts}] ✓ 过滤完成，发现 ${d.file_count ?? 0} 个文件`;
      if (s === 'prescan') return `[${ts}] ✓ 预扫描完成，${d.summary_lines ?? 0} 行摘要`;
      return `[${ts}] ✓ ${s} 阶段完成`;
    }
    case 'model': {
      const parts = [];
      if (d.worker) parts.push(`Worker: ${d.worker}`);
      if (d.judge) parts.push(`Judge: ${d.judge}`);
      if (d.model) parts.push(`Model: ${d.model}`);
      return `[${ts}]   模型: ${parts.join('  ')}`;
    }
    case 'cli_output': {
      const text = (d.text ?? '').trim();
      const lines = text.split('\n');
      const preview = lines[0].slice(0, 120);
      const extra = lines.length > 1 ? ` (+${lines.length - 1} 行)` : '';
      return `[${ts}] │ ${d.stage ?? ''} 脚本: ${preview}${extra}`;
    }
    case 'agent_stream': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return '';
      return `[${ts}] │ ${d.stage ?? ''}: ${text}`;
    }
    case 'agent_output': {
      const text = (d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
      if (!text) return `[${ts}] ✓ ${d.stage ?? ''} Agent 完成`;
      return `[${ts}] ✓ ${d.stage ?? ''} Agent: ${text}`;
    }
    case 'error': return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    default: return `[${ts}] ${evt.type}: ${JSON.stringify(d)}`;
  }
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

function parseSessionMessageParts(content: unknown): Array<Record<string, any>> {
  const parts: Array<Record<string, any>> = [];
  if (typeof content === 'string') {
    parts.push({ type: 'text', text: content });
    return parts;
  }
  if (!Array.isArray(content)) return parts;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const part = item as Record<string, any>;
    const contentType = String(part.type || '');
    if (contentType === 'text') {
      parts.push({ type: 'text', text: part.text || '' });
    } else if (contentType === 'thinking') {
      parts.push({ type: 'thinking', text: part.thinking || '' });
    } else if (contentType === 'toolCall') {
      parts.push({
        type: 'toolCall',
        name: part.name || '',
        id: part.id || '',
        arguments: part.arguments || {},
      });
    } else if (contentType === 'toolResult') {
      parts.push({ type: 'toolResult', text: part.text || '' });
    } else {
      parts.push({ type: 'unknown', detail: String(item).slice(0, 200) });
    }
  }
  return parts;
}

function parseSessionJsonlObject(obj: Record<string, any>, rawLine: string, lineNo: number): {
  sessionMeta?: Record<string, any>;
  event?: AppSaSessionEvent;
} {
  const eventType = String(obj.type || '');
  if (eventType === 'session') {
    return {
      sessionMeta: {
        id: obj.id || '',
        version: obj.version || '',
        timestamp: obj.timestamp || '',
        cwd: obj.cwd || '',
      },
    };
  }
  if (eventType === 'model_change') {
    return {
      event: {
        type: 'model_change',
        line: lineNo,
        event_index: lineNo,
        timestamp: obj.timestamp || '',
        display_timestamp: obj.timestamp || '',
        provider: obj.provider || '',
        modelId: obj.modelId || '',
        raw_line: rawLine,
      },
    };
  }
  if (eventType === 'thinking_level_change') {
    const level = String(obj.thinkingLevel || '');
    return {
      event: {
        type: 'thinking_level_change',
        line: lineNo,
        event_index: lineNo,
        timestamp: obj.timestamp || '',
        display_timestamp: obj.timestamp || '',
        thinkingLevel: level,
        thinkingLevelClass: `thinking-${SESSION_THINKING_LEVEL_MAP[level.toLowerCase()] || 'off'}`,
        raw_line: rawLine,
      },
    };
  }
  if (eventType === 'message') {
    const msg = obj.message && typeof obj.message === 'object' ? obj.message as Record<string, any> : {};
    const role = String(msg.role || '');
    const event: AppSaSessionEvent = {
      type: 'message',
      line: lineNo,
      event_index: lineNo,
      timestamp: obj.timestamp || '',
      display_timestamp: obj.timestamp || '',
      role,
      render_role: role,
      parts: parseSessionMessageParts(msg.content),
      raw_line: rawLine,
    };
    if (role === 'toolResult') {
      event.toolCallId = msg.toolCallId || msg.tool_call_id || '';
      event.toolName = msg.toolName || msg.tool_name || '';
      event.isError = Boolean(msg.isError ?? msg.is_error ?? false);
    }
    return { event };
  }
  return {
    event: {
      type: eventType || 'unknown_event',
      line: lineNo,
      event_index: lineNo,
      display_timestamp: obj.timestamp || '',
      summary: JSON.stringify(obj).slice(0, 200),
      raw_line: rawLine.slice(0, 200),
    },
  };
}

function parseSessionJsonlDelta(lines: string[], startLine: number): SessionDeltaParseResult {
  const events: AppSaSessionEvent[] = [];
  const warnings: string[] = [];
  let sessionMeta: Record<string, any> | null = null;
  let lineCount = 0;

  lines.forEach((rawLine, index) => {
    const lineNo = startLine + index;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    lineCount += 1;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        events.push({ type: 'raw', line: lineNo, raw_line: trimmed.slice(0, 200), summary: trimmed.slice(0, 200) });
        return;
      }
      const mapped = parseSessionJsonlObject(parsed as Record<string, any>, trimmed, lineNo);
      if (mapped.sessionMeta) {
        sessionMeta = mapped.sessionMeta;
      }
      if (mapped.event) {
        events.push(mapped.event);
      }
    } catch {
      warnings.push(`第 ${lineNo} 行 JSON 解析失败`);
      events.push({ type: 'raw', line: lineNo, raw_line: trimmed.slice(0, 200), summary: trimmed.slice(0, 200) });
    }
  });

  return { sessionMeta, events, warnings, lineCount };
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: fsPath } }));
}

function formatSessionMtime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString('zh-CN');
}

function sessionGroupLabel(group: string) {
  if (group === 'root') return '根会话';
  return group;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words leading-6 text-sm text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          h1: ({ children }) => <h1 className="mb-3 text-xl font-black text-slate-900 last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 text-lg font-black text-slate-900 last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-base font-black text-slate-900 last:mb-0">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 italic text-slate-700 last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
          th: ({ children }) => <th className="border border-slate-200 px-3 py-2 font-black text-slate-800">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
          code: ({ children, className }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className="block overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100">{children}</code>;
            }
            return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900">{children}</code>;
          },
          pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function riskTone(level?: string | null) {
  if (level === '高') return 'border-red-200 bg-red-50 text-red-700';
  if (level === '中') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (level === '低') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 text-sm text-slate-700">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">{icon}</div>
      </div>
    </div>
  );
}

export const SystemAnalysisTaskDetailPage: React.FC<{
  projectId: string;
  taskId: string;
  onBack: () => void;
}> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const hasReturnContext = hasBinarySecurityReturnContext();
  const [detail, setDetail] = useState<AppSaTaskDetail | null>(null);
  const [result, setResult] = useState<AppSaTaskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selection, setSelection] = useState<ResultSelection>({ type: 'report' });
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AppSaSessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const [sessionEvents, setSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);

  const handleBack = () => {
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await appApi.getTask(taskId);
      setDetail(data);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadResult = async () => {
    if (!taskId) return;
    setResultLoading(true);
    try {
      const data = await appApi.getTaskResult(taskId);
      setResult(data);
    } catch (err: any) {
      notify(`加载任务结果失败: ${err?.message || err}`, 'error');
    } finally {
      setResultLoading(false);
    }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      if (sessionSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          sessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
        } catch {
          // ignore close handshake failures
        }
      }
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  const loadSessions = async (options?: { silent?: boolean }) => {
    if (!taskId) return;
    if (!options?.silent) {
      setSessionsLoading(true);
      setSessionsError(null);
    }
    try {
      const data = await appApi.listTaskSessions(taskId);
      setSessions(data);
      setSessionsError(null);
      setSelectedSessionPath((current) => {
        if (current && data.some((item) => item.relative_path === current)) {
          return current;
        }
        const active = data.find((item) => item.is_active);
        return active?.relative_path || data[0]?.relative_path || null;
      });
    } catch (err: any) {
      setSessionsError(err?.message || String(err));
    } finally {
      if (!options?.silent) {
        setSessionsLoading(false);
      }
    }
  };

  const loadSessionFile = async (path: string) => {
    if (!taskId || !path) return;
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
      setSessionWatchStartLine(0);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionError(err?.message || String(err));
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [taskId]);

  useEffect(() => () => closeSessionSocket(), []);

  useEffect(() => {
    if (!detail || !['running', 'pending'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);

  useEffect(() => {
    if (!detail || !['running', 'pending'].includes(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);

  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detail?.stages_json?.events?.length, logsExpanded]);

  useEffect(() => {
    if (activeTab !== 'result') return;
    void loadResult();
  }, [activeTab, taskId]);

  useEffect(() => {
    if (activeTab !== 'session') {
      closeSessionSocket();
      return;
    }
    void loadSessions();
  }, [activeTab, taskId]);

  useEffect(() => {
    if (activeTab !== 'session') return;
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadSessions({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath) {
      if (activeTab !== 'session') {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
        setSessionError(null);
      }
      return;
    }
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, selectedSessionPath, taskId]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath || !sessionSnapshot) return;
    if (!['pending', 'running'].includes(detail?.status || '')) {
      setSessionLive(false);
      return;
    }
    if (!detail?.output_path) {
      setSessionLive(false);
      setSessionError('当前任务缺少输出路径，无法建立实时监听');
      return;
    }
    const sessionAbsPath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(sessionAbsPath, projectId);
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
      start_line: sessionWatchStartLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => {
      setSessionLive(['pending', 'running'].includes(detail?.status || ''));
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
          const parsed = parseSessionJsonlDelta(deltaLines, (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length > 0) {
            setSessionEvents((current) => current.concat(parsed.events));
          }
          if (parsed.warnings.length > 0) {
            setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          if (parsed.sessionMeta) {
            setSessionSnapshot((current) => current ? {
              ...current,
              session_meta: {
                ...(current.session_meta || {}),
                ...parsed.sessionMeta,
              },
              line_count: message.to_line ?? current.line_count,
            } : current);
          } else {
            setSessionSnapshot((current) => current ? { ...current, line_count: message.to_line ?? current.line_count } : current);
          }
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
      } catch (err: any) {
        setSessionError(err?.message || String(err));
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
        socket.close();
      }
    };
  }, [activeTab, selectedSessionPath, sessionSnapshot?.path, sessionWatchStartLine, taskId, detail?.status, detail?.output_path, detail?.task_id, projectId]);

  useEffect(() => {
    if (!result) return;
    if (selection.type === 'report') return;
    if (!result.modules.some((item) => item.module_name === selection.moduleName)) {
      setSelection({ type: 'report' });
    }
  }, [result, selection]);

  const handleCancel = async () => {
    if (!detail) return;
    try {
      await appApi.cancelTask(detail.task_id);
      notify('任务已取消', 'success');
      await loadDetail();
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${detail.task_name}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(detail.task_id, true);
      notify('任务已删除', 'success');
      handleBack();
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const handleRestart = async () => {
    if (!detail) return;
    setRestarting(true);
    try {
      await appApi.restartTask(detail.task_id);
      notify('任务已重新启动', 'success');
      await loadDetail();
      if (activeTab === 'result') await loadResult();
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleResume = async () => {
    if (!detail) return;
    setResuming(true);
    try {
      await appApi.resumeTask(detail.task_id);
      notify('已从断点继续', 'success');
      await loadDetail();
      if (activeTab === 'result') await loadResult();
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const stageStatuses = detail
    ? deriveStepStatuses(detail.status, detail.stages_json?.events ?? [])
    : STAGE_STEPS.map((): StepStatus => 'pending');
  const stageTimes = detail
    ? computeStageTimes(detail.stages_json?.events ?? [])
    : STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  const logLines = detail?.stages_json?.events?.map(formatEventLog) ?? [];
  const selectedModule = useMemo<AppSaResultModule | null>(() => {
    if (!result || selection.type !== 'module') return null;
    return result.modules.find((item) => item.module_name === selection.moduleName) || null;
  }, [result, selection]);
  const selectedMarkdown = selection.type === 'report'
    ? result?.final_report_markdown || ''
    : selectedModule?.module_report_markdown || '';
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const resultAvailable = Boolean(result?.available);
  const moduleCount = result?.summary.module_count || result?.modules.length || 0;
  const highRiskCount = result?.summary.high_risk_module_count || result?.modules.filter((item) => item.risk_level === '高').length || 0;
  const selectedSession = useMemo(
    () => sessions.find((item) => item.relative_path === selectedSessionPath) || null,
    [sessions, selectedSessionPath],
  );
  const groupedSessions = useMemo(() => {
    const map = new Map<string, AppSaSessionMeta[]>();
    for (const session of sessions) {
      const list = map.get(session.stage_group) || [];
      list.push(session);
      map.set(session.stage_group, list);
    }
    return Array.from(map.entries());
  }, [sessions]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              {hasReturnContext ? '返回原任务' : '返回任务列表'}
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{detail?.task_name || '任务详情'}</h1>
              {detail ? (
                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-500 break-all">{detail?.input_path || '正在加载任务详情。'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && (detail.status === 'running' || detail.status === 'pending') ? (
              <button onClick={() => void handleCancel()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                取消任务
              </button>
            ) : null}
            {detail && !['pending', 'running'].includes(detail.status) ? (
              <button
                onClick={() => void handleRestart()}
                disabled={restarting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
              >
                {restarting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                重新运行
              </button>
            ) : null}
            {detail && detail.started_at && !['pending', 'running'].includes(detail.status) ? (
              <button
                onClick={() => void handleResume()}
                disabled={resuming}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {resuming ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                断点续跑
              </button>
            ) : null}
            {detail ? (
              <button
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 size={13} />
                删除任务
              </button>
            ) : null}
            <button onClick={() => {
              void loadDetail();
              if (activeTab === 'result') void loadResult();
            }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="刷新">
              <RefreshCw size={14} className={loading || resultLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {detail ? <div className="mt-5"><TaskOriginCard origin={detail} /></div> : null}
      </section>

      {loading && !detail ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        </section>
      ) : null}

      {detail ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'overview' as DetailTab, label: '总览' },
                { id: 'session' as DetailTab, label: '智能体会话' },
                { id: 'result' as DetailTab, label: '结果' },
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
              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
                  <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                    <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                    <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                    <InfoRow label="输入路径" value={<span className="font-mono break-all">{detail.input_path}</span>} />
                    <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                    <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono break-all">{detail.output_path}</span> : '-'} />
                    <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                    <InfoRow label="描述" value={detail.task_description || '-'} />
                    <InfoRow label="耗时" value={detail.started_at ? formatDuration(detail.started_at, detail.finished_at ?? undefined) : '-'} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
                  <div className="mt-4 space-y-3">
                    {STAGE_STEPS.map((step, i) => {
                      const st = stageStatuses[i];
                      const timing = stageTimes[i];
                      const timingStr = st === 'completed' || st === 'failed'
                        ? formatTsDuration(timing.startTs, timing.endTs)
                        : st === 'running' && timing.startTs
                          ? formatTsDuration(timing.startTs, clockNow)
                          : '';
                      const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : null;
                      const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                      return (
                        <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                              st === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                                : st === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600'
                                  : st === 'failed' ? 'border-red-400 bg-red-50 text-red-600'
                                    : 'border-slate-200 bg-white text-slate-400'
                            }`}>
                              {st === 'completed' ? <CheckCircle2 size={16} className="text-emerald-500" />
                                : st === 'running' ? <Loader2 size={14} className="animate-spin text-blue-500" />
                                  : st === 'failed' ? <XCircle size={16} className="text-red-500" />
                                    : <span>{i + 1}</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-slate-900">{step.label}</p>
                                {timingStr ? <span className="text-[11px] font-mono text-slate-500">⏱ {timingStr}</span> : null}
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{step.desc}</p>
                              {artifactFsPath && st !== 'pending' ? (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <button
                                    onClick={() => openInFileExplorer(artifactFsPath)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50"
                                  >
                                    <FolderOpen size={11} />
                                    打开阶段输出
                                  </button>
                                  <button
                                    onClick={() => { if (artifactFull) void navigator.clipboard.writeText(artifactFull); }}
                                    title="复制容器路径"
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                                  >
                                    <ClipboardCopy size={10} />
                                    复制路径
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {detail.error ? (
                <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2>
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre>
                </section>
              ) : null}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setLogsExpanded((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2>
                    <p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p>
                  </div>
                  {logsExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {logsExpanded ? (
                  logLines.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">
                      {detail.status === 'pending' ? '任务尚未开始，暂无日志' : '暂无阶段事件（日志在任务运行期间每 5 秒刷新一次）'}
                    </div>
                  ) : (
                    <div
                      ref={logScrollRef}
                      className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300"
                    >
                      {logLines.map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            !line ? 'h-1'
                              : line.includes('✗') ? 'text-red-400'
                                : line.includes('▶') ? 'text-cyan-300'
                                  : line.includes('✓') ? 'text-emerald-400'
                                    : line.includes('│') && line.includes('脚本') ? 'text-yellow-300'
                                      : line.includes('│') ? 'text-slate-400 text-[11px]'
                                        : line.includes('模型') ? 'text-slate-400'
                                          : 'text-slate-300'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </section>
            </>
          ) : activeTab === 'session' ? (
            <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div>
                    <div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div>
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

                {sessionsError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {sessionsError}
                  </div>
                ) : null}

                {sessionsLoading && sessions.length === 0 ? (
                  <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    加载会话中...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    当前任务暂无智能体会话文件
                  </div>
                ) : (
                  <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
                    {groupedSessions.map(([group, items]) => (
                      <div key={group}>
                        <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {sessionGroupLabel(group)}
                        </div>
                        <div className="space-y-2">
                          {items.map((session) => {
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
                                    <div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                      {session.relative_path}
                                    </div>
                                  </div>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    session.is_active
                                      ? selected
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : selected
                                        ? 'border-slate-500 bg-slate-800 text-slate-100'
                                        : 'border-slate-200 bg-white text-slate-500'
                                  }`}>
                                    {session.is_active ? '活跃' : '历史'}
                                  </span>
                                </div>
                                <div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                  <span>事件 {session.event_count}</span>
                                  <span>更新时间 {formatSessionMtime(session.mtime)}</span>
                                </div>
                                {session.warnings.length > 0 ? (
                                  <div className={`mt-2 text-[11px] ${selected ? 'text-amber-200' : 'text-amber-700'}`}>
                                    {session.warnings[0]}
                                  </div>
                                ) : null}
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
                  sessionMeta={selectedSession}
                  sessionHeader={sessionSnapshot?.session_meta}
                  events={sessionEvents}
                  loading={sessionLoading}
                  live={sessionLive}
                  error={sessionError}
                />
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-5">
                <MetricCard label="模块数" value={moduleCount} icon={<ScrollText size={18} />} />
                <MetricCard label="高风险模块" value={highRiskCount} icon={<ShieldAlert size={18} />} />
                <MetricCard label="总文件数" value={result?.summary.total_file_count ?? 0} icon={<FolderOpen size={18} />} />
                <MetricCard label="威胁总数" value={result?.summary.threat_count ?? 0} icon={<AlertTriangle size={18} />} />
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div>
                  <div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!resultRootFsPath}
                      onClick={() => { if (resultRootFsPath) openInFileExplorer(resultRootFsPath); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderOpen size={11} />
                      打开目录
                    </button>
                    <button
                      type="button"
                      disabled={!result?.output_root}
                      onClick={() => { if (result?.output_root) void navigator.clipboard.writeText(result.output_root); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ClipboardCopy size={10} />
                      复制路径
                    </button>
                  </div>
                </div>
              </div>

              {resultLoading ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    加载结果中...
                  </div>
                </section>
              ) : !result ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">
                  暂无结果数据
                </section>
              ) : !resultAvailable ? (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <ScrollText size={20} />
                  </div>
                  <div className="mt-4 text-base font-bold text-slate-800">任务完成后可查看结果</div>
                  <div className="mt-2 text-sm text-slate-500">当前状态：{STATUS_LABEL[result.status] || result.status}</div>
                </section>
              ) : (
                <>
                  {result.warnings.length > 0 ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                        <AlertTriangle size={16} />
                        结果存在部分缺失，以下内容已按可用文件展示
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                        {result.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
                    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div>
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelection({ type: 'report' })}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selection.type === 'report'
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <div className="text-sm font-black">总报告</div>
                          <div className={`mt-1 text-xs ${selection.type === 'report' ? 'text-slate-200' : 'text-slate-500'}`}>完整渲染 final_report.md</div>
                        </button>

                        {result.modules.map((module) => {
                          const selected = selection.type === 'module' && selection.moduleName === module.module_name;
                          return (
                            <button
                              key={module.module_name}
                              type="button"
                              onClick={() => setSelection({ type: 'module', moduleName: module.module_name })}
                              className={`w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
                                selected
                                  ? 'border-slate-900 bg-white text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.12)]'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">#{module.rank}</div>
                                  <div className="mt-1 truncate text-sm font-black">{module.module_name}</div>
                                </div>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${riskTone(module.risk_level)}`}>
                                  {module.risk_level || '未知'}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span>分数 {module.risk_score ?? '-'}</span>
                                <span>文件 {module.file_count}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {selection.type === 'report' ? '最终结果' : '模块报告'}
                          </div>
                          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                            {selection.type === 'report' ? '总报告' : selectedModule?.module_name || '模块报告'}
                          </h2>
                        </div>
                        {selection.type === 'module' && selectedModule ? (
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${riskTone(selectedModule.risk_level)}`}>
                              风险等级：{selectedModule.risk_level || '未知'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                              风险分数：{selectedModule.risk_score ?? '-'}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">
                        {selectedMarkdown ? (
                          <MarkdownContent content={selectedMarkdown} />
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                            当前结果缺少可展示内容
                          </div>
                        )}
                      </div>
                    </main>

                    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {selection.type === 'report' ? '结果说明' : '模块辅助信息'}
                      </div>

                      {selection.type === 'report' ? (
                        <div className="mt-3 space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-bold text-slate-700">模块排序</div>
                            <div className="mt-2 space-y-2">
                              {result.modules.map((module) => (
                                <div key={module.module_name} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                                  <span className="font-mono">#{module.rank}</span>
                                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{module.module_name}</span>
                                  <span className={`rounded-full border px-2 py-0.5 font-bold ${riskTone(module.risk_level)}`}>{module.risk_level || '未知'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={!result.final_report_path}
                              onClick={() => {
                                const fsPath = result.final_report_path ? extractFsRelPath(result.final_report_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开总报告文件
                            </button>
                            <button
                              type="button"
                              disabled={!result.modules_list_path}
                              onClick={() => {
                                const fsPath = result.modules_list_path ? extractFsRelPath(result.modules_list_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开 modules.list
                            </button>
                          </div>
                        </div>
                      ) : selectedModule ? (
                        <div className="mt-3 space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold text-slate-700">文件列表</div>
                                <div className="mt-1 text-[11px] text-slate-500">{selectedModule.file_count} 个文件</div>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600">#{selectedModule.rank}</span>
                            </div>
                            <div className="mt-3 max-h-[380px] space-y-2 overflow-auto pr-1">
                              {selectedModule.files.length > 0 ? selectedModule.files.map((file) => (
                                <div key={file} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
                                  {file}
                                </div>
                              )) : (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
                                  没有 files.list 内容
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-bold text-slate-700">报告结构</div>
                            <div className="mt-2 space-y-2">
                              {selectedModule.report_sections.length > 0 ? selectedModule.report_sections.map((section) => (
                                <div key={section.anchor} className="text-xs text-slate-600">
                                  <span className="mr-2 font-mono text-slate-400">H{section.level}</span>
                                  {section.title}
                                </div>
                              )) : (
                                <div className="text-xs text-slate-400">没有可解析的小节标题</div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={!selectedModule.module_dir_path}
                              onClick={() => {
                                const fsPath = selectedModule.module_dir_path ? extractFsRelPath(selectedModule.module_dir_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开模块目录
                            </button>
                            <button
                              type="button"
                              disabled={!selectedModule.module_report_path}
                              onClick={() => {
                                const fsPath = selectedModule.module_report_path ? extractFsRelPath(selectedModule.module_report_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开报告文件
                            </button>
                            <button
                              type="button"
                              disabled={!selectedModule.files_list_path}
                              onClick={() => {
                                const fsPath = selectedModule.files_list_path ? extractFsRelPath(selectedModule.files_list_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开 files.list
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </aside>
                  </section>
                </>
              )}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
};
