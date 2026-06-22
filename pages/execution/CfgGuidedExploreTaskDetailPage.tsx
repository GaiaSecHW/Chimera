import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Background, Controls, Edge, Handle, MarkerType, Node, NodeProps, Position, ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy,
  Loader2, RefreshCw, RotateCcw, Search, ScrollText, Trash2, XCircle,
  ShieldAlert, ShieldCheck, MapPin, Wrench, FileText, Cpu, Clock, GitBranch,
  Network, Crosshair, Workflow, Bug, Terminal, ListTree,
} from 'lucide-react';

import { api } from '../../clients/api';
import type {
  CfgAgentSession, CfgCparserSession, CfgCodemapQuery, CfgFunctionTaintState, CfgAuditResult,
} from '../../clients/cfgGuidedExplore';
import {
  AppDfaTaskDetail,
  AppDfaTaskEvent,
  AppDfaTaskResult,
  AppDfaVulnFinding,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppDfaSessionEvent,
} from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  hasBinarySecurityReturnTarget,
  hasExecutionReturnContext,
  navigateBackByTaskOrigin,
  navigateBackToExecutionView,
  navigateBackToBinarySecurityTask,
} from '../../utils/executionReturnContext';
import { AgentSessionViewer } from './AgentSessionViewer';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { DataflowAnalysisTaskConfigPanel } from './TaskConfigPanels';
import { TaskOriginCard } from './taskOrigin';
import { AbnormalReasonCard } from './AbnormalReasonCard';
import { buildSessionSnapshotFromText } from './sessionParsing';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中', running: '分析中', passed: '通过',
  failed: '失败', error: '错误', cancelled: '已取消', cancelling: '取消中',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
  cancelling: 'bg-amber-100 text-amber-700',
};

