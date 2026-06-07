import React, { useMemo, useState } from 'react';
import { Bot, Boxes, Braces, CheckCircle2, Copy, Cpu, FileJson2, Hash, Layers3, MessageSquareText, Route, ScrollText, X } from 'lucide-react';

import { AiGatewayLogDetail } from '../../types/types';

interface AigwLogDetailsDialogProps {
  log: AiGatewayLogDetail | null;
  open: boolean;
  onClose: () => void;
  onCopy: (value: string, successMessage?: string) => Promise<void>;
}

type DetailTab = 'visual' | 'request' | 'response' | 'stream';

type VisualEntry =
  | { kind: 'message'; role: string; title: string; body: string; raw?: unknown }
  | { kind: 'tool-call'; role: string; title: string; body: string; raw?: unknown }
  | { kind: 'meta'; role: string; title: string; body: string; raw?: unknown };

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';
const formatCost = (value?: number) => typeof value === 'number' ? `$${value.toFixed(8)}` : '-';
const formatLatency = (value?: number) => value ? `${Math.round(value)} ms` : '-';
const formatBytes = (value?: number) => typeof value === 'number' ? `${value} B` : '-';
const formatNumber = (value?: number) => typeof value === 'number' ? String(value) : '-';

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
      });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      toolCalls.forEach((toolCall, toolIndex) => {
        entries.push({
          kind: 'tool-call',
          role: 'tool-call',
          title: `Tool Call ${toolIndex + 1}`,
          body: stringifyPretty(toolCall),
          raw: toolCall,
        });
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
      });
    });
  }

  if (Array.isArray(request.tools) && request.tools.length > 0) {
    entries.push({
      kind: 'meta',
      role: 'tools',
      title: `Tools (${request.tools.length})`,
      body: stringifyPretty(request.tools),
      raw: request.tools,
    });
  }

  if (entries.length === 0 && request.prompt) {
    entries.push({
      kind: 'message',
      role: 'prompt',
      title: 'Prompt',
      body: flattenContentText(request.prompt),
      raw: request.prompt,
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
        });
        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        toolCalls.forEach((toolCall, toolIndex) => {
          entries.push({
            kind: 'tool-call',
            role: 'tool-call',
            title: `Choice ${index + 1} · Tool Call ${toolIndex + 1}`,
            body: stringifyPretty(toolCall),
            raw: toolCall,
          });
        });
      }
      if (typeof choiceRecord.text === 'string') {
        entries.push({
          kind: 'message',
          role: 'assistant',
          title: `Choice ${index + 1} Text`,
          body: choiceRecord.text,
          raw: choiceRecord.text,
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
    });
  }

  return entries;
};

