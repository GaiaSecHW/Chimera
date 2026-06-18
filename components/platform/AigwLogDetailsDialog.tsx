import React, { useMemo, useState } from 'react';
import { Bot, Boxes, Braces, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Cpu, FileJson2, Hash, Image as ImageIcon, Layers3, MessageSquareText, Route, ScrollText, X } from 'lucide-react';

import { AiGatewayLogDetail } from '../../types/types';

interface AigwLogDetailsDialogProps {
  log: AiGatewayLogDetail | null;
  open: boolean;
  onClose: () => void;
  onCopy: (value: string, successMessage?: string) => Promise<void>;
}

type DetailTab = 'visual' | 'request' | 'response' | 'stream';

type VisualEntry =
  | { kind: 'message'; role: string; title: string; body: string; raw?: unknown; source?: 'request' | 'response'; reasoningContent?: string; finishReason?: string; toolCalls?: unknown[]; parts?: MessagePart[] }
  | { kind: 'tool-call'; role: string; title: string; body: string; raw?: unknown; source?: 'request' | 'response' }
  | { kind: 'meta'; role: string; title: string; body: string; raw?: unknown; source?: 'request' | 'response' };

type MessagePart = {
  type?: string;
  text?: string;
  image_url?: { url?: string };
};

type ResponseUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
};

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';
const formatCost = (value?: number) => typeof value === 'number' ? `$${value.toFixed(8)}` : '-';
const formatLatency = (value?: number) => value ? `${Math.round(value)} ms` : '-';
const formatBytes = (value?: number) => typeof value === 'number' ? `${value} B` : '-';
const formatNumber = (value?: number) => typeof value === 'number' ? String(value) : '-';
const getAttributionLabel = (log: AiGatewayLogDetail) => {
  if (log.app_id) return log.app_name ? `${log.app_name} / ${log.app_id}` : log.app_id;
  return log.task_id || '-';
};
const getAttributionHint = (log: AiGatewayLogDetail) => {
  if (log.app_id) return '应用归因';
  return log.sub_task_id || '无子任务';
};

const parseJsonMaybe = (value?: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const stringifyPretty = (value: unknown) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const flattenContentText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const typed = item as Record<string, unknown>;
        if (typed.type === 'text' && typeof typed.text === 'string') return typed.text;
        if (typeof typed.content === 'string') return typed.content;
        if (typeof typed.input === 'string') return typed.input;
      }
      return stringifyPretty(item);
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') {
    const typed = content as Record<string, unknown>;
    if (typeof typed.text === 'string') return typed.text;
    if (typeof typed.content === 'string') return typed.content;
  }
  return stringifyPretty(content);
};

const getContentParts = (content: unknown): MessagePart[] => {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return { type: 'text', text: item };
      if (item && typeof item === 'object') return item as MessagePart;
      return { type: 'text', text: stringifyPretty(item) };
    });
  }
  return [{ type: 'text', text: flattenContentText(content) }];
};

const getNestedString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
};

const getResponseUsage = (responseJson: unknown): ResponseUsage | null => {
  if (!responseJson || typeof responseJson !== 'object') return null;
  const usage = (responseJson as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return null;
  const data = usage as Record<string, unknown>;
  const numberValue = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'number') return value;
    }
    return 0;
  };
  return {
    promptTokens: numberValue('prompt_tokens', 'promptTokens'),
    completionTokens: numberValue('completion_tokens', 'completionTokens'),
    totalTokens: numberValue('total_tokens', 'totalTokens'),
    cacheHitTokens: numberValue('prompt_cache_hit_tokens', 'promptCacheHitTokens', 'cache_read_input_tokens'),
  };
};

const extractRequestTools = (requestJson: unknown): Record<string, unknown>[] => {
  if (!requestJson || typeof requestJson !== 'object') return [];
  const tools = (requestJson as Record<string, unknown>).tools;
  return Array.isArray(tools) ? tools.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
};

const formatToolArguments = (value: unknown) => {
  if (typeof value === 'string') {
    const parsed = parseJsonMaybe(value);
    return parsed === null ? value : stringifyPretty(parsed);
  }
  return stringifyPretty(value);
};

