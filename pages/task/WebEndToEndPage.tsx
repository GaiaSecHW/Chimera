import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../design-system';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Globe,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Share2,
  Terminal,
  Save,
  X,
  XCircle,
} from 'lucide-react';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { Agent, AsyncTask } from '../../types/types';

const WEB_E2E_API_BASE =`${API_BASE}/api/app/web-e2e`;
type DeployMode = 'normal' | 'proxy' | 'k8s';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

type LoadState = {
  loading: boolean;
  error: string | null;
};

type WebRoute = {
  id?: string | number;
  agent_id?: string;
  agent_key?: string;
  app_type?: string;
  framework_type?: string;
  context?: string;
  path?: string;
  route?: string;
  method?: string;
  connector?: string;
  connectors?: string;
  docbase?: string;
  docbases?: string;
  updated_at?: string;
  collected_at?: string;
};

type ProjectAccessInfo = {
  description: string;
  updated_at?: string;
};

type ProgressStageStatus = 'waiting' | 'running' | 'success' | 'failed';

type ProgressStage = {
  id: string;
  label: string;
  description: string;
  status: ProgressStageStatus;
  updatedAt?: string;
};

const ACTIVE_TASK_STATUSES = new Set(['pending', 'running', 'processing', 'queued', 'created', 'in_progress']);
const FAILED_TASK_STATUSES = new Set(['failed', 'error', 'timeout']);
const SUCCESS_TASK_STATUSES = new Set(['success', 'succeeded', 'completed', 'done', 'finished']);
const WEB_ANALYSIS_TASK_TYPES = ['web', 'iast', 'vuln', 'scan', 'analysis', 'analyze', 'route'];

const STAGE_DEFS: Array<Omit<ProgressStage, 'status' | 'updatedAt'>> = [
  { id: 'env', label: '环境确认', description: '确认项目环境和 Agent 心跳可用。' },
  { id: 'webapp', label: 'Web 应用识别', description: '识别 Java Web 应用、上下文和运行框架。' },
  { id: 'route', label: '路由/接口采集', description: '采集 Web 路由、接口入口和访问路径。' },
  { id: 'analysis', label: '安全分析', description: '执行端到端安全分析并整理过程结果。' },
  { id: 'ai', label: 'AI 研判', description: '聚合证据并生成可读结论。' },
  { id: 'result', label: '结果生成', description: '汇总分析状态和可查看的过程结论。' },
];

const formatTime = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
};

const getPublicWebE2EBase = (): string =>`${window.location.origin}${WEB_E2E_API_BASE}`;

const buildDeployScripts = (projectId: string) => {
  const baseUrl = getPublicWebE2EBase();
  const installUrl =`${baseUrl}/agents/install?project_id=${encodeURIComponent(projectId)}&type=normal&gaiasec_dir=/gaiasec`;
  const normalScript =`curl -ks -o start.sh '${installUrl}' && bash start.sh deploy`;
  const proxyScript =`curl -ks -o start.sh '${baseUrl}/agents/install?project_id=${encodeURIComponent(projectId)}&type=proxy&gaiasec_dir=/gaiasec' && bash start.sh deploy`;
  const k8sDaemonSetYaml =`apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: gaiasec
  namespace: default
spec:
  selector:
    matchLabels:
      name: gaiasec
  template:
    metadata:
      labels:
        name: gaiasec
    spec:
      hostIPC: true
      hostPID: true
      hostNetwork: true
      containers:
      - name: gaiasec-pod
        resources:
          limits:
            cpu:"1"
            memory:"500Mi"
        command:
        - /bin/sh
        - -c
        - chroot /hostfs /bin/bash -c"cd / && curl -ks -o start.sh '${installUrl}' && bash start.sh && tail -f /dev/null"
        image: docker.io/alpine:3.13
        securityContext:
          privileged: true
          runAsUser: 0
          runAsGroup: 0
        volumeMounts:
        - mountPath: /hostfs
          name: hostfs
      volumes:
      - name: hostfs
        hostPath:
          path: /`;
  return { normalScript, proxyScript, k8sDaemonSetYaml };
};

const normalizeText = (value: unknown): string => String(value || '').trim();

const getAgentKey = (agent: Agent): string => agent.key || (agent as any).agent_key || (agent as any).id || '';

const getAgentName = (agent: Agent): string => agent.full_name || agent.hostname || getAgentKey(agent) || '未命名 Agent';

const isAgentOnline = (agent: Agent): boolean => {
  if (agent.is_offline) return false;
  return ['online', 'healthy', 'ready'].includes(String(agent.status || '').toLowerCase());
};

const getTaskTime = (task?: AsyncTask | null): string => task?.completed_at || task?.started_at || task?.created_at || task?.create_time || '';

