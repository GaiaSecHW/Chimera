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
  Layers3,
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
import { getPlatformRole, getUserAccess, getUserCenterDefaultView } from '../utils/rbac';

export type NavRole = 'user' | 'developer' | 'admin' | null;

export type TopLevelNavKey =
  | 'dashboard'
  | 'project'
  | 'assets'
  | 'task'
  | 'environment'
  | 'vuln'
  | 'assessment'
  | 'observe'
  | 'skill'
  | 'tools'
  | 'atomic'
  | 'aigw'
  | 'schedule'
  | 'evolution'
  | 'tenant'
  | 'role'
  | 'user-mgmt';

export interface TopLevelNavItem {
  id: TopLevelNavKey;
  label: string;
  role: NavRole;
  showDividerBefore?: boolean;
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

export const NAV_ROLE_CONFIG: Record<string, { label: string; color: string; activeBg: string; bg: string; border: string }> = {
  user: { label: '使用者视图', color: '#d97706', activeBg: '#d97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.2)' },
  developer: { label: '开发者视图', color: '#3b82f6', activeBg: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.2)' },
  admin: { label: '管理员视图', color: '#ef4444', activeBg: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.2)' },
};

export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'dashboard', label: '仪表盘', role: null },
  { id: 'project', label: '项目', role: 'user' },
  { id: 'assets', label: '资产', role: 'user' },
  { id: 'task', label: '任务', role: 'user' },
  { id: 'environment', label: '环境', role: 'user' },
  { id: 'vuln', label: '漏洞', role: 'user' },
  { id: 'assessment', label: '评测', role: 'developer', showDividerBefore: true },
  { id: 'observe', label: '观测', role: 'developer' },
  { id: 'skill', label: '技能', role: 'developer' },
  { id: 'tools', label: '工具', role: 'developer' },
  { id: 'atomic', label: '原子能力', role: 'developer' },
  { id: 'aigw', label: 'AI网关', role: 'admin', showDividerBefore: true },
  { id: 'schedule', label: '任务调度', role: 'admin' },
  { id: 'evolution', label: '进化', role: 'admin' },
  { id: 'tenant', label: '租户', role: 'admin' },
  { id: 'role', label: '角色', role: 'admin' },
  { id: 'user-mgmt', label: '用户', role: 'admin' },
];

const ROLE_TAB_ACCESS: Record<string, Set<string>> = {
  ordinary_user: new Set(['user']),
  developer: new Set(['user', 'developer']),
  ordinary_admin: new Set(['user', 'developer', 'admin']),
  super_admin: new Set(['user', 'developer', 'admin']),
};

export const getVisibleTopLevelNavItems = (
  user: UserInfo | null | undefined,
  visibleRoles?: Set<NavRole>,
): TopLevelNavItem[] => {
  const platformRole = getPlatformRole(user);
  const accessibleRoles = ROLE_TAB_ACCESS[platformRole] || ROLE_TAB_ACCESS.ordinary_user;
  return TOP_LEVEL_NAV_ITEMS.filter((item) => {
    if (item.id === 'dashboard') return true;
    if (item.role && !accessibleRoles.has(item.role)) return false;
    if (visibleRoles && item.role && !visibleRoles.has(item.role)) return false;
    return true;
  });
};

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
  'dataflow-vuln-scan-task',
  'dataflow-vuln-scan-detail',
  'dataflow-vuln-scan-config',
  'pentest-vuln-verify',
  'vuln-verify-task',
  'entry-analysis-root',
  'entry-analysis-task',
  'entry-analysis-config',
  'binary-security',
  'binary-security-root',
  'binary-security-task-list',
  'binary-security-detail',
  'binary-security-metrics',
  'binary-module-security',
  'binary-module-security-detail',
  'source-security',
  'source-security-detail',
  'mobile-security-ipc-vuln',
  'kernel-scan',
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
  // [DISABLED] 数据流漏洞挖掘 - 方便后续复用
  // 'pentest-exec-dataflow-vuln',
  // 'binary-evolution-dataflow-vuln',
  // 'pentest-exec-dataflow-vuln-task-list',
  // 'pentest-exec-dataflow-vuln-task-detail',
  // 'pentest-exec-dataflow-vuln-system-config',
  'binary-evolution-center',
  'binary-evolution-firmware-unpacker',
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
  // [DISABLED] 评审研判 - 方便后续复用
  // 'vuln-review-judgment',
  // 'vuln-review-judgment-detail',
  'vuln-queue',
  'vuln-services',
  'vuln-repro-config',
  'vuln-parameter-config',
  'task-nuzhua',
  'task-smart-jar',
  'task-apk-smart-scan',
  'task-binary-end-to-end',
  'task-web-end-to-end',
  'developer-atomic-capability',
  'developer-atomic-capability-overview',
  'developer-tools',
  'developer-tools-overview',
]);

