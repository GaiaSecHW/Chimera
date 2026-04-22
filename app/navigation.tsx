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
  LucideIcon,
  MessageSquare,
  Monitor,
  Package,
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
import { UserInfo } from '../types/types';
import { getUserAccess, getUserCenterDefaultView } from '../utils/rbac';

export type TopLevelNavKey =
  | 'dashboard'
  | 'project'
  | 'assets'
  | 'environment'
  | 'orchestration'
  | 'execution'
  | 'vuln'
  | 'platform';

export interface TopLevelNavItem {
  id: TopLevelNavKey;
  label: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  aliases?: string[];
  requiresProject?: boolean;
  healthKey?: HealthStatusKey;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface SidebarHealthStatus {
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

export type HealthStatusKey = keyof SidebarHealthStatus;

export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'dashboard', label: '控制台' },
  { id: 'project', label: '项目' },
  { id: 'assets', label: '资产' },
  { id: 'environment', label: '环境' },
  { id: 'orchestration', label: '编排' },
  { id: 'execution', label: '执行' },
  { id: 'vuln', label: '漏洞' },
  { id: 'platform', label: '平台' },
];

export const PROJECT_REQUIRED_VIEWS = new Set<string>([
  'project-file-explorer',
  'public-resource-management',
  'public-resource-pvc-management',
  'public-resource-task-management',
  'pvc-management',
  'env-agent',
  'env-service',
  'env-ai-agent',
  'env-ai-helper',
  'env-ai-agent-manage',
  'env-ai-agent-session-manage',
  'env-ai-session',
  'env-ai-batch-session',
  'env-template',
  'env-tasks',
  'env-process-monitor-overview',
  'env-process-monitor-detail',
  'env-process-monitor-tasks',
  'workflow-apps',
  'workflow-app-detail',
  'workflow-app-instances',
  'workflow-app-instance-detail',
  'workflow-jobs',
  'workflow-job-detail',
  'workflow-instances',
  'workflow-instance-detail',
  'workflow-instance-logs',
  'ai-agent-framework-root',
  'aiwf-definitions',
  'aiwf-triggers',
  'aiwf-trigger-create',
  'aiwf-trigger-list',
  'aiwf-executions',
  'aiwf-execution-list',
  'aiwf-execution-events',
  'aiwf-execution-artifacts',
  'aiwf-scheduler',
  'aiwf-worker-list',
  'aiwf-worker-control',
  'system-analysis-overview',
  'system-analysis-task',
  'system-analysis-history',
  'system-analysis-prompt',
  'engine-validation',
  'security-assessment',
  'pentest-risk',
  'pentest-system',
  'pentest-threat',
  'pentest-orch',
  'pentest-exec-code',
  'pentest-exec-work',
  'pentest-exec-secmate',
  'pentest-exec-b2s-root',
  'pentest-exec-b2s-task-list',
  'pentest-exec-b2s-create',
  'pentest-exec-b2s-queue',
  'pentest-exec-b2s-result',
  'pentest-report',
  'vuln-engine',
  'vuln-overview',
  'vuln-intake',
  'vuln-analysis',
  'vuln-analysis-detail',
  'vuln-verification',
  'vuln-verification-detail',
  'vuln-decision',
  'vuln-decision-detail',
  'vuln-queue',
  'vuln-services',
  'vuln-repro-config',
]);

export const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'dashboard') return 'dashboard';

  if (view === 'project-mgmt' || view === 'project-detail' || view === 'project-file-explorer') {
    return 'project';
  }

  if (
    view === 'static-packages' ||
    view === 'static-package-detail' ||
    view === 'deploy-script-mgmt' ||
    view === 'public-resource-management' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management' ||
    view.startsWith('test-input-')
  ) {
    return 'assets';
  }

  if (view.startsWith('env-')) {
    return 'environment';
  }

  if (view.startsWith('workflow-') || view.startsWith('aiwf-') || view === 'ai-agent-framework-root') {
    return 'orchestration';
  }

  if (
    view === 'engine-validation' ||
    view === 'security-assessment' ||
    view.startsWith('pentest-') ||
    view.startsWith('system-analysis-')
  ) {
    return 'execution';
  }

  if (view === 'vuln-engine' || view.startsWith('vuln-')) {
    return 'vuln';
  }

  return 'platform';
};

export const getTopLevelDefaultView = (nav: TopLevelNavKey, user: UserInfo | null): string => {
  const access = getUserAccess(user);

  switch (nav) {
    case 'dashboard':
      return 'dashboard';
    case 'project':
      return 'project-mgmt';
    case 'assets':
      return 'public-resource-management';
    case 'environment':
      return 'env-agent';
    case 'orchestration':
      return 'workflow-apps';
    case 'execution':
      return 'system-analysis-overview';
    case 'vuln':
      return 'vuln-overview';
    case 'platform':
      if (access.canAccessAdminDashboard) return 'admin-dashboard';
      if (access.canAccessConfigCenter) return 'config-center-llm';
      if (access.canAccessUserCenter) return String(getUserCenterDefaultView(user));
      return 'sys-settings';
    default:
      return 'dashboard';
  }
};

