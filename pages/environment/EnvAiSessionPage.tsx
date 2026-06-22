import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send, SquareTerminal, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import { AgentResponse, AgentTraceEvent, AiAgentSession, AiHelperService, AiSessionStreamEvent } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { EmptyState, buildHelperKey, navigateToAppView, parseHelperKey, useAiHelpers } from './ai-agent/shared';
import { PageHeader } from '../../design-system';

const SESSION_AUTO_SYNC_ENABLED_KEY = 'chimera_ai_session_auto_sync_enabled';
const SESSION_AUTO_SYNC_INTERVAL_KEY = 'chimera_ai_session_auto_sync_interval_ms';
const SESSION_MODE_KEY = 'chimera_ai_session_mode';

const compactTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const shortSessionId = (sessionId?: string) => {
  const text = String(sessionId || '');
  if (text.length <= 16) return text;
  return`${text.slice(0, 8)}...${text.slice(-6)}`;
};

const resolveBackendPid = (session?: AiAgentSession | null) => {
  if (!session) return null;
  return session.backend_pid ?? session.pty_pid ?? null;
};

const cloneMessages = (session?: AiAgentSession | null) =>
  Array.isArray(session?.messages) ? [...(session?.messages || [])] : [];

const sessionMessageScore = (session?: AiAgentSession | null) => {
  const messages = cloneMessages(session);
  const count = messages.length;
  const nonEmptyCount = messages.filter((item) => String(item?.content || '').trim().length > 0).length;
  const totalChars = messages.reduce((sum, item) => sum + String(item?.content || '').length, 0);
  return (count * 1_000_000) + (nonEmptyCount * 10_000) + totalChars;
};

const pickRicherSession = (primary?: AiAgentSession | null, fallback?: AiAgentSession | null): AiAgentSession | null => {
  if (!primary && !fallback) return null;
  if (!primary) return fallback || null;
  if (!fallback) return primary;
  const preferred = sessionMessageScore(primary) >= sessionMessageScore(fallback) ? primary : fallback;
  const alternative = preferred === primary ? fallback : primary;
  if (!preferred?.last_response && alternative?.last_response) {
    return { ...preferred, last_response: alternative.last_response };
  }
  return preferred;
};

const getAgentResponse = (value: any): AgentResponse | null => {
  if (value && typeof value === 'object' && value.object === 'agent.response') return value as AgentResponse;
  if (value?.response && typeof value.response === 'object' && value.response.object === 'agent.response') return value.response as AgentResponse;
  return null;
};

const extractSendResultOutput = (result: any): string => {
  const response = getAgentResponse(result);
  if (response) return String(response.output_text || '').trim();
  const list = Array.isArray(result?.result?.results)
    ? result.result.results
    : (Array.isArray(result?.results) ? result.results : []);
  for (const item of list) {
    const text = String(item?.output || item?.raw?.output || item?.raw?.raw?.stdout || '').trim();
    if (text) return text;
  }
  return '';
};

const extractResponseReasoning = (response?: AgentResponse | null): string =>
  Array.isArray(response?.output)
    ? response!.output
        .filter((item) => String(item?.type || '').toLowerCase() === 'reasoning')
        .map((item) => String(item?.text || ''))
        .join('')
        .trim()
    : '';

const extractResponseTrace = (response?: AgentResponse | null): AgentTraceEvent[] =>
  Array.isArray(response?.trace) ? response!.trace.filter(Boolean) : [];

const patchSessionWithOutput = (session?: AiAgentSession | null, outputText = ''): AiAgentSession | null => {
  if (!session) return null;
  if (!outputText.trim()) return session;
  const messages = cloneMessages(session);
  if (messages.length === 0) {
    return { ...session, messages: [{ role: 'assistant', content: outputText }] };
  }
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant') {
    if (!String(last.content || '').trim()) {
      messages[messages.length - 1] = { ...last, content: outputText };
      return { ...session, messages };
    }
    return session;
  }
  messages.push({ role: 'assistant', content: outputText });
  return { ...session, messages };
};

