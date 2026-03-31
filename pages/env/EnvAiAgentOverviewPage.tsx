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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">节点摘要</div>
              <div className="mt-1 text-xs text-slate-500">按节点聚合当前项目下的 helper 与 AI Agent 分布。</div>
            </div>
            {(helpersLoading || agentsLoading) ? <div className="text-sm text-slate-500">加载中...</div> : null}
          </div>
          <div className="mt-4 space-y-4">
            {Object.keys(helperGroups).length === 0 ? (
              <EmptyState text="当前项目下没有识别到 AI helper 服务。" />
            ) : (Object.entries(helperGroups) as Array<[string, typeof helpers]>).map(([node, helperItems]) => {
              const nodeAgents = agentGroups[node] || [];
              return (
                <div key={node} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-lg font-black text-slate-900">{node}</div>
                      <div className="mt-1 text-sm text-slate-500">{helperItems.length} 个 helper · {nodeAgents.length} 个 AI Agent</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {helperItems.map((helper) => (
                        <div key={`${helper.agent_key}::${helper.service_name}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-900">{helper.service_name}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <HealthBadge status={helper.health_status} />
                            <span>{helper.ai_agent_count} 个 Agent</span>
                          </div>
                          <button
                            onClick={() => navigateToAppView('env-ai-helper', { helperKey: buildHelperKey(helper.agent_key, helper.service_name) })}
                            className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            查看详情
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {nodeAgents.length === 0 ? <div className="text-sm text-slate-500">当前节点暂无可用 AI Agent。</div> : nodeAgents.map((agent) => (
                      <div key={`${agent.agent_key}::${agent.service_name}::${agent.agent_id}`} className="rounded-xl border border-slate-200 bg-white p-3">
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
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
