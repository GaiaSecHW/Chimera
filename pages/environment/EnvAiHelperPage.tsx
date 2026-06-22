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
import { PageHeader } from '../../design-system';

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
        <PageHeader
          title="Helper 服务管理"
          description="从 helper 服务实例视角查看节点、健康状态、内部 AI Agent 摘要与会话概况。"
          back={{ label: '返回 AI Agent 管理', onClick: () => navigateToAppView('env-ai-agent-manage') }}
          actions={<button onClick={() => void reload(true)} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} />刷新</button>}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
 <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="form-input flex-1" placeholder="搜索节点、服务名、agent_key" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="form-select">
              <option value="">全部健康状态</option>
              <option value="healthy">healthy</option>
              <option value="unhealthy">unhealthy</option>
            </select>
            <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="form-select">
              <option value="">全部节点</option>
              {nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-2 max-h-[900px] overflow-auto pr-1">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={15} className="animate-spin" />加载中...</div>
            ) : filteredHelpers.length === 0 ? (
              <EmptyState text="当前项目下没有识别到 AI helper 服务。" />
            ) : filteredHelpers.map((helper) => {
              const key = buildHelperKey(helper.agent_key, helper.service_name);
              const selected = key === selectedKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${selected ? 'border-blue-500 bg-blue-500/15' : 'border-theme-border bg-theme-elevated hover:border-theme-border'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">{helper.service_name}</div>
                      <div className="mt-1 text-xs text-theme-text-muted">{helper.agent_hostname} · {helper.agent_key}</div>
                    </div>
                    <HealthBadge status={helper.health_status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-theme-text-secondary">
                    <Server size={12} />
                    <span>{helper.ai_agent_count} 个 AI Agent</span>
                    <span>Active: {helper.active_agent_id || '-'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
          {!selectedHelper ? (
            <EmptyState text="请先从左侧选择一个 AI Helper 服务。" />
          ) : detailLoading ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={15} className="animate-spin" />加载详情中...</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-theme-text-muted">Helper 服务</div>
                  <h2 className="mt-2 text-2xl font-bold text-theme-text-primary">{selectedHelper.service_name}</h2>
                  <div className="mt-2 text-sm text-theme-text-secondary">{selectedHelper.agent_hostname} · {selectedHelper.agent_ip || '-'}</div>
                  <div className="mt-2 text-xs text-theme-text-muted break-all">Tags: {(selectedHelper.tags || []).join(', ') || '-'}</div>
                </div>
                <button onClick={() => void loadDetail(selectedHelper.agent_key, selectedHelper.service_name)} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold">刷新详情</button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-theme-border bg-theme-surface p-4"><div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">AI Agent 总数</div><div className="mt-3 text-3xl font-bold text-theme-text-primary">{helperSummary.total}</div></div>
                <div className="rounded-xl border border-theme-border bg-theme-surface p-4"><div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">Installed</div><div className="mt-3 text-3xl font-bold text-theme-text-primary">{helperSummary.installed}</div></div>
                <div className="rounded-xl border border-theme-border bg-theme-surface p-4"><div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">Running</div><div className="mt-3 text-3xl font-bold text-theme-text-primary">{helperSummary.running}</div></div>
                <div className="rounded-xl border border-theme-border bg-theme-surface p-4"><div className="text-xs font-medium uppercase tracking-[0.16em] text-theme-text-muted">Active</div><div className="mt-3 text-3xl font-bold text-theme-text-primary">{helperSummary.active}</div></div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-theme-border p-4">
                    <div className="text-sm font-semibold text-theme-text-primary">AI Agent 摘要</div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {(selectedHelper.agents || []).length === 0 ? <div className="text-sm text-theme-text-muted">当前 helper 下暂无 AI Agent。</div> : (selectedHelper.agents || []).map((agent) => (
                        <div key={agent.agent_id} className="rounded-xl border border-theme-border p-3">
                          <div className="text-sm font-semibold text-theme-text-primary">{agent.agent_id}</div>
                          <div className="mt-1 text-xs text-theme-text-muted">{agent.backend_type} · {agent.command || '-'}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.16em]">
                            <span className={agent.installed ? 'text-green-400' : 'text-theme-text-muted'}>{agent.installed ? 'INSTALLED' : 'MISSING'}</span>
                            <span className={agent.running ? 'text-emerald-400' : 'text-theme-text-muted'}>{agent.running ? 'RUNNING' : 'STOPPED'}</span>
                            <span className={agent.active ? 'text-blue-400' : 'text-theme-text-muted'}>{agent.active ? 'ACTIVE' : 'INACTIVE'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <JsonBlock title="Helper 健康详情" value={selectedHelper.health || {}} />
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-theme-border p-4">
                    <div className="text-sm font-semibold text-theme-text-primary">最近会话</div>
                    <div className="mt-3 space-y-2">
                      {selectedSessions.length === 0 ? <div className="text-sm text-theme-text-muted">当前 helper 还没有会话记录。</div> : selectedSessions.map((session) => (
                        <div key={session.session_id} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-[11px] font-semibold text-theme-text-primary">{session.session_id}</div>
                              <div className="mt-1 inline-flex max-w-[220px] items-center rounded-full border border-cyan-500/20 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                                {(session.agent_ids || []).join(', ') || session.backend || '-'}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${sessionModeTone(session.session_mode)}`}>{sessionModeLabel(session.session_mode)}</span>
                                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(session.status)}`}>{session.status || 'unknown'}</span>
                                <span className="rounded-full border border-theme-border bg-theme-elevated px-1.5 py-0.5 text-[10px] font-semibold text-theme-text-secondary">PID {resolveBackendPid(session) ?? '-'}</span>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-theme-border bg-theme-elevated px-2 py-0.5 text-[10px] font-semibold text-theme-text-secondary">
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