import React from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  Bot,
  Box,
  ClipboardList,
  Briefcase,
  Building2,
  Brain,
  Cpu,
  FileBox,
  FileSearch,
  FileText,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe,
  GraduationCap,
  HardDrive,
  Key,
  Layers3,
  LayoutDashboard,
  ListTodo,
  Lock,
  LucideIcon,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Play,
  Plus,
  ServerCog,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
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
  | 'home'
  | 'test-task'
  | 'vuln-center'
  | 'assets-center'
  | 'asset-supply'
  | 'alert-center'
  | 'assessment'
  | 'observe'
  | 'skill'
  | 'tools'
  | 'atomic'
  | 'sec-assessment'
  | 'system-admin';

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
  defaultExpanded?: boolean;
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
  { id: 'home', label: '首页', role: null },
  { id: 'test-task', label: '测试任务', role: null },
  { id: 'vuln-center', label: '漏洞中心', role: null },
  { id: 'assets-center', label: '资产管理', role: null },
  { id: 'asset-supply', label: '资产', role: 'developer' },
  { id: 'alert-center', label: '告警中心', role: 'developer', showDividerBefore: true },
  { id: 'sec-assessment', label: '安全评估', role: 'developer' },
  { id: 'assessment', label: '评测', role: 'developer' },
  { id: 'observe', label: '观测', role: 'developer' },
  { id: 'skill', label: '技能', role: 'developer' },
  { id: 'tools', label: '工具', role: 'developer' },
  { id: 'atomic', label: '原子能力', role: 'developer' },
  { id: 'system-admin', label: '系统管理', role: 'admin', showDividerBefore: true },
];

const ROLE_TAB_ACCESS: Record<string, Set<string>> = {
  ordinary_user: new Set(['user']),
  developer: new Set(['user', 'developer']),
  ordinary_admin: new Set(['user', 'developer', 'admin']),
  super_admin: new Set(['user', 'developer', 'admin']),
};

export const getVisibleTopLevelNavItems = (
  user: UserInfo | null | undefined,
): TopLevelNavItem[] => {
  const platformRole = getPlatformRole(user);
  const accessibleRoles = ROLE_TAB_ACCESS[platformRole] || ROLE_TAB_ACCESS.ordinary_user;
  return TOP_LEVEL_NAV_ITEMS.filter((item) => {
    if (item.id === 'home' || item.id === 'assets-center') return true;
    if (item.role && !accessibleRoles.has(item.role)) return false;
    return true;
  });
};

export const PROJECT_REQUIRED_VIEWS = new Set<string>([
  'project-file-explorer',
  'fileserver-archive-tasks',
  'public-resource-pvc-management',
  'public-resource-task-management',
  'pvc-management',
  'env-access',
  'env-management',
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
  'cfg-guided-explore-task',
  'cfg-guided-explore-detail',
  'cfg-guided-explore-config',
  'pentest-vuln-verify-v2',
  'pentest-web-vuln-verify',
  'pentest-frama-c',
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
  'kg-source-security',
  'kg-source-security-detail',
  'cfg-db-vuln-tool',
  'cfg-db-vuln-detail',
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
  'vuln-list',
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
  'task-list',
  'task-vuln-list',
  'developer-atomic-capability',
  'developer-atomic-capability-overview',
  'developer-tools',
  'developer-tools-overview',
  'redline-verification',
  'redline-verification-detail',
]);

const DEVELOPER_ATOMIC_CAPABILITY_VIEWS = new Set<string>([
  'pentest-exec-firmware-unpacker',
  'pentest-system',
  'pentest-exec-b2s',
  'pentest-threat',
  'pentest-dataflow-vuln-scan',
  'pentest-cfg-guided-explore',
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
  'cfg-guided-explore-task',
  'cfg-guided-explore-detail',
  'cfg-guided-explore-config',
  'pentest-vuln-verify-v2',
  'pentest-web-vuln-verify',
  'pentest-frama-c',
]);

