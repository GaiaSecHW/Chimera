import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';

interface PiSessionEntry {
  type: string;
  id?: string;
  timestamp?: string;
  message?: any;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  [key: string]: any;
}

const parseJsonlSession = (content?: string | null): PiSessionEntry[] => {
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as PiSessionEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is PiSessionEntry => !!entry);
};

const stringifyValue = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const textFromContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block) return '';
        if (block.type === 'text') return block.text || '';
        if (block.type === 'thinking') return block.thinking || '';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return stringifyValue(content);
};

const getResultText = (result?: any): string => {
  if (!result) return '';
  const content = result.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return stringifyValue(content);
  return content
    .filter((block: any) => block?.type === 'text' || typeof block?.text === 'string')
    .map((block: any) => block.text || '')
    .join('\n');
};

const shortPath = (value?: string | null) => {
  if (!value) return '';
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : value;
};

const PiToolOutput: React.FC<{ text?: string; maxLines?: number }> = ({ text = '', maxLines = 10 }) => {
  const normalized = text.replace(/\t/g, '   ');
  if (!normalized.trim()) return null;
  const lines = normalized.split('\n');
  const clipped = lines.length > maxLines;
  return (
    <details open={!clipped} className="mt-3 rounded-xl bg-black/20 text-[12px] text-slate-100">
      {clipped ? <summary className="cursor-pointer px-3 py-2 text-slate-400">输出预览 · {lines.length - maxLines} more lines</summary> : null}
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono leading-[18px]">
        {normalized}
      </pre>
    </details>
  );
};

