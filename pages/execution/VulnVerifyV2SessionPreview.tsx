import React, { useMemo } from 'react';
import { Bot, ChevronRight, CircleAlert, Code2, Cpu, FileWarning, User, Wrench } from 'lucide-react';

import { buildSessionSnapshotFromText, mergeAgentSessionToolResults } from './sessionParsing';
import type { AppSaSessionEvent } from '../../types/types';

type V2SessionEvent = AppSaSessionEvent & {
  _toolResults?: AppSaSessionEvent[];
};

export interface VulnVerifyV2SessionPreviewProps {
  path: string;
  jsonl: string;
}

function fmtSessionTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : value;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function partText(part: Record<string, any>): string {
  if (part.text != null) return String(part.text);
  if (part.detail != null) return String(part.detail);
  return safeJson(part);
}

function toolResultText(event: AppSaSessionEvent): string {
  return (event.parts || [])
    .filter((part) => part.type === 'text' || part.type === 'toolResult' || part.text != null)
    .map(partText)
    .filter(Boolean)
    .join('\n');
}

function parseRawMessage(event: AppSaSessionEvent): Record<string, any> {
  if (!event.raw_line) return {};
  try {
    const parsed = JSON.parse(event.raw_line);
    return parsed && typeof parsed === 'object' && parsed.message && typeof parsed.message === 'object' ? parsed.message : {};
  } catch {
    return {};
  }
}

const SessionMetricCard: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0 rounded-xl border border-theme-border bg-theme-elevated px-3 py-2">
    <div className="text-xs font-medium uppercase tracking-[0.12em] text-theme-text-muted">{label}</div>
    <div className={`mt-1 truncate text-xs text-theme-text-secondary ${mono ? 'font-mono' : ''}`} title={typeof value === 'string' ? value : undefined}>{value}</div>
  </div>
);

const V2SessionSummary: React.FC<{ path: string; sessionMeta: Record<string, any>; eventCount: number; lineCount: number; warningCount: number }> = ({ path, sessionMeta, eventCount, lineCount, warningCount }) => (
  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-theme-text-primary">Session</div>
        <div className="mt-1 truncate font-mono text-xs text-theme-text-muted" title={path}>{path}</div>
      </div>
      {warningCount ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-signal-amber)]">
          <FileWarning size={12} />{warningCount} 条警告
        </span>
      ) : null}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SessionMetricCard label="Session ID" value={sessionMeta.id || '-'} mono />
      <SessionMetricCard label="Started" value={fmtSessionTime(sessionMeta.timestamp)} />
      <SessionMetricCard label="Events" value={eventCount} />
      <SessionMetricCard label="Lines" value={lineCount} />
    </div>
    <div className="mt-3">
      <SessionMetricCard label="Working Dir" value={sessionMeta.cwd || '-'} mono />
    </div>
  </div>
);

const V2SessionWarnings: React.FC<{ warnings: string[] }> = ({ warnings }) => {
  if (!warnings.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] p-3 text-xs text-[var(--color-signal-amber)]">
      <div className="flex items-center gap-1.5 font-medium"><FileWarning size={13} />部分 JSONL 行解析失败</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {warnings.slice(0, 8).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
      </ul>
      {warnings.length > 8 ? <div className="mt-2 text-xs opacity-80">还有 {warnings.length - 8} 条未显示</div> : null}
    </div>
  );
};

const V2SessionTextPart: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;
  return <div className="whitespace-pre-wrap break-words text-sm leading-6 text-theme-text-primary">{text}</div>;
};

const V2SessionThinkingPart: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;
  return (
    <details className="group rounded-xl border border-theme-border bg-theme-elevated p-3">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-theme-text-muted transition hover:text-theme-text-secondary">
        <ChevronRight size={13} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
        Thinking
      </summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{text}</pre>
    </details>
  );
};

