import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../clients/api';
import { AiAgentItem, AiHelperService, ProjectAiAgentItem } from '../../types/types';

const environmentApi = api.domains.environment;

export const prettyJson = (value: any) => JSON.stringify(value ?? {}, null, 2);

export const buildHelperKey = (agentKey: string, serviceName: string) => `${agentKey}::${serviceName}`;

export const parseHelperKey = (value: string) => {
  const [agentKey = '', serviceName = ''] = String(value || '').split('::');
  return { agentKey, serviceName };
};

export const navigateToAppView = (view: string, extraDetail: Record<string, any> = {}) => {
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view, ...extraDetail } }));
};

export const HealthBadge: React.FC<{ status?: string }> = ({ status }) => {
  const normalized = String(status || 'unknown').toLowerCase();
  const cls = normalized === 'healthy'
    ? 'bg-green-100 text-green-700 border-green-200'
    : normalized === 'unhealthy'
      ? 'bg-red-100 text-red-700 border-red-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${cls}`}>{normalized}</span>;
};

export const AgentStateBadges: React.FC<{ agent: Pick<AiAgentItem, 'installed' | 'running' | 'active'> }> = ({ agent }) => (
  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
    <span className={agent.installed ? 'text-green-600' : 'text-slate-400'}>{agent.installed ? 'INSTALLED' : 'MISSING'}</span>
    <span className={agent.running ? 'text-emerald-600' : 'text-slate-400'}>{agent.running ? 'RUNNING' : 'STOPPED'}</span>
    <span className={agent.active ? 'text-blue-600' : 'text-slate-400'}>{agent.active ? 'ACTIVE' : 'INACTIVE'}</span>
  </div>
);

export const JsonBlock: React.FC<{ title?: string; value: any; className?: string }> = ({ title, value, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
    {title ? <div className="text-sm font-bold text-slate-900">{title}</div> : null}
    <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{prettyJson(value)}</pre>
  </div>
);

export const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{text}</div>
);

export const useAiHelpers = (projectId: string, notify: (message: string, type?: any) => void) => {
  const [loading, setLoading] = useState(true);
  const [helpers, setHelpers] = useState<AiHelperService[]>([]);

  const reload = async (withSpinner = true, params: { agent_key?: string; health_status?: string } = {}) => {
    if (!projectId) {
      setHelpers([]);
      setLoading(false);
      return;
    }
    if (withSpinner) setLoading(true);
    try {
      const data = await environmentApi.environment.listAiHelpers(projectId, params);
      setHelpers(data.items || []);
    } catch (error: any) {
      notify(`加载 AI Helper 列表失败: ${error?.message || error}`, 'error');
    } finally {
      if (withSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(true);
  }, [projectId]);

  return { loading, helpers, reload, setHelpers };
};

export const useProjectAiAgents = (projectId: string, notify: (message: string, type?: any) => void) => {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<ProjectAiAgentItem[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [total, setTotal] = useState(0);

  const reload = async (
    withSpinner = true,
    params: { agent_key?: string; health_status?: string; backend_type?: string; installed?: boolean; page?: number; per_page?: number } = {}
  ) => {
    if (!projectId) {
      setAgents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    if (withSpinner) setLoading(true);
    try {
      const targetPage = Math.max(1, Number(params.page ?? page) || 1);
      const targetPerPage = Math.max(1, Math.min(1000, Number(params.per_page ?? perPage) || 100));
      const data = await environmentApi.environment.listProjectAiAgents(projectId, {
        ...params,
        page: targetPage,
        per_page: targetPerPage,
      });
      setAgents(data.items || []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || targetPage));
      setPerPage(Number(data.per_page || targetPerPage));
    } catch (error: any) {
      notify(`加载项目级 AI Agent 列表失败: ${error?.message || error}`, 'error');
    } finally {
      if (withSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(true, { page, per_page: perPage });
  }, [projectId, page, perPage]);

  return { loading, agents, reload, setAgents, page, perPage, total, setPage, setPerPage };
};

export const groupHelpersByNode = (helpers: AiHelperService[]) => {
  return helpers.reduce<Record<string, AiHelperService[]>>((acc, item) => {
    const key = item.agent_hostname || item.agent_key || '未知节点';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
};

export const groupProjectAiAgentsByNode = (agents: ProjectAiAgentItem[]) => {
  return agents.reduce<Record<string, ProjectAiAgentItem[]>>((acc, item) => {
    const key = item.agent_hostname || item.agent_key || '未知节点';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
};

export const summarizeHelperAgents = (helper: AiHelperService | null) => {
  const agents = helper?.agents || [];
  return {
    total: agents.length,
    running: agents.filter((item) => item.running).length,
    active: agents.filter((item) => item.active).length,
    installed: agents.filter((item) => item.installed).length,
  };
};

export const summarizeProjectAgents = (agents: ProjectAiAgentItem[]) => ({
  total: agents.length,
  installed: agents.filter((item) => item.installed).length,
  running: agents.filter((item) => item.running).length,
  active: agents.filter((item) => item.active).length,
});

export const uniqueValues = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean as any))).sort() as T[];

export const useFilteredHelpers = (helpers: AiHelperService[], search: string, healthFilter: string, nodeFilter: string) => {
  return useMemo(() => helpers.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const byKeyword = !keyword || [item.agent_hostname, item.service_name, item.agent_key].join(' ').toLowerCase().includes(keyword);
    const byHealth = !healthFilter || item.health_status === healthFilter;
    const byNode = !nodeFilter || item.agent_hostname === nodeFilter;
    return byKeyword && byHealth && byNode;
  }), [helpers, search, healthFilter, nodeFilter]);
};
