
import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  RefreshCw,
  Loader2,
  Server,
  Info,
  Cpu,
  ShieldCheck,
  Activity,
  Box,
  History,
  Terminal,
  Clock,
  ExternalLink,
  ShieldAlert,
  Globe,
  Database,
  Layers,
  Container,
  HardDrive,
  Network,
  Cpu as CpuIcon,
  Monitor,
  TerminalSquare,
  ArrowUpRight,
  Hash,
  ChevronRight,
  Zap,
  Trash2,
  FileText,
  Search,
  Check,
  CheckSquare,
  X,
  SquareTerminal
} from 'lucide-react';
import { Agent, AgentService, AsyncTask, DaemonAgentInfo, DaemonService, EnvTemplate, AgentTtydConnectionInfo, AgentIngressRouteInfo, TemplateLlmProviderBinding, AgentStatusEvent, AgentDiagnostics } from '../../types/types';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';
import { TemplateLlmBindingEditor } from './llm-binding/TemplateLlmBindingEditor';

interface AgentDetailPageProps {
  agentKey: string;
  projectId: string;
  onBack: () => void;
}

const buildRandomIngressPrefix = (base: string) => {
  const normalized = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'route';
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${normalized}-${randomPart}`;
};

export const AgentDetailPage: React.FC<AgentDetailPageProps> = ({ agentKey, projectId, onBack }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [services, setServices] = useState<AgentService[]>([]);
  const [selectedNodeService, setSelectedNodeService] = useState<AgentService | null>(null);
  const [selectedNodeServiceDetail, setSelectedNodeServiceDetail] = useState<any>(null);
  const [selectedNodeServiceLogs, setSelectedNodeServiceLogs] = useState<string>('');
  const [selectedNodeServiceIngress, setSelectedNodeServiceIngress] = useState<any[]>([]);
  const [nodeServiceLoading, setNodeServiceLoading] = useState(false);
  const [nodeServiceActionLoading, setNodeServiceActionLoading] = useState<string>('');
  const [tasks, setTasks] = useState<AsyncTask[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'processes' | 'network' | 'disks' | 'services'>('overview');

  // Daemon Services State
  const [daemonServices, setDaemonServices] = useState<DaemonService[]>([]);
  const [daemonLoading, setDaemonLoading] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsContent, setLogsContent] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<DaemonService | null>(null);
  const [daemonAgentInfo, setDaemonAgentInfo] = useState<DaemonAgentInfo | null>(null);
  const [daemonAgentHealth, setDaemonAgentHealth] = useState<any>(null);
  const [ttydInfo, setTtydInfo] = useState<AgentTtydConnectionInfo | null>(null);
  const [ttydLoading, setTtydLoading] = useState(false);
  const [showTtydShell, setShowTtydShell] = useState(false);
  const [ingressRoutes, setIngressRoutes] = useState<AgentIngressRouteInfo[]>([]);
  const [ingressLoading, setIngressLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<AgentStatusEvent[]>([]);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusHistoryError, setStatusHistoryError] = useState('');
  const [statusHistoryLimit, setStatusHistoryLimit] = useState(20);
  const [statusHistoryClearing, setStatusHistoryClearing] = useState(false);
  const [agentDiagnostics, setAgentDiagnostics] = useState<AgentDiagnostics | null>(null);
  const [agentDiagnosticsLoading, setAgentDiagnosticsLoading] = useState(false);
  const [agentDiagnosticsError, setAgentDiagnosticsError] = useState('');

  // Batch deploy templates for current agent
  const [isBatchDeployModalOpen, setIsBatchDeployModalOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [deployingBatch, setDeployingBatch] = useState(false);
  const [templates, setTemplates] = useState<EnvTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateNames, setSelectedTemplateNames] = useState<Set<string>>(new Set());
  const [deployLlmBinding, setDeployLlmBinding] = useState<TemplateLlmProviderBinding | null>(null);

  useEffect(() => {
    if (agentKey && projectId) {
      loadAllData();
    }
  }, [agentKey, projectId]);

  useEffect(() => {
    if (services.length === 0) {
      setSelectedNodeService(null);
      setSelectedNodeServiceDetail(null);
      setSelectedNodeServiceLogs('');
      setSelectedNodeServiceIngress([]);
      return;
    }
    const current = selectedNodeService ? services.find((svc) => svc.name === selectedNodeService.name) : null;
    const next = current || services[0];
    if (!selectedNodeService || selectedNodeService.name !== next.name) {
      setSelectedNodeService(next);
    }
  }, [services]);

  useEffect(() => {
    if (activeTab === 'services' && selectedNodeService) {
      void loadNodeServiceDetail(selectedNodeService);
    }
  }, [activeTab, selectedNodeService?.name, projectId]);

  const loadAllData = async () => {
    if (!agentKey || !projectId) return;
    setLoading(true);
    try {
      const [agentData, servicesData, tasksData] = await Promise.all([
        api.environment.getAgentDetail(agentKey, projectId),
        api.environment.getGlobalServices(projectId, { agent_key: agentKey, per_page: 500 }),
        api.environment.getTasks(projectId, { agent_key: agentKey })
      ]);
      setAgent(agentData);
      setServices(servicesData?.items || []);
      setTasks(tasksData?.task || []);

      let daemonInfo = agentData?.daemon_info || null;
      try {
        const daemonInfoResp = await api.environment.getDaemonAgentInfo(agentKey);
        if (daemonInfoResp?.data) daemonInfo = daemonInfoResp.data;
      } catch (e) {
        console.warn('Failed to load daemon agent info', e);
      }
      setDaemonAgentInfo(daemonInfo);
      try {
        const daemonHealthResp = await api.environment.getDaemonAgentHealth(agentKey);
      setDaemonAgentHealth(daemonHealthResp || null);
      } catch (e) {
        console.warn('Failed to load daemon agent health', e);
      }
      try {
        const ttydResp = await api.environment.getAgentTtydConnection(agentKey);
        setTtydInfo(ttydResp || null);
      } catch (e) {
        console.warn('Failed to load ttyd connection info', e);
      }
      await Promise.all([
        loadAgentStatusHistory(statusHistoryLimit),
        loadAgentDiagnostics(),
      ]);
    } catch (err) {
      console.error("Failed to load agent detail", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAgentStatusHistory = async (limit = statusHistoryLimit) => {
    if (!agentKey || !projectId) return;
    setStatusHistoryLoading(true);
    setStatusHistoryError('');
    try {
      const resp = await api.environment.getAgentStatusHistory(agentKey, projectId, limit);
      setStatusHistory(Array.isArray(resp?.items) ? resp.items : []);
    } catch (err: any) {
      console.error('Failed to load agent status history', err);
      setStatusHistoryError(err?.message || '记录加载失败');
      setStatusHistory([]);
    } finally {
      setStatusHistoryLoading(false);
    }
  };

  const loadAgentDiagnostics = async () => {
    if (!agentKey || !projectId) return;
    setAgentDiagnosticsLoading(true);
    setAgentDiagnosticsError('');
    try {
      const resp = await api.environment.getAgentDiagnostics(agentKey, projectId);
      setAgentDiagnostics(resp || null);
    } catch (err: any) {
      console.error('Failed to load agent diagnostics', err);
      setAgentDiagnostics(null);
      setAgentDiagnosticsError(err?.message || '诊断加载失败');
    } finally {
      setAgentDiagnosticsLoading(false);
    }
  };

  const handleClearAgentStatusHistory = async () => {
    if (!agentKey || !projectId) return;
    const confirmed = await showConfirm({
      title: '清空上下线记录',
      message: `确认清空节点 ${agent?.hostname || agentKey} 的上下线记录？此操作不可恢复。`,
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setStatusHistoryClearing(true);
    try {
      const resp = await api.environment.clearAgentStatusHistory(agentKey, projectId);
      notify(resp?.message || '已清空节点上下线记录', 'success');
      await loadAgentStatusHistory(statusHistoryLimit);
    } catch (err: any) {
      notify(err?.message || '清空上下线记录失败', 'error');
    } finally {
      setStatusHistoryClearing(false);
    }
  };

  const loadNodeServiceDetail = async (svc: AgentService) => {
    if (!svc?.agent_key) return;
    setNodeServiceLoading(true);
    try {
      const [detailResp, logsResp, ingressResp] = await Promise.all([
        api.environment.getAgentServiceDetail(svc.agent_key, svc.name),
        api.environment.getAgentServiceLogs(svc.agent_key, svc.name, 300),
        api.environment.getGlobalIngress(projectId),
      ]);

      const ingressItems = (ingressResp?.items || []).filter((route: any) => {
        const routeService = String(
          route?.associated_service_name ||
          route?.metadata?.service_name ||
          route?.metadata?.associated_service_name ||
          ''
        ).trim();
        return routeService === svc.name;
      });

      setSelectedNodeServiceDetail(detailResp || null);
      setSelectedNodeServiceLogs(String(logsResp?.logs || logsResp?.error || '').trim());
      setSelectedNodeServiceIngress(ingressItems);
    } catch (err: any) {
      console.error('Failed to load node service detail', err);
      setSelectedNodeServiceDetail(null);
      setSelectedNodeServiceLogs(`日志加载失败: ${err?.message || err}`);
      setSelectedNodeServiceIngress([]);
    } finally {
      setNodeServiceLoading(false);
    }
  };

  const handleNodeServiceAction = async (svc: AgentService, action: 'start' | 'stop' | 'delete') => {
    if (!svc?.agent_key) return;
    if (action === 'delete') {
      const confirmed = await showConfirm({
        title: '删除节点服务',
        message: `确认删除服务 ${svc.name}？系统会先停止服务，再删除绑定的 Ingress。`,
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }
    setNodeServiceActionLoading(`${action}:${svc.name}`);
    try {
      if (action === 'start') {
        await api.environment.startAgentService(svc.agent_key, svc.name);
      } else if (action === 'stop') {
        await api.environment.stopAgentService(svc.agent_key, svc.name);
      } else {
        await api.environment.deleteAgentService(svc.agent_key, svc.name, projectId);
      }
      notify(
        action === 'delete' ? `服务 ${svc.name} 已删除` : `服务 ${svc.name} ${action === 'start' ? '启动' : '停止'}操作已提交`,
        'success'
      );
      await loadAllData();
      if (action !== 'delete') {
        await loadNodeServiceDetail(svc);
      }
    } catch (err: any) {
      console.error(`Failed to ${action} node service`, err);
      notify(err?.message || `服务${action}失败`, 'error');
    } finally {
      setNodeServiceActionLoading('');
    }
  };

  const handleDeepHealthCheck = async () => {
    try {
      const health = await api.environment.getAgentHealth(agentKey);
      notify(JSON.stringify(health, null, 2), 'info', '健康检查结果');
    } catch (err) {
      notify("健康检查失败", 'error');
    }
  };

  // Daemon Services Functions
  const loadDaemonServices = async () => {
    if (!agentKey) return;
    setDaemonLoading(true);
    try {
      const response = await api.environment.getDaemonServices(agentKey);
      setDaemonServices(response?.data?.services || []);
    } catch (err) {
      console.error("Failed to load daemon services", err);
      setDaemonServices([]);
    } finally {
      setDaemonLoading(false);
    }
  };

  const loadDaemonAgentInfo = async () => {
    if (!agentKey) return;
    try {
      const [infoResp, healthResp] = await Promise.all([
        api.environment.getDaemonAgentInfo(agentKey),
        api.environment.getDaemonAgentHealth(agentKey)
      ]);
      setDaemonAgentInfo(infoResp?.data || null);
      setDaemonAgentHealth(healthResp || null);
    } catch (err) {
      console.error("Failed to load daemon agent info", err);
    }
  };

  const loadTtydConnection = async () => {
    if (!agentKey) return;
    setTtydLoading(true);
    try {
      const resp = await api.environment.getAgentTtydConnection(agentKey);
      setTtydInfo(resp || null);
    } catch (err) {
      console.error("Failed to load ttyd connection info", err);
      setTtydInfo(null);
    } finally {
      setTtydLoading(false);
    }
  };

  const loadIngressRoutes = async () => {
    if (!agentKey || !projectId) return;
    setIngressLoading(true);
    try {
      const resp = await api.environment.listAgentIngressRoutes(agentKey, projectId);
      setIngressRoutes(resp?.items || []);
    } catch (err) {
      console.error('Failed to load ingress routes', err);
      setIngressRoutes([]);
    } finally {
      setIngressLoading(false);
    }
  };

  const handleCreateIngressRoute = async (targetPort: number, websocketEnabled: boolean) => {
    try {
      await api.environment.createAgentIngressRoute(agentKey, {
        project_id: projectId,
        target_port: targetPort,
        host_prefix: buildRandomIngressPrefix(`${agentKey}-${targetPort}`),
        websocket_enabled: websocketEnabled,
        force_recreate: true,
        metadata: {
          ingress_scope: 'agent_console',
          source: 'agent-detail'
        }
      });
      await loadIngressRoutes();
    } catch (err) {
      console.error('Failed to create ingress route', err);
      const message = err instanceof Error ? err.message : '创建Ingress路由失败';
      notify(message || '创建Ingress路由失败', 'error');
    }
  };

  const handleDeleteIngressRoute = async (routeId: string) => {
    try {
      await api.environment.deleteAgentIngressRoute(agentKey, routeId, projectId);
      await loadIngressRoutes();
    } catch (err) {
      console.error('Failed to delete ingress route', err);
      notify('删除Ingress路由失败', 'error');
    }
  };

  const handleDaemonServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    try {
      let result;
      if (action === 'start') {
        result = await api.environment.startDaemonService(agentKey, serviceName);
      } else if (action === 'stop') {
        result = await api.environment.stopDaemonService(agentKey, serviceName);
      } else {
        result = await api.environment.restartDaemonService(agentKey, serviceName);
      }

      if (result?.code === 0) {
        await loadDaemonServices();
        notify('操作已提交', 'success');
      } else {
        notify(`操作失败: ${result?.message || '未知错误'}`, 'error');
      }
    } catch (err) {
      console.error(`Failed to ${action} daemon service`, err);
      notify(`操作失败: ${err}`, 'error');
    }
  };

  const handleViewLogs = async (serviceName: string) => {
    const service = daemonServices.find(s => s.name === serviceName);
    setSelectedService(service || null);
    setShowLogsModal(true);
    setLogsLoading(true);
    try {
      const response = await api.environment.getDaemonServiceLogs(agentKey, serviceName, 'stdout', 200);
      setLogsContent(response?.data?.lines || []);
    } catch (err) {
      console.error("Failed to load service logs", err);
      setLogsContent(['加载日志失败']);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const pageSize = 200;
      let page = 1;
      let total = 0;
      let all: EnvTemplate[] = [];
      do {
        const res = await api.environment.getTemplates(page, pageSize);
        const pageData = res.templates || [];
        total = res.total || 0;
        all = all.concat(pageData);
        page += 1;
      } while (all.length < total);
      setTemplates(all);
    } catch (err) {
      console.error('Failed to load templates', err);
      notify('获取模板列表失败', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const openBatchDeployModal = async () => {
    if (!projectId || !agentKey) return;
    setTemplateSearch('');
    setSelectedTemplateNames(new Set());
    setDeployLlmBinding(null);
    setIsBatchDeployModalOpen(true);
    await loadTemplates();
  };

  const filteredTemplates = useMemo(() => {
    const keyword = templateSearch.trim().toLowerCase();
    if (!keyword) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(keyword) ||
      (t.description || '').toLowerCase().includes(keyword)
    );
  }, [templates, templateSearch]);

  const toggleTemplateSelect = (name: string) => {
    setSelectedTemplateNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAllFilteredTemplates = () => {
    if (filteredTemplates.length === 0) return;
    setSelectedTemplateNames(prev => {
      const next = new Set(prev);
      const allSelected = filteredTemplates.every(t => next.has(t.name));
      if (allSelected) {
        filteredTemplates.forEach(t => next.delete(t.name));
      } else {
        filteredTemplates.forEach(t => next.add(t.name));
      }
      return next;
    });
  };

  const buildServiceName = (templateName: string) => {
    const normalized = templateName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    return `${normalized}-${agentKey.slice(0, 6)}`;
  };

  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateNames.has(template.name)),
    [templates, selectedTemplateNames]
  );

  const deployServiceOptions = useMemo(() => {
    if (selectedTemplates.length !== 1) return [];
    const services = selectedTemplates[0]?.metadata?.parsed_compose?.services;
    return services && typeof services === 'object' ? Object.keys(services) : [];
  }, [selectedTemplates]);

  const executeBatchDeploy = async () => {
    if (!projectId || !agentKey || selectedTemplateNames.size === 0) return;
    setDeployingBatch(true);
    try {
      const templateNames = Array.from(selectedTemplateNames.values()) as string[];
      const existingServices = await api.environment.getGlobalServices(projectId, { agent_key: agentKey, per_page: 500 });
      const existingServiceNames = new Set<string>((existingServices?.items || []).map((svc: any) => svc.name));
      const skippedTemplates: string[] = [];
      const deployments = templateNames.map(templateName => ({
        service_name: buildServiceName(templateName),
        agent_key: agentKey,
        template_name: templateName,
        extra_params: deployLlmBinding ? {
          llm_provider_binding: {
            provider_keys: deployLlmBinding.provider_keys,
            target_services: deployLlmBinding.target_services,
            source: 'deployment_override',
          }
        } : undefined,
      })).filter(item => {
        if (existingServiceNames.has(item.service_name)) {
          skippedTemplates.push(item.template_name);
          return false;
        }
        return true;
      });

      if (deployments.length === 0) {
        notify('检测到全部为重复部署，未提交任务', 'warning');
        return;
      }

      const result = await api.environment.deployBatch({
        project_id: projectId,
        deployments,
      });
      if (skippedTemplates.length > 0) {
        notify(`批量部署已提交：成功 ${result.success_count || 0}，失败 ${result.failed_count || 0}，跳过重复 ${skippedTemplates.length}`, (result.failed_count || 0) > 0 ? 'warning' : 'success');
      } else {
        notify(`批量部署已提交：成功 ${result.success_count || 0}，失败 ${result.failed_count || 0}`, (result.failed_count || 0) > 0 ? 'warning' : 'success');
      }
      setIsBatchDeployModalOpen(false);
      setSelectedTemplateNames(new Set());
      loadAllData();
    } catch (err) {
      console.error('Batch deploy failed', err);
      notify('批量部署失败', 'error');
    } finally {
      setDeployingBatch(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatIsoTime = (value?: string) => {
    if (!value) return 'N/A';
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return value;
    return dt.toLocaleString();
  };

  // 概览页加载基础服务与TTYD连接信息
  useEffect(() => {
    if (activeTab === 'overview' && agentKey) {
      loadDaemonServices();
      loadDaemonAgentInfo();
      loadTtydConnection();
      loadIngressRoutes();
    }
  }, [activeTab, agentKey]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin text-blue-600 mb-6" size={48} />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">正在与远程节点同步状态...</p>
      </div>
    );
  }

  if (!agent) return (
    <div className="p-20 text-center flex flex-col items-center gap-4">
      <ShieldAlert size={48} className="text-slate-200" />
      <p className="font-black text-slate-400 uppercase tracking-widest">未找到该节点资产或连接已中断</p>
      <button onClick={onBack} className="text-blue-600 font-bold hover:underline">返回列表</button>
    </div>
  );

  const sys = agent.system_info;
  const formatted = sys?.formatted;
  const daemonInfo = daemonAgentInfo || agent.daemon_info;

  return (
    <>
    <div className="p-10 space-y-8 animate-in slide-in-from-right duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group active:scale-95">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">{agent.hostname}</h2>
              <StatusBadge status={agent.status} />
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <Server size={14} /> 主机 IP: <span className="text-blue-600 font-black">{agent.ip_address}</span>
              </div>
              <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <Hash size={14} /> 节点唯一ID: <span className="text-slate-700 font-black font-mono">{agent.key}</span>
              </div>
              <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <Clock size={14} /> 运行时间: <span className="text-slate-600 font-black">{formatted?.uptime || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={loadAllData} className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshCw size={20} />
          </button>
          <button
            onClick={openBatchDeployModal}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20"
          >
            <Zap size={18} /> 批量部署模板
          </button>
          <button 
            onClick={handleDeepHealthCheck}
            className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10"
          >
            <ShieldCheck size={18} /> 执行全量巡检
          </button>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-[1.5rem] w-fit">
        {[
          { id: 'overview', label: '运行概览', icon: <Activity size={16} /> },
          { id: 'processes', label: '进程监控', icon: <Terminal size={16} /> },
          { id: 'network', label: '网卡配置', icon: <Network size={16} /> },
          { id: 'disks', label: '存储挂载', icon: <HardDrive size={16} /> },
          { id: 'services', label: '节点服务', icon: <Layers size={16} /> }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                   <div className="flex items-center justify-between">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <CpuIcon size={14} className="text-blue-500" /> 处理器负载
                     </h4>
                     <span className="text-xl font-black text-slate-800">{sys?.cpu?.usage_percent || 0}%</span>
                   </div>
                   <div className="space-y-4">
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${sys?.cpu?.usage_percent || 0}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">型号</p>
                          <p className="text-xs font-black text-slate-700 truncate">{sys?.cpu?.model || 'Generic x86_64'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">核心数</p>
                          <p className="text-xs font-black text-slate-700">{sys?.cpu?.logical_cores || 0} vCPU</p>
                        </div>
                      </div>
                   </div>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                   <div className="flex items-center justify-between">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Database size={14} className="text-indigo-500" /> 内存状态
                     </h4>
                     <span className="text-xl font-black text-slate-800">{sys?.memory?.usage_percent || 0}%</span>
                   </div>
                   <div className="space-y-4">
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${sys?.memory?.usage_percent || 0}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-50">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">总量</p>
                          <p className="text-xs font-black text-slate-700">{formatted?.memory?.total || '0 GB'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">已用</p>
                          <p className="text-xs font-black text-slate-700">{formatted?.memory?.used || '0 GB'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">空闲</p>
                          <p className="text-xs font-black text-slate-700">{formatted?.memory?.available || '0 GB'}</p>
                        </div>
                      </div>
                   </div>
                </div>
              </div>

              {/* Docker Runtime Section */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                 <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Container size={16} className="text-blue-600" /> Docker 运行时摘要
                    </h4>
                    <span className="text-xs font-black text-slate-400">VERSION: {sys?.docker?.version || 'N/A'}</span>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase">容器总量</p>
                       <p className="text-lg font-black text-slate-800">{sys?.docker?.containers_total || 0}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                       <p className="text-[9px] font-black text-blue-400 uppercase">运行中</p>
                       <p className="text-lg font-black text-blue-600">{sys?.docker?.containers_running || 0}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase">镜像数量</p>
                       <p className="text-lg font-black text-slate-800">{sys?.docker?.images_total || 0}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase">网络/卷</p>
                       <p className="text-lg font-black text-slate-800">{sys?.docker?.networks_total || 0} / {sys?.docker?.volumes_total || 0}</p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'processes' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                   <TerminalSquare size={16} /> 进程列表 (Top 10)
                 </h4>
                 <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                       <div className="w-2 h-2 rounded-full bg-blue-500" /> CPU
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                       <div className="w-2 h-2 rounded-full bg-indigo-500" /> Memory
                    </div>
                 </div>
              </div>
              <table className="w-full text-left">
                 <thead className="bg-slate-50/30 border-b border-slate-100 font-black text-[9px] text-slate-400 uppercase tracking-widest">
                    <tr>
                       <th className="px-8 py-4">PID</th>
                       <th className="px-6 py-4">进程名称 / 指令</th>
                       <th className="px-6 py-4">CPU %</th>
                       <th className="px-6 py-4">MEM %</th>
                       <th className="px-8 py-4 text-right">状态</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {sys?.processes_top?.map((p: any) => (
                       <tr key={p.pid} className="hover:bg-slate-50/50 transition-all group">
                          <td className="px-8 py-4 font-mono text-xs text-slate-400">{p.pid}</td>
                          <td className="px-6 py-4">
                             <p className="text-xs font-black text-slate-700">{p.name}</p>
                             <p className="text-[9px] text-slate-400 font-mono truncate max-w-[300px] mt-0.5" title={p.cmdline?.join(' ')}>
                                {p.cmdline?.join(' ') || 'N/A'}
                             </p>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">{p.cpu_percent.toFixed(1)}%</span>
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                   <div className="h-full bg-blue-500" style={{ width: `${p.cpu_percent}%` }} />
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">{p.memory_percent.toFixed(1)}%</span>
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                   <div className="h-full bg-indigo-500" style={{ width: `${p.memory_percent}%` }} />
                                </div>
                             </div>
                          </td>
                          <td className="px-8 py-4 text-right">
                             <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{p.status}</span>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6 animate-in fade-in">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {sys?.network_interfaces?.map((iface: any) => (
                     <div key={iface.name} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                           <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iface.is_up ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'}`}>
                                 <Network size={22} />
                              </div>
                              <div>
                                 <h5 className="text-sm font-black text-slate-800">{iface.name}</h5>
                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{iface.is_up ? 'Interface Up' : 'Interface Down'}</span>
                              </div>
                           </div>
                           {iface.is_up && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                        </div>
                        <div className="space-y-2 border-t border-slate-50 pt-4">
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold">IPv4 Address</span>
                              <span className="font-mono font-black text-blue-600">{iface.ip_address || 'Unassigned'}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold">MAC Address</span>
                              <span className="font-mono text-slate-500 uppercase">{iface.mac_address || 'N/A'}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold">Data Sent/Recv</span>
                              <span className="text-slate-700 font-black">
                                 {(iface.bytes_sent / 1024 / 1024).toFixed(1)} MB / {(iface.bytes_recv / 1024 / 1024).toFixed(1)} MB
                              </span>
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'disks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
               {formatted?.disks?.map((disk: any, idx: number) => (
                  <div key={idx} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6 group">
                     <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all">
                              <HardDrive size={22} />
                           </div>
                           <div>
                              <h5 className="text-sm font-black text-slate-800">{disk.device}</h5>
                              <p className="text-[10px] text-slate-400 font-bold truncate max-w-[150px]">MOUNT: {disk.mountpoint}</p>
                           </div>
                        </div>
                        <span className="text-xs font-black text-slate-700">{disk.usage_percent}</span>
                     </div>
                     <div className="space-y-2">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                           <div 
                              className={`h-full transition-all duration-1000 ${parseFloat(disk.usage_percent) > 90 ? 'bg-red-500' : 'bg-amber-500'}`} 
                              style={{ width: disk.usage_percent }} 
                           />
                        </div>
                        <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                           <span>USED: {disk.used}</span>
                           <span>FREE: {disk.free}</span>
                           <span>TOTAL: {disk.total}</span>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Zap size={16} className="text-blue-500" /> 节点服务
                  </h4>
                  <span className="text-[10px] font-black text-slate-400 uppercase">{services.length} 个服务</span>
                </div>

                {services.length === 0 ? (
                  <div className="py-24 text-center text-slate-300 italic text-sm">当前节点暂无聚合服务记录</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {services.map(svc => {
                      const isSelected = selectedNodeService?.name === svc.name;
                      const isBusy = nodeServiceActionLoading === `${svc.agent_key || agentKey}:${svc.name}`;
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => setSelectedNodeService(svc)}
                          className={`w-full text-left px-8 py-5 transition-all ${isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                                  {svc.name[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-black text-slate-800 break-all">{svc.name}</div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <StatusBadge status={svc.status || 'unknown'} />
                                    <span className="text-[10px] font-bold text-slate-400">
                                      模板：{svc.template_name || '未识别'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 break-all">{svc.image || 'N/A'}</div>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(svc.ports || {}).length > 0 ? (
                                  Object.entries(svc.ports || {}).map(([p, v]) => (
                                    <span key={p} className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-100">
                                      {p}➔{v}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-300 italic">无端口映射</span>
                                )}
                              </div>
                            </div>
                            <div
                              className="flex flex-wrap justify-end gap-2 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleNodeServiceAction(svc, 'start')}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black hover:bg-emerald-100 disabled:opacity-50"
                              >
                                启动
                              </button>
                              <button
                                type="button"
                                onClick={() => handleNodeServiceAction(svc, 'stop')}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-black hover:bg-amber-100 disabled:opacity-50"
                              >
                                停止
                              </button>
                              <button
                                type="button"
                                onClick={() => handleNodeServiceAction(svc, 'delete')}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-black hover:bg-red-100 disabled:opacity-50 flex items-center gap-1"
                              >
                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                删除
                              </button>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Agent 离线提示 */}
              {agent.status !== 'online' && (
                <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-center gap-4">
                  <ShieldAlert className="text-amber-600" size={24} />
                  <div>
                    <h4 className="font-black text-amber-800">节点离线</h4>
                    <p className="text-xs text-amber-600">无法获取守护进程服务状态，请检查节点连接</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={16} className="text-cyan-600" /> 诊断信息
                  </h4>
                  <button
                    onClick={() => void loadAgentDiagnostics()}
                    className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                    title="刷新诊断信息"
                  >
                    <RefreshCw size={16} className={agentDiagnosticsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  稳定快照模式：仅展示后端刷新线程与数据库快照，不触发实时探测。
                </p>

                {agentDiagnosticsError ? (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    诊断加载失败: {agentDiagnosticsError}
                  </div>
                ) : agentDiagnosticsLoading && !agentDiagnostics ? (
                  <div className="py-8 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="animate-spin" size={14} /> 正在加载诊断信息...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">当前状态</div>
                        <div className="mt-1 text-sm font-black text-slate-800">{agentDiagnostics?.agent_snapshot?.status || '-'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">最后心跳</div>
                        <div className="mt-1 text-xs font-mono text-slate-700">{formatIsoTime(agentDiagnostics?.agent_snapshot?.last_seen || undefined)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">刷新结果</div>
                        <div className={`mt-1 text-sm font-black ${agentDiagnostics?.refresh_diag?.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {agentDiagnostics?.refresh_diag?.success === undefined || agentDiagnostics?.refresh_diag?.success === null
                            ? '-'
                            : (agentDiagnostics?.refresh_diag?.success ? '成功' : '失败')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">诊断时间</div>
                        <div className="mt-1 text-xs font-mono text-slate-700">{formatIsoTime(agentDiagnostics?.generated_at || undefined)}</div>
                      </div>
                    </div>

                    {agentDiagnostics?.agent_snapshot?.status_reason ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {agentDiagnostics.agent_snapshot.status_reason}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs font-black text-slate-700 mb-3">刷新线程诊断</div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="text-slate-500">attempted_at</div>
                          <div className="font-mono text-slate-700">{formatIsoTime(agentDiagnostics?.refresh_diag?.attempted_at || undefined)}</div>
                          <div className="text-slate-500">completed_at</div>
                          <div className="font-mono text-slate-700">{formatIsoTime(agentDiagnostics?.refresh_diag?.completed_at || undefined)}</div>
                          <div className="text-slate-500">service_total</div>
                          <div className="font-mono text-slate-700">{String(agentDiagnostics?.refresh_diag?.service_total ?? '-')}</div>
                          <div className="text-slate-500">saved</div>
                          <div className="font-mono text-slate-700">{String(agentDiagnostics?.refresh_diag?.agent_saved ?? '-')}</div>
                          <div className="text-slate-500">skip(unhealthy)</div>
                          <div className="font-mono text-slate-700">{String(agentDiagnostics?.refresh_diag?.service_unhealthy_skipped ?? '-')}</div>
                          <div className="text-slate-500">pod</div>
                          <div className="font-mono text-slate-700 break-all">{agentDiagnostics?.refresh_diag?.pod_id || '-'}</div>
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600">
                          {agentDiagnostics?.refresh_diag?.message || '-'}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs font-black text-slate-700 mb-3">列表快照诊断</div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="text-slate-500">generated_at</div>
                          <div className="font-mono text-slate-700">{formatIsoTime(agentDiagnostics?.list_diag?.generated_at || undefined)}</div>
                          <div className="text-slate-500">memory_lock</div>
                          <div className="font-mono text-slate-700">
                            {agentDiagnostics?.list_diag?.memory_lock_acquired === undefined ? '-' : (agentDiagnostics?.list_diag?.memory_lock_acquired ? 'acquired' : 'timeout')}
                          </div>
                          <div className="text-slate-500">db_rows_count</div>
                          <div className="font-mono text-slate-700">{String(agentDiagnostics?.list_diag?.db_rows_count ?? '-')}</div>
                          <div className="text-slate-500">memory_agents_count</div>
                          <div className="font-mono text-slate-700">{String(agentDiagnostics?.list_diag?.memory_agents_count ?? '-')}</div>
                          <div className="text-slate-500">pod</div>
                          <div className="font-mono text-slate-700 break-all">{agentDiagnostics?.list_diag?.pod_id || '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-xs font-black text-slate-700 mb-3">上下线摘要（24h）</div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="text-emerald-700 font-black uppercase tracking-wider text-[10px]">上线次数</div>
                          <div className="mt-1 font-mono text-emerald-800">{String(agentDiagnostics?.event_diag?.up_count_24h ?? 0)}</div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="text-amber-700 font-black uppercase tracking-wider text-[10px]">下线次数</div>
                          <div className="mt-1 font-mono text-amber-800">{String(agentDiagnostics?.event_diag?.down_count_24h ?? 0)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                          <div className="text-slate-500 font-black uppercase tracking-wider text-[10px]">最新事件</div>
                          <div className="mt-1 text-slate-700 font-mono">
                            {agentDiagnostics?.event_diag?.latest_event?.from_status || '-'}
                            <span className="mx-1 text-slate-400">→</span>
                            {agentDiagnostics?.event_diag?.latest_event?.to_status || '-'}
                          </div>
                          <div className="mt-1 text-slate-500">
                            {agentDiagnostics?.event_diag?.latest_event?.reason_code || '-'} · {agentDiagnostics?.event_diag?.latest_event?.source || '-'} · pod: {agentDiagnostics?.event_diag?.latest_event?.pod_id || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock size={16} className="text-indigo-600" /> 节点上下线记录
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearAgentStatusHistory}
                      disabled={statusHistoryClearing || statusHistoryLoading || statusHistory.length === 0}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-black hover:bg-rose-700 disabled:opacity-50"
                    >
                      {statusHistoryClearing ? '清空中...' : '清空记录'}
                    </button>
                    <button
                      onClick={() => {
                        const next = statusHistoryLimit === 20 ? 100 : 20;
                        setStatusHistoryLimit(next);
                        void loadAgentStatusHistory(next);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-black hover:bg-slate-200"
                    >
                      {statusHistoryLimit === 20 ? '查看更多(100)' : '收起到20条'}
                    </button>
                    <button
                      onClick={() => loadAgentStatusHistory(statusHistoryLimit)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      title="刷新上下线记录"
                    >
                      <RefreshCw size={16} className={statusHistoryLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  仅记录状态边变化（online 与非online之间切换），每个节点最多保留最近100条。
                </p>

                {statusHistoryError ? (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    记录加载失败: {statusHistoryError}
                  </div>
                ) : statusHistoryLoading ? (
                  <div className="py-8 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="animate-spin" size={14} /> 正在加载上下线记录...
                  </div>
                ) : statusHistory.length === 0 ? (
                  <div className="py-8 text-xs text-slate-400">暂无上下线记录</div>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-3 py-2">时间</th>
                          <th className="px-3 py-2">方向</th>
                          <th className="px-3 py-2">状态变化</th>
                          <th className="px-3 py-2">原因</th>
                          <th className="px-3 py-2">来源</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statusHistory.map((item) => {
                          const toOnline = String(item.edge_state_to || '').toLowerCase() === 'online';
                          return (
                            <tr key={`${item.id}-${item.created_at || ''}`} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-[11px] font-mono text-slate-600 whitespace-nowrap">
                                {item.observed_at ? String(item.observed_at).replace('T', ' ').split('.')[0] : '-'}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${toOnline ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                  {item.direction || (toOnline ? '上线' : '下线')}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-700">
                                <span className="font-mono">{item.from_status || '-'}</span>
                                <span className="mx-1 text-slate-400">→</span>
                                <span className="font-mono">{item.to_status || '-'}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">
                                <div className="font-bold text-slate-700">{item.reason_code || '-'}</div>
                                <div className="text-[11px] text-slate-500">{item.reason_message || '-'}</div>
                              </td>
                              <td className="px-3 py-2 text-[11px] text-slate-500">
                                <div>{item.source || '-'}</div>
                                <div className="font-mono text-slate-400">pod: {item.pod_id || '-'}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <SquareTerminal size={16} className="text-emerald-600" /> TTYD 终端转发
                  </h4>
                  <button
                    onClick={loadTtydConnection}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                    title="刷新TTYD连接状态"
                  >
                    <RefreshCw size={16} className={ttydLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">HTTP 入口</p>
                    <p className="text-xs font-mono font-black text-slate-700 break-all">{ttydInfo?.http_url || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">WebSocket 入口</p>
                    <p className="text-xs font-mono font-black text-slate-700 break-all">{ttydInfo?.ws_url || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${ttydInfo?.reachable ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                    {ttydInfo?.reachable ? 'TTYD 可达' : 'TTYD 不可达'}
                  </span>
                  <button
                    onClick={() => ttydInfo?.http_url && window.open(ttydInfo.http_url, '_blank', 'noopener,noreferrer')}
                    disabled={!ttydInfo?.http_url}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <ExternalLink size={14} /> 新窗口打开终端
                  </button>
                  <button
                    onClick={() => setShowTtydShell(v => !v)}
                    disabled={!ttydInfo?.http_url}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                  >
                    <TerminalSquare size={14} /> {showTtydShell ? '收起内嵌终端' : '展开内嵌终端'}
                  </button>
                </div>

                {ttydInfo?.probe_error && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    探测错误: {ttydInfo.probe_error}
                  </p>
                )}

                {showTtydShell && ttydInfo?.http_url && (
                  <div className="mt-5 border border-slate-200 rounded-2xl overflow-hidden">
                    <iframe
                      src={ttydInfo.http_url}
                      title={`ttyd-${agentKey}`}
                      className="w-full h-[520px] bg-black"
                    />
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Globe size={16} className="text-blue-600" /> 动态 Ingress 转发
                  </h4>
                  <button
                    onClick={loadIngressRoutes}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="刷新转发规则"
                  >
                    <RefreshCw size={16} className={ingressLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  <button
                    onClick={() => handleCreateIngressRoute(11197, false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
                  >
                    创建 11197(Nacos Web) 转发
                  </button>
                  <button
                    onClick={() => handleCreateIngressRoute(11198, true)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
                  >
                    创建 11198(TTYD) 转发
                  </button>
                </div>

                {ingressLoading ? (
                  <div className="py-10 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="animate-spin" size={14} /> 正在加载Ingress路由...
                  </div>
                ) : ingressRoutes.length === 0 ? (
                  <div className="py-8 text-xs text-slate-400">暂无动态Ingress路由</div>
                ) : (
                  <div className="space-y-3">
                    {ingressRoutes.map(route => (
                      <div key={route.route_id} className="border border-slate-100 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-700">
                              {route.host}{route.path} - {route.target_port}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 font-mono break-all">
                              {route.access_url || 'N/A'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${route.status === 'ready' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                              {route.status}
                            </span>
                            <button
                              onClick={() => route.access_url && window.open(route.access_url, '_blank', 'noopener,noreferrer')}
                              disabled={!route.access_url}
                              className="px-2 py-1 text-xs bg-slate-900 text-white rounded-lg disabled:opacity-50"
                            >
                              打开
                            </button>
                            <button
                              onClick={() => handleDeleteIngressRoute(route.route_id)}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Info size={16} className="text-blue-500" /> Agent 运行信息
                  </h4>
                  <span className="text-[10px] font-black text-slate-400 uppercase">
                    状态: <span className="text-slate-700">{daemonInfo?.status || 'N/A'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Version</p>
                    <p className="text-sm font-black text-slate-800">{daemonInfo?.version || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Go/Platform</p>
                    <p className="text-sm font-black text-slate-800">{daemonInfo?.go_version || 'N/A'} / {daemonInfo?.platform || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">UUID / Project</p>
                    <p className="text-xs font-mono font-black text-slate-700 break-all">{daemonInfo?.uuid || 'N/A'} / {daemonInfo?.project_id || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Workspace / Server</p>
                    <p className="text-xs font-mono font-black text-slate-700 break-all">{daemonInfo?.workspace || 'N/A'} / {daemonInfo?.server || 'N/A'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase">总服务</p>
                    <p className="text-lg font-black text-slate-800">{daemonInfo?.services_total ?? 0}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                    <p className="text-[9px] font-black text-green-400 uppercase">运行中</p>
                    <p className="text-lg font-black text-green-600">{daemonInfo?.services_running ?? 0}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                    <p className="text-[9px] font-black text-red-400 uppercase">已停止</p>
                    <p className="text-lg font-black text-red-600">{daemonInfo?.services_stopped ?? 0}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-400 uppercase">异常服务</p>
                    <p className="text-lg font-black text-amber-600">{daemonInfo?.services_error ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Agent Uptime</p>
                    <p className="text-lg font-black text-slate-800">{formatUptime(daemonInfo?.uptime_seconds || 0)}</p>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 font-bold">
                  启动时间: <span className="font-black text-slate-700">{formatIsoTime(daemonInfo?.start_time)}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-bold mt-1">
                  健康检查: <span className="font-black text-slate-700">{daemonAgentHealth?.status || 'N/A'}</span>
                  <span className="ml-3 text-slate-400">{formatIsoTime(daemonAgentHealth?.timestamp)}</span>
                </div>

                {daemonInfo?.services && daemonInfo.services.length > 0 && (
                  <div className="mt-6 border border-slate-100 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">守护服务简表（来自 /api/v1/agent/info）</div>
                    <div className="divide-y divide-slate-50">
                      {daemonInfo.services.map(svc => (
                        <div key={svc.name} className="px-4 py-3 flex items-center justify-between text-xs">
                          <span className="font-black text-slate-800">{svc.name}</span>
                          <span className="text-slate-500 font-bold">
                            {svc.is_running ? 'RUNNING' : 'STOPPED'} / PID {svc.pid || 'N/A'} / UPTIME {formatUptime(svc.uptime_seconds || 0)} / FAIL {svc.fail_count} / MODE {svc.monitor_mode || 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 服务列表 */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Zap size={16} className="text-blue-500" /> 守护进程服务
                  </h4>
                  <button
                    onClick={async () => {
                      await Promise.all([loadDaemonServices(), loadDaemonAgentInfo()]);
                    }}
                    disabled={daemonLoading || agent.status !== 'online'}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={daemonLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {daemonLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
                    <p className="text-xs text-slate-400">正在加载服务状态...</p>
                  </div>
                ) : daemonServices.length === 0 ? (
                  <div className="py-20 text-center">
                    <Server className="text-slate-200 mx-auto mb-4" size={48} />
                    <p className="text-xs text-slate-300 italic">未发现守护进程服务</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {daemonServices.map(service => (
                      <div key={service.name} className="p-6 hover:bg-slate-50/50 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          {/* 服务信息 */}
                          <div className="flex items-start gap-4 flex-1">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                              service.is_running ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'
                            }`}>
                              <Zap size={22} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <h5 className="text-sm font-black text-slate-800">{service.name}</h5>
                                <StatusBadge status={service.is_running ? 'online' : 'offline'} />
                              </div>
                              <p className="text-xs text-slate-500 mb-3">{service.description}</p>

                              {/* 服务指标 */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="text-xs">
                                  <span className="text-slate-400 font-bold">PID:</span>
                                  <span className="text-slate-700 font-black ml-1">{service.pid || 'N/A'}</span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-slate-400 font-bold">运行时间:</span>
                                  <span className="text-slate-700 font-black ml-1">
                                    {formatUptime(service.uptime_seconds)}
                                  </span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-slate-400 font-bold">失败次数:</span>
                                  <span className={`font-black ml-1 ${service.fail_count > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                    {service.fail_count}
                                  </span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-slate-400 font-bold">监控模式:</span>
                                  <span className="text-slate-700 font-black ml-1">{service.monitor_mode}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 控制按钮 */}
                          <div className="flex gap-2 flex-shrink-0">
                            {service.is_running ? (
                              <>
                                <button
                                  onClick={() => handleDaemonServiceAction(service.name, 'restart')}
                                  className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-1"
                                >
                                  <RefreshCw size={14} /> 重启
                                </button>
                                <button
                                  onClick={() => handleDaemonServiceAction(service.name, 'stop')}
                                  className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1"
                                >
                                  <Activity size={14} /> 停止
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDaemonServiceAction(service.name, 'start')}
                                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1"
                              >
                                <Activity size={14} /> 启动
                              </button>
                            )}
                            <button
                              onClick={() => handleViewLogs(service.name)}
                              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                              title="查看日志"
                            >
                              <FileText size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 统计摘要 */}
              {daemonServices.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase">服务总数</p>
                    <p className="text-2xl font-black text-slate-800">{daemonServices.length}</p>
                  </div>
                  <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                    <p className="text-[9px] font-black text-green-400 uppercase">运行中</p>
                    <p className="text-2xl font-black text-green-600">
                      {daemonServices.filter(s => s.is_running).length}
                    </p>
                  </div>
                  <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                    <p className="text-[9px] font-black text-red-400 uppercase">已停止</p>
                    <p className="text-2xl font-black text-red-600">
                      {daemonServices.filter(s => !s.is_running).length}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-8">
          {activeTab === 'services' ? (
            <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl space-y-8 relative overflow-hidden group">
              <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-blue-500 opacity-5 blur-3xl group-hover:opacity-10 transition-opacity" />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">服务详情</p>
                  <p className="text-xs text-slate-400 mt-2">点击左侧服务后，在这里查看详情、Ingress 与日志</p>
                </div>
                {nodeServiceLoading && <Loader2 size={18} className="animate-spin text-slate-400" />}
              </div>

              {!selectedNodeService ? (
                <div className="bg-white/5 rounded-[2rem] p-6 text-sm text-slate-300">
                  请选择左侧一个服务
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="text-xl font-black break-all">{selectedNodeService.name}</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-2 break-all">{selectedNodeService.image || 'N/A'}</p>
                      </div>
                      <StatusBadge status={selectedNodeServiceDetail?.status || selectedNodeService.status || 'unknown'} />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                        <p className="text-[10px] font-black text-slate-400 uppercase">模板</p>
                        <p className="text-sm font-black mt-1">{selectedNodeService.template_name || '未识别'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">ID: {selectedNodeService.template_id ?? 'N/A'}</p>
                      </div>
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                        <p className="text-[10px] font-black text-slate-400 uppercase">节点</p>
                        <p className="text-sm font-black mt-1">{selectedNodeService.agent_hostname || agent?.hostname || agentKey}</p>
                        <p className="text-[11px] text-slate-400 mt-1 break-all">{selectedNodeService.agent_key || agentKey}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">服务绑定的 Ingress</p>
                    {selectedNodeServiceIngress.length === 0 ? (
                      <div className="bg-white/5 rounded-2xl p-4 text-sm text-slate-300">当前服务未绑定 Ingress</div>
                    ) : (
                      <div className="space-y-3">
                        {selectedNodeServiceIngress.map((route: any) => {
                          const url = route.url || route.http_url || route.https_url || '';
                          return (
                            <div key={route.id || route.host} className="bg-white/5 rounded-2xl p-4 border border-white/10">
                              <p className="text-sm font-black break-all">{route.host || 'N/A'}{route.path || '/'}</p>
                              <p className="text-[11px] text-slate-400 mt-2 break-all">{url || '无访问地址'}</p>
                              {url && (
                                <button
                                  type="button"
                                  onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                  className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-1"
                                >
                                  <ExternalLink size={12} /> 打开
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">实时日志</p>
                    <div className="bg-black/40 rounded-2xl p-4 max-h-72 overflow-auto text-[11px] font-mono whitespace-pre-wrap break-words text-slate-100 border border-white/10">
                      {selectedNodeServiceLogs || '暂无日志'}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">运行态详情</p>
                    <div className="bg-white/5 rounded-2xl p-4 max-h-80 overflow-auto border border-white/10">
                      <pre className="text-[11px] text-slate-100 whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedNodeServiceDetail || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl space-y-8 relative overflow-hidden group">
               <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-blue-500 opacity-5 blur-3xl group-hover:opacity-10 transition-opacity" />
               <div className="space-y-2">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">节点元数据</p>
                  <div className="flex items-center gap-3 mt-4">
                     <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-400">
                        <Monitor size={24} />
                     </div>
                     <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">系统架构</p>
                        <p className="text-lg font-black">{sys?.architecture || 'x86_64'}</p>
                     </div>
                  </div>
               </div>
               <div className="pt-8 border-t border-white/10 space-y-5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">操作系统</span>
                     <span className="text-white font-black">{sys?.os_name} {sys?.os_release}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">内核版本</span>
                     <span className="text-white font-black">{sys?.kernel_version || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">启动时间</span>
                     <span className="text-white font-black">{sys?.boot_time?.split('T')[0]}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">节点唯一ID</span>
                     <span className="text-white font-black font-mono">{agent.key}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">最后活跃</span>
                     <span className="text-white font-black">{agent.last_seen?.split('.')[0].replace('T', ' ')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">Agent版本</span>
                     <span className="text-white font-black">{daemonInfo?.version || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                     <span className="uppercase tracking-widest">Agent平台</span>
                     <span className="text-white font-black">{daemonInfo?.platform || 'N/A'}</span>
                  </div>
               </div>
            </div>
          )}

          {/* Activity Log / Tasks Card */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History size={16} /> 关联部署任务 (Latest 5)
             </h4>
             <div className="space-y-4">
                {tasks.slice(0, 5).map(task => (
                   <div key={task.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                      <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${task.status === 'succeeded' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                            <Zap size={14} />
                         </div>
                         <div className="min-w-0">
                            <p className="text-xs font-black text-slate-700 truncate max-w-[120px]">{task.service_name}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase">{task.type}</p>
                         </div>
                      </div>
                      <StatusBadge status={task.status} />
                   </div>
                ))}
                {tasks.length === 0 && (
                   <div className="text-center py-10">
                      <p className="text-xs font-bold text-slate-300 italic">No tasks executed on node</p>
                   </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {isBatchDeployModalOpen && (
        <div className="fixed inset-0 z-[119] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[86vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">批量部署模板到当前 Agent</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  目标节点: {agent.hostname} ({agent.ip_address})
                </p>
              </div>
              <button onClick={() => setIsBatchDeployModalOpen(false)} className="p-3 bg-slate-50 text-slate-400 hover:text-slate-800 rounded-2xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="检索模板名称或描述..."
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 ring-blue-500/10"
                  />
                </div>
                <button
                  onClick={toggleSelectAllFilteredTemplates}
                  disabled={filteredTemplates.length === 0}
                  className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckSquare size={15} />
                  {filteredTemplates.length > 0 && filteredTemplates.every(t => selectedTemplateNames.has(t.name)) ? '取消全选' : '全选筛选模板'}
                </button>
              </div>

              {templatesLoading ? (
                <div className="py-24 text-center">
                  <Loader2 className="animate-spin mx-auto text-blue-600" size={28} />
                  <p className="mt-3 text-xs font-bold text-slate-400">正在加载模板...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map(template => (
                    <button
                      key={template.name}
                      onClick={() => toggleTemplateSelect(template.name)}
                      className={`p-5 rounded-2xl border-2 transition-all text-left ${
                        selectedTemplateNames.has(template.name)
                          ? 'bg-blue-50 border-blue-600'
                          : 'bg-white border-slate-100 hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-800">{template.name}</p>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{template.description || '无描述'}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            作者: {template.owner_name || template.owner_id || 'system'}
                          </p>
                        </div>
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                          selectedTemplateNames.has(template.name)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-200 text-transparent'
                        }`}>
                          <Check size={14} />
                        </div>
                      </div>
                    </button>
                  ))}
                  {!templatesLoading && filteredTemplates.length === 0 && (
                    <div className="col-span-2 py-16 text-center text-slate-400 text-sm font-bold">无匹配模板</div>
                  )}
                </div>
              )}

              <TemplateLlmBindingEditor
                projectId={projectId}
                value={deployLlmBinding}
                onChange={setDeployLlmBinding}
                serviceOptions={deployServiceOptions}
                title="部署前临时 LLM Provider 注入"
                description="在模板当前结果基础上，为本次部署临时叠加同一组 Provider。"
              />
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">
                将提交 <span className="text-blue-600 font-black">{selectedTemplateNames.size}</span> 个部署任务到当前节点
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsBatchDeployModalOpen(false)}
                  disabled={deployingBatch}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-black hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={executeBatchDeploy}
                  disabled={deployingBatch || selectedTemplateNames.size === 0}
                  className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {deployingBatch ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                  提交批量部署
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日志查看 Modal */}
      {showLogsModal && selectedService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8" onClick={() => setShowLogsModal(false)}>
          <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-800">服务日志 - {selectedService.name}</h4>
                <p className="text-xs text-slate-400 mt-1">{selectedService.description}</p>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-900">
              {logsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="animate-spin text-blue-400" size={32} />
                </div>
              ) : (
                <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                  {logsContent.join('\n') || '暂无日志'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {feedbackNodes}
    </>
  );
};
