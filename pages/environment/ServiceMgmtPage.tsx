import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Loader2,
  Search,
  Plus,
  Layout,
  Monitor,
  Zap,
  AlertCircle,
  Play,
  Square,
  Trash2,
  CheckSquare,
  TerminalSquare,
  X,
} from 'lucide-react';
import { Agent, AgentService, EnvTemplate, TemplateLlmProviderBinding } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';
import { openServiceTerminalWindow as openServiceTerminalWindowPopup } from './serviceTerminal';
import { TemplateLlmBindingEditor } from './llm-binding/TemplateLlmBindingEditor';
import { PageHeader } from '../../design-system';

type BatchAction = 'start' | 'stop' | 'delete' | 'update';
type DeployModalTab = 'scope' | 'templates' | 'agents' | 'advanced';

const buildRandomIngressPrefix = (base: string) => {
  const normalized = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'route';
  const randomPart = Math.random().toString(36).slice(2, 8);
  return`${normalized}-${randomPart}`;
};

export const ServiceMgmtPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cleanupOfflineLoading, setCleanupOfflineLoading] = useState(false);
  const [allServices, setAllServices] = useState<AgentService[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [serviceStateFilter, setServiceStateFilter] = useState<'all' | 'running' | 'stopped' | 'offline_agent' | 'stale' | 'error'>('all');
  const [servicePage, setServicePage] = useState(1);
  const [servicePerPage, setServicePerPage] = useState(50);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set<string>());
  const [selectedService, setSelectedService] = useState<AgentService | null>(null);
  const [serviceDetail, setServiceDetail] = useState<any>(null);
  const [serviceDetailError, setServiceDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [serviceLogs, setServiceLogs] = useState('');
  const [execContainer, setExecContainer] = useState('');
  const [terminalMode, setTerminalMode] = useState<'attach' | 'shell'>('attach');
  const [terminalShell, setTerminalShell] = useState('/bin/bash');
  const [templateWebPortPresets, setTemplateWebPortPresets] = useState<any[]>([]);
  const [ingressRoutes, setIngressRoutes] = useState<any[]>([]);
  const [ingressLoading, setIngressLoading] = useState(false);
  const [ingressCreating, setIngressCreating] = useState(false);
  const [ingressTargetPort, setIngressTargetPort] = useState<number>(0);
  const [ingressTlsEnabled, setIngressTlsEnabled] = useState(true);
  const [backendProtocol, setBackendProtocol] = useState<'http' | 'https'>('http');
  const [ingressPath, setIngressPath] = useState('/');
  const [ingressHostPrefix, setIngressHostPrefix] = useState('');
  const [ingressWebsocketEnabled, setIngressWebsocketEnabled] = useState(true);
  const [globalIngressLoading, setGlobalIngressLoading] = useState(false);
  const [globalIngressItems, setGlobalIngressItems] = useState<any[]>([]);
  const [globalIngressStats, setGlobalIngressStats] = useState<any>({});
  const [selectedIngressRouteIds, setSelectedIngressRouteIds] = useState<Set<string>>(new Set<string>());
  const [globalIngressActionLoading, setGlobalIngressActionLoading] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployAgentsLoading, setDeployAgentsLoading] = useState(false);
  const [deployTemplatesLoading, setDeployTemplatesLoading] = useState(false);
  const [deployAgents, setDeployAgents] = useState<Agent[]>([]);
  const [deployTemplates, setDeployTemplates] = useState<EnvTemplate[]>([]);
  const [deployAgentSearch, setDeployAgentSearch] = useState('');
  const [selectedDeployAgentKeys, setSelectedDeployAgentKeys] = useState<Set<string>>(new Set<string>());
  const [selectedDeployTemplateIds, setSelectedDeployTemplateIds] = useState<Set<number>>(new Set<number>());
  const [deployServiceSuffix, setDeployServiceSuffix] = useState('');
  const [deployPerNodeCount, setDeployPerNodeCount] = useState(1);
  const [deployExtraParamsText, setDeployExtraParamsText] = useState('');
  const [deployLlmBinding, setDeployLlmBinding] = useState<TemplateLlmProviderBinding | null>(null);
  const [deployModalTab, setDeployModalTab] = useState<DeployModalTab>('scope');
  const [openingAgentConsoleKey, setOpeningAgentConsoleKey] = useState('');
  const listRequestSeqRef = useRef(0);
  const listAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (projectId) {
      void loadAllServices();
    }
  }, [projectId]);

  useEffect(() => () => {
    listAbortControllerRef.current?.abort();
  }, []);

  const fetchAllGlobalServices = async (pid: string, signal?: AbortSignal): Promise<AgentService[]> => {
    const pageSize = 500;
    let page = 1;
    const merged: AgentService[] = [];
    while (page <= 20) {
      const data = await environmentApi.environment.getGlobalServices(pid, { page, per_page: pageSize, include_stale: true }, { signal });
      const items = Array.isArray(data?.items) ? data.items : [];
      merged.push(...items);
      const total = Number(data?.total || merged.length);
      if (items.length === 0 || merged.length >= total) break;
      page += 1;
    }
    return merged;
  };

  const fetchAllAgents = async (pid: string, signal?: AbortSignal): Promise<Agent[]> => {
    const pageSize = 500;
    let page = 1;
    const merged: Agent[] = [];
    while (page <= 20) {
      const data = await environmentApi.environment.getAgents(pid, { page, per_page: pageSize }, { signal });
      const items = Array.isArray(data?.agents) ? data.agents : [];
      merged.push(...items);
      const total = Number(data?.total || merged.length);
      if (items.length === 0 || merged.length >= total) break;
      page += 1;
    }
    return merged;
  };

  const loadAllServices = async (options: { showFullLoading?: boolean } = {}) => {
    if (!projectId) return;
    const showFullLoading = options.showFullLoading !== false;
    const seq = ++listRequestSeqRef.current;
    listAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    listAbortControllerRef.current = abortController;
    if (showFullLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [services, agentList] = await Promise.all([
        fetchAllGlobalServices(projectId, abortController.signal),
        fetchAllAgents(projectId, abortController.signal),
      ]);
      if (seq !== listRequestSeqRef.current) return;
      setAllServices(services);
      setAgents(agentList);
      setSelectedServiceIds(new Set<string>());
      await loadGlobalIngress(abortController.signal, seq);
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      console.error('Failed to load global services', err);
      notify('加载服务发现数据失败', 'error');
    } finally {
      if (seq === listRequestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const openDeployModal = async () => {
    if (!projectId) {
      notify('请先选择项目后再部署', 'warning');
      return;
    }
    setDeployModalOpen(true);
    setDeployAgentSearch('');
    setSelectedDeployAgentKeys(new Set<string>());
    setSelectedDeployTemplateIds(new Set<number>());
    setDeployServiceSuffix('');
    setDeployPerNodeCount(1);
    setDeployExtraParamsText('');
    setDeployLlmBinding(null);
    setDeployModalTab('scope');
    setDeployAgentsLoading(true);
    setDeployTemplatesLoading(true);
    try {
      const [agentData, templateData] = await Promise.all([
        environmentApi.environment.getAgents(projectId, { per_page: 2000 }),
        environmentApi.environment.getTemplates(1, 2000),
      ]);
      setDeployAgents(agentData?.agents || []);
      setDeployTemplates(templateData?.templates || []);
    } catch (err) {
      console.error('Load deploy modal data failed', err);
      notify('加载部署数据失败', 'error');
    } finally {
      setDeployAgentsLoading(false);
      setDeployTemplatesLoading(false);
    }
  };

  const loadGlobalIngress = async (signal?: AbortSignal, reqSeq?: number) => {
    if (!projectId) return;
    setGlobalIngressLoading(true);
    try {
      const data = await environmentApi.environment.getGlobalIngress(projectId, { include_deleted: false }, { signal });
      if (typeof reqSeq === 'number' && reqSeq !== listRequestSeqRef.current) return;
      setGlobalIngressItems(data?.items || []);
      setGlobalIngressStats(data?.stats || {});
      setSelectedIngressRouteIds(new Set<string>());
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      console.error('Failed to load global ingress', err);
      setGlobalIngressItems([]);
      setGlobalIngressStats({});
    } finally {
      if (typeof reqSeq !== 'number' || reqSeq === listRequestSeqRef.current) {
        setGlobalIngressLoading(false);
      }
    }
  };

  const forceSyncAndReloadServices = async () => {
    if (!projectId) return;
    setSyncRefreshing(true);
    try {
      const result = await environmentApi.environment.syncGlobalServices({
        project_id: projectId,
        lock_wait_timeout_sec: 120,
        leader_lock_timeout_sec: 90,
        lock_poll_interval_sec: 1,
      });
      const okCount = Number(result?.ok_count || 0);
      const failCount = Number(result?.fail_count || 0);
      const status = String(result?.status || '');
      notify(`服务发现同步完成：状态 ${status || '-'}，成功 ${okCount}，失败 ${failCount}`, failCount > 0 ? 'warning' : 'success');
      await loadAllServices({ showFullLoading: false });
    } catch (err: any) {
      notify(err?.message || '强制刷新服务发现失败', 'error');
    } finally {
      setSyncRefreshing(false);
    }
  };

  const buildAgentConsoleAccessUrl = (route: any): string => {
    const accessUrl = String(route?.access_url || '').trim();
    if (accessUrl) return accessUrl;
    const host = String(route?.host || '').trim();
    if (!host) return '';
    const path = String(route?.path || '/').trim() || '/';
    const scheme = route?.tls_enabled === false ? 'http' : 'https';
    return`${scheme}://${host}${path}`;
  };

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const pickReadyAgentConsoleRoute = (items: any[]): any | null => {
    const consoleRoutes = (items || []).filter(
      (route: any) => Number(route?.target_port || 0) === 11198 && String(route?.status || '').toLowerCase() !== 'deleted'
    );
    if (consoleRoutes.length === 0) return null;
    return (
      consoleRoutes.find((route: any) => {
        const status = String(route?.status || '').toLowerCase();
        return (status === 'ready' || status === 'active' || status === 'running') && !!buildAgentConsoleAccessUrl(route);
      }) ||
      consoleRoutes.find((route: any) => !!buildAgentConsoleAccessUrl(route)) ||
      consoleRoutes[0]
    );
  };

  const waitForAgentConsoleRoute = async (agentKey: string, currentRoute: any): Promise<any> => {
    let candidate = currentRoute;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (candidate) {
        const candidateStatus = String(candidate?.status || '').toLowerCase();
        const candidateUrl = buildAgentConsoleAccessUrl(candidate);
        if ((candidateStatus === 'ready' || candidateStatus === 'active' || candidateStatus === 'running') && candidateUrl) {
          return candidate;
        }
      }
      await sleep(800);
      const refreshed = await environmentApi.environment.listAgentIngressRoutes(agentKey, projectId);
      candidate = pickReadyAgentConsoleRoute(refreshed?.items || []);
    }
    return candidate;
  };

  const ensureAgentConsoleIngressAndOpen = async (svc: AgentService) => {
    if (!projectId || !svc.agent_key) {
      notify('当前服务缺少关联 Agent，无法打开节点终端', 'error');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.title = '正在打开 TTYD 终端...';
      popup.document.body.innerHTML = '<div style="font-family: sans-serif; padding: 24px; color: #334155;">正在准备节点 TTYD 终端，请稍候...</div>';
    }
    setOpeningAgentConsoleKey(svc.agent_key);
    try {
      const routesResp = await environmentApi.environment.listAgentIngressRoutes(svc.agent_key, projectId);
      const existingRoute = pickReadyAgentConsoleRoute(routesResp?.items || []);
      let targetRoute = existingRoute;

      if (!targetRoute) {
        targetRoute = await environmentApi.environment.createAgentIngressRoute(svc.agent_key, {
          project_id: projectId,
          target_port: 11198,
          service_port: 11198,
          websocket_enabled: true,
          tls_enabled: true,
          host_prefix: buildRandomIngressPrefix(`${svc.agent_key}-ttyd`),
          metadata: {
            ingress_scope: 'agent_console',
            source: 'service-mgmt-list',
          },
        });
      }

      targetRoute = await waitForAgentConsoleRoute(svc.agent_key, targetRoute);
      const accessUrl = buildAgentConsoleAccessUrl(targetRoute);
      if (!accessUrl) {
        throw new Error('TTYD Ingress 尚未生成可访问地址，请稍后重试');
      }

      if (popup) {
        popup.location.replace(accessUrl);
      } else {
        window.open(accessUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      if (popup) popup.close();
      notify(err?.message || '打开节点 TTYD 终端失败', 'error');
    } finally {
      setOpeningAgentConsoleKey('');
    }
  };

  const serviceRowId = (svc: AgentService) =>`${svc.agent_key || 'unknown'}::${svc.name}`;

  const agentByKey = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach((a) => {
      if (a?.key) map.set(a.key, a);
    });
    return map;
  }, [agents]);

  const getEffectiveServiceState = (
    svc: AgentService,
    agentStatus: string
  ): 'running' | 'stopped' | 'offline_agent' | 'stale' | 'error' | 'unknown' => {
    const aStatus = String(agentStatus || '').toLowerCase();
    if (aStatus !== 'online') return 'offline_agent';
    if (svc?.is_stale) return 'stale';
    const s = String(svc?.status || '').toLowerCase();
    if (['running', 'partially_running', 'ready', 'active'].includes(s)) return 'running';
    if (['stopped', 'not_found', 'exited', 'disabled'].includes(s)) return 'stopped';
    if (['error', 'failed', 'timeout', 'unhealthy'].includes(s)) return 'error';
    return 'unknown';
  };

  const resolveServiceStateMeta = (
    svc: AgentService,
    agentStatus: string
  ): {
    effectiveState: 'running' | 'stopped' | 'offline_agent' | 'stale' | 'error' | 'unknown';
    badgeStatus: string;
  } => {
    const effectiveState = getEffectiveServiceState(svc, agentStatus);
    if (effectiveState === 'offline_agent') {
      return { effectiveState, badgeStatus: 'offline' };
    }
    if (effectiveState === 'stale') {
      return { effectiveState, badgeStatus: 'checking' };
    }
    return { effectiveState, badgeStatus: String(svc?.status || 'unknown') };
  };

  const servicesWithAgentStatus = useMemo(() => {
    return allServices.map((svc) => {
      const agent = svc.agent_key ? agentByKey.get(svc.agent_key) : undefined;
      const agentStatus = String(agent?.status || 'unknown');
      const stateMeta = resolveServiceStateMeta(svc, agentStatus);
      return {
        ...svc,
        agent_status: agentStatus,
        agent_online: agentStatus === 'online',
        effective_state: stateMeta.effectiveState,
        badge_status: stateMeta.badgeStatus,
      };
    });
  }, [allServices, agentByKey]);

  const filteredServices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return servicesWithAgentStatus.filter((svc: any) => {
      const hitKeyword = !q
        || svc.name.toLowerCase().includes(q)
        || (svc.template_name || '').toLowerCase().includes(q)
        || (svc.agent_hostname || '').toLowerCase().includes(q)
        || (svc.agent_key || '').toLowerCase().includes(q);
      const hitNode = nodeFilter === 'all' || (svc.agent_key || '') === nodeFilter;
      const hitTemplate = templateFilter === 'all' || (svc.template_name || '') === templateFilter;
      const hitState = serviceStateFilter === 'all' || svc.effective_state === serviceStateFilter;
      return hitKeyword && hitNode && hitTemplate && hitState;
    });
  }, [servicesWithAgentStatus, searchTerm, nodeFilter, templateFilter, serviceStateFilter]);

  const nodeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    servicesWithAgentStatus.forEach((svc: any) => {
      if (svc.agent_key) {
        seen.set(svc.agent_key, svc.agent_hostname || svc.agent_key);
      }
    });
    return Array.from(seen.entries()).map(([key, hostname]) => ({ key, hostname }));
  }, [servicesWithAgentStatus]);

  const templateOptions = useMemo(() => {
    const seen = new Set<string>();
    servicesWithAgentStatus.forEach((svc: any) => {
      if (svc.template_name) seen.add(svc.template_name);
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [servicesWithAgentStatus]);

  const serviceStateSummary = useMemo(() => {
    const summary = {
      running: 0,
      stopped: 0,
      offline_agent: 0,
      stale: 0,
      error: 0,
      unknown: 0
    };
    servicesWithAgentStatus.forEach((svc: any) => {
      const k = String(svc.effective_state || 'unknown') as keyof typeof summary;
      summary[k] = (summary[k] || 0) + 1;
    });
    return summary;
  }, [servicesWithAgentStatus]);

  const servicePageCount = useMemo(() => {
    const total = filteredServices.length;
    return Math.max(1, Math.ceil(total / Math.max(1, servicePerPage)));
  }, [filteredServices.length, servicePerPage]);

  const pagedServices = useMemo(() => {
    const start = (servicePage - 1) * servicePerPage;
    return filteredServices.slice(start, start + servicePerPage);
  }, [filteredServices, servicePage, servicePerPage]);

  useEffect(() => {
    setServicePage(1);
  }, [searchTerm, nodeFilter, templateFilter, serviceStateFilter, projectId]);

  useEffect(() => {
    if (servicePage > servicePageCount) {
      setServicePage(servicePageCount);
    }
  }, [servicePage, servicePageCount]);

  const selectedItems = filteredServices.filter((svc) => selectedServiceIds.has(serviceRowId(svc)));

  const toggleSelectService = (svc: AgentService) => {
    const id = serviceRowId(svc);
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (filteredServices.length === 0) return;
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      const allSelected = filteredServices.every((svc) => next.has(serviceRowId(svc)));
      if (allSelected) {
        filteredServices.forEach((svc) => next.delete(serviceRowId(svc)));
      } else {
        filteredServices.forEach((svc) => next.add(serviceRowId(svc)));
      }
      return next;
    });
  };

  const applyBatchAction = async (action: BatchAction, targets: AgentService[]) => {
    if (!projectId || targets.length === 0) return;
    const actionText = action === 'start'
      ? '启动'
      : action === 'stop'
        ? '停止'
        : action === 'update'
          ? '更新'
          : '删除';
    const okToContinue = await confirm({
      title:`批量${actionText}服务`,
      message:`确认批量${actionText} ${targets.length} 个服务实例？`,
      confirmText: '确认执行',
      cancelText: '取消',
      danger: action === 'delete',
    });
    if (!okToContinue) return;

    setActionLoading(true);
    let ok = 0;
    let fail = 0;
    let skipped = 0;
    try {
      if (action === 'update') {
        const groups = new Map<string, AgentService[]>();
        for (const svc of targets) {
          const agentKey = svc.agent_key || '';
          const effectiveState = String((svc as any).effective_state || '');
          if (!agentKey || effectiveState === 'offline_agent') {
            skipped += 1;
            continue;
          }
          const current = groups.get(agentKey) || [];
          current.push(svc);
          groups.set(agentKey, current);
        }

        await Promise.all(Array.from(groups.entries()).map(async ([agentKey, services]) => {
          for (const svc of services) {
            try {
              await environmentApi.environment.updateAgentService(agentKey, svc.name);
              ok += 1;
            } catch {
              fail += 1;
            }
          }
        }));
      } else {
        for (const svc of targets) {
          const agentKey = svc.agent_key || '';
          if (!agentKey) {
            fail += 1;
            continue;
          }
          try {
            if (action === 'start') {
              await environmentApi.environment.startAgentService(agentKey, svc.name);
            } else if (action === 'stop') {
              await environmentApi.environment.stopAgentService(agentKey, svc.name);
            } else {
              await environmentApi.environment.deleteAgentService(agentKey, svc.name, projectId);
            }
            ok += 1;
          } catch {
            fail += 1;
          }
        }
      }
      const summary = skipped > 0
        ?`批量${actionText}完成：成功 ${ok}，失败 ${fail}，跳过 ${skipped}`
        :`批量${actionText}完成：成功 ${ok}，失败 ${fail}`;
      notify(summary, fail > 0 ? 'warning' : 'success');
      if (action === 'update' && skipped > 0 && fail === 0) {
        notify('离线节点服务已跳过，其余服务已执行更新', 'info');
      }
      await loadAllServices();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteByTemplate = async () => {
    if (templateFilter === 'all') {
      notify('请先选择模板过滤条件', 'warning');
      return;
    }
    const targets = filteredServices.filter((svc) => (svc.template_name || '') === templateFilter);
    await applyBatchAction('delete', targets);
  };

  const toggleSelectIngress = (routeId: string) => {
    setSelectedIngressRouteIds((prev) => {
      const next = new Set<string>(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const toggleSelectAllIngress = () => {
    if (globalIngressItems.length === 0) return;
    setSelectedIngressRouteIds((prev) => {
      const next = new Set<string>(prev);
      const allSelected = globalIngressItems.every((item) => next.has(item.route_id));
      if (allSelected) {
        globalIngressItems.forEach((item) => next.delete(item.route_id));
      } else {
        globalIngressItems.forEach((item) => next.add(item.route_id));
      }
      return next;
    });
  };

  const deleteSelectedIngress = async () => {
    if (!projectId || selectedIngressRouteIds.size === 0) return;
    const ok = await confirm({
      title: '批量删除Ingress',
      message:`确认删除选中的 ${selectedIngressRouteIds.size} 条Ingress路由？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setGlobalIngressActionLoading(true);
    try {
      const routeIds = Array.from(selectedIngressRouteIds.values()) as string[];
      const result = await environmentApi.environment.deleteGlobalIngressBatch(projectId, routeIds);
      notify(`删除完成：成功 ${result?.deleted ?? 0}，失败 ${(result?.failed || []).length}`, (result?.failed || []).length > 0 ? 'warning' : 'success');
      await loadGlobalIngress();
    } catch (err: any) {
      notify(err?.message || '批量删除Ingress失败', 'error');
    } finally {
      setGlobalIngressActionLoading(false);
    }
  };

  const cleanupStaleIngress = async () => {
    if (!projectId) return;
    const ok = await confirm({
      title: '清理无效Ingress',
      message: '确认一键删除所有不在位服务关联的Ingress？',
      confirmText: '执行清理',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setGlobalIngressActionLoading(true);
    try {
      const result = await environmentApi.environment.cleanupStaleGlobalIngress(projectId, false);
      notify(`清理完成：删除 ${result?.deleted ?? 0} 条，失败 ${(result?.failed || []).length}`, (result?.failed || []).length > 0 ? 'warning' : 'success');
      await loadGlobalIngress();
    } catch (err: any) {
      notify(err?.message || '清理无效Ingress失败', 'error');
    } finally {
      setGlobalIngressActionLoading(false);
    }
  };

  const cleanupOfflineServices = async () => {
    if (!projectId) return;
    const ok = await confirm({
      title: '清除 OFFLINE 服务',
      message: '确认一键清除当前项目中 OFFLINE 状态服务（仅节点离线/孤儿服务，在线节点的 stale 不清理）？',
      confirmText: '确认清除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setCleanupOfflineLoading(true);
    try {
      const result = await environmentApi.environment.cleanupOfflineGlobalServices(projectId, false);
      const deleted = Number(result?.deleted || 0);
      const target = Number(result?.target_count || 0);
      notify(`清除完成：目标 ${target} 条，已删除 ${deleted} 条`, 'success');
      await loadAllServices();
    } catch (err: any) {
      notify(err?.message || '清除OFFLINE服务失败', 'error');
    } finally {
      setCleanupOfflineLoading(false);
    }
  };

  const clearAllIngress = async () => {
    if (!projectId) return;
    const ok = await confirm({
      title: '清空全部Ingress',
      message: '确认清空当前项目下全部Ingress路由？此操作不可恢复。',
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setGlobalIngressActionLoading(true);
    try {
      const result = await environmentApi.environment.clearAllGlobalIngress(projectId, false);
      notify(`清空完成：删除 ${result?.deleted ?? 0} 条，失败 ${(result?.failed || []).length}`, (result?.failed || []).length > 0 ? 'warning' : 'success');
      await loadGlobalIngress();
    } catch (err: any) {
      notify(err?.message || '清空Ingress失败', 'error');
    } finally {
      setGlobalIngressActionLoading(false);
    }
  };

  const resolveContainers = (detail: any): string[] => {
    const raw = detail?.real_status?.containers || [];
    if (!Array.isArray(raw)) return [];
    const names = raw
      .map((item: any) => item?.Service || item?.service || item?.Name || item?.name)
      .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
      .map((v: string) => v.trim());
    return Array.from(new Set(names));
  };

  const detectServicePorts = (svc: AgentService): number[] => {
    const result = new Set<number>();
    const ports = svc?.ports || {};
    Object.values(ports).forEach((raw) => {
      const text = String(raw || '').trim();
      if (!text) return;
      const candidates = text.split(/[,:/]/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0 && n <= 65535);
      candidates.forEach((n) => result.add(n));
    });
    return Array.from(result.values()).sort((a, b) => a - b);
  };

  const normalizeNamePart = (value: string, maxLen = 32): string =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLen);

  const buildDeployServiceName = (templateName: string, agentKey: string, index: number): string => {
    const tpl = normalizeNamePart(templateName, 28) || 'service';
    const agent = normalizeNamePart(agentKey, 10) || 'agent';
    const suffix = normalizeNamePart(deployServiceSuffix, 16);
    const idx = deployPerNodeCount > 1 ?`-${index + 1}` : '';
    const suffixPart = suffix ?`-${suffix}` : '';
    return`${tpl}-${agent}${suffixPart}${idx}`.slice(0, 63);
  };

  const filteredDeployAgents = useMemo(() => {
    const q = deployAgentSearch.trim().toLowerCase();
    return deployAgents.filter((a) => {
      const hitSearch = !q
        || (a.hostname || '').toLowerCase().includes(q)
        || (a.ip_address || '').toLowerCase().includes(q)
        || (a.key || '').toLowerCase().includes(q);
      return hitSearch;
    });
  }, [deployAgents, deployAgentSearch]);

  const toggleDeployAgent = (agentKey: string) => {
    setSelectedDeployAgentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });
  };

  const toggleAllDeployAgents = () => {
    setSelectedDeployAgentKeys((prev) => {
      const next = new Set(prev);
      const allSelected = filteredDeployAgents.length > 0 && filteredDeployAgents.every((a) => next.has(a.key));
      if (allSelected) {
        filteredDeployAgents.forEach((a) => next.delete(a.key));
      } else {
        filteredDeployAgents.forEach((a) => {
          if (a.status === 'online') next.add(a.key);
        });
      }
      return next;
    });
  };

  const toggleDeployTemplate = (templateId: number) => {
    setSelectedDeployTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const executeBatchDeployFromModal = async () => {
    if (!projectId) return;
    if (selectedDeployAgentKeys.size === 0) {
      notify('请至少选择一个在线节点', 'warning');
      return;
    }
    if (selectedDeployTemplateIds.size === 0) {
      notify('请至少选择一个模板', 'warning');
      return;
    }

    let extraParams: any = undefined;
    if (deployExtraParamsText.trim()) {
      try {
        extraParams = JSON.parse(deployExtraParamsText);
      } catch {
        notify('额外参数不是合法 JSON', 'warning');
        return;
      }
    }

    setDeploying(true);
    try {
      const templateIdSet = new Set(selectedDeployTemplateIds);
      const chosenTemplates = deployTemplates.filter((t) => templateIdSet.has(Number(t.id)));
      const templateById = new Map<number, EnvTemplate>();
      chosenTemplates.forEach((t) => templateById.set(Number(t.id), t));
      const agentKeys = Array.from(selectedDeployAgentKeys.values()) as string[];

      const serviceNameMap = new Map<string, Set<string>>();
      await Promise.all(
        agentKeys.map(async (agentKey) => {
          try {
            const data = await environmentApi.environment.getAgentServices(agentKey);
            const names = new Set<string>((data?.services || []).map((svc) => svc.name));
            serviceNameMap.set(agentKey, names);
          } catch {
            serviceNameMap.set(agentKey, new Set<string>());
          }
        })
      );

      const deployments: Array<{ service_name: string; agent_key: string; template_name: string; extra_params?: any }> = [];
      let duplicateCount = 0;
      const llmBindingExtra = deployLlmBinding
        ? {
            llm_provider_binding: {
              provider_keys: deployLlmBinding.provider_keys,
              target_services: deployLlmBinding.target_services,
              source: 'deployment_override',
            }
          }
        : undefined;

      for (const agentKey of agentKeys) {
        const existing = serviceNameMap.get(agentKey) || new Set<string>();
        for (const templateId of selectedDeployTemplateIds) {
          const tpl = templateById.get(Number(templateId));
          if (!tpl) continue;
          for (let i = 0; i < deployPerNodeCount; i += 1) {
            const serviceName = buildDeployServiceName(tpl.name, agentKey, i);
            if (existing.has(serviceName)) {
              duplicateCount += 1;
              continue;
            }
            deployments.push({
              service_name: serviceName,
              agent_key: agentKey,
              template_name: tpl.name,
              ...((extraParams || llmBindingExtra) ? { extra_params: { ...(extraParams || {}), ...(llmBindingExtra || {}) } } : {}),
            });
            existing.add(serviceName);
          }
        }
      }

      if (deployments.length === 0) {
        notify(`检测到全部为重复部署，已跳过 ${duplicateCount} 项`, 'warning');
        return;
      }

      const result = await environmentApi.environment.deployBatch({
        project_id: projectId,
        deployments,
      });
      const successCount = Number(result?.success_count || 0);
      const failedCount = Number(result?.failed_count || 0);
      const level = failedCount > 0 ? 'warning' : 'success';
      notify(`批量部署已提交：成功 ${successCount}，失败 ${failedCount}，跳过重复 ${duplicateCount}`, level);
      setDeployModalOpen(false);
      await loadAllServices();
    } catch (err: any) {
      notify(err?.message || '批量部署失败', 'error');
    } finally {
      setDeploying(false);
    }
  };

  const selectedDeployTemplates = useMemo(
    () => deployTemplates.filter((template) => selectedDeployTemplateIds.has(Number(template.id))),
    [deployTemplates, selectedDeployTemplateIds]
  );

  const deployServiceOptions = useMemo(() => {
    if (selectedDeployTemplates.length !== 1) return [];
    const services = selectedDeployTemplates[0]?.metadata?.parsed_compose?.services;
    return services && typeof services === 'object' ? Object.keys(services) : [];
  }, [selectedDeployTemplates]);

  const loadIngressRoutesForService = async (svc: AgentService) => {
    if (!svc.agent_key || !projectId) return;
    setIngressLoading(true);
    try {
      const resp = await environmentApi.environment.getGlobalIngress(projectId);
      const all = resp?.items || [];
      const filtered = all.filter((r: any) => {
        const metaService = String(
          r?.metadata?.service_name ||
          r?.metadata?.associated_service_name ||
          r?.associated_service_name ||
          ''
        ).trim();
        return metaService === svc.name;
      });
      setIngressRoutes(filtered);
    } catch {
      setIngressRoutes([]);
    } finally {
      setIngressLoading(false);
    }
  };

  const createServiceIngress = async () => {
    if (!selectedService?.agent_key || !projectId || !ingressTargetPort) return;
    setIngressCreating(true);
    try {
      const route = await environmentApi.environment.createAgentIngressRoute(selectedService.agent_key, {
        project_id: projectId,
        target_port: Number(ingressTargetPort),
        service_port: Number(ingressTargetPort),
        websocket_enabled: ingressWebsocketEnabled,
        tls_enabled: ingressTlsEnabled,
        backend_protocol: backendProtocol,
        host_prefix: ingressHostPrefix?.trim() || buildRandomIngressPrefix(`${selectedService.name}-${ingressTargetPort}`),
        path: ingressPath?.trim() || '/',
        metadata: {
          source: 'service-mgmt',
          ingress_scope: 'service_binding',
          service_name: selectedService.name,
          template_id: selectedService.template_id,
          template_name: selectedService.template_name,
          protocol: backendProtocol,
          backend_protocol: backendProtocol,
          ingress_tls_enabled: ingressTlsEnabled
        }
      });
      notify(`Ingress创建成功: ${route?.host || ''}`, 'success');
      await loadIngressRoutesForService(selectedService);
      await loadGlobalIngress();
    } catch (err: any) {
      notify(err?.message || '创建Ingress失败', 'error');
    } finally {
      setIngressCreating(false);
    }
  };

  const deleteServiceIngressRoute = async (routeId: string) => {
    if (!selectedService?.agent_key || !projectId) return;
    const ok = await confirm({
      title: '删除转发路由',
      message: '确认删除这条 Ingress 转发路由？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    setIngressCreating(true);
    try {
      await environmentApi.environment.deleteGlobalIngressBatch(projectId, [routeId]);
      notify('转发路由已删除', 'success');
      await loadIngressRoutesForService(selectedService);
      await loadGlobalIngress();
    } catch (err: any) {
      notify(err?.message || '删除Ingress路由失败', 'error');
    } finally {
      setIngressCreating(false);
    }
  };

  const loadServiceLogs = async (svc: AgentService) => {
    if (!svc.agent_key) return;
    try {
      const res = await environmentApi.environment.getAgentServiceLogs(svc.agent_key, svc.name, 300);
      setServiceLogs(res?.logs || res?.error || '');
    } catch (err: any) {
      setServiceLogs(`日志加载失败: ${err?.message || err}`);
    }
  };

  const openServiceDetail = async (svc: AgentService) => {
    if (!svc.agent_key) {
      notify('服务缺少agent_key，无法查看详情', 'warning');
      return;
    }
    setSelectedService(svc);
    setDetailLoading(true);
    setServiceDetailError('');
    setServiceDetail(null);
    setServiceLogs('');
    setTerminalMode('shell');
    setTerminalShell('/bin/bash');
    setTemplateWebPortPresets([]);
    setIngressRoutes([]);
    try {
      const detail = await environmentApi.environment.getAgentServiceDetail(svc.agent_key, svc.name);
      setServiceDetail(detail);
      setExecContainer('');
      const detected = detectServicePorts(svc);
      setIngressTargetPort(detected[0] || 80);
      setIngressTlsEnabled(true);
      setBackendProtocol('http');
      setIngressPath('/');
      setIngressHostPrefix(buildRandomIngressPrefix(`${svc.name}-${detected[0] || 80}`));
      setIngressWebsocketEnabled(true);

      if (typeof svc.template_id === 'number') {
        try {
          const tpl = await environmentApi.environment.getTemplateDetail(svc.template_id);
          const presets = Array.isArray(tpl?.metadata?.web_port_presets) ? tpl.metadata.web_port_presets : [];
          setTemplateWebPortPresets(presets);
          if (presets.length > 0) {
            const first = presets[0];
            const p = Number(first?.port || 0);
            if (p > 0) {
              setIngressTargetPort(p);
              setIngressTlsEnabled(first?.ingress_tls_enabled !== undefined ? first?.ingress_tls_enabled !== false : first?.tls_enabled !== false);
              setBackendProtocol(String(first?.backend_protocol || first?.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http');
              setIngressPath(String(first?.path || '/'));
              setIngressWebsocketEnabled(first?.websocket_enabled !== false);
              setIngressHostPrefix(buildRandomIngressPrefix(`${svc.name}-${p}`));
            }
          }
        } catch {
          setTemplateWebPortPresets([]);
        }
      }

      await loadIngressRoutesForService(svc);
      await loadServiceLogs(svc);
    } catch (err: any) {
      setServiceDetail(null);
      setServiceDetailError(err?.message || '加载服务详情失败');
      notify(err?.message || '加载服务详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeServiceDetail = () => {
    setSelectedService(null);
    setServiceDetail(null);
    setServiceDetailError('');
    setTemplateWebPortPresets([]);
    setIngressRoutes([]);
  };

  const openTerminalWindowForService = (
    svc: AgentService,
    options: {
      mode?: 'attach' | 'shell';
      container?: string;
      shell?: string;
      fallbackShell?: string;
    } = {}
  ) => {
    if (!svc?.agent_key) return;
    if (svc?.is_stale) {
      notify('该服务状态已过期（stale），请先刷新服务发现并确认服务仍在线', 'warning');
      return;
    }
    const mode = options.mode || 'shell';
    const win = openServiceTerminalWindowPopup({
      projectId,
      service: svc,
      mode,
      container: options.container || '',
      shell: options.shell || '/bin/bash',
      fallbackShell: options.fallbackShell || '/bin/sh',
    });
    if (!win) notify('浏览器拦截了新窗口，请允许弹窗后重试', 'warning');
  };

  const openServiceTerminalWindow = (mode: 'attach' | 'shell') => {
    if (!selectedService?.agent_key) return;
    if (!serviceDetail) {
      notify(serviceDetailError || '当前服务详情未加载成功，无法建立终端连接', 'error');
      return;
    }
    openTerminalWindowForService(selectedService, {
      mode,
      container: execContainer.trim() || '',
      shell: terminalShell,
      fallbackShell: '/bin/sh',
    });
  };

  const terminalDisabled = !serviceDetail || !!selectedService?.is_stale;
  const terminalDisabledHint = selectedService?.is_stale
    ? '服务状态已过期（stale），请先刷新服务发现'
    : '';

  if (loading && projectId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin text-blue-400 mb-6" size={48} />
        <p className="text-[10px] font-medium text-theme-text-muted uppercase tracking-[0.2em]">正在加载项目服务实例...</p>
      </div>
    );
  }

  return (
    <>
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24">
      <PageHeader
        title="集群服务发现"
        description="服务批量启停删与实例筛选管理"
        actions={<div className="flex gap-4">
            <button onClick={() => void forceSyncAndReloadServices()} disabled={!projectId || syncRefreshing} className="px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 text-xs font-medium flex items-center gap-2" title="调用后端服务发现同步，再回填页面">{syncRefreshing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}强制发现</button>
            <button onClick={() => void loadAllServices({ showFullLoading: false })} disabled={!projectId || refreshing} className="p-4 bg-theme-elevated border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all active:scale-95 disabled:opacity-50" title="仅重新拉取当前服务快照">{refreshing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}</button>
            <button onClick={() => void openDeployModal()} disabled={!projectId} className="bg-theme-surface text-white px-8 py-4 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-60"><Plus size={18} /> 部署新服务</button>
          </div>}
      />

      {!projectId && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium flex items-center gap-3">
          <AlertCircle size={16} /> 请先在顶部菜单选择一个项目
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="bg-theme-surface p-6 rounded-xl border border-theme-border flex items-center gap-5">
          <div className="w-14 h-14 bg-blue-500/15 text-blue-400 rounded-lg flex items-center justify-center">
            <Layout size={24} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">服务实例</p>
            <h3 className="text-3xl font-bold text-theme-text-primary">{servicesWithAgentStatus.length}</h3>
          </div>
        </div>
 <div className="bg-theme-surface p-6 rounded-xl border border-theme-border flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center">
            <Monitor size={24} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">在线节点服务</p>
            <h3 className="text-3xl font-medium text-indigo-400">{serviceStateSummary.running}</h3>
          </div>
        </div>
        <div className="bg-theme-surface p-8 rounded-xl text-white flex items-center justify-between">
          <div>
            <p className="text-theme-text-muted text-[10px] font-semibold uppercase tracking-widest">离线/失联服务</p>
            <p className="text-3xl font-bold mt-1">{serviceStateSummary.offline_agent + serviceStateSummary.stale}</p>
          </div>
          <Zap className="opacity-20" size={30} />
        </div>
      </div>

      <div className="bg-theme-surface border border-theme-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-theme-text-secondary">Ingress 路由管理</p>
          <span className="text-[11px] text-theme-text-muted">总计 {globalIngressStats?.total || 0} · 就绪 {globalIngressStats?.ready || 0} · 无效 {globalIngressStats?.stale_service_ingress || 0}</span>
          <button onClick={() => void loadGlobalIngress()} className="px-3 py-1.5 rounded-lg bg-theme-elevated text-theme-text-secondary text-xs font-medium hover:bg-theme-elevated">刷新</button>
          <button
            onClick={toggleSelectAllIngress}
            disabled={globalIngressItems.length === 0}
            className="px-3 py-1.5 rounded-lg bg-theme-elevated text-theme-text-secondary text-xs font-medium hover:bg-theme-elevated disabled:opacity-50"
          >
            全选
          </button>
          <button
            onClick={deleteSelectedIngress}
            disabled={globalIngressActionLoading || selectedIngressRouteIds.size === 0}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
          >
            批量删除
          </button>
          <button
            onClick={cleanupStaleIngress}
            disabled={globalIngressActionLoading}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            一键清理无效
          </button>
          <button
            onClick={clearAllIngress}
            disabled={globalIngressActionLoading}
            className="px-3 py-1.5 rounded-lg bg-theme-surface text-white text-xs font-medium hover:bg-theme-elevated disabled:opacity-50"
          >
            清空全部Ingress
          </button>
          <span className="text-[11px] text-theme-text-muted ml-auto">已选 {selectedIngressRouteIds.size}</span>
        </div>
        <div className="border border-theme-border rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-theme-elevated">
              <tr className="text-[10px] font-semibold uppercase tracking-widest text-theme-text-muted">
                <th className="px-3 py-2">选</th>
                <th className="px-3 py-2">Host/Path</th>
                <th className="px-3 py-2">节点</th>
                <th className="px-3 py-2">关联服务</th>
                <th className="px-3 py-2">端口/协议</th>
                <th className="px-3 py-2">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {globalIngressLoading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-theme-text-muted">加载Ingress中...</td></tr>
              )}
              {!globalIngressLoading && globalIngressItems.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-theme-text-muted">暂无Ingress路由</td></tr>
              )}
              {!globalIngressLoading && globalIngressItems.map((item) => (
                <tr key={item.route_id} className="hover:bg-theme-elevated">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIngressRouteIds.has(item.route_id)}
                      onChange={() => toggleSelectIngress(item.route_id)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-mono text-theme-text-secondary truncate max-w-[360px]">{item.host}{item.path}</div>
                    {item.access_url && (
                      <div className="mt-1">
                        <a
                          href={item.access_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-medium text-[11px] hover:bg-blue-500/15"
                        >
                          打开
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-theme-text-secondary font-semibold">
                      {agentByKey.get(item.agent_key)?.hostname || item.agent_hostname || item.agent_key}
                    </div>
                    <div className="text-[11px] text-theme-text-muted font-mono">{item.agent_key}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-theme-text-secondary">{item.associated_service_name || '-'}</div>
                    {!item.service_exists && <div className="text-[10px] text-amber-400 font-semibold">服务不在位</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-theme-text-secondary">
                      {item.target_port} / Ingress {item.tls_enabled ? 'HTTPS' : 'HTTP'} / 后端 {String(item.backend_protocol || 'http').toUpperCase()}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status || (item.is_stale_service_ingress ? 'error' : 'ready')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-theme-surface border border-theme-border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="过滤服务名 / 模板名 / 节点"
            className="form-input w-full pl-10 pr-3 py-2"
          />
        </div>
        <select
          value={nodeFilter}
          onChange={(e) => setNodeFilter(e.target.value)}
          className="form-select"
        >
          <option value="all">全部节点</option>
          {nodeOptions.map((node) => (
            <option key={node.key} value={node.key}>
              {node.hostname} ({node.key.slice(0, 8)}...)
            </option>
          ))}
        </select>
        <select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
          className="form-select"
        >
          <option value="all">全部模板</option>
          {templateOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={serviceStateFilter}
          onChange={(e) => setServiceStateFilter(e.target.value as any)}
          className="form-select"
        >
          <option value="all">全部状态</option>
          <option value="running">运行中</option>
          <option value="stopped">已停止</option>
          <option value="offline_agent">节点离线</option>
          <option value="stale">状态过期</option>
          <option value="error">异常</option>
        </select>
      </div>

      <div className="bg-theme-surface border border-theme-border rounded-xl p-4 flex flex-wrap items-center gap-2">
        <button
          onClick={toggleSelectAllFiltered}
          disabled={!projectId || filteredServices.length === 0}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50 flex items-center gap-2"
        >
          <CheckSquare size={14} /> 全选筛选结果
        </button>
        <button
          onClick={() => void applyBatchAction('start', selectedItems)}
          disabled={!projectId || actionLoading || selectedItems.length === 0}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 批量启动
        </button>
        <button
          onClick={() => void applyBatchAction('stop', selectedItems)}
          disabled={!projectId || actionLoading || selectedItems.length === 0}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Square size={14} /> 批量停止
        </button>
        <button
          onClick={() => void applyBatchAction('update', selectedItems)}
          disabled={!projectId || actionLoading || selectedItems.length === 0}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} /> 批量更新
        </button>
        <button
          onClick={() => void applyBatchAction('delete', selectedItems)}
          disabled={!projectId || actionLoading || selectedItems.length === 0}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Trash2 size={14} /> 批量删除
        </button>
        <button
          onClick={() => void handleDeleteByTemplate()}
          disabled={!projectId || actionLoading || templateFilter === 'all'}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-theme-surface text-white hover:bg-theme-elevated disabled:opacity-50"
        >
          按模板删除实例
        </button>
        <button
          onClick={cleanupOfflineServices}
          disabled={!projectId || cleanupOfflineLoading}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/15 disabled:opacity-50 flex items-center gap-2"
        >
          {cleanupOfflineLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          一键清除OFFLINE
        </button>
        <div className="text-xs text-theme-text-muted ml-auto">
          已选 {selectedItems.length} / 当前结果 {filteredServices.length}
        </div>
        <div className="flex items-center gap-2 text-xs text-theme-text-secondary">
          <span>每页</span>
          <select
            value={servicePerPage}
            onChange={(e) => setServicePerPage(Number(e.target.value) || 50)}
            className="form-select text-xs"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span>页码 {servicePage}/{servicePageCount}</span>
          <button
            onClick={() => setServicePage((prev) => Math.max(1, prev - 1))}
            disabled={servicePage <= 1}
            className="px-2 py-1 rounded-lg border border-theme-border bg-theme-elevated disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={() => setServicePage((prev) => Math.min(servicePageCount, prev + 1))}
            disabled={servicePage >= servicePageCount}
            className="px-2 py-1 rounded-lg border border-theme-border bg-theme-elevated disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

 <div className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden">
        <table className="w-full table-fixed text-left">
          <thead className="bg-slate-100/50 border-b border-theme-border">
            <tr className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
              <th className="w-14 px-4 py-3">选择</th>
              <th className="w-[20%] px-4 py-3">服务标识</th>
              <th className="w-[20%] px-4 py-3">服务版本</th>
              <th className="w-[18%] px-4 py-3">服务模板 (ID/名称)</th>
              <th className="w-[22%] px-4 py-3">承载节点</th>
              <th className="w-[12%] px-4 py-3">网络暴露</th>
              <th className="w-[8%] px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {projectId && pagedServices.map((svc: any) => {
              const rowId = serviceRowId(svc);
              const ports = Object.entries(svc.ports || {});
              const portSummary = ports.length > 0
                ? ports.map(([proto, port]) =>`${proto}:${port}`).join('  |  ')
                : 'Isolated';
              return (
                <tr key={rowId} className="hover:bg-theme-elevated transition-all">
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.has(rowId)}
                      onChange={() => toggleSelectService(svc)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                      <button
                        onClick={() => void openServiceDetail(svc)}
                        className="min-w-0 truncate text-sm font-semibold text-theme-text-secondary hover:text-blue-400 transition-colors"
                        title="查看服务详情"
                      >
                        {svc.name}
                      </button>
                      <button
                        onClick={() => openTerminalWindowForService(svc, {
                          mode: 'shell',
                          container: '',
                          shell: '/bin/bash',
                          fallbackShell: '/bin/sh',
                        })}
                        disabled={!svc.agent_key || !!svc.is_stale}
                        title={svc.is_stale ? '服务状态已过期（stale），请先刷新服务发现' : '新窗口打开终端（默认 /bin/bash，失败回退 /bin/sh）'}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/15 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/15 disabled:opacity-50"
                      >
                        <TerminalSquare size={12} />
                        终端
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {(() => {
                      const versions = Array.isArray((svc as any).image_versions)
                        ? (svc as any).image_versions.map((item: any) => String(item || '').trim()).filter(Boolean)
                        : (svc.image ? [String(svc.image)] : []);
                      if (versions.length === 0) {
                        return <div className="text-[10px] text-theme-text-muted">-</div>;
                      }
                      const visible = versions.slice(0, 2);
                      const rest = versions.length - visible.length;
                      return (
                        <div className="space-y-1" title={versions.join('\n')}>
                          {visible.map((version: string, index: number) => (
                            <div key={`${version}-${index}`} className="truncate rounded-md border border-theme-border bg-theme-elevated px-2 py-1 text-[10px] font-mono text-theme-text-secondary">
                              {version}
                            </div>
                          ))}
                          {rest > 0 ? (
                            <div className="text-[10px] font-medium text-theme-text-muted">+{rest}</div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div
                      className="truncate text-xs font-mono text-theme-text-secondary"
                      title={`${svc.template_id ?`#${svc.template_id}` : '-'} / ${svc.template_name || '未识别'}`}
                    >
                      {svc.template_id ?`#${svc.template_id}` : '-'} / {svc.template_name || '未识别'}
                    </div>
                    {(() => {
                      const templateTags = Array.isArray(svc.template_tags)
                        ? svc.template_tags.map((item: any) => String(item || '').trim()).filter(Boolean)
                        : [];
                      if (templateTags.length === 0) {
                        return <div className="mt-1 text-[10px] text-theme-text-muted">-</div>;
                      }
                      const visible = templateTags.slice(0, 3);
                      const rest = templateTags.length - visible.length;
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-1" title={templateTags.join(', ')}>
                          {visible.map((tag: string) => (
                            <span key={tag} className="rounded-full border border-cyan-500/20 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-cyan-400">
                              {tag}
                            </span>
                          ))}
                          {rest > 0 ? (
                            <span className="rounded-full border border-theme-border bg-theme-elevated px-1.5 py-0.5 text-[10px] font-medium text-theme-text-secondary">
                              +{rest}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                      <span className="min-w-0 truncate text-xs font-medium text-theme-text-secondary" title={svc.agent_hostname || '-'}>
                        {svc.agent_hostname || '-'}
                      </span>
                      <span
                        className="shrink-0 rounded-md bg-theme-elevated px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-tight text-theme-text-muted"
                        title={svc.agent_key || ''}
                      >
                        {(svc.agent_key || '').slice(0, 12) || '-'}
                      </span>
                      <span className={`shrink-0 text-[10px] font-medium uppercase ${svc.agent_online ? 'text-green-400' : 'text-rose-400'}`}>
                        节点{svc.agent_online ? '在线' : '离线'}
                      </span>
                      <button
                        onClick={() => void ensureAgentConsoleIngressAndOpen(svc)}
                        disabled={!svc.agent_key || !svc.agent_online || openingAgentConsoleKey === svc.agent_key}
                        title={svc.agent_online ? '打开承载节点的 TTYD 终端（必要时自动创建 11198 Ingress）' : '节点离线，无法打开 TTYD 终端'}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
                      >
                        {openingAgentConsoleKey === svc.agent_key ? <Loader2 size={12} className="animate-spin" /> : <TerminalSquare size={12} />}
                        TTYD
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div
                      className={`truncate text-[10px] font-medium uppercase ${ports.length > 0 ? 'text-blue-400' : 'italic text-theme-text-faint'}`}
                      title={portSummary}
                    >
                      {portSummary}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <StatusBadge status={String((svc as any).badge_status || svc.status || 'unknown')} />
                      {svc.is_stale && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/15 text-amber-400 font-medium uppercase tracking-wider">
                          stale
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!projectId || filteredServices.length === 0) && !loading && (
              <tr>
                <td colSpan={7} className="py-28 text-center">
                  <p className="text-sm font-semibold text-theme-text-muted uppercase tracking-widest">
                    {projectId ? '未检索到符合条件的服务实例' : '请先选择项目'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    {selectedService && (
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-6 flex items-center justify-center" onClick={closeServiceDetail}>
 <div className="w-full max-w-6xl h-[84vh] bg-theme-surface rounded-2xl border border-theme-border overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">服务详情</p>
              <h3 className="text-lg font-semibold text-theme-text-primary mt-1">
                {selectedService.name}
                <span className="ml-3 text-xs text-theme-text-muted font-mono">{selectedService.agent_hostname || selectedService.agent_key}</span>
              </h3>
            </div>
            <button onClick={closeServiceDetail} className="p-2 rounded-xl text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary">
              <X size={16} />
            </button>
          </div>

          {detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-slate-50 to-slate-50 border border-theme-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">服务状态</p>
                    <StatusBadge status={serviceDetail?.real_status?.status || selectedService.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-theme-text-muted">启用状态</div><div className="font-medium text-theme-text-secondary">{serviceDetail?.enabled ? 'enabled' : 'disabled'}</div>
                    <div className="text-theme-text-muted">容器总数</div><div className="font-medium text-theme-text-secondary">{serviceDetail?.real_status?.total ?? 0}</div>
                    <div className="text-theme-text-muted">运行容器</div><div className="font-medium text-emerald-400">{serviceDetail?.real_status?.running ?? 0}</div>
                    <div className="text-theme-text-muted">模板</div><div className="font-medium text-theme-text-secondary truncate">{selectedService.template_name || '-'}</div>
                    <div className="text-theme-text-muted">节点</div><div className="font-mono text-[11px] text-theme-text-secondary truncate">{selectedService.agent_key || '-'}</div>
                    <div className="text-theme-text-muted">主机</div><div className="font-medium text-theme-text-secondary truncate">{selectedService.agent_hostname || '-'}</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-theme-elevated to-blue-500/10 border border-theme-border rounded-xl p-4">
                  <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase mb-2">实时终端（新窗口）</p>
                  {selectedService?.is_stale && (
                    <div className="mb-2 px-3 py-2 rounded-xl border border-amber-500/20 bg-amber-500/15 text-amber-400 text-xs font-medium">
                      当前服务状态为 stale，可能已被删除或离线。请先刷新服务发现后再尝试终端连接。
                    </div>
                  )}
                  {serviceDetailError && (
                    <div className="mb-2 px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/15 text-rose-400 text-xs font-medium">
                      {serviceDetailError}
                    </div>
                  )}
                  <div className="space-y-2.5">
                    <select
                      value={execContainer}
                      onChange={(e) => setExecContainer(e.target.value)}
                      className="form-select w-full text-xs"
                    >
                      <option value="">自动选择容器</option>
                      {resolveContainers(serviceDetail).map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={terminalMode}
                      onChange={(e) => setTerminalMode(e.target.value === 'shell' ? 'shell' : 'attach')}
                      className="form-select w-full text-xs"
                    >
                      <option value="attach">Attach 模式</option>
                      <option value="shell">新建 Shell</option>
                    </select>
                    <input
                      value={terminalShell}
                      onChange={(e) => setTerminalShell(e.target.value)}
                      placeholder="/bin/bash 或 /bin/sh"
                      disabled={terminalMode === 'attach'}
                      className="form-input w-full text-xs disabled:opacity-50"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openServiceTerminalWindow('attach')}
                        disabled={terminalDisabled}
                        title={terminalDisabledHint}
                        className="px-3 py-2 rounded-xl bg-theme-surface text-white text-xs font-medium hover:bg-theme-elevated flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <TerminalSquare size={14} /> Attach
                      </button>
                      <button
                        onClick={() => openServiceTerminalWindow('shell')}
                        disabled={terminalDisabled}
                        title={terminalDisabledHint}
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <TerminalSquare size={14} /> Shell
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-slate-50 to-slate-50 border border-theme-border rounded-xl p-4">
                  <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase mb-2">快捷操作</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => void loadServiceLogs(selectedService)} className="px-3 py-2 rounded-xl bg-theme-surface border border-theme-border text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated transition-colors">刷新日志</button>
                    <button onClick={() => selectedService && loadIngressRoutesForService(selectedService)} className="px-3 py-2 rounded-xl bg-theme-surface border border-theme-border text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated transition-colors">刷新转发路由</button>
                    <button onClick={closeServiceDetail} className="px-3 py-2 rounded-xl bg-theme-surface text-xs font-medium text-white hover:bg-theme-elevated transition-colors">关闭详情</button>
                  </div>
                </div>
              </div>

 <div className="bg-theme-surface rounded-xl border border-theme-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">动态 WEB 转发（HTTP/HTTPS）</p>
                  <button
                    onClick={() => selectedService && loadIngressRoutesForService(selectedService)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-theme-elevated text-theme-text-secondary"
                  >
                    刷新路由
                  </button>
                </div>

                {templateWebPortPresets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-theme-text-secondary">模板WEB端口（快速创建）</p>
                    <div className="flex flex-wrap gap-2">
                      {templateWebPortPresets.map((preset: any, idx: number) => (
                        <button
                          key={`preset-${idx}`}
                          onClick={() => {
                            const port = Number(preset?.port || 0);
                            if (!port) return;
                            const protocol = String(preset?.backend_protocol || preset?.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http';
                            setIngressTargetPort(port);
                            setIngressTlsEnabled(preset?.ingress_tls_enabled !== undefined ? preset?.ingress_tls_enabled !== false : preset?.tls_enabled !== false);
                            setBackendProtocol(protocol as 'http' | 'https');
                            setIngressPath(String(preset?.path || '/'));
                            setIngressWebsocketEnabled(preset?.websocket_enabled !== false);
                            setIngressHostPrefix(buildRandomIngressPrefix(`${selectedService?.name || 'svc'}-${port}`));
                          }}
                          className="px-3 py-2 rounded-xl border border-blue-500/20 bg-blue-500/15 text-blue-400 text-xs font-medium hover:bg-blue-500/15"
                        >
                          {preset?.name || 'WEB'} · {preset?.port} · 后端{String(preset?.backend_protocol || preset?.protocol || 'http').toUpperCase()} · Ingress{(preset?.ingress_tls_enabled ?? preset?.tls_enabled) !== false ? 'HTTPS' : 'HTTP'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                  <input
                    value={ingressTargetPort || ''}
                    onChange={(e) => setIngressTargetPort(Number(e.target.value || 0))}
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="目标端口"
                    className="form-input md:col-span-1 text-xs"
                  />
                  <select
                    value={ingressTlsEnabled ? 'https' : 'http'}
                    onChange={(e) => setIngressTlsEnabled(e.target.value === 'https')}
                    className="form-select md:col-span-1 text-xs"
                  >
                    <option value="https">Ingress HTTPS</option>
                    <option value="http">Ingress HTTP</option>
                  </select>
                  <select
                    value={backendProtocol}
                    onChange={(e) => setBackendProtocol(e.target.value === 'https' ? 'https' : 'http')}
                    className="form-select md:col-span-1 text-xs"
                  >
                    <option value="http">后端 HTTP</option>
                    <option value="https">后端 HTTPS</option>
                  </select>
                  <input
                    value={ingressPath}
                    onChange={(e) => setIngressPath(e.target.value)}
                    placeholder="Path (默认 /)"
                    className="form-input md:col-span-1 text-xs"
                  />
                  <input
                    value={ingressHostPrefix}
                    onChange={(e) => setIngressHostPrefix(e.target.value)}
                    placeholder="Host 前缀"
                    className="form-input md:col-span-2 text-xs"
                  />
                  <button
                    onClick={createServiceIngress}
                    disabled={ingressCreating || !ingressTargetPort}
                    className="md:col-span-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    {ingressCreating ? '创建中...' : '创建转发'}
                  </button>
                </div>
                <div className="flex items-center gap-5 text-xs">
                  <label className="flex items-center gap-2 text-theme-text-secondary">
                    <input
                      type="checkbox"
                      checked={ingressWebsocketEnabled}
                      onChange={(e) => setIngressWebsocketEnabled(e.target.checked)}
                    />
                    启用 WebSocket
                  </label>
                  <span className="text-theme-text-muted">Ingress HTTPS 控制外部访问证书；后端 HTTP/HTTPS 控制 Nginx 回源协议</span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-theme-text-secondary">当前服务转发路由</p>
                  {ingressLoading && <p className="text-xs text-theme-text-muted">加载中...</p>}
                  {!ingressLoading && ingressRoutes.length === 0 && <p className="text-xs text-theme-text-muted">暂无路由</p>}
                  {!ingressLoading && ingressRoutes.map((route: any) => (
                    <div key={route.route_id} className="text-xs bg-theme-elevated border border-theme-border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                      <span className="font-mono text-theme-text-secondary truncate">
                        {route.host}{route.path} → {route.target_port} (Ingress {route.tls_enabled ? 'HTTPS' : 'HTTP'} / 后端 {String(route.backend_protocol || 'http').toUpperCase()})
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {route.access_url && (
                          <a href={route.access_url} target="_blank" rel="noreferrer" className="text-blue-400 font-medium hover:underline">打开</a>
                        )}
                        <button
                          onClick={() => void deleteServiceIngressRoute(route.route_id)}
                          className="text-rose-400 font-medium hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-theme-border bg-theme-surface p-4 text-theme-text-primary">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">服务日志</p>
                    <button onClick={() => void loadServiceLogs(selectedService)} className="rounded-lg border border-theme-border bg-theme-elevated px-2 py-1 text-[10px] text-theme-text-secondary">刷新</button>
                  </div>
                  <pre className="text-[11px] leading-tight font-mono whitespace-pre-wrap break-words h-[40vh] overflow-auto">{serviceLogs || '暂无日志输出'}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    {deployModalOpen && (
      <div
        className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm p-6 flex items-center justify-center"
        onClick={() => setDeployModalOpen(false)}
      >
        <div
 className="w-full max-w-6xl bg-theme-surface rounded-xl border border-theme-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">批量部署新服务</p>
              <h3 className="text-lg font-semibold text-theme-text-primary mt-1">模板 × 节点批量部署</h3>
            </div>
            <button onClick={() => setDeployModalOpen(false)} className="p-2 rounded-xl text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2 border border-theme-border bg-theme-elevated rounded-xl p-2">
              <button
                onClick={() => setDeployModalTab('scope')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${deployModalTab === 'scope' ? 'bg-theme-elevated text-blue-400 border border-blue-500/20' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                部署范围
              </button>
              <button
                onClick={() => setDeployModalTab('templates')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${deployModalTab === 'templates' ? 'bg-theme-elevated text-blue-400 border border-blue-500/20' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                模板选择
              </button>
              <button
                onClick={() => setDeployModalTab('agents')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${deployModalTab === 'agents' ? 'bg-theme-elevated text-blue-400 border border-blue-500/20' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                节点选择
              </button>
              <button
                onClick={() => setDeployModalTab('advanced')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${deployModalTab === 'advanced' ? 'bg-theme-elevated text-blue-400 border border-blue-500/20' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                高级参数
              </button>
            </div>

            {deployModalTab === 'scope' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <input
                  value={deployServiceSuffix}
                  onChange={(e) => setDeployServiceSuffix(e.target.value)}
                  placeholder="可选：服务名后缀，如 v2"
                  className="form-input text-xs"
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={deployPerNodeCount}
                  onChange={(e) => setDeployPerNodeCount(Math.max(1, Math.min(20, Number(e.target.value || 1))))}
                  placeholder="每节点每模板实例数"
                  className="form-input text-xs"
                />
              </div>
            )}

            {deployModalTab === 'templates' && (
              <div className="border border-theme-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-theme-elevated border-b border-theme-border flex items-center justify-between">
                  <p className="text-xs font-medium text-theme-text-secondary">选择模板</p>
                  <button
                    onClick={() => {
                      if (selectedDeployTemplateIds.size === deployTemplates.length && deployTemplates.length > 0) {
                        setSelectedDeployTemplateIds(new Set<number>());
                      } else {
                        setSelectedDeployTemplateIds(new Set<number>(deployTemplates.map((t) => Number(t.id))));
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-theme-elevated border border-theme-border text-theme-text-secondary"
                  >
                    {selectedDeployTemplateIds.size === deployTemplates.length && deployTemplates.length > 0 ? '取消全选' : '全选'}
                  </button>
                </div>
                <div className="max-h-[48vh] overflow-auto divide-y divide-theme-border">
                  {deployTemplatesLoading && (
                    <div className="px-4 py-10 text-center text-xs text-theme-text-muted">模板加载中...</div>
                  )}
                  {!deployTemplatesLoading && deployTemplates.length === 0 && (
                    <div className="px-4 py-10 text-center text-xs text-theme-text-muted">暂无可用模板</div>
                  )}
                  {!deployTemplatesLoading && deployTemplates.map((tpl) => {
                    const id = Number(tpl.id);
                    return (
                      <label key={`deploy-tpl-${id}`} className="px-4 py-2 flex items-start gap-2 hover:bg-theme-elevated cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDeployTemplateIds.has(id)}
                          onChange={() => toggleDeployTemplate(id)}
                          className="mt-0.5 w-4 h-4 accent-blue-600"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-theme-text-primary truncate">#{id} {tpl.name}</div>
                          <div className="text-[11px] text-theme-text-muted truncate">{tpl.description || '-'}</div>
                          <div className="text-[10px] text-theme-text-muted truncate">作者: {tpl.owner_name || tpl.owner_id || 'system'}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {deployModalTab === 'agents' && (
              <div className="border border-theme-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-theme-elevated border-b border-theme-border flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-theme-text-secondary">选择节点（仅在线可选）</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={deployAgentSearch}
                      onChange={(e) => setDeployAgentSearch(e.target.value)}
                      placeholder="过滤节点: 主机名 / IP / Key"
                      className="form-input text-[11px]"
                    />
                    <button
                      onClick={toggleAllDeployAgents}
                      className="text-[10px] px-2 py-1 rounded-lg bg-theme-elevated border border-theme-border text-theme-text-secondary whitespace-nowrap"
                    >
                      全选筛选结果
                    </button>
                  </div>
                </div>
                <div className="max-h-[48vh] overflow-auto divide-y divide-theme-border">
                  {deployAgentsLoading && (
                    <div className="px-4 py-10 text-center text-xs text-theme-text-muted">节点加载中...</div>
                  )}
                  {!deployAgentsLoading && filteredDeployAgents.length === 0 && (
                    <div className="px-4 py-10 text-center text-xs text-theme-text-muted">暂无匹配节点</div>
                  )}
                  {!deployAgentsLoading && filteredDeployAgents.map((agent) => {
                    const online = agent.status === 'online';
                    return (
                      <label key={`deploy-agent-${agent.key}`} className={`px-4 py-2 flex items-start gap-2 ${online ? 'hover:bg-theme-elevated cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          disabled={!online}
                          checked={selectedDeployAgentKeys.has(agent.key)}
                          onChange={() => toggleDeployAgent(agent.key)}
                          className="mt-0.5 w-4 h-4 accent-blue-600"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-theme-text-primary truncate">{agent.hostname || agent.key}</div>
                          <div className="text-[11px] text-theme-text-muted truncate">{agent.ip_address} · {agent.key}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {deployModalTab === 'advanced' && (
              <div className="space-y-3">
                <textarea
                  value={deployExtraParamsText}
                  onChange={(e) => setDeployExtraParamsText(e.target.value)}
                  placeholder='可选：额外参数 JSON，例如 {"env":{"DEBUG":"1"}}'
                  className="form-textarea w-full min-h-24 text-xs font-mono"
                />
                <TemplateLlmBindingEditor
                  projectId={projectId}
                  value={deployLlmBinding}
                  onChange={setDeployLlmBinding}
                  serviceOptions={deployServiceOptions}
                  title="部署前临时 LLM Provider 注入"
                  description="在模板当前结果基础上，为本次批量部署临时叠加一组 Provider。"
                />
              </div>
            )}

            <div className="text-xs text-theme-text-muted">
              预计提交任务数: {selectedDeployTemplateIds.size} 模板 × {selectedDeployAgentKeys.size} 节点 × {deployPerNodeCount} 实例 = {selectedDeployTemplateIds.size * selectedDeployAgentKeys.size * deployPerNodeCount}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-theme-border flex items-center justify-end gap-2">
            <button
              onClick={() => setDeployModalOpen(false)}
              disabled={deploying}
              className="px-4 py-2 rounded-xl border border-theme-border text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={() => void executeBatchDeployFromModal()}
              disabled={deploying}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {deploying ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              提交批量部署
            </button>
          </div>
        </div>
      </div>
    )}
    {feedbackNodes}
    </>
  );
};