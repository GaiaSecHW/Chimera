
import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, FileSearch, Zap, Workflow, Loader2, AlertCircle, Shield, ClipboardCheck, FileBox, HardDrive, Settings, UserCog, Lock, Globe, Users, UserCheck } from 'lucide-react';
import { ViewType, SecurityProject, FileItem, UserInfo, Agent, EnvTemplate, AsyncTask, StaticPackage, PackageStats, AdminDashboardStats } from './types/types';
import { api } from './clients/api';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { WorkflowPlaceholder } from './components/WorkflowPlaceholder';
import { DialogViewport } from './components/DialogService';
import { GlobalUploadWidget } from './components/upload-center/GlobalUploadWidget';
import { UploadCenterProvider } from './services/uploadCenter';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectMgmtPage } from './pages/ProjectMgmtPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { StaticPackagesPage } from './pages/StaticPackagesPage';
import { StaticPackageDetailPage } from './pages/StaticPackageDetailPage';
import { DeployScriptPage } from './pages/DeployScriptPage';
import { SecurityAssessmentPage } from './pages/SecurityAssessmentPage';
import { ConfigCenterLlmPage } from './pages/ConfigCenterLlmPage';
import { ConfigCenterLlmChatPage } from './pages/ConfigCenterLlmChatPage';

// Input Pages
import { ReleasePackagePage } from './pages/inputs/ReleasePackagePage';
import { CodeAuditPage } from './pages/inputs/CodeAuditPage';
import { DocAnalysisPage } from './pages/inputs/DocAnalysisPage';
import { TaskMgmtPage } from './pages/inputs/TaskMgmtPage';
import { OtherInputPage } from './pages/inputs/OtherInputPage';
import { PvcManagementPage } from './pages/inputs/PvcManagementPage';
import { PublicResourceManagementPage } from './pages/inputs/PublicResourceManagementPage';
import { ProjectFileExplorerPage } from './pages/inputs/ProjectFileExplorerPage';

// Env Pages
import { EnvAgentPage } from './pages/env/EnvAgentPage';
import { EnvTemplatePage } from './pages/env/EnvTemplatePage';
import { EnvTasksPage } from './pages/env/EnvTasksPage';
import { ServiceMgmtPage } from './pages/env/ServiceMgmtPage';
import { EnvAiHelperPage } from './pages/env/EnvAiHelperPage';
import { EnvAiAgentManagePage } from './pages/env/EnvAiAgentManagePage';
import { EnvAiAgentSessionManagePage } from './pages/env/EnvAiAgentSessionManagePage';
import { EnvAiSessionPage } from './pages/env/EnvAiSessionPage';
import { EnvAiBatchSessionPage } from './pages/env/EnvAiBatchSessionPage';
import { EnvProcessMonitorOverviewPage } from './pages/env/EnvProcessMonitorOverviewPage';
import { EnvProcessMonitorDetailPage } from './pages/env/EnvProcessMonitorDetailPage';
import { EnvProcessMonitorTasksPage } from './pages/env/EnvProcessMonitorTasksPage';
import { ServiceTerminalWindowPage } from './pages/env/ServiceTerminalWindowPage';
import { SystemAnalysisOverviewPage } from './pages/system-analysis/SystemAnalysisOverviewPage';
import { SystemAnalysisTaskPage } from './pages/system-analysis/SystemAnalysisTaskPage';
import { SystemAnalysisHistoryPage } from './pages/system-analysis/SystemAnalysisHistoryPage';
import { SystemAnalysisPromptPage } from './pages/system-analysis/SystemAnalysisPromptPage';

// Workflow Pages
import { WorkflowInstancePage } from './pages/workflow/WorkflowInstancePage';
import { WorkflowInstanceDetailPage } from './pages/workflow/WorkflowInstanceDetailPage';
import { WorkflowInstanceLogsPage } from './pages/workflow/WorkflowInstanceLogsPage';
import { JobTemplatePage } from './pages/workflow/JobTemplatePage';
import { JobTemplateDetailPage } from './pages/workflow/JobTemplateDetailPage';
import { AppTemplatePage } from './pages/workflow/AppTemplatePage';
import { AppTemplateDetailPage } from './pages/workflow/AppTemplateDetailPage';
import { AppInstancePage } from './pages/workflow/AppInstancePage';
import { AppInstanceDetailPage } from './pages/workflow/AppInstanceDetailPage';