const getStatusLabel = (status?: string): string => {
  const key = String(status || '').toLowerCase();
  const labels: Record<string, string> = {
    online: '在线',
    offline: '离线',
    error: '异常',
    timeout: '超时',
    unknown: '未知',
    pending: '等待中',
    running: '执行中',
    processing: '执行中',
    queued: '排队中',
    success: '成功',
    succeeded: '成功',
    completed: '完成',
    done: '完成',
    failed: '失败',
    high: '高危',
    critical: '严重',
    medium: '中危',
    low: '低危',
    info: '信息',
    informational: '信息',
  };
  return labels[key] || status || '-';
};

const statusBadgeStyle = (status?: string): { bg: string; color: string; border: string } => {
  const key = String(status || '').toLowerCase();
  if (['online', 'success', 'succeeded', 'completed', 'done', 'healthy'].includes(key)) return { bg: 'rgba(69, 192, 111, 0.14)', color: LK.success, border: 'rgba(69, 192, 111, 0.3)' };
  if (['running', 'processing', 'pending', 'queued', 'in_progress'].includes(key)) return { bg: 'rgba(79, 115, 255, 0.14)', color: LK.primary, border: 'rgba(79, 115, 255, 0.3)' };
  if (['failed', 'error', 'timeout', 'offline'].includes(key)) return { bg: 'rgba(241, 93, 93, 0.14)', color: LK.error, border: 'rgba(241, 93, 93, 0.3)' };
  return { bg: LK.surfaceRaised, color: LK.muted, border: LK.borderSoft };
};

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

const requestGaia = async (url: string, init?: RequestInit): Promise<any> => {
  const raw = await handleResponse(await fetch(url, { ...init, headers: { ...getHeaders(), ...(init?.headers || {}) } }));
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    if (raw.success === false) throw new Error(raw.message || 'gaiasec API 请求失败');
    return raw.data;
  }
  return raw;
};

const normalizeGaiaAgent = (item: any): Agent => {
  const source = item?.agent || item;
  return {
    key: source?.key || source?.id || source?.agent_id || '',
    hostname: source?.hostname || source?.name || source?.id || '',
    full_name: source?.full_name || source?.name || source?.description || source?.hostname || source?.id || '',
    status: source?.status || 'unknown',
    ip_address: source?.ip_address || source?.ip_addresses || '',
    system_info: source?.system_info,
    project_id: source?.project_id,
    last_seen: source?.last_seen || source?.updated_at || source?.update_at || source?.created_at,
    status_reason: source?.status_reason || null,
    services: source?.services,
    is_offline: ['offline', 'error', 'timeout'].includes(String(source?.status || '').toLowerCase()),
    allow_reason: item?.progress ? JSON.stringify(item.progress) : undefined,
  };
};

const normalizeGaiaTask = (item: any): AsyncTask => ({
  id: item?.id || item?.task_id || '',
  type: item?.type || item?.task_type || item?.node_name || '',
  status: item?.status || 'pending',
  service_name: item?.service_name || item?.workflow_instance_id || '',
  progress: typeof item?.progress === 'number' ? item.progress : Number(item?.progress || 0),
  create_time: item?.create_time || item?.created_at || '',
  agent_key: item?.agent_key || item?.agent_id || '',
  agent_hostname: item?.agent_hostname || item?.hostname || '',
  full_name: item?.full_name || '',
  project_id: item?.project_id || '',
  message: item?.message || item?.error_message || '',
  created_at: item?.created_at || item?.create_time || '',
  started_at: item?.started_at || '',
  completed_at: item?.completed_at || '',
  log_count: typeof item?.log_count === 'number' ? item.log_count : Number(item?.log_count || 0),
});

const fetchGaiaAgents = async (projectId: string): Promise<Agent[]> => {
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/agents/projects/${encodeURIComponent(projectId)}`);
  return extractArray(raw, ['items', 'agents', 'records', 'data']).map(normalizeGaiaAgent);
};

const fetchGaiaTasks = async (projectId: string): Promise<AsyncTask[]> => {
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/tasks/projects/${encodeURIComponent(projectId)}?page=1&page_size=50`);
  return extractArray(raw, ['items', 'tasks', 'records', 'data']).map(normalizeGaiaTask);
};

const normalizeRoute = (item: any): WebRoute => ({
  id: item?.id,
  agent_id: item?.agent_id || item?.agent_key,
  agent_key: item?.agent_key || item?.agent_id,
  app_type: item?.app_type,
  framework_type: item?.framework_type,
  context: item?.context,
  path: item?.path,
  route: item?.route || item?.pattern,
  method: item?.method,
  connector: item?.connector,
  connectors: item?.connectors,
  docbase: item?.docbase,
  docbases: item?.docbases,
  updated_at: item?.updated_at,
  collected_at: item?.collected_at,
});

const normalizeProjectDescription = (raw: any): ProjectAccessInfo => {
  const source = raw?.project || raw;
  return {
    description: String(source?.description || ''),
    updated_at: source?.updated_at || source?.updatedAt,
  };
};

