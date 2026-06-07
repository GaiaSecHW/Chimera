
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, Lock } from 'lucide-react';
import { ViewType, SecurityProject, UserInfo, Agent, EnvTemplate, StaticPackage, PackageStats, AdminDashboardStats } from './types/types';
import { api } from './clients/api';
import { getTopLevelDefaultView, getTopLevelNavForView, PROJECT_REQUIRED_VIEWS } from './app/navigation';
import { renderCurrentView } from './app/viewRegistry';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { DialogViewport } from './components/DialogService';
import { GlobalUploadWidget } from './components/upload-center/GlobalUploadWidget';
import { UploadCenterProvider } from './services/uploadCenter';
import { ServiceTerminalWindowPage } from './pages/environment/ServiceTerminalWindowPage';
import { canAccessView, getUserAccess, getUserCenterDefaultView } from './utils/rbac';
import { AggregatedServiceHealth, MenuServiceHealthSummary } from './clients/menu';
import { ThemeLogo } from './components/ThemeLogo';

const DEFAULT_VIEW = 'dashboard';

const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { view } = useParams<{ view?: string }>();
  const routeView = view || DEFAULT_VIEW;
  const platformApi = api.domains.platform;
  const projectApi = api.domains.project;
  const assetApi = api.domains.assets;
  const environmentApi = api.domains.environment;
  const queryParams = new URLSearchParams(window.location.search);
  const isServiceTerminalWindow = queryParams.get('service_terminal') === '1';

  const [token, setToken] = useState<string | null>(() => {
    const v = localStorage.getItem('chimera_token') || localStorage.getItem('secflow_token');
    if (v) { localStorage.setItem('chimera_token', v); localStorage.removeItem('secflow_token'); }
    return v;
  });
  const [user, setUser] = useState<UserInfo | null>(null);
  const [currentView, setCurrentView] = useState<ViewType | string>(routeView);
  const [projects, setProjects] = useState<SecurityProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(localStorage.getItem('last_project_id') || '');
  const [activeProjectId, setActiveProjectId] = useState<string>(''); 
  const [activeInstanceId, setActiveInstanceId] = useState<string>('');
  const [activeAppTemplateId, setActiveAppTemplateId] = useState<string>('');
  const [activeJobTemplateId, setActiveJobTemplateId] = useState<string>('');
  const [activeAppWorkflowId, setActiveAppWorkflowId] = useState<string>('');
  const [activeAiHelperKey, setActiveAiHelperKey] = useState<string>('');
  const [activeProcessMonitorServiceKey, setActiveProcessMonitorServiceKey] = useState<string>('');
  const [activeB2STaskId, setActiveB2STaskId] = useState<string>('');
  const [activeB2SItemId, setActiveB2SItemId] = useState<string>('');
  const [activeSystemAnalysisTaskId, setActiveSystemAnalysisTaskId] = useState<string>('');
  const [activeEntryAnalysisTaskId, setActiveEntryAnalysisTaskId] = useState<string>('');
  const [activeDataflowAnalysisTaskId, setActiveDataflowAnalysisTaskId] = useState<string>('');
  const [activeDataflowVulnScanTaskId, setActiveDataflowVulnScanTaskId] = useState<string>('');
  const [activeFirmwareUnpackerTaskId, setActiveFirmwareUnpackerTaskId] = useState<string>('');
  const [activeBinarySecurityTaskId, setActiveBinarySecurityTaskId] = useState<string>('');
  const [activeSourceSecurityTaskId, setActiveSourceSecurityTaskId] = useState<string>('');
  const [activeBinaryModuleSecurityTaskId, setActiveBinaryModuleSecurityTaskId] = useState<string>('');
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

  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  const navigateToView = useCallback((nextView: ViewType | string, options?: { path?: string; taskId?: string; keepFirmwareDetail?: boolean }) => {
    const normalizedView = String(nextView || DEFAULT_VIEW);
    const requestedPath = String(options?.path || '').trim();
    const requestedTaskId = String(options?.taskId || '').trim();
    if (
      (normalizedView === 'pentest-exec-firmware-unpacker' || normalizedView === 'pentest-exec-firmware-task-list')
      && !options?.keepFirmwareDetail
    ) {
      setActiveFirmwareUnpackerTaskId('');
    }
    const targetUrl =
      normalizedView === 'project-file-explorer' && requestedPath
        ? `/${normalizedView}?path=${encodeURIComponent(requestedPath)}`
        : /* [DISABLED] binary-evolution-dataflow-vuln - 方便后续复用
          normalizedView === 'binary-evolution-dataflow-vuln' && requestedTaskId
            ? `/${normalizedView}/${encodeURIComponent(requestedTaskId)}`
          : */ `/${normalizedView}`;
    setCurrentView(normalizedView);
    if (!isServiceTerminalWindow) {
      const loc = locationRef.current;
      if (`${loc.pathname}${loc.search}` !== targetUrl) {
        navigate(targetUrl);
      }
    }
  }, [isServiceTerminalWindow, navigate]);

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
    window.addEventListener('chimera-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('chimera-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (isServiceTerminalWindow) return;
    if (routeView !== currentView) {
      setCurrentView(routeView);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServiceTerminalWindow, routeView]);

  useEffect(() => {
    if (isServiceTerminalWindow) return;
    if (location.pathname === '/') {
      navigate(`/${DEFAULT_VIEW}`, { replace: true });
    }
  }, [isServiceTerminalWindow, location.pathname, navigate]);

  useEffect(() => {
    const handleNavigateView = (event: Event) => {
      const detail = (event as CustomEvent<{
        view?: string;
        helperKey?: string;
        processMonitorServiceKey?: string;
        b2sTaskId?: string;
        b2sItemId?: string;
        systemAnalysisTaskId?: string;
        entryAnalysisTaskId?: string;
        dataflowAnalysisTaskId?: string;
        dataflowVulnScanTaskId?: string;
        firmwareUnpackerTaskId?: string;
        binarySecurityTaskId?: string;
        sourceSecurityTaskId?: string;
        binaryEvolutionTaskId?: string;
        path?: string;
      }>).detail;
      const nextView = String(detail?.view || '').trim();
      const requestedPath = String(detail?.path || '').trim();
      const b2sTaskId = String(detail?.b2sTaskId || '').trim();
      if (b2sTaskId) {
        setActiveB2STaskId(b2sTaskId);
      }
      const b2sItemId = String(detail?.b2sItemId || '').trim();
      if (b2sItemId) {
        setActiveB2SItemId(b2sItemId);
      }
      const systemAnalysisTaskId = String(detail?.systemAnalysisTaskId || '').trim();
      if (systemAnalysisTaskId) {
        setActiveSystemAnalysisTaskId(systemAnalysisTaskId);
      }
      const entryAnalysisTaskId = String(detail?.entryAnalysisTaskId || '').trim();
      if (entryAnalysisTaskId) {
        setActiveEntryAnalysisTaskId(entryAnalysisTaskId);
      }
      const dataflowAnalysisTaskId = String(detail?.dataflowAnalysisTaskId || '').trim();
      if (dataflowAnalysisTaskId) {
        setActiveDataflowAnalysisTaskId(dataflowAnalysisTaskId);
      }
      const dataflowVulnScanTaskId = String(detail?.dataflowVulnScanTaskId || '').trim();
      if (dataflowVulnScanTaskId) {
        setActiveDataflowVulnScanTaskId(dataflowVulnScanTaskId);
      }
      const firmwareUnpackerTaskId = String(detail?.firmwareUnpackerTaskId || '').trim();
      if (firmwareUnpackerTaskId) {
        setActiveFirmwareUnpackerTaskId(firmwareUnpackerTaskId);
      }
      const binarySecurityTaskId = String(detail?.binarySecurityTaskId || '').trim();
      if (binarySecurityTaskId) {
        setActiveBinarySecurityTaskId(binarySecurityTaskId);
      }
      const sourceSecurityTaskId = String(detail?.sourceSecurityTaskId || '').trim();
      if (sourceSecurityTaskId) {
        setActiveSourceSecurityTaskId(sourceSecurityTaskId);
      }
      const binaryEvolutionTaskId = String(detail?.binaryEvolutionTaskId || '').trim();
      if (nextView) {
        navigateToView(nextView, {
          ...(requestedPath ? { path: requestedPath } : {}),
          ...(binaryEvolutionTaskId ? { taskId: binaryEvolutionTaskId } : {}),
          keepFirmwareDetail: Boolean(firmwareUnpackerTaskId),
        });
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
    window.addEventListener('chimera-navigate-view', handleNavigateView as EventListener);
    return () => window.removeEventListener('chimera-navigate-view', handleNavigateView as EventListener);
  }, [navigateToView]);

  useEffect(() => {
    if (token) {
      platformApi.auth.validateToken()
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
      const summary = await platformApi.menu.getServiceHealthSummary();
      const services = summary.services || {};
      setResourceServiceHealthy(resolveMenuServiceHealth(services, ['chimera-resource', 'chimera-platform-resource']));
      setStaticPackageHealthy(resolveMenuServiceHealth(services, ['chimera-static-binary', 'chimera-platform-static-binary']));
      setProjectServiceHealthy(resolveMenuServiceHealth(services, ['chimera-project', 'chimera-platform-project']));
      setEnvServiceHealthy(resolveMenuServiceHealth(services, ['chimera-k8s', 'chimera-platform-k8s']));
      setCodeAuditServiceHealthy(resolveMenuServiceHealth(services, ['vscode-web-manager', 'chimera-app-code-server']));
      setWorkflowServiceHealthy(resolveMenuServiceHealth(services, ['chimera-workflow', 'chimera-platform-workflow', 'chimera-workflow-status']));
      setVulnServiceHealthy(resolveMenuServiceHealth(services, ['chimera-platform-vuln']));
      setConfigCenterServiceHealthy(resolveMenuServiceHealth(services, ['chimera-platform-configcenter']));
    } catch (e) {
      setResourceServiceHealthy(false);
      setStaticPackageHealthy(false);
      setProjectServiceHealthy(false);
      setEnvServiceHealthy(false);
      setCodeAuditServiceHealthy(false);
      setWorkflowServiceHealthy(false);
      setVulnServiceHealthy(false);
      setConfigCenterServiceHealthy(false);
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
      const stats = await platformApi.admin.getStatistics();
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
    navigateToView(getUserCenterDefaultView(user));
  }, [user, currentView, navigateToView]);

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('last_project_id', selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && PROJECT_REQUIRED_VIEWS.has(currentView)) {
      navigateToView('dashboard');
    }
  }, [selectedProjectId, currentView, navigateToView]);

  const fetchDashboardServicesCount = async (onlineAgents: Agent[]) => {
    if (onlineAgents.length === 0) return;
    try {
      const promises = onlineAgents.map(a => environmentApi.environment.getAgentServices(a.key).catch(() => ({ services: [] })));
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
        environmentApi.environment.getAgents(selectedProjectId).then(d => {
          const agentList = d.agents || [];
          setAgents(agentList);
          fetchDashboardServicesCount(agentList.filter(a => a.status === 'online'));
        }).catch(e => console.error(e));
        
        environmentApi.environment.getTemplates().then(d => setTemplates(d.templates || [])).catch(e => console.error(e));
        assetApi.staticPackages.list().then(d => setStaticPackages(d.packages || [])).catch(e => console.error(e));
        assetApi.staticPackages.getStats().then(d => setPackageStats(d.statistics)).catch(e => console.error(e));
      }
    }
  }, [selectedProjectId, currentView, token]);

  const fetchProjects = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      const data = await projectApi.projects.list();
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
      const data = await platformApi.auth.login(credentials);
      localStorage.setItem('chimera_token', data.access_token);
      setToken(data.access_token);
    } catch (err: any) {
      setLoginError(err.message || "登录失败，请检查用户名和密码");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('chimera_token');
    setToken(null);
    setUser(null);
    setProjects([]);
    setSelectedProjectId('');
    navigateToView('dashboard');
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
      await platformApi.auth.changeOwnPassword({
        old_password: forcedPasswordForm.old_password,
        new_password: forcedPasswordForm.new_password,
      });
      setForcedPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      const refreshedUser = await platformApi.auth.validateToken();
      setUser(refreshedUser);
      await fetchProjects(true);
    } catch (err: any) {
      setForcedPasswordError(err.message || '修改密码失败');
    } finally {
      setForcedPasswordLoading(false);
    }
  };

  if (isServiceTerminalWindow) {
    return <ServiceTerminalWindowPage />;
  }

  if (!token) return (
    <>
      <div className="h-screen w-full flex items-center justify-center bg-theme-login relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 20% 18%, rgba(212,160,48,0.18), transparent 18%), radial-gradient(circle at 82% 76%, rgba(42,90,143,0.22), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
            }}
          />
        </div>

        <div className="w-full max-w-md p-10 backdrop-blur-xl rounded-[2.5rem] shadow-brand relative z-10" style={{ backgroundColor: 'var(--bg-login-card)', border: '1px solid var(--login-border)' }}>
          <div className="flex flex-col items-center mb-10 text-center">
            <ThemeLogo size="large" showBadge />
          </div>

          {loginError && (
            <div className="mb-6 p-4 bg-state-danger-soft border border-state-danger-border text-state-danger rounded-2xl text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-theme-text-faint uppercase ml-2">账户名称</label>
              <input name="username" required className="theme-login-input" placeholder="Username" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-theme-text-faint uppercase ml-2">身份凭证</label>
              <input name="password" type="password" required className="theme-login-input" placeholder="Password" />
            </div>
            <button disabled={isLoading} className="theme-primary-button w-full py-4 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100">
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : '进入平台'}
            </button>
          </form>
        </div>
      </div>
      <DialogViewport />
    </>
  );

  return (
    <UploadCenterProvider>
      <div className="flex h-screen flex-col bg-theme-app text-theme-text-primary overflow-hidden font-sans">
        <Header 
          user={user} 
          currentTopLevelNav={activeTopLevelNav}
          onSelectTopLevelNav={(nav) => navigateToView(getTopLevelDefaultView(nav, user))}
          projects={projects} 
          selectedProjectId={selectedProjectId} 
          setSelectedProjectId={setSelectedProjectId} 
          isProjectDropdownOpen={isProjectDropdownOpen} 
          setIsProjectDropdownOpen={setIsProjectDropdownOpen} 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          fetchProjects={fetchProjects} 
          isRefreshing={isRefreshing}
          setCurrentView={navigateToView}
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
            setCurrentView={navigateToView} 
            resourceHealth={resourceServiceHealthy}
            staticPackageHealth={staticPackageHealthy}
            projectHealth={projectServiceHealthy}
            envHealth={envServiceHealthy}
            codeAuditHealth={codeAuditServiceHealthy}
            workflowHealth={workflowServiceHealthy}
            vulnHealth={vulnServiceHealthy}
            configCenterHealth={configCenterServiceHealthy}
          />

          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {user?.must_change_password ? (
                <div className="min-h-full flex items-center justify-center bg-theme-app p-8">
                  <div className="w-full max-w-lg rounded-[2.5rem] bg-theme-surface border border-theme-border shadow-panel p-10">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-3xl bg-amber-500 text-white flex items-center justify-center shadow-brand">
                        <Lock size={26} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-theme-text-primary">首次登录请先修改密码</h2>
                        <p className="mt-1 text-sm font-medium text-theme-text-secondary">账号 <span className="font-black text-theme-text-primary">{user.username}</span> 当前被设置为首次登录强制改密，修改完成后才可继续使用系统。</p>
                      </div>
                    </div>
                    {forcedPasswordError && (
                      <div className="mt-6 rounded-2xl border border-state-danger-border bg-state-danger-soft px-4 py-3 text-sm font-semibold text-state-danger">
                        {forcedPasswordError}
                      </div>
                    )}
                    <form onSubmit={handleForcedPasswordChange} className="mt-8 space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint ml-1">当前密码</label>
                        <input
                          type="password"
                          required
                          className="theme-form-input w-full px-6 py-4"
                          value={forcedPasswordForm.old_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, old_password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint ml-1">新密码</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          className="theme-form-input w-full px-6 py-4"
                          value={forcedPasswordForm.new_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, new_password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint ml-1">确认新密码</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          className="theme-form-input w-full px-6 py-4"
                          value={forcedPasswordForm.confirm_password}
                          onChange={(e) => setForcedPasswordForm({ ...forcedPasswordForm, confirm_password: e.target.value })}
                        />
                      </div>
                      <button disabled={forcedPasswordLoading} className="theme-primary-button w-full py-4">
                        {forcedPasswordLoading ? <Loader2 className="animate-spin" size={20} /> : '修改密码并进入系统'}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                user && !canAccessView(user, currentView) ? (
                  <div className="p-20 text-center"><h3 className="text-xl font-black text-theme-text-faint">当前账号无权访问该页面。</h3></div>
                ) : (
                  renderCurrentView({
                    currentView: String(currentView),
                    user,
                    projects,
                    agents,
                    templates,
                    staticPackages,
                    packageStats,
                    dashboardServicesCount,
                    adminStats,
                    adminStatsLoading,
                    selectedProjectId,
                    activeProjectId,
                    activePackageId,
                    activeInstanceId,
                    activeAppTemplateId,
                    activeJobTemplateId,
                    activeAppWorkflowId,
                    activeAiHelperKey,
                    activeProcessMonitorServiceKey,
                    activeB2STaskId,
                    activeB2SItemId,
                    activeSystemAnalysisTaskId,
                    activeEntryAnalysisTaskId,
                    activeDataflowAnalysisTaskId,
                    activeDataflowVulnScanTaskId,
                    activeFirmwareUnpackerTaskId,
                    activeBinarySecurityTaskId,
                    activeSourceSecurityTaskId,
                    activeBinaryModuleSecurityTaskId,
                    selectedStaticPkgIds,
                    setCurrentView: navigateToView,
                    setSelectedProjectId: (id) => setSelectedProjectId(id),
                    setActiveProjectId: (id) => setActiveProjectId(id),
                    setActivePackageId: (id) => setActivePackageId(id),
                    setActiveInstanceId: (id) => setActiveInstanceId(id),
                    setActiveAppTemplateId: (id) => setActiveAppTemplateId(id),
                    setActiveJobTemplateId: (id) => setActiveJobTemplateId(id),
                    setActiveAppWorkflowId: (id) => setActiveAppWorkflowId(id),
                    setActiveB2STaskId: (id) => setActiveB2STaskId(id),
                    setActiveB2SItemId: (id) => setActiveB2SItemId(id),
                    setActiveSystemAnalysisTaskId: (id) => setActiveSystemAnalysisTaskId(id),
                    setActiveEntryAnalysisTaskId: (id) => setActiveEntryAnalysisTaskId(id),
                    setActiveDataflowAnalysisTaskId: (id) => setActiveDataflowAnalysisTaskId(id),
                    setActiveDataflowVulnScanTaskId: (id) => setActiveDataflowVulnScanTaskId(id),
                    setActiveFirmwareUnpackerTaskId: (id) => setActiveFirmwareUnpackerTaskId(id),
                    setActiveBinarySecurityTaskId: (id) => setActiveBinarySecurityTaskId(id),
                    setActiveSourceSecurityTaskId: (id) => setActiveSourceSecurityTaskId(id),
                    setActiveBinaryModuleSecurityTaskId: (id) => setActiveBinaryModuleSecurityTaskId(id),
                    setSelectedStaticPkgIds: (ids) => setSelectedStaticPkgIds(ids),
                    fetchProjects,
                    fetchAdminStats,
                    refreshStaticPackages: async () => {
                      const data = await assetApi.staticPackages.list();
                      setStaticPackages(data.packages || []);
                    },
                  })
                )
              )}
            </div>
          </main>
        </div>
        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
          @keyframes zoom-fade-in {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-in {
            animation: zoom-fade-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
            transform-origin: center;
          }
          .animate-in.duration-100 { animation-duration: 0.1s; }
          .animate-in.duration-200 { animation-duration: 0.2s; }
          .animate-in.duration-300 { animation-duration: 0.3s; }
          .animate-in.duration-500 { animation-duration: 0.5s; }
        `}</style>
      </div>
      <GlobalUploadWidget />
      <DialogViewport />
    </UploadCenterProvider>
  );
};

const App: React.FC = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/:view" element={<AppShell />} />
      <Route path="/:view/:taskId" element={<AppShell />} />
    </Routes>
  </HashRouter>
);

export default App;
