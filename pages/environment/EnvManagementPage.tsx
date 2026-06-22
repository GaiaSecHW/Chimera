import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Box, CheckCircle2, ChevronDown, ChevronRight, Clock3, Cpu, Database, FileText, Filter, GitBranch, Loader2, Monitor, Network, RefreshCw, Search, ServerCog, Settings, X, XCircle } from 'lucide-react';
import { api } from '../../clients/api';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { useUiFeedback } from '../../components/UiFeedback';
import { Agent } from '../../types/types';
import { PageHeader } from '../../design-system';

const TEST_ENV_API_BASE = `${API_BASE}/api/app/web-e2e`;

const extractArray = (raw: any, keys: string[]): any[] => {
  if (Array.isArray(raw)) return raw;
  for (const key of keys) {
    const value = raw?.[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.items)) return raw.data.items;
  if (Array.isArray(raw?.data?.records)) return raw.data.records;
  if (Array.isArray(raw?.result?.items)) return raw.result.items;
  return [];
};

const requestTestEnv = async (url: string): Promise<any> => {
  const raw = await handleResponse(await fetch(url, { headers: getHeaders() }));
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    if (raw.success === false) throw new Error(raw.message || '测试环境 API 请求失败');
    return raw.data;
  }
  return raw;
};

const normalizeAgent = (item: any): Agent => {
  const source = item?.agent || item;
  const normalized: Agent & Record<string, any> = {
    key: source?.key || source?.agent_key || source?.agentKey || source?.agent_id || source?.agentId || source?.id || '',
    hostname: source?.hostname || source?.name || source?.id || source?.agent_id || '',
    full_name: source?.full_name || source?.name || source?.description || source?.hostname || source?.id || source?.agent_id || '',
    status: source?.status || 'unknown',
    ip_address: source?.ip_address || source?.ip_addresses || source?.ip || '',
    system_info: source?.system_info,
    project_id: source?.project_id,
    last_seen: source?.last_seen || source?.updated_at || source?.update_at || source?.created_at,
    status_reason: source?.status_reason || source?.message || null,
    services: source?.services,
    is_offline: ['offline', 'error', 'timeout'].includes(String(source?.status || '').toLowerCase()),
    allow_reason: item?.progress ? JSON.stringify(item.progress) : undefined,
    agent_type: source?.agent_type || source?.agentType || source?.type || source?.kind || 'NODE_AGENT',
    agent_version: source?.agent_version || source?.agentVersion || source?.version || '',
    created_at: source?.created_at || source?.createdAt || source?.create_time || '',
    updated_at: source?.updated_at || source?.updatedAt || source?.update_at || '',
    pid: source?.pid,
    parent_id: source?.parent_id || source?.parentId || source?.parent_agent_id || source?.parentAgentId || source?.parent_agent_key || source?.parentAgentKey || source?.parent_key || source?.parentKey || '',
    progress: item?.progress || source?.progress,
    raw: item,
  };
  return normalized;
};

const fetchTestEnvAgents = async (projectId: string): Promise<Agent[]> => {
  const raw = await requestTestEnv(`${TEST_ENV_API_BASE}/agents/projects/${encodeURIComponent(projectId)}`);
  return extractArray(raw, ['items', 'agents', 'records', 'data']).map(normalizeAgent);
};

type ArchitectureRoute = {
  id?: string;
  name?: string;
  handler?: string;
  method?: string;
  pattern?: string;
  path?: string;
  httpMethod?: string;
  description?: string;
  processType?: string;
  process_type?: string;
  appType?: string;
  app_type?: string;
  frameworkType?: string;
  framework_type?: string;
  connector?: string;
  context?: string;
  docbase?: string;
  collectedAt?: string;
  collected_at?: string;
};

const fetchArchitectureRoutes = async (projectId: string, agentKey: string): Promise<ArchitectureRoute[]> => {
  const urls = [
    `${TEST_ENV_API_BASE}/agents/${encodeURIComponent(agentKey)}/routes`,
    `${TEST_ENV_API_BASE}/agents/${encodeURIComponent(agentKey)}/web-routes?project_id=${encodeURIComponent(projectId)}`,
    `${TEST_ENV_API_BASE}/web-routes?project_id=${encodeURIComponent(projectId)}&agent_key=${encodeURIComponent(agentKey)}`,
  ];

  let lastError: any = null;
  for (const url of urls) {
    try {
      const raw = await requestTestEnv(url);
      return extractArray(raw, ['items', 'routes', 'web_routes', 'records', 'data']);
    } catch (error: any) {
      lastError = error;
      if (error?.status && error.status !== 404 && error.status !== 410) throw error;
    }
  }
  throw lastError || new Error('未找到 Java Agent 进程架构接口');
};

const stringValue = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

const getRawAgent = (agent: Agent): Record<string, any> => {
  const raw = (agent as any).raw;
  return raw?.agent || raw || {};
};

const uniqueStrings = (values: unknown[]): string[] => Array.from(new Set(values.map(stringValue).filter(Boolean)));

const getAgentIdentityKeys = (agent: Agent): string[] => {
  const raw = getRawAgent(agent);
  return uniqueStrings([
    agent.key,
    (agent as any).agent_key,
    (agent as any).agentKey,
    (agent as any).agent_id,
    (agent as any).agentId,
    (agent as any).id,
    (agent as any).uuid,
    raw.key,
    raw.agent_key,
    raw.agentKey,
    raw.agent_id,
    raw.agentId,
    raw.id,
    raw.uuid,
  ]);
};

const getAgentKey = (agent: Agent): string => getAgentIdentityKeys(agent)[0] || '';

