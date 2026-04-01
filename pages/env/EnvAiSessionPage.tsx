import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send, SquareTerminal, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import { AiAgentSession, AiHelperService, AiSessionStreamEvent } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { EmptyState, buildHelperKey, navigateToAppView, parseHelperKey, useAiHelpers } from './ai-agent/shared';

const SESSION_AUTO_SYNC_ENABLED_KEY = 'secflow_ai_session_auto_sync_enabled';
const SESSION_AUTO_SYNC_INTERVAL_KEY = 'secflow_ai_session_auto_sync_interval_ms';
const SESSION_MODE_KEY = 'secflow_ai_session_mode';

const compactTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const shortSessionId = (sessionId?: string) => {
  const text = String(sessionId || '');
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
};

const resolveBackendPid = (session?: AiAgentSession | null) => {
  if (!session) return null;
  return session.backend_pid ?? session.pty_pid ?? null;
};

const statusTone = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text === 'ready') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (text === 'broken') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (text === 'closed') return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const sessionModeLabel = (mode?: string) => {
  const text = String(mode || '').toLowerCase();
  if (text === 'pty') return 'VTY';
  if (text === 'pipe') return 'PIPE(已停用)';
  if (text === 'invoke') return '经典';
  return '经典';
};
const sessionModeTone = (mode?: string) =>
  String(mode || '').toLowerCase() === 'pty'
    ? 'bg-violet-100 text-violet-700 border-violet-200'
    : String(mode || '').toLowerCase() === 'invoke'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-zinc-100 text-zinc-700 border-zinc-200';

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline underline-offset-2">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        blockquote: ({ children }) => <blockquote className="mb-2 border-l-4 border-slate-300 bg-slate-100 px-3 py-1.5 italic last:mb-0">{children}</blockquote>,
        code: ({ children, className }) => (className
          ? <code className="block overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">{children}</code>
          : <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>),
        pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export const EnvAiSessionPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
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
  const [sessionMode, setSessionMode] = useState<'pty' | 'invoke'>(() => {
    const raw = String(localStorage.getItem(SESSION_MODE_KEY) || '').toLowerCase();
    if (raw === 'pty') return 'pty';
    return 'invoke';
  });
  const [helperSearch, setHelperSearch] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(SESSION_AUTO_SYNC_ENABLED_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  });
  const [autoSyncIntervalMs, setAutoSyncIntervalMs] = useState<number>(() => {
    const raw = Number(localStorage.getItem(SESSION_AUTO_SYNC_INTERVAL_KEY) || '12000');
    return raw === 5000 || raw === 10000 || raw === 15000 ? raw : 12000;
  });

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
    options: { silent?: boolean } = {},
  ) => {
    try {
      const [detail, sessionList] = await Promise.all([
        api.environment.getAiHelperDetail(projectId, agentKey, serviceName),
        api.environment.listAiHelperSessions(projectId, agentKey, serviceName),
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
      if (currentSessionId) {
        try {
          const session = await api.environment.getAiHelperSession(projectId, agentKey, serviceName, currentSessionId);
          setCurrentSession(session);
        } catch {
          setCurrentSession(null);
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
    setBusyAction('create');
    try {
      const session = await api.environment.createAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, {
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
      const session = await api.environment.getAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, currentSessionId);
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
    if (!window.confirm('确认删除该会话吗？删除后无法恢复。')) return;
    setBusyAction('delete_session');
    try {
      await api.environment.deleteAiHelperSession(
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
    if (!selectedHelper || !currentSessionId || !message.trim()) {
      notify('请先创建会话并输入消息', 'error');
      return;
    }
    setBusyAction('send');
    const messageText = message.trim();
    try {
      if (transportMode === 'stream') {
        let latestSession: AiAgentSession | null = null;
        setCurrentSession((prev) => {
          const base = prev ? { ...prev, messages: [...(prev.messages || [])] } : { session_id: currentSessionId, messages: [] as Array<{ role: string; content: string }> };
          base.messages = [...(base.messages || []), { role: 'user', content: messageText }, { role: 'assistant', content: '' }];
          return base as AiAgentSession;
        });
        await api.environment.sendAiHelperSessionMessageStream(
          projectId,
          selectedHelper.agent_key,
          selectedHelper.service_name,
          currentSessionId,
          messageText,
          {
            onEvent: (event: AiSessionStreamEvent) => {
              if (event.type === 'delta') {
                setCurrentSession((prev) => {
                  if (!prev) return prev;
                  const messages = [...(prev.messages || [])];
                  if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
                    messages.push({ role: 'assistant', content: String(event.delta || '') });
                  } else {
                    messages[messages.length - 1] = {
                      ...messages[messages.length - 1],
                      content: `${messages[messages.length - 1].content}${event.delta || ''}`,
                    };
                  }
                  return { ...prev, messages };
                });
              }
              if (event.type === 'done' && event.session) {
                latestSession = event.session;
                setCurrentSession(event.session);
              }
            },
          }
        );
        if (latestSession) setCurrentSession(latestSession);
      } else {
        const result = await api.environment.sendAiHelperSessionMessage(projectId, selectedHelper.agent_key, selectedHelper.service_name, currentSessionId, messageText);
        setCurrentSession(result.session);
      }
      setMessage('');
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name, { silent: false });
      notify('消息已发送', 'success');
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
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">单会话</h1>
              <p className="mt-1 text-sm text-slate-500">更紧凑的单会话视图：左侧管理会话，右侧专注对话。</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateToAppView('env-ai-agent-session-manage')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700"
              >
                <SquareTerminal size={15} />
                会话管理
              </button>
              <span className="text-[11px] text-slate-500">最后同步: {compactTime(lastSyncedAt)}</span>
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600">
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
                className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700"
                disabled={!autoSyncEnabled}
              >
                <option value="5000">5s</option>
                <option value="10000">10s</option>
                <option value="15000">15s</option>
              </select>
              <button
                onClick={() => void syncHelperSessions()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white"
              >
                {busyAction === 'sync' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                手动同步状态
              </button>
              <button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={15} />刷新 helper</button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? <div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />加载中...</div> : null}
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">节点 Helper 服务</div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{filteredHelpers.length}/{helpers.length}</span>
                </div>
                <input
                  value={helperSearch}
                  onChange={(e) => setHelperSearch(e.target.value)}
                  placeholder="筛选 hostname / agent_key / service_name"
                  className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <select value={selectedHelperKey} onChange={(e) => setSelectedHelperKey(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  {helperSelectOptions.map((helper) => (
                    <option key={`${helper.agent_key}::${helper.service_name}`} value={`${helper.agent_key}::${helper.service_name}`}>{helper.agent_hostname || helper.agent_key} · {helper.service_name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-blue-200 bg-[linear-gradient(165deg,#eff6ff_0%,#ffffff_70%)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">创建新会话</div>
                  <button onClick={() => void refreshCurrentSession()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    <RefreshCw size={13} />
                    刷新当前
                  </button>
                </div>
                <div className="text-xs text-slate-500">先选择参与 Agent，再创建会话。</div>
                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">会话模式</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
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
                  {helperAgentOptions.length === 0 ? <div className="text-xs text-slate-500">当前 helper 没有可选 agent。</div> : helperAgentOptions.map((agent) => {
                    const checked = selectedAgentId === agent.agent_id;
                    return (
                      <label key={agent.agent_id} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${checked ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 text-slate-700 bg-white'}`}>
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
                <button onClick={() => void createSession()} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                  {busyAction === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  创建会话
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-black text-slate-900">会话列表</div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{sessions.length}</span>
                </div>
                <div className="space-y-2 max-h-[540px] overflow-auto pr-1">
                  {sessions.length === 0 ? <div className="text-sm text-slate-500">暂无会话。</div> : sessions.map((session) => (
                    <div key={session.session_id} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${currentSessionId === session.session_id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                      <button
                        onClick={async () => {
                          if (!selectedHelper) return;
                          setCurrentSessionId(session.session_id);
                          const detail = await api.environment.getAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, session.session_id);
                          setCurrentSession(detail);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-black text-slate-900">{shortSessionId(session.session_id)}</span>
                          <span className="inline-flex max-w-[210px] items-center gap-1 truncate rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-800">
                            <Bot size={11} />
                            {(session.agent_ids || []).join(', ') || session.backend || '-'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${sessionModeTone(session.session_mode)}`}>{sessionModeLabel(session.session_mode)}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(session.status)}`}>{session.status || 'unknown'}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            PID {resolveBackendPid(session) ?? '-'}
                          </span>
                        </div>
                        {session.last_error ? <div className="mt-1 truncate text-[11px] text-rose-600">{session.last_error}</div> : null}
                      </button>
                      <button
                        onClick={() => void deleteSession(session.session_id)}
                        className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {!selectedHelper ? (
              <EmptyState text="请先选择一个 helper 服务。" />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_100%)] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-black text-slate-900">{selectedHelper.service_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{selectedHelper.agent_hostname} / {selectedHelper.agent_key}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">Session: {currentSessionId ? shortSessionId(currentSessionId) : '-'}</span>
                    {currentSession ? (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(currentSession.status)}`}>
                          {currentSession.status || 'unknown'}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${sessionModeTone(currentSession.session_mode)}`}>
                          {sessionModeLabel(currentSession.session_mode)}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">Backend PID: {resolveBackendPid(currentSession) ?? '-'}</span>
                      </>
                    ) : null}
                    <span className="ml-auto inline-flex rounded-full border border-slate-200 bg-white p-0.5">
                      <button
                        onClick={() => setTransportMode('stream')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${transportMode === 'stream' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        流式
                      </button>
                      <button
                        onClick={() => setTransportMode('non_stream')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${transportMode === 'non_stream' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        非流式
                      </button>
                    </span>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="min-h-[76px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="输入要发送给当前会话的消息" />
                  <button onClick={() => void sendMessage()} className="inline-flex h-[76px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
                    {busyAction === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    发送
                  </button>
                </div>

                {currentSession ? (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-black text-slate-900">当前会话消息</div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{(currentSession.messages || []).length}</span>
                    </div>
                    <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                      {(currentSession.messages || []).map((item, index) => (
                        <div key={`${item.role}-${index}`} className={`rounded-lg border px-3 py-2 text-sm ${item.role === 'assistant' ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50'}`}>
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${item.role === 'assistant' ? 'bg-slate-200 text-slate-700' : 'bg-blue-200 text-blue-700'}`}>
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
                ) : <EmptyState text="还没有选中的会话消息。" />}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
