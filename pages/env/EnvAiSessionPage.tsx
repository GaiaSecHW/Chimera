import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send } from 'lucide-react';

import { api } from '../../clients/api';
import { AiAgentSession, AiHelperService, AiSessionStreamEvent } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { EmptyState, JsonBlock, buildHelperKey, parseHelperKey, useAiHelpers } from './ai-agent/shared';

export const EnvAiSessionPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const { loading, helpers, reload } = useAiHelpers(projectId, notify);
  const [selectedHelperKey, setSelectedHelperKey] = useState('');
  const [selectedHelper, setSelectedHelper] = useState<AiHelperService | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AiAgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [currentSession, setCurrentSession] = useState<AiAgentSession | null>(null);
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [transportMode, setTransportMode] = useState<'stream' | 'non_stream'>('stream');

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
      void loadHelperData(agentKey, serviceName);
    }
  }, [selectedHelperKey]);

  const loadHelperData = async (agentKey: string, serviceName: string) => {
    try {
      const [detail, sessionList] = await Promise.all([
        api.environment.getAiHelperDetail(projectId, agentKey, serviceName),
        api.environment.listAiHelperSessions(projectId, agentKey, serviceName),
      ]);
      setSelectedHelper(detail);
      setSessions(sessionList.items || []);
      if (currentSessionId) {
        try {
          const session = await api.environment.getAiHelperSession(projectId, agentKey, serviceName, currentSessionId);
          setCurrentSession(session);
        } catch {
          setCurrentSession(null);
        }
      }
    } catch (error: any) {
      notify(`加载会话页数据失败: ${error?.message || error}`, 'error');
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
        agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
        metadata: { source: 'env-ai-session-page' },
      });
      setCurrentSessionId(session.session_id);
      setCurrentSession(session);
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name);
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
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name);
    } catch (error: any) {
      notify(`刷新会话失败: ${error?.message || error}`, 'error');
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
      await loadHelperData(selectedHelper.agent_key, selectedHelper.service_name);
      notify('消息已发送', 'success');
    } catch (error: any) {
      notify(`发送消息失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const helperAgentOptions = selectedHelper?.agents || [];

  return (
    <div className="px-8 pt-8 pb-10">
      <div className="space-y-6">
        {feedbackNodes}
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">单会话</h1>
              <p className="mt-2 text-sm text-slate-500">针对单个 helper 服务创建会话，可指定单个或多个 agent_ids 参与同一轮对话。</p>
            </div>
            <button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} />刷新 helper 列表</button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载中...</div> : null}
          <div className="space-y-3">
            <select value={selectedHelperKey} onChange={(e) => setSelectedHelperKey(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {helpers.map((helper) => (
                <option key={`${helper.agent_key}::${helper.service_name}`} value={`${helper.agent_key}::${helper.service_name}`}>{helper.agent_hostname || helper.agent_key} · {helper.service_name}</option>
              ))}
            </select>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">参与 Agent</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {helperAgentOptions.length === 0 ? <div className="text-sm text-slate-500">当前 helper 没有可选 agent。</div> : helperAgentOptions.map((agent) => {
                  const checked = selectedAgentIds.includes(agent.agent_id);
                  return (
                    <label key={agent.agent_id} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => setSelectedAgentIds((prev) => prev.includes(agent.agent_id) ? prev.filter((item) => item !== agent.agent_id) : [...prev, agent.agent_id])}
                      />
                      {agent.agent_id}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void createSession()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{busyAction === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}创建会话</button>
              <button onClick={() => void refreshCurrentSession()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">刷新会话</button>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-900">会话列表</div>
              <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
                {sessions.length === 0 ? <div className="text-sm text-slate-500">暂无会话。</div> : sessions.map((session) => (
                  <button key={session.session_id} onClick={async () => {
                    if (!selectedHelper) return;
                    setCurrentSessionId(session.session_id);
                    const detail = await api.environment.getAiHelperSession(projectId, selectedHelper.agent_key, selectedHelper.service_name, session.session_id);
                    setCurrentSession(detail);
                  }} className={`w-full rounded-xl border px-3 py-2 text-left ${currentSessionId === session.session_id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <div className="break-all text-xs font-semibold text-slate-900">{session.session_id}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{(session.agent_ids || []).join(', ') || session.backend || '-'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedHelper ? (
            <EmptyState text="请先选择一个 helper 服务。" />
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">当前 helper</div>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{selectedHelper.service_name}</h2>
                <div className="mt-2 text-sm text-slate-600">{selectedHelper.agent_hostname} · {selectedHelper.agent_key}</div>
                {currentSessionId ? <div className="mt-2 break-all text-xs text-slate-500">Session: {currentSessionId}</div> : null}
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="输入要发送给当前会话的消息" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">传输模式</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="session-transport-mode" checked={transportMode === 'stream'} onChange={() => setTransportMode('stream')} />
                    流式（默认）
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="session-transport-mode" checked={transportMode === 'non_stream'} onChange={() => setTransportMode('non_stream')} />
                    非流式
                  </label>
                </div>
              </div>
              <button onClick={() => void sendMessage()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{busyAction === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}发送消息</button>
              {currentSession ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-bold text-slate-900">当前会话消息</div>
                  <div className="mt-3 space-y-3 max-h-[520px] overflow-auto pr-1">
                    {(currentSession.messages || []).map((item, index) => (
                      <div key={`${item.role}-${index}`} className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${item.role === 'assistant' ? 'bg-slate-100' : 'bg-blue-50'}`}>
                        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.role}</div>
                        {item.content}
                      </div>
                    ))}
                  </div>
                </div>
              ) : <EmptyState text="还没有选中的会话消息。" />}
              <JsonBlock title="当前 helper 健康信息" value={selectedHelper.health || {}} />
            </div>
          )}
        </section>
        </div>
      </div>
    </div>
  );
};