export const SIDEBAR_SECTIONS: Record<TopLevelNavKey, NavSection[]> = {
  dashboard: [
    {
      title: '总览',
      items: [{ id: 'dashboard', label: '控制台总览', icon: LayoutDashboard }],
    },
  ],
  project: [
    {
      title: '项目空间',
      items: [
        { id: 'project-mgmt', label: '项目管理', icon: Briefcase, aliases: ['project-detail'], healthKey: 'projectHealth' },
        { id: 'project-file-explorer', label: '项目文件', icon: FolderTree, requiresProject: true },
      ],
    },
  ],
  assets: [
    {
      title: '资产供应',
      items: [
        { id: 'public-resource-management', label: '公共资源总览', icon: FileBox, requiresProject: true, healthKey: 'resourceHealth' },
        { id: 'public-resource-pvc-management', label: 'PVC 管理', icon: HardDrive, requiresProject: true },
        { id: 'public-resource-task-management', label: '资源任务', icon: ListTodo, requiresProject: true },
        { id: 'static-packages', label: '静态软件包', icon: Package, aliases: ['static-package-detail'], healthKey: 'staticPackageHealth' },
        { id: 'deploy-script-mgmt', label: '部署脚本', icon: Terminal },
      ],
    },
  ],
  environment: [
    {
      title: '执行环境',
      items: [
        { id: 'env-template', label: '环境模板', icon: Box, requiresProject: true, healthKey: 'envHealth' },
        { id: 'env-agent', label: 'Agent 管理', icon: Monitor, requiresProject: true, healthKey: 'envHealth' },
        { id: 'env-service', label: '服务管理', icon: Zap, requiresProject: true, healthKey: 'envHealth' },
        { id: 'env-tasks', label: '部署任务', icon: Workflow, requiresProject: true },
      ],
    },
    {
      title: 'AI Agent',
      items: [
        { id: 'env-ai-agent-manage', label: 'Agent 管理', icon: Bot, aliases: ['env-ai-agent', 'env-ai-agent-overview'], requiresProject: true },
        { id: 'env-ai-session', label: '单会话', icon: MessageSquare, requiresProject: true },
        { id: 'env-ai-batch-session', label: '批量会话', icon: GitBranch, requiresProject: true },
      ],
    },
    {
      title: '进程监控',
      items: [
        { id: 'env-process-monitor-overview', label: '节点总览', icon: Activity, aliases: ['env-process-monitor-root'], requiresProject: true },
        { id: 'env-process-monitor-detail', label: '进程详情', icon: FolderOpen, requiresProject: true },
        { id: 'env-process-monitor-tasks', label: '监控任务', icon: Workflow, requiresProject: true },
      ],
    },
  ],
  orchestration: [
    {
      title: '工作流模板',
      items: [
        { id: 'workflow-apps', label: '应用模板', icon: Layers, aliases: ['workflow-app-detail'], requiresProject: true, healthKey: 'workflowHealth' },
        { id: 'workflow-jobs', label: '任务模板', icon: Zap, aliases: ['workflow-job-detail'], requiresProject: true },
      ],
    },
    {
      title: '工作流运行',
      items: [
        { id: 'workflow-app-instances', label: '应用实例', icon: Box, aliases: ['workflow-app-instance-detail'], requiresProject: true },
        { id: 'workflow-instances', label: '工作流实例', icon: Workflow, aliases: ['workflow-instance-detail', 'workflow-instance-logs'], requiresProject: true },
      ],
    },
    {
      title: 'AI 工作流',
      items: [
        { id: 'aiwf-definitions', label: '工作流定义', icon: Bot, aliases: ['ai-agent-framework-root', 'aiwf-definition-list', 'aiwf-definition-create', 'aiwf-definition-versions'], requiresProject: true, healthKey: 'aiAgentFrameworkHealth' },
        { id: 'aiwf-trigger-create', label: '触发任务', icon: Play, aliases: ['aiwf-triggers'], requiresProject: true },
        { id: 'aiwf-trigger-list', label: '任务列表', icon: ListTodo, requiresProject: true },
        { id: 'aiwf-execution-list', label: '执行列表', icon: Activity, aliases: ['aiwf-executions'], requiresProject: true },
        { id: 'aiwf-execution-events', label: '执行事件', icon: FileText, requiresProject: true },
        { id: 'aiwf-execution-artifacts', label: '执行工件', icon: Archive, requiresProject: true },
        { id: 'aiwf-worker-list', label: 'Worker 状态', icon: ServerCog, aliases: ['aiwf-scheduler'], requiresProject: true },
        { id: 'aiwf-worker-control', label: '运行控制', icon: Settings, requiresProject: true },
      ],
    },
  ],
  execution: [
    {
      title: '系统分析',
      items: [
        { id: 'system-analysis-overview', label: '概览', icon: Activity, aliases: ['system-analysis-root'], requiresProject: true },
        { id: 'system-analysis-task', label: '任务', icon: Play, requiresProject: true },
        { id: 'system-analysis-history', label: '历史', icon: FileText, requiresProject: true },
        { id: 'system-analysis-prompt', label: 'Prompt', icon: Settings, requiresProject: true },
      ],
    },
    {
      title: '安全执行',
      items: [
        { id: 'pentest-exec-code', label: '在线代码审计', icon: Code2, requiresProject: true, healthKey: 'codeAuditHealth' },
        { id: 'pentest-exec-work', label: '知微工作台', icon: Target, requiresProject: true },
        { id: 'pentest-exec-secmate', label: 'SecMate-NG', icon: Sparkles, requiresProject: true },
        { id: 'pentest-exec-b2s-task-list', label: 'B2S 任务列表', icon: ListTodo, aliases: ['pentest-exec-b2s-root', 'pentest-exec-b2s-create'], requiresProject: true },
        { id: 'pentest-exec-b2s-queue', label: 'B2S 执行队列', icon: Workflow, requiresProject: true },
        { id: 'pentest-exec-b2s-result', label: 'B2S 结果查询', icon: FileSearch, requiresProject: true },
        { id: 'security-assessment', label: '安全评估', icon: ClipboardCheck, requiresProject: true },
        { id: 'pentest-report', label: '测试报告', icon: FileText, requiresProject: true },
      ],
    },
    {
      title: '保留入口',
      items: [
        { id: 'engine-validation', label: '安全验证', icon: ShieldCheck, requiresProject: true },
        { id: 'pentest-risk', label: '风险评估', icon: ShieldAlert, requiresProject: true },
        { id: 'pentest-system', label: '系统分析', icon: Activity, requiresProject: true },
        { id: 'pentest-threat', label: '威胁分析', icon: Zap, requiresProject: true },
        { id: 'pentest-orch', label: '测试编排', icon: Workflow, requiresProject: true },
      ],
    },
  ],
  vuln: [
    {
      title: '漏洞闭环',
      items: [
        { id: 'vuln-overview', label: '生命周期总览', icon: Cpu, aliases: ['vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
        { id: 'vuln-intake', label: '疑点上报', icon: FolderOpen, requiresProject: true },
        { id: 'vuln-analysis', label: '研判阶段', icon: GitBranch, aliases: ['vuln-analysis-detail'], requiresProject: true },
        { id: 'vuln-verification', label: '验证阶段', icon: ShieldCheck, aliases: ['vuln-verification-detail'], requiresProject: true },
        { id: 'vuln-decision', label: '结束管理', icon: ShieldAlert, aliases: ['vuln-decision-detail'], requiresProject: true },
        { id: 'vuln-queue', label: '运行队列', icon: Workflow, requiresProject: true },
        { id: 'vuln-services', label: '能力注册', icon: ServerCog, requiresProject: true },
        { id: 'vuln-repro-config', label: '复现配置', icon: Settings, requiresProject: true },
      ],
    },
  ],
  platform: [
    {
      title: '平台配置',
      items: [
        { id: 'admin-dashboard', label: '管理员控制台', icon: ShieldAlert },
        { id: 'config-center-llm', label: '配置中心', icon: Key, aliases: ['config-center-root', 'config-center-llm-chat'], healthKey: 'configCenterHealth' },
        { id: 'sys-settings', label: '系统设置', icon: Settings },
        { id: 'change-password', label: '修改密码', icon: Lock },
      ],
    },
    {
      title: '账号与权限',
      items: [
        { id: 'user-mgmt-access', label: '用户权限管理', icon: Shield },
        { id: 'user-mgmt-users', label: '用户账号管理', icon: Users },
        { id: 'user-mgmt-online', label: '在线会话监控', icon: Globe },
        { id: 'user-mgmt-machine', label: '机机凭证管理', icon: Cpu },
      ],
    },
    {
      title: '组织架构',
      items: [
        { id: 'org-mgmt-departments', label: '部门结构管理', icon: Building2 },
        { id: 'org-mgmt-members', label: '部门成员管理', icon: UserCog },
        { id: 'org-mgmt-projects', label: '项目权限管理', icon: Briefcase },
      ],
    },
  ],
};
