import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Server } from 'lucide-react';

import { api } from '../../clients/api';
import { AiAgentSession, AiHelperService } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  EmptyState,
  HealthBadge,
  JsonBlock,
  buildHelperKey,
  parseHelperKey,
  summarizeHelperAgents,
  navigateToAppView,
  uniqueValues,
  useAiHelpers,
  useFilteredHelpers,
} from './ai-agent/shared';

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
  if (text === 'pipe') return '非VTY';
  if (text === 'invoke') return '经典';
  return '非VTY';
};

const sessionModeTone = (mode?: string) =>
  String(mode || '').toLowerCase() === 'pty'
    ? 'bg-violet-100 text-violet-700 border-violet-200'
    : String(mode || '').toLowerCase() === 'invoke'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-cyan-100 text-cyan-700 border-cyan-200';

const resolveBackendPid = (session?: AiAgentSession | null) => {
  if (!session) return null;
  return session.backend_pid ?? session.pty_pid ?? null;
};

export const EnvAiHelperPage: React.FC<{ projectId: string; initialHelperKey?: string }> = ({ projectId, initialHelperKey = '' }) => {
  const environmentApi = api.domains.environment;
  const { notify, feedbackNodes } = useUiFeedback();
  const { loading, helpers, reload } = useAiHelpers(projectId, notify);
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedHelper, setSelectedHelper] = useState<AiHelperService | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<AiAgentSession[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const filteredHelpers = useFilteredHelpers(helpers, search, healthFilter, nodeFilter);
  const nodeOptions = useMemo(() => uniqueValues(helpers.map((item) => item.agent_hostname || '').filter(Boolean)), [helpers]);
  const helperSummary = summarizeHelperAgents(selectedHelper);

  useEffect(() => {
    if (!selectedKey && filteredHelpers.length > 0) {
      setSelectedKey(buildHelperKey(filteredHelpers[0].agent_key, filteredHelpers[0].service_name));
    }
  }, [filteredHelpers, selectedKey]);

  useEffect(() => {
    if (!initialHelperKey) return;
    if (initialHelperKey !== selectedKey) {
      setSelectedKey(initialHelperKey);
    }
  }, [initialHelperKey, selectedKey]);

  useEffect(() => {
    if (!selectedKey) {
      setSelectedHelper(null);
      setSelectedSessions([]);
      return;
    }
    const { agentKey, serviceName } = parseHelperKey(selectedKey);
    if (agentKey && serviceName) {
      void loadDetail(agentKey, serviceName);
    }
  }, [selectedKey]);

  const loadDetail = async (agentKey: string, serviceName: string) => {
    if (!projectId) return;
    setDetailLoading(true);
    try {
      const [detail, sessions] = await Promise.all([
        environmentApi.environment.getAiHelperDetail(projectId, agentKey, serviceName),
        environmentApi.environment.listAiHelperSessions(projectId, agentKey, serviceName),
      ]);
      setSelectedHelper(detail);
      setSelectedSessions(sessions.items || []);
    } catch (error: any) {
      notify(`加载 Helper 详情失败: ${error?.message || error}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="px-8 pt-8 pb-10">
      <div className="space-y-6">
        {feedbackNodes}
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="mb-4">
            <button
              onClick={() => navigateToAppView('env-ai-agent-manage')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              返回 AI Agent 管理
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Helper 服务管理</h1>
              <p className="mt-2 text-sm text-slate-500">从 helper 服务实例视角查看节点、健康状态、内部 AI Agent 摘要与会话概况。</p>
            </div>
            <button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              <RefreshCw size={16} />刷新
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="搜索节点、服务名、agent_key" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部健康状态</option>
              <option value="healthy">healthy</option>
              <option value="unhealthy">unhealthy</option>
            </select>
            <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部节点</option>
              {nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-2 max-h-[900px] overflow-auto pr-1">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载中...</div>
            ) : filteredHelpers.length === 0 ? (
              <EmptyState text="当前项目下没有识别到 AI helper 服务。" />
            ) : filteredHelpers.map((helper) => {
              const key = buildHelperKey(helper.agent_key, helper.service_name);
              const selected = key === selectedKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{helper.service_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{helper.agent_hostname} · {helper.agent_key}</div>
                    </div>
                    <HealthBadge status={helper.health_status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                    <Server size={12} />
                    <span>{helper.ai_agent_count} 个 AI Agent</span>
                    <span>Active: {helper.active_agent_id || '-'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedHelper ? (
            <EmptyState text="请先从左侧选择一个 AI Helper 服务。" />
          ) : detailLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载详情中...</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Helper 服务</div>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">{selectedHelper.service_name}</h2>
                  <div className="mt-2 text-sm text-slate-600">{selectedHelper.agent_hostname} · {selectedHelper.agent_ip || '-'}</div>
                  <div className="mt-2 text-xs text-slate-500 break-all">Tags: {(selectedHelper.tags || []).join(', ') || '-'}</div>
                </div>
                <button onClick={() => void loadDetail(selectedHelper.agent_key, selectedHelper.service_name)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">刷新详情</button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">AI Agent 总数</div><div className="mt-3 text-3xl font-black text-slate-900">{helperSummary.total}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Installed</div><div className="mt-3 text-3xl font-black text-slate-900">{helperSummary.installed}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Running</div><div className="mt-3 text-3xl font-black text-slate-900">{helperSummary.running}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Active</div><div className="mt-3 text-3xl font-black text-slate-900">{helperSummary.active}</div></div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-bold text-slate-900">AI Agent 摘要</div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {(selectedHelper.agents || []).length === 0 ? <div className="text-sm text-slate-500">当前 helper 下暂无 AI Agent。</div> : (selectedHelper.agents || []).map((agent) => (
                        <div key={agent.agent_id} className="rounded-xl border border-slate-200 p-3">
                          <div className="text-sm font-bold text-slate-900">{agent.agent_id}</div>
                          <div className="mt-1 text-xs text-slate-500">{agent.backend_type} · {agent.command || '-'}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                            <span className={agent.installed ? 'text-green-600' : 'text-slate-400'}>{agent.installed ? 'INSTALLED' : 'MISSING'}</span>
                            <span className={agent.running ? 'text-emerald-600' : 'text-slate-400'}>{agent.running ? 'RUNNING' : 'STOPPED'}</span>
                            <span className={agent.active ? 'text-blue-600' : 'text-slate-400'}>{agent.active ? 'ACTIVE' : 'INACTIVE'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <JsonBlock title="Helper 健康详情" value={selectedHelper.health || {}} />
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-bold text-slate-900">最近会话</div>
                    <div className="mt-3 space-y-2">
                      {selectedSessions.length === 0 ? <div className="text-sm text-slate-500">当前 helper 还没有会话记录。</div> : selectedSessions.map((session) => (
                        <div key={session.session_id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-[11px] font-semibold text-slate-900">{session.session_id}</div>
                              <div className="mt-1 inline-flex max-w-[220px] items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
                                {(session.agent_ids || []).join(', ') || session.backend || '-'}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${sessionModeTone(session.session_mode)}`}>{sessionModeLabel(session.session_mode)}</span>
                                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(session.status)}`}>{session.status || 'unknown'}</span>
                                <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">PID {resolveBackendPid(session) ?? '-'}</span>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              消息 {session.messages?.length || 0}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <JsonBlock title="Helper 基础信息" value={{
                    agent_key: selectedHelper.agent_key,
                    hostname: selectedHelper.agent_hostname,
                    ip: selectedHelper.agent_ip,
                    image: selectedHelper.image,
                    status: selectedHelper.status,
                    tags: selectedHelper.tags,
                    active_agent_id: selectedHelper.active_agent_id,
                    updated_at: selectedHelper.updated_at,
                    last_seen_at: selectedHelper.last_seen_at,
                  }} />
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
