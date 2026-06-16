import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Loader2, Wrench } from 'lucide-react';

import { AppSaSessionEvent, AppSaSessionMeta } from '../../types/types';
import { mergeAgentSessionToolResults } from './agentSessionParsing';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

const ESTIMATED_EVENT_HEIGHT = 180;
const OVERSCAN_COUNT = 8;

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: LK.info }}>{children}</a>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold last:mb-0" style={{ color: LK.ink }}>{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold last:mb-0" style={{ color: LK.ink }}>{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-base font-semibold last:mb-0" style={{ color: LK.ink }}>{children}</h3>,
        blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 px-4 py-2 italic last:mb-0" style={{ borderColor: LK.borderSoft, backgroundColor: 'rgba(17, 26, 43, 0.5)', color: LK.inkSoft }}>{children}</blockquote>,
        table: ({ children }) => <div className="mb-3 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
        thead: ({ children }) => <thead style={{ backgroundColor: 'rgba(17, 26, 43, 0.5)' }}>{children}</thead>,
        th: ({ children }) => <th className="border px-3 py-2 font-semibold" style={{ borderColor: LK.borderSoft, color: LK.ink }}>{children}</th>,
        td: ({ children }) => <td className="border px-3 py-2 align-top" style={{ borderColor: LK.borderSoft }}>{children}</td>,
        code: ({ children, className }) => className
          ? <code className="block overflow-x-auto rounded-xl border px-4 py-3 font-mono text-xs" style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.ink }}>{children}</code>
          : <code className="rounded px-1.5 py-0.5 font-mono text-[0.9em]" style={{ backgroundColor: 'rgba(17, 26, 43, 0.5)', color: LK.ink }}>{children}</code>,
        pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN');
}

const ThinkingBlock: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', borderColor: LK.info }}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-semibold" style={{ color: LK.info }}>
        {open ? '▼ hide' : '▶ thinking'}
      </button>
      {open ? <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6" style={{ color: LK.ink }}>{text}</pre> : null}
    </div>
  );
};

const ToolResultBlock: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const text = (event.parts || [])
    .filter((part) => part.type === 'text' || part.type === 'toolResult')
    .map((part) => String(part.text || ''))
    .join('\n');
  const isError = event.isError;
  return (
    <div className={`rounded-xl border px-4 py-3`}
      style={{
        backgroundColor: isError ? 'rgba(241, 93, 93, 0.12)' : 'rgba(69, 192, 111, 0.12)',
        borderColor: isError ? LK.error : LK.success
      }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>
        <Wrench size={12} />
        {event.toolName || 'Tool Result'}
      </div>
      {text ? <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs leading-6" style={{ color: LK.inkSoft }}>{text}</pre> : null}
    </div>
  );
};

const ToolCallBlock: React.FC<{ part: Record<string, any> }> = ({ part }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft }}>
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: LK.ink }}>
        <Wrench size={12} />
        <span>{part.name || 'tool'}</span>
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 text-xs font-medium" style={{ color: LK.muted }}>
        {open ? '▼ hide args' : '▶ show args'}
      </button>
      {open ? (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border px-3 py-3 text-xs leading-6"
          style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft, color: LK.inkSoft }}>
          {JSON.stringify(part.arguments || {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};

const SessionMessage: React.FC<{ event: AppSaSessionEvent & { _toolResults?: AppSaSessionEvent[] } }> = ({ event }) => {
  const time = formatTime(event.timestamp || event.display_timestamp);
  const parts = event.parts || [];

  if (event.role === 'user') {
    const text = parts.filter((part) => part.type === 'text').map((part) => String(part.text || '')).join('\n');
    return (
      <div className="rounded-xl px-5 py-4"
        style={{ backgroundColor: LK.surfaceRaised, color: LK.ink }}>
        {time ? <div className="mb-2 text-[11px]" style={{ color: LK.muted }}>{time}</div> : null}
        <div className="text-sm leading-7"><MarkdownMessage content={text} /></div>
      </div>
    );
  }

  if (event.role === 'assistant') {
    return (
      <div className="space-y-3 rounded-xl border px-5 py-4 shadow-sm"
        style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>
          <Bot size={13} />
          Assistant
          {time ? <span className="font-medium tracking-normal" style={{ color: LK.mutedSoft }}>{time}</span> : null}
        </div>
        {parts.map((part, index) => {
          if (part.type === 'thinking') return <ThinkingBlock key={`thinking-${index}`} text={String(part.text || '')} />;
          if (part.type === 'text') return <div key={`text-${index}`} className="text-sm leading-7" style={{ color: LK.inkSoft }}><MarkdownMessage content={String(part.text || '')} /></div>;
          if (part.type === 'toolCall') return <ToolCallBlock key={`tool-${index}`} part={part} />;
          return null;
        })}
        {(event._toolResults || []).map((toolResult, index) => <ToolResultBlock key={`tool-result-${index}-${toolResult.line || index}`} event={toolResult} />)}
      </div>
    );
  }

  if (event.role === 'toolResult') {
    return <ToolResultBlock event={event} />;
  }

  return <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{event.role || event.type}</div>;
};

const SessionEventRow: React.FC<{
  event: AppSaSessionEvent & { _toolResults?: AppSaSessionEvent[] };
  index: number;
  onHeightChange: (index: number, height: number) => void;
}> = ({ event, index, onHeightChange }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;

    const report = () => onHeightChange(index, node.getBoundingClientRect().height);
    report();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => report());
    observer.observe(node);
    return () => observer.disconnect();
  }, [event, index, onHeightChange]);

  let content: React.ReactNode;
  if (event.type === 'model_change') {
    content = <div className="text-xs" style={{ color: LK.muted }}>Model: <span className="font-semibold" style={{ color: LK.info }}>{event.provider || ''}/{event.modelId || ''}</span></div>;
  } else if (event.type === 'thinking_level_change') {
    content = <div className="text-xs" style={{ color: LK.muted }}>Thinking: <span className="font-semibold" style={{ color: LK.primary }}>{event.thinkingLevel || ''}</span></div>;
  } else if (event.type === 'message') {
    content = <SessionMessage event={event} />;
  } else {
    content = <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>[Line {event.line}] {event.summary || event.type}</div>;
  }

  return <div ref={rowRef}>{content}</div>;
};