const SEVERITY_STYLE: Record<string, { badge: string; bar: string; label: string }> = {
  CRITICAL: { badge: 'bg-rose-100 text-rose-700 border-rose-200', bar: 'bg-rose-500', label: '严重' },
  HIGH: { badge: 'bg-orange-100 text-orange-700 border-orange-200', bar: 'bg-orange-500', label: '高危' },
  MEDIUM: { badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-500', label: '中危' },
  LOW: { badge: 'bg-sky-100 text-sky-700 border-sky-200', bar: 'bg-sky-500', label: '低危' },
  INFO: { badge: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-400', label: '提示' },
};
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const TOOL_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  getfunctioninfo: { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', label: 'functioninfo' },
  getcallee: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500', label: 'callee' },
  getcaller: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'caller' },
};

type DetailTab = 'overview' | 'walk' | 'tools' | 'graph' | 'result' | 'task-config';

// ── helpers ──────────────────────────────────────────────────────────────────
function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
}
function formatLiveDuration(startedAt?: string | null, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const secs = Math.max(0, nowSecs - Math.floor(new Date(startedAt).getTime() / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
}
function formatSecs(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '-';
  const s = Math.round(value);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}
function shortFid(fid?: string): string {
  return fid ? fid.slice(0, 8) : '-';
}
function isVulnResult(result?: string): boolean {
  const r = String(result || '').toLowerCase();
  return r.includes('vuln') || r.includes('unsafe') || r.includes('danger') || r === 'bug';
}

// ── small UI atoms ───────────────────────────────────────────────────────────
function StatChip({ icon, label, value, tone = 'default' }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'default' | 'danger' | 'ok';
}) {
  const ring = tone === 'danger' ? 'border-rose-200 bg-rose-50' : tone === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white';
  const valTone = tone === 'danger' ? 'text-rose-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-900';
  const iconTone = tone === 'danger' ? 'text-rose-500' : tone === 'ok' ? 'text-emerald-500' : 'text-slate-400';
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${ring}`}>
      <span className={iconTone}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
        <div className={`text-lg font-semibold leading-tight ${valTone}`}>{value}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-xs text-slate-400">{label}</span><span className="text-xs text-slate-700 break-all">{value}</span></div>;
}

function SectionCard({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{icon}{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ── Overview: milestone timeline ─────────────────────────────────────────────
function MilestoneTimeline({ session }: { session?: CfgAgentSession | null }) {
  const steps = session?.steps || [];
  if (!steps.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">暂无审计里程碑(任务启动后生成)</div>;
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-5">
            {!last ? <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" /> : null}
            <span className="relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-emerald-500 bg-white" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                <span className="font-mono text-[11px] text-slate-400">{(s.ts || '').slice(11) || s.ts}</span>
              </div>
              <div className="mt-0.5 break-words text-xs text-slate-500">{s.detail}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Audit walk: function list + detail ───────────────────────────────────────
interface WalkFn {
  fid: string;
  name: string;
  taint?: CfgFunctionTaintState;
  audit?: CfgAuditResult;
}

function mergeWalk(session?: CfgCparserSession | null): WalkFn[] {
  if (!session) return [];
  const ts = session.function_taint_states || {};
  const ar = session.audit_results || {};
  const order: string[] = [];
  const seen = new Set<string>();
  // Preserve discovery order: taint states first (entry → downstream), then any audit-only.
  for (const fid of Object.keys(ts)) { if (!seen.has(fid)) { seen.add(fid); order.push(fid); } }
  for (const fid of Object.keys(ar)) { if (!seen.has(fid)) { seen.add(fid); order.push(fid); } }
  return order.map((fid) => ({
    fid,
    name: ts[fid]?.function || ar[fid]?.function || fid,
    taint: ts[fid],
    audit: ar[fid],
  }));
}

function FnBadge({ audit }: { audit?: CfgAuditResult }) {
  if (!audit) return <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">未判定</span>;
  if (isVulnResult(audit.result)) return <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700"><Bug size={10} />{audit.result}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ShieldCheck size={10} />{audit.result}</span>;
}

function ThreeElementDesc({ text }: { text: string }) {
  // Highlight the 【是什么】/【为什么】/【怎么样】 markers when present.
  if (!text) return null;
  const parts = text.split(/(?=【)/g).filter(Boolean);
  if (parts.length <= 1) return <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{text}</p>;
  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => {
        const m = p.match(/^【([^】]+)】([\s\S]*)$/);
        if (!m) return <p key={i} className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{p}</p>;
        return (
          <div key={i} className="text-xs leading-5">
            <span className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{m[1]}</span>
            <span className="text-slate-700">{m[2]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Call graph (xyflow) ──────────────────────────────────────────────────────
interface FnNodeData extends Record<string, unknown> { label: string; vuln: boolean; audited: boolean; selected: boolean }
function FnNode({ data }: NodeProps<Node<FnNodeData>>) {
  const tone = data.vuln
    ? 'border-rose-300 bg-rose-50 text-rose-800'
    : data.audited
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : 'border-slate-300 bg-white text-slate-700';
  const ring = data.selected ? 'ring-2 ring-slate-900 ring-offset-1' : '';
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm ${tone} ${ring}`} style={{ fontFamily: MONO }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-slate-300 !bg-slate-400" />
      {data.label}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border !border-slate-300 !bg-slate-400" />
    </div>
  );
}
const fnNodeTypes = { fn: FnNode };

/** Build directed edges from codemap_queries[].result.callees/callers.
 *  Returns null when no task carries result edges (older tasks → linear fallback). */
function buildCallEdges(session?: CfgCparserSession | null): { edges: Array<[string, string]>; hasResult: boolean } {
  const out: Array<[string, string]> = [];
  let hasResult = false;
  const known = new Set(Object.keys(session?.function_taint_states || {}).concat(Object.keys(session?.audit_results || {})));
  for (const q of session?.codemap_queries || []) {
    if (!q.result) continue;
    if (q.command === 'getcallee' && Array.isArray(q.result.callees)) {
      hasResult = true;
      for (const c of q.result.callees) {
        const to = c?.id || c?.function_id;
        if (to) out.push([q.function_id, to]);
      }
    } else if (q.command === 'getcaller' && Array.isArray(q.result.callers)) {
      hasResult = true;
      for (const c of q.result.callers) {
        const from = c?.id || c?.function_id;
        if (from) out.push([from, q.function_id]);
      }
    }
  }
  // Keep only edges between functions we actually walked (drops external noise).
  const filtered = out.filter(([a, b]) => known.has(a) && known.has(b) && a !== b);
  return { edges: filtered, hasResult };
}