// Pentest Pages
import { ExecutionCodeAuditPage } from './pages/pentest/ExecutionCodeAuditPage';
import { ExecutionWorkPlatformPage } from './pages/pentest/ExecutionWorkPlatformPage';
import { SecMateNGPage } from './pages/pentest/SecMateNGPage';
import { ReportsPage } from './pages/pentest/ReportsPage';
import { VulnOverviewPage } from './pages/pentest/VulnOverviewPage';
import { VulnIntakePage } from './pages/pentest/VulnIntakePage';
import { VulnAnalysisPage } from './pages/pentest/VulnAnalysisPage';
import { VulnAnalysisDetailPage } from './pages/pentest/VulnAnalysisDetailPage';
import { VulnVerificationPage } from './pages/pentest/VulnVerificationPage';
import { VulnVerificationDetailPage } from './pages/pentest/VulnVerificationDetailPage';
import { VulnDecisionPage } from './pages/pentest/VulnDecisionPage';
import { VulnDecisionDetailPage } from './pages/pentest/VulnDecisionDetailPage';
import { VulnQueuePage } from './pages/pentest/VulnQueuePage';
import { VulnServicesPage } from './pages/pentest/VulnServicesPage';
import { VulnReproConfigPage } from './pages/pentest/VulnReproConfigPage';
import { B2STaskListPage } from './pages/pentest/B2STaskListPage';
import { B2STaskQueuePage } from './pages/pentest/B2STaskQueuePage';
import { B2STaskResultPage } from './pages/pentest/B2STaskResultPage';
import { AiwfDefinitionsPage } from './pages/aiwf/AiwfDefinitionsPage';
import { AiwfTriggersPage } from './pages/aiwf/AiwfTriggersPage';
import { AiwfExecutionsPage } from './pages/aiwf/AiwfExecutionsPage';
import { AiwfSchedulerPage } from './pages/aiwf/AiwfSchedulerPage';

// User & Auth Pages
import { UserMgmtPage } from './pages/user/UserMgmtPage';
import { RoleMgmtPage } from './pages/user/RoleMgmtPage';
import { PermMgmtPage } from './pages/user/PermMgmtPage';
import { OnlineSessionPage } from './pages/user/OnlineSessionPage';
import { MachineTokenPage } from './pages/user/MachineTokenPage';
import { UserPermissionPage } from './pages/user/UserPermissionPage';

// Organization Pages
import { DepartmentPage } from './pages/org/DepartmentPage';
import { DepartmentMemberPage } from './pages/org/DepartmentMemberPage';
import { ProjectPage } from './pages/org/ProjectPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { canAccessView, getUserAccess, getUserCenterDefaultView } from './utils/rbac';
import { AggregatedServiceHealth, MenuServiceHealthSummary } from './clients/menu';

const PROJECT_REQUIRED_VIEWS = new Set<string>([
  'env-agent', 'env-service', 'env-ai-agent', 'env-ai-helper', 'env-ai-agent-manage', 'env-ai-agent-session-manage', 'env-ai-session', 'env-ai-batch-session', 'env-template', 'env-tasks',
  'env-process-monitor-overview', 'env-process-monitor-detail', 'env-process-monitor-tasks',
  'system-analysis-overview', 'system-analysis-task', 'system-analysis-history', 'system-analysis-prompt',
  'workflow-apps', 'workflow-app-detail',
  'workflow-app-instances', 'workflow-app-instance-detail',
  'workflow-jobs', 'workflow-job-detail',
  'workflow-instances', 'workflow-instance-detail', 'workflow-instance-logs',
  'project-file-explorer', 'pvc-management', 'public-resource-management', 'public-resource-pvc-management', 'public-resource-task-management',
  'engine-validation',
  'pentest-risk', 'pentest-system', 'pentest-threat', 'pentest-orch',
  'pentest-exec-code', 'pentest-exec-work', 'pentest-exec-secmate',
  'pentest-exec-b2s-root', 'pentest-exec-b2s-task-list', 'pentest-exec-b2s-create', 'pentest-exec-b2s-queue', 'pentest-exec-b2s-result',
  'pentest-report',
  'security-assessment',
  'vuln-engine', 'vuln-overview', 'vuln-intake', 'vuln-analysis', 'vuln-analysis-detail', 'vuln-verification', 'vuln-verification-detail', 'vuln-decision', 'vuln-decision-detail', 'vuln-queue', 'vuln-services', 'vuln-repro-config',
  'ai-agent-framework-root', 'aiwf-definitions',
  'aiwf-triggers', 'aiwf-trigger-create', 'aiwf-trigger-list',
  'aiwf-executions', 'aiwf-execution-list', 'aiwf-execution-events', 'aiwf-execution-artifacts',
  'aiwf-scheduler', 'aiwf-worker-list', 'aiwf-worker-control'
]);

type TopLevelNavKey = 'dashboard' | 'projects' | 'environment' | 'workflow' | 'security' | 'system';

