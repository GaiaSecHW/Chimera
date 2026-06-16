import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

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
  return parts.length > 3 ?`.../${parts.slice(-3).join('/')}` : value;
};

const PiToolOutput: React.FC<{ text?: string; maxLines?: number }> = ({ text = '', maxLines = 10 }) => {
  const normalized = text.replace(/\t/g, '   ');
  if (!normalized.trim()) return null;
  const lines = normalized.split('\n');
  const clipped = lines.length > maxLines;
  return (
    <details open={!clipped} className="mt-3 rounded-xl" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
      {clipped ? (
        <summary className="cursor-pointer px-3 py-2 text-xs" style={{ color: LK.muted }}>
          输出预览 · {lines.length - maxLines} more lines
        </summary>
      ) : null}
      <pre
        className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono leading-[18px]"
        style={{ fontSize: '12px', color: LK.inkSoft }}
      >
        {normalized}
      </pre>
    </details>
  );
};

const PiToolExecution: React.FC<{ call: any; result?: any }> = ({ call, result }) => {
  const args = call?.arguments || {};
  const name = call?.name || 'tool';
  const isError = !!result?.isError;
  const statusColors = result
    ? isError
      ? { border: LK.error + '30', bg: LK.error + '14' }
      : { border: LK.success + '25', bg: LK.success + '14' }
    : { border: LK.warning + '30', bg: LK.warning + '14' };
  const statusText = result ? (isError ? 'error' : 'success') : 'pending';
  const resultText = getResultText(result);
  const toolPath = args.file_path ?? args.path;

  return (
    <div
      className="rounded-xl p-[18px]"
      style={{ border: `1px solid ${statusColors.border}`, backgroundColor: statusColors.bg }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 font-mono" style={{ fontSize: '12px', lineHeight: '18px' }}>
          <div className="font-semibold" style={{ color: LK.inkSoft }}>
            {name === 'bash' ?`$ ${stringifyValue(args.command) || '...'}` :`${name} ${shortPath(toolPath || '.')}`}
          </div>
        </div>
        <span
          className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ borderColor: 'rgba(255, 255, 255, 0.1)', color: LK.body }}
        >
          {statusText}
        </span>
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
          if (block?.type === 'text' && block.text?.trim()) {
            return (
              <div key={idx} className="whitespace-pre-wrap break-words text-sm leading-6" style={{ color: LK.ink }}>
                {block.text}
              </div>
            );
          }
          if (block?.type === 'thinking' && block.thinking?.trim()) {
            return (
              <div key={idx} className="rounded-xl p-3 text-sm italic leading-6" style={{ backgroundColor: LK.surfaceRaised + '40', color: LK.body }}>
                {block.thinking}
              </div>
            );
          }
          return null;
        })}
        {content
          .filter((block: any) => block?.type === 'toolCall')
          .map((block: any) => {
            const result = entries.find(
              (candidate) => candidate.type === 'message' && candidate.message?.role === 'toolResult' && candidate.message?.toolCallId === block.id
            )?.message;
            return <PiToolExecution key={block.id ||`${block.name}-${Math.random()}`} call={block} result={result} />;
          })}
      </>
    );
  }
  if (msg.role === 'bashExecution') {
    return (
      <PiToolExecution
        call={{ id: entry.id, name: 'bash', arguments: { command: msg.command } }}
        result={{
          content: [{ type: 'text', text: msg.output || '' }],
          isError: msg.cancelled || (msg.exitCode !== 0 && msg.exitCode !== null),
        }}
      />
    );
  }
  return <pre className="whitespace-pre-wrap break-words text-sm leading-6" style={{ color: LK.ink }}>{textFromContent(content)}</pre>;
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
      <div
        className="flex min-h-[420px] items-center justify-center rounded-xl text-sm"
        style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surface, color: LK.muted }}
      >
        <Loader2 size={16} className="mr-2 animate-spin" />
        加载会话中...
      </div>
    );
  }
  const entries = useMemo(() => parseJsonlSession(content), [content]);
  if (!content) {
    return (
      <div
        className="flex min-h-[420px] items-center justify-center rounded-xl text-sm"
        style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}
      >
        {emptyHint}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-xl" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.border}` }}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: LK.ink }}>{meta?.displayName || name || '-'}</h2>
            <span
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={{
                borderColor: meta?.live ? LK.success + '40' : LK.border,
                backgroundColor: meta?.live ? LK.success + '14' : LK.surface,
                color: meta?.live ? LK.success : LK.muted,
              }}
            >
              {meta?.live ? '实时连接中' : '历史会话'}
            </span>
          </div>
          {meta?.relativePath ? (
            <div className="mt-2 break-all font-mono text-[11px]" style={{ color: LK.muted }}>{meta.relativePath}</div>
          ) : null}
        </div>
        <pre
          className="max-h-[calc(100vh-24rem)] overflow-auto whitespace-pre-wrap break-words px-6 py-5 text-sm"
          style={{ color: LK.body }}
        >
          {content}
        </pre>
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

  const liveColors = meta?.live
    ? { border: LK.success + '40', bg: LK.success + '14', color: LK.success }
    : { border: LK.border, bg: LK.surface, color: LK.muted };

  return (
    <div className="rounded-xl" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
      <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.border}` }}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: LK.ink }}>{meta?.displayName || name || '-'}</h2>
          <span
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{ borderColor: liveColors.border, backgroundColor: liveColors.bg, color: liveColors.color }}
          >
            {meta?.live ? '实时连接中' : '历史会话'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Session ID</div>
            <div className="mt-1 break-all font-mono text-xs" style={{ color: LK.inkSoft }}>{meta?.sessionId || header?.id || '-'}</div>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Started</div>
            <div className="mt-1 break-all text-xs" style={{ color: LK.inkSoft }}>{meta?.startedAt || header?.timestamp || '-'}</div>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Working Dir</div>
            <div className="mt-1 break-all font-mono text-xs" style={{ color: LK.inkSoft }}>{meta?.workingDir || header?.cwd || '-'}</div>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>Events</div>
            <div className="mt-1 text-xs" style={{ color: LK.inkSoft }}>{visibleEntries.length}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold" style={{ color: LK.muted }}>
          <span>消息 {messages.length}</span>
          <span>工具调用 {toolCalls.length}</span>
          <span>模型 {modelChanges[0]?.modelId || '-'}</span>
          {meta?.stats?.slice(0, 2).map((item, idx) => <span key={idx}>{item}</span>)}
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
              ?`Model: ${entry.provider || '-'} / ${entry.modelId || '-'}`
              : entry.type === 'thinking_level_change'
                ?`Thinking level: ${entry.thinkingLevel || '-'}`
                : entry.type !== 'message'
                  ? JSON.stringify(entry, null, 2)
                  : '';
            return (
              <article
                key={`${entry.id || index}-${index}`}
                className="rounded-xl px-5 py-4"
                style={{
                  ...(isUser
                    ? { backgroundColor: '#1e293b', color: LK.inkSoft }
                    : isAssistant
                      ? { backgroundColor: LK.surface, border: `1px solid ${LK.border}` }
                      : isTool
                        ? { backgroundColor: LK.success + '14', border: `1px solid ${LK.success + '40'}` }
                        : { backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }),
                }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-widest">
                  <span style={{ color: isUser ? LK.mutedSoft : isAssistant ? LK.muted : isTool ? LK.success : LK.muted }}>
                    {role}
                  </span>
                  <span className="font-mono" style={{ color: isUser ? LK.muted : LK.muted }}>{entry.timestamp || entry.id || ''}</span>
                </div>
                {entry.type === 'message' ? <PiMessageContent entry={entry} entries={entries} /> : <pre className="whitespace-pre-wrap break-words text-sm leading-6" style={{ color: LK.body }}>{body}</pre>}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
