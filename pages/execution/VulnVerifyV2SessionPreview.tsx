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

function inlineJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function getToolPreview(name: string, args: Record<string, any>): string {
  const tool = name.toLowerCase();
  if (tool === 'bash' && args.command) return truncateText(String(args.command));
  if ((tool === 'read' || tool.includes('read')) && args.path) {
    const suffix = args.offset || args.limit ? `:${args.offset || 1}${args.limit ? `+${args.limit}` : ''}` : '';
    return truncateText(`${args.path}${suffix}`);
  }
  if ((tool === 'write' || tool.includes('write')) && args.path) {
    const contentLen = typeof args.content === 'string' ? args.content.length : null;
    return truncateText(`${args.path}${contentLen != null ? ` · ${contentLen} chars` : ''}`);
  }
  if ((tool === 'edit' || tool.includes('edit')) && args.path) {
    const editCount = Array.isArray(args.edits) ? args.edits.length : null;
    return truncateText(`${args.path}${editCount != null ? ` · ${editCount} edits` : ''}`);
  }
  if (tool.includes('grep') || tool.includes('search') || tool === 'rg') {
    return truncateText(String(args.pattern || args.query || args.command || inlineJson(args)));
  }
  if (tool === 'agent' || tool.includes('agent')) {
    return truncateText(String(args.description || args.prompt || inlineJson(args)));
  }
  return truncateText(inlineJson(args));
}

