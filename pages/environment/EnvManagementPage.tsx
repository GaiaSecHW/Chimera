import React, { useMemo } from 'react';
import { Bot, CheckCircle2, Clock3, RefreshCw, ServerCog, XCircle } from 'lucide-react';
import { Agent } from '../../types/types';

const getAgentKey = (agent: Agent): string => agent.key || (agent as any).agent_key || (agent as any).id || '';

const getAgentName = (agent: Agent): string => agent.full_name || agent.hostname || getAgentKey(agent) || '未命名 Agent';

const isOnline = (agent: Agent): boolean => {
  if (agent.is_offline) return false;
  return ['online', 'healthy', 'ready'].includes(String(agent.status || '').toLowerCase());
};

const formatTime = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
};

const statusMeta = (agent: Agent) => {
  if (isOnline(agent)) return { label: '在线', icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  const status = String(agent.status || '').toLowerCase();
  if (['offline', 'error', 'timeout'].includes(status) || agent.is_offline) {
    return { label: '离线', icon: XCircle, cls: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  return { label: agent.status || '未知', icon: Clock3, cls: 'border-slate-200 bg-slate-50 text-slate-600' };
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint: string; tone?: string }> = ({ label, value, hint, tone = 'text-slate-900' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className={`mt-3 text-3xl font-black ${tone}`}>{value}</div>
    <div className="mt-2 text-sm text-slate-500">{hint}</div>
  </div>
);

export const EnvManagementPage: React.FC<{ projectId: string; agents: Agent[]; onRefresh?: () => void }> = ({ projectId, agents, onRefresh }) => {
  const projectAgents = useMemo(
    () => agents.filter((agent) => !projectId || !agent.project_id || String(agent.project_id) === String(projectId)),
    [agents, projectId],
  );
  const onlineCount = projectAgents.filter(isOnline).length;
  const offlineCount = projectAgents.filter((agent) => !isOnline(agent)).length;
  const latestSeen = projectAgents.map((agent) => agent.last_seen).filter(Boolean).sort().at(-1);

  return (
    <div className="min-h-full bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
              <ServerCog size={14} />
              Environment Management
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">环境管理</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              查看当前项目已上线的 Agent、运行状态和最近心跳。该页面为独立入口，不影响现有环境管理页面。
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!onRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Agent 总数" value={projectAgents.length} hint="当前项目可见 Agent" />
          <StatCard label="在线 Agent" value={onlineCount} hint="可执行任务的在线节点" tone="text-emerald-700" />
          <StatCard label="离线/异常" value={offlineCount} hint="需要关注的节点" tone={offlineCount > 0 ? 'text-rose-700' : 'text-slate-900'} />
          <StatCard label="最近心跳" value={<span className="text-lg">{formatTime(latestSeen)}</span>} hint="按 Agent last_seen 汇总" />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">上线 Agent</h2>
              <p className="mt-1 text-sm text-slate-500">环境接入完成后，Agent 会在这里进行统一查看。</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{projectAgents.length} 条</div>
          </div>

          {projectAgents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Bot size={22} />
              </div>
              <div className="mt-4 text-base font-black text-slate-900">暂无上线 Agent</div>
              <div className="mt-2 text-sm text-slate-500">请先在环境接入页面完成节点部署。</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Agent</th>
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3">IP</th>
                    <th className="px-6 py-3">最近心跳</th>
                    <th className="px-6 py-3">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectAgents.map((agent) => {
                    const meta = statusMeta(agent);
                    const StatusIcon = meta.icon;
                    return (
                      <tr key={getAgentKey(agent) || getAgentName(agent)} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{getAgentName(agent)}</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-500">{getAgentKey(agent) || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.cls}`}>
                            <StatusIcon size={13} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{agent.ip_address || '-'}</td>
                        <td className="px-6 py-4 text-slate-600">{formatTime(agent.last_seen)}</td>
                        <td className="max-w-md px-6 py-4 text-slate-500">{agent.status_reason || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