const statusTone = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text === 'ready') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (text === 'broken') return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
  if (text === 'closed') return 'bg-theme-elevated text-theme-text-secondary border-theme-border';
  return 'bg-theme-elevated text-theme-text-secondary border-theme-border';
};

const sessionModeLabel = (mode?: string) => {
  const text = String(mode || '').toLowerCase();
  if (text === 'pty') return 'VTY';
  if (text === 'pipe') return '非VTY';
  if (text === 'invoke') return '经典';
  return '非VTY';
};
const sessionModeTone = (mode?: string) =>
  String(mode || '').toLowerCase() === 'pty'
    ? 'bg-violet-500/15 text-violet-400 border-violet-500/20'
    : String(mode || '').toLowerCase() === 'invoke'
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20';

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-blue-400 underline underline-offset-2">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        blockquote: ({ children }) => <blockquote className="mb-2 border-l-4 border-theme-border bg-theme-elevated px-3 py-1.5 italic last:mb-0">{children}</blockquote>,
        code: ({ children, className }) => (className
          ? <code className="block overflow-x-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-2 font-mono text-xs text-theme-text-primary">{children}</code>
          : <code className="rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>),
        pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export const EnvAiSessionPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const { loading, helpers, reload } = useAiHelpers(projectId, notify);
  const [selectedHelperKey, setSelectedHelperKey] = useState('');
  const [selectedHelper, setSelectedHelper] = useState<AiHelperService | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [sessions, setSessions] = useState<AiAgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [currentSession, setCurrentSession] = useState<AiAgentSession | null>(null);
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [transportMode, setTransportMode] = useState<'stream' | 'non_stream'>('stream');
  const [sessionMode, setSessionMode] = useState<'pipe' | 'pty' | 'invoke'>(() => {
    const raw = String(localStorage.getItem(SESSION_MODE_KEY) || '').toLowerCase();
    if (raw === 'pipe') return 'pipe';
    if (raw === 'pty') return 'pty';
    return 'invoke';
  });
  const [helperSearch, setHelperSearch] = useState('');
  const [errorDialog, setErrorDialog] = useState<{ title: string; content: string } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const [currentTrace, setCurrentTrace] = useState<AgentTraceEvent[]>([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(SESSION_AUTO_SYNC_ENABLED_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  });
  const [autoSyncIntervalMs, setAutoSyncIntervalMs] = useState<number>(() => {
    const raw = Number(localStorage.getItem(SESSION_AUTO_SYNC_INTERVAL_KEY) || '12000');
    return raw === 5000 || raw === 10000 || raw === 15000 ? raw : 12000;
  });
  const isInvokeMode = sessionMode === 'invoke';

  useEffect(() => {
    if (!selectedHelperKey && helpers.length > 0) {
      setSelectedHelperKey(buildHelperKey(helpers[0].agent_key, helpers[0].service_name));
    }
  }, [helpers, selectedHelperKey]);

  useEffect(() => {
    if (!selectedHelperKey) {
      setSelectedHelper(null);
      setSessions([]);
      setCurrentSession(null);
      return;
    }
    const { agentKey, serviceName } = parseHelperKey(selectedHelperKey);
    if (agentKey && serviceName) {
      void loadHelperData(agentKey, serviceName, { silent: false });
    }
  }, [selectedHelperKey]);

  const loadHelperData = async (
    agentKey: string,
    serviceName: string,
    options: { silent?: boolean; preferredSession?: AiAgentSession | null } = {},
  ) => {
    try {
      const [detail, sessionList] = await Promise.all([
        environmentApi.environment.getAiHelperDetail(projectId, agentKey, serviceName),
        environmentApi.environment.listAiHelperSessions(projectId, agentKey, serviceName),
      ]);
      setSelectedHelper(detail);
      const agents = detail?.agents || [];
      if (agents.length > 0) {
        const hasSelected = agents.some((item) => item.agent_id === selectedAgentId);
        if (!hasSelected) {
          setSelectedAgentId(agents[0].agent_id);
        }
      } else {
        setSelectedAgentId('');
      }
      setSessions(sessionList.items || []);
      if (currentSessionId && !isInvokeMode) {
        try {
          const fetchedSession = await environmentApi.environment.getAiHelperSession(projectId, agentKey, serviceName, currentSessionId);
          setCurrentSession((prev) => {
            const preferred = options.preferredSession?.session_id === currentSessionId ? options.preferredSession : null;
            const prevSession = prev?.session_id === currentSessionId ? prev : null;
            return pickRicherSession(pickRicherSession(fetchedSession, preferred), prevSession);
          });
        } catch {
          if (options.preferredSession?.session_id === currentSessionId) {
            setCurrentSession(options.preferredSession);
          } else {
            setCurrentSession(null);
          }
        }
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (error: any) {
      if (!options.silent) {
        notify(`加载会话页数据失败: ${error?.message || error}`, 'error');
      }
    }
  };

  useEffect(() => {
    localStorage.setItem(SESSION_AUTO_SYNC_ENABLED_KEY, autoSyncEnabled ? 'true' : 'false');
  }, [autoSyncEnabled]);

  useEffect(() => {
    localStorage.setItem(SESSION_AUTO_SYNC_INTERVAL_KEY, String(autoSyncIntervalMs));
  }, [autoSyncIntervalMs]);

  useEffect(() => {
    localStorage.setItem(SESSION_MODE_KEY, sessionMode);
  }, [sessionMode]);

  useEffect(() => {
    const response = getAgentResponse(currentSession?.last_response);
    setCurrentReasoning(extractResponseReasoning(response));
    setCurrentTrace(extractResponseTrace(response));
  }, [currentSession]);

  useEffect(() => {
    if (!selectedHelperKey) return;
    if (!autoSyncEnabled) return;
    const { agentKey, serviceName } = parseHelperKey(selectedHelperKey);
    if (!agentKey || !serviceName) return;
    const timer = window.setInterval(() => {
      if (busyAction) return;
      void loadHelperData(agentKey, serviceName, { silent: true });
    }, autoSyncIntervalMs);
    return () => window.clearInterval(timer);
  }, [selectedHelperKey, busyAction, projectId, currentSessionId, selectedAgentId, autoSyncEnabled, autoSyncIntervalMs]);

  const syncHelperSessions = async () => {
    if (!selectedHelperKey) return;
    const { agentKey, serviceName } = parseHelperKey(selectedHelperKey);
    if (!agentKey || !serviceName) {
      notify('请先选择 helper 服务', 'error');
      return;
    }
    setBusyAction('sync');
    try {
      await loadHelperData(agentKey, serviceName, { silent: false });
      notify('会话状态已与 helper 同步', 'success');
    } finally {
      setBusyAction('');
    }
  };

  const createSession = async () => {
    if (!selectedHelper) {
      notify('请先选择 helper 服务', 'error');
      return;
    }
    if (isInvokeMode) {
      const localId =`invoke-${Date.now()}`;
      setCurrentSessionId(localId);
      setCurrentReasoning('');
      setCurrentTrace([]);
      setCurrentSession({
        session_id: localId,
        session_mode: 'invoke',
        status: 'ready',
        backend: selectedAgentId || undefined,
        agent_ids: selectedAgentId ? [selectedAgentId] : [],
        messages: [],
      } as AiAgentSession);
      notify('经典模式已就绪，可直接发送消息', 'success');
      return;
    }
    setBusyAction('create');
    try {
      const session = await environmentApi.environment.createAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, {
        agent_ids: selectedAgentId ? [selectedAgentId] : undefined,
        session_mode: sessionMode,
        metadata: { source: 'env-ai-session-page' },
      });
      setCurrentSessionId(session.session_id);
      setCurrentSession(session);
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false });
      notify('单会话已创建', 'success');
    } catch (error: any) {
      notify(`创建会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const refreshCurrentSession = async () => {
    if (!selectedHelper || !currentSessionId) return;
    setBusyAction('refresh');
    try {
      const session = await environmentApi.environment.getAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, currentSessionId);
      setCurrentSession(session);
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false });
    } catch (error: any) {
      notify(`刷新会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!selectedHelper) {
      notify('请先选择 helper 服务', 'error');
      return;
    }
    const ok = await confirm({ message: '确认删除该会话吗？删除后无法恢复。', danger: true });
    if (!ok) return;
    setBusyAction('delete_session');
    try {
      await environmentApi.environment.deleteAiHelperSession(
        projectId,
        selectedHelper.agent_key,
        selectedHelper.service_name,
        sessionId
      );
      if (currentSessionId === sessionId) {
        setCurrentSessionId('');
        setCurrentSession(null);
      }
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false });
      notify('会话已删除', 'success');
    } catch (error: any) {
      notify(`删除会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const sendMessage = async () => {
    if (!selectedHelper || !message.trim()) {
      notify('请先创建会话并输入消息', 'error');
      return;
    }
    if (!isInvokeMode && !currentSessionId) {
      notify('请先创建会话并输入消息', 'error');
      return;
    }
    setBusyAction('send');
    const messageText = message.trim();
    try {
      setCurrentReasoning('');
      setCurrentTrace([]);
      if (isInvokeMode) {
        const localSessionId = currentSessionId ||`invoke-${Date.now()}`;
        if (!currentSessionId) setCurrentSessionId(localSessionId);
        if (transportMode === 'stream') {
          setCurrentSession((prev) => {
            const base = prev
              ? { ...prev, messages: [...(prev.messages || [])] }
              : { session_id: localSessionId, session_mode: 'invoke', status: 'ready', messages: [] as Array<{ role: string; content: string }> };
            base.messages = [...(base.messages || []), { role: 'user', content: messageText }, { role: 'assistant', content: '' }];
            return base as AiAgentSession;
          });
          await environmentApi.environment.invokeAiHelperStream(
            projectId,
            selectedHelper.agent_key,
            selectedHelper.service_name,
            {
              content: messageText,
              agent_ids: selectedAgentId ? [selectedAgentId] : undefined,
            },
            {
              onEvent: (event: AiSessionStreamEvent) => {
                if (event.type === 'response.output_text.delta' || event.type === 'delta') {
                  const readableDelta = String(event.delta || '');
                  if (!readableDelta) return;
                  setCurrentSession((prev) => {
                    if (!prev) return prev;
                    const messages = [...(prev.messages || [])];
                    if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
                      messages.push({ role: 'assistant', content: readableDelta });
                    } else {
                      messages[messages.length - 1] = {
                        ...messages[messages.length - 1],
                        content:`${messages[messages.length - 1].content}${readableDelta}`,
                      };
                    }
                    return { ...prev, messages };
                  });
                }
                if (event.type === 'response.reasoning.delta') {
                  setCurrentReasoning((prev) =>`${prev}${String(event.delta || '')}`);
                }
                if (event.type === 'response.trace.item' && event.item) {
                  setCurrentTrace((prev) => [...prev, event.item as AgentTraceEvent]);
                }
                if (event.type === 'response.completed' || event.type === 'response.failed') {
                  const response = getAgentResponse(event.response);
                  if (response) {
                    setCurrentReasoning(extractResponseReasoning(response));
                    setCurrentTrace(extractResponseTrace(response));
                    setCurrentSession((prev) => (prev ? { ...prev, last_response: response } : prev));
                    if (event.type === 'response.failed' && !String(response.output_text || '').trim() && String(response.error || '').trim()) {
                      setCurrentSession((prev) => {
                        if (!prev) return prev;
                        const messages = [...(prev.messages || [])];
                        if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
                          messages.push({ role: 'assistant', content: String(response.error || '') });
                        } else if (!String(messages[messages.length - 1].content || '').trim()) {
                          messages[messages.length - 1] = { ...messages[messages.length - 1], content: String(response.error || '') };
                        }
                        return { ...prev, messages };
                      });
                    }
                  }
                }
              },
            }
          );
        } else {
          const result = await environmentApi.environment.invokeAiHelper(
            projectId,
            selectedHelper.agent_key,
            selectedHelper.service_name,
            {
              content: messageText,
              agent_ids: selectedAgentId ? [selectedAgentId] : undefined,
            }
          );
          const outputText = extractSendResultOutput(result);
          const response = getAgentResponse(result);
          setCurrentReasoning(extractResponseReasoning(response));
          setCurrentTrace(extractResponseTrace(response));
          setCurrentSession((prev) => {
            const base = prev
              ? { ...prev, messages: [...(prev.messages || [])] }
              : { session_id: localSessionId, session_mode: 'invoke', status: 'ready', messages: [] as Array<{ role: string; content: string }> };
            if (response) {
              (base as AiAgentSession).last_response = response;
            }
            base.messages = [...(base.messages || []), { role: 'user', content: messageText }];
            const patched = patchSessionWithOutput(base as AiAgentSession, outputText);
            return patched;
          });
        }
        setMessage('');
        notify('消息已发送', 'success');
        return;
      }

      if (transportMode === 'stream') {
        let latestSession: AiAgentSession | null = null;
        setCurrentSession((prev) => {
          const base = prev ? { ...prev, messages: [...(prev.messages || [])] } : { session_id: currentSessionId, messages: [] as Array<{ role: string; content: string }> };
          base.messages = [...(base.messages || []), { role: 'user', content: messageText }, { role: 'assistant', content: '' }];
          return base as AiAgentSession;
        });
        await environmentApi.environment.sendAiHelperSessionMessageStream(
          projectId,
          selectedHelper.agent_key,
          selectedHelper.service_name,
          currentSessionId,
          messageText,
          {
            onEvent: (event: AiSessionStreamEvent) => {
              if (event.type === 'response.output_text.delta' || event.type === 'delta') {
                const readableDelta = String(event.delta || '');
                if (!readableDelta) return;
                setCurrentSession((prev) => {
                  if (!prev) return prev;
                  const messages = [...(prev.messages || [])];
                  if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
                    messages.push({ role: 'assistant', content: readableDelta });
                  } else {
                    messages[messages.length - 1] = {
                      ...messages[messages.length - 1],
                      content:`${messages[messages.length - 1].content}${readableDelta}`,
                    };
                  }
                  return { ...prev, messages };
                });
              }
              if (event.type === 'response.reasoning.delta') {
                setCurrentReasoning((prev) =>`${prev}${String(event.delta || '')}`);
              }
              if (event.type === 'response.trace.item' && event.item) {
                setCurrentTrace((prev) => [...prev, event.item as AgentTraceEvent]);
              }
              if ((event.type === 'response.completed' || event.type === 'response.failed') && event.session) {
                latestSession = event.session;
                setCurrentSession(event.session);
              }
              if (event.type === 'response.completed' || event.type === 'response.failed') {
                const response = getAgentResponse(event.response);
                if (response) {
                  setCurrentReasoning(extractResponseReasoning(response));
                  setCurrentTrace(extractResponseTrace(response));
                  latestSession = latestSession ? { ...latestSession, last_response: response } : latestSession;
                  setCurrentSession((prev) => (prev ? { ...prev, last_response: response } : prev));
                }
              }
            },
          }
        );
        if (latestSession) setCurrentSession(latestSession);
        setMessage('');
        await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false, preferredSession: latestSession });
        notify('消息已发送', 'success');
        return;
      } else {
        const result = await environmentApi.environment.sendAiHelperSessionMessage(projectId, selectedHelper.agent_key, selectedHelper.service_name, currentSessionId, messageText);
        const outputText = extractSendResultOutput(result);
        const response = getAgentResponse(result);
        setCurrentReasoning(extractResponseReasoning(response));
        setCurrentTrace(extractResponseTrace(response));
        const localBaseSession: AiAgentSession = currentSession
          ? { ...currentSession, messages: [...(currentSession.messages || [])] }
          : {
              session_id: currentSessionId,
              session_mode: sessionMode,
              status: 'ready',
              messages: [],
            };
        localBaseSession.messages = [...(localBaseSession.messages || []), { role: 'user', content: messageText }];
        const patchedSessionBase = patchSessionWithOutput(localBaseSession, outputText) || localBaseSession;
        const patchedSession: AiAgentSession = response
          ? { ...patchedSessionBase, last_response: response }
          : patchedSessionBase;
        setCurrentSession(patchedSession);
        await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false, preferredSession: patchedSession });
        setMessage('');
        notify('消息已发送', 'success');
        return;
      }
    } catch (error: any) {
      notify(`发送消息失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const helperAgentOptions = selectedHelper?.agents || [];
  const filteredHelpers = useMemo(() => {
    const keyword = helperSearch.trim().toLowerCase();
    if (!keyword) return helpers;
    return helpers.filter((helper) =>
      [helper.agent_hostname, helper.agent_key, helper.service_name].join(' ').toLowerCase().includes(keyword)
    );
  }, [helpers, helperSearch]);
  const helperSelectOptions = useMemo(() => {
    if (!selectedHelperKey) return filteredHelpers;
    if (filteredHelpers.some((item) => buildHelperKey(item.agent_key, item.service_name) === selectedHelperKey)) {
      return filteredHelpers;
    }
    const selected = helpers.find((item) => buildHelperKey(item.agent_key, item.service_name) === selectedHelperKey);
    return selected ? [selected, ...filteredHelpers] : filteredHelpers;
  }, [helpers, filteredHelpers, selectedHelperKey]);

  return (
    <div className="px-6 pt-6 pb-8">
      <div className="space-y-4">
        {feedbackNodes}
        <PageHeader
          title="单会话"
          description="更紧凑的单会话视图：左侧管理会话，右侧专注对话。"
          actions={<div className="flex items-center gap-2">
              <button onClick={() => navigateToAppView('env-ai-agent-session-manage')} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3.5 py-2 text-sm font-semibold text-theme-text-secondary"><SquareTerminal size={15} />会话管理</button>
              <span className="text-[11px] text-theme-text-muted">最后同步: {compactTime(lastSyncedAt)}</span>
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-theme-border px-2 py-1 text-xs text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                />
                自动同步
              </label>
              <select
                value={String(autoSyncIntervalMs)}
                onChange={(event) => setAutoSyncIntervalMs(Number(event.target.value))}
                className="form-select text-xs"
                disabled={!autoSyncEnabled}
              >
                <option value="5000">5s</option>
                <option value="10000">10s</option>
                <option value="15000">15s</option>
              </select>
              <button onClick={() => void syncHelperSessions()} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3.5 py-2 text-sm font-semibold text-white">{busyAction === 'sync' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}手动同步状态</button>
              <button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3.5 py-2 text-sm font-semibold text-theme-text-secondary"><RefreshCw size={15} />刷新 helper</button>
            </div>}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
 <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
            {loading ? <div className="mb-2 flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载中...</div> : null}
            <div className="space-y-3">
              <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-theme-text-muted">节点 Helper 服务</div>
                  <span className="rounded-full bg-theme-bg-app px-2 py-0.5 text-[11px] font-semibold text-theme-text-secondary">{filteredHelpers.length}/{helpers.length}</span>
                </div>
                <input
                  value={helperSearch}
                  onChange={(e) => setHelperSearch(e.target.value)}
                  placeholder="筛选 hostname / agent_key / service_name"
                  className="mb-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm"
                />
                <select value={selectedHelperKey} onChange={(e) => setSelectedHelperKey(e.target.value)} className="form-select w-full">
                  {helperSelectOptions.map((helper) => (
                    <option key={`${helper.agent_key}::${helper.service_name}`} value={`${helper.agent_key}::${helper.service_name}`}>{helper.agent_hostname || helper.agent_key} · {helper.service_name}</option>
                  ))}
                </select>
              </div>

 <div className="rounded-xl border border-blue-500/20 bg-theme-bg-app p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-blue-400">创建新会话</div>
                  <button onClick={() => void refreshCurrentSession()} className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-app px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary whitespace-nowrap">
                    <RefreshCw size={13} />
                    刷新当前
                  </button>
                </div>
                <div className="text-xs text-theme-text-muted">
                  {isInvokeMode ? '经典模式无需创建会话，选择 Agent 后可直接发送。' : '先选择参与 Agent，再创建会话。'}
                </div>
                <div className="mt-2 rounded-xl border border-theme-border bg-theme-surface p-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-theme-text-muted">会话模式</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name="single-session-mode" checked={sessionMode === 'pipe'} onChange={() => setSessionMode('pipe')} />
                      非VTY（PIPE）
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name="single-session-mode" checked={sessionMode === 'pty'} onChange={() => setSessionMode('pty')} />
                      VTY
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name="single-session-mode" checked={sessionMode === 'invoke'} onChange={() => setSessionMode('invoke')} />
                      经典（默认）
                    </label>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {helperAgentOptions.length === 0 ? <div className="text-xs text-theme-text-muted">当前 helper 没有可选 agent。</div> : helperAgentOptions.map((agent) => {
                    const checked = selectedAgentId === agent.agent_id;
                    return (
                      <label key={agent.agent_id} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${checked ? 'border-blue-500 bg-blue-600 text-white' : 'border-theme-border text-theme-text-secondary bg-theme-bg-app'}`}>
                        <input
                          type="radio"
                          name="single-session-agent"
                          className="hidden"
                          checked={checked}
                          onChange={() => setSelectedAgentId(agent.agent_id)}
                        />
                        {agent.agent_id}
                      </label>
                    );
                  })}
                </div>
                {!isInvokeMode ? (
                  <button onClick={() => void createSession()} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                    {busyAction === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                    创建会话
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-theme-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-theme-text-primary">会话列表</div>
                  <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-semibold text-theme-text-secondary">{sessions.length}</span>
                </div>
                <div className="space-y-2 max-h-[540px] overflow-auto pr-1">
                  {sessions.length === 0 ? <div className="text-sm text-theme-text-muted">暂无会话。</div> : sessions.map((session) => (
                    <div key={session.session_id} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${currentSessionId === session.session_id ? 'border-blue-400 bg-blue-500/15' : 'border-theme-border bg-theme-bg-app'}`}>
                      <button
                        onClick={async () => {
                          if (!selectedHelper) return;
                          setCurrentSessionId(session.session_id);
                          const detail = await environmentApi.environment.getAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, session.session_id);
                          setCurrentSession(detail);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-theme-text-primary">{shortSessionId(session.session_id)}</span>
                          <span className="inline-flex max-w-[210px] items-center gap-1 truncate rounded-full border border-cyan-500/20 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                            <Bot size={11} />
                            {(session.agent_ids || []).join(', ') || session.backend || '-'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${sessionModeTone(session.session_mode)}`}>{sessionModeLabel(session.session_mode)}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(session.status)}`}>{session.status || 'unknown'}</span>
                          <span className="rounded-full border border-theme-border bg-theme-bg-app px-1.5 py-0.5 text-[10px] font-semibold text-theme-text-secondary">
                            PID {resolveBackendPid(session) ?? '-'}
                          </span>
                        </div>
                        {session.last_error ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setErrorDialog({
                                title:`会话错误 · ${shortSessionId(session.session_id)}`,
                                content: String(session.last_error || ''),
                              });
                            }}
                            className="mt-1 block w-full truncate text-left text-[11px] text-rose-400 hover:text-rose-400 hover:underline"
                            title="点击查看完整错误"
                          >
                            {session.last_error}
                          </button>
                        ) : null}
                      </button>
                      <button
                        onClick={() => void deleteSession(session.session_id)}
                        className="rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/15"
                        title="删除会话"
                        disabled={busyAction === 'delete_session'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
            {!selectedHelper ? (
              <EmptyState text="请先选择一个 helper 服务。" />
            ) : (
              <div className="space-y-3">
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-theme-text-primary">{selectedHelper.service_name}</span>
                    <span className="text-theme-text-muted">·</span>
                    <span className="text-theme-text-secondary">{selectedHelper.agent_hostname} / {selectedHelper.agent_key}</span>
                    <span className="text-theme-text-muted">·</span>
                    <span className="text-theme-text-secondary">Session: {currentSessionId ? shortSessionId(currentSessionId) : '-'}</span>
                    {currentSession ? (
                      <>
                        <span className="text-theme-text-muted">·</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(currentSession.status)}`}>
                          {currentSession.status || 'unknown'}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${sessionModeTone(currentSession.session_mode)}`}>
                          {sessionModeLabel(currentSession.session_mode)}
                        </span>
                        <span className="text-theme-text-muted">·</span>
                        <span className="text-theme-text-secondary">Backend PID: {resolveBackendPid(currentSession) ?? '-'}</span>
                      </>
                    ) : null}
                    <span className="ml-auto inline-flex rounded-full border border-theme-border bg-theme-bg-app p-0.5">
                      <button
                        onClick={() => setTransportMode('stream')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${transportMode === 'stream' ? 'bg-theme-surface text-white' : 'text-theme-text-secondary'}`}
                      >
                        流式
                      </button>
                      <button
                        onClick={() => setTransportMode('non_stream')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${transportMode === 'non_stream' ? 'bg-theme-surface text-white' : 'text-theme-text-secondary'}`}
                      >
                        非流式
                      </button>
                    </span>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="form-textarea min-h-[76px] flex-1" placeholder="输入要发送给当前会话的消息" />
                  <button onClick={() => void sendMessage()} className="inline-flex h-[76px] items-center justify-center gap-2 rounded-xl bg-theme-surface px-4 text-sm font-semibold text-white">
                    {busyAction === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    发送
                  </button>
                </div>

                {currentSession ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-theme-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-theme-text-primary">当前会话消息</div>
                        <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-semibold text-theme-text-secondary">{(currentSession.messages || []).length}</span>
                      </div>
                      <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                        {(currentSession.messages || []).map((item, index) => (
                          <div key={`${item.role}-${index}`} className={`rounded-lg border px-3 py-2 text-sm ${item.role === 'assistant' ? 'border-theme-border bg-theme-bg-app' : 'border-blue-500/20 bg-blue-500/15'}`}>
                            <div className="mb-1 flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${item.role === 'assistant' ? 'bg-theme-elevated text-theme-text-secondary' : 'bg-blue-200 text-blue-400'}`}>
                                {item.role}
                              </span>
                            </div>
                            {item.role === 'assistant'
                              ? <MarkdownContent content={String(item.content || '')} />
                              : <div className="whitespace-pre-wrap">{item.content}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {currentReasoning ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 p-3">
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-amber-400">当前轮思考</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{currentReasoning}</div>
                      </div>
                    ) : null}
                    {currentTrace.length > 0 ? (
                      <div className="rounded-xl border border-theme-border p-3">
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">当前轮 Trace</div>
                        <div className="mt-2 max-h-[240px] space-y-2 overflow-auto pr-1">
                          {currentTrace.map((item, index) => (
                            <div key={item.id ||`${item.category}-${index}`} className="rounded-lg border border-theme-border bg-theme-bg-app p-2 text-xs text-theme-text-secondary">
                              <div className="font-semibold text-theme-text-primary">{item.category}</div>
                              {item.message ? <div className="mt-1 whitespace-pre-wrap">{item.message}</div> : null}
                              {item.payload !== undefined ? (
                                <pre className="mt-2 overflow-auto rounded border border-theme-border bg-theme-bg-app p-2 text-[11px] text-theme-text-primary">{JSON.stringify(item.payload, null, 2)}</pre>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : <EmptyState text="还没有选中的会话消息。" />}
              </div>
            )}
          </section>
        </div>
      </div>

      {errorDialog ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/45 p-4">
 <div className="w-full max-w-3xl rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-5 py-3">
              <div className="text-sm font-semibold text-theme-text-primary">{errorDialog.title}</div>
              <button
                onClick={() => setErrorDialog(null)}
                className="rounded-lg border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text-secondary"
              >
                关闭
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-5">
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-rose-500/20 bg-rose-500/15 p-3 text-xs text-rose-400">
                {errorDialog.content || '-'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};