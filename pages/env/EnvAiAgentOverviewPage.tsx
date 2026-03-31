import React, { useMemo } from 'react';
import { Activity, Bot, Boxes, Brain, Workflow } from 'lucide-react';

import { useUiFeedback } from '../../components/UiFeedback';
import {
  EmptyState,
  HealthBadge,
  buildHelperKey,
  groupHelpersByNode,
  groupProjectAiAgentsByNode,
  navigateToAppView,
  summarizeProjectAgents,
  useAiHelpers,
  useProjectAiAgents,
} from './ai-agent/shared';

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
        <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
      </div>
      <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
    </div>
  </div>
);

export const EnvAiAgentOverviewPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const { loading: helpersLoading, helpers } = useAiHelpers(projectId, notify);
  const { loading: agentsLoading, agents } = useProjectAiAgents(projectId, notify);

  const helperGroups = useMemo(() => groupHelpersByNode(helpers), [helpers]);
  const agentGroups = useMemo(() => groupProjectAiAgentsByNode(agents), [agents]);
  const stats = useMemo(() => summarizeProjectAgents(agents), [agents]);
  const healthyHelpers = helpers.filter((item) => item.health_status === 'healthy').length;

  return (
    <div className="px-8 pt-8 pb-10">
      <div className="space-y-6">
        {feedbackNodes}
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">AI Agent 总览</h1>
              <p className="mt-2 text-sm text-slate-500">从项目维度看当前所有 helper 和 AI Agent 的整体状态，再按职责进入具体管理页面。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigateToAppView('env-ai-agent-manage')} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">AI Agent 管理</button>
              <button onClick={() => navigateToAppView('env-ai-session')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">单会话</button>
              <button onClick={() => navigateToAppView('env-ai-batch-session')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">批量会话</button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Helper 总数" value={helpers.length} icon={<Boxes size={20} />} />
          <StatCard label="健康 Helper" value={healthyHelpers} icon={<Activity size={20} />} />
          <StatCard label="AI Agent 总数" value={stats.total} icon={<Bot size={20} />} />
          <StatCard label="Installed" value={stats.installed} icon={<Brain size={20} />} />
          <StatCard label="Running" value={stats.running} icon={<Workflow size={20} />} />
          <StatCard label="Active" value={stats.active} icon={<Bot size={20} />} />
        </div>

        <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/40 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700">节点摘要</div>
              <div className="mt-2 text-sm text-slate-600">按节点聚合 helper 与 AI Agent 分布，支持直接进入指定 helper 详情。</div>
            </div>
            {(helpersLoading || agentsLoading) ? <div className="text-sm text-slate-500">加载中...</div> : null}
          </div>
          <div className="mt-5 space-y-5">
            {Object.keys(helperGroups).length === 0 ? (
              <EmptyState text="当前项目下没有识别到 AI helper 服务。" />
            ) : (Object.entries(helperGroups) as Array<[string, typeof helpers]>).map(([node, helperItems]) => {
              const nodeAgents = agentGroups[node] || [];
              const nodeHealthyHelpers = helperItems.filter((helper) => helper.health_status === 'healthy').length;
              const nodeRunningAgents = nodeAgents.filter((agent) => agent.running).length;
              const nodeActiveAgents = nodeAgents.filter((agent) => agent.active).length;
              return (
                <div key={node} className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-xl font-black tracking-tight text-slate-900">{node}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{helperItems.length} 个 helper</span>
                        <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-cyan-800">{nodeHealthyHelpers} 个健康</span>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">{nodeAgents.length} 个 AI Agent</span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{nodeRunningAgents} 个运行中</span>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{nodeActiveAgents} 个激活</span>
                      </div>
                    </div>
                    <div className="grid min-w-[240px] grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Helper</div>
                        <div className="mt-1 text-2xl font-black text-slate-900">{helperItems.length}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Agent</div>
                        <div className="mt-1 text-2xl font-black text-slate-900">{nodeAgents.length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Helper 服务</div>
                      <div className="space-y-2">
                      {helperItems.map((helper) => (
                        <div key={`${helper.agent_key}::${helper.service_name}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">{helper.service_name}</div>
                            <HealthBadge status={helper.health_status} />
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">{helper.agent_key}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span>{helper.ai_agent_count} 个 Agent</span>
                            <span className="text-[11px] text-slate-500">{helper.agent_hostname || '-'}</span>
                          </div>
                          <button
                            onClick={() => navigateToAppView('env-ai-helper', { helperKey: buildHelperKey(helper.agent_key, helper.service_name) })}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            查看详情
                          </button>
                        </div>
                      ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">AI Agent 列表</div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {nodeAgents.length === 0 ? <div className="text-sm text-slate-500">当前节点暂无可用 AI Agent。</div> : nodeAgents.map((agent) => (
                          <div key={`${agent.agent_key}::${agent.service_name}::${agent.agent_id}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="text-sm font-bold text-slate-900">{agent.agent_id}</div>
                            <div className="mt-1 text-xs text-slate-500">{agent.service_name} · {agent.backend_type}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                              <span className={agent.installed ? 'text-green-600' : 'text-slate-400'}>{agent.installed ? 'INSTALLED' : 'MISSING'}</span>
                              <span className={agent.running ? 'text-emerald-600' : 'text-slate-400'}>{agent.running ? 'RUNNING' : 'STOPPED'}</span>
                              <span className={agent.active ? 'text-blue-600' : 'text-slate-400'}>{agent.active ? 'ACTIVE' : 'INACTIVE'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500"
                      style={{ width: `${Math.max(8, Math.min(100, nodeAgents.length > 0 ? (nodeRunningAgents / nodeAgents.length) * 100 : 8))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    运行中 AI Agent 占比：{nodeAgents.length > 0 ? `${Math.round((nodeRunningAgents / nodeAgents.length) * 100)}%` : '0%'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