function layoutGraph(walk: WalkFn[], edges: Array<[string, string]>, selectedFid: string | null): { nodes: Node<FnNodeData>[]; flowEdges: Edge[] } {
  // Simple BFS-depth layering from roots (no incoming edge).
  const incoming = new Map<string, number>();
  walk.forEach((w) => incoming.set(w.fid, 0));
  const dedup = new Set<string>();
  const cleanEdges = edges.filter(([a, b]) => { const k = `${a}>${b}`; if (dedup.has(k)) return false; dedup.add(k); return true; });
  cleanEdges.forEach(([, b]) => incoming.set(b, (incoming.get(b) || 0) + 1));
  const depth = new Map<string, number>();
  const queue = walk.filter((w) => (incoming.get(w.fid) || 0) === 0).map((w) => w.fid);
  queue.forEach((f) => depth.set(f, 0));
  const adj = new Map<string, string[]>();
  cleanEdges.forEach(([a, b]) => { adj.set(a, [...(adj.get(a) || []), b]); });
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]; const d = depth.get(cur) || 0;
    for (const nx of adj.get(cur) || []) {
      if (!depth.has(nx)) { depth.set(nx, d + 1); queue.push(nx); }
    }
  }
  walk.forEach((w) => { if (!depth.has(w.fid)) depth.set(w.fid, 0); });
  const byDepth = new Map<number, string[]>();
  walk.forEach((w) => { const d = depth.get(w.fid) || 0; byDepth.set(d, [...(byDepth.get(d) || []), w.fid]); });
  const nodes: Node<FnNodeData>[] = walk.map((w) => {
    const d = depth.get(w.fid) || 0;
    const col = byDepth.get(d) || [];
    const row = col.indexOf(w.fid);
    return {
      id: w.fid,
      type: 'fn',
      position: { x: d * 240, y: row * 70 },
      data: {
        label: w.name,
        vuln: isVulnResult(w.audit?.result),
        audited: Boolean(w.audit),
        selected: selectedFid === w.fid,
      },
    };
  });
  const flowEdges: Edge[] = cleanEdges.map(([a, b], i) => ({
    id: `e${i}_${a}_${b}`,
    source: a, target: b,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
    style: { stroke: '#cbd5e1' },
  }));
  return { nodes, flowEdges };
}