const DEVELOPER_TOOL_VIEWS = new Set<string>([
  'binary-security',
  'binary-security-root',
  'binary-security-task-list',
  'binary-security-detail',
  'source-security',
  'source-security-detail',
  'kg-source-security',
  'kg-source-security-detail',
  'cfg-db-vuln-tool',
  'cfg-db-vuln-detail',
  'binary-module-security',
  'binary-module-security-detail',
  'app-security-scan',
  'app-security-scan-detail',
  'app-security-scan-monitor',
  'redline-verification',
  'redline-verification-detail',
  'cairn-blackboard',
  'tool-registration',
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
  // "技能" 顶级导航复用 SecOcto 技能库（只读模式）
  // 详情 view 'skill-secocto-skill-*' 由 getTopLevelNavForView 的前缀分支处理
  'skill-secocto-skills',
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
  'aigw-dashboard',
  'aigw-config',
  'aigw-keys',
  'aigw-logs',
  'aigw-token-stats',
  'aigw-admin',
  'config-center-llm',
  'config-center-root',
  'config-center-llm-chat',
  'admin-dashboard',
  'sys-settings',
  'change-password',
]);

const SCHEDULE_VIEWS = new Set([
  'chimera-platform-schedule',
  'chimera-platform-schedule-config',
  'static-packages',
  'static-package-detail',
  'deploy-script-mgmt',
]);

const EVOLUTION_VIEWS = new Set([
  'binary-evolution-center',
  'binary-evolution-firmware-unpacker',
  'binary-security-config',
  'binary-security-metrics',
  'secocto-overview',
  'secocto-skills',
  'secocto-memories',
  'secocto-vulns',
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

const SYSTEM_ADMIN_DASHBOARD_VIEWS = new Set(['dashboard', 'admin-dashboard']);

const SYSTEM_ADMIN_ENVIRONMENT_VIEWS = new Set([
  'env-access', 'env-management',
  'env-agent', 'env-service', 'env-ai-agent', 'env-ai-agent-overview',
  'env-ai-helper', 'env-ai-agent-manage', 'env-ai-agent-session-manage',
  'env-ai-session', 'env-ai-batch-session', 'env-template', 'env-tasks',
  'env-process-monitor-root', 'env-process-monitor-overview',
  'env-process-monitor-detail', 'env-process-monitor-tasks',
]);

export const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'home') return 'home';
  if (view.startsWith('task-') || view === 'task-list' || view === 'task-center-timeline') return 'test-task';
  if (view === 'vuln-intake' || view === 'vuln-overview' || view === 'vuln-engine') return 'alert-center';
  if (view.startsWith('sec-assessment-') || view.startsWith('sec-baseline-')) return 'sec-assessment';
  if (view === 'vuln-engine' || view.startsWith('vuln-')) return 'vuln-center';
  if (view === 'project-mgmt' || view === 'project-detail' || view === 'product-mgmt') return 'assets-center';
  if (view.startsWith('test-input-')) return 'assets-center';
  if (view === 'env-access' || view === 'env-management' || view.startsWith('env-')) return 'assets-center';
  if (
    view === 'project-file-explorer' ||
    view === 'fileserver-archive-tasks' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management'
  ) return 'asset-supply';
  if (view === 'assessment-coming-soon') return 'assessment';
  if (view === 'observe-coming-soon') return 'observe';
  if (view === 'skill-coming-soon') return 'skill';
  // 'skill-secocto-' 前缀必须在 secocto- 判定之前匹配，否则会被下面的 secocto- 规则
  // 抢去归入 system-admin（'skill-secocto-' 不以 'secocto-' 开头，但要早判定保持语义清晰）。
  if (view.startsWith('skill-secocto-')) return 'skill';
  if (ASSESSMENT_VIEWS.has(view)) return 'assessment';
  if (OBSERVE_VIEWS.has(view) || view.startsWith('workflow-')) return 'observe';
  if (SKILL_VIEWS.has(view)) return 'skill';
  if (DEVELOPER_TOOL_VIEWS.has(view) || view === 'developer-tools-overview' || view === 'developer-tools') return 'tools';
  if (DEVELOPER_ATOMIC_CAPABILITY_VIEWS.has(view) || view.startsWith('developer-atomic-capability') || view.startsWith('developer-')) return 'atomic';
  if (SYSTEM_ADMIN_DASHBOARD_VIEWS.has(view)) return 'system-admin';
  if (AIGW_VIEWS.has(view)) return 'system-admin';
  if (SCHEDULE_VIEWS.has(view)) return 'system-admin';
  if (EVOLUTION_VIEWS.has(view) || view.startsWith('binary-evolution-') || view.startsWith('secocto-')) return 'system-admin';
  if (TENANT_VIEWS.has(view)) return 'system-admin';
  if (ROLE_VIEWS.has(view)) return 'system-admin';
  if (view === 'sys-settings' || view === 'change-password') return 'system-admin';
  if (view === 'vuln-confirm-engines') return 'system-admin';
  return 'home';
};

