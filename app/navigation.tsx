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

export interface SubNavItem {
  id: string;
  label: string;
  aliases?: string[];
  requiresProject?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  aliases?: string[];
  requiresProject?: boolean;
  healthKey?: HealthStatusKey;
  subItems?: SubNavItem[];
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
  'fileserver-archive-tasks',
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
  'system-analysis-task',
  'system-analysis-detail',
  'system-analysis-config',
  'pentest-dataflow',
  'dataflow-analysis-task',
  'dataflow-analysis-config',
  'entry-analysis-root',
  'entry-analysis-task',
  'entry-analysis-config',
  'binary-security',
  'binary-security-root',
  'binary-security-task-list',
  'binary-security-detail',
  'binary-security-metrics',
  'source-security',
  'source-security-detail',
  'mobile-security-ipc-vuln',
  'security-assessment',
  'pentest-system',
  'pentest-threat',
  'pentest-exec-code',
  'pentest-exec-work',
  'pentest-exec-firmware-unpacker',
  'pentest-exec-firmware-config',
  'pentest-exec-b2s',
  'pentest-exec-b2s-root',
  'pentest-exec-b2s-task-list',
  'pentest-exec-b2s-create',
  'pentest-exec-b2s-queue',
  'pentest-exec-b2s-result',
  'pentest-exec-b2s-detail',
  'pentest-exec-b2s-advanced',
  'pentest-exec-dataflow-vuln',
  'binary-evolution-center',
  'binary-evolution-dataflow-vuln',
  'pentest-exec-dataflow-vuln-task-list',
  'pentest-exec-dataflow-vuln-task-detail',
  'pentest-exec-dataflow-vuln-system-config',
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
  'vuln-parameter-config',
]);

export const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'dashboard') return 'dashboard';

  if (view === 'project-mgmt' || view === 'project-detail') {
    return 'project';
  }

  if (
    view === 'project-file-explorer' ||
    view === 'fileserver-archive-tasks' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management' ||
    view.startsWith('test-input-')
  ) {
    return 'assets';
  }

  if (
    view === 'static-packages' ||
    view === 'static-package-detail' ||
    view === 'deploy-script-mgmt'
  ) {
    return 'platform';
  }

  if (view.startsWith('env-')) {
    return 'environment';
  }

  if (view.startsWith('workflow-')) {
    return 'orchestration';
  }

  if (
    view === 'security-assessment' ||
    view.startsWith('binary-security') ||
    view.startsWith('binary-evolution') ||
    view.startsWith('source-security') ||
    view.startsWith('mobile-security-') ||
    view.startsWith('pentest-') ||
    view.startsWith('entry-analysis-') ||
    view.startsWith('system-analysis-') ||
    view.startsWith('dataflow-analysis-')
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
      return 'public-resource-pvc-management';
    case 'environment':
      return 'env-agent';
    case 'orchestration':
      return 'workflow-apps';
    case 'execution':
      return 'pentest-exec-code';
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
      ],
    },
  ],
  assets: [
    {
      title: '资产供应',
      items: [
        { id: 'project-file-explorer', label: '项目文件', icon: FolderTree, requiresProject: true },
        { id: 'fileserver-archive-tasks', label: '打包下载任务', icon: Archive, requiresProject: true },
        { id: 'public-resource-pvc-management', label: 'PVC 管理', icon: HardDrive, requiresProject: true },
        { id: 'public-resource-task-management', label: '资源任务', icon: ListTodo, requiresProject: true },
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
  ],
  execution: [
    {
      title: '二进制安全',
      items: [
        { id: 'binary-security', label: '二进制任务总览', icon: ShieldAlert, aliases: ['binary-security-root', 'binary-security-task-list', 'binary-security-detail'], requiresProject: true },
        { id: 'source-security', label: '源码任务总览', icon: FileSearch, aliases: ['source-security-detail'], requiresProject: true },
        { id: 'pentest-exec-firmware-unpacker', label: '固件解包', icon: Package, aliases: ['pentest-exec-firmware-task-list'], requiresProject: true },
        { id: 'pentest-system', label: '系统分析', icon: Activity, aliases: ['system-analysis-task', 'system-analysis-detail'], requiresProject: true },
        { id: 'pentest-exec-b2s', label: '二进制逆向', icon: FileSearch, aliases: ['pentest-exec-b2s-root', 'pentest-exec-b2s-task-list', 'pentest-exec-b2s-create', 'pentest-exec-b2s-queue', 'pentest-exec-b2s-result', 'pentest-exec-b2s-detail', 'pentest-exec-b2s-advanced'], requiresProject: true },
        { id: 'pentest-threat', label: '入口分析', icon: Zap, aliases: ['entry-analysis-root', 'entry-analysis-task', 'entry-analysis-detail'], requiresProject: true },
        { id: 'pentest-dataflow', label: '数据流分析', icon: Workflow, aliases: ['dataflow-analysis-task', 'dataflow-analysis-detail'], requiresProject: true },
        { id: 'pentest-exec-dataflow-vuln', label: '数据流漏洞挖掘', icon: Shield, aliases: ['pentest-exec-dataflow-vuln-task-list', 'pentest-exec-dataflow-vuln-task-detail'], requiresProject: true },
        {
          id: 'binary-evolution-center',
          label: '进化中心',
          icon: Sparkles,
          requiresProject: true,
          subItems: [
            {
              id: 'binary-evolution-dataflow-vuln',
              label: '进化数据流漏洞挖掘',
              aliases: ['binary-evolution-center'],
              requiresProject: true,
            },
          ],
        },
        { id: 'binary-security-config', label: '参数配置', icon: Settings, aliases: ['pentest-exec-dataflow-vuln-system-config'], requiresProject: true },
        { id: 'binary-security-metrics', label: '性能看板', icon: Monitor, requiresProject: true },
      ],
    },
    {
      title: 'WEB安全',
      items: [
        { id: 'pentest-exec-work', label: '知微工作台', icon: Target, requiresProject: true },
      ],
    },
    {
      title: '终端安全',
      items: [
        { id: 'mobile-security-ipc-vuln', label: 'IPC漏洞扫描', icon: Terminal, requiresProject: true },
      ],
    },
    {
      title: '安全执行',
      items: [
        { id: 'pentest-exec-code', label: '在线代码审计', icon: Code2, requiresProject: true, healthKey: 'codeAuditHealth' },
        { id: 'security-assessment', label: '安全评估', icon: ClipboardCheck, requiresProject: true },
        { id: 'pentest-report', label: '测试报告', icon: FileText, requiresProject: true },
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
        { id: 'vuln-parameter-config', label: '参数配置', icon: Settings, requiresProject: true },
      ],
    },
  ],
  platform: [
    {
      title: '平台配置',
      items: [
        { id: 'admin-dashboard', label: '管理员控制台', icon: ShieldAlert },
        { id: 'config-center-llm', label: '配置中心', icon: Key, aliases: ['config-center-root', 'config-center-llm-chat'], healthKey: 'configCenterHealth' },
        { id: 'static-packages', label: '静态软件包', icon: Package, aliases: ['static-package-detail'], healthKey: 'staticPackageHealth' },
        { id: 'deploy-script-mgmt', label: '部署脚本', icon: Terminal },
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
