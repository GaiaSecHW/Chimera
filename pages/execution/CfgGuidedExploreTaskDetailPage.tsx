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
  CfgAgentSession, CfgCparserSession, CfgCodemapQuery, CfgFunctionTaintState, CfgAuditResult, CfgWalkFunction,
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

type DetailTab = 'overview' | 'walk' | 'tools' | 'result' | 'task-config';

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
  order: number;          // review sequence index (by audit timestamp)
  ts?: string;            // audit timestamp
  taint?: CfgFunctionTaintState;
  audit?: CfgAuditResult;
  queries: CfgCodemapQuery[];
  meta?: CfgWalkFunction;  // manager-resolved name/signature/code
}

/** Resolve a display name for a fid from any available source (taint > audit > callee/caller items > fid). */
function buildNameIndex(session?: CfgCparserSession | null): Map<string, string> {
  const idx = new Map<string, string>();
  if (!session) return idx;
  for (const [fid, v] of Object.entries(session.function_taint_states || {})) if (v?.function) idx.set(fid, v.function);
  for (const [fid, v] of Object.entries(session.audit_results || {})) if (v?.function && !idx.has(fid)) idx.set(fid, v.function);
  // callee/caller items carry {id, name} — fill any gaps
  for (const q of session.codemap_queries || []) {
    for (const c of [...(q.result?.callees || []), ...(q.result?.callers || [])]) {
      if (c?.id && c?.name && !idx.has(c.id)) idx.set(c.id, c.name);
    }
  }
  return idx;
}

/** Merge taint+audit into a walk ORDERED BY REVIEW SEQUENCE (audit timestamp,
 *  then taint discovery order). This reflects how the model walked from the
 *  source entry through taint propagation. */
function mergeWalk(session?: CfgCparserSession | null, nameIdx?: Map<string, string>, walkFns?: Record<string, CfgWalkFunction>): WalkFn[] {
  if (!session) return [];
  const ts = session.function_taint_states || {};
  const ar = session.audit_results || {};
  const names = nameIdx || buildNameIndex(session);
  const queriesByFid = new Map<string, CfgCodemapQuery[]>();
  for (const q of session.codemap_queries || []) {
    queriesByFid.set(q.function_id, [...(queriesByFid.get(q.function_id) || []), q]);
  }
  const allFids = new Set<string>([...Object.keys(ts), ...Object.keys(ar)]);
  const arr = Array.from(allFids).map((fid) => ({
    fid,
    // manager-resolved name is authoritative, then session hints, then fid
    name: walkFns?.[fid]?.name || names.get(fid) || ts[fid]?.function || ar[fid]?.function || fid,
    ts: ar[fid]?.timestamp,
    taint: ts[fid],
    audit: ar[fid],
    queries: queriesByFid.get(fid) || [],
    meta: walkFns?.[fid],
  }));
  // Sort by audit timestamp (review order); entries without audit go last in taint-discovery order.
  const taintOrder = new Map(Object.keys(ts).map((f, i) => [f, i]));
  arr.sort((a, b) => {
    if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    if (a.ts) return -1;
    if (b.ts) return 1;
    return (taintOrder.get(a.fid) ?? 999) - (taintOrder.get(b.fid) ?? 999);
  });
  return arr.map((w, i) => ({ ...w, order: i }));
}

function FnBadge({ audit }: { audit?: CfgAuditResult }) {
  if (!audit) return <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">未判定</span>;
  if (isVulnResult(audit.result)) return <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700"><Bug size={10} />{audit.result}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ShieldCheck size={10} />{audit.result}</span>;
}

function ThreeElementDesc({ text }: { text: string }) {
  // Highlight 【是什么】/【为什么】/【怎么样】 (taint) or [漏洞类型]/[代码调用链]/[判定理由] (audit).
  if (!text) return null;
  const parts = text.split(/(?=【)|(?=\[(?:漏洞类型|严重程度|代码调用链|判定理由|安全判定)\])/g).filter((p) => p.trim());
  if (parts.length <= 1) return <p className="whitespace-pre-wrap text-xs leading-6 text-slate-700">{text}</p>;
  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        const m = p.match(/^【([^】]+)】([\s\S]*)$/) || p.match(/^\[([^\]]+)\]([\s\S]*)$/);
        if (!m) return <p key={i} className="whitespace-pre-wrap text-xs leading-6 text-slate-700">{p}</p>;
        return (
          <div key={i} className="text-xs leading-6">
            <span className="mr-1.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-700">{m[1].trim()}</span>
            <span className="text-slate-700">{m[2].trim()}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Extract a propagation call-chain (A -> B -> C) from a taint/audit desc, if present. */
function extractChain(desc?: string): string[] {
  if (!desc) return [];
  const m = desc.match(/(?:代码调用链|调用链)[\]\s:：]*([^;；\[【]+)/);
  const seg = m ? m[1] : (desc.includes('->') || desc.includes('→') ? desc : '');
  if (!seg) return [];
  return seg.split(/\s*(?:->|→)\s*/).map((s) => s.trim().replace(/\([^)]*\)/g, '').trim()).filter((s) => /^[A-Za-z_]\w*$/.test(s));
}

