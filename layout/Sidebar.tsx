import React from 'react';
import {
  Activity,
  Archive,
  Bot,
  Box,
  Briefcase,
  Building2,
  ClipboardCheck,
  Code2,
  Cpu,
  FileBox,
  FileSearch,
  FileText,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Layers,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessageSquare,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  ServerCog,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  UserCog,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { UserInfo, ViewType } from '../types/types';
import { canAccessView, getUserAccess } from '../utils/rbac';

interface SidebarProps {
  user: UserInfo | null;
  currentView: ViewType | string;
  activeTopLevelNav: string;
  hasSelectedProject: boolean;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;
  setCurrentView: (v: ViewType | string) => void;
  resourceHealth?: boolean | null;
  staticPackageHealth?: boolean | null;
  projectHealth?: boolean | null;
  envHealth?: boolean | null;
  codeAuditHealth?: boolean | null;
  workflowHealth?: boolean | null;
  vulnHealth?: boolean | null;
  configCenterHealth?: boolean | null;
  aiAgentFrameworkHealth?: boolean | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  aliases?: string[];
  disabled?: boolean;
  disabledTitle?: string;
  healthStatus?: boolean | null;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  activeTopLevelNav,
  hasSelectedProject,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  setCurrentView,
  resourceHealth = null,
  staticPackageHealth = null,
  projectHealth = null,
  envHealth = null,
  codeAuditHealth = null,
  workflowHealth = null,
  vulnHealth = null,
  configCenterHealth = null,
  aiAgentFrameworkHealth = null,
}) => {
  const access = getUserAccess(user);
  const projectGuard = !hasSelectedProject;
  const projectGuardTitle = '请先选择项目';

  const sectionsByModule: Record<string, NavSection[]> = {
    dashboard: [
      {
        title: '总览',
        items: [
          { id: 'dashboard', label: '控制台总览', icon: <LayoutDashboard size={16} /> },
        ],
      },
    ],
    projects: [
      {
        title: '项目空间',
        items: [
          { id: 'project-mgmt', label: '项目管理', icon: <Briefcase size={16} />, aliases: ['project-detail'], healthStatus: projectHealth },
          { id: 'project-file-explorer', label: '项目文件资源', icon: <FolderTree size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: '资源中心',
        items: [
          { id: 'public-resource-management', label: '公共资源总览', icon: <FileBox size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: resourceHealth },
          { id: 'public-resource-pvc-management', label: 'PVC 管理', icon: <HardDrive size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'public-resource-task-management', label: '资源任务管理', icon: <ListTodo size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'static-packages', label: '静态软件包', icon: <Package size={16} />, aliases: ['static-package-detail'], healthStatus: staticPackageHealth },
          { id: 'deploy-script-mgmt', label: '部署脚本管理', icon: <Terminal size={16} /> },
        ],
      },
    ],
    environment: [
      {
        title: '环境基础',
        items: [
          { id: 'env-template', label: '模板管理', icon: <Box size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: envHealth },
          { id: 'env-agent', label: 'Agent 管理', icon: <Monitor size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: envHealth },
          { id: 'env-service', label: '服务管理', icon: <Zap size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: envHealth },
          { id: 'env-tasks', label: '模板部署任务', icon: <Workflow size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: 'AI Agent',
        items: [
          { id: 'env-ai-agent-manage', label: 'AI Agent 管理', icon: <Bot size={16} />, aliases: ['env-ai-agent', 'env-ai-agent-overview'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'env-ai-session', label: '单会话', icon: <MessageSquare size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'env-ai-batch-session', label: '批量会话', icon: <GitBranch size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: '进程监控',
        items: [
          { id: 'env-process-monitor-overview', label: '节点总览', icon: <Activity size={16} />, aliases: ['env-process-monitor-root'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'env-process-monitor-detail', label: '进程详情', icon: <FolderOpen size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'env-process-monitor-tasks', label: '监控任务管理', icon: <Workflow size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
    ],
    workflow: [
      {
        title: '安全工作流',
        items: [
          { id: 'workflow-apps', label: '应用模板', icon: <Layers size={16} />, aliases: ['workflow-app-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: workflowHealth },
          { id: 'workflow-app-instances', label: '应用实例', icon: <Box size={16} />, aliases: ['workflow-app-instance-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'workflow-jobs', label: '任务模板', icon: <Zap size={16} />, aliases: ['workflow-job-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'workflow-instances', label: '工作流实例', icon: <Workflow size={16} />, aliases: ['workflow-instance-detail', 'workflow-instance-logs'], disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: 'AI 工作流',
        items: [
          { id: 'aiwf-definitions', label: '工作流定义', icon: <Bot size={16} />, aliases: ['ai-agent-framework-root', 'aiwf-definition-list', 'aiwf-definition-create', 'aiwf-definition-versions'], disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: aiAgentFrameworkHealth },
          { id: 'aiwf-trigger-create', label: '触发任务', icon: <Play size={16} />, aliases: ['aiwf-triggers'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-trigger-list', label: '任务列表', icon: <ListTodo size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-execution-list', label: '执行列表', icon: <Activity size={16} />, aliases: ['aiwf-executions'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-execution-events', label: '执行事件', icon: <FileText size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-execution-artifacts', label: '执行工件', icon: <Archive size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-worker-list', label: 'Worker 状态', icon: <ServerCog size={16} />, aliases: ['aiwf-scheduler'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'aiwf-worker-control', label: '运行控制', icon: <Settings size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
    ],
    security: [
      {
        title: '测试总览',
        items: [
          { id: 'engine-validation', label: '安全验证', icon: <ShieldCheck size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'security-assessment', label: '安全评估', icon: <ClipboardCheck size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-risk', label: '风险评估', icon: <ShieldAlert size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'system-analysis-overview', label: '系统分析概览', icon: <Activity size={16} />, aliases: ['system-analysis-root'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'system-analysis-task', label: '系统分析任务', icon: <Play size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'system-analysis-history', label: '任务记录', icon: <FileText size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'system-analysis-prompt', label: 'Prompt 管理', icon: <Settings size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-report', label: '测试报告', icon: <FileText size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: '测试执行',
        items: [
          { id: 'pentest-exec-code', label: '在线代码审计', icon: <Code2 size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: codeAuditHealth },
          { id: 'pentest-exec-work', label: '知微工作台', icon: <Target size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-exec-secmate', label: 'SecMate-NG', icon: <Sparkles size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-exec-b2s-task-list', label: '逆向任务列表', icon: <ListTodo size={16} />, aliases: ['pentest-exec-b2s-root', 'pentest-exec-b2s-create'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-exec-b2s-queue', label: '逆向执行队列', icon: <Workflow size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'pentest-exec-b2s-result', label: '逆向结果查询', icon: <FileSearch size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
      {
        title: '漏洞引擎',
        items: [
          { id: 'vuln-overview', label: '生命周期总览', icon: <Cpu size={16} />, aliases: ['vuln-engine'], disabled: projectGuard, disabledTitle: projectGuardTitle, healthStatus: vulnHealth },
          { id: 'vuln-intake', label: '疑点上报', icon: <FolderOpen size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-analysis', label: '研判阶段', icon: <GitBranch size={16} />, aliases: ['vuln-analysis-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-verification', label: '验证阶段', icon: <ShieldCheck size={16} />, aliases: ['vuln-verification-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-decision', label: '结束管理', icon: <ShieldAlert size={16} />, aliases: ['vuln-decision-detail'], disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-queue', label: '运行队列', icon: <Workflow size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-services', label: '能力注册', icon: <ServerCog size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
          { id: 'vuln-repro-config', label: '复现模块配置', icon: <Settings size={16} />, disabled: projectGuard, disabledTitle: projectGuardTitle },
        ],
      },
    ],
    system: [
      {
        title: '平台配置',
        items: [
          { id: 'admin-dashboard', label: '管理员控制台', icon: <ShieldAlert size={16} />, healthStatus: true },
          { id: 'config-center-llm', label: '配置中心', icon: <Key size={16} />, aliases: ['config-center-root', 'config-center-llm-chat'], healthStatus: configCenterHealth },
          { id: 'sys-settings', label: '系统设置', icon: <Settings size={16} /> },
          { id: 'change-password', label: '修改密码', icon: <Lock size={16} /> },
        ],
      },
      {
        title: '账号与权限',
        items: [
          { id: 'user-mgmt-access', label: '用户权限管理', icon: <Shield size={16} /> },
          { id: 'user-mgmt-users', label: '用户账号管理', icon: <Users size={16} /> },
          { id: 'user-mgmt-online', label: '在线会话监控', icon: <Globe size={16} /> },
          { id: 'user-mgmt-machine', label: '机机凭证管理', icon: <Cpu size={16} /> },
        ],
      },
      {
        title: '组织架构',
        items: [
          { id: 'org-mgmt-departments', label: '部门结构管理', icon: <Building2 size={16} /> },
          { id: 'org-mgmt-members', label: '部门成员管理', icon: <UserCog size={16} /> },
          { id: 'org-mgmt-projects', label: '项目权限管理', icon: <Briefcase size={16} /> },
        ],
      },
    ],
  };

  const sections = (sectionsByModule[activeTopLevelNav] || []).map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessView(user, item.id)),
  })).filter((section) => section.items.length > 0);

  const isItemActive = (item: NavItem) => [item.id, ...(item.aliases || [])].includes(String(currentView));

  return (
    <aside className={`${isSidebarCollapsed ? 'w-24' : 'w-60'} bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 z-30 shadow-2xl shrink-0`}>
      <nav className="flex-1 px-4 py-5 overflow-y-auto custom-scrollbar">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              {!isSidebarCollapsed && (
                <div className="px-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const disabled = !!item.disabled;
                  const healthColor = item.healthStatus === true ? 'text-green-400' : item.healthStatus === false ? 'text-rose-400' : '';
                  const isActive = isItemActive(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => !disabled && setCurrentView(item.id)}
                      title={disabled ? (item.disabledTitle || '当前不可用') : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all ${
                        disabled
                          ? 'bg-slate-900/50 text-slate-600 cursor-not-allowed opacity-60'
                          : isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className={`shrink-0 ${!isActive ? healthColor : ''}`}>{item.icon}</span>
                      {!isSidebarCollapsed && (
                        <span className={`text-sm font-bold truncate ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-5 border-t border-slate-800">
        {!isSidebarCollapsed ? (
          <div className="flex justify-end">
            <button onClick={() => setIsSidebarCollapsed(true)} className="p-3 rounded-2xl bg-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
              <PanelLeftClose size={18} />
            </button>
          </div>
        ) : (
          <button onClick={() => setIsSidebarCollapsed(false)} className="w-full flex justify-center p-3 text-slate-500 hover:text-white transition-colors">
            <PanelLeftOpen size={22} />
          </button>
        )}
      </div>
    </aside>
  );
};