const extractRequestVisualEntries = (requestJson: unknown): VisualEntry[] => {
  if (!requestJson || typeof requestJson !== 'object') return [];
  const request = requestJson as Record<string, unknown>;
  const entries: VisualEntry[] = [];

  if (Array.isArray(request.messages)) {
    request.messages.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const message = item as Record<string, unknown>;
      const role = typeof message.role === 'string' ? message.role : `message-${index + 1}`;
      const body = flattenContentText(message.content);
      entries.push({
        kind: 'message',
        role,
        title: `Request · ${role}`,
        body: body || '(empty)',
        raw: message,
        source: 'request',
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        parts: getContentParts(message.content),
      });
    });
  }

  if (Array.isArray(request.input)) {
    request.input.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const inputItem = item as Record<string, unknown>;
      const role = typeof inputItem.role === 'string' ? inputItem.role : 'input';
      const body = flattenContentText(inputItem.content ?? inputItem.input ?? inputItem.text);
      entries.push({
        kind: 'message',
        role,
        title: `Input ${index + 1} · ${role}`,
        body: body || '(empty)',
        raw: inputItem,
        source: 'request',
        parts: getContentParts(inputItem.content ?? inputItem.input ?? inputItem.text),
      });
    });
  }

  if (entries.length === 0 && request.prompt) {
    entries.push({
      kind: 'message',
      role: 'prompt',
      title: 'Prompt',
      body: flattenContentText(request.prompt),
      raw: request.prompt,
      source: 'request',
      parts: getContentParts(request.prompt),
    });
  }

  return entries;
};

const extractResponseVisualEntries = (responseJson: unknown): VisualEntry[] => {
  if (!responseJson || typeof responseJson !== 'object') return [];
  const response = responseJson as Record<string, unknown>;
  const entries: VisualEntry[] = [];

  if (Array.isArray(response.choices)) {
    response.choices.forEach((choice, index) => {
      if (!choice || typeof choice !== 'object') return;
      const choiceRecord = choice as Record<string, unknown>;
      const message = choiceRecord.message;
      if (message && typeof message === 'object') {
        const msg = message as Record<string, unknown>;
        entries.push({
          kind: 'message',
          role: typeof msg.role === 'string' ? msg.role : 'assistant',
          title: `Choice ${index + 1}`,
          body: flattenContentText(msg.content),
          raw: msg,
          source: 'response',
          reasoningContent: getNestedString(msg, ['reasoning_content', 'reasoningContent']),
          finishReason: typeof choiceRecord.finish_reason === 'string' ? choiceRecord.finish_reason : typeof choiceRecord.finishReason === 'string' ? choiceRecord.finishReason : '',
          toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
          parts: getContentParts(msg.content),
        });
      }
      const delta = choiceRecord.delta;
      if (delta && typeof delta === 'object') {
        const deltaRecord = delta as Record<string, unknown>;
        const body = flattenContentText(deltaRecord.content);
        const reasoningContent = getNestedString(deltaRecord, ['reasoning_content', 'reasoningContent']);
        if (body || reasoningContent || Array.isArray(deltaRecord.tool_calls)) {
          entries.push({
            kind: 'message',
            role: typeof deltaRecord.role === 'string' ? deltaRecord.role : 'assistant',
            title: `Choice ${index + 1} Delta`,
            body: body || '(empty delta)',
            raw: deltaRecord,
            source: 'response',
            reasoningContent,
            finishReason: typeof choiceRecord.finish_reason === 'string' ? choiceRecord.finish_reason : typeof choiceRecord.finishReason === 'string' ? choiceRecord.finishReason : '',
            toolCalls: Array.isArray(deltaRecord.tool_calls) ? deltaRecord.tool_calls : [],
            parts: getContentParts(deltaRecord.content),
          });
        }
      }
      if (typeof choiceRecord.text === 'string') {
        entries.push({
          kind: 'message',
          role: 'assistant',
          title: `Choice ${index + 1} Text`,
          body: choiceRecord.text,
          raw: choiceRecord.text,
          source: 'response',
          finishReason: typeof choiceRecord.finish_reason === 'string' ? choiceRecord.finish_reason : typeof choiceRecord.finishReason === 'string' ? choiceRecord.finishReason : '',
          parts: getContentParts(choiceRecord.text),
        });
      }
    });
  }

  if (Array.isArray(response.output)) {
    response.output.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const outputItem = item as Record<string, unknown>;
      const itemType = typeof outputItem.type === 'string' ? outputItem.type : 'output';
      const body = flattenContentText(outputItem.content ?? outputItem.text ?? outputItem.arguments ?? outputItem.output);
      entries.push({
        kind: itemType.includes('tool') ? 'tool-call' : 'message',
        role: itemType,
        title: `Output ${index + 1} · ${itemType}`,
        body: body || stringifyPretty(outputItem),
        raw: outputItem,
        source: 'response',
        reasoningContent: getNestedString(outputItem, ['reasoning_content', 'reasoningContent']),
        parts: getContentParts(outputItem.content ?? outputItem.text ?? outputItem.arguments ?? outputItem.output),
      });
    });
  }

  if (entries.length === 0 && typeof response.content === 'string') {
    entries.push({
      kind: 'message',
      role: 'assistant',
      title: 'Response Content',
      body: response.content,
      raw: response.content,
      source: 'response',
      parts: getContentParts(response.content),
    });
  }

  if (entries.length === 0 && (typeof response.completion === 'string' || typeof response.rawText === 'string')) {
    const body = typeof response.completion === 'string' ? response.completion : String(response.rawText || '');
    entries.push({
      kind: 'message',
      role: 'assistant',
      title: 'Response Text',
      body,
      raw: body,
      source: 'response',
      parts: getContentParts(body),
    });
  }

  return entries;
};