// ── Call graph (xyflow) ──────────────────────────────────────────────────────
interface FnNodeData extends Record<string, unknown> { label: string; vuln: boolean; audited: boolean; selected: boolean; order: number }
function FnNode({ data }: NodeProps<Node<FnNodeData>>) {
  const tone = data.vuln
    ? 'border-rose-400 bg-rose-50 text-rose-800'
    : data.audited
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : 'border-slate-300 bg-white text-slate-700';
  const ring = data.selected ? 'ring-2 ring-slate-900 ring-offset-1' : '';
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm ${tone} ${ring}`} style={{ fontFamily: MONO }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-slate-300 !bg-slate-400" />
      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/10 text-[9px] font-bold">{data.order + 1}</span>
      {data.label}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border !border-slate-300 !bg-slate-400" />
    </div>
  );
}
const fnNodeTypes = { fn: FnNode };

interface CallEdge { from: string; to: string; kind: 'call' | 'flow' }
/** Build the call graph. Real callee/caller edges (kind 'call') are the backbone;
 *  the review-order sequence supplies 'flow' edges so the propagation is always
 *  connected even when explicit callee edges are sparse. */
function buildCallEdges(walk: WalkFn[], session: CfgCparserSession | null, nameIdx: Map<string, string>): { edges: CallEdge[]; realCount: number } {
  const known = new Set(walk.map((w) => w.fid));
  const name2fid = new Map<string, string>();
  nameIdx.forEach((name, fid) => { if (!name2fid.has(name)) name2fid.set(name, fid); });
  const seen = new Set<string>();
  const edges: CallEdge[] = [];
  const push = (from: string, to: string, kind: 'call' | 'flow') => {
    if (!from || !to || from === to) return;
    const k = `${from}>${to}`;
    if (seen.has(k)) return;
    seen.add(k); edges.push({ from, to, kind });
  };
  let realCount = 0;
  // 1) explicit callee/caller edges (real call relations)
  for (const q of session?.codemap_queries || []) {
    if (q.command === 'getcallee') for (const c of q.result?.callees || []) { const to = c?.id || c?.function_id; if (to && known.has(to)) { push(q.function_id, to, 'call'); realCount++; } }
    if (q.command === 'getcaller') for (const c of q.result?.callers || []) { const from = c?.id || c?.function_id; if (from && known.has(from)) { push(from, q.function_id, 'call'); realCount++; } }
  }
  // 2) chain edges parsed from audit desc (resolve names → fid)
  for (const w of walk) {
    const chain = extractChain(w.audit?.desc).concat(extractChain(w.taint?.desc));
    for (let i = 0; i < chain.length - 1; i++) {
      const a = name2fid.get(chain[i]); const b = name2fid.get(chain[i + 1]);
      if (a && b && known.has(a) && known.has(b)) push(a, b, 'call');
    }
  }
  // 3) review-order flow edges so the graph is always connected (entry → … by sequence)
  for (let i = 0; i < walk.length - 1; i++) {
    const a = walk[i].fid; const b = walk[i + 1].fid;
    if (!seen.has(`${a}>${b}`) && !seen.has(`${b}>${a}`)) push(a, b, 'flow');
  }
  return { edges, realCount };
}

function layoutGraph(walk: WalkFn[], edges: CallEdge[], selectedFid: string | null): { nodes: Node<FnNodeData>[]; flowEdges: Edge[] } {
  // Layer by BFS depth over 'call' edges; fall back to review order for x.
  const callEdges = edges.filter((e) => e.kind === 'call');
  const incoming = new Map<string, number>();
  walk.forEach((w) => incoming.set(w.fid, 0));
  callEdges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) || 0) + 1));
  const depth = new Map<string, number>();
  const adj = new Map<string, string[]>();
  callEdges.forEach((e) => adj.set(e.from, [...(adj.get(e.from) || []), e.to]));
  const queue = walk.filter((w) => (incoming.get(w.fid) || 0) === 0).map((w) => w.fid);
  queue.forEach((f) => depth.set(f, 0));
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]; const d = depth.get(cur) || 0;
    for (const nx of adj.get(cur) || []) { if (!depth.has(nx)) { depth.set(nx, d + 1); queue.push(nx); } }
  }
  walk.forEach((w, i) => { if (!depth.has(w.fid)) depth.set(w.fid, Math.min(6, Math.floor(i / 4))); });
  const byDepth = new Map<number, string[]>();
  walk.forEach((w) => { const d = depth.get(w.fid) || 0; byDepth.set(d, [...(byDepth.get(d) || []), w.fid]); });
  const nodes: Node<FnNodeData>[] = walk.map((w) => {
    const d = depth.get(w.fid) || 0;
    const col = byDepth.get(d) || [];
    const row = col.indexOf(w.fid);
    return {
      id: w.fid, type: 'fn',
      position: { x: d * 230, y: row * 64 },
      data: { label: w.name, vuln: isVulnResult(w.audit?.result), audited: Boolean(w.audit), selected: selectedFid === w.fid, order: w.order },
    };
  });
  const flowEdges: Edge[] = edges.map((e, i) => ({
    id: `e${i}_${e.from}_${e.to}`, source: e.from, target: e.to,
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: e.kind === 'call' ? '#64748b' : '#cbd5e1' },
    style: e.kind === 'call' ? { stroke: '#64748b' } : { stroke: '#cbd5e1', strokeDasharray: '4 4' },
    animated: false,
  }));
  return { nodes, flowEdges };
}

// ── Result: findings (reused look) ───────────────────────────────────────────
function FunctionCodeBlock({ meta, focusLine }: { meta?: CfgWalkFunction; focusLine?: number | null }) {
  if (!meta) return null;
  const code = meta.code;
  // Only highlight a real vulnerability line; don't fall back to the snippet's
  // centering focus (which is just the function midpoint).
  const focus = focusLine && focusLine > 0 ? focusLine : null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <span className="truncate font-mono text-[12px] text-slate-300">{meta.file_path || '源码'}{meta.start_line ? `:${meta.start_line}-${meta.end_line ?? ''}` : ''}</span>
        {meta.signature ? <span className="hidden shrink-0 truncate font-mono text-[11px] text-slate-500 sm:block" title={meta.signature}>{meta.signature}</span> : null}
      </div>
      {code?.lines?.length ? (
        <pre className="max-h-[460px] overflow-auto p-0 text-[13px] leading-6 text-slate-200">
          {code.lines.map((ln) => (
            <div key={ln.n} className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-3 ${ln.n === focus ? 'bg-rose-500/25 text-rose-50' : ''}`}>
              <span className="select-none text-right text-slate-500">{ln.n}</span>
              <code className="whitespace-pre">{ln.text || ' '}</code>
            </div>
          ))}
        </pre>
      ) : (
        <div className="px-3 py-4 text-[12px] text-slate-400">代码未能读取(文件未挂载或函数无行号信息)。签名: <span className="font-mono text-slate-300">{meta.signature || '—'}</span></div>
      )}
    </div>
  );
}