const fetchProjectAccessInfo = async (projectId: string): Promise<ProjectAccessInfo> => {
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/projects/${encodeURIComponent(projectId)}`);
  return normalizeProjectDescription(raw || {});
};

const saveProjectAccessInfo = async (projectId: string, payload: ProjectAccessInfo): Promise<ProjectAccessInfo> => {
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    body: JSON.stringify({ description: payload.description }),
  });
  return normalizeProjectDescription(raw || payload);
};

const fetchWebRoutes = async (projectId: string, agentKey?: string): Promise<WebRoute[]> => {
  const queries = [
    agentKey
      ?`${WEB_E2E_API_BASE}/agents/${encodeURIComponent(agentKey)}/routes`
      : '',
    agentKey
      ?`${WEB_E2E_API_BASE}/agents/${encodeURIComponent(agentKey)}/web-routes?project_id=${encodeURIComponent(projectId)}`
      :`${WEB_E2E_API_BASE}/web-routes?project_id=${encodeURIComponent(projectId)}`,
  ];

  for (const url of queries) {
    if (!url) continue;
    try {
      const raw = await requestGaia(url);
      return extractArray(raw, ['items', 'routes', 'web_routes']).map(normalizeRoute);
    } catch (error: any) {
      if (error?.status && error.status !== 404) throw error;
    }
  }
  return [];
};

const triggerWebAnalysis = async (projectId: string, agentKey: string): Promise<any> => {
  const payload = {
    project_id: projectId,
    agent_id: agentKey,
    agent_key: agentKey,
    workflow_type: 'web_e2e_analysis',
    trigger_source: 'chimera_web_e2e',
  };
  const urls = [`${WEB_E2E_API_BASE}/analysis`,
  ];
  let lastError: any = null;
  for (const url of urls) {
    try {
      return await requestGaia(url, { method: 'POST', body: JSON.stringify(payload) });
    } catch (error: any) {
      lastError = error;
      if (error?.status && error.status !== 404 && error.status !== 410) throw error;
    }
  }
  throw lastError || new Error('当前后端未提供 WEB 端到端分析触发接口');
};

const pickCurrentTask = (tasks: AsyncTask[], selectedAgentId: string): AsyncTask | null => {
  const filtered = tasks
    .filter((task) => !selectedAgentId || task.agent_key === selectedAgentId || (task as any).agent_id === selectedAgentId)
    .filter((task) => {
      const fingerprint =`${task.type} ${task.service_name} ${task.message}`.toLowerCase();
      return WEB_ANALYSIS_TASK_TYPES.some((keyword) => fingerprint.includes(keyword));
    });
  const candidates = filtered.length ? filtered : tasks.filter((task) => !selectedAgentId || task.agent_key === selectedAgentId || (task as any).agent_id === selectedAgentId);
  return [...candidates].sort((a, b) => new Date(getTaskTime(b)).getTime() - new Date(getTaskTime(a)).getTime())[0] || null;
};

const buildProgressStages = (params: {
  selectedAgent?: Agent | null;
  routes: WebRoute[];
  task?: AsyncTask | null;
}): ProgressStage[] => {
  const { selectedAgent, routes, task } = params;
  const taskStatus = String(task?.status || '').toLowerCase();
  const progress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
  const failed = FAILED_TASK_STATUSES.has(taskStatus);
  const succeeded = SUCCESS_TASK_STATUSES.has(taskStatus);
  const running = ACTIVE_TASK_STATUSES.has(taskStatus);
  const updatedAt = getTaskTime(task) || selectedAgent?.last_seen || routes[0]?.updated_at || routes[0]?.collected_at;

  let completedCount = 0;
  if (selectedAgent && isAgentOnline(selectedAgent)) completedCount = 1;
  if (routes.length > 0) completedCount = Math.max(completedCount, 3);
  if (succeeded) completedCount = 6;
  if (running) completedCount = Math.max(completedCount, Math.min(5, Math.max(1, Math.ceil(progress / 20))));
  if (failed) completedCount = Math.max(1, Math.min(5, Math.max(completedCount, Math.ceil(progress / 20) || 1)));

  return STAGE_DEFS.map((stage, index) => {
    const position = index + 1;
    let status: ProgressStageStatus = 'waiting';
    if (position <= completedCount) status = 'success';
    if (running && position === Math.min(6, completedCount + 1)) status = 'running';
    if (failed && position === completedCount) status = 'failed';
    return { ...stage, status, updatedAt: position <= completedCount + 1 ? updatedAt : undefined };
  });
};

const StatusBadge: React.FC<{ status?: string; label?: string }> = ({ status, label }) => {
  const style = statusBadgeStyle(status);
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
      {['running', 'processing', 'pending', 'queued', 'in_progress'].includes(String(status || '').toLowerCase()) ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
      {label || getStatusLabel(status)}
    </span>
  );
};

const Panel: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, action, children }) => (
  <section className="overflow-hidden rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
      <div>
        <h2 className="text-base font-semibold leading-6" style={{ color: LK.ink }}>{title}</h2>
        {subtitle ? <p className="mt-1 text-sm" style={{ color: LK.muted }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const SummaryMetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon: React.ReactNode; tone?: 'slate' | 'emerald' | 'blue' | 'rose' | 'orange' }> = ({ label, value, hint, icon, tone = 'slate' }) => {
  const toneConfig = tone === 'emerald' ? { bg: 'rgba(69, 192, 111, 0.14)', color: LK.success, border: 'rgba(69, 192, 111, 0.3)' } : tone === 'blue' ? { bg: LK.primaryMuted, color: LK.primary, border: 'rgba(79, 115, 255, 0.3)' } : tone === 'rose' ? { bg: 'rgba(241, 93, 93, 0.14)', color: LK.error, border: 'rgba(241, 93, 93, 0.3)' } : tone === 'orange' ? { bg: 'rgba(213, 161, 58, 0.14)', color: LK.warning, border: 'rgba(213, 161, 58, 0.3)' } : { bg: LK.surfaceRaised, color: LK.muted, border: LK.borderSoft };
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: LK.mutedSoft }}>{label}</div>
          <div className="mt-2 text-2xl font-bold leading-7 tabular-nums" style={{ color: LK.ink }}>{value}</div>
        </div>
        <div className="rounded-lg p-2" style={{ backgroundColor: toneConfig.bg, color: toneConfig.color, border: `1px solid ${toneConfig.border}` }}>{icon}</div>
      </div>
      {hint ? <div className="mt-2 text-xs" style={{ color: LK.muted }}>{hint}</div> : null}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="rounded-xl px-5 py-8 text-center" style={{ border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised }}>
    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: LK.surface, color: LK.muted }}>{icon}</div>
    <div className="mt-3 text-sm font-semibold" style={{ color: LK.inkSoft }}>{title}</div>
    <div className="mt-1 text-sm" style={{ color: LK.body }}>{description}</div>
  </div>
);

const DeployScriptBlock: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  content: string;
  onCopy: () => void;
  compact?: boolean;
}> = ({ title, description, icon, content, onCopy, compact }) => (
  <div className="rounded-xl p-4" style={{ border: `1px solid ${LK.border}` }}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ backgroundColor: LK.primaryMuted, color: LK.primary, border: `1px solid ${LK.primary}40` }}>{icon}</div>
        <div>
          <div className="text-sm font-semibold" style={{ color: LK.ink }}>{title}</div>
          <div className="mt-1 text-sm" style={{ color: LK.body }}>{description}</div>
        </div>
      </div>
      <button className="btn-primary inline-flex shrink-0 items-center text-xs font-medium" onClick={onCopy}>
        <Copy size={13} className="mr-1" />
        复制
      </button>
    </div>
    <pre className={`mt-3 overflow-auto rounded-lg p-4 text-xs leading-5 ${compact ? 'max-h-44' : 'max-h-80'}`} style={{ backgroundColor: LK.surfaceRaised, color: LK.ink, border: `1px solid ${LK.border}`, fontFamily: MONO }}>
      {content}
    </pre>
  </div>
);

const DeployAgentDialog: React.FC<{
  open: boolean;
  projectId: string;
  onClose: () => void;
  onNotice: (message: string) => void;
}> = ({ open, projectId, onClose, onNotice }) => {
  const [activeTab, setActiveTab] = useState<'normal-node' | 'k8s-cluster'>('normal-node');
  const scripts = useMemo(() => buildDeployScripts(projectId), [projectId]);

  const handleCopy = async (mode: DeployMode) => {
    const text = mode === 'normal' ? scripts.normalScript : mode === 'proxy' ? scripts.proxyScript : scripts.k8sDaemonSetYaml;
    const ok = await copyText(text);
    onNotice(ok ? '已复制到剪贴板' : '复制失败，请手动复制命令');
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: LK.primary }}>
              <Terminal size={18} />
              一键部署测试节点
            </div>
            <h3 className="mt-2 text-xl font-semibold leading-7" style={{ color: LK.ink }}>部署方式选择</h3>
            <p className="mt-1 text-sm leading-6" style={{ color: LK.body }}>复制适合目标环境的部署命令，执行后上线 Agent 会自动出现在本页。</p>
          </div>
          <button className="rounded-lg p-2 transition-colors" style={{ border: `1px solid ${LK.border}`, color: LK.muted }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-4 pb-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div className="inline-flex rounded-xl p-1" style={{ backgroundColor: LK.surfaceRaised }}>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'normal-node' ? '' : ''}`}
              style={{ backgroundColor: activeTab === 'normal-node' ? LK.surface : 'transparent', color: activeTab === 'normal-node' ? LK.ink : LK.body }}
              onClick={() => setActiveTab('normal-node')}
            >
              普通节点部署
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'k8s-cluster' ? '' : ''}`}
              style={{ backgroundColor: activeTab === 'k8s-cluster' ? LK.surface : 'transparent', color: activeTab === 'k8s-cluster' ? LK.ink : LK.body }}
              onClick={() => setActiveTab('k8s-cluster')}
            >
              K8s集群部署
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          {activeTab === 'normal-node' ? (
            <div className="space-y-4">
              <p className="text-sm leading-6" style={{ color: LK.body }}>在目标节点上执行以下命令，即可自动下载、安装并启动测试节点。</p>
              <DeployScriptBlock
                title="普通模式部署"
                description="直接连接到服务器，适用于大多数场景。"
                icon={<Terminal size={18} />}
                content={scripts.normalScript}
                onCopy={() => handleCopy('normal')}
                compact
              />
              <DeployScriptBlock
                title="代理模式部署"
                description="通过代理服务器连接，适用于网络受限环境。"
                icon={<Share2 size={18} />}
                content={scripts.proxyScript}
                onCopy={() => handleCopy('proxy')}
                compact
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6" style={{ color: LK.body }}>在 K8s 集群中应用以下 DaemonSet 配置，即可在所有节点上部署测试节点。</p>
              <DeployScriptBlock
                title="K8s DaemonSet部署"
                description="通过 DaemonSet 在 K8s 集群的所有节点上部署测试节点。"
                icon={<Share2 size={18} />}
                content={scripts.k8sDaemonSetYaml}
                onCopy={() => handleCopy('k8s')}
              />
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" style={{ border: `1px solid ${LK.primary}40`, backgroundColor: LK.primaryMuted, color: LK.primary }}>
                <Info size={15} />
                使用命令：kubectl apply -f gaiasec-daemonset.yaml 部署到 K8s 集群
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AccessEnvironmentPanel: React.FC<{ projectId: string; agents: Agent[]; selectedAgent?: Agent | null; state: LoadState; onOpenDeploy: () => void }> = ({ projectId, agents, selectedAgent, state, onOpenDeploy }) => {
  const onlineCount = agents.filter(isAgentOnline).length;
  const accessStatus = state.error ? '异常' : agents.length === 0 ? '未接入' : onlineCount > 0 ? '已接入' : '接入中';
  const tone = state.error ? 'error' : onlineCount > 0 ? 'online' : agents.length > 0 ? 'pending' : 'unknown';
  const lastSeen = agents.map((agent) => agent.last_seen).filter(Boolean).sort().at(-1);

  return (
    <Panel
      title="接入环境"
      subtitle="选择单节点或 K8s 部署方式，将 Agent 接入当前项目。"
      action={(
        <button className="btn-primary inline-flex items-center text-sm font-medium" onClick={onOpenDeploy}>
          <Terminal size={15} className="mr-2" />
          接入环境
        </button>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg p-4" style={{ backgroundColor: LK.surfaceRaised }}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={tone} label={accessStatus} />
            {state.loading ? <span className="inline-flex items-center text-xs font-medium" style={{ color: LK.muted }}><Loader2 size={13} className="mr-1 animate-spin" />正在刷新</span> : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>项目 ID</div>
              <div className="mt-1 break-all text-sm font-medium" style={{ color: LK.ink, fontFamily: MONO }}>{projectId || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>接入目标</div>
              <div className="mt-1 break-all text-sm font-medium" style={{ color: LK.ink }}>{selectedAgent ? getAgentName(selectedAgent) : agents.length ? '项目默认环境' : '-'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>最近心跳</div>
              <div className="mt-1 text-sm font-medium" style={{ color: LK.ink }}>{formatTime(selectedAgent?.last_seen || lastSeen)}</div>
            </div>
          </div>
          {state.error ? <div className="mt-4 rounded-lg px-3 py-2 text-sm font-medium" style={{ border: `1px solid ${LK.error}40`, backgroundColor: 'rgba(241, 93, 93, 0.14)', color: LK.error }}>{state.error}</div> : null}
        </div>
        <div className="rounded-lg p-4" style={{ border: `1px solid ${LK.border}` }}>
          <div className="text-sm font-semibold" style={{ color: LK.ink }}>部署方式</div>
          <div className="mt-2 text-sm leading-6" style={{ color: LK.body }}>
            支持普通节点部署、代理模式部署和 K8s DaemonSet 部署。复制弹窗中的命令或 YAML 后在目标环境执行，Agent 上线后本页会自动展示状态、Web 应用和分析进度。
          </div>
          <button className="btn-secondary mt-4 inline-flex items-center text-xs font-medium" onClick={onOpenDeploy}>
            <Copy size={13} className="mr-1" />
            打开部署脚本
          </button>
        </div>
      </div>
    </Panel>
  );
};

const ProjectAccessInfoPanel: React.FC<{
  value: ProjectAccessInfo;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onChange: (value: ProjectAccessInfo) => void;
  onSave: () => void;
}> = ({ value, loading, saving, error, onChange, onSave }) => {
  const patch = (next: Partial<ProjectAccessInfo>) => onChange({ ...value, ...next });

  return (
    <Panel
      title="项目描述"
      subtitle="填写被测 Web 界面的访问 URL、账号密码和必要说明，供分析流程使用。"
      action={(
        <button
          className="btn-primary inline-flex items-center text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || loading}
          onClick={onSave}
        >
          {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
          保存配置
        </button>
      )}
    >
      {error ? <div className="mb-4 rounded-lg px-3 py-2 text-sm font-medium" style={{ border: `1px solid ${LK.error}40`, backgroundColor: 'rgba(241, 93, 93, 0.14)', color: LK.error }}>{error}</div> : null}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>Description</span>
        <textarea
          className="mt-2 min-h-40 w-full resize-y rounded-lg px-3 py-2 text-sm leading-6 outline-none transition-colors"
          style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
          placeholder="填写 Web 访问 URL、账号密码、登录步骤、验证码说明、测试范围、特殊入口或其他分析需要注意的信息。"
          value={value.description}
          disabled={loading}
          onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      <div className="mt-3 rounded-lg p-4" style={{ backgroundColor: LK.surfaceRaised }}>
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>配置状态</div>
        <div className="mt-2 text-sm font-medium" style={{ color: LK.inkSoft }}>
          {loading ? '正在加载配置...' : value.updated_at ?`最近更新：${formatTime(value.updated_at)}` : '尚未保存项目描述'}
        </div>
      </div>
    </Panel>
  );
};

const OnlineAgentPanel: React.FC<{
  agents: Agent[];
  routes: WebRoute[];
  tasks: AsyncTask[];
  selectedAgentId: string;
  onSelect: (id: string) => void;
  onAnalyze: (id: string) => void;
  analyzing: boolean;
}> = ({ agents, routes, tasks, selectedAgentId, onSelect, onAnalyze, analyzing }) => (
  <Panel title="上线 Agent" subtitle="展示当前项目可用于 WEB 端到端分析的 Agent。">
    {agents.length === 0 ? (
      <EmptyState icon={<Bot size={20} />} title="暂无上线 Agent" description="完成环境接入后，在线 Agent 会出现在这里。" />
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
              <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>Agent</th>
              <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>状态</th>
              <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>最近活跃</th>
              <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>Web 应用</th>
              <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>最近分析</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const key = getAgentKey(agent);
              const routeCount = routes.filter((route) => !route.agent_key || route.agent_key === key || route.agent_id === key).length;
              const latestTask = pickCurrentTask(tasks, key);
              const selected = selectedAgentId === key;
              return (
                <tr
                  key={key || getAgentName(agent)}
                  className="transition-colors"
                  style={{
                    backgroundColor: selected ? LK.primaryMuted : 'transparent',
                    boxShadow: selected ?`inset 2px 0 0 ${LK.primary}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td className="px-3 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                    <button className="text-left" onClick={() => onSelect(key)}>
                      <div className="font-semibold" style={{ color: LK.ink }}>{getAgentName(agent)}</div>
                      <div className="mt-1 break-all text-xs" style={{ color: LK.muted, fontFamily: MONO }}>{key || '-'}</div>
                    </button>
                  </td>
                  <td className="px-3 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}><StatusBadge status={agent.status} /></td>
                  <td className="px-3 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>{formatTime(agent.last_seen)}</td>
                  <td className="px-3 py-3 font-medium" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.inkSoft }}>{routeCount}</td>
                  <td className="px-3 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>{latestTask ? <StatusBadge status={latestTask.status} /> : <span style={{ color: LK.muted }}>无任务</span>}</td>
                  <td className="px-3 py-3 text-right" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg px-3 py-2 text-xs font-medium transition-colors" style={{ color: LK.body }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }} onClick={() => onSelect(key)}>
                        查看应用
                      </button>
                      <button
                        className="btn-primary inline-flex items-center text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!isAgentOnline(agent) || analyzing}
                        onClick={() => onAnalyze(key)}
                      >
                        {analyzing ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Play size={13} className="mr-1" />}
                        发起分析
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Panel>
);