export const AgentSessionViewer: React.FC<{
  sessionMeta?: AppSaSessionMeta | null;
  sessionHeader?: Record<string, any> | null;
  events: AppSaSessionEvent[];
  loading?: boolean;
  live?: boolean;
  error?: string | null;
  sessionMetric?: { queue_ms?: number; exec_ms?: number; total_tokens?: number } | null;
}> = ({ sessionMeta, sessionHeader, events, loading = false, live = false, error = null, sessionMetric }) => {
  const merged = useMemo(() => mergeAgentSessionToolResults(events), [events]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<number, number>>({});

  useEffect(() => {
    setMeasuredHeights({});
  }, [sessionMeta?.session_id]);

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [merged.length]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 720);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleHeightChange = (index: number, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setMeasuredHeights((current) => {
      if (current[index] === height) return current;
      return { ...current, [index]: height };
    });
  };

  const estimatedOffsets = useMemo(() => {
    const offsets: number[] = new Array(merged.length);
    let running = 0;
    for (let i = 0; i < merged.length; i += 1) {
      offsets[i] = running;
      running += measuredHeights[i] ?? ESTIMATED_EVENT_HEIGHT;
    }
    return {
      offsets,
      totalHeight: running,
    };
  }, [merged.length, measuredHeights]);

  const visibleRange = useMemo(() => {
    if (merged.length === 0) return { start: 0, end: 0 };
    const top = Math.max(0, scrollTop);
    const bottom = top + viewportHeight;
    let start = 0;
    while (
      start < merged.length &&
      estimatedOffsets.offsets[start] + (measuredHeights[start] ?? ESTIMATED_EVENT_HEIGHT) < top
    ) {
      start += 1;
    }
    let end = start;
    while (end < merged.length && estimatedOffsets.offsets[end] < bottom) {
      end += 1;
    }
    return {
      start: Math.max(0, start - OVERSCAN_COUNT),
      end: Math.min(merged.length, end + OVERSCAN_COUNT),
    };
  }, [estimatedOffsets.offsets, merged.length, measuredHeights, scrollTop, viewportHeight]);

  const visibleItems = useMemo(
    () => merged.slice(visibleRange.start, visibleRange.end).map((event, offset) => ({
      event,
      index: visibleRange.start + offset,
      top: estimatedOffsets.offsets[visibleRange.start + offset] ?? 0,
    })),
    [estimatedOffsets.offsets, merged, visibleRange],
  );

  const userCount = events.filter((event) => event.type === 'message' && event.role === 'user').length;
  const assistantCount = events.filter((event) => event.type === 'message' && event.role === 'assistant').length;
  const toolResultCount = events.filter((event) => event.type === 'message' && event.role === 'toolResult').length;
  const toolCallCount = events.reduce((count, event) => count + ((event.parts || []).filter((part) => part.type === 'toolCall').length), 0);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border text-sm shadow-sm"
        style={{ backgroundColor: LK.surface, borderColor: LK.border, color: LK.muted }}>
        <Loader2 size={16} className="mr-2 animate-spin" />
        加载会话中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border px-6 py-10 text-sm shadow-sm"
        style={{ backgroundColor: 'rgba(241, 93, 93, 0.12)', borderColor: LK.error, color: LK.error }}>
        {error}
      </div>
    );
  }

  if (!sessionMeta) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed text-sm"
        style={{ backgroundColor: 'rgba(17, 26, 43, 0.5)', borderColor: LK.border, color: LK.muted }}>
        请选择左侧会话
      </div>
    );
  }

  return (
    <div className="rounded-xl border shadow-sm"
      style={{ backgroundColor: 'rgba(17, 26, 43, 0.6)', borderColor: LK.border }}>
      <div className="border-b px-6 py-5" style={{ borderColor: LK.borderSoft }}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: LK.ink }}>{sessionMeta.display_name}</h2>
          <span className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: live ? 'rgba(69, 192, 111, 0.15)' : LK.surfaceRaised,
              borderColor: live ? LK.success : LK.borderSoft,
              color: live ? LK.success : LK.mutedSoft
            }}>
            {live ? '实时连接中' : '历史会话'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Session ID</div>
            <div className="mt-1 font-mono text-xs break-all" style={{ color: LK.inkSoft }}>{sessionHeader?.id || sessionMeta.session_id}</div>
          </div>
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Started</div>
            <div className="mt-1 text-xs break-all" style={{ color: LK.inkSoft }}>{sessionHeader?.timestamp || '-'}</div>
          </div>
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Working Dir</div>
            <div className="mt-1 font-mono text-xs break-all" style={{ color: LK.inkSoft }}>{sessionHeader?.cwd || '-'}</div>
          </div>
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Events</div>
            <div className="mt-1 text-xs" style={{ color: LK.inkSoft }}>{events.length}</div>
          </div>
        </div>
        {sessionMetric && (Number(sessionMetric.queue_ms || 0) + Number(sessionMetric.exec_ms || 0)) > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="rounded-xl border px-4 py-2"
            style={{ backgroundColor: 'rgba(213, 161, 58, 0.15)', borderColor: LK.warning }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.warning }}>排队耗时</div>
            <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{((Number(sessionMetric.queue_ms || 0)) / 1000).toFixed(1)}s</div>
          </div>
          <div className="rounded-xl border px-4 py-2"
            style={{ backgroundColor: 'rgba(69, 192, 111, 0.15)', borderColor: LK.success }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.success }}>计算耗时</div>
            <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{((Number(sessionMetric.exec_ms || 0)) / 1000).toFixed(1)}s</div>
          </div>
          {Number(sessionMetric.total_tokens || 0) > 0 && (
          <div className="rounded-xl border px-4 py-2"
            style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Est. Tokens</div>
            <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{sessionMetric.total_tokens}</div>
          </div>
          )}
        </div>
        )}
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-medium" style={{ color: LK.muted }}>
          <span>User {userCount}</span>
          <span>Assistant {assistantCount}</span>
          <span>Tool Calls {toolCallCount}</span>
          <span>Results {toolResultCount}</span>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="max-h-[calc(100vh-24rem)] overflow-auto px-6 py-5"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {merged.length > 0 ? (
          <div className="relative" style={{ height: `${estimatedOffsets.totalHeight}px` }}>
            {visibleItems.map(({ event, index, top }) => (
              <div
                key={`${event.type}-${event.line || index}-${index}`}
                className="absolute left-0 right-0"
                style={{ top: `${top}px` }}
              >
                <SessionEventRow event={event} index={index} onHeightChange={handleHeightChange} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm"
              style={{ backgroundColor: LK.surface, borderColor: LK.border, color: LK.muted }}>
              Empty session
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