const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'dashboard') return 'dashboard';

  if (
    view === 'project-mgmt' ||
    view === 'project-detail' ||
    view === 'project-file-explorer' ||
    view === 'static-packages' ||
    view === 'static-package-detail' ||
    view === 'deploy-script-mgmt' ||
    view === 'public-resource-management' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management' ||
    view.startsWith('test-input-')
  ) {
    return 'projects';
  }

  if (view.startsWith('env-')) {
    return 'environment';
  }

  if (view.startsWith('workflow-') || view.startsWith('aiwf-') || view === 'ai-agent-framework-root') {
    return 'workflow';
  }

  if (
    view === 'engine-validation' ||
    view === 'security-assessment' ||
    view === 'vuln-engine' ||
    view.startsWith('vuln-') ||
    view.startsWith('pentest-') ||
    view.startsWith('system-analysis-')
  ) {
    return 'security';
  }

  return 'system';
};

const getTopLevelDefaultView = (nav: TopLevelNavKey, user: UserInfo | null): string => {
  const access = getUserAccess(user);

  switch (nav) {
    case 'dashboard':
      return 'dashboard';
    case 'projects':
      return 'project-mgmt';
    case 'environment':
      return 'env-agent';
    case 'workflow':
      return 'workflow-apps';
    case 'security':
      return 'vuln-overview';
    case 'system':
      if (access.canAccessAdminDashboard) return 'admin-dashboard';
      if (access.canAccessConfigCenter) return 'config-center-llm';
      if (access.canAccessUserCenter) return String(getUserCenterDefaultView(user));
      return 'sys-settings';
    default:
      return 'dashboard';
  }
};