const AnalysisProgressPanel: React.FC<{ task?: AsyncTask | null; stages: ProgressStage[]; onRetry?: () => void; canRetry: boolean }> = ({ task, stages, onRetry, canRetry }) => {
  const failedStage = stages.find((stage) => stage.status === 'failed');
  return (
    <Panel
      title="分析进度"
      subtitle="用用户可理解的阶段展示端到端分析当前进展。"
      action={failedStage && canRetry ? (
        <button className="btn-danger-soft inline-flex items-center text-xs font-medium" onClick={onRetry}>
          <RefreshCw size={13} className="mr-1" />
          重试失败阶段
        </button>
      ) : null}
    >
      {!task && stages.every((stage) => stage.status === 'waiting') ? (
        <EmptyState icon={<Clock3 size={20} />} title="暂无分析任务" description="选择在线 Agent 后可发起 WEB 端到端分析。" />
      ) : (
        <div className="space-y-4">
          {task ? (
            <div className="rounded-lg p-4" style={{ backgroundColor: LK.surfaceRaised }}>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={task.status} />
                <div className="text-sm font-medium" style={{ color: LK.ink }}>{task.type || task.service_name || 'WEB 端到端分析'}</div>
                <div className="text-sm" style={{ color: LK.body }}>进度 {Math.round(Number(task.progress || 0))}%</div>
              </div>
              {task.message ? <div className="mt-2 text-sm" style={{ color: LK.body }}>{task.message}</div> : null}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stages.map((stage) => {
              const icon = stage.status === 'success' ? <CheckCircle2 size={18} /> : stage.status === 'failed' ? <XCircle size={18} /> : stage.status === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Clock3 size={18} />;
              const stageStyle = stage.status === 'success' ? { bg: 'rgba(69, 192, 111, 0.14)', color: LK.success, border: 'rgba(69, 192, 111, 0.3)' } : stage.status === 'failed' ? { bg: 'rgba(241, 93, 93, 0.14)', color: LK.error, border: 'rgba(241, 93, 93, 0.3)' } : stage.status === 'running' ? { bg: 'rgba(79, 115, 255, 0.14)', color: LK.primary, border: 'rgba(79, 115, 255, 0.3)' } : { bg: LK.surfaceRaised, color: LK.muted, border: LK.borderSoft };
              return (
                <div key={stage.id} className="rounded-xl p-4" style={{ border: `1px solid ${LK.border}` }}>
                  <div className="inline-flex rounded-lg p-2" style={{ backgroundColor: stageStyle.bg, color: stageStyle.color, border: `1px solid ${stageStyle.border}` }}>{icon}</div>
                  <div className="mt-3 text-sm font-semibold" style={{ color: LK.ink }}>{stage.label}</div>
                  <div className="mt-1 text-sm leading-5" style={{ color: LK.body }}>{stage.description}</div>
                  <div className="mt-3 text-xs font-medium" style={{ color: LK.muted }}>{formatTime(stage.updatedAt)}</div>
                </div>
              );
            })}
          </div>
          {failedStage ? (
            <div className="rounded-lg px-3 py-2 text-sm font-medium" style={{ border: `1px solid ${LK.error}40`, backgroundColor: 'rgba(241, 93, 93, 0.14)', color: LK.error }}>
              失败阶段：{failedStage.label}。{task?.message || '请检查 Agent 是否在线后重试。'}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
};

export const WebEndToEndPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AsyncTask[]>([]);
  const [routes, setRoutes] = useState<WebRoute[]>([]);
  const [accessInfo, setAccessInfo] = useState<ProjectAccessInfo>({ description: '' });
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [loadState, setLoadState] = useState<LoadState>({ loading: false, error: null });
  const [accessInfoState, setAccessInfoState] = useState<LoadState>({ loading: false, error: null });
  const [analyzing, setAnalyzing] = useState(false);
  const [savingAccessInfo, setSavingAccessInfo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);

  const selectedAgent = useMemo(() => agents.find((agent) => getAgentKey(agent) === selectedAgentId) || null, [agents, selectedAgentId]);
  const currentTask = useMemo(() => pickCurrentTask(tasks, selectedAgentId), [tasks, selectedAgentId]);
  const hasActiveTask = currentTask ? ACTIVE_TASK_STATUSES.has(String(currentTask.status || '').toLowerCase()) : false;
  const visibleRoutes = useMemo(() => selectedAgentId ? routes.filter((route) => route.agent_key === selectedAgentId || route.agent_id === selectedAgentId) : routes, [routes, selectedAgentId]);
  const stages = useMemo(() => buildProgressStages({ selectedAgent, routes: visibleRoutes, task: currentTask }), [currentTask, selectedAgent, visibleRoutes]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoadState({ loading: true, error: null });
    try {
      const [agentPayload, taskPayload] = await Promise.all([
        fetchGaiaAgents(projectId),
        fetchGaiaTasks(projectId),
      ]);
      const nextAgents = agentPayload || [];
      const nextTasks = taskPayload || [];
      const preferredAgentId = selectedAgentId && nextAgents.some((agent) => getAgentKey(agent) === selectedAgentId)
        ? selectedAgentId
        : getAgentKey(nextAgents.find(isAgentOnline) || nextAgents[0] || ({} as Agent));
      const routePayload = preferredAgentId ? await fetchWebRoutes(projectId, preferredAgentId).catch(() => []) : [];
      setAgents(nextAgents);
      setTasks(nextTasks);
      setRoutes(routePayload);
      setSelectedAgentId(preferredAgentId || '');
      setLoadState({ loading: false, error: null });
    } catch (error) {
      setLoadState({ loading: false, error: error instanceof Error ? error.message : '加载 WEB 端到端数据失败' });
    }
  }, [projectId, selectedAgentId]);

  const loadAccessInfo = useCallback(async () => {
    if (!projectId) return;
    setAccessInfoState({ loading: true, error: null });
    try {
      const next = await fetchProjectAccessInfo(projectId);
      setAccessInfo(next);
      setAccessInfoState({ loading: false, error: null });
    } catch (error) {
      setAccessInfoState({ loading: false, error: error instanceof Error ? error.message : '加载项目描述失败' });
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadAccessInfo();
  }, [loadAccessInfo]);

  useEffect(() => {
    if (!projectId || !hasActiveTask) return undefined;
    const timer = window.setInterval(() => {
      loadData();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, loadData, projectId]);

  const handleSelectAgent = useCallback(async (agentId: string) => {
    setSelectedAgentId(agentId);
    if (!projectId || !agentId) return;
    const nextRoutes = await fetchWebRoutes(projectId, agentId).catch(() => []);
    setRoutes(nextRoutes);
  }, [projectId]);

  const handleAnalyze = useCallback(async (agentId: string) => {
    if (!projectId || !agentId) return;
    setAnalyzing(true);
    setNotice(null);
    try {
      await triggerWebAnalysis(projectId, agentId);
      setNotice('已发起 WEB 端到端分析，进度会自动刷新。');
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '发起分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [loadData, projectId]);

  const handleSaveAccessInfo = useCallback(async () => {
    if (!projectId) return;
    setSavingAccessInfo(true);
    setNotice(null);
    try {
      const saved = await saveProjectAccessInfo(projectId, accessInfo);
      setAccessInfo(saved);
      setAccessInfoState({ loading: false, error: null });
      setNotice('项目描述已保存');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存项目描述失败';
      setAccessInfoState({ loading: false, error: message });
      setNotice(message);
    } finally {
      setSavingAccessInfo(false);
    }
  }, [accessInfo, projectId]);

  if (!projectId) {
    return (
      <div className="p-6">
        <EmptyState icon={<AlertCircle size={20} />} title="未选择项目" description="请选择项目后再进入 WEB 端到端工作台。" />
      </div>
    );
  }

  const onlineCount = agents.filter(isAgentOnline).length;
  const accessLabel = loadState.error ? '异常' : agents.length === 0 ? '未接入' : onlineCount > 0 ? '已接入' : '接入中';
  const analysisLabel = currentTask ? getStatusLabel(currentTask.status) : '无任务';

  return (
    <div className="min-h-full px-5 py-5" style={{ backgroundColor: LK.canvas }}>
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          title="WEB 端到端分析"
          description="面向用户的接入、Agent 和分析进度工作台。"
          actions={
            <button className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: LK.surface, color: LK.body, border: `1px solid ${LK.border}` }} disabled={loadState.loading} onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; } }} onMouseLeave={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; } }} onClick={loadData}><RefreshCw size={16} className={`mr-2 ${loadState.loading ? 'animate-spin' : ''}`} />刷新状态</button>
          }
        />

        {notice ? (
          <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ border: notice.includes('失败') || notice.includes('未提供') || notice.includes('removed') ?`1px solid ${LK.error}40` :`1px solid ${LK.success}40`, backgroundColor: notice.includes('失败') || notice.includes('未提供') || notice.includes('removed') ? 'rgba(241, 93, 93, 0.14)' : 'rgba(69, 192, 111, 0.14)', color: notice.includes('失败') || notice.includes('未提供') || notice.includes('removed') ? LK.error : LK.success }}>
            {notice}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard label="接入状态" value={accessLabel} hint={loadState.error ||`最近心跳 ${formatTime(selectedAgent?.last_seen)}`} icon={<Server size={20} />} tone={loadState.error ? 'rose' : onlineCount > 0 ? 'emerald' : 'slate'} />
          <SummaryMetricCard label="在线 Agent" value={`${onlineCount} / ${agents.length}`} hint={selectedAgent ? getAgentName(selectedAgent) : '未选择 Agent'} icon={<Bot size={20} />} tone={onlineCount > 0 ? 'blue' : 'slate'} />
          <SummaryMetricCard label="当前分析" value={analysisLabel} hint={currentTask ?`进度 ${Math.round(Number(currentTask.progress || 0))}%` : '暂无任务'} icon={<Globe size={20} />} tone={hasActiveTask ? 'blue' : FAILED_TASK_STATUSES.has(String(currentTask?.status || '').toLowerCase()) ? 'rose' : 'slate'} />
          <SummaryMetricCard label="Web 应用" value={visibleRoutes.length} hint={selectedAgent ? '当前 Agent 已识别路由' : '请选择 Agent 查看路由'} icon={<Globe size={20} />} tone={visibleRoutes.length > 0 ? 'emerald' : 'slate'} />
        </div>

        <AccessEnvironmentPanel projectId={projectId} agents={agents} selectedAgent={selectedAgent} state={loadState} onOpenDeploy={() => setDeployDialogOpen(true)} />
        <ProjectAccessInfoPanel
          value={accessInfo}
          loading={accessInfoState.loading}
          saving={savingAccessInfo}
          error={accessInfoState.error}
          onChange={setAccessInfo}
          onSave={handleSaveAccessInfo}
        />
        <OnlineAgentPanel agents={agents} routes={routes} tasks={tasks} selectedAgentId={selectedAgentId} onSelect={handleSelectAgent} onAnalyze={handleAnalyze} analyzing={analyzing} />
        <AnalysisProgressPanel task={currentTask} stages={stages} canRetry={Boolean(selectedAgentId)} onRetry={() => selectedAgentId && handleAnalyze(selectedAgentId)} />
      </div>
      <DeployAgentDialog open={deployDialogOpen} projectId={projectId} onClose={() => setDeployDialogOpen(false)} onNotice={setNotice} />
    </div>
  );
};