const DEVELOPER_ATOMIC_CAPABILITY_VIEWS = new Set<string>([
  'pentest-exec-firmware-unpacker',
  'pentest-system',
  'pentest-exec-b2s',
  'pentest-threat',
  'pentest-dataflow-vuln-scan',
  'pentest-exec-firmware-task-list',
  'system-analysis-task',
  'system-analysis-detail',
  'pentest-exec-b2s-root',
  'pentest-exec-b2s-task-list',
  'pentest-exec-b2s-create',
  'pentest-exec-b2s-queue',
  'pentest-exec-b2s-result',
  'pentest-exec-b2s-detail',
  'pentest-exec-b2s-advanced',
  'entry-analysis-root',
  'entry-analysis-task',
  'entry-analysis-detail',
  'dataflow-vuln-scan-task',
  'dataflow-vuln-scan-detail',
  'dataflow-vuln-scan-config',
  'pentest-vuln-verify',
  'vuln-verify-task',
]);

const DEVELOPER_TOOL_VIEWS = new Set<string>([
  'binary-security',
  'binary-security-root',
  'binary-security-task-list',
  'binary-security-detail',
  'source-security',
  'source-security-detail',
  'binary-module-security',
  'binary-module-security-detail',
]);

const ASSESSMENT_VIEWS = new Set([
  'pentest-exec-code',
  'security-assessment',
  'pentest-report',
]);

const SKILL_VIEWS = new Set([
  'mobile-security-ipc-vuln',
  'kernel-scan',
  'pentest-exec-work',
]);

const OBSERVE_VIEWS = new Set([
  'workflow-apps',
  'workflow-app-detail',
  'workflow-app-instances',
  'workflow-app-instance-detail',
  'workflow-jobs',
  'workflow-job-detail',
  'workflow-instances',
  'workflow-instance-detail',
  'workflow-instance-logs',
]);

const AIGW_VIEWS = new Set([
  'aigw-admin',
  'config-center-llm',
  'config-center-root',
  'config-center-llm-chat',
  'admin-dashboard',
  'sys-settings',
  'change-password',
]);

const SCHEDULE_VIEWS = new Set([
  'chirmera-platform-schedule',
  'static-packages',
  'static-package-detail',
  'deploy-script-mgmt',
]);

const EVOLUTION_VIEWS = new Set([
  'binary-evolution-center',
  'binary-evolution-firmware-unpacker',
  'binary-security-config',
  'binary-security-metrics',
]);

const TENANT_VIEWS = new Set([
  'user-mgmt-access',
  'user-mgmt-users',
  'user-mgmt-online',
  'user-mgmt-machine',
  'org-mgmt-departments',
  'org-mgmt-members',
  'org-mgmt-projects',
]);

const ROLE_VIEWS = new Set([
  'user-mgmt-roles',
  'user-mgmt-perms',
]);

export const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'dashboard') return 'dashboard';

  if (view === 'project-mgmt' || view === 'project-detail' || view === 'product-mgmt') return 'project';

  if (
    view === 'project-file-explorer' ||
    view === 'fileserver-archive-tasks' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management'
  ) return 'assets';

  if (view.startsWith('test-input-')) return 'task';

  if (view.startsWith('task-')) return 'task';

  if (view.startsWith('env-')) return 'environment';

  if (view === 'vuln-engine' || view.startsWith('vuln-')) return 'vuln';

  if (ASSESSMENT_VIEWS.has(view)) return 'assessment';

  if (OBSERVE_VIEWS.has(view) || view.startsWith('workflow-')) return 'observe';

  if (SKILL_VIEWS.has(view)) return 'skill';

  if (DEVELOPER_TOOL_VIEWS.has(view) || view === 'developer-tools-overview' || view === 'developer-tools') return 'tools';

  if (DEVELOPER_ATOMIC_CAPABILITY_VIEWS.has(view) || view.startsWith('developer-atomic-capability') || view.startsWith('developer-')) return 'atomic';

  if (EVOLUTION_VIEWS.has(view) || view.startsWith('binary-evolution-')) return 'evolution';

  if (AIGW_VIEWS.has(view)) return 'aigw';

  if (SCHEDULE_VIEWS.has(view)) return 'schedule';

  if (TENANT_VIEWS.has(view)) return 'tenant';

  if (ROLE_VIEWS.has(view)) return 'role';

  return 'dashboard';
};