const getRoleTone = (role: string) => {
  switch (role) {
    case 'system':
      return 'border-theme-border bg-theme-surface text-theme-text-primary';
    case 'user':
      return 'border-theme-border bg-theme-surface text-theme-text-primary';
    case 'assistant':
      return 'border-theme-border bg-theme-surface text-theme-text-primary';
    case 'tool':
    case 'tool-call':
    case 'tools':
      return 'border-theme-border bg-theme-surface text-theme-text-primary';
    default:
      return 'border-theme-border bg-theme-surface text-theme-text-primary';
  }
};

const getRoleAccentTone = (role: string) => {
  switch (role) {
    case 'system':
      return 'border-l-amber-400';
    case 'user':
      return 'border-l-sky-500';
    case 'assistant':
      return 'border-l-emerald-500';
    case 'tool':
    case 'tool-call':
    case 'tools':
      return 'border-l-violet-500';
    default:
      return 'border-l-zinc-600';
  }
};

const getRoleBadgeTone = (role: string) => {
  switch (role) {
    case 'system':
      return 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
    case 'user':
      return 'bg-sky-500/15 text-sky-400 ring-sky-500/20';
    case 'assistant':
      return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20';
    case 'tool':
    case 'tool-call':
    case 'tools':
      return 'bg-violet-500/15 text-violet-400 ring-violet-500/20';
    default:
      return 'bg-theme-elevated text-theme-text-secondary ring-theme-border';
  }
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'system':
      return 'System';
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool':
      return 'Tool';
    case 'tool-call':
      return 'Tool Call';
    case 'tools':
      return 'Tools';
    default:
      return role || 'Message';
  }
};

const getFinishReasonTone = (reason?: string) => {
  switch (reason) {
    case 'stop':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    case 'length':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
    case 'tool_calls':
      return 'border-violet-500/20 bg-violet-500/15 text-violet-400';
    case 'content_filter':
      return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
    default:
      return 'border-theme-border bg-theme-elevated text-theme-text-secondary';
  }
};

const parseStreamEvents = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const blocks = raw.split(/\n\n+/).map((item) => item.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || '';
    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
    const dataText = dataLines.join('\n');
    const dataJson = parseJsonMaybe(dataText);
    return {
      index: index + 1,
      eventName,
      raw: block,
      dataText,
      dataJson,
    };
  });
};

