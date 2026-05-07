import React from 'react';
import { FileSearch, Lock, Settings, Zap } from 'lucide-react';
import { api } from '../clients/api';
import { WorkflowPlaceholder } from '../components/WorkflowPlaceholder';
import { DashboardPage } from '../pages/DashboardPage';
import { ProjectMgmtPage } from '../pages/project/ProjectMgmtPage';
import { ProjectDetailPage } from '../pages/project/ProjectDetailPage';
import { StaticPackagesPage } from '../pages/assets/StaticPackagesPage';
import { StaticPackageDetailPage } from '../pages/assets/StaticPackageDetailPage';
import { DeployScriptPage } from '../pages/assets/DeployScriptPage';
import { SecurityAssessmentPage } from '../pages/SecurityAssessmentPage';
import { ConfigCenterLlmPage } from '../pages/platform/ConfigCenterLlmPage';
import { ConfigCenterLlmChatPage } from '../pages/platform/ConfigCenterLlmChatPage';
import { PublicResourceManagementPage } from '../pages/assets/PublicResourceManagementPage';
import { ProjectFileExplorerPage } from '../pages/assets/ProjectFileExplorerPage';
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
import { DataflowAnalysisTaskPage } from '../pages/execution/DataflowAnalysisTaskPage';
import { DataflowAnalysisConfigPage } from '../pages/execution/DataflowAnalysisConfigPage';
import { DataflowAnalysisModelsPage } from '../pages/execution/DataflowAnalysisModelsPage';
import { EntryAnalysisTaskPage } from '../pages/execution/EntryAnalysisTaskPage';
import { EntryAnalysisConfigPage } from '../pages/execution/EntryAnalysisConfigPage';
import { EntryAnalysisModelsPage } from '../pages/execution/EntryAnalysisModelsPage';
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
import { FirmwareUnpackConfigPage } from '../pages/execution/FirmwareUnpackConfigPage';
import { FirmwareUnpackerPage } from '../pages/execution/FirmwareUnpackerPage';
import { ReportsPage } from '../pages/execution/ReportsPage';
import { DataflowVulnConfigPage, DataflowVulnTaskDetailPage, DataflowVulnTaskListPage } from '../pages/execution/DataflowVulnScannerPage';
import { BinarySecurityOverviewPage } from '../pages/execution/BinarySecurityOverviewPage';
import { BinarySecurityConfigPage } from '../pages/execution/BinarySecurityConfigPage';
import { BinarySecurityTaskDetailPage } from '../pages/execution/BinarySecurityTaskDetailPage';
import { VulnOverviewPage } from '../pages/vuln/VulnOverviewPage';
import { VulnIntakePage } from '../pages/vuln/VulnIntakePage';
import { VulnAnalysisPage } from '../pages/vuln/VulnAnalysisPage';
import { VulnAnalysisDetailPage } from '../pages/vuln/VulnAnalysisDetailPage';
import { VulnVerificationPage } from '../pages/vuln/VulnVerificationPage';
import { VulnVerificationDetailPage } from '../pages/vuln/VulnVerificationDetailPage';
import { VulnDecisionPage } from '../pages/vuln/VulnDecisionPage';
import { VulnDecisionDetailPage } from '../pages/vuln/VulnDecisionDetailPage';
import { VulnQueuePage } from '../pages/vuln/VulnQueuePage';
import { VulnServicesPage } from '../pages/vuln/VulnServicesPage';
import { VulnReproConfigPage } from '../pages/vuln/VulnReproConfigPage';
import { B2SOverviewPage } from '../pages/execution/B2SOverviewPage';
import { B2STaskDetailPage } from '../pages/execution/B2STaskDetailPage';
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
  activeSystemAnalysisTaskId: string;
  activeBinarySecurityTaskId: string;
  activeSourceSecurityTaskId: string;
  selectedStaticPkgIds: Set<string>;
  setCurrentView: (view: string) => void;
  setActiveProjectId: (id: string) => void;
  setActivePackageId: (id: string) => void;
  setActiveInstanceId: (id: string) => void;
  setActiveAppTemplateId: (id: string) => void;
  setActiveJobTemplateId: (id: string) => void;
  setActiveAppWorkflowId: (id: string) => void;
  setActiveB2STaskId: (id: string) => void;
  setActiveSystemAnalysisTaskId: (id: string) => void;
  setActiveBinarySecurityTaskId: (id: string) => void;
  setActiveSourceSecurityTaskId: (id: string) => void;
  setSelectedStaticPkgIds: (ids: Set<string>) => void;
  fetchProjects: (refresh?: boolean) => Promise<void>;
  fetchAdminStats: () => Promise<void>;
  refreshStaticPackages: () => Promise<void>;
}