const V2SessionToolCallPart: React.FC<{ part: Record<string, any> }> = ({ part }) => {
  const name = String(part.name || 'tool');
  const args = part.arguments || {};
  const command = name === 'bash' ? String(args.command || '') : '';
  return (
    <div className="rounded-xl border border-theme-border bg-theme-elevated p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-theme-text-secondary">
        <Wrench size={13} className="text-theme-text-muted" />
        <span>Tool Call · {name}</span>
      </div>
      {command ? <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-primary">$ {command}</pre> : null}
      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-theme-text-muted transition hover:text-theme-text-secondary">
          <ChevronRight size={13} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
          参数
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-theme-border bg-theme-surface p-3 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{safeJson(args)}</pre>
      </details>
    </div>
  );
};

const V2SessionToolResultBlock: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const text = toolResultText(event);
  const isError = Boolean(event.isError);
  return (
    <div className={`rounded-xl border p-3 ${isError ? 'border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)]' : 'border-[var(--color-signal-green-border)] bg-[var(--color-signal-green-bg)]'}`}>
      <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${isError ? 'text-[var(--color-signal-red)]' : 'text-[var(--color-signal-green)]'}`}>
        <Wrench size={13} />
        <span>Tool Result · {event.toolName || '-'}</span>
      </div>
      {text ? <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{text}</pre> : null}
    </div>
  );
};

const V2SessionBashExecution: React.FC<{ event: V2SessionEvent }> = ({ event }) => {
  const msg = parseRawMessage(event);
  const command = String(msg.command || '');
  const output = String(msg.output || '');
  const exitCode = msg.exitCode ?? msg.exit_code;
  const isError = Boolean(msg.cancelled || (exitCode !== undefined && exitCode !== null && Number(exitCode) !== 0));
  const payload = command || output ? '' : (event.parts?.length ? safeJson(event.parts) : (event.summary || event.raw_line || ''));
  return (
    <article className={`rounded-2xl border p-4 ${isError ? 'border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)]' : 'border-theme-border bg-theme-surface'}`}>
      <V2SessionCardHeader icon={<Code2 size={14} />} label="BASH" time={event.timestamp || event.display_timestamp} />
      {command ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-primary">$ {command}</pre> : null}
      {exitCode !== undefined && exitCode !== null ? <div className="mt-2 text-xs text-theme-text-muted">Exit Code：{String(exitCode)}</div> : null}
      {output ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{output}</pre> : null}
      {payload ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{payload}</pre> : null}
    </article>
  );
};

const V2SessionCardHeader: React.FC<{ icon?: React.ReactNode; label: string; time?: string }> = ({ icon, label, time }) => (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
    <div className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.1em] text-theme-text-secondary">
      {icon}
      <span>{label}</span>
    </div>
    {time ? <span className="text-theme-text-muted">{fmtSessionTime(time)}</span> : null}
  </div>
);

const V2SessionMessageCard: React.FC<{ event: V2SessionEvent }> = ({ event }) => {
  const role = event.role || 'message';
  if (role === 'bashExecution') return <V2SessionBashExecution event={event} />;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const cardCls = isUser
    ? 'border-[var(--color-signal-blue-border)] bg-[var(--color-signal-blue-bg)]'
    : 'border-theme-border bg-theme-surface';
  const icon = isUser ? <User size={14} /> : isAssistant ? <Bot size={14} /> : <Cpu size={14} />;
  const textParts = (event.parts || []).filter((part) => part.type === 'text');
  const thinkingParts = (event.parts || []).filter((part) => part.type === 'thinking');
  const toolCallParts = (event.parts || []).filter((part) => part.type === 'toolCall');
  const otherParts = (event.parts || []).filter((part) => !['text', 'thinking', 'toolCall'].includes(String(part.type || '')));

  return (
    <article className={`rounded-2xl border p-4 ${cardCls}`}>
      <V2SessionCardHeader icon={icon} label={role} time={event.timestamp || event.display_timestamp} />
      <div className="space-y-3">
        {textParts.map((part, index) => <V2SessionTextPart key={`text-${index}`} text={partText(part)} />)}
        {thinkingParts.map((part, index) => <V2SessionThinkingPart key={`thinking-${index}`} text={partText(part)} />)}
        {toolCallParts.map((part, index) => <V2SessionToolCallPart key={`tool-${part.id || index}`} part={part} />)}
        {otherParts.map((part, index) => <pre key={`other-${index}`} className="rounded-xl border border-theme-border bg-theme-elevated p-3 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{safeJson(part)}</pre>)}
        {(event._toolResults || []).map((toolResult, index) => <V2SessionToolResultBlock key={`result-${toolResult.line || index}`} event={toolResult} />)}
      </div>
    </article>
  );
};

const V2SessionSystemEvent: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const isModel = event.type === 'model_change';
  const isThinking = event.type === 'thinking_level_change';
  const text = isModel
    ? `Model: ${event.provider || ''}/${event.modelId || ''}`
    : isThinking
      ? `Thinking: ${event.thinkingLevel || ''}`
      : event.summary || event.raw_line || event.type;
  return (
    <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-xs text-theme-text-muted">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5"><Cpu size={13} />{text}</span>
        {event.timestamp || event.display_timestamp ? <span>{fmtSessionTime(event.timestamp || event.display_timestamp)}</span> : null}
      </div>
    </div>
  );
};

const V2SessionEventCard: React.FC<{ event: V2SessionEvent }> = ({ event }) => {
  if (event.type === 'message') return <V2SessionMessageCard event={event} />;
  if (event.type === 'model_change' || event.type === 'thinking_level_change') return <V2SessionSystemEvent event={event} />;
  return (
    <div className="rounded-xl border border-theme-border bg-theme-elevated p-3 text-xs text-theme-text-muted">
      <div className="mb-2 flex items-center gap-1.5 font-medium text-theme-text-secondary"><CircleAlert size={13} />{event.type || 'raw'}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{event.summary || event.raw_line || safeJson(event)}</pre>
    </div>
  );
};

export const VulnVerifyV2SessionPreview: React.FC<VulnVerifyV2SessionPreviewProps> = ({ path, jsonl }) => {
  const snapshot = useMemo(() => buildSessionSnapshotFromText(path, jsonl), [path, jsonl]);
  const events = useMemo(() => mergeAgentSessionToolResults(snapshot.events) as V2SessionEvent[], [snapshot.events]);

  if (!jsonl.trim()) return <div className="py-10 text-center text-sm text-theme-text-muted">会话文件为空</div>;

  return (
    <div className="space-y-4">
      <V2SessionSummary path={path} sessionMeta={snapshot.session_meta || {}} eventCount={events.length} lineCount={snapshot.line_count} warningCount={snapshot.warnings.length} />
      <V2SessionWarnings warnings={snapshot.warnings} />
      <div className="space-y-3">
        {events.length ? events.map((event, index) => <V2SessionEventCard key={`${event.type}-${event.line || index}-${index}`} event={event} />) : <div className="py-10 text-center text-sm text-theme-text-muted">暂无会话事件</div>}
      </div>
    </div>
  );
};