export const getTopLevelDefaultView = (nav: TopLevelNavKey, user: UserInfo | null): string => {
  const access = getUserAccess(user);

  switch (nav) {
    case 'dashboard': return 'dashboard';
    case 'project': return 'project-mgmt';
    case 'assets': return 'public-resource-pvc-management';
    case 'task': return 'task-nuzhua';
    case 'environment': return 'env-agent';
    case 'vuln': return 'vuln-overview';
    case 'assessment': return 'pentest-exec-code';
    case 'observe': return 'workflow-apps';
    case 'skill': return 'mobile-security-ipc-vuln';
    case 'tools': return 'developer-tools-overview';
    case 'atomic': return 'developer-atomic-capability-overview';
    case 'aigw':
      if (access.canAccessAdminDashboard) return 'admin-dashboard';
      return 'aigw-admin';
    case 'schedule': return 'chirmera-platform-schedule';
    case 'evolution': return 'binary-evolution-center';
    case 'tenant':
      if (access.canAccessUserCenter) return String(getUserCenterDefaultView(user));
      return 'user-mgmt-access';
    case 'role': return 'user-mgmt-roles';
    case 'user-mgmt': return 'user-mgmt-users';
    default: return 'dashboard';
  }
};

const PLATFORM_ACCOUNT_ORG_SECTIONS: NavSection[] = [
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
];

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
        { id: 'product-mgmt', label: '产品管理', icon: Package, healthKey: 'projectHealth' },
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
  task: [
    {
      title: '输入',
      items: [
        { id: 'test-input-root', label: '任务输入', icon: FileBox, requiresProject: true },
      ],
    },
    {
      title: '任务中心',
      items: [
        { id: 'task-nuzhua', label: 'NUZHUA', icon: Activity, requiresProject: true },
        { id: 'task-smart-jar', label: '智JAR', icon: Archive, requiresProject: true },
        { id: 'task-apk-smart-scan', label: 'APK智能扫描', icon: Shield, requiresProject: true },
        { id: 'task-binary-end-to-end', label: '二进制端到端', icon: Cpu, requiresProject: true },
        { id: 'task-web-end-to-end', label: 'WEB端到端', icon: Globe, requiresProject: true },
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
  vuln: [
    {
      title: '漏洞闭环',
      items: [
        { id: 'vuln-overview', label: '生命周期总览', icon: Cpu, aliases: ['vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
        { id: 'vuln-intake', label: '疑点中心', icon: FolderOpen, requiresProject: true },
        { id: 'vuln-analysis', label: '研判中心', icon: GitBranch, aliases: ['vuln-analysis-detail'], requiresProject: true },
        { id: 'vuln-verification', label: '验证阶段', icon: ShieldCheck, aliases: ['vuln-verification-detail'], requiresProject: true },
        { id: 'vuln-decision', label: '漏洞中心', icon: ShieldAlert, aliases: ['vuln-decision-detail'], requiresProject: true },
        { id: 'vuln-queue', label: '运行队列', icon: Workflow, requiresProject: true },
        { id: 'vuln-services', label: '能力注册', icon: ServerCog, requiresProject: true },
        { id: 'vuln-repro-config', label: '复现配置', icon: Settings, requiresProject: true },
        { id: 'vuln-parameter-config', label: '参数配置', icon: Settings, requiresProject: true },
      ],
    },
  ],
  assessment: [
    {
      title: '安全评测',
      items: [
        { id: 'pentest-exec-code', label: '在线代码审计', icon: Code2, requiresProject: true, healthKey: 'codeAuditHealth' },
        { id: 'security-assessment', label: '安全评估', icon: ClipboardCheck, requiresProject: true },
        { id: 'pentest-report', label: '测试报告', icon: FileText, requiresProject: true },
      ],
    },
  ],
  observe: [
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
  skill: [
    {
      title: '终端安全',
      items: [
        { id: 'mobile-security-ipc-vuln', label: '鸿蒙框架漏洞挖掘', icon: Terminal, requiresProject: true },
        { id: 'kernel-scan', label: '内核扫描', icon: Shield, requiresProject: true },
      ],
    },
    {
      title: 'WEB安全',
      items: [
        { id: 'pentest-exec-work', label: '知微工作台', icon: Target, requiresProject: true },
      ],
    },
  ],
  tools: [
    {
      title: '开发者工具',
      items: [
        { id: 'developer-tools-overview', label: '工具总览', icon: Settings, requiresProject: true, aliases: ['developer-tools'] },
        { id: 'binary-security', label: '二进制固件端到端扫描', icon: Settings, aliases: ['binary-security-root', 'binary-security-task-list', 'binary-security-detail'], requiresProject: true },
        { id: 'source-security', label: '源码端到端扫描', icon: Settings, aliases: ['source-security-detail'], requiresProject: true },
        { id: 'binary-module-security', label: '二进制模块端到端扫描', icon: Settings, aliases: ['binary-module-security-detail'], requiresProject: true },
      ],
    },
  ],
  atomic: [
    {
      title: '原子能力',
      items: [
        { id: 'developer-atomic-capability-overview', label: '原子能力总览', icon: Zap, requiresProject: true, aliases: ['developer-atomic-capability'] },
        { id: 'pentest-exec-firmware-unpacker', label: '固件解包', icon: Zap, aliases: ['pentest-exec-firmware-task-list'], requiresProject: true },
        { id: 'pentest-system', label: '系统分析', icon: Zap, aliases: ['system-analysis-task', 'system-analysis-detail'], requiresProject: true },
        { id: 'pentest-exec-b2s', label: '二进制逆向', icon: Zap, aliases: ['pentest-exec-b2s-root', 'pentest-exec-b2s-task-list', 'pentest-exec-b2s-create', 'pentest-exec-b2s-queue', 'pentest-exec-b2s-result', 'pentest-exec-b2s-detail', 'pentest-exec-b2s-advanced'], requiresProject: true },
        { id: 'pentest-threat', label: '入口分析', icon: Zap, aliases: ['entry-analysis-root', 'entry-analysis-task', 'entry-analysis-detail'], requiresProject: true },
        { id: 'pentest-dataflow-vuln-scan', label: '数据流漏洞挖掘', icon: Zap, aliases: ['dataflow-vuln-scan-task', 'dataflow-vuln-scan-detail', 'dataflow-vuln-scan-config'], requiresProject: true },
        { id: 'pentest-vuln-verify', label: '漏洞验证', icon: Zap, aliases: ['vuln-verify-task'], requiresProject: true },
      ],
    },
  ],
  aigw: [
    {
      title: 'AI 网关',
      items: [
        { id: 'aigw-admin', label: 'AI 网关管理', icon: Activity },
        { id: 'config-center-llm', label: '配置中心', icon: Key, aliases: ['config-center-root', 'config-center-llm-chat'], healthKey: 'configCenterHealth' },
        { id: 'admin-dashboard', label: '管理员控制台', icon: ShieldAlert },
        { id: 'sys-settings', label: '系统设置', icon: Settings },
        { id: 'change-password', label: '修改密码', icon: Lock },
      ],
    },
  ],
  schedule: [
    {
      title: '任务调度',
      items: [
        { id: 'chirmera-platform-schedule', label: '调度中心', icon: Workflow },
        { id: 'static-packages', label: '静态软件包', icon: Package, aliases: ['static-package-detail'], healthKey: 'staticPackageHealth' },
        { id: 'deploy-script-mgmt', label: '部署脚本', icon: Terminal },
      ],
    },
  ],
  evolution: [
    {
      title: '二进制进化',
      items: [
        { id: 'binary-evolution-center', label: '进化中心', icon: Sparkles, requiresProject: true, subItems: [
          { id: 'binary-evolution-firmware-unpacker', label: '进化固件解包', requiresProject: true },
        ] },
        { id: 'binary-security-config', label: '参数配置', icon: Settings, requiresProject: true },
        { id: 'binary-security-metrics', label: '性能看板', icon: Monitor, requiresProject: true },
      ],
    },
  ],
  tenant: PLATFORM_ACCOUNT_ORG_SECTIONS,
  role: [
    {
      title: '角色管理',
      items: [
        { id: 'user-mgmt-roles', label: '角色列表', icon: Shield },
        { id: 'user-mgmt-perms', label: '权限分配', icon: Users },
      ],
    },
  ],
  'user-mgmt': PLATFORM_ACCOUNT_ORG_SECTIONS,
};