function parseSessionTimeMs(value?: string | number | null): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(ms: number): string {
  if (ms > 0 && ms < 1000) return '<1s';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function toolCallId(part: Record<string, any>): string {
  return String(part.toolCallId || part.tool_call_id || part.id || '');
}

function toolResultCallId(event: AppSaSessionEvent): string {
  const raw = event as Record<string, any>;
  return String(raw.toolCallId || raw.tool_call_id || raw.id || '');
}

function findToolResultForCall(part: Record<string, any>, results: AppSaSessionEvent[] = []): AppSaSessionEvent | undefined {
  const id = toolCallId(part);
  if (id) {
    const matched = results.find((result) => toolResultCallId(result) === id);
    if (matched) return matched;
  }
  return results.length === 1 ? results[0] : undefined;
}

function toolDuration(parentEvent: V2SessionEvent, result?: AppSaSessionEvent): string | null {
  if (!result) return null;
  const start = parseSessionTimeMs(parentEvent.timestamp || parentEvent.display_timestamp);
  const end = parseSessionTimeMs(result.timestamp || result.display_timestamp);
  if (start == null || end == null || end < start) return null;
  return formatDuration(end - start);
}

const V2SessionMetaBar: React.FC<{ sessionMeta: Record<string, any>; eventCount: number; lineCount: number; warningCount: number }> = ({ sessionMeta, eventCount, lineCount, warningCount }) => {
  const rows = [
    ['id', sessionMeta.id || '-'],
    ['started', fmtSessionTime(sessionMeta.timestamp)],
    ['cwd', sessionMeta.cwd || '-'],
    ['events', eventCount],
    ['lines', lineCount],
    ['warnings', warningCount],
  ];
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        {rows.map(([key, value]) => (
          <React.Fragment key={key}>
            <div className="text-theme-text-muted">{key}</div>
            <div className="min-w-0 truncate font-mono text-theme-text-secondary" title={String(value)}>{value}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const V2SessionWarnings: React.FC<{ warnings: string[] }> = ({ warnings }) => {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] px-3 py-2 text-xs text-[var(--color-signal-amber)]">
      <div className="flex items-center gap-2 font-medium"><FileWarning size={16} strokeWidth={2.4} />部分 JSONL 行解析失败</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {warnings.slice(0, 8).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
      </ul>
      {warnings.length > 8 ? <div className="mt-2 text-xs opacity-80">还有 {warnings.length - 8} 条未显示</div> : null}
    </div>
  );
};

const V2SessionTextPart: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;
  return <div className="whitespace-pre-wrap break-words text-xs leading-5 text-theme-text-primary">{text}</div>;
};

const V2SessionThinkingPart: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;
  return (
    <details className="group overflow-hidden rounded-lg border border-theme-border bg-theme-elevated text-xs">
      <summary className="flex h-8 cursor-pointer select-none items-center gap-2 px-3 transition hover:text-theme-text-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 font-medium text-theme-text-muted">Thinking</span>
        <ChevronRight size={13} strokeWidth={2.2} className="shrink-0 text-theme-text-muted transition-transform group-open:rotate-90" />
      </summary>
      <pre className="border-t border-theme-border px-3 py-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{text}</pre>
    </details>
  );
};

const V2SessionToolResultPanel: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const text = toolResultText(event);
  const isError = Boolean(event.isError);
  const isEmpty = !text.trim() || text.trim() === '(no output)';
  return (
    <div className={`border-t px-3 py-2 ${isError ? 'border-[var(--color-signal-red-border)]' : 'border-theme-border'}`}>
      <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-theme-text-muted">Result</div>
      <pre className={`whitespace-pre-wrap break-words font-mono text-xs leading-5 ${isError ? 'text-[var(--color-signal-red)]' : isEmpty ? 'text-theme-text-muted opacity-70' : 'text-theme-text-secondary'} ${isEmpty ? 'italic' : ''}`}>{isEmpty ? '(no output)' : text}</pre>
    </div>
  );
};

const V2SessionToolCallPart: React.FC<{ part: Record<string, any>; parentEvent: V2SessionEvent; toolResults?: AppSaSessionEvent[] }> = ({ part, parentEvent, toolResults = [] }) => {
  const name = String(part.name || part.toolName || 'tool');
  const args = part.arguments || part.input || {};
  const result = findToolResultForCall(part, toolResults);
  const isError = Boolean(result?.isError);
  const preview = getToolPreview(name, args);
  const duration = toolDuration(parentEvent, result);
  return (
    <details className={`group overflow-hidden rounded-lg border bg-theme-elevated text-xs ${isError ? 'border-[var(--color-signal-red-border)]' : 'border-theme-border'}`}>
      <summary className="flex h-8 cursor-pointer select-none items-center gap-2 px-3 transition hover:text-theme-text-primary [&::-webkit-details-marker]:hidden">
        <span className={`shrink-0 font-mono text-xs font-semibold ${isError ? 'text-[var(--color-signal-red)]' : 'text-theme-text-secondary'}`}>{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-theme-text-muted" title={preview}>{preview || '-'}</span>
        {duration ? <span className="shrink-0 font-mono text-xs tabular-nums text-theme-text-muted">{duration}</span> : null}
        <ChevronRight size={13} strokeWidth={2.2} className="shrink-0 text-theme-text-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-theme-border px-3 py-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-theme-text-muted">Arguments</div>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{safeJson(args)}</pre>
      </div>
      {result ? <V2SessionToolResultPanel event={result} /> : null}
    </details>
  );
};

const V2SessionToolResultBlock: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const isError = Boolean(event.isError);
  return (
    <div className={`overflow-hidden rounded-lg border bg-theme-surface text-xs ${isError ? 'border-[var(--color-signal-red-border)]' : 'border-theme-border'}`}>
      <div className={`flex flex-wrap items-center gap-2 px-3 py-1.5 font-semibold ${isError ? 'text-[var(--color-signal-red)]' : 'text-theme-text-secondary'}`}>
        <Wrench size={16} strokeWidth={2.3} />
        <span>Tool Result · {event.toolName || '-'}</span>
      </div>
      <V2SessionToolResultPanel event={event} />
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
    <div className="space-y-2 py-1">
      <V2SessionEventHeader icon={<Code2 size={16} strokeWidth={2.3} />} label="BASH" time={event.timestamp || event.display_timestamp} />
      {command ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-primary">$ {command}</pre> : null}
      {exitCode !== undefined && exitCode !== null ? <div className="text-xs text-theme-text-muted">Exit Code：{String(exitCode)}</div> : null}
      {output ? <pre className={`max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 ${isError ? 'text-[var(--color-signal-red)]' : 'text-theme-text-secondary'}`}>{output}</pre> : null}
      {payload ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{payload}</pre> : null}
    </div>
  );
};

const V2SessionEventHeader: React.FC<{ icon?: React.ReactNode; label: string; time?: string; meta?: React.ReactNode }> = ({ icon, label, time, meta }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
    <div className="inline-flex items-center gap-2 font-medium text-theme-text-muted">
      {icon}
      <span>{label}</span>
      {meta ? <span className="text-theme-text-muted/80">{meta}</span> : null}
    </div>
    {time ? <span className="text-theme-text-muted">{fmtSessionTime(time)}</span> : null}
  </div>
);

const V2SessionMessageCard: React.FC<{ event: V2SessionEvent }> = ({ event }) => {
  const role = event.role || 'message';
  if (role === 'bashExecution') return <V2SessionBashExecution event={event} />;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const icon = isUser ? <User size={16} strokeWidth={2.3} /> : isAssistant ? <Bot size={16} strokeWidth={2.3} /> : <Cpu size={16} strokeWidth={2.3} />;
  const parts = event.parts || [];
  const hasToolCallParts = parts.some((part) => part.type === 'toolCall');

  return (
    <div className="space-y-2 py-1">
      <V2SessionEventHeader icon={icon} label={role} time={event.timestamp || event.display_timestamp} />
      <div className="space-y-2">
        {parts.map((part, index) => {
          if (part.type === 'text') return <V2SessionTextPart key={`part-${index}-text`} text={partText(part)} />;
          if (part.type === 'thinking') return <V2SessionThinkingPart key={`part-${index}-thinking`} text={partText(part)} />;
          if (part.type === 'toolCall') return <V2SessionToolCallPart key={`part-${index}-tool-${part.id || ''}`} part={part} parentEvent={event} toolResults={event._toolResults} />;
          return <pre key={`part-${index}-other`} className="rounded-lg border border-theme-border bg-theme-surface p-3 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{safeJson(part)}</pre>;
        })}
        {!hasToolCallParts ? (event._toolResults || []).map((toolResult, index) => <V2SessionToolResultBlock key={`result-${toolResult.line || index}`} event={toolResult} />) : null}
      </div>
    </div>
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
    <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs text-theme-text-muted">
      <span className="inline-flex items-center gap-2"><Cpu size={16} strokeWidth={2.3} />{text}</span>
      {event.timestamp || event.display_timestamp ? <span>{fmtSessionTime(event.timestamp || event.display_timestamp)}</span> : null}
    </div>
  );
};

const V2SessionEventCard: React.FC<{ event: V2SessionEvent }> = ({ event }) => {
  if (event.type === 'message') return <V2SessionMessageCard event={event} />;
  if (event.type === 'model_change' || event.type === 'thinking_level_change') return <V2SessionSystemEvent event={event} />;
  return (
    <details className="group rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs text-theme-text-muted">
      <summary className="inline-flex cursor-pointer select-none items-center gap-2 font-medium text-theme-text-secondary transition hover:text-theme-text-primary">
        <ChevronRight size={13} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
        <CircleAlert size={16} strokeWidth={2.3} />
        {event.type || 'raw'}
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{event.summary || event.raw_line || safeJson(event)}</pre>
    </details>
  );
};

export const VulnVerifyV2SessionPreview: React.FC<VulnVerifyV2SessionPreviewProps> = ({ path, jsonl }) => {
  const snapshot = useMemo(() => buildSessionSnapshotFromText(path, jsonl), [path, jsonl]);
  const events = useMemo(() => mergeAgentSessionToolResults(snapshot.events) as V2SessionEvent[], [snapshot.events]);

  if (!jsonl.trim()) return <div className="py-10 text-center text-xs text-theme-text-muted">会话文件为空</div>;

  return (
    <div className="space-y-4">
      <V2SessionMetaBar sessionMeta={snapshot.session_meta || {}} eventCount={events.length} lineCount={snapshot.line_count} warningCount={snapshot.warnings.length} />
      <V2SessionWarnings warnings={snapshot.warnings} />
      <div className="space-y-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
        {events.length ? events.map((event, index) => <V2SessionEventCard key={`${event.type}-${event.line || index}-${index}`} event={event} />) : <div className="py-10 text-center text-xs text-theme-text-muted">暂无会话事件</div>}
      </div>
    </div>
  );
};