const PiToolExecution: React.FC<{ call: any; result?: any }> = ({ call, result }) => {
  const args = call?.arguments || {};
  const name = call?.name || 'tool';
  const isError = !!result?.isError;
  const statusClass = result ? (isError ? 'border-rose-500/30 bg-rose-950/35' : 'border-emerald-500/25 bg-emerald-950/25') : 'border-amber-500/30 bg-amber-950/25';
  const statusText = result ? (isError ? 'error' : 'success') : 'pending';
  const resultText = getResultText(result);
  const toolPath = args.file_path ?? args.path;

  return (
    <div className={`rounded-xl border p-[18px] ${statusClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 font-mono text-[12px] leading-[18px]">
          <div className="font-bold text-slate-100">
            {name === 'bash' ? `$ ${stringifyValue(args.command) || '...'}` : `${name} ${shortPath(toolPath || '.')}`}
          </div>
        </div>
        <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">{statusText}</span>
      </div>
      {name !== 'bash' ? <PiToolOutput text={stringifyValue(args)} maxLines={12} /> : null}
      <PiToolOutput text={result?.details?.diff || resultText.trim()} maxLines={name === 'read' ? 10 : 5} />
    </div>
  );
};

const PiMessageContent: React.FC<{ entry: PiSessionEntry; entries: PiSessionEntry[] }> = ({ entry, entries }) => {
  const msg = entry.message || {};
  const content = msg.content;
  if (msg.role === 'assistant' && Array.isArray(content)) {
    return (
      <>
        {content.map((block: any, idx: number) => {
          if (block?.type === 'text' && block.text?.trim()) return <div key={idx} className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{block.text}</div>;
          if (block?.type === 'thinking' && block.thinking?.trim()) return <div key={idx} className="rounded-xl bg-slate-950/40 p-3 text-sm italic leading-6 text-slate-400">{block.thinking}</div>;
          return null;
        })}
        {content.filter((block: any) => block?.type === 'toolCall').map((block: any) => {
          const result = entries.find((candidate) => candidate.type === 'message' && candidate.message?.role === 'toolResult' && candidate.message?.toolCallId === block.id)?.message;
          return <PiToolExecution key={block.id || `${block.name}-${Math.random()}`} call={block} result={result} />;
        })}
      </>
    );
  }
  if (msg.role === 'bashExecution') {
    return <PiToolExecution call={{ id: entry.id, name: 'bash', arguments: { command: msg.command } }} result={{ content: [{ type: 'text', text: msg.output || '' }], isError: msg.cancelled || (msg.exitCode !== 0 && msg.exitCode !== null) }} />;
  }
  return <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{textFromContent(content)}</pre>;
};

export const B2SSessionPreview: React.FC<{
  name?: string | null;
  content?: string | null;
  loading?: boolean;
  emptyHint?: string;
  meta?: {
    displayName?: string | null;
    relativePath?: string | null;
    sessionId?: string | null;
    startedAt?: string | null;
    workingDir?: string | null;
    live?: boolean;
    stats?: string[];
  };
}> = ({ name, content, loading = false, emptyHint = '会话内容为空或未加载。', meta }) => {
  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 size={16} className="mr-2 animate-spin" />
        加载会话中...
      </div>
    );
  }
  const entries = useMemo(() => parseJsonlSession(content), [content]);
  if (!content) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        {emptyHint}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-black tracking-tight text-slate-900">{meta?.displayName || name || '-'}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta?.live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              {meta?.live ? '实时连接中' : '历史会话'}
            </span>
          </div>
          {meta?.relativePath ? <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{meta.relativePath}</div> : null}
        </div>
        <pre className="max-h-[calc(100vh-24rem)] overflow-auto whitespace-pre-wrap break-words px-6 py-5 text-sm text-slate-700">{content}</pre>
      </div>
    );
  }
  const header = entries.find((entry) => entry.type === 'session');
  const messages = entries.filter((entry) => entry.type === 'message');
  const visibleEntries = entries.filter((entry) => !(entry.type === 'message' && entry.message?.role === 'toolResult'));
  const modelChanges = entries.filter((entry) => entry.type === 'model_change');
  const toolCalls = messages.flatMap((entry) => {
    const messageContent = entry.message?.content;
    if (!Array.isArray(messageContent)) return [];
    return messageContent.filter((block: any) => block?.type === 'toolCall');
  });
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-black tracking-tight text-slate-900">{meta?.displayName || name || '-'}</h2>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta?.live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
            {meta?.live ? '实时连接中' : '历史会话'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Session ID</div>
            <div className="mt-1 break-all font-mono text-xs text-slate-700">{meta?.sessionId || header?.id || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Started</div>
            <div className="mt-1 break-all text-xs text-slate-700">{meta?.startedAt || header?.timestamp || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Working Dir</div>
            <div className="mt-1 break-all font-mono text-xs text-slate-700">{meta?.workingDir || header?.cwd || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Events</div>
            <div className="mt-1 text-xs text-slate-700">{visibleEntries.length}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold text-slate-500">
          <span>消息 {messages.length}</span>
          <span>工具调用 {toolCalls.length}</span>
          <span>模型 {modelChanges[0]?.modelId || '-'}</span>
          {meta?.stats?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div className="max-h-[calc(100vh-24rem)] overflow-auto px-6 py-5">
        <div className="space-y-4">
        {visibleEntries.filter((entry) => entry.type !== 'session').map((entry, index) => {
          const role = entry.message?.role || entry.type;
          const isUser = role === 'user';
          const isAssistant = role === 'assistant';
          const isTool = role === 'bashExecution';
          const body = entry.type === 'model_change'
            ? `Model: ${entry.provider || '-'} / ${entry.modelId || '-'}`
            : entry.type === 'thinking_level_change'
              ? `Thinking level: ${entry.thinkingLevel || '-'}`
              : entry.type !== 'message'
                ? JSON.stringify(entry, null, 2)
                : '';
          return (
            <article key={`${entry.id || index}-${index}`} className={`rounded-3xl px-5 py-4 ${isUser ? 'bg-slate-800 text-slate-100' : isAssistant ? 'border border-slate-200 bg-white shadow-sm' : isTool ? 'border border-emerald-200 bg-emerald-50' : 'border border-slate-200 bg-slate-100'}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest">
                <span className={`${isUser ? 'text-slate-300' : isAssistant ? 'text-slate-500' : isTool ? 'text-emerald-700' : 'text-slate-500'}`}>{role}</span>
                <span className={`${isUser ? 'text-slate-400' : 'font-mono text-slate-400'}`}>{entry.timestamp || entry.id || ''}</span>
              </div>
              {entry.type === 'message' ? <PiMessageContent entry={entry} entries={entries} /> : <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{body}</pre>}
            </article>
          );
        })}
        </div>
      </div>
    </div>
  );
};