const getAgentParentKey = (agent: Agent): string => {
  const raw = getRawAgent(agent);
  return uniqueStrings([
    (agent as any).parent_id,
    (agent as any).parentId,
    (agent as any).parent_agent_id,
    (agent as any).parentAgentId,
    (agent as any).parent_agent_key,
    (agent as any).parentAgentKey,
    (agent as any).parent_key,
    (agent as any).parentKey,
    raw.parent_id,
    raw.parentId,
    raw.parent_agent_id,
    raw.parentAgentId,
    raw.parent_agent_key,
    raw.parentAgentKey,
    raw.parent_key,
    raw.parentKey,
    raw.parent?.key,
    raw.parent?.id,
    raw.parent?.agent_key,
    raw.parent?.agentKey,
    raw.parent?.agent_id,
    raw.parent?.agentId,
    raw.parentAgent?.key,
    raw.parentAgent?.id,
    raw.parentAgent?.agent_key,
    raw.parentAgent?.agentKey,
    raw.parentAgent?.agent_id,
    raw.parentAgent?.agentId,
  ])[0] || '';
};

const getAgentName = (agent: Agent): string => agent.full_name || agent.hostname || getAgentKey(agent) || '未命名 Agent';

const normalizeStatus = (status?: string): string => String(status || '').toLowerCase();

const isOnline = (agent: Agent): boolean => {
  if (agent.is_offline) return false;
  return ['online', 'healthy', 'ready'].includes(normalizeStatus(agent.status));
};

const getAgentType = (agent: Agent): string => String((agent as any).agent_type || (agent as any).agentType || (agent as any).type || 'NODE_AGENT');

const isJavaAgent = (agent: Agent): boolean => getAgentType(agent).toUpperCase() === 'JAVA_AGENT';

const getAgentTypeLabel = (type: string): string => {
  switch (String(type || '').toUpperCase()) {
    case 'NODE_AGENT':
      return 'Node Agent';
    case 'JAVA_AGENT':
      return 'Java Agent';
    case 'GAIASEC_AGENT':
      return 'Gaia Agent';
    case 'PACKAGE':
      return 'Package';
    default:
      return type || '未知';
  }
};

const getAgentTypeClass = (type: string): string => {
  switch (String(type || '').toUpperCase()) {
    case 'NODE_AGENT':
      return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
    case 'JAVA_AGENT':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    case 'GAIASEC_AGENT':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
    case 'PACKAGE':
      return 'border-violet-500/20 bg-violet-500/15 text-violet-400';
    default:
      return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
  }
};

const getAgentVersion = (agent: Agent): string => String((agent as any).agent_version || (agent as any).agentVersion || (agent as any).version || '');

const getAgentCreatedAt = (agent: Agent): string => String((agent as any).created_at || (agent as any).createdAt || (agent as any).create_time || '');

const getAgentUpdatedAt = (agent: Agent): string => String((agent as any).updated_at || (agent as any).updatedAt || (agent as any).update_at || agent.last_seen || '');