function ToolCallRow({ q, nameIdx, index }: { q: CfgCodemapQuery; nameIdx: Map<string, string>; index?: number }) {
  const items = q.result?.callees || q.result?.callers || [];
  const kindLabel = q.result?.callees ? 'callees (被调用)' : q.result?.callers ? 'callers (调用者)' : null;
  const [open, setOpen] = useState(false);
  const ts = TOOL_STYLE[q.command] || { badge: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: q.command };
  const hasDetail = items.length > 0;
  const targetName = q.params?.func || nameIdx.get(q.function_id) || shortFid(q.function_id);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={() => hasDetail && setOpen((v) => !v)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${hasDetail ? 'hover:bg-slate-50' : 'cursor-default'}`}>
        {index != null ? <span className="w-7 shrink-0 font-mono text-slate-400">{index + 1}</span> : null}
        <span className="w-16 shrink-0 font-mono text-slate-400">{(q.timestamp || '').slice(11, 19)}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${ts.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${ts.dot}`} />{ts.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-slate-700">{targetName}</span>
        {hasDetail ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{items.length} 项</span> : <span className="shrink-0 text-[10px] text-slate-400">{q.result ? '无返回' : '—'}</span>}
        {hasDetail ? <span className="shrink-0 text-slate-400">{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span> : null}
      </button>
      {open && hasDetail ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{kindLabel}</div>
          <div className="space-y-1">
            {items.map((c: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold text-slate-800">{c.name || shortFid(c.id)}</span>
                  {c.id ? <span className="font-mono text-[10px] text-slate-400">{shortFid(c.id)}</span> : null}
                </div>
                {c.signature ? <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={c.signature}>{c.signature}</div> : null}
                {(c.file_path || c.call_line) ? <div className="mt-0.5 font-mono text-[10px] text-slate-400">{c.file_path || ''}{c.call_line ? `:${c.call_line}` : ''}{c.call_type ? ` · ${c.call_type}` : ''}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  const [walkFns, setWalkFns] = useState<Record<string, CfgWalkFunction>>({});
  const [graphOpen, setGraphOpen] = useState(true);
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
  const loadWalkFns = async () => {
    try {
      const r = await appApi.getWalkFunctions(taskId);
      const map: Record<string, CfgWalkFunction> = {};
      for (const f of r.functions || []) map[f.function_id] = f;
      setWalkFns(map);
    } catch { /* best-effort: names/code unavailable */ }
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

  useEffect(() => { void loadDetail(); void loadTrace(); void loadSession(); void loadWalkFns(); }, [taskId]);
  useEffect(() => { const t = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (activeTab === 'result' && !result && !resultLoading) void loadResult();
    if (rawOpen && timeline.length === 0) void loadTimeline();
    if (sessionDrawer && sessionsMeta.length === 0) void loadSessionsMeta();
  }, [activeTab, rawOpen, sessionDrawer]);
  useEffect(() => {
    if (detail?.status !== 'running') return;
    const t = setInterval(() => { void loadDetail(); void loadTrace(); void loadSession(); void loadWalkFns(); if (rawOpen) void loadTimeline(); }, 10000);
    return () => clearInterval(t);
  }, [detail?.status, taskId, rawOpen]);

  const nameIdx = useMemo(() => {
    const idx = buildNameIndex(session);
    for (const [fid, f] of Object.entries(walkFns)) if (f.name) idx.set(fid, f.name);
    return idx;
  }, [session, walkFns]);
  const walk = useMemo(() => mergeWalk(session, nameIdx, walkFns), [session, nameIdx, walkFns]);
  const { edges: callEdges, realCount } = useMemo(() => buildCallEdges(walk, session, nameIdx), [walk, session, nameIdx]);
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
            <button onClick={() => { void loadDetail(); void loadTrace(); void loadSession(); void loadWalkFns(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
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
        <section className="space-y-4">
          {walk.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-sm text-slate-400">{sessionMissing ? '暂无审计走查数据' : '加载中...'}</div>
          ) : (
            <>
              {/* Collapsible call graph */}
              <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white" open={graphOpen} onToggle={(e) => setGraphOpen((e.target as HTMLDetailsElement).open)}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
                  <Network size={16} className="text-slate-500" />
                  <span className="font-semibold">污点传播 / 调用图</span>
                  <span className="text-xs text-slate-400">{walk.length} 函数 · {callEdges.filter((e) => e.kind === 'call').length} 调用边</span>
                  <span className="ml-auto inline-flex items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded border border-emerald-300 bg-emerald-50" />安全</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded border border-rose-400 bg-rose-50" />漏洞</span>
                  </span>
                </summary>
                <div className="h-[380px] border-t border-slate-100 bg-slate-50">
                  <ReactFlow
                    nodes={graph.nodes}
                    edges={graph.flowEdges}
                    nodeTypes={fnNodeTypes}
                    onNodeClick={(_, node) => setSelectedFid(node.id)}
                    fitView nodesDraggable nodesConnectable={false} elementsSelectable panOnDrag zoomOnScroll
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#e2e8f0" gap={18} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
              </details>

              {/* Left-right: ordered review list + selected detail (with code) */}
              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">审查顺序 ({walk.length})</div>
                  <ol className="relative max-h-[calc(100vh-16rem)] space-y-0 overflow-auto pr-1">
                    {walk.map((w, i) => {
                      const sel = selectedFn?.fid === w.fid;
                      const vuln = isVulnResult(w.audit?.result);
                      const last = i === walk.length - 1;
                      return (
                        <li key={w.fid} className="relative flex gap-2.5">
                          <div className="relative flex flex-col items-center">
                            <span className={`mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${vuln ? 'border-rose-400 bg-rose-50 text-rose-700' : w.audit ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-400'}`}>{i + 1}</span>
                            {!last ? <span className="w-px flex-1 bg-slate-200" /> : null}
                          </div>
                          <button onClick={() => setSelectedFid(w.fid)} className={`mb-2 flex-1 rounded-xl border px-3 py-2.5 text-left transition ${sel ? 'border-slate-400 bg-slate-100 ring-1 ring-slate-300' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-sm font-semibold text-slate-900">{w.name}</span>
                              {vuln ? <Bug size={14} className="text-rose-500" /> : w.audit ? <ShieldCheck size={14} className="text-emerald-500" /> : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">污点 {w.taint?.tainted_params_in?.length ? w.taint.tainted_params_in.join(', ') : '—'}{w.ts ? ` · ${w.ts.slice(11, 19)}` : ''}</div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </aside>
                <div className="space-y-4">
                  {!selectedFn ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center text-sm text-slate-400">点击左侧函数或图节点,查看污点传播、模型推理与源码</div> : (
                    <>
                      <SectionCard title={`#${selectedFn.order + 1} · ${selectedFn.name}`} icon={<Crosshair size={16} />} action={<FnBadge audit={selectedFn.audit} />}>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {selectedFn.meta?.signature ? <div className="sm:col-span-2"><InfoRow label="签名" value={<span className="font-mono text-[13px] text-slate-800">{selectedFn.meta.signature}</span>} /></div> : null}
                          <InfoRow label="位置" value={selectedFn.meta?.file_path ? <span className="font-mono text-[13px]">{selectedFn.meta.file_path}:{selectedFn.meta.start_line}-{selectedFn.meta.end_line}</span> : '—'} />
                          <InfoRow label="污点参数" value={selectedFn.taint?.tainted_params_in?.length ? <span className="font-mono text-[13px] text-rose-600">{selectedFn.taint.tainted_params_in.join(', ')}</span> : '—'} />
                          {selectedFn.audit?.vuln_line ? <InfoRow label="漏洞行" value={<span className="font-mono text-[13px] text-rose-600">{selectedFn.audit.vuln_line}</span>} /> : null}
                          {selectedFn.audit?.confidence != null ? <InfoRow label="置信度" value={selectedFn.audit.confidence} /> : null}
                        </div>
                      </SectionCard>
                      <SectionCard title="函数源码" icon={<FileText size={16} />}>
                        {selectedFn.meta ? <FunctionCodeBlock meta={selectedFn.meta} focusLine={selectedFn.audit?.vuln_line} />
                          : <div className="text-sm text-slate-400">源码解析中…(需后端 walk-functions 接口)</div>}
                      </SectionCard>
                      {selectedFn.taint?.desc ? (
                        <SectionCard title="污点传播 (是什么 / 为什么 / 怎么样)" icon={<Network size={16} />}><ThreeElementDesc text={selectedFn.taint.desc} /></SectionCard>
                      ) : null}
                      {selectedFn.audit?.desc ? (
                        <SectionCard title="模型审计推理 (think)" icon={<Search size={16} />}><ThreeElementDesc text={selectedFn.audit.desc} /></SectionCard>
                      ) : null}
                      <SectionCard title={`该函数的工具调用 (${queriesForSelected.length})`} icon={<Terminal size={16} />}>
                        {queriesForSelected.length === 0 ? <div className="text-sm text-slate-400">无</div> : (
                          <div className="space-y-2">
                            {queriesForSelected.map((q, i) => <ToolCallRow key={i} q={q} nameIdx={nameIdx} />)}
                          </div>
                        )}
                      </SectionCard>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      ) : activeTab === 'tools' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(toolCounts).map(([cmd, n]) => {
              const ts = TOOL_STYLE[cmd] || { badge: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: cmd };
              return <span key={cmd} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${ts.badge}`}><span className={`h-2 w-2 rounded-full ${ts.dot}`} />{ts.label} {n}</span>;
            })}
            <span className="text-xs font-semibold text-slate-400">总计 {toolCount} 次 · {callEdges.filter((e) => e.kind === 'call').length} 条调用边</span>
          </div>
          {toolCount === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">{sessionMissing ? '暂无工具调用记录' : '加载中...'}</div>
          ) : (
            <div className="space-y-2">
              {(session?.codemap_queries || []).map((q, i) => <ToolCallRow key={i} q={q} nameIdx={nameIdx} index={i} />)}
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
