import { API_BASE, handleResponse, getHeaders } from './base';
import { AdminDashboardStats } from '../types/types';
import { menuApi, AggregatedServiceHealth } from './menu';

type AdminServiceStatus = 'healthy' | 'unhealthy' | 'degraded' | 'stale' | 'unknown' | 'unregistered';
type AdminServiceSource = 'menu' | 'direct' | 'catalog';

interface ServiceCatalogItem {
  id: string;
  displayName: string;
  endpoint?: string;
  aliases?: string[];
}

interface SummaryServiceItem {
  service_name: string;
  api_prefix?: string | null;
  health: AggregatedServiceHealth;
  replicas?: number | null;
  ready_replicas?: number | null;
  available_replicas?: number | null;
  runtime_status?: string | null;
  deployment_name?: string | null;
}

const SERVICE_CATALOG: ServiceCatalogItem[] = [
  { id: 'secflow-platform-frontend', displayName: '前端门户', endpoint: '/api/frontend/health' },
  { id: 'secflow-platform-menu', displayName: '菜单中心', endpoint: '/api/menu/health' },
  { id: 'secflow-platform-auth', displayName: '认证服务', endpoint: '/api/auth/health' },
  { id: 'secflow-platform-project', displayName: '项目管理', endpoint: '/api/project/health' },
  { id: 'secflow-platform-resource', displayName: '资源管理', endpoint: '/api/resource/health' },
  { id: 'secflow-static-binary', displayName: '静态二进制包', endpoint: '/api/packages/health', aliases: ['secflow-platform-static-binary'] },
  { id: 'secflow-platform-fileserver', displayName: '文件服务', endpoint: '/api/fileserver/health' },
  { id: 'secflow-platform-deploy-script', displayName: '部署脚本', endpoint: '/api/deploy-script/health' },
  { id: 'secflow-k8s', displayName: 'K8S 资源管理', endpoint: '/api/k8s/health', aliases: ['secflow-platform-k8s'] },
  { id: 'secflow-workflow', displayName: '工作流', endpoint: '/api/workflow/health', aliases: ['secflow-platform-workflow'] },
  { id: 'secflow-platform-workflow-status', displayName: '工作流状态服务', endpoint: '/api/workflow-status/health', aliases: ['secflow-workflow-status'] },
  { id: 'secflow-platform-configcenter', displayName: '配置中心', endpoint: '/api/configcenter/health' },
  { id: 'secflow-platform-agent', displayName: 'Agent 中心', endpoint: '/api/agent/health' },
  { id: 'secflow-platform-vuln', displayName: '漏洞生命周期引擎', endpoint: '/api/vuln/health' },
  { id: 'secflow-app-code-server', displayName: 'Code Server', endpoint: '/api/app/code-server/health' },
];

const HEALTHY_STATUS_HTTP_CODES = new Set([200]);

const checkServiceHealth = async (endpoint?: string): Promise<AdminServiceStatus> => {
  if (!endpoint) {
    return 'unregistered';
  }
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    return HEALTHY_STATUS_HTTP_CODES.has(response.status) ? 'healthy' : 'unhealthy';
  } catch {
    return 'unknown';
  }
};

const mapSummaryHealth = (health?: AggregatedServiceHealth | null): AdminServiceStatus => {
  switch (health) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'degraded';
    case 'stale':
      return 'stale';
    case 'unknown':
      return 'unknown';
    case 'unhealthy':
      return 'unhealthy';
    default:
      return 'unregistered';
  }
};

const findSummaryService = (
  services: Record<string, SummaryServiceItem>,
  catalogItem: ServiceCatalogItem,
) => {
  const keys = [catalogItem.id, ...(catalogItem.aliases || [])];
  for (const key of keys) {
    if (services[key]) {
      return { key, service: services[key] };
    }
  }
  return null;
};

