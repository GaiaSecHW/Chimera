import React from 'react';
import { Settings } from 'lucide-react';
import { api } from '../clients/api';
import { WorkflowPlaceholder } from '../components/WorkflowPlaceholder';
import { DashboardPage } from '../pages/DashboardPage';
import { HomePage } from '../pages/HomePage';
import { ProjectMgmtPage } from '../pages/project/ProjectMgmtPage';
import { ProjectDetailPage } from '../pages/project/ProjectDetailPage';
import { ProductMgmtPage } from '../pages/project/ProductMgmtPage';
import { StaticPackagesPage } from '../pages/assets/StaticPackagesPage';
import { StaticPackageDetailPage } from '../pages/assets/StaticPackageDetailPage';
import { DeployScriptPage } from '../pages/assets/DeployScriptPage';
import { SecurityAssessmentPage } from '../pages/SecurityAssessmentPage';
import { ConfigCenterLlmPage } from '../pages/platform/ConfigCenterLlmPage';
import { ConfigCenterLlmChatPage } from '../pages/platform/ConfigCenterLlmChatPage';
import { ChimeraScheduleCenterPage } from '../pages/platform/ChimeraScheduleCenterPage';
import { ChimeraScheduleConfigPage } from '../pages/platform/ChimeraScheduleConfigPage';
import { PublicResourceManagementPage } from '../pages/assets/PublicResourceManagementPage';
import { ProjectFileExplorerPage } from '../pages/assets/ProjectFileExplorerPage';
import { FileserverArchiveTasksPage } from '../pages/assets/FileserverArchiveTasksPage';
import { EnvAgentPage } from '../pages/environment/EnvAgentPage';
import { EnvTemplatePage } from '../pages/environment/EnvTemplatePage';
import { EnvTasksPage } from '../pages/environment/EnvTasksPage';
import { ServiceMgmtPage } from '../pages/environment/ServiceMgmtPage';
import { EnvAiHelperPage } from '../pages/environment/EnvAiHelperPage';
import { EnvAiAgentManagePage } from '../pages/environment/EnvAiAgentManagePage';
import { EnvAiAgentSessionManagePage } from '../pages/environment/EnvAiAgentSessionManagePage';
import { EnvAiSessionPage } from '../pages/environment/EnvAiSessionPage';
import { EnvAiBatchSessionPage } from '../pages/environment/EnvAiBatchSessionPage';
import { EnvProcessMonitorOverviewPage } from '../pages/environment/EnvProcessMonitorOverviewPage';
import { EnvProcessMonitorDetailPage } from '../pages/environment/EnvProcessMonitorDetailPage';
import { EnvProcessMonitorTasksPage } from '../pages/environment/EnvProcessMonitorTasksPage';
import { SystemAnalysisTaskPage } from '../pages/execution/SystemAnalysisTaskPage';
import { SystemAnalysisTaskDetailPage } from '../pages/execution/SystemAnalysisTaskDetailPage';
import { SystemAnalysisConfigPage } from '../pages/execution/SystemAnalysisConfigPage';
import { DataflowVulnScanTaskPage } from '../pages/execution/DataflowVulnScanTaskPage';
import { DataflowVulnScanTaskDetailPage } from '../pages/execution/DataflowVulnScanTaskDetailPage';
import { DataflowVulnScanConfigPage } from '../pages/execution/DataflowVulnScanConfigPage';
import { VulnVerifyTaskPage } from '../pages/execution/VulnVerifyTaskPage';
import { EntryAnalysisTaskPage } from '../pages/execution/EntryAnalysisTaskPage';
import { EntryAnalysisTaskDetailPage } from '../pages/execution/EntryAnalysisTaskDetailPage';
import { EntryAnalysisConfigPage } from '../pages/execution/EntryAnalysisConfigPage';
import { WorkflowInstancePage } from '../pages/orchestration/WorkflowInstancePage';
import { WorkflowInstanceDetailPage } from '../pages/orchestration/WorkflowInstanceDetailPage';
import { WorkflowInstanceLogsPage } from '../pages/orchestration/WorkflowInstanceLogsPage';
import { JobTemplatePage } from '../pages/orchestration/JobTemplatePage';
import { JobTemplateDetailPage } from '../pages/orchestration/JobTemplateDetailPage';
import { AppTemplatePage } from '../pages/orchestration/AppTemplatePage';
import { AppTemplateDetailPage } from '../pages/orchestration/AppTemplateDetailPage';
import { AppInstancePage } from '../pages/orchestration/AppInstancePage';
import { AppInstanceDetailPage } from '../pages/orchestration/AppInstanceDetailPage';
import { ExecutionCodeAuditPage } from '../pages/execution/ExecutionCodeAuditPage';
import { ExecutionWorkPlatformPage } from '../pages/execution/ExecutionWorkPlatformPage';
import { FirmwareUnpackerPage } from '../pages/execution/FirmwareUnpackerPage';
import { FirmwareEvolutionCenterPage } from '../pages/execution/FirmwareEvolutionCenterPage';
import { ReportsPage } from '../pages/execution/ReportsPage';
import { TestInputPage } from '../pages/TestInputPage';
import { TaskCenterPage } from '../pages/task/TaskCenterPage';
import { TaskCenterTimelinePage } from '../pages/task/TaskCenterTimelinePage';
import { WebEndToEndPage } from '../pages/task/WebEndToEndPage';
import { KnowledgeGraphPage } from '../pages/task/KnowledgeGraphPage';
// [DISABLED] DataflowVulnTask import - 方便后续复用
// import { DataflowVulnTaskDetailPage, DataflowVulnTaskListPage } from '../pages/execution/DataflowVulnScanPage';
import { BinaryEvolutionCenterPage } from '../pages/execution/BinaryEvolutionCenterPage';
import { BinarySecurityOverviewPage } from '../pages/execution/BinarySecurityOverviewPage';
import { BinarySecurityConfigPage } from '../pages/execution/BinarySecurityConfigPage';
import BinarySecurityMetricsDashboardPage from '../pages/execution/BinarySecurityMetricsDashboardPage';
import { BinarySecurityTaskDetailPage } from '../pages/execution/BinarySecurityTaskDetailPage';
import { AppScanOverviewPage } from '../pages/ai4app/AppScanOverviewPage';
import { AppScanMonitorPage } from '../pages/ai4app/AppScanMonitorPage';
import { AppScanTaskDetailPage } from '../pages/ai4app/AppScanTaskDetailPage';
import { MobileSecurityIpcVulnPage } from '../pages/execution/MobileSecurityIpcVulnPage';
import { KernelScanPage } from '../pages/execution/KernelScanPage';
import { AtomicCapabilityOverviewPage } from '../pages/execution/AtomicCapabilityOverviewPage';
import { ToolOverviewPage } from '../pages/execution/ToolOverviewPage';
import { VulnOverviewPage } from '../pages/vuln/VulnOverviewPage';
import { VulnIntakePage } from '../pages/vuln/VulnIntakePage';
import { VulnAnalysisPage } from '../pages/vuln/VulnAnalysisPage';
import { VulnAnalysisDetailPage } from '../pages/vuln/VulnAnalysisDetailPage';
import { VulnAutoVerifyCreatePage } from '../pages/vuln/VulnAutoVerifyCreatePage';
import { VulnVerificationPage } from '../pages/vuln/VulnVerificationPage';
import { VulnVerificationDetailPage } from '../pages/vuln/VulnVerificationDetailPage';
import { VulnDecisionPage } from '../pages/vuln/VulnDecisionPage';
import { VulnDecisionDetailPage } from '../pages/vuln/VulnDecisionDetailPage';
// [DISABLED] 评审研判 - 方便后续复用
// import { ReviewJudgmentPage } from '../pages/vuln/ReviewJudgmentPage';
// import { ReviewJudgmentDetailPage } from '../pages/vuln/ReviewJudgmentDetailPage';
import { VulnQueuePage } from '../pages/vuln/VulnQueuePage';
import { VulnServicesPage } from '../pages/vuln/VulnServicesPage';
import { VulnReproConfigPage } from '../pages/vuln/VulnReproConfigPage';
import { VulnParameterConfigPage } from '../pages/vuln/VulnParameterConfigPage';
import { B2SOverviewPage } from '../pages/execution/B2SOverviewPage';
import { B2STaskAdvancedPage } from '../pages/execution/B2STaskAdvancedPage';
import { consumeTaskCenterReturnContext, saveExecutionReturnContext } from '../utils/executionReturnContext';
import { B2STaskDetailPage } from '../pages/execution/B2STaskDetailPage';
import { RedlineOverviewPage } from '../pages/redline/RedlineOverviewPage';
import { RedlineTaskDetailPage } from '../pages/redline/RedlineTaskDetailPage';
import { UserMgmtPage } from '../pages/platform/UserMgmtPage';
import { RoleMgmtPage } from '../pages/platform/RoleMgmtPage';
import { PermMgmtPage } from '../pages/platform/PermMgmtPage';
import { OnlineSessionPage } from '../pages/platform/OnlineSessionPage';
import { MachineTokenPage } from '../pages/platform/MachineTokenPage';
import { UserPermissionPage } from '../pages/platform/UserPermissionPage';
import { DepartmentPage } from '../pages/platform/DepartmentPage';
import { DepartmentMemberPage } from '../pages/platform/DepartmentMemberPage';
import { ProjectPage } from '../pages/platform/ProjectPage';
import { AdminDashboardPage } from '../pages/platform/AdminDashboardPage';
import { AiGatewayDashboardPage } from '../pages/platform/AiGatewayDashboardPage';
import { AiGatewayPage } from '../pages/platform/AiGatewayPage';
import { ChangePasswordPage } from '../pages/platform/ChangePasswordPage';
import { Agent, AdminDashboardStats, EnvTemplate, SecurityProject, StaticPackage, PackageStats, UserInfo } from '../types/types';

