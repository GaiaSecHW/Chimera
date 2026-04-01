import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { AiBatchRound, AiBatchSession, AiBatchStreamEvent, AiHelperService } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { EmptyState, JsonBlock, buildHelperKey, prettyJson, useAiHelpers } from './ai-agent/shared';

const BATCH_SESSION_MODE_KEY = 'secflow_ai_batch_session_mode';

export const EnvAiBatchSessionPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const { loading, helpers, reload } = useAiHelpers(projectId, notify);
  const [helperDetails, setHelperDetails] = useState<Record<string, AiHelperService>>({});
  const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Record<string, string[]>>({});
  const [batchId, setBatchId] = useState('');
  const [batchDetail, setBatchDetail] = useState<AiBatchSession | null>(null);
  const [batchRounds, setBatchRounds] = useState<AiBatchRound[]>([]);
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [transportMode, setTransportMode] = useState<'stream' | 'non_stream'>('stream');
  const [batchSessionMode, setBatchSessionMode] = useState<'pipe' | 'pty' | 'invoke'>(() => {
    const raw = String(localStorage.getItem(BATCH_SESSION_MODE_KEY) || '').toLowerCase();
    if (raw === 'pty') return 'pty';
    if (raw === 'invoke') return 'invoke';
    return 'pipe';
  });
  const [streamEvents, setStreamEvents] = useState<AiBatchStreamEvent[]>([]);

  useEffect(() => {
    localStorage.setItem(BATCH_SESSION_MODE_KEY, batchSessionMode);
  }, [batchSessionMode]);

  useEffect(() => {
    if (!selectedHelpers.length && helpers.length > 0) {
      setSelectedHelpers([buildHelperKey(helpers[0].agent_key, helpers[0].service_name)]);
    }
  }, [helpers, selectedHelpers.length]);

  const ensureHelperDetail = async (helper: AiHelperService) => {
    const key = buildHelperKey(helper.agent_key, helper.service_name);
    if (helperDetails[key]) return;
    const detail = await api.environment.getAiHelperDetail(projectId, helper.agent_key, helper.service_name);
    setHelperDetails((prev) => ({ ...prev, [key]: detail }));
  };

  const toggleHelper = async (helper: AiHelperService) => {
    const key = buildHelperKey(helper.agent_key, helper.service_name);
    if (selectedHelpers.includes(key)) {
      setSelectedHelpers((prev) => prev.filter((item) => item !== key));
      return;
    }
    try {
      await ensureHelperDetail(helper);
      setSelectedHelpers((prev) => [...prev, key]);
    } catch (error: any) {
      notify(`加载 helper 详情失败: ${error?.message || error}`, 'error');
    }
  };

  const createBatch = async () => {
    if (selectedHelpers.length === 0) {
      notify('请至少选择一个 helper 服务', 'error');
      return;
    }
    setBusyAction('create');
    try {
      const payload = {
        session_mode: batchSessionMode,
        helpers: selectedHelpers.map((key) => {
          const [agentKey = '', serviceName = ''] = key.split('::');
          const agentIds = selectedAgentIds[key] || [];
          return {
            agent_key: agentKey,
            service_name: serviceName,
            agent_ids: agentIds.length > 0 ? agentIds : undefined,
            session_mode: batchSessionMode,
          };
        }),
        metadata: { source: 'env-ai-batch-session-page' },
      };
      const result = await api.environment.createAiBatchSession(projectId, payload);
      setBatchId(result.batch_id);
      notify('批量会话已创建', 'success');
      await refreshBatch(result.batch_id);
    } catch (error: any) {
      notify(`创建批量会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const refreshBatch = async (id = batchId) => {
    if (!id) return;
    setBusyAction('refresh');
    try {
      const [detail, rounds] = await Promise.all([
        api.environment.getAiBatchSession(id),
        api.environment.getAiBatchMessages(id),
      ]);
      setBatchDetail(detail);
      setBatchRounds(rounds.items || []);
    } catch (error: any) {
      notify(`刷新批量会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const sendBatchMessage = async () => {
    if (!batchId || !message.trim()) {
      notify('请先创建批量会话并输入消息', 'error');
      return;
    }
    setBusyAction('send');
    const messageText = message.trim();
    try {
      if (transportMode === 'stream') {
        setStreamEvents([]);
        await api.environment.sendAiBatchMessageStream(batchId, messageText, {
          onEvent: (event: AiBatchStreamEvent) => {
            if (event.type === 'item' || event.type === 'error' || event.type === 'start' || event.type === 'done') {
              setStreamEvents((prev) => [...prev, event]);
            }
          },
        });
      } else {
        await api.environment.sendAiBatchMessage(batchId, messageText);
      }
      setMessage('');
      await refreshBatch(batchId);
      notify('批量消息已发送', 'success');
    } catch (error: any) {
      notify(`发送批量消息失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteBatch = async () => {
    if (!batchId) {
      notify('当前没有可删除的批量会话', 'error');
      return;
    }
    if (!window.confirm('确认删除当前批量会话吗？会同时清理该 batch 的会话记录。')) return;
    setBusyAction('delete_batch');
    try {
      await api.environment.deleteAiBatchSession(batchId);
      setBatchId('');
      setBatchDetail(null);
      setBatchRounds([]);
      setMessage('');
      setStreamEvents([]);
      notify('批量会话已删除', 'success');
    } catch (error: any) {
      notify(`删除批量会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const helperCards = useMemo(() => helpers.map((helper) => {
    const key = buildHelperKey(helper.agent_key, helper.service_name);
    return { helper, key, detail: helperDetails[key] };
  }), [helpers, helperDetails]);

  return (
    <div className="px-8 pt-8 pb-10">
      <div className="space-y-6">
        {feedbackNodes}
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">批量会话</h1>
              <p className="mt-2 text-sm text-slate-500">选择多个 helper 和各自的 agent_ids，统一创建 batch 会话并按轮次 fanout 消息。</p>
            </div>
            <button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} />刷新 helper 列表</button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载中...</div> : null}
          <div className="space-y-3 max-h-[980px] overflow-auto pr-1">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">会话模式</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="batch-session-mode" checked={batchSessionMode === 'pipe'} onChange={() => setBatchSessionMode('pipe')} />
                  非VTY（默认）
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="batch-session-mode" checked={batchSessionMode === 'pty'} onChange={() => setBatchSessionMode('pty')} />
                  VTY
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="batch-session-mode" checked={batchSessionMode === 'invoke'} onChange={() => setBatchSessionMode('invoke')} />
                  经典（单轮）
                </label>
              </div>
            </div>
            {helperCards.length === 0 ? <EmptyState text="当前项目下没有识别到 AI helper 服务。" /> : helperCards.map(({ helper, key, detail }) => {
              const checked = selectedHelpers.includes(key);
              const selectedIds = selectedAgentIds[key] || [];
              return (
                <div key={key} className={`rounded-2xl border p-4 ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => void toggleHelper(helper)} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">{helper.service_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{helper.agent_hostname} · {helper.agent_key}</div>
                      <div className="mt-1 text-xs text-slate-500">健康：{helper.health_status || 'unknown'} · AI Agent：{helper.ai_agent_count}</div>
                    </div>
                  </label>
                  {checked ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">指定 agent_ids</div>
                      {!detail ? (
                        <button onClick={() => void ensureHelperDetail(helper)} className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">加载此 helper 的 AI Agent</button>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(detail.agents || []).map((agent) => {
                            const active = selectedIds.includes(agent.agent_id);
                            return (
                              <label key={agent.agent_id} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={active}
                                  onChange={() => setSelectedAgentIds((prev) => {
                                    const current = prev[key] || [];
                                    const next = current.includes(agent.agent_id) ? current.filter((item) => item !== agent.agent_id) : [...current, agent.agent_id];
                                    return { ...prev, [key]: next };
                                  })}
                                />
                                {agent.agent_id}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <button onClick={() => void createBatch()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{busyAction === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}创建批量会话</button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!batchDetail ? (
            <EmptyState text="请先在左侧选择 helper 并创建批量会话。" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Batch</div>
                  <h2 className="mt-2 break-all text-2xl font-black text-slate-900">{batchDetail.batch_id}</h2>
                  <div className="mt-2 text-sm text-slate-600">状态：{batchDetail.status} · 目标 helper：{batchDetail.items.length}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void refreshBatch()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">刷新批量状态</button>
                  <button onClick={() => void deleteBatch()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600" disabled={busyAction === 'delete_batch'}><Trash2 size={14} />删除批量会话</button>
                </div>
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="输入要 fanout 给当前 batch 的用户消息" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">传输模式</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="batch-transport-mode" checked={transportMode === 'stream'} onChange={() => setTransportMode('stream')} />
                    流式（默认）
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="batch-transport-mode" checked={transportMode === 'non_stream'} onChange={() => setTransportMode('non_stream')} />
                    非流式
                  </label>
                </div>
              </div>
              <button onClick={() => void sendBatchMessage()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{busyAction === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}发送批量消息</button>
              {streamEvents.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-bold text-slate-900">流式进度</div>
                  <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
                    {streamEvents.map((event, index) => (
                      <div key={`${event.type}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {event.type === 'item'
                          ? `${event.agent_key || '-'} / ${event.service_name || '-'} · ${event.success ? '成功' : '失败'}`
                          : event.type === 'start'
                          ? `开始执行本轮（目标 ${event.total_items || 0} 个 helper）`
                          : event.type === 'done'
                          ? `本轮完成（success=${event.success ? 'true' : 'false'}）`
                          : `错误：${event.error_message || event.error || 'unknown'}`}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {batchDetail.items.map((item) => (
                  <div key={`${item.agent_key}::${item.service_name}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">{item.service_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.agent_key}</div>
                    <div className="mt-2 text-xs text-slate-700">状态：{item.status}</div>
                    <div className="mt-1 break-all text-xs text-slate-700">Session：{item.helper_session_id || '-'}</div>
                    {item.last_error ? <div className="mt-2 whitespace-pre-wrap text-xs text-red-600">{item.last_error}</div> : null}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">多轮记录</div>
                <div className="mt-3 space-y-3 max-h-[520px] overflow-auto pr-1">
                  {batchRounds.length === 0 ? <div className="text-sm text-slate-500">暂无多轮记录。</div> : batchRounds.map((round) => (
                    <div key={round.round_no} className="rounded-xl border border-slate-200 p-3">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Round {round.round_no}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{round.content}</div>
                      <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{prettyJson(round.response)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
        </div>
      </div>
    </div>
  );
};