// ── Result: findings (reused look) ───────────────────────────────────────────
function SourceSnippetBlock({ finding }: { finding: AppDfaVulnFinding }) {
  const snippet = finding.source_snippet;
  if (!snippet?.lines?.length && !finding.code) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500"><FileText size={12} />函数源码</div>
      {snippet?.lines?.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <div className="border-b border-slate-800 px-3 py-2 font-mono text-[11px] text-slate-400">{snippet.file || finding.file || 'source'} {snippet.focus_line ? `:${snippet.focus_line}` : ''}</div>
          <pre className="max-h-96 overflow-auto p-0 text-xs leading-5 text-slate-200">
            {snippet.lines.map((ln) => (
              <div key={ln.n} className={`grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-3 ${ln.n === snippet.focus_line ? 'bg-rose-500/20 text-rose-100' : ''}`}>
                <span className="select-none text-right text-slate-500">{ln.n}</span>
                <code className="whitespace-pre">{ln.text || ' '}</code>
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <pre className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-5 text-slate-100">{finding.code}</pre>
      )}
    </div>
  );
}

function FlowTraceBlock({ finding }: { finding: AppDfaVulnFinding }) {
  if (!finding.flow && !finding.source && !finding.sink) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-600"><BarChart3 size={12} />数据流 / 调用链</div>
      {finding.flow ? <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-3 font-mono text-xs leading-5 text-cyan-900">{finding.flow}</div> : null}
    </div>
  );
}

function FindingCard({ finding, index }: { finding: AppDfaVulnFinding; index: number }) {
  const [open, setOpen] = useState(index < 3);
  const sev = (finding.severity || 'INFO').toUpperCase();
  const style = SEVERITY_STYLE[sev] || SEVERITY_STYLE.INFO;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`h-1 w-full ${style.bar}`} />
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50">
        <span className="mt-0.5 text-xs font-medium text-slate-400">#{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.badge}`}><ShieldAlert size={11} />{style.label} · {sev}</span>
            {finding.function ? <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500"><MapPin size={11} />{finding.function}</span> : null}
          </div>
          <div className="mt-2 text-sm font-bold leading-5 text-slate-900">{finding.title || finding.vulnerability || '漏洞'}</div>
        </div>
        <span className="mt-1 text-slate-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          {finding.alarm ? <div><div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400"><Search size={12} />判定理由</div><div className="prose prose-sm prose-slate max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{finding.alarm}</ReactMarkdown></div></div> : null}
          <FlowTraceBlock finding={finding} />
          <SourceSnippetBlock finding={finding} />
          {finding.proposed_fix ? <div><div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-500"><Wrench size={12} />修复建议</div><div className="prose prose-sm prose-slate max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{finding.proposed_fix}</ReactMarkdown></div></div> : null}
        </div>
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export const CfgGuidedExploreTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.cfgGuidedExplore;
  const { notify, feedbackNodes } = useUiFeedback();

  const [detail, setDetail] = useState<AppDfaTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [trace, setTrace] = useState<CfgAgentSession | null>(null);
  const [session, setSession] = useState<CfgCparserSession | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [result, setResult] = useState<AppDfaTaskResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultView, setResultView] = useState<'findings' | 'report' | 'json'>('findings');
  const [selectedFid, setSelectedFid] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<AppDfaTaskEvent[]>([]);
  const [rawOpen, setRawOpen] = useState(false);
  const [sessionsMeta, setSessionsMeta] = useState<AppDfaSessionMeta[]>([]);
  const [snapshot, setSnapshot] = useState<AppDfaSessionSnapshot | null>(null);
  const [snapEvents, setSnapEvents] = useState<AppDfaSessionEvent[]>([]);
  const [sessionDrawer, setSessionDrawer] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const logRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (navigateBackToExecutionView()) return;
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
  const loadTrace = async () => {
    try { const r = await appApi.getAgentTrace(taskId); setTrace(r.agent_session || null); }
    catch { /* best-effort */ }
  };
  const loadSession = async () => {
    try { setSession(await appApi.getCparserSession(taskId)); setSessionMissing(false); }
    catch { setSessionMissing(true); }
  };
  const loadResult = async () => {
    if (resultLoading) return;
    setResultLoading(true);
    try { setResult(await appApi.getTaskResult(taskId)); }
    catch (err: any) { notify(`加载结果失败: ${err?.message || err}`, 'error'); }
    finally { setResultLoading(false); }
  };
  const loadTimeline = async () => {
    try { const d = await appApi.getTimeline(taskId); setTimeline(d.events || []); } catch { /* */ }
  };
  const loadSessionsMeta = async () => {
    try { const d = await appApi.listTaskSessions(taskId); setSessionsMeta(d.items || []); } catch { /* */ }
  };
  const openSessionFile = async (path: string) => {
    setSessionDrawer(true);
    try {
      const snap = await appApi.getTaskSessionFile(taskId, path);
      const text = (snap.events || []).map((e: any) => e.raw_line).filter(Boolean).join('\n');
      const parsed = text ? buildSessionSnapshotFromText(path, text) : null;
      setSnapshot(snap);
      setSnapEvents((parsed?.events || snap.events || []) as AppDfaSessionEvent[]);
    } catch (err: any) { notify(`加载会话失败: ${err?.message || err}`, 'error'); }
  };

  useEffect(() => { void loadDetail(); void loadTrace(); void loadSession(); }, [taskId]);
  useEffect(() => { const t = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (activeTab === 'result' && !result && !resultLoading) void loadResult();
    if (rawOpen && timeline.length === 0) void loadTimeline();
    if (sessionDrawer && sessionsMeta.length === 0) void loadSessionsMeta();
  }, [activeTab, rawOpen, sessionDrawer]);
  useEffect(() => {
    if (detail?.status !== 'running') return;
    const t = setInterval(() => { void loadDetail(); void loadTrace(); void loadSession(); if (rawOpen) void loadTimeline(); }, 10000);
    return () => clearInterval(t);
  }, [detail?.status, taskId, rawOpen]);

  const walk = useMemo(() => mergeWalk(session), [session]);
  const { edges: callEdges, hasResult } = useMemo(() => buildCallEdges(session), [session]);
  const selectedFn = useMemo(() => walk.find((w) => w.fid === selectedFid) || walk[0] || null, [walk, selectedFid]);
  const queriesForSelected = useMemo(
    () => (session?.codemap_queries || []).filter((q) => q.function_id === (selectedFn?.fid)),
    [session, selectedFn],
  );
  const graph = useMemo(() => layoutGraph(walk, callEdges, selectedFn?.fid || null), [walk, callEdges, selectedFn]);

  const cfg = detail?.task_config_json || {};
  const entryName = cfg.function_name || trace?.steps?.find((s) => s.label.includes('入口'))?.detail || '-';
  const entryLoc = [cfg.source_file, cfg.line_hint].filter(Boolean).join(':');
  const vulnCount = trace?.vuln_count ?? (result?.summary?.total_findings ?? null);
  const toolCount = session?.codemap_queries?.length ?? 0;
  const fnCount = walk.length;

  const toolCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of session?.codemap_queries || []) c[q.command] = (c[q.command] || 0) + 1;
    return c;
  }, [session]);

  const cancelTask = async () => { if (!detail) return; await appApi.cancelTask(detail.task_id); notify('任务已取消', 'success'); await loadDetail(); };
  const restartTask = async () => { if (!detail) return; await appApi.restartTask(detail.task_id); notify('任务已重新启动', 'success'); await loadDetail(); };
  const deleteTask = async () => {
    if (!detail) return;
    const ok = await showConfirm({ title: '删除任务', message: `确定删除任务「${detail.task_name}」及其输出文件吗？此操作不可恢复。`, confirmText: '确认删除', cancelText: '取消', danger: true });
    if (!ok) return;
    await appApi.deleteTask(detail.task_id, true); notify('任务已删除', 'success'); onBack();
  };

  const hasReturnContext = hasExecutionReturnContext() || hasBinarySecurityReturnTarget(detail);
  const running = detail ? ['pending', 'running', 'cancelling'].includes(detail.status) : false;

  const TABS: [DetailTab, string, React.ReactNode][] = [
    ['overview', '总览', <ListTree size={14} key="i" />],
    ['walk', '审计走查', <Workflow size={14} key="i" />],
    ['tools', '工具调用', <Terminal size={14} key="i" />],
    ['graph', '调用图', <Network size={14} key="i" />],
    ['result', '结果', <ShieldAlert size={14} key="i" />],
    ['task-config', '任务配置', <FileText size={14} key="i" />],
  ];

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      {/* ── Status bar ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button onClick={handleBack} className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 hover:bg-slate-100"><ArrowLeft size={18} /></button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="truncate font-mono text-xl font-semibold tracking-tight text-slate-900">{entryName}</h1>
                {detail ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[detail.status] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
                {hasReturnContext ? <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-bold text-cyan-700">来自二进制安全总任务</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {entryLoc ? <span className="font-mono">{entryLoc}</span> : null}
                {detail?.input_path ? <span className="truncate">· {detail.input_path}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { void loadDetail(); void loadTrace(); void loadSession(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
            {running ? <button onClick={() => void cancelTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><XCircle size={15} />取消</button> : null}
            {detail && !running ? <button onClick={() => void restartTask()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><RotateCcw size={15} />重试</button> : null}
            {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="dataflow_analysis" task={detail} buttonClassName="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100" /> : null}
            {detail ? <button onClick={() => void deleteTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={15} />删除</button> : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatChip icon={<GitBranch size={18} />} label="审计函数" value={fnCount} />
          <StatChip icon={<Terminal size={18} />} label="工具调用" value={toolCount} />
          <StatChip icon={<Clock size={18} />} label="LLM 耗时" value={running ? formatLiveDuration(detail?.started_at, clockNow) : formatSecs(trace?.llm_duration_sec)} />
          <StatChip icon={vulnCount && vulnCount > 0 ? <Bug size={18} /> : <ShieldCheck size={18} />} label="漏洞数" value={vulnCount == null ? '-' : vulnCount} tone={vulnCount && vulnCount > 0 ? 'danger' : vulnCount === 0 ? 'ok' : 'default'} />
          <StatChip icon={<Cpu size={18} />} label="模型" value={trace?.model || '-'} />
          <StatChip icon={<Clock size={18} />} label="耗时" value={detail?.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail?.started_at, clockNow)} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map(([id, label, icon]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{icon}{label}</button>
        ))}
      </div>

      {loading && !detail ? (
        <div className="py-20 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-3 animate-spin" />加载任务详情中...</div>
      ) : !detail ? (
        <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div>
      ) : activeTab === 'overview' ? (
        <section className="space-y-4">
          <TaskOriginCard origin={detail} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <SectionCard title="审计里程碑" icon={<ListTree size={15} />}>
              <MilestoneTimeline session={trace} />
            </SectionCard>
            <div className="space-y-4">
              {/* Conclusion card */}
              {vulnCount != null ? (
                vulnCount > 0 ? (
                  <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                    <div className="flex items-center gap-2 text-rose-700"><Bug size={18} /><span className="text-base font-bold">发现 {vulnCount} 个漏洞</span></div>
                    <p className="mt-2 text-sm text-rose-700/90">入口 <span className="font-mono">{entryName}</span> 可达漏洞,覆盖 {fnCount} 个函数。</p>
                    <button onClick={() => setActiveTab('result')} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">查看结果 →</button>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-center gap-2 text-emerald-700"><ShieldCheck size={18} /><span className="text-base font-bold">未发现漏洞</span></div>
                    <p className="mt-2 text-sm text-emerald-700/90">覆盖 {fnCount} 个函数,全部判定安全。</p>
                  </section>
                )
              ) : null}
              <SectionCard title="入口与配置" icon={<Crosshair size={15} />}>
                <div className="space-y-2.5">
                  <InfoRow label="入口函数" value={<span className="font-mono">{entryName}</span>} />
                  <InfoRow label="位置" value={entryLoc ? <span className="font-mono">{entryLoc}</span> : '-'} />
                  <InfoRow label="污点参数" value={(cfg.taint_params || []).length ? <span className="font-mono">{(cfg.taint_params || []).join(', ')}</span> : '-'} />
                  <InfoRow label="模型" value={trace?.model || '-'} />
                  <InfoRow label="开始" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="完成" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                </div>
              </SectionCard>
            </div>
          </div>
          {detail.abnormal_reason ? <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} /> : null}
          {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
          {/* Raw events (demoted) */}
          <details open={rawOpen} onToggle={(e) => setRawOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">原始事件 ({timeline.length})</summary>
            <div className="max-h-80 overflow-auto border-t border-slate-100 px-5 py-3" ref={logRef}>
              {timeline.length ? <div className="space-y-1.5 font-mono text-xs">{timeline.map((ev: any) => <div key={ev.id} className="flex gap-2"><span className="text-slate-400">{ev.ts || (ev.at ? new Date(ev.at * 1000).toLocaleTimeString('zh-CN') : '')}</span><span className="font-bold text-slate-600">{ev.event || ev.event_type}</span><span className="text-slate-500">{ev.message || ev.status || ''}</span></div>)}</div> : <div className="text-sm text-slate-400">暂无事件</div>}
            </div>
          </details>
          <button onClick={() => { setSessionDrawer(true); }} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><FileText size={13} />查看智能体会话文件</button>
        </section>
      ) : activeTab === 'walk' ? (
        <section className="space-y-3">
          {/* propagation chain ribbon */}
          {walk.length ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
              <span className="mr-1 font-semibold text-slate-400">污点传播链</span>
              {walk.map((w, i) => (
                <React.Fragment key={w.fid}>
                  {i > 0 ? <span className="text-slate-300">→</span> : null}
                  <button onClick={() => setSelectedFid(w.fid)} className={`rounded-lg px-2 py-0.5 font-mono font-semibold ${selectedFn?.fid === w.fid ? 'bg-slate-900 text-white' : isVulnResult(w.audit?.result) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{w.name}</button>
                </React.Fragment>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">函数走查 ({walk.length})</div>
              {walk.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">{sessionMissing ? '暂无审计走查数据' : '加载中...'}</div> : (
                <div className="max-h-[calc(100vh-22rem)] space-y-1.5 overflow-auto pr-1">
                  {walk.map((w) => {
                    const sel = selectedFn?.fid === w.fid;
                    return (
                      <button key={w.fid} onClick={() => setSelectedFid(w.fid)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${sel ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm font-semibold">{w.name}</span>
                          <FnBadge audit={w.audit} />
                        </div>
                        <div className={`mt-1 truncate text-[11px] ${sel ? 'text-slate-300' : 'text-slate-500'}`}>污点: {w.taint?.tainted_params_in?.length ? w.taint.tainted_params_in.join(', ') : '—'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>
            <div className="space-y-4">
              {!selectedFn ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center text-sm text-slate-400">选择一个函数查看走查详情</div> : (
                <>
                  <SectionCard title={selectedFn.name} icon={<Crosshair size={15} />} action={<FnBadge audit={selectedFn.audit} />}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <InfoRow label="function_id" value={<span className="font-mono">{selectedFn.fid}</span>} />
                      <InfoRow label="污点参数" value={selectedFn.taint?.tainted_params_in?.join(', ') || '—'} />
                      {selectedFn.audit ? <InfoRow label="漏洞行" value={selectedFn.audit.vuln_line || '—'} /> : null}
                      {selectedFn.audit?.confidence != null ? <InfoRow label="置信度" value={selectedFn.audit.confidence} /> : null}
                    </div>
                  </SectionCard>
                  {selectedFn.taint?.desc ? (
                    <SectionCard title="污点状态 (三要素)" icon={<Network size={15} />}><ThreeElementDesc text={selectedFn.taint.desc} /></SectionCard>
                  ) : null}
                  {selectedFn.audit?.desc ? (
                    <SectionCard title="审计判定" icon={<Search size={15} />}><p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{selectedFn.audit.desc}</p></SectionCard>
                  ) : null}
                  <SectionCard title={`该函数的工具调用 (${queriesForSelected.length})`} icon={<Terminal size={15} />}>
                    {queriesForSelected.length === 0 ? <div className="text-xs text-slate-400">无</div> : (
                      <div className="space-y-1.5">
                        {queriesForSelected.map((q, i) => {
                          const ts = TOOL_STYLE[q.command] || { badge: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: q.command };
                          return <div key={i} className="flex items-center gap-2 text-xs"><span className="font-mono text-slate-400">{(q.timestamp || '').slice(11, 19)}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${ts.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${ts.dot}`} />{ts.label}</span><span className="font-mono text-slate-600">{q.params?.func || ''}</span></div>;
                        })}
                      </div>
                    )}
                  </SectionCard>
                </>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === 'tools' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(toolCounts).map(([cmd, n]) => {
              const ts = TOOL_STYLE[cmd] || { badge: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: cmd };
              return <span key={cmd} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${ts.badge}`}><span className={`h-2 w-2 rounded-full ${ts.dot}`} />{ts.label} {n}</span>;
            })}
            <span className="text-xs font-semibold text-slate-400">总计 {toolCount} 次</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {toolCount === 0 ? <div className="px-4 py-12 text-center text-sm text-slate-400">{sessionMissing ? '暂无工具调用记录' : '加载中...'}</div> : (
              <table className="w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <tr><th className="w-12 px-3 py-2">#</th><th className="w-28 px-3 py-2">时间</th><th className="w-40 px-3 py-2">命令</th><th className="px-3 py-2">目标函数</th><th className="w-32 px-3 py-2">function_id</th><th className="w-24 px-3 py-2 text-right">返回</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(session?.codemap_queries || []).map((q, i) => {
                    const ts = TOOL_STYLE[q.command] || { badge: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: q.command };
                    const n = q.result?.callees?.length ?? q.result?.callers?.length;
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{(q.timestamp || '').slice(11, 19)}</td>
                        <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${ts.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${ts.dot}`} />{ts.label}</span></td>
                        <td className="px-3 py-2 font-mono text-slate-700">{q.params?.func || '-'}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{shortFid(q.function_id)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{n != null ? `${n} 项` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : activeTab === 'graph' ? (
        <section className="space-y-3">
          {walk.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-sm text-slate-400">{sessionMissing ? '暂无调用图数据' : '加载中...'}</div>
          ) : !hasResult ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">该任务运行于调用边落盘改动之前,无精确调用边。下方按审计走查顺序线性展示;重跑任务即可生成真实调用图。</div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                {walk.map((w, i) => (
                  <React.Fragment key={w.fid}>
                    {i > 0 ? <span className="text-slate-300">→</span> : null}
                    <span className={`rounded-lg px-2.5 py-1 font-mono text-xs font-semibold ${isVulnResult(w.audit?.result) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{w.name}</span>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="h-[520px] bg-slate-50">
                  <ReactFlow
                    nodes={graph.nodes}
                    edges={graph.flowEdges}
                    nodeTypes={fnNodeTypes}
                    onNodeClick={(_, node) => setSelectedFid(node.id)}
                    fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag zoomOnScroll
                  >
                    <Background color="#e2e8f0" gap={18} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
              </div>
              <SectionCard title="节点详情" icon={<Crosshair size={15} />} action={<FnBadge audit={selectedFn?.audit} />}>
                {!selectedFn ? <div className="text-xs text-slate-400">点击图中节点查看详情</div> : (
                  <div className="space-y-3">
                    <div className="font-mono text-sm font-semibold text-slate-900">{selectedFn.name}</div>
                    <InfoRow label="污点参数" value={selectedFn.taint?.tainted_params_in?.join(', ') || '—'} />
                    {selectedFn.audit ? <InfoRow label="判定" value={selectedFn.audit.result} /> : null}
                    {selectedFn.audit?.desc ? <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600 line-clamp-[12]">{selectedFn.audit.desc}</p> : null}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </section>
      ) : activeTab === 'result' ? (
        <section className="space-y-4">
          {resultLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">加载结果中...</div> : !result ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">尚无结果。</div> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {SEVERITY_ORDER.map((sev) => {
                  const n = result.summary?.findings_by_severity?.[sev] ?? 0;
                  if (!n) return null;
                  return <span key={sev} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${SEVERITY_STYLE[sev].badge}`}>{SEVERITY_STYLE[sev].label} {n}</span>;
                })}
                <span className="text-xs font-semibold text-slate-400">共 {result.summary?.total_findings ?? (result.findings?.length || 0)} 个漏洞</span>
                <div className="ml-auto flex gap-1.5">
                  {([['findings', '漏洞卡'], ['report', '最终报告'], ['json', '结构化 JSON']] as [typeof resultView, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setResultView(id)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                  ))}
                </div>
              </div>
              {resultView === 'findings' ? (
                (result.findings?.length || 0) > 0 ? (
                  <div className="space-y-4">{[...(result.findings || [])].sort((a, b) => SEVERITY_ORDER.indexOf((a.severity || 'INFO').toUpperCase()) - SEVERITY_ORDER.indexOf((b.severity || 'INFO').toUpperCase())).map((f, i) => <FindingCard key={f.id || i} finding={f} index={i} />)}</div>
                ) : (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                    <ShieldCheck size={28} className="mx-auto text-emerald-500" />
                    <div className="mt-3 text-base font-bold text-emerald-800">本次审计未发现漏洞</div>
                    <div className="mt-1 text-sm text-emerald-700/90">{fnCount} 个函数全部判定为安全。</div>
                  </section>
                )
              ) : resultView === 'report' ? (
                result.result_markdown ? <article className="prose prose-slate max-w-none rounded-2xl border border-slate-200 bg-white p-6"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.result_markdown}</ReactMarkdown></article> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">无报告内容</div>
              ) : (
                <pre className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-800">{JSON.stringify(result.result_json || {}, null, 2)}</pre>
              )}
              {(result as any).prompt ? <details className="rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">分析 Prompt</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-slate-100 px-5 py-3 text-xs text-slate-600">{(result as any).prompt?.raw || JSON.stringify((result as any).prompt, null, 2)}</pre></details> : null}
            </>
          )}
        </section>
      ) : (
        <DataflowAnalysisTaskConfigPanel detail={detail} />
      )}

      {/* ── Session drawer ── */}
      {sessionDrawer ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setSessionDrawer(false)}>
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div className="text-sm font-bold text-slate-800">智能体会话文件</div>
              <button onClick={() => setSessionDrawer(false)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"><XCircle size={16} /></button>
            </div>
            <div className="grid flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
              <aside className="overflow-auto border-r border-slate-200 p-3">
                {sessionsMeta.length === 0 ? <div className="text-xs text-slate-400">加载中...</div> : sessionsMeta.map((s) => (
                  <button key={s.relative_path} onClick={() => void openSessionFile(`${s.relative_path}/audit_report.md`)} className="mb-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">{s.display_name}</button>
                ))}
              </aside>
              <div className="overflow-auto p-4">
                <AgentSessionViewer sessionMeta={undefined as any} sessionHeader={snapshot?.session_meta} events={snapEvents as any} loading={false} live={false} error={null} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
