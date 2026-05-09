import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Loader2, Wrench } from 'lucide-react';

import { AppSaSessionEvent, AppSaSessionMeta } from '../../types/types';
import { mergeAgentSessionToolResults } from './agentSessionParsing';

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-700 underline">{children}</a>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        h1: ({ children }) => <h1 className="mb-3 text-xl font-black text-slate-900 last:mb-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 text-lg font-black text-slate-900 last:mb-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-base font-black text-slate-900 last:mb-0">{children}</h3>,
        blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 italic text-slate-700 last:mb-0">{children}</blockquote>,
        table: ({ children }) => <div className="mb-3 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
        th: ({ children }) => <th className="border border-slate-200 px-3 py-2 font-black text-slate-800">{children}</th>,
        td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
        code: ({ children, className }) => className
          ? <code className="block overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100">{children}</code>
          : <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900">{children}</code>,
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
    <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-bold text-violet-700">
        {open ? '▼ hide' : '▶ thinking'}
      </button>
      {open ? <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 text-violet-950">{text}</pre> : null}
    </div>
  );
};

const ToolResultBlock: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const text = (event.parts || [])
    .filter((part) => part.type === 'text' || part.type === 'toolResult')
    .map((part) => String(part.text || ''))
    .join('\n');
  return (
    <div className={`rounded-2xl border px-4 py-3 ${event.isError ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
        <Wrench size={12} />
        {event.toolName || 'Tool Result'}
      </div>
      {text ? <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-700">{text}</pre> : null}
    </div>
  );
};

const ToolCallBlock: React.FC<{ part: Record<string, any> }> = ({ part }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-700">
        <Wrench size={12} />
        <span>{part.name || 'tool'}</span>
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 text-xs font-semibold text-slate-500">
        {open ? '▼ hide args' : '▶ show args'}
      </button>
      {open ? (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
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
      <div className="rounded-3xl bg-slate-800 px-5 py-4 text-slate-100">
        {time ? <div className="mb-2 text-[11px] text-slate-400">{time}</div> : null}
        <div className="text-sm leading-7"><MarkdownMessage content={text} /></div>
      </div>
    );
  }

  if (event.role === 'assistant') {
    return (
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
          <Bot size={13} />
          Assistant
          {time ? <span className="font-medium tracking-normal text-slate-400">{time}</span> : null}
        </div>
        {parts.map((part, index) => {
          if (part.type === 'thinking') return <ThinkingBlock key={`thinking-${index}`} text={String(part.text || '')} />;
          if (part.type === 'text') return <div key={`text-${index}`} className="text-sm leading-7 text-slate-700"><MarkdownMessage content={String(part.text || '')} /></div>;
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

  return <div className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-500">{event.role || event.type}</div>;
};

export const AgentSessionViewer: React.FC<{
  sessionMeta?: AppSaSessionMeta | null;
  sessionHeader?: Record<string, any> | null;
  events: AppSaSessionEvent[];
  loading?: boolean;
  live?: boolean;
  error?: string | null;
}> = ({ sessionMeta, sessionHeader, events, loading = false, live = false, error = null }) => {
  const merged = useMemo(() => mergeAgentSessionToolResults(events), [events]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [merged.length]);

  const userCount = events.filter((event) => event.type === 'message' && event.role === 'user').length;
  const assistantCount = events.filter((event) => event.type === 'message' && event.role === 'assistant').length;
  const toolResultCount = events.filter((event) => event.type === 'message' && event.role === 'toolResult').length;
  const toolCallCount = events.reduce((count, event) => count + ((event.parts || []).filter((part) => part.type === 'toolCall').length), 0);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 size={16} className="mr-2 animate-spin" />
        加载会话中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-10 text-sm text-rose-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!sessionMeta) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        请选择左侧会话
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-black tracking-tight text-slate-900">{sessionMeta.display_name}</h2>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
            {live ? '实时连接中' : '历史会话'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Session ID</div>
            <div className="mt-1 font-mono text-xs text-slate-700 break-all">{sessionHeader?.id || sessionMeta.session_id}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Started</div>
            <div className="mt-1 text-xs text-slate-700 break-all">{sessionHeader?.timestamp || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Working Dir</div>
            <div className="mt-1 font-mono text-xs text-slate-700 break-all">{sessionHeader?.cwd || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Events</div>
            <div className="mt-1 text-xs text-slate-700">{events.length}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold text-slate-500">
          <span>User {userCount}</span>
          <span>Assistant {assistantCount}</span>
          <span>Tool Calls {toolCallCount}</span>
          <span>Results {toolResultCount}</span>
        </div>
      </div>

      <div ref={scrollerRef} className="max-h-[calc(100vh-24rem)] overflow-auto px-6 py-5">
        <div className="space-y-4">
          {merged.length > 0 ? merged.map((event) => {
            if (event.type === 'model_change') {
              return <div key={`model-${event.line}`} className="text-xs text-slate-500">Model: <span className="font-semibold text-cyan-700">{event.provider || ''}/{event.modelId || ''}</span></div>;
            }
            if (event.type === 'thinking_level_change') {
              return <div key={`thinking-level-${event.line}`} className="text-xs text-slate-500">Thinking: <span className="font-semibold text-violet-700">{event.thinkingLevel || ''}</span></div>;
            }
            if (event.type === 'message') {
              return <SessionMessage key={`message-${event.line}`} event={event} />;
            }
            return <div key={`raw-${event.line}`} className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-500">[Line {event.line}] {event.summary || event.type}</div>;
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
              Empty session
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
