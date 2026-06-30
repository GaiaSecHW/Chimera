import { UserInfo, ViewType } from '../types/types';

export type PlatformRole = 'super_admin' | 'ordinary_admin' | 'developer' | 'ordinary_user';

export interface UserAccess {
  platformRole: PlatformRole;
  canAccessUserCenter: boolean;
  canAccessAdminDashboard: boolean;
  canAccessConfigCenter: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canManageDepartments: boolean;
  canManageDepartmentMembers: boolean;
  canManageOrgProjects: boolean;
}

const PLATFORM_ROLE_ALIASES: Record<string, PlatformRole> = {
  super_admin: 'super_admin',
  admin: 'super_admin',
  '管理员': 'super_admin',
  '超级管理员': 'super_admin',
  ordinary_admin: 'ordinary_admin',
  '普通管理员': 'ordinary_admin',
  developer: 'developer',
  '开发者': 'developer',
  ordinary_user: 'ordinary_user',
  user: 'ordinary_user',
  '普通用户': 'ordinary_user',
};

export const getPlatformRole = (user: UserInfo | null | undefined): PlatformRole => {
  if (!user) return 'ordinary_user';

  if (Number(user.id) === 1) {
    return 'super_admin';
  }

  const names = [
    user.platform_role,
    ...(Array.isArray(user.role) ? user.role : []),
  ].filter(Boolean) as string[];

  for (const name of names) {
    const normalized = PLATFORM_ROLE_ALIASES[name] || PLATFORM_ROLE_ALIASES[name.toLowerCase()];
    if (normalized === 'super_admin') return normalized;
  }
  for (const name of names) {
    const normalized = PLATFORM_ROLE_ALIASES[name] || PLATFORM_ROLE_ALIASES[name.toLowerCase()];
    if (normalized === 'ordinary_admin') return normalized;
  }
  for (const name of names) {
    const normalized = PLATFORM_ROLE_ALIASES[name] || PLATFORM_ROLE_ALIASES[name.toLowerCase()];
    if (normalized === 'developer') return normalized;
  }

  return 'ordinary_user';
};

export const getUserAccess = (user: UserInfo | null | undefined): UserAccess => {
  const platformRole = getPlatformRole(user);

  if (platformRole === 'super_admin') {
    return {
      platformRole,
      canAccessUserCenter: true,
      canAccessAdminDashboard: true,
      canAccessConfigCenter: true,
      canManageUsers: true,
      canManageRoles: true,
      canManageDepartments: true,
      canManageDepartmentMembers: true,
      canManageOrgProjects: true,
    };
  }

  if (platformRole === 'ordinary_admin') {
    return {
      platformRole,
      canAccessUserCenter: true,
      canAccessAdminDashboard: false,
      canAccessConfigCenter: false,
      canManageUsers: false,
      canManageRoles: false,
      canManageDepartments: false,
      canManageDepartmentMembers: true,
      canManageOrgProjects: true,
    };
  }

  if (platformRole === 'developer') {
    return {
      platformRole,
      canAccessUserCenter: false,
      canAccessAdminDashboard: false,
      canAccessConfigCenter: false,
      canManageUsers: false,
      canManageRoles: false,
      canManageDepartments: false,
      canManageDepartmentMembers: false,
      canManageOrgProjects: false,
    };
  }

  return {
    platformRole,
    canAccessUserCenter: false,
    canAccessAdminDashboard: false,
    canAccessConfigCenter: false,
    canManageUsers: false,
    canManageRoles: false,
    canManageDepartments: false,
    canManageDepartmentMembers: false,
    canManageOrgProjects: false,
  };
};

const SUPER_ADMIN_ONLY_VIEWS = new Set<string>([
  'admin-dashboard',
  'aigw-dashboard',
  'aigw-config',
  'aigw-keys',
  'aigw-logs',
  'aigw-admin',
  'config-center-root',
  'config-center-llm',
  'config-center-llm-chat',
  'chimera-platform-schedule',
  'user-mgmt-users',
  'user-mgmt-access',
  'user-mgmt-online',
  'user-mgmt-machine',
  'org-mgmt-departments',
  'feedback-mgmt',
]);

const ORDINARY_ADMIN_VIEWS = new Set<string>([
  'org-mgmt-members',
  'org-mgmt-projects',
]);

const ADMIN_VIEWS = new Set<string>([
  'env-agent',
  'env-service',
  'env-ai-agent',
  'env-ai-agent-overview',
  'env-ai-helper',
  'env-ai-agent-manage',
  'env-ai-agent-session-manage',
  'env-ai-session',
  'env-ai-batch-session',
  'env-template',
  'env-tasks',
  'env-process-monitor-root',
  'env-process-monitor-overview',
  'env-process-monitor-detail',
  'env-process-monitor-tasks',
]);

// 开发者可在 ADMIN_VIEWS 中访问的子集：其余 env-* 仍仅管理员可见，仅 env-access 对开发者放行。
const DEVELOPER_ALLOWED_ADMIN_VIEWS = new Set<string>(['env-access']);

export const canAccessView = (user: UserInfo | null | undefined, view: ViewType | string): boolean => {
  const access = getUserAccess(user);

  if (ADMIN_VIEWS.has(view)) {
    if (DEVELOPER_ALLOWED_ADMIN_VIEWS.has(view) && access.platformRole === 'developer') {
      return true;
    }
    return access.platformRole === 'super_admin' || access.platformRole === 'ordinary_admin';
  }

  if (ORDINARY_ADMIN_VIEWS.has(view)) {
    return access.platformRole === 'super_admin' || access.platformRole === 'ordinary_admin';
  }

  if (SUPER_ADMIN_ONLY_VIEWS.has(view)) {
    return access.platformRole === 'super_admin';
  }

  return true;
};

export const getUserCenterDefaultView = (user: UserInfo | null | undefined): ViewType | 'dashboard' => {
  const access = getUserAccess(user);
  if (access.platformRole === 'super_admin') {
    return 'user-mgmt-access';
  }
  if (access.platformRole === 'ordinary_admin') {
    return 'org-mgmt-members';
  }
  return 'dashboard';
};

export const getPlatformRoleLabel = (platformRole: PlatformRole): string => {
  if (platformRole === 'super_admin') return '超级管理员';
  if (platformRole === 'ordinary_admin') return '普通管理员';
  if (platformRole === 'developer') return '开发者';
  return '普通用户';
};