const JsonNode: React.FC<{ label?: string; value: unknown; depth?: number }> = ({ label, value, depth = 0 }) => {
  const isObject = typeof value === 'object' && value !== null;

  if (!isObject) {
    return (
      <div className="font-mono text-xs leading-6 text-theme-text-secondary">
        {label ? <span className="text-sky-400">"{label}"</span> : null}
        {label ? <span className="text-theme-text-faint">: </span> : null}
        <span className={typeof value === 'string' ? 'text-emerald-400' : 'text-amber-400'}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  const summary = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`;

  return (
    <details open={depth < 1} className="font-mono text-xs text-theme-text-secondary">
      <summary className="cursor-pointer list-none select-none text-theme-text-secondary marker:hidden">
        {label ? <span className="text-sky-400">"{label}"</span> : null}
        {label ? <span className="text-theme-text-faint">: </span> : null}
        <span className="text-violet-400">{summary}</span>
      </summary>
      <div className="mt-2 space-y-1 border-l border-theme-border pl-4">
        {entries.map(([childKey, childValue]) => (
          <JsonNode key={childKey} label={childKey} value={childValue} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4 shadow-panel">
    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint">
      <span className="text-theme-text-muted">{icon}</span>
      {label}
    </div>
    <div className="mt-3 text-lg font-black text-theme-text-primary">{value}</div>
    {hint ? <div className="mt-1 text-xs text-theme-text-muted">{hint}</div> : null}
  </div>
);

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({ title, icon, children, action }) => (
  <section className="rounded-[1.5rem] border border-theme-border bg-theme-surface p-5 shadow-panel">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-theme-text-muted">{icon}</span>
        <h4 className="text-sm font-black uppercase tracking-[0.18em] text-theme-text-muted">{title}</h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const AigwLogDetailsDialog: React.FC<AigwLogDetailsDialogProps> = ({ log, open, onClose, onCopy }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('visual');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const requestJson = useMemo(() => parseJsonMaybe(log?.request), [log?.request]);
  const responseJson = useMemo(() => parseJsonMaybe(log?.response), [log?.response]);
  const streamJson = useMemo(() => parseJsonMaybe(log?.stream_response), [log?.stream_response]);
  const visualEntries = useMemo(() => {
    if (!log) return [];
    return [
      ...extractRequestVisualEntries(requestJson),
      ...extractResponseVisualEntries(responseJson),
    ];
  }, [log, requestJson, responseJson]);
  const requestTools = useMemo(() => extractRequestTools(requestJson), [requestJson]);
  const responseUsage = useMemo(() => getResponseUsage(responseJson), [responseJson]);
  const streamEvents = useMemo(() => parseStreamEvents(log?.stream_response), [log?.stream_response]);

  if (!open || !log) return null;

  const tabButton = (tab: DetailTab, label: string) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
        activeTab === tab
          ? 'bg-brand-primary text-white'
          : 'bg-theme-elevated text-theme-text-muted hover:bg-theme-bg-app hover:text-theme-text-primary'
      }`}
    >
      {label}
    </button>
  );

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderTextBlock = (text: string, key: string) => {
    const long = text.length > 700;
    const expanded = expandedKeys.has(key);
    const displayText = long && !expanded ? `${text.slice(0, 520)}...` : text;
    return (
      <div className="rounded-xl border border-theme-border bg-theme-bg-app p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-theme-text-secondary">{displayText}</pre>
        {long ? (
          <button onClick={() => toggleExpanded(key)} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-brand-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-secondary">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? '收起' : '展开完整内容'}
          </button>
        ) : null}
      </div>
    );
  };

  const renderMessageContent = (entry: VisualEntry, index: number) => {
    if (entry.kind !== 'message') return renderTextBlock(entry.body, `entry-${index}`);
    const parts = entry.parts?.length ? entry.parts : getContentParts(entry.body);
    return (
      <div className="mt-3 space-y-3">
        {parts.map((part, partIndex) => {
          const key = `entry-${index}-part-${partIndex}`;
          if (part.type === 'image_url') {
            return (
              <div key={key} className="flex items-start gap-2 rounded-xl border border-theme-border bg-theme-bg-app p-4 text-xs text-theme-text-secondary">
                <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-theme-text-muted" />
                <span className="break-all font-mono">{part.image_url?.url || 'Image data'}</span>
              </div>
            );
          }
          const text = part.type === 'text' ? part.text || '' : flattenContentText(part);
          return <div key={key}>{renderTextBlock(text || '(empty)', key)}</div>;
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[min(96vw,1380px)] flex-col overflow-hidden rounded-[2rem] bg-theme-bg-app shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-theme-border bg-theme-surface px-6 py-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-faint">日志详情工作区</div>
            <h3 className="mt-2 text-2xl font-black text-theme-text-primary">请求日志 #{log.id}</h3>
            <p className="mt-1 text-sm text-theme-text-muted">
              {log.model_name || '-'} {'->'} {log.backend_model_name || '-'} · {log.endpoint || '-'} · {log.is_stream ? 'stream' : 'json'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl bg-theme-elevated p-2 text-theme-text-muted hover:bg-theme-surface hover:text-theme-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <SectionCard title="调用概览" icon={<Route className="h-4 w-4" />}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard icon={<Cpu className="h-4 w-4" />} label="公开模型" value={log.model_name || '-'} hint={`Backend: ${log.backend_model_name || '-'}`} />
                <MetricCard icon={<Hash className="h-4 w-4" />} label="日志时间" value={formatDateTime(log.created_at)} hint={`状态 ${log.status_code || '-'}`} />
                <MetricCard icon={<Layers3 className="h-4 w-4" />} label="调用模式" value={log.is_stream ? 'Stream' : 'JSON'} hint={`Endpoint ${log.endpoint || '-'}`} />
                <MetricCard icon={<MessageSquareText className="h-4 w-4" />} label="调用归因" value={getAttributionLabel(log)} hint={getAttributionHint(log)} />
                <MetricCard icon={<Route className="h-4 w-4" />} label="别名 / 单元 / 配置" value={`A${log.model_alias_id || '-'} / U${log.backend_unit_id || '-'} / B${log.backend_config_id || '-'}`} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="密钥前缀" value={log.llm_key_prefix || '-'} hint={`Task Key: ${log.task_key_prefix || '-'}`} />
              </div>
            </SectionCard>

            <SectionCard title="路由归因" icon={<Boxes className="h-4 w-4" />}>
              <div className="grid gap-3 text-sm text-theme-text-secondary md:grid-cols-2">
                <div className="rounded-2xl bg-theme-bg-app px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-theme-text-faint">Backend URL</div>
                  <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{log.backend_api_base_url || '-'}</div>
                </div>
                <div className="rounded-2xl bg-theme-bg-app px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-theme-text-faint">Fingerprint</div>
                  <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{log.fingerprint || '-'}</div>
                </div>
                <div className="rounded-2xl bg-theme-bg-app px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-theme-text-faint">Usage Source</div>
                  <div className="mt-1 text-sm font-bold text-theme-text-primary">{log.usage_source || '-'}</div>
                </div>
                <div className="rounded-2xl bg-theme-bg-app px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-theme-text-faint">Pricing Version</div>
                  <div className="mt-1 text-sm font-bold text-theme-text-primary">{log.pricing_version || '-'}</div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr,1fr,1fr]">
            <SectionCard title="时延与并发" icon={<Cpu className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard icon={<Cpu className="h-4 w-4" />} label="响应时延" value={formatLatency(log.response_time)} />
                <MetricCard icon={<Cpu className="h-4 w-4" />} label="首 Token" value={formatLatency(log.first_token_latency)} />
                <MetricCard icon={<Cpu className="h-4 w-4" />} label="平均 Token" value={formatLatency(log.avg_token_latency)} />
                <MetricCard icon={<Cpu className="h-4 w-4" />} label="并发快照" value={formatNumber(log.active_requests)} />
              </div>
            </SectionCard>

            <SectionCard title="流量与 Tokens" icon={<ScrollText className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Request Bytes" value={formatBytes(log.request_bytes)} />
                <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Response Bytes" value={formatBytes(log.response_bytes)} />
                <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Stream Bytes" value={formatBytes(log.stream_bytes)} />
                <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Tokens" value={`${log.prompt_tokens || 0} / ${log.completion_tokens || 0} / ${log.total_tokens || 0}`} hint="prompt / completion / total" />
              </div>
            </SectionCard>

            <SectionCard title="缓存与计费" icon={<CheckCircle2 className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Gateway Cache" value={log.gateway_cache_hit ? 'Hit' : 'Miss'} hint={log.gateway_cache_key || '无缓存键'} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Provider Cache" value={`${log.provider_cached_tokens || 0} cached`} hint={`hit ${log.provider_cache_hit_tokens || 0} / miss ${log.provider_cache_miss_tokens || 0}`} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="节省 Tokens" value={formatNumber(log.gateway_cache_saved_tokens)} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="估算成本" value={formatCost(log.estimated_cost)} hint={`Saved ${formatCost(log.gateway_cache_saved_cost)}`} />
              </div>
            </SectionCard>
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-theme-border bg-theme-surface p-5 shadow-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint">内容视图</div>
                <h4 className="mt-1 text-lg font-black text-theme-text-primary">Request / Response / Stream</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {tabButton('visual', 'Visual')}
                {tabButton('request', 'Request JSON')}
                {tabButton('response', 'Response JSON')}
                {tabButton('stream', 'Stream')}
              </div>
            </div>

            {activeTab === 'visual' ? (
              <div className="space-y-4">
                {requestTools.length > 0 ? (
                  <SectionCard title={`Tools (${requestTools.length})`} icon={<Cpu className="h-4 w-4" />}>
                    <div className="space-y-3">
                      {requestTools.map((tool, index) => {
                        const fn = tool.function && typeof tool.function === 'object' ? tool.function as Record<string, unknown> : {};
                        const name = typeof fn.name === 'string' ? fn.name : 'Unknown';
                        return (
                          <details key={`${name}-${index}`} className="rounded-xl border border-theme-border bg-theme-bg-app px-4 py-3">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-theme-text-primary marker:hidden">
                              <span className="flex items-center gap-2">
                                <span className="rounded-lg bg-violet-500/15 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-violet-400 ring-1 ring-violet-500/20">{String(tool.type || 'function')}</span>
                                {name}
                              </span>
                              <ChevronDown className="h-4 w-4 text-theme-text-muted" />
                            </summary>
                            {typeof fn.description === 'string' && fn.description ? (
                              <p className="mt-3 text-sm leading-6 text-theme-text-secondary">{fn.description}</p>
                            ) : null}
                            {fn.parameters ? (
                              <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-theme-border bg-theme-surface p-3 font-mono text-[12px] leading-6 text-theme-text-secondary">{stringifyPretty(fn.parameters)}</pre>
                            ) : null}
                          </details>
                        );
                      })}
                    </div>
                  </SectionCard>
                ) : null}

                {responseUsage ? (
                  <SectionCard title="Token Usage" icon={<ScrollText className="h-4 w-4" />}>
                    <div className="grid gap-3 md:grid-cols-4">
                      <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Prompt" value={formatNumber(responseUsage.promptTokens)} />
                      <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Completion" value={formatNumber(responseUsage.completionTokens)} />
                      <MetricCard icon={<ScrollText className="h-4 w-4" />} label="Total" value={formatNumber(responseUsage.totalTokens)} />
                      <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Cache Hit" value={formatNumber(responseUsage.cacheHitTokens)} />
                    </div>
                  </SectionCard>
                ) : null}

                {visualEntries.length ? (
                  <SectionCard title={`Conversation (${visualEntries.length})`} icon={<MessageSquareText className="h-4 w-4" />}>
                    <div className="space-y-3">
                      {visualEntries.map((entry, index) => (
                        <div key={`${entry.kind}-${index}`} className={`rounded-xl border border-l-4 px-4 py-4 shadow-sm ${getRoleTone(entry.role)} ${getRoleAccentTone(entry.role)}`}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ring-1 ${getRoleBadgeTone(entry.role)}`}>{getRoleLabel(entry.role)}</span>
                                {entry.source ? <span className="rounded-lg bg-theme-elevated px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-theme-text-secondary ring-1 ring-theme-border">{entry.source}</span> : null}
                                {'finishReason' in entry && entry.finishReason ? (
                                  <span className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold ${getFinishReasonTone(entry.finishReason)}`}>{entry.finishReason}</span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-sm font-black">{entry.title}</div>
                            </div>
                            <button
                              onClick={() => void onCopy(entry.body, `${entry.title} 已复制`)}
                              className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-surface px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-elevated"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              复制
                            </button>
                          </div>

                          {'reasoningContent' in entry && entry.reasoningContent ? (
                            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                              <button onClick={() => toggleExpanded(`reasoning-${index}`)} className="flex w-full items-center justify-between gap-3 text-left text-xs font-black text-amber-400">
                                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Reasoning Content</span>
                                {expandedKeys.has(`reasoning-${index}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              {expandedKeys.has(`reasoning-${index}`) ? (
                                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-amber-200">{entry.reasoningContent}</pre>
                              ) : null}
                            </div>
                          ) : null}

                          {renderMessageContent(entry, index)}

                          {'toolCalls' in entry && entry.toolCalls?.length ? (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-black text-theme-text-secondary">
                                <Cpu className="h-4 w-4" />
                                Tool Calls ({entry.toolCalls.length})
                              </div>
                              {entry.toolCalls.map((toolCall, toolIndex) => {
                                const call = toolCall && typeof toolCall === 'object' ? toolCall as Record<string, unknown> : {};
                                const fn = call.function && typeof call.function === 'object' ? call.function as Record<string, unknown> : {};
                                return (
                                  <div key={toolIndex} className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="rounded-lg bg-violet-500/15 px-2 py-1 font-black text-violet-400">{String(fn.name || 'Unknown')}</span>
                                      {typeof call.id === 'string' ? <span className="break-all font-mono text-theme-text-muted">ID: {call.id}</span> : null}
                                    </div>
                                    {fn.arguments ? (
                                      <div className="mt-3 overflow-hidden rounded-xl border border-violet-500/20 bg-theme-surface">
                                        <div className="border-b border-violet-500/20 bg-violet-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-violet-400">请求参数</div>
                                        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-6 text-theme-text-secondary">{formatToolArguments(fn.arguments)}</pre>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-theme-border bg-theme-bg-app px-4 py-10 text-center text-sm text-theme-text-muted">
                    当前日志缺少可识别的会话结构，建议切到 JSON 或 Stream 视图查看原始内容。
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === 'request' ? (
              <SectionCard
                title="Request JSON"
                icon={<FileJson2 className="h-4 w-4" />}
                action={<button onClick={() => void onCopy(log.request || '', '请求内容已复制')} className="rounded-xl bg-theme-elevated px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-surface">复制 Request</button>}
              >
                {requestJson !== null ? (
                  <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                    <JsonNode value={requestJson} />
                  </div>
                ) : (
                  <pre className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 font-mono text-xs leading-6 text-theme-text-primary">{log.request || '暂无 request 内容'}</pre>
                )}
              </SectionCard>
            ) : null}

            {activeTab === 'response' ? (
              <SectionCard
                title="Response JSON"
                icon={<Braces className="h-4 w-4" />}
                action={<button onClick={() => void onCopy(log.response || '', '响应内容已复制')} className="rounded-xl bg-theme-elevated px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-surface">复制 Response</button>}
              >
                {responseJson !== null ? (
                  <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                    <JsonNode value={responseJson} />
                  </div>
                ) : (
                  <pre className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 font-mono text-xs leading-6 text-theme-text-primary">{log.response || '暂无 response 内容'}</pre>
                )}
              </SectionCard>
            ) : null}

            {activeTab === 'stream' ? (
              <div className="space-y-4">
                <SectionCard
                  title="Stream Overview"
                  icon={<Bot className="h-4 w-4" />}
                  action={<button onClick={() => void onCopy(log.stream_response || '', '流式响应已复制')} className="rounded-xl bg-theme-elevated px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-surface">复制 Stream</button>}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard icon={<Bot className="h-4 w-4" />} label="模式" value={log.is_stream ? 'Stream' : 'Non-stream'} />
                    <MetricCard icon={<Bot className="h-4 w-4" />} label="事件数" value={formatNumber(streamEvents.length)} />
                    <MetricCard icon={<Bot className="h-4 w-4" />} label="流量" value={formatBytes(log.stream_bytes)} />
                  </div>
                </SectionCard>

                {streamEvents.length ? (
                  <div className="space-y-3">
                    {streamEvents.map((event) => (
                      <SectionCard key={event.index} title={`Event ${event.index}${event.eventName ? ` · ${event.eventName}` : ''}`} icon={<Bot className="h-4 w-4" />}>
                        {event.dataJson !== null ? (
                          <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                            <JsonNode value={event.dataJson} />
                          </div>
                        ) : (
                          <pre className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 font-mono text-xs leading-6 text-theme-text-primary">{event.dataText || event.raw}</pre>
                        )}
                      </SectionCard>
                    ))}
                  </div>
                ) : (
                  <pre className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 font-mono text-xs leading-6 text-theme-text-primary">{streamJson !== null ? stringifyPretty(streamJson) : (log.stream_response || '暂无 stream_response 内容')}</pre>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
