import React, { useMemo, useState } from 'react';
import { Bot, Loader2, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../clients/api';
import {
  LlmProviderChatMessage,
  LlmProviderChatResult,
  LlmProviderChatStreamEvent,
  LlmProviderModelListResult,
  LlmProviderSummary,
} from '../../types/types';

interface LlmProviderChatWorkspaceProps {
  providers: LlmProviderSummary[];
}

const createFallbackModelList = (provider: LlmProviderSummary, errorMessage?: string): LlmProviderModelListResult => ({
  provider_key: provider.provider_key,
  provider_type: provider.provider_type,
  error_message: errorMessage || null,
  items: provider.model
    ? [{ value: provider.model, label: provider.model, source: 'configured' as const }]
    : [],
});

const getProviderStatusTone = (provider: LlmProviderSummary) =>
  provider.enabled ? 'bg-green-500/15 text-green-400' : 'bg-theme-elevated text-theme-text-muted';

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-primary underline decoration-blue-300 underline-offset-2"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold text-theme-text-primary last:mb-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold text-theme-text-primary last:mb-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-base font-semibold text-theme-text-primary last:mb-0">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l-4 border-theme-border bg-theme-elevated px-4 py-2 italic text-theme-text-secondary last:mb-0">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto last:mb-0">
            <table className="min-w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-theme-elevated">{children}</thead>,
        th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-semibold text-theme-text-primary">{children}</th>,
        td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top text-theme-text-secondary">{children}</td>,
        code: ({ children, className }) => {
          const isBlock = Boolean(className);
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 font-mono text-xs text-theme-text-primary">
                {children}
              </code>
            );
          }
          return <code className="rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">{children}</code>;
        },
        pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export const LlmProviderChatWorkspace: React.FC<LlmProviderChatWorkspaceProps> = ({ providers }) => {
  const platformApi = api.domains.platform;
  const providersByKey = useMemo(
    () => new Map(providers.map((item) => [item.provider_key, item])),
    [providers]
  );
  const [selectedProviderKeys, setSelectedProviderKeys] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<Record<string, LlmProviderModelListResult>>({});
  const [modelLoading, setModelLoading] = useState<Record<string, boolean>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [customModels, setCustomModels] = useState<Record<string, string>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, LlmProviderChatMessage[]>>({});
  const [latestResults, setLatestResults] = useState<Record<string, LlmProviderChatResult>>({});
  const [streamingProviderKeys, setStreamingProviderKeys] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatNotice, setChatNotice] = useState('');

  const selectedProviders = selectedProviderKeys
    .map((key) => providersByKey.get(key))
    .filter((item): item is LlmProviderSummary => Boolean(item));

  const loadModels = async (providerKey: string, force = false) => {
    if (!force && modelOptions[providerKey]) return;
    const provider = providersByKey.get(providerKey);
    if (!provider) return;

    setModelLoading((current) => ({ ...current, [providerKey]: true }));
    try {
      const response = await platformApi.configCenter.listLlmProviderModels(providerKey);
      setModelOptions((current) => ({ ...current, [providerKey]: response }));
      setSelectedModels((current) => ({
        ...current,
        [providerKey]: current[providerKey] || response.items?.[0]?.value || provider.model || '',
      }));
      if (response.error_message) {
        setChatNotice(`${provider.display_name} 的模型列表已回退到本地配置，可继续手动输入模型。`);
      }
    } catch (err: any) {
      setModelOptions((current) => ({
        ...current,
        [providerKey]: createFallbackModelList(provider, err.message || '模型列表拉取失败'),
      }));
      setSelectedModels((current) => ({
        ...current,
        [providerKey]: current[providerKey] || provider.model || '',
      }));
      setChatNotice(`${provider.display_name} 的模型列表拉取失败，已回退到已配置模型。`);
    } finally {
      setModelLoading((current) => ({ ...current, [providerKey]: false }));
    }
  };

  const toggleProvider = async (providerKey: string, checked: boolean) => {
    setChatError('');
    setChatNotice('');
    if (checked) {
      setSelectedProviderKeys((current) => Array.from(new Set([...current, providerKey])));
      setChatHistories((current) => ({ ...current, [providerKey]: current[providerKey] || [] }));
      await loadModels(providerKey);
      return;
    }
    setSelectedProviderKeys((current) => current.filter((item) => item !== providerKey));
  };

  const handleSend = async () => {
    const text = draftMessage.trim();
    if (!text) {
      setChatError('请先输入消息内容');
      return;
    }
    if (selectedProviderKeys.length === 0) {
      setChatError('请至少选择一个已保存的 Provider');
      return;
    }

    const nextHistories: Record<string, LlmProviderChatMessage[]> = { ...chatHistories };
    const targets = selectedProviderKeys.map((providerKey) => {
      const finalModel = (customModels[providerKey] || selectedModels[providerKey] || providersByKey.get(providerKey)?.model || '').trim();
      if (!finalModel) {
        throw new Error(`请先为 ${providersByKey.get(providerKey)?.display_name || providerKey} 选择或填写模型`);
      }
      const messages = [...(nextHistories[providerKey] || []), { role: 'user' as const, content: text }];
      nextHistories[providerKey] = messages;
      return {
        provider_key: providerKey,
        model: finalModel,
        messages,
      };
    });

    setSending(true);
    setChatError('');
    setChatNotice('');
    setChatHistories(nextHistories);
    setStreamingProviderKeys(selectedProviderKeys);
    try {
      setDraftMessage('');
      await platformApi.configCenter.streamChatWithLlmProviders(
        { targets },
        {
          onEvent: (event: LlmProviderChatStreamEvent) => {
            if (!event?.type || !event.provider_key) {
              if (event?.type === 'all_done') {
                setStreamingProviderKeys([]);
              }
              return;
            }

            if (event.type === 'start') {
              setChatHistories((current) => {
                const existing = [...(current[event.provider_key!] || [])];
                if (existing[existing.length - 1]?.role !== 'assistant') {
                  existing.push({ role: 'assistant', content: '' });
                }
                return { ...current, [event.provider_key!]: existing };
              });
              return;
            }

            if (event.type === 'delta') {
              setChatHistories((current) => {
                const existing = [...(current[event.provider_key!] || [])];
                if (existing.length === 0 || existing[existing.length - 1]?.role !== 'assistant') {
                  existing.push({ role: 'assistant', content: String(event.delta || '') });
                } else {
                  const last = existing[existing.length - 1];
                  existing[existing.length - 1] = { ...last, content: `${last.content}${event.delta || ''}` };
                }
                return { ...current, [event.provider_key!]: existing };
              });
              return;
            }

            if (event.type === 'error') {
              setLatestResults((current) => ({
                ...current,
                [event.provider_key!]: {
                  provider_key: event.provider_key!,
                  provider_type: event.provider_type || '',
                  model: event.model || '',
                  ok: false,
                  assistant_message: null,
                  latency_ms: event.latency_ms || 0,
                  status_code: event.status_code,
                  request_target: event.request_target,
                  error_message: event.error_message || '未返回更多错误信息',
                },
              }));
              setChatHistories((current) => {
                const existing = [...(current[event.provider_key!] || [])];
                if (existing[existing.length - 1]?.role === 'assistant' && !existing[existing.length - 1]?.content.trim()) {
                  existing.pop();
                }
                existing.push({ role: 'system', content: `请求失败：${event.error_message || '未返回更多错误信息'}` });
                return { ...current, [event.provider_key!]: existing };
              });
              setStreamingProviderKeys((current) => current.filter((key) => key !== event.provider_key));
              return;
            }

            if (event.type === 'done') {
              setLatestResults((current) => ({
                ...current,
                [event.provider_key!]: {
                  provider_key: event.provider_key!,
                  provider_type: event.provider_type || '',
                  model: event.model || '',
                  ok: Boolean(event.ok),
                  assistant_message: event.assistant_message || null,
                  latency_ms: event.latency_ms || 0,
                  status_code: event.status_code,
                  request_target: event.request_target,
                  error_message: event.error_message || null,
                },
              }));
              setChatHistories((current) => {
                const existing = [...(current[event.provider_key!] || [])];
                if (existing[existing.length - 1]?.role === 'assistant' && !existing[existing.length - 1]?.content.trim()) {
                  existing[existing.length - 1] = {
                    role: 'assistant',
                    content: event.assistant_message || '(模型返回了空内容)',
                  };
                }
                return { ...current, [event.provider_key!]: existing };
              });
              setStreamingProviderKeys((current) => current.filter((key) => key !== event.provider_key));
            }
          },
          onDone: () => setStreamingProviderKeys([]),
        }
      );
      setDraftMessage('');
      setChatNotice('流式对话已完成。');
    } catch (err: any) {
      setStreamingProviderKeys([]);
      setChatError(err.message || '发送消息失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-[2.5rem] border border-theme-border bg-theme-surface p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-faint">在线聊天</p>
          <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-theme-text-primary">
            <MessageSquare className="h-6 w-6 text-brand-primary" />
            并排模型对话
          </h2>
          <p className="mt-2 text-sm text-theme-text-muted">
            勾选一个或多个已保存 Provider，选择模型后即可开启多轮对话。聊天记录仅保存在当前页面内存中。
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-brand-border bg-brand-soft px-4 py-3 text-xs font-bold text-brand-primary">
          模型来源 = 后端模型列表 + Provider 已配置模型 + 手动输入
        </div>
      </div>

      {(chatError || chatNotice) && (
        <div className={`mt-5 rounded-[1.75rem] border px-5 py-4 text-sm font-bold ${chatError ? 'border-red-500/20 bg-red-500/15 text-red-400' : 'border-blue-500/20 bg-blue-500/15 text-blue-400'}`}>
          {chatError || chatNotice}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[2rem] border border-theme-border bg-theme-elevated p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-theme-text-primary">选择 Provider</h3>
              <span className="rounded-full bg-theme-surface px-3 py-1 text-xs font-medium text-theme-text-muted">{selectedProviderKeys.length} 已选择</span>
            </div>
            <div className="mt-4 space-y-3">
              {providers.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-center text-xs font-medium text-theme-text-muted">
                  当前还没有可用的已保存 Provider。
                </div>
              ) : providers.map((provider) => {
                const checked = selectedProviderKeys.includes(provider.provider_key);
                return (
                  <label
                    key={provider.provider_key}
                    className={`block rounded-[1.5rem] border p-4 transition-all ${checked ? 'border-brand-border bg-brand-soft shadow-brand' : 'border-theme-border bg-theme-surface hover:border-brand-border'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => void toggleProvider(provider.provider_key, event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-theme-border text-brand-primary focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-theme-text-primary">{provider.display_name}</span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${getProviderStatusTone(provider)}`}>
                            {provider.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-xs text-theme-text-muted">{provider.provider_key}</p>
                        <p className="mt-2 text-xs text-theme-text-muted">{provider.provider_type}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {selectedProviders.map((provider) => {
            const options = modelOptions[provider.provider_key]?.items || [];
            const effectiveModel = customModels[provider.provider_key]?.trim() || selectedModels[provider.provider_key] || provider.model || '';
            return (
              <div key={provider.provider_key} className="rounded-[2rem] border border-theme-border bg-theme-surface p-5 shadow-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-theme-text-primary">{provider.display_name}</h3>
                    <p className="mt-1 text-xs text-theme-text-muted">{provider.provider_type}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadModels(provider.provider_key, true)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-medium text-theme-text-secondary"
                  >
                    {modelLoading[provider.provider_key] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    刷新模型
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-theme-text-faint">可选模型</label>
                    <select
                      value={selectedModels[provider.provider_key] || ''}
                      onChange={(event) => setSelectedModels((current) => ({ ...current, [provider.provider_key]: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3 text-sm text-theme-text-primary outline-none focus:border-blue-500"
                    >
                      <option value="">请选择模型</option>
                      {options.map((item) => (
                        <option key={`${provider.provider_key}-${item.value}`} value={item.value}>
                          {item.label}{item.source === 'configured' ? ' (已配置)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-theme-text-faint">手动模型名</label>
                    <input
                      value={customModels[provider.provider_key] || ''}
                      onChange={(event) => setCustomModels((current) => ({ ...current, [provider.provider_key]: event.target.value }))}
                      className="form-input mt-2 w-full"
                      placeholder="可直接覆盖上面的选择，例如 gpt-4.1-mini"
                    />
                  </div>
                  <div className="rounded-[1.5rem] border border-theme-border bg-theme-elevated px-4 py-3 text-xs text-theme-text-secondary">
                    当前发送模型：<span className="font-mono font-bold text-theme-text-primary">{effectiveModel || '未选择'}</span>
                  </div>
                  {modelOptions[provider.provider_key]?.error_message && (
                    <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-xs text-amber-400">
                      {modelOptions[provider.provider_key]?.error_message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] border border-theme-border bg-theme-elevated p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-theme-text-primary">发送消息</h3>
                <p className="mt-1 text-xs text-theme-text-muted">同一条消息会并排发送给已勾选 Provider，各自保留自己的多轮上下文。</p>
              </div>
              <div className="rounded-full bg-theme-surface px-3 py-1 text-xs font-medium text-theme-text-muted">
                {selectedProviderKeys.length} 个会话列
              </div>
            </div>
            <textarea
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              rows={4}
              placeholder="输入你想发给模型的内容"
              className="form-textarea mt-4 w-full"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                <Sparkles size={14} className="text-brand-primary" />
                默认流式传输，支持上游 Provider 与浏览器前端实时增量显示。
              </div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending}
                className="theme-primary-button px-5 py-3 text-sm disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                发送到所选模型
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {selectedProviders.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-theme-border bg-theme-surface px-6 py-12 text-center">
                <Bot className="mx-auto h-8 w-8 text-theme-text-faint" />
                <p className="mt-4 text-sm font-semibold text-theme-text-secondary">先勾选至少一个已保存 Provider，再开始在线对话。</p>
              </div>
            ) : (
              <div
                className="grid min-w-full gap-4"
                style={{ gridTemplateColumns: `repeat(${selectedProviders.length}, minmax(280px, 1fr))` }}
              >
                {selectedProviders.map((provider) => {
                  const result = latestResults[provider.provider_key];
                  const currentModel = (customModels[provider.provider_key] || selectedModels[provider.provider_key] || provider.model || '').trim();
                  return (
                    <div key={provider.provider_key} className="flex min-h-[560px] flex-col rounded-[2rem] border border-theme-border bg-theme-surface shadow-panel">
                      <div className="border-b border-theme-border px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-theme-text-primary">{provider.display_name}</h3>
                            <p className="mt-1 text-xs text-theme-text-muted">{provider.provider_type}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${getProviderStatusTone(provider)}`}>
                            {provider.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                          <span className="rounded-full bg-theme-elevated px-3 py-1 text-theme-text-secondary">{currentModel || '未选择模型'}</span>
                          {streamingProviderKeys.includes(provider.provider_key) && (
                            <span className="rounded-full bg-brand-soft px-3 py-1 text-brand-primary">streaming...</span>
                          )}
                          {result && <span className={`rounded-full px-3 py-1 ${result.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{result.latency_ms} ms</span>}
                        </div>
                      </div>
                      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        {(chatHistories[provider.provider_key] || []).length === 0 ? (
                          <div className="rounded-[1.5rem] border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-xs text-theme-text-muted">
                            这里会显示 {provider.display_name} 的多轮会话内容。
                          </div>
                        ) : (chatHistories[provider.provider_key] || []).map((message, index) => (
                          <div
                            key={`${provider.provider_key}-${index}`}
                            className={`rounded-[1.5rem] px-4 py-3 text-sm ${
                              message.role === 'user'
                                ? 'ml-8 bg-brand-primary text-theme-text-inverse'
                                : message.role === 'assistant'
                                  ? 'mr-8 bg-theme-elevated text-theme-text-primary'
                                  : 'border border-amber-500/20 bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest opacity-70">
                              {message.role === 'user' ? '你' : message.role === 'assistant' ? provider.display_name : '系统提示'}
                            </div>
                            {message.role === 'assistant' ? (
                              <MarkdownMessage content={message.content} />
                            ) : (
                              <div className="whitespace-pre-wrap break-words leading-6">{message.content}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