const buildServiceStats = async (): Promise<AdminDashboardStats['services']> => {
  let summaryServices: Record<string, SummaryServiceItem> = {};
  try {
    const summary = await menuApi.getServiceHealthSummary();
    summaryServices = summary.services || {};
  } catch {
    summaryServices = {};
  }

  const serviceStats = await Promise.all(
    SERVICE_CATALOG.map(async (catalogItem) => {
      const summaryHit = findSummaryService(summaryServices, catalogItem);
      if (summaryHit) {
        return {
          id: summaryHit.key,
          name: summaryHit.service.service_name || catalogItem.displayName,
          apiPrefix: summaryHit.service.api_prefix || undefined,
          status: mapSummaryHealth(summaryHit.service.health),
          registered: true,
          source: 'menu' as AdminServiceSource,
          replicas: summaryHit.service.replicas ?? null,
          readyReplicas: summaryHit.service.ready_replicas ?? null,
          availableReplicas: summaryHit.service.available_replicas ?? null,
          runtimeStatus: summaryHit.service.runtime_status ?? null,
          deploymentName: summaryHit.service.deployment_name ?? null,
        };
      }

      const directStatus = await checkServiceHealth(catalogItem.endpoint);
      if (directStatus !== 'unknown') {
        return {
          id: catalogItem.id,
          name: catalogItem.displayName,
          apiPrefix: catalogItem.endpoint?.replace(/\/health$/, ''),
          status: directStatus,
          registered: false,
          source: 'direct' as AdminServiceSource,
          replicas: null,
          readyReplicas: null,
          availableReplicas: null,
          runtimeStatus: null,
          deploymentName: null,
        };
      }

      return {
        id: catalogItem.id,
        name: catalogItem.displayName,
        apiPrefix: catalogItem.endpoint?.replace(/\/health$/, ''),
        status: 'unregistered' as AdminServiceStatus,
        registered: false,
        source: 'catalog' as AdminServiceSource,
        replicas: null,
        readyReplicas: null,
        availableReplicas: null,
        runtimeStatus: null,
        deploymentName: null,
      };
    }),
  );

  return serviceStats;
};

export const adminApi = {
  getStatistics: async (): Promise<AdminDashboardStats> => {
    const headers = getHeaders();

    const [
      usersResult,
      rolesResult,
      onlineSessionsResult,
      projectsResult,
      agentsResult,
      resourcesResult,
      workflowsResult,
      servicesResult,
    ] = await Promise.allSettled([
      fetch(`${API_BASE}/api/auth/users/user_list`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/auth/role_list`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/auth/users/sessions/online`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/project`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/agent/agents/stats`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/resource/pvcs/statistics`, { headers }).then((r) => handleResponse(r)),
      fetch(`${API_BASE}/api/workflow/statistics`, { headers }).then((r) => handleResponse(r)),
      buildServiceStats(),
    ]);

    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const totalUsers = Array.isArray(users) ? users.length : 0;
    const activeUsers = Array.isArray(users) ? users.filter((u: any) => u.is_active).length : 0;

    const roles = rolesResult.status === 'fulfilled' ? rolesResult.value : [];
    const totalRoles = Array.isArray(roles) ? roles.length : 0;

    const onlineSessions = onlineSessionsResult.status === 'fulfilled' ? onlineSessionsResult.value : [];
    const onlineUsers = Array.isArray(onlineSessions) ? onlineSessions.length : 0;

    const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : { total: 0 };
    const totalProjects = projects.total || 0;

    const agentStats = agentsResult.status === 'fulfilled' ? agentsResult.value : null;
    const agentData = {
      total: agentStats?.summary?.total_agents || 0,
      online: (agentStats?.summary?.total_agents || 0) - (agentStats?.summary?.offline_agents || 0),
      statusDistribution: agentStats?.summary?.status_distribution || { online: 0, offline: 0, error: 0, unknown: 0 },
    };

    const resourceStats = resourcesResult.status === 'fulfilled' ? resourcesResult.value : null;
    const resourceData = {
      totalPvcs: resourceStats?.total_pvcs || 0,
      totalStorageGi: resourceStats?.total_storage_gi || 0,
      statusCounts: resourceStats?.status_counts || {},
    };

    const workflowStats = workflowsResult.status === 'fulfilled' ? workflowsResult.value : null;
    const workflowData = {
      totalInstances: workflowStats?.total_instances || 0,
      statusDistribution: workflowStats?.status_distribution || {},
      templates: {
        appTemplates: workflowStats?.templates?.app_templates || 0,
        jobTemplates: workflowStats?.templates?.job_templates || 0,
      },
    };

    const services = servicesResult.status === 'fulfilled' ? servicesResult.value : [];

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        online: onlineUsers,
      },
      roles: {
        total: totalRoles,
      },
      projects: {
        total: totalProjects,
      },
      agents: agentData,
      resources: resourceData,
      workflows: workflowData,
      services,
      lastUpdated: new Date().toISOString(),
    };
  },

  getServiceHealth: async (): Promise<AdminDashboardStats['services']> => buildServiceStats(),
};