export interface ViewRegistryContext {
  currentView: string;
  user: UserInfo | null;
  projects: SecurityProject[];
  agents: Agent[];
  templates: EnvTemplate[];
  staticPackages: StaticPackage[];
  packageStats: PackageStats | null;
  dashboardServicesCount: number;
  adminStats: AdminDashboardStats | null;
  adminStatsLoading: boolean;
  selectedProjectId: string;
  activeProjectId: string;
  activePackageId: string;
  activeInstanceId: string;
  activeAppTemplateId: string;
  activeJobTemplateId: string;
  activeAppWorkflowId: string;
  activeAiHelperKey: string;
  activeProcessMonitorServiceKey: string;
  activeB2STaskId: string;
  activeB2SItemId: string;
  activeSystemAnalysisTaskId: string;
  activeEntryAnalysisTaskId: string;
  activeDataflowAnalysisTaskId: string;
  activeDataflowVulnScanTaskId: string;
  activeFirmwareUnpackerTaskId: string;
  activeBinarySecurityTaskId: string;
  activeSourceSecurityTaskId: string;
  activeBinaryModuleSecurityTaskId: string;
  activeAppScanTaskId: string;
  activeRedlineTaskId: string;
  activeTaskCenterTimelineTaskId: string;
  selectedStaticPkgIds: Set<string>;
  setCurrentView: (view: string) => void;
  setSelectedProjectId: (id: string) => void;
  setActiveProjectId: (id: string) => void;
  setActivePackageId: (id: string) => void;
  setActiveInstanceId: (id: string) => void;
  setActiveAppTemplateId: (id: string) => void;
  setActiveJobTemplateId: (id: string) => void;
  setActiveAppWorkflowId: (id: string) => void;
  setActiveB2STaskId: (id: string) => void;
  setActiveB2SItemId: (id: string) => void;
  setActiveSystemAnalysisTaskId: (id: string) => void;
  setActiveEntryAnalysisTaskId: (id: string) => void;
  setActiveDataflowAnalysisTaskId: (id: string) => void;
  setActiveDataflowVulnScanTaskId: (id: string) => void;
  setActiveFirmwareUnpackerTaskId: (id: string) => void;
  setActiveBinarySecurityTaskId: (id: string) => void;
  setActiveSourceSecurityTaskId: (id: string) => void;
  setActiveBinaryModuleSecurityTaskId: (id: string) => void;
  setActiveAppScanTaskId: (id: string) => void;
  setActiveRedlineTaskId: (id: string) => void;
  setActiveTaskCenterTimelineTaskId: (id: string) => void;
  setSelectedStaticPkgIds: (ids: Set<string>) => void;
  fetchProjects: (refresh?: boolean) => Promise<void>;
  fetchAdminStats: () => Promise<void>;
  refreshStaticPackages: () => Promise<void>;
}

const EmptyPlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="p-10 h-full flex items-center justify-center">
    <h2 className="text-2xl font-black text-theme-text-faint">{title}</h2>
  </div>
);

export const renderCurrentView = (ctx: ViewRegistryContext): React.ReactNode => {
  switch (ctx.currentView) {
    case 'home':
      return <HomePage setCurrentView={ctx.setCurrentView} />;
    case 'dashboard':
      return (
        <DashboardPage
          projects={ctx.projects}
          agents={ctx.agents}
          staticPackages={ctx.staticPackages}
          templates={ctx.templates}
          servicesCount={ctx.dashboardServicesCount}
          packageStats={ctx.packageStats}
          adminStats={ctx.adminStats}
          adminStatsLoading={ctx.adminStatsLoading}
          fetchAdminStats={ctx.fetchAdminStats}
          setCurrentView={ctx.setCurrentView}
        />
      );
    case 'admin-dashboard':
      return (
        <AdminDashboardPage
          adminStats={ctx.adminStats}
          loading={ctx.adminStatsLoading}
          onRefresh={ctx.fetchAdminStats}
          setCurrentView={ctx.setCurrentView}
        />
      );
    case 'aigw-dashboard':
      return <AiGatewayDashboardPage onNavigate={ctx.setCurrentView} />;
    case 'aigw-config':
    case 'aigw-keys':
    case 'aigw-logs':
    case 'aigw-token-stats':
    case 'aigw-admin':
      return <AiGatewayPage entryView={ctx.currentView} onNavigate={ctx.setCurrentView} />;
    case 'project-mgmt':
      return (
        <ProjectMgmtPage
          projects={ctx.projects}
          setSelectedProjectId={ctx.setSelectedProjectId}
          setActiveProjectId={ctx.setActiveProjectId}
          setCurrentView={ctx.setCurrentView}
          refreshProjects={ctx.fetchProjects}
        />
      );
    case 'project-detail':
      return <ProjectDetailPage projectId={ctx.activeProjectId} projects={ctx.projects} onBack={() => ctx.setCurrentView('project-mgmt')} />;
    case 'product-mgmt':
      return <ProductMgmtPage />;
    case 'task-list':
      return <TaskCenterPage projectId={ctx.selectedProjectId} projects={ctx.projects} />;
    case 'task-web-end-to-end':
      return <WebEndToEndPage projectId={ctx.selectedProjectId} />;
    case 'task-knowledge-graph':
      return <KnowledgeGraphPage projectId={ctx.selectedProjectId} projects={ctx.projects} />;
    case 'assessment-coming-soon':
    case 'observe-coming-soon':
    case 'skill-coming-soon':
      return <EmptyPlaceholderPage title="开发中" />;
    case 'developer-atomic-capability':
    case 'developer-atomic-capability-overview':
      return <AtomicCapabilityOverviewPage projectId={ctx.selectedProjectId} onNavigate={ctx.setCurrentView} />;
    case 'developer-tools':
    case 'developer-tools-overview':
      return <ToolOverviewPage projectId={ctx.selectedProjectId} user={ctx.user} onNavigate={ctx.setCurrentView} />;
    case 'static-packages':
      return (
        <StaticPackagesPage
          staticPackages={ctx.staticPackages}
          packageStats={ctx.packageStats}
          fetchStaticPackages={ctx.refreshStaticPackages}
          setActivePackageId={ctx.setActivePackageId}
          setCurrentView={ctx.setCurrentView}
          selectedIds={ctx.selectedStaticPkgIds}
          setSelectedIds={ctx.setSelectedStaticPkgIds}
        />
      );
    case 'static-package-detail':
      return <StaticPackageDetailPage packageId={ctx.activePackageId} onBack={() => ctx.setCurrentView('static-packages')} />;
    case 'deploy-script-mgmt':
      return <DeployScriptPage />;
    case 'config-center-root':
    case 'config-center-llm':
      return <ConfigCenterLlmPage onOpenChat={() => ctx.setCurrentView('config-center-llm-chat')} />;
    case 'config-center-llm-chat':
      return <ConfigCenterLlmChatPage onBack={() => ctx.setCurrentView('config-center-llm')} />;
    case 'chimera-platform-schedule':
      return <ChimeraScheduleCenterPage projects={ctx.projects} initialProjectId={ctx.selectedProjectId} />;
    case 'chimera-platform-schedule-config':
      return <ChimeraScheduleConfigPage />;
    case 'task-center-timeline':
      return (
        <TaskCenterTimelinePage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeTaskCenterTimelineTaskId}
          onBack={() => ctx.setCurrentView('task-list')}
        />
      );
    case 'public-resource-pvc-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="pvc" />;
    case 'public-resource-task-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="tasks" />;
    case 'test-input-root':
    case 'test-input-release':
    case 'test-input-code':
    case 'test-input-doc':
    case 'test-input-other':
    case 'test-input-tasks':
      return <TestInputPage currentView={ctx.currentView} selectedProjectId={ctx.selectedProjectId} user={ctx.user} />;
    case 'pvc-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="pvc" />;
    case 'project-file-explorer':
      return <ProjectFileExplorerPage projectId={ctx.selectedProjectId} projects={ctx.projects} />;
    case 'fileserver-archive-tasks':
      return <FileserverArchiveTasksPage projectId={ctx.selectedProjectId} />;
    case 'env-agent':
      return <EnvAgentPage projectId={ctx.selectedProjectId} />;
    case 'env-service':
      return <ServiceMgmtPage projectId={ctx.selectedProjectId} />;
    case 'env-ai-agent':
    case 'env-ai-agent-overview':
    case 'env-ai-agent-manage':
      return <EnvAiAgentManagePage projectId={ctx.selectedProjectId} />;
    case 'env-ai-helper':
      return <EnvAiHelperPage projectId={ctx.selectedProjectId} initialHelperKey={ctx.activeAiHelperKey} />;
    case 'env-ai-agent-session-manage':
      return <EnvAiAgentSessionManagePage projectId={ctx.selectedProjectId} />;
    case 'env-ai-session':
      return <EnvAiSessionPage projectId={ctx.selectedProjectId} />;
    case 'env-ai-batch-session':
      return <EnvAiBatchSessionPage projectId={ctx.selectedProjectId} />;
    case 'env-process-monitor-root':
    case 'env-process-monitor-overview':
      return <EnvProcessMonitorOverviewPage projectId={ctx.selectedProjectId} />;
    case 'env-process-monitor-detail':
      return <EnvProcessMonitorDetailPage projectId={ctx.selectedProjectId} initialServiceKey={ctx.activeProcessMonitorServiceKey} />;
    case 'env-process-monitor-tasks':
      return <EnvProcessMonitorTasksPage projectId={ctx.selectedProjectId} />;
    case 'env-template':
      return <EnvTemplatePage projectId={ctx.selectedProjectId} />;
    case 'env-tasks':
      return <EnvTasksPage projectId={ctx.selectedProjectId} />;
    case 'pentest-system':
    case 'system-analysis-task':
      return (
        <SystemAnalysisTaskPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(taskId) => {
            saveExecutionReturnContext({ view: 'system-analysis-task' });
            ctx.setActiveSystemAnalysisTaskId(taskId);
            ctx.setCurrentView('system-analysis-detail');
          }}
        />
      );
    case 'system-analysis-detail':
      return (
        <SystemAnalysisTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeSystemAnalysisTaskId}
          onBack={() => ctx.setCurrentView('system-analysis-task')}
        />
      );
    case 'system-analysis-config':
      return <SystemAnalysisConfigPage projectId={ctx.selectedProjectId} />;
    case 'pentest-dataflow':
    case 'dataflow-analysis-task':
    case 'dataflow-analysis-detail':
    case 'dataflow-analysis-config':
      return (
        <div className="p-20 text-center">
          <h3 className="text-xl font-black text-slate-400">数据流漏洞挖掘前端页面已下线</h3>
          <p className="mt-3 text-sm text-slate-500">该功能入口已从导航中移除。</p>
        </div>
      );
    case 'pentest-dataflow-vuln-scan':
    case 'dataflow-vuln-scan-task':
      return (
        <DataflowVulnScanTaskPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(taskId) => {
            saveExecutionReturnContext({ view: 'dataflow-vuln-scan-task' });
            ctx.setActiveDataflowVulnScanTaskId(taskId);
            ctx.setCurrentView('dataflow-vuln-scan-detail');
          }}
        />
      );
    case 'dataflow-vuln-scan-detail':
      return (
        <DataflowVulnScanTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeDataflowVulnScanTaskId}
          onBack={() => ctx.setCurrentView('dataflow-vuln-scan-task')}
        />
      );
    case 'dataflow-vuln-scan-config':
      return <DataflowVulnScanConfigPage projectId={ctx.selectedProjectId} />;
    case 'pentest-vuln-verify':
    case 'vuln-verify-task':
      return <VulnVerifyTaskPage projectId={ctx.selectedProjectId} />;
    case 'workflow-instances':
      return (
        <WorkflowInstancePage
          projectId={ctx.selectedProjectId}
          onNavigateToDetail={(id) => {
            ctx.setActiveInstanceId(id);
            ctx.setCurrentView('workflow-instance-detail');
          }}
          onNavigateToLogs={(id) => {
            ctx.setActiveInstanceId(id);
            ctx.setCurrentView('workflow-instance-logs');
          }}
        />
      );
    case 'workflow-instance-detail':
      return <WorkflowInstanceDetailPage instanceId={ctx.activeInstanceId} onBack={() => ctx.setCurrentView('workflow-instances')} />;
    case 'workflow-instance-logs':
      return <WorkflowInstanceLogsPage instanceId={ctx.activeInstanceId} onBack={() => ctx.setCurrentView('workflow-instances')} />;
    case 'workflow-jobs':
      return (
        <JobTemplatePage
          projectId={ctx.selectedProjectId}
          onNavigateToDetail={(id) => {
            ctx.setActiveJobTemplateId(id);
            ctx.setCurrentView('workflow-job-detail');
          }}
        />
      );
    case 'workflow-job-detail':
      return <JobTemplateDetailPage templateId={ctx.activeJobTemplateId} onBack={() => ctx.setCurrentView('workflow-jobs')} />;
    case 'workflow-apps':
      return (
        <AppTemplatePage
          projectId={ctx.selectedProjectId}
          onNavigateToDetail={(id) => {
            ctx.setActiveAppTemplateId(id);
            ctx.setCurrentView('workflow-app-detail');
          }}
        />
      );
    case 'workflow-app-detail':
      return <AppTemplateDetailPage templateId={ctx.activeAppTemplateId} onBack={() => ctx.setCurrentView('workflow-apps')} />;
    case 'workflow-app-instances':
      return (
        <AppInstancePage
          projectId={ctx.selectedProjectId}
          onNavigateToDetail={(id) => {
            ctx.setActiveAppWorkflowId(id);
            ctx.setCurrentView('workflow-app-instance-detail');
          }}
        />
      );
    case 'workflow-app-instance-detail':
      return ctx.activeAppWorkflowId ? (
        <AppInstanceDetailPage instanceId={ctx.activeAppWorkflowId} onBack={() => ctx.setCurrentView('workflow-app-instances')} />
      ) : (
        <AppInstancePage
          projectId={ctx.selectedProjectId}
          onNavigateToDetail={(id) => {
            ctx.setActiveAppWorkflowId(id);
            ctx.setCurrentView('workflow-app-instance-detail');
          }}
        />
      );
    case 'pentest-threat':
    case 'entry-analysis-root':
    case 'entry-analysis-task':
      return (
        <EntryAnalysisTaskPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(id) => {
            saveExecutionReturnContext({ view: 'entry-analysis-task' });
            ctx.setActiveEntryAnalysisTaskId(id);
            ctx.setCurrentView('entry-analysis-detail');
          }}
        />
      );
    case 'entry-analysis-detail':
      return (
        <EntryAnalysisTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeEntryAnalysisTaskId}
          onBack={() => ctx.setCurrentView('entry-analysis-task')}
        />
      );
    case 'entry-analysis-config':
      return <EntryAnalysisConfigPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-code':
      return <ExecutionCodeAuditPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-work':
      return <ExecutionWorkPlatformPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-firmware-unpacker':
    case 'pentest-exec-firmware-task-list':
      return (
        <FirmwareUnpackerPage
          projectId={ctx.selectedProjectId}
          projects={ctx.projects}
          initialTaskId={ctx.activeFirmwareUnpackerTaskId}
          onActiveTaskChange={ctx.setActiveFirmwareUnpackerTaskId}
        />
      );
    case 'pentest-exec-firmware-config':
      return <BinarySecurityConfigPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-b2s':
    case 'pentest-exec-b2s-root':
    case 'pentest-exec-b2s-task-list':
    case 'pentest-exec-b2s-create':
    case 'pentest-exec-b2s-queue':
    case 'pentest-exec-b2s-result':
      return (
        <B2SOverviewPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(taskId) => {
            saveExecutionReturnContext({ view: 'pentest-exec-b2s' });
            ctx.setActiveB2STaskId(taskId);
            ctx.setCurrentView('pentest-exec-b2s-detail');
          }}
        />
      );
    case 'pentest-exec-b2s-detail':
      return (
        <B2STaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeB2STaskId}
          onBack={() => ctx.setCurrentView('pentest-exec-b2s')}
          onOpenAdvanced={(itemId) => {
            saveExecutionReturnContext({ view: 'pentest-exec-b2s-detail', b2sTaskId: ctx.activeB2STaskId });
            ctx.setActiveB2SItemId(itemId);
            ctx.setCurrentView('pentest-exec-b2s-advanced');
          }}
        />
      );
    case 'pentest-exec-b2s-advanced':
      return (
        <B2STaskAdvancedPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeB2STaskId}
          itemId={ctx.activeB2SItemId}
          onBack={() => ctx.setCurrentView('pentest-exec-b2s-detail')}
        />
      );
    case 'binary-security':
    case 'binary-security-root':
    case 'binary-security-task-list':
      return (
        <BinarySecurityOverviewPage
          projectId={ctx.selectedProjectId}
          taskType="binary"
          onOpenTask={(taskId) => {
            ctx.setActiveBinarySecurityTaskId(taskId);
            ctx.setCurrentView('binary-security-detail');
          }}
        />
      );
    case 'binary-security-detail':
      if (!ctx.activeBinarySecurityTaskId) {
        return (
          <BinarySecurityOverviewPage
            projectId={ctx.selectedProjectId}
            taskType="binary"
            onOpenTask={(taskId) => {
              ctx.setActiveBinarySecurityTaskId(taskId);
              ctx.setCurrentView('binary-security-detail');
            }}
          />
        );
      }
      return (
        <BinarySecurityTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeBinarySecurityTaskId}
          taskType="binary"
          onBack={() => ctx.setCurrentView(consumeTaskCenterReturnContext() ? 'task-list' : 'binary-security')}
        />
      );
    case 'source-security':
      return (
        <BinarySecurityOverviewPage
          projectId={ctx.selectedProjectId}
          taskType="source"
          onOpenTask={(taskId) => {
            ctx.setActiveSourceSecurityTaskId(taskId);
            ctx.setCurrentView('source-security-detail');
          }}
        />
      );
    case 'source-security-detail':
      if (!ctx.activeSourceSecurityTaskId) {
        return (
          <BinarySecurityOverviewPage
            projectId={ctx.selectedProjectId}
            taskType="source"
            onOpenTask={(taskId) => {
              ctx.setActiveSourceSecurityTaskId(taskId);
              ctx.setCurrentView('source-security-detail');
            }}
          />
        );
      }
      return (
        <BinarySecurityTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeSourceSecurityTaskId}
          taskType="source"
          onBack={() => ctx.setCurrentView(consumeTaskCenterReturnContext() ? 'task-list' : 'source-security')}
        />
      );
    case 'binary-module-security':
      return (
        <BinarySecurityOverviewPage
          projectId={ctx.selectedProjectId}
          taskType="binary_module"
          onOpenTask={(taskId) => {
            ctx.setActiveBinaryModuleSecurityTaskId(taskId);
            ctx.setCurrentView('binary-module-security-detail');
          }}
        />
      );
    case 'binary-module-security-detail':
      if (!ctx.activeBinaryModuleSecurityTaskId) {
        return (
          <BinarySecurityOverviewPage
            projectId={ctx.selectedProjectId}
            taskType="binary_module"
            onOpenTask={(taskId) => {
              ctx.setActiveBinaryModuleSecurityTaskId(taskId);
              ctx.setCurrentView('binary-module-security-detail');
            }}
          />
        );
      }
      return (
        <BinarySecurityTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeBinaryModuleSecurityTaskId}
          taskType="binary_module"
          onBack={() => ctx.setCurrentView(consumeTaskCenterReturnContext() ? 'task-list' : 'binary-module-security')}
        />
      );
    case 'app-security-scan':
      return (
        <AppScanOverviewPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(toolTaskId) => {
            ctx.setActiveAppScanTaskId(toolTaskId);
            ctx.setCurrentView('app-security-scan-detail');
          }}
          onOpenMonitor={() => ctx.setCurrentView('app-security-scan-monitor')}
        />
      );
    case 'app-security-scan-detail':
      if (!ctx.activeAppScanTaskId) {
        return (
          <AppScanOverviewPage
            projectId={ctx.selectedProjectId}
            onOpenTask={(toolTaskId) => {
              ctx.setActiveAppScanTaskId(toolTaskId);
              ctx.setCurrentView('app-security-scan-detail');
            }}
            onOpenMonitor={() => ctx.setCurrentView('app-security-scan-monitor')}
          />
        );
      }
      return (
        <AppScanTaskDetailPage
          projectId={ctx.selectedProjectId}
          toolTaskId={ctx.activeAppScanTaskId}
          onBack={() => ctx.setCurrentView(consumeTaskCenterReturnContext() ? 'task-list' : 'app-security-scan')}
        />
      );
    case 'app-security-scan-monitor':
      return <AppScanMonitorPage onBack={() => ctx.setCurrentView('app-security-scan')} />;
    case 'redline-verification':
      return (
        <RedlineOverviewPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(taskId) => {
            ctx.setActiveRedlineTaskId(taskId);
            ctx.setCurrentView('redline-verification-detail');
          }}
        />
      );
    case 'redline-verification-detail':
      if (!ctx.activeRedlineTaskId) {
        return (
          <RedlineOverviewPage
            projectId={ctx.selectedProjectId}
            onOpenTask={(taskId) => {
              ctx.setActiveRedlineTaskId(taskId);
              ctx.setCurrentView('redline-verification-detail');
            }}
          />
        );
      }
      return (
        <RedlineTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeRedlineTaskId}
          onBack={() => ctx.setCurrentView('redline-verification')}
        />
      );
    case 'ai4red-detail':
      if (!ctx.activeRedlineTaskId) {
        return (
          <RedlineOverviewPage
            projectId={ctx.selectedProjectId}
            onOpenTask={(taskId) => {
              ctx.setActiveRedlineTaskId(taskId);
              ctx.setCurrentView('redline-verification-detail');
            }}
          />
        );
      }
      return (
        <RedlineTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeRedlineTaskId}
          onBack={() => ctx.setCurrentView('task-list')}
        />
      );
    case 'binary-security-config':
      return <BinarySecurityConfigPage projectId={ctx.selectedProjectId} />;
    case 'binary-security-metrics':
      return <BinarySecurityMetricsDashboardPage projectId={ctx.selectedProjectId} />;
    case 'mobile-security-ipc-vuln':
      return <MobileSecurityIpcVulnPage projectId={ctx.selectedProjectId} />;
    case 'kernel-scan':
      return <KernelScanPage projectId={ctx.selectedProjectId} />;
    // [DISABLED] 数据流漏洞挖掘 - 方便后续复用
    /*
    case 'pentest-exec-dataflow-vuln':
    case 'pentest-exec-dataflow-vuln-task-list':
      return <DataflowVulnTaskListPage projectId={ctx.selectedProjectId} />;
    case 'binary-evolution-dataflow-vuln':
      return <BinaryEvolutionCenterPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-dataflow-vuln-task-detail':
      return <DataflowVulnTaskDetailPage projectId={ctx.selectedProjectId} onBack={() => ctx.setCurrentView('pentest-exec-dataflow-vuln')} />;
    case 'pentest-exec-dataflow-vuln-system-config':
      return <BinarySecurityConfigPage projectId={ctx.selectedProjectId} initialTab="dataflow-vuln" />;
    */
    case 'binary-evolution-center':
      return <BinaryEvolutionCenterPage projectId={ctx.selectedProjectId} />;
    case 'binary-evolution-firmware-unpacker':
      return <FirmwareEvolutionCenterPage projectId={ctx.selectedProjectId} />;
    case 'pentest-report':
      return <ReportsPage />;
    case 'security-assessment':
      return <SecurityAssessmentPage />;
    case 'vuln-engine':
    case 'vuln-overview':
      return <VulnOverviewPage projectId={ctx.selectedProjectId} />;
    case 'vuln-intake':
      return <VulnIntakePage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-analysis':
      return <VulnAnalysisPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-analysis-detail':
      return <VulnAnalysisDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-analysis-verify-create':
      return <VulnAutoVerifyCreatePage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-verification':
      return <VulnVerificationPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-verification-detail':
      return <VulnVerificationDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-decision':
      return <VulnDecisionPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-decision-detail':
      return <VulnDecisionDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    // [DISABLED] 评审研判 - 方便后续复用
    // case 'vuln-review-judgment':
    //   return <ReviewJudgmentPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    // case 'vuln-review-judgment-detail':
    //   return <ReviewJudgmentDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-queue':
      return <VulnQueuePage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-services':
      return <VulnServicesPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-repro-config':
      return <VulnReproConfigPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-parameter-config':
      return <VulnParameterConfigPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'sys-settings':
      return <WorkflowPlaceholder title="系统设置" icon={<Settings />} />;
    case 'change-password':
      return <ChangePasswordPage user={ctx.user} />;
    case 'user-mgmt-users':
      return <UserMgmtPage />;
    case 'user-mgmt-access':
      return <UserPermissionPage />;
    case 'user-mgmt-roles':
      return <RoleMgmtPage />;
    case 'user-mgmt-perms':
      return <PermMgmtPage />;
    case 'user-mgmt-online':
      return <OnlineSessionPage />;
    case 'user-mgmt-machine':
      return <MachineTokenPage />;
    case 'org-mgmt-departments':
      return <DepartmentPage />;
    case 'org-mgmt-members':
      return <DepartmentMemberPage />;
    case 'org-mgmt-projects':
      return <ProjectPage />;
    default:
      return (
        <div className="p-20 text-center">
          <h3 className="text-xl font-black text-slate-400">模块 "{ctx.currentView}" 开发中...</h3>
        </div>
      );
  }
};