const getIpList = (agent: Agent): string[] => String(agent.ip_address || (agent as any).ipAddresses || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const getProgress = (agent: Agent): any => {
  const direct = (agent as any).progress;
  if (direct && typeof direct === 'object') return direct;
  if (agent.allow_reason) {
    try {
      const parsed = JSON.parse(agent.allow_reason);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const getProgressPercent = (completed?: number, total?: number): number => {
  const c = Number(completed || 0);
  const t = Number(total || 0);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
};

type AgentTreeRow = {
  agent: Agent;
  depth: number;
  hasChildren: boolean;
  matched: boolean;
};

const buildAgentTreeRows = (
  agents: Agent[],
  matcher: (agent: Agent) => boolean,
  expandedKeys: Set<string>,
  autoExpandMatchedDescendants: boolean,
): AgentTreeRow[] => {
  const byKey = new Map<string, Agent>();
  const childrenByParent = new Map<string, Agent[]>();

  agents.forEach((agent) => {
    getAgentIdentityKeys(agent).forEach((key) => byKey.set(key, agent));
  });

  agents.forEach((agent) => {
    const parentKey = getAgentParentKey(agent);
    if (!parentKey || !byKey.has(parentKey)) return;
    const parent = byKey.get(parentKey);
    const canonicalParentKey = parent ? getAgentKey(parent) : parentKey;
    const children = childrenByParent.get(canonicalParentKey) || [];
    children.push(agent);
    childrenByParent.set(canonicalParentKey, children);
  });

  const roots = agents.filter((agent) => {
    const parentKey = getAgentParentKey(agent);
    return !parentKey || !byKey.has(parentKey);
  });

  const sortAgents = (items: Agent[]) => [...items].sort((a, b) => {
    const typeScore = (agent: Agent) => getAgentParentKey(agent) ? 1 : 0;
    return typeScore(a) - typeScore(b) || getAgentName(a).localeCompare(getAgentName(b), 'zh-CN');
  });

  const hasMatchedDescendant = (agent: Agent): boolean => {
    const children = childrenByParent.get(getAgentKey(agent)) || [];
    return children.some((child) => matcher(child) || hasMatchedDescendant(child));
  };

  const rows: AgentTreeRow[] = [];
  const visit = (agent: Agent, depth: number, forceVisible: boolean) => {
    const key = getAgentKey(agent);
    const children = sortAgents(childrenByParent.get(key) || []);
    const matched = matcher(agent);
    const childMatched = hasMatchedDescendant(agent);
    if (!matched && !childMatched && !forceVisible) return;
    rows.push({ agent, depth, hasChildren: children.length > 0, matched });
    const shouldExpand = expandedKeys.has(key) || (autoExpandMatchedDescendants && childMatched);
    if (shouldExpand) {
      children.forEach((child) => visit(child, depth + 1, matched || forceVisible));
    }
  };

  sortAgents(roots).forEach((agent) => visit(agent, 0, false));
  return rows;
};

const formatTime = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
};

const statusMeta = (agent: Agent) => {
  if (isOnline(agent)) return { label: '在线', icon: CheckCircle2, cls: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' };
  const status = normalizeStatus(agent.status);
  if (['offline', 'error', 'timeout'].includes(status) || agent.is_offline) {
    return { label: '离线', icon: XCircle, cls: 'border-rose-500/20 bg-rose-500/15 text-rose-400' };
  }
  if (['connecting', 'pending'].includes(status)) {
    return { label: '连接中', icon: Clock3, cls: 'border-amber-500/20 bg-amber-500/15 text-amber-400' };
  }
  return { label: agent.status || '未知', icon: Clock3, cls: 'border-theme-border bg-theme-bg-app text-theme-text-secondary' };
};

const getStatusDotClass = (agent: Agent): string => {
  if (isOnline(agent)) return 'bg-emerald-500';
  const status = normalizeStatus(agent.status);
  if (['offline', 'error', 'timeout'].includes(status) || agent.is_offline) return 'bg-rose-500';
  if (['connecting', 'pending'].includes(status)) return 'bg-amber-500';
  return 'bg-slate-400';
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint: string; tone?: string }> = ({ label, value, hint, tone = 'text-theme-text-primary' }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-sm">
    <div className="text-xs font-medium uppercase tracking-[0.18em] text-theme-text-muted">{label}</div>
    <div className={`mt-3 text-3xl font-bold ${tone}`}>{value}</div>
    <div className="mt-2 text-sm text-theme-text-muted">{hint}</div>
  </div>
);

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-theme-text-muted">{label}</div>
    <div className="mt-2 break-words text-sm font-semibold text-theme-text-primary">{children || '-'}</div>
  </div>
);

const AgentProgressCell: React.FC<{ agent: Agent }> = ({ agent }) => {
  const progress = getProgress(agent);
  const webRoutes = progress?.webRoutes || progress?.web_routes;
  const aiAnalysis = progress?.aiAnalysis || progress?.ai_analysis;
  const aiVerification = progress?.aiVerification || progress?.ai_verification;
  const items = [
    { label: 'Routes', completed: webRoutes?.described ?? webRoutes?.completed, total: webRoutes?.total, color: 'bg-blue-500' },
    { label: '分析', completed: aiAnalysis?.completed, total: aiAnalysis?.total, color: 'bg-emerald-500' },
    { label: '验证', completed: aiVerification?.completed, total: aiVerification?.total, color: 'bg-amber-500' },
  ].filter((item) => Number(item.total || 0) > 0);

  if (items.length === 0) return <span className="text-theme-text-muted">-</span>;

  return (
    <div className="min-w-[150px] space-y-1.5">
      {items.map((item) => {
        const percent = getProgressPercent(item.completed, item.total);
        return (
          <div key={item.label}>
            <div className="mb-0.5 flex items-center justify-between text-[11px] text-theme-text-muted">
              <span>{item.label}</span>
              <span>{Number(item.completed || 0)} / {Number(item.total || 0)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-theme-elevated">
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AgentTreeTable: React.FC<{
  rows: AgentTreeRow[];
  childCountByParent: Map<string, number>;
  expandedKeys: Set<string>;
  onToggleExpand: (agentKey: string) => void;
  onOpenDetail: (agent: Agent) => void;
  onOpenArchitecture: (agent: Agent) => void;
}> = ({ rows, childCountByParent, expandedKeys, onToggleExpand, onOpenDetail, onOpenArchitecture }) => (
  <div className="overflow-x-auto bg-theme-surface">
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-theme-border bg-slate-50/70 text-xs font-semibold text-theme-text-muted">
        <tr>
          <th className="px-5 py-3">Agent</th>
          <th className="px-4 py-3">状态</th>
          <th className="px-4 py-3">类型</th>
          <th className="px-4 py-3">地址</th>
          <th className="px-4 py-3">版本</th>
          <th className="px-4 py-3">最近心跳</th>
          <th className="px-4 py-3">分析进度</th>
          <th className="px-4 py-3">说明</th>
          <th className="px-5 py-3 text-right">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-theme-border">
        {rows.map((row) => {
          const agent = row.agent;
          const meta = statusMeta(agent);
          const type = getAgentType(agent);
          const ips = getIpList(agent);
          const agentKey = getAgentKey(agent);
          const childrenCount = childCountByParent.get(agentKey) || 0;
          const isExpanded = expandedKeys.has(agentKey);
          const indent = Math.min(row.depth, 6) * 24;

          return (
            <tr key={agentKey || getAgentName(agent)} className="transition hover:bg-slate-50/80">
              <td className="py-3.5 pr-5" style={{ paddingLeft: `${20 + indent}px` }}>
                <div className="relative flex min-w-[280px] items-start gap-2.5">
                  {row.depth > 0 ? <span className="absolute -left-3 top-3 h-px w-2 bg-slate-300" /> : null}
                  {row.hasChildren ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (agentKey) onToggleExpand(agentKey);
                      }}
                      disabled={!agentKey}
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={isExpanded ? '收起子 Agent' : '展开子 Agent'}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <span className="h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <button type="button" onClick={() => onOpenDetail(agent)} className="min-w-0 text-left">
                        <div className="truncate font-semibold text-theme-text-primary hover:text-cyan-400">{getAgentName(agent)}</div>
                      </button>
                      {row.depth > 0 ? <span className="shrink-0 text-xs text-theme-text-muted">子节点</span> : null}
                      {childrenCount > 0 ? <span className="shrink-0 text-xs text-theme-text-muted">{childrenCount} 子节点</span> : null}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{agentKey || '-'}</div>
                    {row.depth > 0 ? <div className="mt-0.5 break-all font-mono text-[11px] text-theme-text-muted">父：{getAgentParentKey(agent)}</div> : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3.5">
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-theme-text-secondary">
                  <span className={`h-2 w-2 rounded-full ${getStatusDotClass(agent)}`} />
                  {meta.label}
                </span>
              </td>
              <td className="px-4 py-3.5 text-sm text-theme-text-secondary">{getAgentTypeLabel(type)}</td>
              <td className="px-4 py-3.5">
                {ips.length ? (
                  <div className="max-w-[240px] text-xs leading-5 text-theme-text-secondary">
                    <span className="font-mono">{ips.slice(0, 2).join(', ')}</span>
                    {ips.length > 2 ? <span className="ml-1 text-theme-text-muted">+{ips.length - 2}</span> : null}
                  </div>
                ) : <span className="text-theme-text-muted">-</span>}
              </td>
              <td className="px-4 py-3.5 font-mono text-xs text-theme-text-muted">{getAgentVersion(agent) || '-'}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-xs text-theme-text-muted">{formatTime(agent.last_seen)}</td>
              <td className="px-4 py-3.5"><AgentProgressCell agent={agent} /></td>
              <td className="max-w-md px-4 py-3.5 text-xs text-theme-text-muted">{agent.status_reason || '-'}</td>
              <td className="px-5 py-3.5 text-right">
                <div className="flex justify-end gap-3">
                  {isJavaAgent(agent) ? (
                    <button
                      type="button"
                      onClick={() => onOpenArchitecture(agent)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
                    >
                      <GitBranch size={12} />
                      架构
                    </button>
                  ) : <span className="text-xs text-theme-text-muted">-</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const AgentDetailModal: React.FC<{ agent: Agent | null; onClose: () => void }> = ({ agent, onClose }) => {
  if (!agent) return null;
  const meta = statusMeta(agent);
  const StatusIcon = meta.icon;
  const ips = getIpList(agent);
  const type = getAgentType(agent);

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">Agent Detail</div>
            <h3 className="mt-2 truncate text-2xl font-bold text-theme-text-primary">{getAgentName(agent)}</h3>
            <div className="mt-2 break-all font-mono text-xs text-theme-text-muted">{getAgentKey(agent) || '-'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-secondary">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-auto p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
              <StatusIcon size={13} />
              {meta.label}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getAgentTypeClass(type)}`}>{getAgentTypeLabel(type)}</span>
            {getAgentVersion(agent) ? <span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 text-xs font-medium text-theme-text-secondary">v{getAgentVersion(agent)}</span> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <DetailItem label="主机名">{agent.hostname || '-'}</DetailItem>
            <DetailItem label="所属项目">{agent.project_id || '-'}</DetailItem>
            <DetailItem label="IP 地址">{ips.length ? <div className="flex flex-wrap gap-1.5">{ips.map((ip) => <span key={ip} className="rounded-md bg-theme-surface px-2 py-1 font-mono text-xs text-theme-text-secondary ring-1 ring-theme-border">{ip}</span>)}</div> : '-'}</DetailItem>
            <DetailItem label="进程 ID">{String((agent as any).pid || '-')}</DetailItem>
            <DetailItem label="注册时间">{formatTime(getAgentCreatedAt(agent))}</DetailItem>
            <DetailItem label="更新时间">{formatTime(getAgentUpdatedAt(agent))}</DetailItem>
            <DetailItem label="最近心跳">{formatTime(agent.last_seen)}</DetailItem>
            <DetailItem label="说明">{agent.status_reason || (agent as any).description || '-'}</DetailItem>
          </div>
        </div>
      </div>
    </div>
  );
};

const normalizeRouteProcessType = (route: ArchitectureRoute): string => String(route.processType || route.process_type || '');

const getRouteMethod = (route: ArchitectureRoute): string => String(route.method || route.httpMethod || 'ANY');

const getRoutePath = (route: ArchitectureRoute): string => String(route.pattern || route.path || '-');

const getRouteName = (route: ArchitectureRoute): string => String(route.name || '');

const getRouteHandler = (route: ArchitectureRoute): string => String(route.handler || '');

const uniqueRouteValues = (routes: ArchitectureRoute[], getter: (route: ArchitectureRoute) => unknown): string => uniqueStrings(routes.map(getter)).join(', ');

const countRoutesByType = (routes: ArchitectureRoute[], type: string): number => routes.filter((route) => normalizeRouteProcessType(route).includes(type)).length;

type ArchitectureTab = 'overview' | 'container' | 'framework' | 'database' | 'sca';

const FlowNode: React.FC<{
  icon: React.ReactNode;
  label: string;
  tone: string;
  badge?: string;
  stats?: string[];
}> = ({ icon, label, tone, badge, stats = [] }) => (
  <div className={`flex min-w-[140px] shrink-0 flex-col items-center rounded-xl px-4 py-3 ${tone}`}>
    <div className="flex flex-col items-center gap-1">
      <div>{icon}</div>
      <div className="text-sm font-medium">{label}</div>
      {badge ? <div className="rounded bg-white/60 px-2 py-0.5 text-[11px] text-theme-text-secondary">{badge}</div> : null}
      {stats.length > 0 ? (
        <div className="mt-1 flex flex-col items-center gap-1">
          {stats.map((item) => <span key={item} className="rounded border border-white/60 bg-white/60 px-2 py-0.5 text-[11px] text-theme-text-secondary">{item}</span>)}
        </div>
      ) : null}
    </div>
  </div>
);

const DescriptionGrid: React.FC<{ items: Array<{ label: string; value: React.ReactNode; span?: boolean }> }> = ({ items }) => (
  <div className="grid overflow-hidden rounded border border-theme-border md:grid-cols-3">
    {items.map((item) => (
      <div key={item.label} className={`${item.span ? 'md:col-span-3' : ''} grid grid-cols-[110px_minmax(0,1fr)] border-b border-r border-theme-border last:border-b-0`}>
        <div className="bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-muted">{item.label}</div>
        <div className="break-words px-3 py-2 text-xs text-theme-text-primary">{item.value || '-'}</div>
      </div>
    ))}
  </div>
);

const ArchitectureOverview: React.FC<{ routes: ArchitectureRoute[]; agent: Agent }> = ({ routes, agent }) => {
  const appType = uniqueRouteValues(routes, (route) => route.appType || route.app_type).split(', ')[0] || '';
  const frameworkType = uniqueRouteValues(routes, (route) => route.frameworkType || route.framework_type);
  const connector = uniqueRouteValues(routes, (route) => route.connector);
  const context = uniqueRouteValues(routes, (route) => route.context);
  const docbase = uniqueRouteValues(routes, (route) => route.docbase);
  const filterCount = countRoutesByType(routes, 'Filter');
  const servletCount = countRoutesByType(routes, 'Servlet');
  const controllerCount = countRoutesByType(routes, 'Controller');
  const interceptorCount = countRoutesByType(routes, 'Interceptor');
  const handlerAdapterCount = countRoutesByType(routes, 'HandlerAdapter');
  const ips = getIpList(agent);

  const stats = [
    { label: 'Filters', value: filterCount, icon: <Filter size={18} /> },
    { label: 'Servlets', value: servletCount, icon: <FileText size={18} /> },
    { label: 'Controllers', value: controllerCount, icon: <Settings size={18} /> },
    { label: 'Interceptors', value: interceptorCount, icon: <Network size={18} /> },
    { label: 'Handler Adapters', value: handlerAdapterCount, icon: <Cpu size={18} /> },
    { label: 'SCA Components', value: 0, icon: <Box size={18} /> },
    { label: 'DataSources', value: 0, icon: <Database size={18} /> },
    { label: '总路由数', value: routes.length, icon: <FileText size={18} /> },
  ];

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-start gap-2 overflow-x-auto py-2">
        <FlowNode icon={<Monitor size={32} />} label="客户端" tone="bg-violet-500/15 text-violet-400" />
        <div className="text-xl text-theme-text-muted">→</div>
        <FlowNode icon={<Network size={32} />} label="端口" badge={connector} tone="bg-cyan-500/15 text-cyan-400" />
        <div className="text-xl text-theme-text-muted">→</div>
        <FlowNode icon={<Settings size={32} />} label={appType || 'Web容器'} stats={[`Filters: ${filterCount}`, `Servlets: ${servletCount}`]} tone="bg-amber-500/15 text-amber-400" />
        <div className="text-xl text-theme-text-muted">→</div>
        <FlowNode icon={<Cpu size={32} />} label={frameworkType || 'Web框架'} stats={[`Controllers: ${controllerCount}`, ...(interceptorCount > 0 ? [`Interceptors: ${interceptorCount}`] : [])]} tone="bg-emerald-500/15 text-emerald-400" />
        <div className="text-xl text-theme-text-muted">→</div>
        <FlowNode icon={<Box size={32} />} label="SCA" stats={['Components: 0']} tone="bg-theme-elevated text-theme-text-secondary" />
        <div className="text-xl text-theme-text-muted">→</div>
        <FlowNode icon={<Database size={32} />} label="数据库" stats={['DataSources: 0']} tone="bg-rose-500/15 text-rose-400" />
      </div>

      <div className="border-t border-theme-border" />

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-theme-text-secondary">Agent信息</h4>
        <DescriptionGrid
          items={[
            { label: 'Agent ID', value: getAgentKey(agent) || '-' },
            { label: '名称', value: getAgentName(agent) },
            { label: '主机名', value: agent.hostname || '-' },
            { label: 'IP地址', value: ips.join(', ') || '-' },
            { label: '描述', value: agent.status_reason || (agent as any).description || '-', span: true },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-theme-text-secondary">应用信息</h4>
        <DescriptionGrid
          items={[
            { label: '应用类型', value: appType || '-' },
            { label: '框架类型', value: frameworkType || '-' },
            { label: '连接器', value: connector || '-' },
            { label: '上下文', value: context || '-' },
            { label: '文档根目录', value: docbase || '-' },
            { label: 'SCA组件数', value: 0 },
            { label: '总路由数', value: routes.length },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-theme-text-secondary">组件统计</h4>
        <div className="grid gap-3 md:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded border border-theme-border bg-theme-surface px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-theme-text-muted">{item.icon}{item.label}</div>
              <div className="mt-2 text-2xl font-bold text-theme-text-primary">{item.value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const RouteTableWithSearch: React.FC<{
  title: string;
  icon: React.ReactNode;
  placeholder: string;
  routes: ArchitectureRoute[];
}> = ({ title, icon, placeholder, routes }) => {
  const [searchValue, setSearchValue] = useState('');
  const filteredRoutes = useMemo(() => {
    const term = searchValue.trim().toLowerCase();
    if (!term) return routes;
    return routes.filter((route) => [
      getRouteMethod(route),
      getRoutePath(route),
      getRouteHandler(route),
      getRouteName(route),
      route.description,
    ].join(' ').toLowerCase().includes(term));
  }, [routes, searchValue]);

  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
        {icon}
        {title} ({routes.length})
      </h4>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={placeholder}
          className="form-input w-full pl-8 text-xs"
        />
      </div>
      <div className="overflow-hidden rounded border border-theme-border">
        <table className="min-w-full table-fixed text-left text-xs">
          <thead className="bg-theme-bg-app text-theme-text-muted">
            <tr>
              <th className="w-24 px-3 py-2 font-semibold">Method</th>
              <th className="px-3 py-2 font-semibold">Pattern</th>
              <th className="px-3 py-2 font-semibold">Handler</th>
              <th className="px-3 py-2 font-semibold">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border">
            {filteredRoutes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-theme-text-muted">暂无数据</td>
              </tr>
            ) : filteredRoutes.map((route, index) => (
              <tr key={route.id || `${title}-${index}`} className="odd:bg-theme-surface even:bg-slate-50/60">
                <td className="truncate px-3 py-2 font-semibold text-cyan-400">{getRouteMethod(route)}</td>
                <td className="truncate px-3 py-2 font-mono text-theme-text-secondary" title={getRoutePath(route)}>{getRoutePath(route)}</td>
                <td className="truncate px-3 py-2 font-mono text-theme-text-secondary" title={getRouteHandler(route)}>{getRouteHandler(route) || '-'}</td>
                <td className="truncate px-3 py-2 text-theme-text-secondary" title={getRouteName(route)}>{getRouteName(route) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const WebContainerArchitectureTab: React.FC<{ filters: ArchitectureRoute[]; servlets: ArchitectureRoute[] }> = ({ filters, servlets }) => (
  <div className="space-y-6 p-5">
    <RouteTableWithSearch title="Filters" icon={<Filter size={16} />} placeholder="搜索过滤器" routes={filters} />
    <RouteTableWithSearch title="Servlets" icon={<FileText size={16} />} placeholder="搜索Servlet" routes={servlets} />
  </div>
);

const WebFrameworkArchitectureTab: React.FC<{
  controllers: ArchitectureRoute[];
  interceptors: ArchitectureRoute[];
  handlerAdapters: ArchitectureRoute[];
}> = ({ controllers, interceptors, handlerAdapters }) => (
  <div className="space-y-6 p-5">
    {controllers.length > 0 ? <RouteTableWithSearch title="Controllers" icon={<Settings size={16} />} placeholder="搜索控制器" routes={controllers} /> : null}
    {interceptors.length > 0 ? <RouteTableWithSearch title="Interceptors" icon={<Network size={16} />} placeholder="搜索拦截器" routes={interceptors} /> : null}
    {handlerAdapters.length > 0 ? <RouteTableWithSearch title="Handler Adapters" icon={<Cpu size={16} />} placeholder="搜索处理器适配器" routes={handlerAdapters} /> : null}
    {controllers.length === 0 && interceptors.length === 0 && handlerAdapters.length === 0 ? (
      <div className="px-6 py-16 text-center text-sm text-theme-text-muted">暂无Web框架数据</div>
    ) : null}
  </div>
);

const EmptyArchitectureTab: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-sm text-theme-text-muted">
    <div className="mb-3 text-theme-text-faint">{icon}</div>
    {label}
  </div>
);

const ArchitectureTabs: React.FC<{
  activeTab: ArchitectureTab;
  onChange: (tab: ArchitectureTab) => void;
}> = ({ activeTab, onChange }) => {
  const tabs: Array<{ id: ArchitectureTab; label: string }> = [
    { id: 'overview', label: '总览' },
    { id: 'container', label: 'Web容器' },
    { id: 'framework', label: 'Web框架' },
    { id: 'database', label: '数据库' },
    { id: 'sca', label: 'SCA' },
  ];
  return (
    <div className="border-b border-theme-border bg-theme-bg-app">
      <div className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`border-r border-theme-border px-5 py-3 text-sm font-medium transition ${activeTab === tab.id ? 'bg-theme-surface text-cyan-400' : 'text-theme-text-secondary hover:bg-white/70 hover:text-theme-text-primary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const ProcessArchitectureContent: React.FC<{
  routes: ArchitectureRoute[];
  agent: Agent;
  activeTab: ArchitectureTab;
}> = ({ routes, agent, activeTab }) => {
  const filters = routes.filter((route) => normalizeRouteProcessType(route).includes('Filter'));
  const servlets = routes.filter((route) => normalizeRouteProcessType(route).includes('Servlet'));
  const controllers = routes.filter((route) => normalizeRouteProcessType(route).includes('Controller'));
  const interceptors = routes.filter((route) => normalizeRouteProcessType(route).includes('Interceptor'));
  const handlerAdapters = routes.filter((route) => normalizeRouteProcessType(route).includes('HandlerAdapter'));

  if (activeTab === 'overview') return <ArchitectureOverview routes={routes} agent={agent} />;
  if (activeTab === 'container') return <WebContainerArchitectureTab filters={filters} servlets={servlets} />;
  if (activeTab === 'framework') return <WebFrameworkArchitectureTab controllers={controllers} interceptors={interceptors} handlerAdapters={handlerAdapters} />;
  if (activeTab === 'database') return <EmptyArchitectureTab icon={<Database size={28} />} label="暂无数据库数据" />;
  return <EmptyArchitectureTab icon={<Box size={28} />} label="暂无 SCA 数据" />;
};

const ProcessArchitectureModal: React.FC<{
  agent: Agent | null;
  projectId: string;
  onClose: () => void;
  notify: (message: string, level?: 'info' | 'success' | 'warning' | 'error', title?: string) => void;
}> = ({ agent, projectId, onClose, notify }) => {
  const [routes, setRoutes] = useState<ArchitectureRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ArchitectureTab>('overview');

  const loadRoutes = useCallback(async (isRefresh = false) => {
    if (!agent || !projectId) return;
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const nextRoutes = await fetchArchitectureRoutes(projectId, getAgentKey(agent));
      setRoutes(nextRoutes);
    } catch (err: any) {
      const message = err?.message || '加载进程架构失败';
      setRoutes([]);
      setError(message);
      notify(message, 'error');
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, [agent, notify, projectId]);

  useEffect(() => {
    setActiveTab('overview');
    void loadRoutes(false);
  }, [loadRoutes]);

  useEffect(() => {
    if (!agent || !projectId) return undefined;
    const timer = window.setInterval(() => {
      void loadRoutes(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [agent, loadRoutes, projectId]);

  if (!agent) return null;

  return (
    <div className="fixed inset-0 z-[270] flex items-start justify-center bg-slate-950/60 p-6 pt-[5vh] backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-[90vw] max-w-none flex-col overflow-hidden rounded border border-theme-border bg-theme-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-theme-border bg-theme-surface px-5 py-4">
          <h3 className="truncate text-lg font-semibold text-theme-text-primary">进程架构 - {getAgentName(agent)}</h3>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => loadRoutes(false)} disabled={loading} className="inline-flex items-center gap-2 rounded border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-secondary transition hover:bg-theme-bg-app disabled:opacity-60">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
            <button type="button" onClick={onClose} className="rounded p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-secondary">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="architecture-content max-h-[70vh] min-h-[400px] overflow-y-auto bg-theme-surface">
          {error ? <div className="m-5 rounded border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div> : null}
          {loading ? (
            <div className="space-y-4 p-10">
              {Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-5 animate-pulse rounded bg-theme-elevated" />)}
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-sm text-theme-text-muted">
              <GitBranch size={28} className="mb-3 text-theme-text-faint" />
              <div className="font-semibold text-theme-text-secondary">暂无进程架构数据</div>
              <div className="mt-1">请确认 Java Agent 在线且已完成 Web 应用采集。</div>
            </div>
          ) : (
            <>
              <ArchitectureTabs activeTab={activeTab} onChange={setActiveTab} />
              <ProcessArchitectureContent routes={routes} agent={agent} activeTab={activeTab} />
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-theme-border bg-theme-surface px-5 py-3">
          <button type="button" onClick={onClose} className="rounded border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary transition hover:bg-theme-bg-app">关闭</button>
        </div>
      </div>
    </div>
  );
};

export const EnvManagementPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const environmentApi = api.domains.environment;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => (typeof window === 'undefined' ? '' : localStorage.getItem('env_management_status_filter') || ''));
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [architectureAgent, setArchitectureAgent] = useState<Agent | null>(null);
  const [expandedAgentKeys, setExpandedAgentKeys] = useState<Set<string>>(new Set());

  const loadAgents = useCallback(async (manual = false, silent = false) => {
    if (!projectId) {
      setAgents([]);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      let nextAgents: Agent[] = [];
      try {
        nextAgents = await fetchTestEnvAgents(projectId);
      } catch (testEnvError) {
        const fallback = await environmentApi.environment.getAgents(projectId, { page: 1, per_page: 1000 });
        nextAgents = fallback?.agents || [];
        if (manual) notify('已从环境 Agent 接口刷新数据', 'success');
        setAgents(nextAgents);
        return;
      }
      setAgents(nextAgents);
      if (manual) notify('已刷新测试环境 Agent 状态', 'success');
    } catch (err: any) {
      const message = err?.message || '加载测试环境 Agent 失败';
      setAgents([]);
      setError(message);
      notify(message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [environmentApi.environment, notify, projectId]);

  useEffect(() => {
    void loadAgents(false);
  }, [loadAgents]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchText(searchText.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!statusFilter) {
      localStorage.removeItem('env_management_status_filter');
      return;
    }
    localStorage.setItem('env_management_status_filter', statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (!autoRefresh || !projectId) return undefined;
    const timer = window.setInterval(() => {
      void loadAgents(false, true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadAgents, projectId]);

  const projectAgents = useMemo(() => agents, [agents]);
  const agentTypes = useMemo(() => Array.from(new Set(projectAgents.map(getAgentType).filter(Boolean))).sort(), [projectAgents]);
  const agentMatcher = useCallback((agent: Agent) => {
    if (typeFilter && getAgentType(agent) !== typeFilter) return false;
    if (statusFilter === 'online' && !isOnline(agent)) return false;
    if (statusFilter === 'offline' && isOnline(agent)) return false;
    if (statusFilter === 'unknown' && ['online', 'offline', 'error', 'timeout', 'healthy', 'ready'].includes(normalizeStatus(agent.status))) return false;
    if (debouncedSearchText) {
      const haystack = [
        getAgentKey(agent),
        getAgentName(agent),
        agent.hostname,
        agent.ip_address,
        getAgentVersion(agent),
        getAgentTypeLabel(getAgentType(agent)),
        agent.status,
      ].join(' ').toLowerCase();
      if (!haystack.includes(debouncedSearchText)) return false;
    }
    return true;
  }, [debouncedSearchText, statusFilter, typeFilter]);
  const hasActiveAgentFilter = Boolean(typeFilter || statusFilter || debouncedSearchText);
  const treeRows = useMemo(
    () => buildAgentTreeRows(projectAgents, agentMatcher, expandedAgentKeys, hasActiveAgentFilter),
    [agentMatcher, expandedAgentKeys, hasActiveAgentFilter, projectAgents],
  );
  const filteredAgents = useMemo(() => treeRows.map((row) => row.agent), [treeRows]);
  const childCountByParent = useMemo(() => {
    const byKey = new Map<string, Agent>();
    projectAgents.forEach((agent) => {
      getAgentIdentityKeys(agent).forEach((key) => byKey.set(key, agent));
    });
    return projectAgents.reduce((acc, agent) => {
      const parentKey = getAgentParentKey(agent);
      const parent = parentKey ? byKey.get(parentKey) : null;
      const canonicalParentKey = parent ? getAgentKey(parent) : '';
      if (!canonicalParentKey) return acc;
      acc.set(canonicalParentKey, (acc.get(canonicalParentKey) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }, [projectAgents]);
  const parentCount = childCountByParent.size;
  const childCount = Array.from(childCountByParent.values()).reduce((sum, count) => sum + count, 0);
  const onlineCount = projectAgents.filter(isOnline).length;
  const offlineCount = projectAgents.filter((agent) => !isOnline(agent)).length;
  const latestSeen = projectAgents.map((agent) => agent.last_seen).filter(Boolean).sort().at(-1);
  const parentAgentKeys = useMemo(() => Array.from(childCountByParent.keys()), [childCountByParent]);
  const allParentsExpanded = parentAgentKeys.length > 0 && parentAgentKeys.every((key) => expandedAgentKeys.has(key));
  const toggleExpanded = useCallback((agentKey: string) => {
    setExpandedAgentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });
  }, []);
  const toggleAllExpanded = useCallback(() => {
    setExpandedAgentKeys((prev) => {
      if (parentAgentKeys.length === 0) return prev;
      if (parentAgentKeys.every((key) => prev.has(key))) return new Set();
      return new Set(parentAgentKeys);
    });
  }, [parentAgentKeys]);

  return (
    <div className="min-h-full bg-theme-bg-app px-8 py-8">
      {feedbackNodes}
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="环境管理"
          description="查看当前项目已上线的 Agent、运行状态和最近心跳。该页面为独立入口，不影响现有环境管理页面。"
          actions={<button type="button" onClick={() => loadAgents(true)} disabled={!projectId || loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-4 py-2 text-sm font-medium text-theme-text-secondary shadow-sm transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}刷新</button>}
        />

        {error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Agent 总数" value={projectAgents.length} hint="当前项目可见 Agent" />
          <StatCard label="在线 Agent" value={onlineCount} hint="可执行任务的在线节点" tone="text-emerald-400" />
          <StatCard label="离线/异常" value={offlineCount} hint="需要关注的节点" tone={offlineCount > 0 ? 'text-rose-400' : 'text-theme-text-primary'} />
          <StatCard label="最近心跳" value={<span className="text-lg">{formatTime(latestSeen)}</span>} hint="按 Agent last_seen 汇总" />
        </div>

        <section className="overflow-hidden rounded-xl border border-theme-border bg-theme-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-theme-border px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-theme-text-primary">上线 Agent</h2>
                <p className="mt-1 text-sm text-theme-text-muted">环境接入完成后，Agent 会在这里进行统一查看。</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-xs font-medium text-theme-text-muted">
                  显示 {filteredAgents.length} / {projectAgents.length}，父 {parentCount}，子 {childCount}
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-theme-text-secondary">
                  <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} className="h-4 w-4 rounded border-theme-border" />
                  自动刷新
                </label>
                <button
                  type="button"
                  onClick={toggleAllExpanded}
                  disabled={parentAgentKeys.length === 0}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-theme-text-secondary transition hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {allParentsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {allParentsExpanded ? '收起全部' : '展开全部'}
                </button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)_auto]">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="form-select">
                <option value="">全部类型</option>
                {agentTypes.map((type) => <option key={type} value={type}>{getAgentTypeLabel(type)}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="form-select">
                <option value="">全部状态</option>
                <option value="online">在线</option>
                <option value="offline">离线/异常</option>
                <option value="unknown">未知</option>
              </select>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜索 ID / 名称 / 主机名 / IP / 版本..."
                  className="form-input w-full pl-9"
                />
              </div>
              <button
                type="button"
                onClick={() => { setTypeFilter(''); setStatusFilter(''); setSearchText(''); }}
                className="rounded-lg border border-theme-border bg-theme-surface px-4 py-2 text-sm font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
              >
                重置
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm font-semibold text-theme-text-muted">
              <Loader2 size={18} className="animate-spin" />
              正在加载 Agent 状态...
            </div>
          ) : projectAgents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-theme-elevated text-theme-text-muted">
                <Bot size={22} />
              </div>
              <div className="mt-4 text-base font-semibold text-theme-text-primary">暂无上线 Agent</div>
              <div className="mt-2 text-sm text-theme-text-muted">请先在环境接入页面完成节点部署。</div>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-theme-elevated text-theme-text-muted">
                <Search size={22} />
              </div>
              <div className="mt-4 text-base font-semibold text-theme-text-primary">没有匹配的 Agent</div>
              <div className="mt-2 text-sm text-theme-text-muted">请调整类型、状态或搜索条件。</div>
            </div>
          ) : (
            <AgentTreeTable
              rows={treeRows}
              childCountByParent={childCountByParent}
              expandedKeys={expandedAgentKeys}
              onToggleExpand={toggleExpanded}
              onOpenDetail={setSelectedAgent}
              onOpenArchitecture={setArchitectureAgent}
            />
          )}
        </section>
      </div>
      <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      <ProcessArchitectureModal agent={architectureAgent} projectId={projectId} onClose={() => setArchitectureAgent(null)} notify={notify} />
    </div>
  );
};