export const getTopLevelDefaultView = (nav: TopLevelNavKey, user: UserInfo | null): string => {
  switch (nav) {
    case 'home': return 'home';
    case 'test-task': return 'task-list';
    case 'vuln-center': return 'vuln-list';
    case 'assets-center': return 'project-mgmt';
    case 'asset-supply': return 'public-resource-pvc-management';
    case 'alert-center': return 'vuln-intake';
    case 'sec-assessment': return 'sec-assessment-project';
    case 'assessment': return 'assessment-coming-soon';
    case 'observe': return 'observe-coming-soon';
    case 'skill': return 'skill-secocto-skills';
    case 'tools': return 'developer-tools-overview';
    case 'atomic': return 'developer-atomic-capability-overview';
    case 'system-admin': return 'dashboard';
    default: return 'home';
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
      { id: 'user-mgmt-roles', label: '角色定义管理', icon: Shield },
      { id: 'user-mgmt-perms', label: '角色权限分配', icon: Users },
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

export const SIDEBAR_SECTIONS: Record<string, NavSection[]> = {
  home: [],
  'test-task': [
    {
      title: '测试任务',
      items: [
        { id: 'task-list', label: '测试任务', icon: ListTodo, requiresProject: true },
      ],
    },
  ],
  'vuln-center': [
    {
      title: '漏洞中心',
      items: [
        { id: 'vuln-list', label: '漏洞中心', icon: Shield, requiresProject: true, healthKey: 'vulnHealth' },
      ],
    },
  ],
  'alert-center': [
    {
      title: '告警中心',
      items: [
        { id: 'vuln-intake', label: '告警中心', icon: ShieldAlert, aliases: ['vuln-overview', 'vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
      ],
    },
  ],
  'sec-assessment': [
    {
      title: '安全评估',
      items: [
        { id: 'sec-assessment-project', label: '安全评估项目', icon: ClipboardList },
        { id: 'sec-baseline', label: '安全功能基线管理', icon: ShieldCheck, defaultExpanded: true, subItems: [
          { id: 'sec-baseline-mgmt', label: '基线列表' },
          { id: 'sec-baseline-org-tree', label: '组织树管理' },
        ] },
      ],
    },
  ],
  'asset-supply': [
    {
      title: '资产',
      items: [
        { id: 'project-file-explorer', label: '项目文件', icon: FolderTree, requiresProject: true },
        { id: 'fileserver-archive-tasks', label: '打包下载任务', icon: Archive, requiresProject: true },
        { id: 'public-resource-pvc-management', label: 'PVC 管理', icon: HardDrive, requiresProject: true },
        { id: 'public-resource-task-management', label: '资源任务', icon: ListTodo, requiresProject: true },
      ],
    },
  ],
  assessment: [
    {
      title: '评测',
      items: [
        { id: 'assessment-coming-soon', label: '排行榜', icon: BarChart3, requiresProject: true },
      ],
    },
  ],
  observe: [],
  skill: [
    {
      title: '技能',
      items: [
        // 复用 pages/secocto/GatePages.tsx 的 SecOctoSkillsPage，只读模式。
        // 详情页隐藏"发起进化合并"按钮（readOnly=true 由 pages/secocto/viewRegistry.tsx 注入）。
        { id: 'skill-secocto-skills', label: '技能库', icon: GraduationCap },
      ],
    },
  ],
  tools: [
    {
      title: '开发者工具',
      items: [
        { id: 'developer-tools-overview', label: '工具总览', icon: Settings, requiresProject: true, aliases: ['developer-tools'] },
        { id: 'tool-registration', label: '工具注册', icon: Plus },
        { id: 'binary-security', label: '盖亚-二进制固件', icon: Settings, aliases: ['binary-security-root', 'binary-security-task-list', 'binary-security-detail'], requiresProject: true },
        { id: 'source-security', label: '盖亚-源码', icon: Settings, aliases: ['source-security-detail'], requiresProject: true },
        { id: 'kg-source-security', label: '知识图谱-源码漏洞挖掘', icon: Settings, aliases: ['kg-source-security-detail'], requiresProject: true },
        { id: 'cfg-db-vuln-tool', label: '知识图谱-源码（CFG+DFG）', icon: GitBranch, aliases: ['cfg-db-vuln-detail'], requiresProject: true },
        { id: 'binary-module-security', label: '盖亚-二进制模块', icon: Settings, aliases: ['binary-module-security-detail'], requiresProject: true },
        { id: 'app-security-scan', label: 'turing 扫描工具', icon: Smartphone, aliases: ['app-security-scan-detail', 'app-security-scan-monitor'], requiresProject: true },
        { id: 'redline-verification', label: '红线验证', icon: ShieldCheck, aliases: ['redline-verification-detail'], requiresProject: true },
        { id: 'cairn-blackboard', label: '黑板', icon: Network },
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
        { id: 'pentest-cfg-guided-explore', label: 'CFG Guided Explore', icon: Zap, aliases: ['cfg-guided-explore-task', 'cfg-guided-explore-detail', 'cfg-guided-explore-config'], requiresProject: true },
        { id: 'pentest-vuln-verify-v2', label: '漏洞验证 v2', icon: Zap, requiresProject: true },
        { id: 'pentest-web-vuln-verify', label: 'WEB漏洞验证', icon: Zap, requiresProject: true },
        { id: 'pentest-frama-c', label: '形式化验证', icon: ShieldCheck, requiresProject: true },
      ],
    },
  ],
};

const SYSTEM_ADMIN_SIDEBAR_MAP: Record<string, NavSection[]> = {
  dashboard: [
    {
      title: '总览',
      items: [{ id: 'dashboard', label: '控制台总览', icon: LayoutDashboard }],
    },
  ],
  aigw: [
    {
      title: 'AI 网关',
      items: [
        { id: 'aigw-dashboard', label: 'Dashboard', icon: LayoutDashboard, aliases: ['aigw-admin'] },
        { id: 'aigw-config', label: '网关配置', icon: Settings },
        { id: 'aigw-keys', label: '密钥管理', icon: Key },
        { id: 'aigw-logs', label: '查看日志', icon: FileText },
        { id: 'aigw-token-stats', label: 'Token 统计', icon: BarChart3 },
        { id: 'config-center-llm', label: '模型配置中心', icon: Activity, aliases: ['config-center-root', 'config-center-llm-chat'], healthKey: 'configCenterHealth' },
      ],
    },
  ],
  schedule: [
    {
      title: '任务调度',
      items: [
        { id: 'chimera-platform-schedule', label: '调度中心', icon: Workflow },
        { id: 'chimera-platform-schedule-config', label: '调度参数', icon: Settings },
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
    {
      title: '进化中心',
      items: [
        { id: 'secocto-overview', label: '总览', icon: LayoutDashboard },
        { id: 'secocto-skills', label: '技能进化', icon: GraduationCap },
        { id: 'secocto-memories', label: '记忆进化', icon: Brain },
        { id: 'secocto-vulns', label: '漏洞管理', icon: ShieldAlert },
      ],
    },
  ],
  tenant: PLATFORM_ACCOUNT_ORG_SECTIONS,
  vulnConfig: [
    {
      title: '漏洞配置',
      items: [
        { id: 'vuln-confirm-engines', label: '漏洞确认引擎', icon: ShieldCheck },
      ],
    },
  ],
  environment: [
    {
      title: '测试环境',
      items: [
        { id: 'env-access', label: '环境接入', icon: Terminal, requiresProject: true, healthKey: 'envHealth' },
        { id: 'env-management', label: '环境管理', icon: ServerCog, requiresProject: true, healthKey: 'envHealth' },
      ],
    },
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
};

export type SystemAdminChildKey = 'dashboard' | 'aigw' | 'schedule' | 'evolution' | 'tenant' | 'environment' | 'vulnConfig';

export const SYSTEM_ADMIN_CHILDREN: { key: SystemAdminChildKey; label: string; defaultView: string }[] = [
  { key: 'dashboard', label: '仪表盘', defaultView: 'dashboard' },
  { key: 'aigw', label: 'AI网关', defaultView: 'aigw-dashboard' },
  { key: 'schedule', label: '任务调度', defaultView: 'chimera-platform-schedule' },
  { key: 'evolution', label: '进化', defaultView: 'binary-evolution-center' },
  { key: 'tenant', label: '租户', defaultView: 'user-mgmt-access' },
  { key: 'environment', label: '环境', defaultView: 'env-agent' },
  { key: 'vulnConfig', label: '漏洞配置', defaultView: 'vuln-confirm-engines' },
];

export const getSystemAdminActiveChild = (currentView: string): SystemAdminChildKey => {
  if (currentView.startsWith('env-')) return 'environment';
  if (AIGW_VIEWS.has(currentView) || currentView.startsWith('aigw-') || currentView.startsWith('config-center-')) return 'aigw';
  if (SCHEDULE_VIEWS.has(currentView) || currentView === 'chimera-platform-schedule-config') return 'schedule';
  if (EVOLUTION_VIEWS.has(currentView) || currentView.startsWith('binary-evolution-') || currentView.startsWith('secocto-')) return 'evolution';
  if (TENANT_VIEWS.has(currentView) || ROLE_VIEWS.has(currentView) || currentView.startsWith('user-mgmt-') || currentView.startsWith('org-mgmt-')) return 'tenant';
  if (currentView === 'vuln-confirm-engines') return 'vulnConfig';
  return 'dashboard';
};

export const getSystemAdminSidebarSections = (currentView: string): NavSection[] => {
  const childKey = getSystemAdminActiveChild(currentView);
  return SYSTEM_ADMIN_SIDEBAR_MAP[childKey] || [];
};

const ASSETS_CENTER_SIDEBAR_MAP: Record<string, NavSection[]> = {
  projectMgmt: [
    {
      title: '项目管理',
      items: [
        { id: 'project-mgmt', label: '项目管理', icon: Briefcase, aliases: ['project-detail'], healthKey: 'projectHealth' },
      ],
    },
  ],
  testObject: [
    {
      title: '测试对象',
      items: [
        { id: 'test-input-root', label: '测试对象', icon: FileBox, requiresProject: true },
      ],
    },
  ],
  testEnv: [
    {
      title: '测试环境',
      items: [
        { id: 'env-access', label: '环境接入', icon: Terminal, requiresProject: true, healthKey: 'envHealth' },
        { id: 'env-management', label: '环境管理', icon: ServerCog, requiresProject: true, healthKey: 'envHealth' },
      ],
    },
  ],
  assetSupply: [
    {
      title: '资产',
      items: [
        { id: 'project-file-explorer', label: '项目文件', icon: FolderTree, requiresProject: true },
        { id: 'fileserver-archive-tasks', label: '打包下载任务', icon: Archive, requiresProject: true },
        { id: 'public-resource-pvc-management', label: 'PVC 管理', icon: HardDrive, requiresProject: true },
        { id: 'public-resource-task-management', label: '资源任务', icon: ListTodo, requiresProject: true },
      ],
    },
  ],
};

export type AssetsCenterChildKey = 'projectMgmt' | 'testObject' | 'testEnv';

export const ASSETS_CENTER_CHILDREN: { key: AssetsCenterChildKey; label: string; defaultView: string }[] = [
  { key: 'projectMgmt', label: '项目管理', defaultView: 'project-mgmt' },
  { key: 'testObject', label: '测试对象', defaultView: 'test-input-root' },
  { key: 'testEnv', label: '测试环境', defaultView: 'env-access' },
];

export const getAssetsCenterActiveChild = (currentView: string): AssetsCenterChildKey => {
  if (currentView === 'project-mgmt' || currentView === 'project-detail' || currentView === 'product-mgmt') return 'projectMgmt';
  if (currentView.startsWith('test-input-')) return 'testObject';
  if (currentView === 'env-access' || currentView === 'env-management') return 'testEnv';
  return 'projectMgmt';
};

export const getAssetsCenterSidebarSections = (currentView: string): NavSection[] => {
  const childKey = getAssetsCenterActiveChild(currentView);
  return ASSETS_CENTER_SIDEBAR_MAP[childKey] || [];
};
