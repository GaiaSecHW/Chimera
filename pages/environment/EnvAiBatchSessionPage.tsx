import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CheckSquare, CircleDotDashed, Loader2, Plus, RefreshCw, Send, Square, Trash2, X, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import { AgentResponse, AgentTraceEvent, AiAgentItem, AiBatchRound, AiBatchSession, AiBatchSessionSummary, AiBatchStreamEvent, AiHelperService } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { EmptyState, buildHelperKey, prettyJson, useAiHelpers } from './ai-agent/shared';
import { PageHeader } from '../../design-system';

const BATCH_SESSION_MODE_KEY = 'chimera_ai_batch_session_mode';

const compactTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const shortId = (text?: string, start = 10, end = 8) => {
  const value = String(text || '');
  if (value.length <= start + end + 3) return value;
  return`${value.slice(0, start)}...${value.slice(-end)}`;
};

const statusTone = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text === 'success') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (text === 'partial_success') return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  if (text === 'failed') return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
  if (text === 'running') return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20';
  return 'bg-theme-elevated text-theme-text-secondary border-theme-border';
};

const statusIcon = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text === 'success') return <CheckCircle2 size={13} />;
  if (text === 'partial_success') return <AlertTriangle size={13} />;
  if (text === 'failed') return <XCircle size={13} />;
  if (text === 'running') return <CircleDotDashed size={13} className="animate-spin" />;
  return <CircleDotDashed size={13} />;
};

const modeLabel = (mode?: string) => {
  const text = String(mode || '').toLowerCase();
  if (text === 'pty') return 'VTY';
  if (text === 'pipe') return 'PIPE';
  return '经典';
};

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

const readText = (value: any): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const getAgentResponse = (value: any): AgentResponse | null => {
  if (value && typeof value === 'object' && value.object === 'agent.response') return value as AgentResponse;
  if (value?.response && typeof value.response === 'object' && value.response.object === 'agent.response') return value.response as AgentResponse;
  return null;
};

const collectBatchItemOutputs = (item: any): string[] => {
  const outputs: string[] = [];
  const directError = readText(item?.error);
  if (directError) outputs.push(`错误：${directError}`);
  const response = getAgentResponse(item?.response);
  if (response) {
    const outputText = readText(response.output_text);
    const errorText = readText(response.error);
    if (outputText) outputs.push(outputText);
    if (!outputText && errorText) outputs.push(`错误：${errorText}`);
    if (outputs.length > 0) return outputs;
  }
  const rawResponse = item?.response || {};
  const result = rawResponse?.result || {};
  const resultItems = Array.isArray(rawResponse?.results)
    ? rawResponse.results
    : (Array.isArray(result?.results) ? result.results : []);
  resultItems.forEach((resultItem: any) => {
    const output = readText(resultItem?.output);
    const error = readText(resultItem?.error);
    const rawObject = resultItem?.raw || {};
    const fallback = readText(resultItem?.raw?.error) || readText(resultItem?.raw?.stderr) || readText(resultItem?.raw?.stdout);
    if (output) outputs.push(output);
    if (error) outputs.push(`错误：${error}`);
    if (!output && !error && fallback) outputs.push(fallback);
    if (!output && !error && !fallback && Object.keys(rawObject).length > 0) outputs.push(prettyJson(rawObject));
  });
  if (outputs.length > 0) return outputs;
  const fallbackOutput = readText(rawResponse?.output)
    || readText(result?.output)
    || readText(rawResponse?.raw?.stdout)
    || readText(rawResponse?.raw?.stderr)
    || readText(rawResponse?.error_message)
    || readText(rawResponse?.error);
  if (fallbackOutput) outputs.push(fallbackOutput);
  return outputs;
};

const collectBatchItemReasoning = (item: any): string => {
  const response = getAgentResponse(item?.response);
  if (!Array.isArray(response?.output)) return '';
  return response!.output
    .filter((part) => String(part?.type || '').toLowerCase() === 'reasoning')
    .map((part) => readText(part?.text))
    .join('')
    .trim();
};

const collectBatchItemTrace = (item: any): AgentTraceEvent[] => {
  const response = getAgentResponse(item?.response);
  return Array.isArray(response?.trace) ? response!.trace.filter(Boolean) : [];
};