export const renderCurrentView = (ctx: ViewRegistryContext): React.ReactNode => {
  switch (ctx.currentView) {
    case 'dashboard':
      return (
        <DashboardPage
          projects={ctx.projects}
          agents={ctx.agents}
          staticPackages={ctx.staticPackages}
          templates={ctx.templates}
          servicesCount={ctx.dashboardServicesCount}
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
    case 'project-mgmt':
      return (
        <ProjectMgmtPage
          projects={ctx.projects}
          setActiveProjectId={ctx.setActiveProjectId}
          setCurrentView={ctx.setCurrentView}
          refreshProjects={ctx.fetchProjects}
        />
      );
    case 'project-detail':
      return <ProjectDetailPage projectId={ctx.activeProjectId} projects={ctx.projects} onBack={() => ctx.setCurrentView('project-mgmt')} />;
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
    case 'public-resource-pvc-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="pvc" />;
    case 'public-resource-task-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="tasks" />;
    case 'test-input-release':
    case 'test-input-code':
    case 'test-input-doc':
    case 'test-input-other':
    case 'pvc-management':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="pvc" />;
    case 'test-input-tasks':
      return <PublicResourceManagementPage projectId={ctx.selectedProjectId} initialTab="tasks" />;
    case 'project-file-explorer':
      return <ProjectFileExplorerPage projectId={ctx.selectedProjectId} projects={ctx.projects} />;
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
    case 'system-analysis-task':
      return (
        <SystemAnalysisTaskPage
          projectId={ctx.selectedProjectId}
          onOpenTask={(taskId) => {
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
    case 'dataflow-analysis-task':
      return <DataflowAnalysisTaskPage projectId={ctx.selectedProjectId} />;
    case 'dataflow-analysis-config':
      return <DataflowAnalysisConfigPage projectId={ctx.selectedProjectId} />;
    case 'dataflow-analysis-models':
      return <DataflowAnalysisModelsPage />;
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
    case 'pentest-system':
      return <WorkflowPlaceholder title="系统分析" icon={<FileSearch />} />;
    case 'pentest-threat':
    case 'entry-analysis-root':
    case 'entry-analysis-task':
      return <EntryAnalysisTaskPage projectId={ctx.selectedProjectId} />;
    case 'entry-analysis-config':
      return <EntryAnalysisConfigPage projectId={ctx.selectedProjectId} />;
    case 'entry-analysis-models':
      return <EntryAnalysisModelsPage />;
    case 'pentest-exec-code':
      return <ExecutionCodeAuditPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-work':
      return <ExecutionWorkPlatformPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-firmware-unpacker':
    case 'pentest-exec-firmware-task-list':
      return <FirmwareUnpackerPage projectId={ctx.selectedProjectId} projects={ctx.projects} />;
    case 'pentest-exec-firmware-config':
      return <FirmwareUnpackConfigPage projectId={ctx.selectedProjectId} />;
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
      return (
        <BinarySecurityTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeBinarySecurityTaskId}
          taskType="binary"
          onBack={() => ctx.setCurrentView('binary-security')}
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
      return (
        <BinarySecurityTaskDetailPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeSourceSecurityTaskId}
          taskType="source"
          onBack={() => ctx.setCurrentView('source-security')}
        />
      );
    case 'binary-security-config':
      return <BinarySecurityConfigPage />;
    case 'pentest-exec-dataflow-vuln':
    case 'pentest-exec-dataflow-vuln-task-list':
      return <DataflowVulnTaskListPage projectId={ctx.selectedProjectId} />;
    case 'pentest-exec-dataflow-vuln-task-detail':
      return <DataflowVulnTaskDetailPage projectId={ctx.selectedProjectId} onBack={() => ctx.setCurrentView('pentest-exec-dataflow-vuln-task-list')} />;
    case 'pentest-exec-dataflow-vuln-system-config':
      return <DataflowVulnConfigPage projectId={ctx.selectedProjectId} />;
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
    case 'vuln-verification':
      return <VulnVerificationPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-verification-detail':
      return <VulnVerificationDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-decision':
      return <VulnDecisionPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-decision-detail':
      return <VulnDecisionDetailPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-queue':
      return <VulnQueuePage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-services':
      return <VulnServicesPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
    case 'vuln-repro-config':
      return <VulnReproConfigPage projectId={ctx.selectedProjectId} onNavigateToView={ctx.setCurrentView} />;
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