const getRoleTone = (role: string) => {
  switch (role) {
    case 'system':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'user':
      return 'border-sky-200 bg-sky-50 text-sky-900';
    case 'assistant':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'tool':
    case 'tool-call':
    case 'tools':
      return 'border-violet-200 bg-violet-50 text-violet-900';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900';
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
      <div className="font-mono text-xs leading-6 text-slate-200">
        {label ? <span className="text-sky-300">"{label}"</span> : null}
        {label ? <span className="text-slate-500">: </span> : null}
        <span className={typeof value === 'string' ? 'text-emerald-300' : 'text-amber-300'}>
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
    <details open={depth < 1} className="font-mono text-xs text-slate-100">
      <summary className="cursor-pointer list-none select-none text-slate-200 marker:hidden">
        {label ? <span className="text-sky-300">"{label}"</span> : null}
        {label ? <span className="text-slate-500">: </span> : null}
        <span className="text-violet-300">{summary}</span>
      </summary>
      <div className="mt-2 space-y-1 border-l border-slate-800 pl-4">
        {entries.map(([childKey, childValue]) => (
          <JsonNode key={childKey} label={childKey} value={childValue} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
      <span className="text-slate-500">{icon}</span>
      {label}
    </div>
    <div className="mt-3 text-lg font-black text-slate-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({ title, icon, children, action }) => (
  <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const AigwLogDetailsDialog: React.FC<AigwLogDetailsDialogProps> = ({ log, open, onClose, onCopy }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('visual');

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
  const streamEvents = useMemo(() => parseStreamEvents(log?.stream_response), [log?.stream_response]);

  if (!open || !log) return null;

  const tabButton = (tab: DetailTab, label: string) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
        activeTab === tab
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[min(96vw,1380px)] flex-col overflow-hidden rounded-[2rem] bg-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">日志详情工作区</div>
            <h3 className="mt-2 text-2xl font-black text-slate-900">请求日志 #{log.id}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {log.model_name || '-'} {'->'} {log.backend_model_name || '-'} · {log.endpoint || '-'} · {log.is_stream ? 'stream' : 'json'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
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
                <MetricCard icon={<MessageSquareText className="h-4 w-4" />} label="任务归因" value={log.task_id || '-'} hint={log.sub_task_id || '无子任务'} />
                <MetricCard icon={<Route className="h-4 w-4" />} label="别名 / 单元 / 配置" value={`A${log.model_alias_id || '-'} / U${log.backend_unit_id || '-'} / B${log.backend_config_id || '-'}`} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="密钥前缀" value={log.llm_key_prefix || '-'} hint={`Task Key: ${log.task_key_prefix || '-'}`} />
              </div>
            </SectionCard>

            <SectionCard title="路由归因" icon={<Boxes className="h-4 w-4" />}>
              <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Backend URL</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-800">{log.backend_api_base_url || '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Fingerprint</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-800">{log.fingerprint || '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Usage Source</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{log.usage_source || '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Pricing Version</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{log.pricing_version || '-'}</div>
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

          <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">内容视图</div>
                <h4 className="mt-1 text-lg font-black text-slate-900">Request / Response / Stream</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {tabButton('visual', 'Visual')}
                {tabButton('request', 'Request JSON')}
                {tabButton('response', 'Response JSON')}
                {tabButton('stream', 'Stream')}
              </div>
            </div>

            {activeTab === 'visual' ? (
              <div className="space-y-3">
                {visualEntries.length ? visualEntries.map((entry, index) => (
                  <div key={`${entry.kind}-${index}`} className={`rounded-[1.25rem] border px-4 py-4 ${getRoleTone(entry.role)}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">{entry.kind}</div>
                        <div className="mt-1 text-sm font-black">{entry.title}</div>
                      </div>
                      <button
                        onClick={() => void onCopy(entry.body, `${entry.title} 已复制`)}
                        className="rounded-xl bg-white/60 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-white/70 p-4 font-mono text-xs leading-6 text-slate-800">{entry.body}</pre>
                  </div>
                )) : (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    当前日志缺少可识别的会话结构，建议切到 JSON 或 Stream 视图查看原始内容。
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === 'request' ? (
              <SectionCard
                title="Request JSON"
                icon={<FileJson2 className="h-4 w-4" />}
                action={<button onClick={() => void onCopy(log.request || '', '请求内容已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">复制 Request</button>}
              >
                {requestJson !== null ? (
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <JsonNode value={requestJson} />
                  </div>
                ) : (
                  <pre className="rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{log.request || '暂无 request 内容'}</pre>
                )}
              </SectionCard>
            ) : null}

            {activeTab === 'response' ? (
              <SectionCard
                title="Response JSON"
                icon={<Braces className="h-4 w-4" />}
                action={<button onClick={() => void onCopy(log.response || '', '响应内容已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">复制 Response</button>}
              >
                {responseJson !== null ? (
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <JsonNode value={responseJson} />
                  </div>
                ) : (
                  <pre className="rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{log.response || '暂无 response 内容'}</pre>
                )}
              </SectionCard>
            ) : null}

            {activeTab === 'stream' ? (
              <div className="space-y-4">
                <SectionCard
                  title="Stream Overview"
                  icon={<Bot className="h-4 w-4" />}
                  action={<button onClick={() => void onCopy(log.stream_response || '', '流式响应已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">复制 Stream</button>}
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
                          <div className="rounded-2xl bg-slate-950 p-4">
                            <JsonNode value={event.dataJson} />
                          </div>
                        ) : (
                          <pre className="rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{event.dataText || event.raw}</pre>
                        )}
                      </SectionCard>
                    ))}
                  </div>
                ) : (
                  <pre className="rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{streamJson !== null ? stringifyPretty(streamJson) : (log.stream_response || '暂无 stream_response 内容')}</pre>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