const agentLabel = (agent: AiAgentItem) =>`${agent.agent_id}${agent.backend_type ?` · ${agent.backend_type}` : ''}`;

const helperItemKey = (item?: { agent_key?: string; service_name?: string }) =>`${item?.agent_key || ''}::${item?.service_name || ''}`;

const resolveRoundResultForHelper = (round: AiBatchRound, helper?: { agent_key?: string; service_name?: string; helper_session_id?: string }) => {
  const resultItems = Array.isArray(round?.response?.results) ? round.response.results : [];
  if (!helper || resultItems.length === 0) return null;
  const byIdentity = resultItems.find((item: any) => (
    readText(item?.agent_key) === readText(helper.agent_key)
    && readText(item?.service_name) === readText(helper.service_name)
  ));
  if (byIdentity) return byIdentity;
  const sessionId = readText(helper.helper_session_id);
  if (!sessionId) return null;
  return resultItems.find((item: any) => readText(item?.helper_session_id) === sessionId) || null;
};

export const EnvAiBatchSessionPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const { loading: helperLoading, helpers, reload: reloadHelpers } = useAiHelpers(projectId, notify);

  const [batches, setBatches] = useState<AiBatchSessionSummary[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  const [activeBatchId, setActiveBatchId] = useState('');
  const [batchDetail, setBatchDetail] = useState<AiBatchSession | null>(null);
  const [batchRounds, setBatchRounds] = useState<AiBatchRound[]>([]);
  const [activeHelperKey, setActiveHelperKey] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);

  const [message, setMessage] = useState('');
  const [transportMode, setTransportMode] = useState<'stream' | 'non_stream'>('stream');
  const [streamEvents, setStreamEvents] = useState<AiBatchStreamEvent[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKeyword, setCreateKeyword] = useState('');
  const [helperDetails, setHelperDetails] = useState<Record<string, AiHelperService>>({});
  const [createSelectedHelpers, setCreateSelectedHelpers] = useState<string[]>([]);
  const [createSelectedAgentId, setCreateSelectedAgentId] = useState('');
  const [batchSessionMode, setBatchSessionMode] = useState<'pipe' | 'pty' | 'invoke'>(() => {
    const raw = String(localStorage.getItem(BATCH_SESSION_MODE_KEY) || '').toLowerCase();
    if (raw === 'pipe') return 'pipe';
    if (raw === 'pty') return 'pty';
    return 'invoke';
  });

  useEffect(() => {
    localStorage.setItem(BATCH_SESSION_MODE_KEY, batchSessionMode);
  }, [batchSessionMode]);

  const loadBatches = async (silent = false) => {
    if (!silent) setBatchLoading(true);
    try {
      const result = await environmentApi.environment.listAiBatchSessions(projectId);
      setBatches(result.items || []);
      setSelectedBatchIds((prev) => prev.filter((id) => (result.items || []).some((item) => item.batch_id === id)));
      if (activeBatchId && !(result.items || []).some((item) => item.batch_id === activeBatchId)) {
        setActiveBatchId('');
        setBatchDetail(null);
        setBatchRounds([]);
        setDetailOpen(false);
      }
    } catch (error: any) {
      notify(`加载批量会话列表失败: ${error?.message || error}`, 'error');
    } finally {
      if (!silent) setBatchLoading(false);
    }
  };

  useEffect(() => {
    void loadBatches(false);
  }, [projectId]);

  const refreshDetail = async (batchId: string, silent = false) => {
    if (!batchId) return;
    if (!silent) setBusyAction('refresh_detail');
    try {
      const [detail, rounds] = await Promise.all([
        environmentApi.environment.getAiBatchSession(batchId),
        environmentApi.environment.getAiBatchMessages(batchId),
      ]);
      setBatchDetail(detail);
      setBatchRounds(rounds.items || []);
      setActiveBatchId(batchId);
      setDetailOpen(true);
    } catch (error: any) {
      notify(`加载批量会话详情失败: ${error?.message || error}`, 'error');
    } finally {
      if (!silent) setBusyAction('');
    }
  };

  const ensureHelperDetail = async (helper: AiHelperService) => {
    const key = buildHelperKey(helper.agent_key, helper.service_name);
    if (helperDetails[key]) return helperDetails[key];
    const detail = await environmentApi.environment.getAiHelperDetail(projectId, helper.agent_key, helper.service_name);
    setHelperDetails((prev) => ({ ...prev, [key]: detail }));
    return detail;
  };

  const openCreateDialog = () => {
    setCreateSelectedHelpers([]);
    setCreateSelectedAgentId('');
    setCreateKeyword('');
    setCreateOpen(true);
  };

  const toggleCreateHelper = async (helper: AiHelperService) => {
    const key = buildHelperKey(helper.agent_key, helper.service_name);
    const checked = createSelectedHelpers.includes(key);
    if (checked) {
      setCreateSelectedHelpers((prev) => prev.filter((item) => item !== key));
      return;
    }
    try {
      await ensureHelperDetail(helper);
      setCreateSelectedHelpers((prev) => [...prev, key]);
    } catch (error: any) {
      notify(`加载节点 Agent 失败: ${error?.message || error}`, 'error');
    }
  };

  const commonAgentOptions = useMemo(() => {
    if (createSelectedHelpers.length === 0) return [] as AiAgentItem[];
    const selectedAgentLists = createSelectedHelpers
      .map((key) => helperDetails[key]?.agents || [])
      .filter((items) => Array.isArray(items) && items.length > 0);
    if (selectedAgentLists.length !== createSelectedHelpers.length) return [] as AiAgentItem[];
    const firstList = selectedAgentLists[0] || [];
    return firstList.filter((agent) => selectedAgentLists.every((list) => list.some((item) => item.agent_id === agent.agent_id)));
  }, [createSelectedHelpers, helperDetails]);

  useEffect(() => {
    if (!createSelectedAgentId) {
      if (commonAgentOptions.length > 0) setCreateSelectedAgentId(commonAgentOptions[0].agent_id);
      return;
    }
    if (!commonAgentOptions.some((item) => item.agent_id === createSelectedAgentId)) {
      setCreateSelectedAgentId(commonAgentOptions[0]?.agent_id || '');
    }
  }, [commonAgentOptions, createSelectedAgentId]);

  const createBatchSession = async () => {
    if (createSelectedHelpers.length === 0) {
      notify('请先选择至少一个节点', 'error');
      return;
    }
    if (!createSelectedAgentId) {
      notify('请选择统一的 Agent 类型后再创建', 'error');
      return;
    }
    setBusyAction('create_batch');
    try {
      const payload = {
        session_mode: batchSessionMode,
        metadata: { source: 'env-ai-batch-session-page' },
        helpers: createSelectedHelpers.map((key) => {
          const [agentKey = '', serviceName = ''] = key.split('::');
          return {
            agent_key: agentKey,
            service_name: serviceName,
            agent_ids: [createSelectedAgentId],
            session_mode: batchSessionMode,
          };
        }),
      };
      const result = await environmentApi.environment.createAiBatchSession(projectId, payload);
      const newBatchId = String(result.batch_id || '');
      setCreateOpen(false);
      await loadBatches(true);
      if (newBatchId) {
        await refreshDetail(newBatchId, true);
      }
      notify('批量会话创建成功', 'success');
    } catch (error: any) {
      notify(`创建批量会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const sendBatchMessage = async () => {
    if (!activeBatchId || !message.trim()) {
      notify('请选择批量会话并输入消息', 'error');
      return;
    }
    const text = message.trim();
    setBusyAction('send');
    try {
      if (transportMode === 'stream') {
        setStreamEvents([]);
        await environmentApi.environment.sendAiBatchMessageStream(activeBatchId, text, {
          onEvent: (event: AiBatchStreamEvent) => {
            if (event.type === 'item' || event.type === 'error' || event.type === 'start' || event.type === 'done') {
              setStreamEvents((prev) => [...prev, event]);
            }
          },
        });
      } else {
        await environmentApi.environment.sendAiBatchMessage(activeBatchId, text);
      }
      setMessage('');
      await refreshDetail(activeBatchId, true);
      await loadBatches(true);
      notify('批量消息发送成功', 'success');
    } catch (error: any) {
      notify(`发送批量消息失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteOneBatch = async (batchId: string) => {
    if (!batchId) return;
    const ok = await confirm({ message: `确认删除批量会话 ${shortId(batchId)} 吗？`, danger: true });
    if (!ok) return;
    setBusyAction('delete_single');
    try {
      await environmentApi.environment.deleteAiBatchSession(batchId);
      if (batchId === activeBatchId) {
        setActiveBatchId('');
        setBatchDetail(null);
        setBatchRounds([]);
        setDetailOpen(false);
      }
      await loadBatches(true);
      notify('批量会话已删除', 'success');
    } catch (error: any) {
      notify(`删除批量会话失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteSelectedBatches = async () => {
    if (selectedBatchIds.length === 0) {
      notify('请先勾选要删除的批量会话', 'error');
      return;
    }
    const ok = await confirm({ message: `确认批量删除 ${selectedBatchIds.length} 个会话吗？`, danger: true });
    if (!ok) return;
    setBusyAction('delete_batch');
    try {
      let success = 0;
      for (const batchId of selectedBatchIds) {
        try {
          await environmentApi.environment.deleteAiBatchSession(batchId);
          success += 1;
        } catch {
          // continue
        }
      }
      setSelectedBatchIds([]);
      if (activeBatchId && selectedBatchIds.includes(activeBatchId)) {
        setActiveBatchId('');
        setBatchDetail(null);
        setBatchRounds([]);
        setDetailOpen(false);
      }
      await loadBatches(true);
      if (success === selectedBatchIds.length) {
        notify(`批量删除完成，共 ${success} 个`, 'success');
      } else {
        notify(`批量删除完成，成功 ${success} / ${selectedBatchIds.length}`, 'warning');
      }
    } catch (error: any) {
      notify(`批量删除失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const filteredHelpers = useMemo(() => {
    const keywordText = createKeyword.trim().toLowerCase();
    if (!keywordText) return helpers;
    return helpers.filter((item) => {
      const text =`${item.agent_hostname || ''} ${item.agent_key || ''} ${item.service_name || ''}`.toLowerCase();
      return text.includes(keywordText);
    });
  }, [helpers, createKeyword]);

  const filteredBatches = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase();
    if (!keywordText) return batches;
    return batches.filter((item) => {
      const text =`${item.batch_id} ${item.status} ${item.created_by || ''} ${item.session_mode || ''}`.toLowerCase();
      return text.includes(keywordText);
    });
  }, [batches, keyword]);

  const allVisibleSelected = filteredBatches.length > 0 && filteredBatches.every((item) => selectedBatchIds.includes(item.batch_id));

  const activeHelperItem = useMemo(() => {
    if (!batchDetail) return null;
    return batchDetail.items.find((item) => helperItemKey(item) === activeHelperKey) || batchDetail.items[0] || null;
  }, [batchDetail, activeHelperKey]);

  useEffect(() => {
    if (!batchDetail || batchDetail.items.length === 0) {
      setActiveHelperKey('');
      return;
    }
    if (batchDetail.items.some((item) => helperItemKey(item) === activeHelperKey)) return;
    setActiveHelperKey(helperItemKey(batchDetail.items[0]));
  }, [batchDetail, activeHelperKey]);

  const helperRounds = useMemo(() => {
    if (!activeHelperItem) return [] as Array<{ round: AiBatchRound; result: any | null; outputs: string[]; reasoning: string; trace: AgentTraceEvent[] }>;
    return batchRounds.map((round) => {
      const result = resolveRoundResultForHelper(round, activeHelperItem);
      const outputs = result ? collectBatchItemOutputs(result) : [];
      const reasoning = result ? collectBatchItemReasoning(result) : '';
      const trace = result ? collectBatchItemTrace(result) : [];
      return { round, result, outputs, reasoning, trace };
    });
  }, [batchRounds, activeHelperItem]);

  return (
    <div className="px-8 pt-8 pb-10">
      <div className="space-y-6">
        {feedbackNodes}

        <PageHeader
          title="批量会话"
          description="先查看批量会话列表，再点击进入会话详情对话界面；支持创建与批量删除。"
          actions={<div className="flex items-center gap-2">
              <button onClick={() => void loadBatches(false)} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary"><RefreshCw size={16} />刷新会话</button>
              <button onClick={openCreateDialog} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} />创建批量会话</button>
            </div>}
        />

 <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-w-[240px] flex-1 rounded-xl border border-theme-border px-3 py-2 text-sm"
              placeholder="搜索 batch_id / 状态 / 创建人 / 模式"
            />
            <button
              onClick={() => void deleteSelectedBatches()}
              disabled={selectedBatchIds.length === 0 || busyAction === 'delete_batch'}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'delete_batch' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              批量删除（{selectedBatchIds.length}）
            </button>
          </div>

          {batchLoading ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={15} className="animate-spin" />加载批量会话中...</div>
          ) : filteredBatches.length === 0 ? (
            <EmptyState text="当前没有批量会话记录。" />
          ) : (
            <div className="overflow-auto rounded-xl border border-theme-border">
              <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-10" />
                  <col className="w-52" />
                  <col className="w-24" />
                  <col className="w-40" />
                  <col className="w-20" />
                  <col className="w-24" />
                  <col className="w-48" />
                  <col className="w-24" />
                </colgroup>
                <thead className="bg-theme-bg-app text-theme-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <button
                        onClick={() => setSelectedBatchIds(allVisibleSelected ? selectedBatchIds.filter((id) => !filteredBatches.some((item) => item.batch_id === id)) : Array.from(new Set([...selectedBatchIds, ...filteredBatches.map((item) => item.batch_id)])))}
                        className="inline-flex items-center text-theme-text-muted hover:text-theme-text-primary"
                      >
                        {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Batch ID</th>
                    <th className="px-3 py-2 text-left">模式</th>
                    <th className="px-3 py-2 text-left">状态</th>
                    <th className="px-3 py-2 text-left">目标</th>
                    <th className="px-3 py-2 text-left">进度</th>
                    <th className="px-3 py-2 text-left">更新时间</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map((item) => {
                    const checked = selectedBatchIds.includes(item.batch_id);
                    return (
                      <tr
                        key={item.batch_id}
                        className={`border-t border-theme-border hover:bg-theme-elevated ${activeBatchId === item.batch_id ? 'bg-cyan-500/15' : ''}`}
                      >
                        <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedBatchIds((prev) => prev.includes(item.batch_id) ? prev.filter((id) => id !== item.batch_id) : [...prev, item.batch_id])}
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-theme-text-primary">
                          <button
                            onClick={() => void refreshDetail(item.batch_id, false)}
                            className="max-w-[190px] truncate font-semibold text-theme-text-primary hover:text-blue-400"
                            title={item.batch_id}
                          >
                            {shortId(item.batch_id)}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-theme-text-secondary">{modeLabel(item.session_mode)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(item.status)}`}>
                            {statusIcon(item.status)}
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-theme-text-secondary">{item.helper_total}</td>
                        <td className="px-3 py-2 text-theme-text-secondary">{item.success_count}/{item.helper_total}</td>
                        <td className="px-3 py-2 text-theme-text-muted truncate" title={compactTime(item.updated_at || item.created_at)}>{compactTime(item.updated_at || item.created_at)}</td>
                        <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                          <button
                            onClick={() => void deleteOneBatch(item.batch_id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-400"
                            disabled={busyAction === 'delete_single'}
                          >
                            <Trash2 size={12} />删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
 <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-theme-text-primary">创建批量会话</h3>
              </div>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-theme-border p-2 text-theme-text-muted"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
              <section className="rounded-xl border border-theme-border p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-theme-text-muted">1. 选择节点（可多选）</div>
                <input
                  value={createKeyword}
                  onChange={(event) => setCreateKeyword(event.target.value)}
                  placeholder="搜索节点 / helper"
                  className="mt-3 w-full rounded-xl border border-theme-border px-3 py-2 text-sm"
                />
                <div className="mt-3 max-h-[380px] space-y-2 overflow-auto pr-1">
                  {helperLoading ? <div className="text-sm text-theme-text-muted">加载 helper 中...</div> : null}
                  {filteredHelpers.map((helper) => {
                    const key = buildHelperKey(helper.agent_key, helper.service_name);
                    const checked = createSelectedHelpers.includes(key);
                    return (
                      <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${checked ? 'border-blue-500 bg-blue-500/15' : 'border-theme-border bg-theme-bg-app'}`}>
                        <input type="checkbox" checked={checked} onChange={() => void toggleCreateHelper(helper)} className="mt-1" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-theme-text-primary">{helper.agent_hostname || helper.agent_key}</div>
                          <div className="text-xs text-theme-text-muted">{helper.service_name} · {helper.agent_key}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-theme-border p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-theme-text-muted">2. 选择统一 Agent</div>
                <p className="mt-2 text-xs text-theme-text-muted">所有已选节点共享同一个 Agent 类型，不允许节点间选择不同 Agent。</p>
                <select
                  value={createSelectedAgentId}
                  onChange={(event) => setCreateSelectedAgentId(event.target.value)}
                  disabled={commonAgentOptions.length === 0}
                  className="mt-3 w-full rounded-xl border border-theme-border px-3 py-2 text-sm disabled:bg-theme-elevated"
                >
                  {commonAgentOptions.length === 0 ? <option value="">无可用共享 Agent</option> : null}
                  {commonAgentOptions.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>{agentLabel(agent)}</option>
                  ))}
                </select>

                <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">会话模式</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="create-batch-mode" checked={batchSessionMode === 'pipe'} onChange={() => setBatchSessionMode('pipe')} />
                      PIPE
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="create-batch-mode" checked={batchSessionMode === 'invoke'} onChange={() => setBatchSessionMode('invoke')} />
                      经典（默认）
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="create-batch-mode" checked={batchSessionMode === 'pty'} onChange={() => setBatchSessionMode('pty')} />
                      VTY
                    </label>
                  </div>
                </div>

                <div className="mt-4 text-xs text-theme-text-muted">
                  已选节点：{createSelectedHelpers.length} 个
                  {createSelectedAgentId ?` · Agent: ${createSelectedAgentId}` : ''}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button onClick={() => void reloadHelpers(true)} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary">刷新节点</button>
                  <button
                    onClick={() => void createBatchSession()}
                    disabled={busyAction === 'create_batch' || createSelectedHelpers.length === 0 || !createSelectedAgentId}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'create_batch' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    创建
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen && batchDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3">
 <div className="flex h-[92vh] w-full max-w-7xl flex-col rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-5 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-theme-text-primary">{batchDetail.batch_id}</h3>
                <div className="mt-1 text-xs text-theme-text-muted">状态：{batchDetail.status} · 目标：{batchDetail.items.length} · 模式：{modeLabel(batchDetail.session_mode)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void refreshDetail(batchDetail.batch_id)} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  {busyAction === 'refresh_detail' ? <Loader2 size={14} className="animate-spin" /> : '刷新'}
                </button>
                <button onClick={() => setDetailOpen(false)} className="rounded-lg border border-theme-border p-2 text-theme-text-muted"><X size={16} /></button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <section className="min-h-0 overflow-auto rounded-xl border border-theme-border p-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">目标 Agent</div>
                <div className="mt-3 space-y-2">
                  {batchDetail.items.map((item) => (
                    <button
                      key={`${item.agent_key}::${item.service_name}`}
                      onClick={() => setActiveHelperKey(helperItemKey(item))}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        helperItemKey(item) === helperItemKey(activeHelperItem)
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-theme-border bg-theme-bg-app hover:border-theme-border'
                      }`}
                    >
                      <div className="text-sm font-semibold text-theme-text-primary">{item.service_name}</div>
                      <div className="mt-1 text-xs text-theme-text-muted">{item.agent_key}</div>
                      <div className="mt-2 text-xs text-theme-text-secondary">状态：{item.status}</div>
                      <div className="mt-1 break-all text-xs text-theme-text-secondary">Session：{item.helper_session_id || '-'}</div>
                      {item.last_error ? <div className="mt-1 text-xs text-rose-400 whitespace-pre-wrap">{item.last_error}</div> : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="min-h-0 overflow-auto rounded-xl border border-theme-border p-4">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-theme-border px-3 py-2 text-sm"
                  placeholder="输入要发送给当前批量会话（所有目标 Agent）的用户消息"
                />
                <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="batch-transport-mode" checked={transportMode === 'stream'} onChange={() => setTransportMode('stream')} />
                      流式
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="batch-transport-mode" checked={transportMode === 'non_stream'} onChange={() => setTransportMode('non_stream')} />
                      非流式
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void sendBatchMessage()} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2 text-sm font-semibold text-white">
                      {busyAction === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}发送
                    </button>
                    <button onClick={() => void deleteOneBatch(batchDetail.batch_id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-400">
                      <Trash2 size={14} />删除会话
                    </button>
                  </div>
                </div>

                {streamEvents.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface p-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">流式进度</div>
                    <div className="mt-2 max-h-28 space-y-1 overflow-auto pr-1 text-xs text-theme-text-secondary">
                      {streamEvents
                        .filter((event) => (
                          event.type === 'start'
                          || event.type === 'done'
                          || event.type === 'error'
                          || (
                            event.type === 'item'
                            && activeHelperItem
                            && readText(event.agent_key) === readText(activeHelperItem.agent_key)
                            && readText(event.service_name) === readText(activeHelperItem.service_name)
                          )
                        ))
                        .map((event, index) => (
                          <div key={`${event.type}-${index}`}>
                            {event.type === 'item'
                              ?`${event.agent_key || '-'} / ${event.service_name || '-'} · ${event.success ? '成功' : '失败'}`
                              : event.type === 'start'
                              ?`开始执行（目标 ${event.total_items || 0} 个 helper）`
                              : event.type === 'done'
                              ?`本轮完成（success=${event.success ? 'true' : 'false'}）`
                              :`错误：${event.error_message || event.error || 'unknown'}`}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl border border-theme-border p-3">
                  <div className="text-sm font-semibold text-theme-text-primary">
                    会话记录（{activeHelperItem ?`${activeHelperItem.service_name} / ${activeHelperItem.agent_key}` : '未选择 Agent'}）
                  </div>
                  <div className="mt-3 space-y-3 max-h-[50vh] overflow-auto pr-1">
                    {helperRounds.length === 0 ? <div className="text-sm text-theme-text-muted">暂无多轮记录。</div> : helperRounds.map(({ round, result, outputs, reasoning, trace }) => (
                      <div key={round.round_no} className="rounded-xl border border-theme-border p-3">
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-theme-text-muted">Round {round.round_no}</div>
                        <div className="mt-2 rounded-xl border border-theme-border bg-theme-surface p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-text-muted">User</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-theme-text-primary">{round.content}</div>
                        </div>
                        <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Assistant</div>
                          {outputs.length > 0 ? (
                            <div className="mt-2 space-y-3">
                              {outputs.map((part, index) => (
                                <div key={`${round.round_no}-output-${index}`} className="rounded-lg border border-theme-border bg-theme-bg-app p-3 text-sm text-theme-text-primary">
                                  <MarkdownContent content={part} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                              当前 Agent 在该轮未返回可解析输出。
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-theme-text-muted">
                          执行状态：{result ? (result.success === true ? '成功' : result.success === false ? '失败' : '未知') : '未命中结果'}
                        </div>
                        {reasoning ? (
                          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">Reasoning</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{reasoning}</div>
                          </div>
                        ) : null}
                        {trace.length > 0 ? (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-theme-text-secondary hover:text-theme-text-primary">查看 Trace（{trace.length}）</summary>
                            <div className="mt-2 space-y-2">
                              {trace.map((item, index) => (
                                <div key={item.id ||`${item.category}-${index}`} className="rounded-xl border border-theme-border bg-theme-surface p-3 text-xs text-theme-text-secondary">
                                  <div className="font-semibold text-theme-text-primary">{item.category}</div>
                                  {item.message ? <div className="mt-1 whitespace-pre-wrap">{item.message}</div> : null}
                                  {item.payload !== undefined ? (
                                    <pre className="mt-2 overflow-auto rounded-lg border border-theme-border bg-theme-bg-app p-3 text-[11px] text-theme-text-primary">{prettyJson(item.payload)}</pre>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-theme-text-secondary hover:text-theme-text-primary">查看该 Agent 原始结果 JSON</summary>
                          <pre className="mt-2 overflow-auto rounded-xl border border-theme-border bg-theme-surface p-3 text-xs text-theme-text-primary">{prettyJson(result || {})}</pre>
                        </details>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-semibold text-theme-text-secondary hover:text-theme-text-primary">查看整轮原始 JSON</summary>
                          <pre className="mt-2 overflow-auto rounded-xl border border-theme-border bg-theme-surface p-3 text-xs text-theme-text-primary">{prettyJson(round.response)}</pre>
                        </details>
                      </div>
                    ))}
                    {helperRounds.length > 0 && !activeHelperItem ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                        请先在左侧选择一个 Agent 查看会话记录。
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};