const App: React.FC = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const isServiceTerminalWindow = queryParams.get('service_terminal') === '1';

  const [token, setToken] = useState<string | null>(localStorage.getItem('secflow_token'));
  const [user, setUser] = useState<UserInfo | null>(null);
  const [currentView, setCurrentView] = useState<ViewType | string>('dashboard');
  const [projects, setProjects] = useState<SecurityProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(localStorage.getItem('last_project_id') || '');
  const [activeProjectId, setActiveProjectId] = useState<string>(''); 
  const [activeInstanceId, setActiveInstanceId] = useState<string>('');
  const [activeAppTemplateId, setActiveAppTemplateId] = useState<string>('');
  const [activeJobTemplateId, setActiveJobTemplateId] = useState<string>('');
  const [activeAppWorkflowId, setActiveAppWorkflowId] = useState<string>('');
  const [activeAiHelperKey, setActiveAiHelperKey] = useState<string>('');
  const [activeProcessMonitorServiceKey, setActiveProcessMonitorServiceKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Data States
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<EnvTemplate[]>([]);
  const [staticPackages, setStaticPackages] = useState<StaticPackage[]>([]);
  const [activePackageId, setActivePackageId] = useState<string>('');
  const [selectedStaticPkgIds, setSelectedStaticPkgIds] = useState<Set<string>>(new Set());
  const [packageStats, setPackageStats] = useState<PackageStats | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [forcedPasswordForm, setForcedPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [forcedPasswordLoading, setForcedPasswordLoading] = useState(false);
  const [forcedPasswordError, setForcedPasswordError] = useState<string | null>(null);
  const [dashboardServicesCount, setDashboardServicesCount] = useState(0);
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);


  // Health Status
  const [resourceServiceHealthy, setResourceServiceHealthy] = useState<boolean | null>(null);
  const [staticPackageHealthy, setStaticPackageHealthy] = useState<boolean | null>(null);
  const [projectServiceHealthy, setProjectServiceHealthy] = useState<boolean | null>(null);
  const [envServiceHealthy, setEnvServiceHealthy] = useState<boolean | null>(null);
  const [codeAuditServiceHealthy, setCodeAuditServiceHealthy] = useState<boolean | null>(null);
  const [workflowServiceHealthy, setWorkflowServiceHealthy] = useState<boolean | null>(null);
  const [vulnServiceHealthy, setVulnServiceHealthy] = useState<boolean | null>(null);
  const [configCenterServiceHealthy, setConfigCenterServiceHealthy] = useState<boolean | null>(null);
  const [aiAgentFrameworkHealthy, setAiAgentFrameworkHealthy] = useState<boolean | null>(null);
  const [activeAiwfDefinitionId, setActiveAiwfDefinitionId] = useState<string>('');
  const [activeAiwfExecutionId, setActiveAiwfExecutionId] = useState<string>('');

  const normalizeServiceHealth = (status?: AggregatedServiceHealth | null): boolean | null => {
    if (status === 'healthy') return true;
    if (status === 'unhealthy' || status === 'degraded' || status === 'stale') return false;
    return null;
  };

  const resolveMenuServiceHealth = (
    services: MenuServiceHealthSummary['services'],
    candidates: string[]
  ): boolean | null => {
    for (const candidate of candidates) {
      const service = services[candidate];
      if (service) {
        return normalizeServiceHealth(service.health);
      }
    }
    return null;
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('secflow-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('secflow-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    const handleNavigateView = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string; helperKey?: string; processMonitorServiceKey?: string }>).detail;
      const nextView = String(detail?.view || '').trim();
      if (nextView) {
        setCurrentView(nextView);
      }
      const helperKey = String(detail?.helperKey || '').trim();
      if (helperKey) {
        setActiveAiHelperKey(helperKey);
      }
      const processMonitorServiceKey = String(detail?.processMonitorServiceKey || '').trim();
      if (processMonitorServiceKey) {
        setActiveProcessMonitorServiceKey(processMonitorServiceKey);
      }
    };
    window.addEventListener('secflow-navigate-view', handleNavigateView as EventListener);
    return () => window.removeEventListener('secflow-navigate-view', handleNavigateView as EventListener);
  }, []);

  useEffect(() => {
    if (token) {
      api.auth.validateToken()
        .then((validatedUser) => {
          setUser(validatedUser);
          if (!validatedUser.must_change_password) {
            fetchProjects();
          }
        })
        .catch(() => handleLogout());
      
      checkAllHealth();
      const healthInterval = setInterval(checkAllHealth, 30000);
      return () => clearInterval(healthInterval);
    }
  }, [token]);

  const checkAllHealth = async () => {
    try {
      const summary = await api.menu.getServiceHealthSummary();
      const services = summary.services || {};
      setResourceServiceHealthy(resolveMenuServiceHealth(services, ['secflow-resource', 'secflow-platform-resource']));
      setStaticPackageHealthy(resolveMenuServiceHealth(services, ['secflow-static-binary', 'secflow-platform-static-binary']));
      setProjectServiceHealthy(resolveMenuServiceHealth(services, ['secflow-project', 'secflow-platform-project']));
      setEnvServiceHealthy(resolveMenuServiceHealth(services, ['secflow-k8s', 'secflow-platform-k8s']));
      setCodeAuditServiceHealthy(resolveMenuServiceHealth(services, ['vscode-web-manager', 'secflow-app-code-server']));
      setWorkflowServiceHealthy(resolveMenuServiceHealth(services, ['secflow-workflow', 'secflow-platform-workflow', 'secflow-workflow-status']));
      setVulnServiceHealthy(resolveMenuServiceHealth(services, ['secflow-platform-vuln']));
      setConfigCenterServiceHealthy(resolveMenuServiceHealth(services, ['secflow-platform-configcenter']));
      setAiAgentFrameworkHealthy(resolveMenuServiceHealth(services, ['secflow-platform-ai-agent-framework', 'secflow-ai-agent-framework']));
    } catch (e) {
      setResourceServiceHealthy(false);
      setStaticPackageHealthy(false);
      setProjectServiceHealthy(false);
      setEnvServiceHealthy(false);
      setCodeAuditServiceHealthy(false);
      setWorkflowServiceHealthy(false);
      setVulnServiceHealthy(false);
      setConfigCenterServiceHealthy(false);
      setAiAgentFrameworkHealthy(false);
    }
  };

  // UID=1 is always admin, or has admin role
  const userAccess = getUserAccess(user);
  const isAdmin = userAccess.canAccessAdminDashboard;
  const activeTopLevelNav = getTopLevelNavForView(String(currentView));

  const fetchAdminStats = async () => {
    if (!user || !isAdmin) return;
    setAdminStatsLoading(true);
    try {
      const stats = await api.admin.getStatistics();
      setAdminStats(stats);
    } catch (e) {
      console.error('Failed to fetch admin statistics', e);
    } finally {
      setAdminStatsLoading(false);
    }
  };

  useEffect(() => {
    if (token && currentView === 'admin-dashboard' && isAdmin) {
      fetchAdminStats();
    }
  }, [token, currentView, user]);

  useEffect(() => {
    if (!user) return;
    if (canAccessView(user, currentView)) return;
    setCurrentView(getUserCenterDefaultView(user));
  }, [user, currentView]);

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('last_project_id', selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && PROJECT_REQUIRED_VIEWS.has(currentView)) {
      setCurrentView('dashboard');
    }
  }, [selectedProjectId, currentView]);

  const fetchDashboardServicesCount = async (onlineAgents: Agent[]) => {
    if (onlineAgents.length === 0) return;
    try {
      const promises = onlineAgents.map(a => api.environment.getAgentServices(a.key).catch(() => ({ services: [] })));
      const results = await Promise.all(promises);
      const total = results.reduce((acc, curr) => acc + (curr.services?.length || 0), 0);
      setDashboardServicesCount(total);
    } catch (e) {
      console.error("Dashboard services count aggregation failed", e);
    }
  };

  useEffect(() => {
    if (token) {
      if (currentView === 'dashboard' && selectedProjectId) {
        api.environment.getAgents(selectedProjectId).then(d => {
          const agentList = d.agents || [];
          setAgents(agentList);
          fetchDashboardServicesCount(agentList.filter(a => a.status === 'online'));
        }).catch(e => console.error(e));
        
        api.environment.getTemplates().then(d => setTemplates(d.templates || [])).catch(e => console.error(e));
        api.staticPackages.list().then(d => setStaticPackages(d.packages || [])).catch(e => console.error(e));
        api.staticPackages.getStats().then(d => setPackageStats(d.statistics)).catch(e => console.error(e));
      }
    }
  }, [selectedProjectId, currentView, token]);

  const fetchProjects = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      const data = await api.projects.list();
      const nextProjects = data.projects || [];
      setProjects(nextProjects);
      if (nextProjects.length > 0) {
        const storedProjectId = localStorage.getItem('last_project_id') || '';
        const hasSelected = !!selectedProjectId && nextProjects.some((project) => project.id === selectedProjectId);
        const hasStored = !!storedProjectId && nextProjects.some((project) => project.id === storedProjectId);
        const resolvedProjectId = hasSelected
          ? selectedProjectId
          : hasStored
            ? storedProjectId
            : nextProjects[0].id;
        if (resolvedProjectId && resolvedProjectId !== selectedProjectId) {
          setSelectedProjectId(resolvedProjectId);
        }
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      if (refresh) setIsRefreshing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const credentials = Object.fromEntries(formData);
    
    try {
      const data = await api.auth.login(credentials);
      localStorage.setItem('secflow_token', data.access_token);
      setToken(data.access_token);
    } catch (err: any) {
      setLoginError(err.message || "登录失败，请检查用户名和密码");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('secflow_token');
    setToken(null);
    setUser(null);
    setProjects([]);
    setSelectedProjectId('');
    setCurrentView('dashboard');
  };

  const handleForcedPasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForcedPasswordError(null);
    if (forcedPasswordForm.new_password !== forcedPasswordForm.confirm_password) {
      setForcedPasswordError('两次输入的新密码不一致');
      return;
    }
    setForcedPasswordLoading(true);
    try {
      await api.auth.changeOwnPassword({
        old_password: forcedPasswordForm.old_password,
        new_password: forcedPasswordForm.new_password,
      });
      setForcedPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      const refreshedUser = await api.auth.validateToken();
      setUser(refreshedUser);
      await fetchProjects(true);
    } catch (err: any) {
      setForcedPasswordError(err.message || '修改密码失败');
    } finally {
      setForcedPasswordLoading(false);
    }
  };

  const renderContent = () => {
    if (user && !canAccessView(user, currentView)) {
      return <div className="p-20 text-center"><h3 className="text-xl font-black text-slate-400">当前账号无权访问该页面。</h3></div>;
    }

    switch (currentView) {
      case 'dashboard': return (
        <DashboardPage 
          projects={projects} 
          agents={agents} 
          staticPackages={staticPackages} 
          templates={templates}
          servicesCount={dashboardServicesCount}
          setCurrentView={setCurrentView} 
        />
      );
      case 'admin-dashboard': return (
        <AdminDashboardPage
          adminStats={adminStats}
          loading={adminStatsLoading}
          onRefresh={fetchAdminStats}
          setCurrentView={setCurrentView}
        />
      );
      case 'project-mgmt': return (
        <ProjectMgmtPage 
          projects={projects} 
          setActiveProjectId={(id) => { setActiveProjectId(id); }} 
          setCurrentView={setCurrentView} 
          refreshProjects={fetchProjects}
        />
      );
      case 'project-detail': return <ProjectDetailPage projectId={activeProjectId} projects={projects} onBack={() => setCurrentView('project-mgmt')} />;
      case 'static-packages': return <StaticPackagesPage staticPackages={staticPackages} packageStats={packageStats} fetchStaticPackages={() => api.staticPackages.list().then(d => setStaticPackages(d.packages))} setActivePackageId={setActivePackageId} setCurrentView={setCurrentView} selectedIds={selectedStaticPkgIds} setSelectedIds={setSelectedStaticPkgIds} />;
      case 'static-package-detail': return <StaticPackageDetailPage packageId={activePackageId} onBack={() => setCurrentView('static-packages')} />;
      case 'deploy-script-mgmt': return <DeployScriptPage />;
      case 'config-center-root':
      case 'config-center-llm':
        return <ConfigCenterLlmPage onOpenChat={() => setCurrentView('config-center-llm-chat')} />;
      case 'config-center-llm-chat':
        return <ConfigCenterLlmChatPage onBack={() => setCurrentView('config-center-llm')} />;
      
      // Resource Management Pages
      case 'public-resource-management': return <PublicResourceManagementPage projectId={selectedProjectId} />;
      case 'public-resource-pvc-management': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'public-resource-task-management': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="tasks" />;
      // legacy aliases
      case 'test-input-release': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'test-input-code': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'test-input-doc': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'test-input-tasks': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="tasks" />;
      case 'test-input-other': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'pvc-management': return <PublicResourceManagementPage projectId={selectedProjectId} initialTab="pvc" />;
      case 'project-file-explorer': return <ProjectFileExplorerPage projectId={selectedProjectId} projects={projects} />;
      
      case 'env-agent': return <EnvAgentPage projectId={selectedProjectId} />;
      case 'env-service': return <ServiceMgmtPage projectId={selectedProjectId} />;
      case 'env-ai-agent':
      case 'env-ai-agent-overview':
        return <EnvAiAgentManagePage projectId={selectedProjectId} />;
      case 'env-ai-helper': return <EnvAiHelperPage projectId={selectedProjectId} initialHelperKey={activeAiHelperKey} />;
      case 'env-ai-agent-manage': return <EnvAiAgentManagePage projectId={selectedProjectId} />;
      case 'env-ai-agent-session-manage': return <EnvAiAgentSessionManagePage projectId={selectedProjectId} />;
      case 'env-ai-session': return <EnvAiSessionPage projectId={selectedProjectId} />;
      case 'env-ai-batch-session': return <EnvAiBatchSessionPage projectId={selectedProjectId} />;
      case 'env-process-monitor-root':
      case 'env-process-monitor-overview': return <EnvProcessMonitorOverviewPage projectId={selectedProjectId} />;
      case 'env-process-monitor-detail': return <EnvProcessMonitorDetailPage projectId={selectedProjectId} initialServiceKey={activeProcessMonitorServiceKey} />;
      case 'env-process-monitor-tasks': return <EnvProcessMonitorTasksPage projectId={selectedProjectId} />;
      case 'env-template': return <EnvTemplatePage projectId={selectedProjectId} />;
      case 'env-tasks': return <EnvTasksPage projectId={selectedProjectId} />;
      case 'system-analysis-root':
      case 'system-analysis-overview': return <SystemAnalysisOverviewPage projectId={selectedProjectId} />;
      case 'system-analysis-task': return <SystemAnalysisTaskPage projectId={selectedProjectId} />;
      case 'system-analysis-history': return <SystemAnalysisHistoryPage projectId={selectedProjectId} />;
      case 'system-analysis-prompt': return <SystemAnalysisPromptPage projectId={selectedProjectId} />;

      // Workflow Management
      case 'workflow-instances': return <WorkflowInstancePage projectId={selectedProjectId} onNavigateToDetail={(id) => { setActiveInstanceId(id); setCurrentView('workflow-instance-detail'); }} onNavigateToLogs={(id) => { setActiveInstanceId(id); setCurrentView('workflow-instance-logs'); }} />;
      case 'workflow-instance-detail': return <WorkflowInstanceDetailPage instanceId={activeInstanceId} onBack={() => setCurrentView('workflow-instances')} />;
      case 'workflow-instance-logs': return <WorkflowInstanceLogsPage instanceId={activeInstanceId} onBack={() => setCurrentView('workflow-instances')} />;
      case 'workflow-jobs': return <JobTemplatePage projectId={selectedProjectId} onNavigateToDetail={(id) => { setActiveJobTemplateId(id); setCurrentView('workflow-job-detail'); }} />;
      case 'workflow-job-detail': return <JobTemplateDetailPage templateId={activeJobTemplateId} onBack={() => setCurrentView('workflow-jobs')} />;
      case 'workflow-apps': return <AppTemplatePage projectId={selectedProjectId} onNavigateToDetail={(id) => { setActiveAppTemplateId(id); setCurrentView('workflow-app-detail'); }} />;
      case 'workflow-app-detail': return <AppTemplateDetailPage templateId={activeAppTemplateId} onBack={() => setCurrentView('workflow-apps')} />;
      case 'workflow-app-instances': return <AppInstancePage projectId={selectedProjectId} onNavigateToDetail={(id) => { setActiveAppWorkflowId(id); setCurrentView('workflow-app-instance-detail'); }} />;
      case 'workflow-app-instance-detail':
        return activeAppWorkflowId
          ? <AppInstanceDetailPage instanceId={activeAppWorkflowId} onBack={() => setCurrentView('workflow-app-instances')} />
          : <AppInstancePage projectId={selectedProjectId} onNavigateToDetail={(id) => { setActiveAppWorkflowId(id); setCurrentView('workflow-app-instance-detail'); }} />;

      case 'ai-agent-framework-root':
      case 'aiwf-definitions':
      case 'aiwf-definition-list':
      case 'aiwf-definition-create':
      case 'aiwf-definition-versions':
        return (
          <AiwfDefinitionsPage
            projectId={selectedProjectId}
            selectedDefinitionId={activeAiwfDefinitionId}
            onDefinitionSelected={setActiveAiwfDefinitionId}
            onNavigateToTriggers={(definitionId) => {
              setActiveAiwfDefinitionId(definitionId);
              setCurrentView('aiwf-trigger-create');
            }}
          />
        );
      case 'aiwf-triggers':
      case 'aiwf-trigger-create':
        return (
          <AiwfTriggersPage
            projectId={selectedProjectId}
            selectedDefinitionId={activeAiwfDefinitionId}
            onNavigateToExecutionCenter={() => setCurrentView('aiwf-execution-list')}
          />
        );
      case 'aiwf-trigger-list':
        return (
          <AiwfTriggersPage
            projectId={selectedProjectId}
            selectedDefinitionId={activeAiwfDefinitionId}
            onNavigateToExecutionCenter={() => setCurrentView('aiwf-execution-list')}
          />
        );
      case 'aiwf-executions':
      case 'aiwf-execution-list':
        return <AiwfExecutionsPage projectId={selectedProjectId} initialTab="list" selectedExecutionId={activeAiwfExecutionId} />;
      case 'aiwf-execution-events':
        return <AiwfExecutionsPage projectId={selectedProjectId} initialTab="events" selectedExecutionId={activeAiwfExecutionId} />;
      case 'aiwf-execution-artifacts':
        return <AiwfExecutionsPage projectId={selectedProjectId} initialTab="artifacts" selectedExecutionId={activeAiwfExecutionId} />;
      case 'aiwf-scheduler':
      case 'aiwf-worker-list':
        return <AiwfSchedulerPage initialTab="workers" />;
      case 'aiwf-worker-control':
        return <AiwfSchedulerPage initialTab="control" />;

      case 'engine-validation': return <WorkflowPlaceholder title="安全验证" icon={<ShieldCheck />} />;
      case 'pentest-risk': return <WorkflowPlaceholder title="风险评估" icon={<ShieldAlert />} />;
      case 'pentest-system': return <WorkflowPlaceholder title="系统分析" icon={<FileSearch />} />;
      case 'pentest-threat': return <WorkflowPlaceholder title="威胁分析" icon={<Zap />} />;
      case 'pentest-orch': return <WorkflowPlaceholder title="测试编排" icon={<Workflow />} />;
      case 'pentest-exec-code': return <ExecutionCodeAuditPage projectId={selectedProjectId} />;
      case 'pentest-exec-work': return <ExecutionWorkPlatformPage projectId={selectedProjectId} />;
      case 'pentest-exec-secmate': return <SecMateNGPage projectId={selectedProjectId} />;
      case 'pentest-exec-b2s-root':
      case 'pentest-exec-b2s-task-list':
      case 'pentest-exec-b2s-create': return <B2STaskListPage projectId={selectedProjectId} />;
      case 'pentest-exec-b2s-queue': return <B2STaskQueuePage projectId={selectedProjectId} />;
      case 'pentest-exec-b2s-result': return <B2STaskResultPage projectId={selectedProjectId} />;
      case 'pentest-report': return <ReportsPage />;
      case 'security-assessment': return <SecurityAssessmentPage />;
      case 'vuln-engine':
      case 'vuln-overview': return <VulnOverviewPage projectId={selectedProjectId} />;
      case 'vuln-intake': return <VulnIntakePage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-analysis': return <VulnAnalysisPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-analysis-detail': return <VulnAnalysisDetailPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-verification': return <VulnVerificationPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-verification-detail': return <VulnVerificationDetailPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-decision': return <VulnDecisionPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-decision-detail': return <VulnDecisionDetailPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-queue': return <VulnQueuePage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-services': return <VulnServicesPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;
      case 'vuln-repro-config': return <VulnReproConfigPage projectId={selectedProjectId} onNavigateToView={setCurrentView} />;

      // Admin Pages
      case 'sys-settings': return <WorkflowPlaceholder title="系统设置" icon={<Settings />} />;
      case 'change-password': return <WorkflowPlaceholder title="修改密码" icon={<Lock />} />;
      case 'user-mgmt-users': return <UserMgmtPage />;
      case 'user-mgmt-access': return <UserPermissionPage />;
      case 'user-mgmt-roles': return <RoleMgmtPage />;
      case 'user-mgmt-perms': return <PermMgmtPage />;
      case 'user-mgmt-online': return <OnlineSessionPage />;
      case 'user-mgmt-machine': return <MachineTokenPage />;

      // Organization Pages
      case 'org-mgmt-departments': return <DepartmentPage />;
      case 'org-mgmt-members': return <DepartmentMemberPage />;
      case 'org-mgmt-projects': return <ProjectPage />;

      default: return <div className="p-20 text-center"><h3 className="text-xl font-black text-slate-400">模块 "{currentView}" 开发中...</h3></div>;
    }
  };

  if (isServiceTerminalWindow) {
    return <ServiceTerminalWindowPage />;
  }

  if (!token) return (
    <>
      <div className="h-screen w-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-md p-10 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-2xl relative z-10">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20">
              <Shield className="text-white" size={40} />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter">SecFlow</h1>
            <p className="text-slate-500 mt-2 font-medium uppercase tracking-widest text-[10px]">专业安全测试流程引擎</p>
          </div>

          {loginError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2">账户名称</label>
              <input name="username" required className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:border-blue-500 transition-all" placeholder="Username" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2">身份凭证</label>
              <input name="password" type="password" required className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:border-blue-500 transition-all" placeholder="Password" />
            </div>
            <button disabled={isLoading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:active:scale-100">
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : '进入平台'}
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] text-slate-600 font-medium leading-relaxed">
            &copy; 2025 SecFlow 极速安全测试平台 <br/> 受信任的二进制分发与自动化渗透环境
          </p>
        </div>
      </div>
      <DialogViewport />
    </>
  );

  return (
    <UploadCenterProvider>
      <div className="flex h-screen flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
        <Header 
          user={user} 
          currentTopLevelNav={activeTopLevelNav}
          onSelectTopLevelNav={(nav) => setCurrentView(getTopLevelDefaultView(nav, user))}
          projects={projects} 
          selectedProjectId={selectedProjectId} 
          setSelectedProjectId={setSelectedProjectId} 
          isProjectDropdownOpen={isProjectDropdownOpen} 
          setIsProjectDropdownOpen={setIsProjectDropdownOpen} 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          fetchProjects={fetchProjects} 
          isRefreshing={isRefreshing}
          setCurrentView={setCurrentView}
          handleLogout={handleLogout}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar 
            user={user} 
            currentView={currentView} 
            activeTopLevelNav={activeTopLevelNav}
            hasSelectedProject={!!selectedProjectId}
            isSidebarCollapsed={isSidebarCollapsed} 
            setIsSidebarCollapsed={setIsSidebarCollapsed} 
            setCurrentView={setCurrentView} 
            resourceHealth={resourceServiceHealthy}
            staticPackageHealth={staticPackageHealthy}
            projectHealth={projectServiceHealthy}
            envHealth={envServiceHealthy}
            codeAuditHealth={codeAuditServiceHealthy}
            workflowHealth={workflowServiceHealthy}
            vulnHealth={vulnServiceHealthy}
            configCenterHealth={configCenterServiceHealthy}
            aiAgentFrameworkHealth={aiAgentFrameworkHealthy}
          />

          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {user?.must_change_password ? (
                <div className="min-h-full flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,1))] p-8">
                  <div className="w-full max-w-lg rounded-[2.5rem] bg-white border border-slate-200 shadow-2xl p-10">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-3xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <Lock size={26} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900">首次登录请先修改密码</h2>
                        <p className="mt-1 text-sm font-medium text-slate-500">账号 <span className="font-black text-slate-700">{user.username}</span> 当前被设置为首次登录强制改密，修改完成后才可继续使用系统。</p>
                      </div>
                    </div>
                    {forcedPasswordError && (
                      <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        {forcedPasswordError}
                      </div>
                    )}
                    <form onSubmit={handleForcedPasswordChange} className="mt-8 space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">当前密码</label>
                        <input
                          type="password"
                          required
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:ring-4 ring-amber-500/10 font-semibold text-slate-800"
                          value={forcedPasswordForm.old_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, old_password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">新密码</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:ring-4 ring-amber-500/10 font-semibold text-slate-800"
                          value={forcedPasswordForm.new_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, new_password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">确认新密码</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:ring-4 ring-amber-500/10 font-semibold text-slate-800"
                          value={forcedPasswordForm.confirm_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, confirm_password: e.target.value })}
                        />
                      </div>
                      <button disabled={forcedPasswordLoading} className="w-full py-4 rounded-2xl bg-amber-600 text-white font-black shadow-xl shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center">
                        {forcedPasswordLoading ? <Loader2 className="animate-spin" size={20} /> : '修改密码并进入系统'}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                renderContent()
              )}
            </div>
          </main>
        </div>
        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; } 
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
          @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
          .animate-in { animation: fade-in 0.3s ease-out; }
        `}</style>
      </div>
      <GlobalUploadWidget />
      <DialogViewport />
    </UploadCenterProvider>
  );
};

export default App;
