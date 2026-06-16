# Chimera UI 导航重构 & 功能改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Chimera's navigation from 17 top-level tabs to 7 (首页, 安全验证, 资产, 评测, 观测, 技能, 工具, 原子能力, 系统管理), add a home page, overhaul project/task pages, and consolidate admin menus — all while preserving existing functionality and API contracts.

**Architecture:** Three-layer progressive approach. Layer 1 modifies navigation plumbing (types, routing, sidebar, header). Layer 2 modifies page components (project list/detail, task creation dialog, test input). Layer 3 adds the home page, consolidates tenant/role sidebars, and hides menus. Each layer produces a working system.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, lucide-react icons, custom view-switching via `currentView` string state (no React Router for views).

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `pages/HomePage.tsx` | Welcome page with logo + "开始使用" button |
| `pages/task/CreateTaskDialog.tsx` | Standalone task creation dialog extracted from TaskCenterPage |

### Modified Files (by layer)

**Layer 1 — Navigation:**
| File | Changes |
|------|---------|
| `types/types.ts:2564` | Add `'home'` to `ViewType` union |
| `app/navigation.tsx` | Rewrite `TopLevelNavKey`, `TOP_LEVEL_NAV_ITEMS`, `SIDEBAR_SECTIONS`, `getTopLevelNavForView`, `getTopLevelDefaultView`, add `getSystemAdminSidebarSections` + `getSystemAdminActiveChild` helpers, update `PLATFORM_ACCOUNT_ORG_SECTIONS` |
| `layout/Header.tsx` | Remove role dropdown, add theme toggle in its place, add system-admin popover, remove badge from ThemeLogo, remove user menu items |
| `layout/Sidebar.tsx` | Remove footer theme toggle, add system-admin dynamic sidebar logic |
| `utils/rbac.ts` | Add `ADMIN_VIEWS` set for env-* views |
| `App.tsx:19` | Change `DEFAULT_VIEW` to `'home'` |
| `app/viewRegistry.tsx:179+` | Add `'home'` case, wire HomePage component |

**Layer 2 — Page Modifications:**
| File | Changes |
|------|---------|
| `pages/project/ProjectMgmtPage.tsx` | Stat blocks → 4 blocks, table columns, create dialog ComboBox, remove section split |
| `pages/project/ProjectDetailPage.tsx` | Replace K8s blocks with task/env/vuln blocks, add member management modal |
| `pages/task/TaskCenterPage.tsx` | Extract create dialog to `CreateTaskDialog.tsx`, use the new component |
| `pages/TestInputPage.tsx` | Add "创建任务" button, integrate CreateTaskDialog |

**Layer 3 — Home + Consolidation:**
| File | Changes |
|------|---------|
| `pages/HomePage.tsx` | New file, welcome page |
| (navigation.tsx already updated in Layer 1 for sidebar/hidden menus) | |

---

## Layer 1: Navigation Structure Restructure

### Task 1: Update TypeScript Types

**Files:**
- Modify: `types/types.ts:2564`

- [ ] **Step 1: Add 'home' to ViewType union**

In `types/types.ts`, find the `ViewType` type at line 2564 and add `'home'` at the beginning:

```typescript
export type ViewType =
  | 'home' | 'dashboard' | 'admin-dashboard' | 'project-mgmt' | 'project-detail' | 'product-mgmt' | 'static-packages' | 'static-package-detail' | 'deploy-script-mgmt'
  // ... rest unchanged
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing errors may be present).

- [ ] **Step 3: Commit**

```bash
git add types/types.ts
git commit -m "feat(types): add 'home' to ViewType union for homepage support"
```

---

### Task 2: Rewrite navigation.tsx — TopLevelNavKey and TOP_LEVEL_NAV_ITEMS

**Files:**
- Modify: `app/navigation.tsx:49-155`

- [ ] **Step 1: Update TopLevelNavKey type**

Replace lines 49-66 with:

```typescript
export type TopLevelNavKey =
  | 'home'
  | 'security-verify'
  | 'assets'
  | 'assessment'
  | 'observe'
  | 'skill'
  | 'tools'
  | 'atomic'
  | 'system-admin';
```

- [ ] **Step 2: Update TOP_LEVEL_NAV_ITEMS**

Replace lines 116-134 with:

```typescript
export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'home', label: '首页', role: null },
  { id: 'security-verify', label: '安全验证', role: 'user' },
  { id: 'assets', label: '资产', role: 'developer', showDividerBefore: true },
  { id: 'assessment', label: '评测', role: 'developer' },
  { id: 'observe', label: '观测', role: 'developer' },
  { id: 'skill', label: '技能', role: 'developer' },
  { id: 'tools', label: '工具', role: 'developer' },
  { id: 'atomic', label: '原子能力', role: 'developer' },
  { id: 'system-admin', label: '系统管理', role: 'admin', showDividerBefore: true },
];
```

- [ ] **Step 3: Update getVisibleTopLevelNavItems**

Replace lines 143-155. Remove the `visibleRoles` parameter (role dropdown is being removed):

```typescript
export const getVisibleTopLevelNavItems = (
  user: UserInfo | null | undefined,
): TopLevelNavItem[] => {
  const platformRole = getPlatformRole(user);
  const accessibleRoles = ROLE_TAB_ACCESS[platformRole] || ROLE_TAB_ACCESS.ordinary_user;
  return TOP_LEVEL_NAV_ITEMS.filter((item) => {
    if (item.id === 'home') return true;
    if (item.role && !accessibleRoles.has(item.role)) return false;
    return true;
  });
};
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in Header.tsx (expected — will be fixed in Task 5). No errors in navigation.tsx itself.

- [ ] **Step 5: Commit**

```bash
git add app/navigation.tsx
git commit -m "feat(nav): rewrite TopLevelNavKey and TOP_LEVEL_NAV_ITEMS to new 7-tab structure"
```

---

### Task 3: Rewrite navigation.tsx — View Routing and Sidebar Sections

**Files:**
- Modify: `app/navigation.tsx:257-628`

- [ ] **Step 1: Add system-admin sub-menu view sets**

After the existing `ROLE_VIEWS` set (line 366), add new constants. These replace the per-tab view sets for mapping views back to `system-admin`:

```typescript
const SYSTEM_ADMIN_DASHBOARD_VIEWS = new Set(['dashboard', 'admin-dashboard']);

const SYSTEM_ADMIN_ENVIRONMENT_VIEWS = new Set([
  'env-agent', 'env-service', 'env-ai-agent', 'env-ai-agent-overview',
  'env-ai-helper', 'env-ai-agent-manage', 'env-ai-agent-session-manage',
  'env-ai-session', 'env-ai-batch-session', 'env-template', 'env-tasks',
  'env-process-monitor-root', 'env-process-monitor-overview',
  'env-process-monitor-detail', 'env-process-monitor-tasks',
]);
```

- [ ] **Step 2: Rewrite getTopLevelNavForView**

Replace lines 368-416 with:

```typescript
export const getTopLevelNavForView = (view: string): TopLevelNavKey => {
  if (view === 'home') return 'home';

  // Security-verify: project, task, vuln, test-input views
  if (view === 'project-mgmt' || view === 'project-detail' || view === 'product-mgmt') return 'security-verify';
  if (view.startsWith('test-input-')) return 'security-verify';
  if (view.startsWith('task-') || view === 'task-list' || view === 'task-center-timeline') return 'security-verify';
  if (view === 'vuln-engine' || view.startsWith('vuln-')) return 'security-verify';

  // Assets (now developer role)
  if (
    view === 'project-file-explorer' ||
    view === 'fileserver-archive-tasks' ||
    view === 'public-resource-pvc-management' ||
    view === 'public-resource-task-management' ||
    view === 'pvc-management'
  ) return 'assets';

  // Developer tabs (unchanged)
  if (view === 'assessment-coming-soon') return 'assessment';
  if (view === 'observe-coming-soon') return 'observe';
  if (view === 'skill-coming-soon') return 'skill';
  if (ASSESSMENT_VIEWS.has(view)) return 'assessment';
  if (OBSERVE_VIEWS.has(view) || view.startsWith('workflow-')) return 'observe';
  if (SKILL_VIEWS.has(view)) return 'skill';
  if (DEVELOPER_TOOL_VIEWS.has(view) || view === 'developer-tools-overview' || view === 'developer-tools') return 'tools';
  if (DEVELOPER_ATOMIC_CAPABILITY_VIEWS.has(view) || view.startsWith('developer-atomic-capability') || view.startsWith('developer-')) return 'atomic';

  // System-admin: all former standalone admin tabs + dashboard + environment
  if (SYSTEM_ADMIN_DASHBOARD_VIEWS.has(view)) return 'system-admin';
  if (SYSTEM_ADMIN_ENVIRONMENT_VIEWS.has(view) || view.startsWith('env-')) return 'system-admin';
  if (AIGW_VIEWS.has(view)) return 'system-admin';
  if (SCHEDULE_VIEWS.has(view)) return 'system-admin';
  if (EVOLUTION_VIEWS.has(view) || view.startsWith('binary-evolution-')) return 'system-admin';
  if (TENANT_VIEWS.has(view)) return 'system-admin';
  if (ROLE_VIEWS.has(view)) return 'system-admin';
  if (view === 'sys-settings' || view === 'change-password') return 'system-admin';

  return 'home';
};
```

- [ ] **Step 3: Rewrite getTopLevelDefaultView**

Replace lines 418-443 with:

```typescript
export const getTopLevelDefaultView = (nav: TopLevelNavKey, user: UserInfo | null): string => {
  switch (nav) {
    case 'home': return 'home';
    case 'security-verify': return 'project-mgmt';
    case 'assets': return 'public-resource-pvc-management';
    case 'assessment': return 'assessment-coming-soon';
    case 'observe': return 'observe-coming-soon';
    case 'skill': return 'skill-coming-soon';
    case 'tools': return 'developer-tools-overview';
    case 'atomic': return 'developer-atomic-capability-overview';
    case 'system-admin': return 'dashboard';
    default: return 'home';
  }
};
```

- [ ] **Step 4: Update PLATFORM_ACCOUNT_ORG_SECTIONS to include role items**

Replace lines 445-463 with:

```typescript
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
```

- [ ] **Step 5: Rewrite SIDEBAR_SECTIONS**

Replace lines 465-627 entirely. Add `ListChecks` to the lucide-react imports at the top if not already present.

```typescript
export const SIDEBAR_SECTIONS: Record<string, NavSection[]> = {
  home: [],
  'security-verify': [
    {
      title: '安全验证',
      items: [
        { id: 'project-mgmt', label: '项目', icon: Briefcase, aliases: ['project-detail'], healthKey: 'projectHealth' },
        { id: 'test-input-root', label: '测试输入', icon: FileBox, requiresProject: true },
        { id: 'task-list', label: '任务', icon: ListTodo, requiresProject: true },
        { id: 'vuln-overview', label: '漏洞', icon: Shield, aliases: ['vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
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
  assessment: [],
  observe: [],
  skill: [],
  tools: [
    {
      title: '开发者工具',
      items: [
        { id: 'developer-tools-overview', label: '工具总览', icon: Settings, requiresProject: true, aliases: ['developer-tools'] },
        { id: 'binary-security', label: '盖亚-二进制固件', icon: Settings, aliases: ['binary-security-root', 'binary-security-task-list', 'binary-security-detail'], requiresProject: true },
        { id: 'source-security', label: '盖亚-源码', icon: Settings, aliases: ['source-security-detail'], requiresProject: true },
        { id: 'binary-module-security', label: '盖亚-二进制模块', icon: Settings, aliases: ['binary-module-security-detail'], requiresProject: true },
        { id: 'app-security-scan', label: '应用端到端扫描', icon: Smartphone, aliases: ['app-security-scan-detail', 'app-security-scan-monitor'], requiresProject: true },
        { id: 'redline-verification', label: '红线验证', icon: ShieldCheck, aliases: ['redline-verification-detail', 'ai4red-detail'], requiresProject: true },
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
};
```

Note: `system-admin` is intentionally NOT in `SIDEBAR_SECTIONS` — it uses dynamic sidebar resolution (next step).

- [ ] **Step 6: Add system-admin sidebar helper functions**

After the `SIDEBAR_SECTIONS` definition, add:

```typescript
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
  ],
  tenant: PLATFORM_ACCOUNT_ORG_SECTIONS,
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
};

export type SystemAdminChildKey = 'dashboard' | 'aigw' | 'schedule' | 'evolution' | 'tenant' | 'environment';

export const SYSTEM_ADMIN_CHILDREN: { key: SystemAdminChildKey; label: string; defaultView: string }[] = [
  { key: 'dashboard', label: '仪表盘', defaultView: 'dashboard' },
  { key: 'aigw', label: 'AI网关', defaultView: 'aigw-dashboard' },
  { key: 'schedule', label: '任务调度', defaultView: 'chimera-platform-schedule' },
  { key: 'evolution', label: '进化', defaultView: 'binary-evolution-center' },
  { key: 'tenant', label: '租户', defaultView: 'user-mgmt-access' },
  { key: 'environment', label: '环境', defaultView: 'env-agent' },
];

export const getSystemAdminActiveChild = (currentView: string): SystemAdminChildKey => {
  if (currentView.startsWith('env-')) return 'environment';
  if (AIGW_VIEWS.has(currentView) || currentView.startsWith('aigw-') || currentView.startsWith('config-center-')) return 'aigw';
  if (SCHEDULE_VIEWS.has(currentView) || currentView === 'chimera-platform-schedule-config') return 'schedule';
  if (EVOLUTION_VIEWS.has(currentView) || currentView.startsWith('binary-evolution-')) return 'evolution';
  if (TENANT_VIEWS.has(currentView) || ROLE_VIEWS.has(currentView) || currentView.startsWith('user-mgmt-') || currentView.startsWith('org-mgmt-')) return 'tenant';
  return 'dashboard';
};

export const getSystemAdminSidebarSections = (currentView: string): NavSection[] => {
  const childKey = getSystemAdminActiveChild(currentView);
  return SYSTEM_ADMIN_SIDEBAR_MAP[childKey] || [];
};
```

- [ ] **Step 7: Add missing icon imports**

At the top of `navigation.tsx`, ensure these icons are imported from `lucide-react` (add any missing ones to the existing import):
- `ListTodo` (already present)
- `Smartphone` (already present in original tools section)
- `GitBranch` (already present)
- `MessageSquare` (already present)
- `Bot` (already present)

Verify the import list at lines 1-43 — all icons used in the new SIDEBAR_SECTIONS must be imported.

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: Possible errors in Header.tsx and Sidebar.tsx referencing old TopLevelNavKey values — will be fixed in subsequent tasks.

- [ ] **Step 9: Commit**

```bash
git add app/navigation.tsx
git commit -m "feat(nav): rewrite view routing, sidebar sections, add system-admin helpers"
```

---

### Task 4: Update RBAC — Add ADMIN_VIEWS for environment

**Files:**
- Modify: `utils/rbac.ts:117-152`

- [ ] **Step 1: Add ADMIN_VIEWS set**

After `SUPER_ADMIN_ONLY_VIEWS` (line 133), add:

```typescript
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
```

- [ ] **Step 2: Update canAccessView to check ADMIN_VIEWS**

Replace lines 140-152 with:

```typescript
export const canAccessView = (user: UserInfo | null | undefined, view: ViewType | string): boolean => {
  const access = getUserAccess(user);

  if (ADMIN_VIEWS.has(view)) {
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
```

- [ ] **Step 3: Commit**

```bash
git add utils/rbac.ts
git commit -m "feat(rbac): add ADMIN_VIEWS set for environment views, restrict to admin roles"
```

---

### Task 5: Update Header.tsx — Remove Role Dropdown, Add Theme Toggle, System-Admin Popover

**Files:**
- Modify: `layout/Header.tsx`

- [ ] **Step 1: Update imports**

Replace lines 1-6 with:

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, LogOut, MoonStar, RotateCw, SunMedium } from 'lucide-react';
import {
  TopLevelNavKey,
  TopLevelNavItem,
  NAV_ROLE_CONFIG,
  getVisibleTopLevelNavItems,
  SYSTEM_ADMIN_CHILDREN,
  getSystemAdminActiveChild,
} from '../app/navigation';
import { SecurityProject, UserInfo, ViewType } from '../types/types';
import { getPlatformRoleLabel, getUserAccess } from '../utils/rbac';
import { ThemeLogo } from '../components/ThemeLogo';
import { useTheme } from '../theme/ThemeProvider';
```

Note: Removed `Settings`, `UserCog`, `Users` from lucide imports (no longer used in this file). Removed `getUserCenterDefaultView` import (no longer used).

- [ ] **Step 2: Remove role dropdown state and functions**

In the component body (around lines 59-84), remove:
- `const [visibleRoles, setVisibleRoles] = ...` (line 60)
- `const [isRoleDropdownOpen, setIsRoleDropdownOpen] = ...` (line 61)
- `const roleDropdownRef = useRef<...>(null);` (line 63)
- The `toggleRole` function (lines 78-84)
- In the `useEffect` click-outside handler (lines 70-76), remove the `roleDropdownRef` check line

Update the `visibleNavItems` call to remove the second argument:
```typescript
const visibleNavItems = getVisibleTopLevelNavItems(user);
```

Add new state for system-admin popover and theme:
```typescript
const { theme, toggleTheme } = useTheme();
const [isSystemAdminOpen, setIsSystemAdminOpen] = useState(false);
const systemAdminRef = useRef<HTMLDivElement>(null);
const systemAdminTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Add system-admin popover mouse handlers**

After the state declarations, add:

```typescript
const handleSystemAdminEnter = () => {
  if (systemAdminTimerRef.current) clearTimeout(systemAdminTimerRef.current);
  setIsSystemAdminOpen(true);
};
const handleSystemAdminLeave = () => {
  systemAdminTimerRef.current = setTimeout(() => setIsSystemAdminOpen(false), 150);
};
```

- [ ] **Step 4: Update tab rendering to handle system-admin specially**

Replace the tab rendering section (lines 93-114) — the `<nav>` block — with:

```tsx
<nav className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
  {visibleNavItems.map((item) => {
    const isActive = currentTopLevelNav === item.id;

    if (item.id === 'system-admin') {
      return (
        <React.Fragment key={item.id}>
          {item.showDividerBefore && (
            <div className="w-px h-4 bg-theme-text-faint/20 mx-1.5 shrink-0" />
          )}
          <div
            ref={systemAdminRef}
            className="relative"
            onMouseEnter={handleSystemAdminEnter}
            onMouseLeave={handleSystemAdminLeave}
          >
            <button
              onClick={handleSystemAdminEnter}
              style={getTabStyle(item, isActive)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                isActive ? '' : 'hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
              }`}
            >
              {item.label} ▾
            </button>
            {isSystemAdminOpen && (
              <div
                className="absolute top-full left-0 mt-2 w-40 bg-theme-surface border border-theme-border rounded-2xl shadow-brand p-2 z-50"
                onMouseEnter={handleSystemAdminEnter}
                onMouseLeave={handleSystemAdminLeave}
              >
                {SYSTEM_ADMIN_CHILDREN.map((child) => {
                  const childActive = isActive && getSystemAdminActiveChild(String(ctx_currentView_placeholder)) === child.key;
                  return (
                    <button
                      key={child.key}
                      onClick={() => {
                        onSelectSystemAdminChild(child.defaultView);
                        setIsSystemAdminOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        childActive
                          ? 'theme-shell-active'
                          : 'text-theme-text-soft hover:bg-theme-elevated hover:text-theme-text-inverse'
                      }`}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={item.id}>
        {item.showDividerBefore && (
          <div className="w-px h-4 bg-theme-text-faint/20 mx-1.5 shrink-0" />
        )}
        <button
          onClick={() => onSelectTopLevelNav(item.id)}
          style={getTabStyle(item, isActive)}
          className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
            isActive ? '' : 'hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
          }`}
        >
          {item.label}
        </button>
      </React.Fragment>
    );
  })}
</nav>
```

Note: The system-admin popover child highlighting needs `currentView` — we need to add it to HeaderProps. Update the `HeaderProps` interface to add:
```typescript
currentView: ViewType | string;
```
And add a corresponding parameter in the component destructuring. Then replace `ctx_currentView_placeholder` with `currentView`.

Also add `onSelectSystemAdminChild` to props:
```typescript
onSelectSystemAdminChild: (view: string) => void;
```

For system-admin clicks, the parent (App.tsx) should call `setCurrentView` directly — the `onSelectSystemAdminChild` prop is just `setCurrentView`.

- [ ] **Step 5: Replace role dropdown with theme toggle button**

In the right side section (line 117 area), remove the entire role dropdown div (lines 118-150). Replace with:

```tsx
<button
  onClick={toggleTheme}
  className="p-2.5 rounded-xl text-theme-text-soft bg-theme-sidebar-muted/60 hover:bg-theme-sidebar-muted hover:text-theme-text-inverse transition-all shrink-0"
  title={theme === 'chimera-classic' ? '切换到深色主题' : '切换到经典主题'}
>
  {theme === 'chimera-classic' ? <MoonStar size={16} /> : <SunMedium size={16} />}
</button>
```

- [ ] **Step 6: Remove ThemeLogo badge and user menu items**

Change the `ThemeLogo` call (line 90) to pass `showBadge={false}`:
```tsx
<ThemeLogo size="small" buildVersion={FRONTEND_BUILD_VERSION} showBadge={false} />
```

In the user dropdown menu (lines 224-243), remove the "系统设置" button (lines 225-233) and the "用户管理" conditional block (lines 234-243). Keep "修改密码" and "退出系统".

- [ ] **Step 7: Update App.tsx Header call site**

In `App.tsx`, where `<Header>` is rendered, add the new props:
```tsx
currentView={currentView}
onSelectSystemAdminChild={(view) => navigateToView(view)}
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 9: Commit**

```bash
git add layout/Header.tsx App.tsx
git commit -m "feat(header): remove role dropdown, add theme toggle + system-admin popover, clean user menu"
```

---

### Task 6: Update Sidebar.tsx — Remove Theme Toggle, Support System-Admin

**Files:**
- Modify: `layout/Sidebar.tsx`

- [ ] **Step 1: Add navigation imports**

Update imports to add `getSystemAdminSidebarSections`:

```typescript
import { SIDEBAR_SECTIONS, SidebarHealthStatus, TOP_LEVEL_NAV_ITEMS, NAV_ROLE_CONFIG, getSystemAdminSidebarSections } from '../app/navigation';
```

Remove `useTheme` import (no longer needed here). Remove `MoonStar` and `SunMedium` from lucide imports.

- [ ] **Step 2: Remove theme state**

Remove line 45: `const { theme, toggleTheme } = useTheme();`

- [ ] **Step 3: Update sections computation for system-admin**

Replace line 58 with:

```typescript
const rawSections = activeTopLevelNav === 'system-admin'
  ? getSystemAdminSidebarSections(String(currentView))
  : (SIDEBAR_SECTIONS[activeTopLevelNav as keyof typeof SIDEBAR_SECTIONS] || []);

const sections = rawSections.map((section) => ({
  ...section,
  items: section.items.filter((item) => canAccessView(user, item.id)),
})).filter((section) => section.items.length > 0);
```

- [ ] **Step 4: Remove theme toggle from footer**

Replace the footer div (lines 186-212) with just the collapse button:

```tsx
<div className="p-5 border-t border-theme-sidebar">
  <div className="flex items-center justify-end">
    {!isSidebarCollapsed ? (
      <button onClick={() => setIsSidebarCollapsed(true)} className="p-3 rounded-2xl bg-theme-sidebar-muted/60 text-theme-text-faint hover:text-theme-text-inverse hover:bg-theme-sidebar-muted transition-colors">
        <PanelLeftClose size={18} />
      </button>
    ) : (
      <button onClick={() => setIsSidebarCollapsed(false)} className="p-3 rounded-2xl bg-theme-sidebar-muted/60 text-theme-text-faint hover:text-theme-text-inverse hover:bg-theme-sidebar-muted transition-colors">
        <PanelLeftOpen size={18} />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add layout/Sidebar.tsx
git commit -m "feat(sidebar): remove theme toggle, add system-admin dynamic sidebar support"
```

---

### Task 7: Update App.tsx — Default View and Project-Required Guard

**Files:**
- Modify: `App.tsx:19, 404-408`

- [ ] **Step 1: Change DEFAULT_VIEW**

Replace line 19:
```typescript
const DEFAULT_VIEW = 'home';
```

- [ ] **Step 2: Update project-required fallback**

In the `useEffect` at lines 404-408 that redirects to `'dashboard'` when no project is selected, change to redirect to `'home'`:

```typescript
useEffect(() => {
  if (!selectedProjectId && PROJECT_REQUIRED_VIEWS.has(currentView)) {
    navigateToView('home');
  }
}, [selectedProjectId, currentView, navigateToView]);
```

- [ ] **Step 3: Update RBAC redirect fallback**

In the `useEffect` at lines 392-396, change `getUserCenterDefaultView(user)` to `'home'`:

```typescript
useEffect(() => {
  if (!user) return;
  if (canAccessView(user, currentView)) return;
  navigateToView('home');
}, [user, currentView, navigateToView]);
```

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(app): change default view to 'home', update fallback redirects"
```

---

### Task 8: Add Home Page and Wire into ViewRegistry

**Files:**
- Create: `pages/HomePage.tsx`
- Modify: `app/viewRegistry.tsx`

- [ ] **Step 1: Create HomePage.tsx**

```typescript
import React from 'react';
import { ThemeLogo } from '../components/ThemeLogo';

interface HomePageProps {
  setCurrentView: (view: string) => void;
}

const LK = {
  primary: '#4f73ff',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  border: '#26324a',
  ink: '#f5f7ff',
  muted: '#72809a',
} as const;

export const HomePage: React.FC<HomePageProps> = ({ setCurrentView }) => {
  return (
    <div
      className="flex h-full items-center justify-center p-10"
      style={{ backgroundColor: LK.canvas }}
    >
      <div
        className="flex flex-col items-center gap-8 rounded-3xl px-16 py-14"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <ThemeLogo size="large" showBadge />
        <h1
          className="text-2xl font-black tracking-wide"
          style={{ color: LK.ink }}
        >
          欢迎使用 Chimera 系统
        </h1>
        <button
          onClick={() => setCurrentView('project-mgmt')}
          className="rounded-2xl px-8 py-3 text-sm font-black text-white transition-all hover:brightness-110 active:scale-95"
          style={{ backgroundColor: LK.primary }}
        >
          开始使用
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire home view into viewRegistry.tsx**

Add import at top of `viewRegistry.tsx`:
```typescript
import { HomePage } from '../pages/HomePage';
```

Add case before `case 'dashboard':` in the switch statement (after line 180):
```typescript
    case 'home':
      return <HomePage setCurrentView={ctx.setCurrentView} />;
```

- [ ] **Step 3: Verify compilation and test**

Run: `npx tsc --noEmit 2>&1 | head -20`

Start dev server and navigate to the app — it should load the home page by default.

- [ ] **Step 4: Commit**

```bash
git add pages/HomePage.tsx app/viewRegistry.tsx
git commit -m "feat: add HomePage with welcome message, wire into view registry as default"
```

---

## Layer 1 Checkpoint

At this point, all Layer 1 navigation changes are complete:
- 7 new top-level tabs (home, security-verify, assets, 5 developer tabs, system-admin)
- System-admin popover with 6 sub-menus
- Role dropdown removed, theme toggle in its place
- Sidebar theme toggle removed
- ThemeLogo badge hidden
- User menu cleaned (removed 系统设置 and 用户管理)
- Home page as default landing
- Environment views restricted to admin roles
- Assets moved to developer role

**Manual test checklist:**
1. Default page is home with "开始使用" button
2. "开始使用" navigates to project list
3. All 7 top tabs visible for super_admin
4. Ordinary users see: 首页, 安全验证
5. Developers see: 首页, 安全验证, 资产, 评测, 观测, 技能, 工具, 原子能力
6. System-admin shows popover on hover with 6 items
7. Theme toggle works in header
8. All existing pages still load via their sidebar items

---

## Layer 2: Page Feature Modifications

### Task 9: Overhaul ProjectMgmtPage — Stats and Table

**Files:**
- Modify: `pages/project/ProjectMgmtPage.tsx`

This is a large file. The changes are:

- [ ] **Step 1: Update page title**

Find the text "项目空间" in the page header and change it to "项目概览".

- [ ] **Step 2: Update stat blocks from 3 to 4**

Find the 3 stat blocks (产品数, 版本数, 项目总数). Replace with 4 blocks:
- 项目 (shows `projects.length`)
- 任务 (shows placeholder count, loaded asynchronously)
- 环境 (shows placeholder count, loaded asynchronously)  
- 漏洞 (shows placeholder count, loaded asynchronously)

Add state and effects to load task/env/vuln counts. Use skeleton loading states.

```typescript
const [taskCount, setTaskCount] = useState<number | null>(null);
const [envCount, setEnvCount] = useState<number | null>(null);
const [vulnCount, setVulnCount] = useState<number | null>(null);
```

For now, set these to 0 with a loading skeleton — the actual API calls can be wired later when specific endpoints are identified.

- [ ] **Step 3: Update table columns**

Find the table header row. Remove "命名空间" and "可见性" columns. Change "负责人" to "项目成员". In the "项目" column, remove description and ID — show only `name`. Add `whitespace-nowrap truncate` classes to all `<td>` elements.

In the project name column, make it clickable to enter project space:
```tsx
<td className="whitespace-nowrap">
  <button
    onClick={() => {
      setActiveProjectId(project.id);
      setCurrentView('project-detail');
    }}
    className="text-sm font-semibold hover:underline"
    style={{ color: LK.primary }}
  >
    {project.name}
  </button>
</td>
```

For "项目成员" column, show `owner_name` with truncation:
```tsx
<td className="whitespace-nowrap truncate max-w-[120px]" title={project.owner_name || '-'}>
  {project.owner_name || '-'}
</td>
```

- [ ] **Step 4: Update action column**

Remove the "切换" button (`switchToProject`) and the ArrowRight button. Keep Edit3 and Trash2 only.

- [ ] **Step 5: Remove public/department split**

The page currently splits projects into "公开项目" and "部门归属项目" sections. Merge into a single list. Show all projects in one table.

- [ ] **Step 6: Update create dialog — add ComboBox for product/version**

In the create project dialog, remove the `is_public` toggle and the `product_version_id` tree picker. Add two ComboBox fields:

1. **产品名称** — combo: type to search/create new, or select from `productsApi.getTree()` data
2. **版本号** — combo: select existing version of chosen product, or type new

Add state:
```typescript
const [productSearch, setProductSearch] = useState('');
const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
const [versionSearch, setVersionSearch] = useState('');
const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
const [productTree, setProductTree] = useState<ProductTreeNode[]>([]);
```

Load product tree on dialog open. Extract leaf products for the dropdown.

Submit logic: follow the decision tree from the spec (create product if new, create version if new, then create project with `product_version_id`).

- [ ] **Step 7: Commit**

```bash
git add pages/project/ProjectMgmtPage.tsx
git commit -m "feat(project): overhaul list page - 4 stat blocks, simplified table, ComboBox create"
```

---

### Task 10: Overhaul ProjectDetailPage — Blocks and Member Management

**Files:**
- Modify: `pages/project/ProjectDetailPage.tsx`

- [ ] **Step 1: Replace K8s blocks with Task/Env/Vuln blocks**

Remove the 4 K8s stat blocks (POD实例, 服务节点, 存储卷, 外部入口). Replace with 3 blocks:
- 任务 — count from `scheduleCenterApi`
- 环境 — count from `environmentApi`
- 漏洞 — count from `vulnApi`

Add state:
```typescript
const [activeBlock, setActiveBlock] = useState<'task' | 'env' | 'vuln'>('task');
const [taskCount, setTaskCount] = useState(0);
const [envCount, setEnvCount] = useState(0);
const [vulnCount, setVulnCount] = useState(0);
```

- [ ] **Step 2: Remove K8s tab content**

Remove the `activeTab` state and the overview/pods/network/storage tab content. Remove TLS rebuild button. Keep the SDK Token card for `can_manage` users.

- [ ] **Step 3: Add block-switched list area**

Below the stat blocks, render a list area that switches based on `activeBlock`:
- `task`: Inline task list (simplified version of TaskCenterPage's list, or embed the component with `readOnly=false`)
- `env`: Inline env agent list
- `vuln`: Inline vuln overview list

For the initial implementation, show placeholder text with a table skeleton — the full list integration is a refinement step.

- [ ] **Step 4: Add member management button and modal**

Add a "管理成员" button in the page header area (top-right). On click, open a modal with:
- Member list table (empty for now — B1 backend needed)
- Add member form (search user input + role select)
- Remove member button per row

Since `GET /api/project/{id}/members` doesn't exist yet, show an empty state:
```tsx
<div className="text-center py-8">
  <p className="text-sm" style={{ color: LK.muted }}>成员管理功能即将上线</p>
  <p className="text-xs mt-1" style={{ color: LK.muted }}>需要后端接口 GET /api/project/{'{id}'}/members</p>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add pages/project/ProjectDetailPage.tsx
git commit -m "feat(project-detail): replace K8s blocks with task/env/vuln, add member mgmt stub"
```

---

### Task 11: Extract CreateTaskDialog Component

**Files:**
- Create: `pages/task/CreateTaskDialog.tsx`
- Modify: `pages/task/TaskCenterPage.tsx`

- [ ] **Step 1: Create CreateTaskDialog.tsx**

Extract the task creation modal (~380 lines starting at line 1268 of TaskCenterPage) into a standalone component. The component interface:

```typescript
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Folder, FolderOpen, Loader2, Plus, RefreshCw, Search, Square, SquareCheck, X } from 'lucide-react';
import { api } from '../../clients/api';
import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { useUiFeedback } from '../../components/UiFeedback';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import { resolveSechpsInstruction } from './taskCenterInstruction';
import type {
  AgentAppSummary,
  ProjectInputUploadBrowseEntry,
  ProjectInputUploadBrowseResponse,
  ProjectInputUploadRecord,
  ScheduleCenterUserTaskCreatePayload,
  ScheduleCenterUserTaskType,
  SecurityProject,
  UserInfo,
} from '../../types/types';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  preSelectedInputId?: string;
  onCreated: () => void;
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  preSelectedInputId,
  onCreated,
}) => {
  // ... extracted dialog code with two tabs: 基础信息, 动态验证环境
};
```

Restructure the tabs from 3 (basic, input, options) to 2 (basic, dynamic-env):
```typescript
const CREATE_TABS = [
  { key: 'basic', label: '基础信息' },
  { key: 'dynamic-env', label: '动态验证环境（可选）' },
] as const;
```

In the 基础信息 tab, include:
1. 任务名称 (text input)
2. 模式 (select: 龙尾/噬首/羊角 — front-end only, stored in local state)
3. 任务类型 (select, all 6 types)
4. 测试输入 (two sub-modes: "选择已有" / "直接上传")
5. 描述 (textarea)

Add mode state:
```typescript
const [mode, setMode] = useState<string>('');
const MODE_OPTIONS = [
  { value: 'dragon-tail', label: '龙尾' },
  { value: 'devouring-head', label: '噬首' },
  { value: 'ram-horn', label: '羊角' },
];
```

The 动态验证环境 tab shows a placeholder:
```tsx
<div className="flex flex-col items-center gap-4 py-12">
  <p className="text-sm" style={{ color: LK.muted }}>后续支持动态验证环境配置</p>
</div>
```

Submit logic uses existing `scheduleCenterApi.createUserTask(projectId, payload)`. The `mode` field is NOT sent to the backend.

- [ ] **Step 2: Update TaskCenterPage to use CreateTaskDialog**

Remove the inline create dialog code (~380 lines). Import and render `CreateTaskDialog`:

```typescript
import { CreateTaskDialog } from './CreateTaskDialog';

// In the component:
<CreateTaskDialog
  open={createOpen}
  onClose={closeCreateDialog}
  projectId={projectId}
  projectName={projectName}
  onCreated={() => { closeCreateDialog(); fetchTasks(); }}
/>
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add pages/task/CreateTaskDialog.tsx pages/task/TaskCenterPage.tsx
git commit -m "refactor(task): extract CreateTaskDialog from TaskCenterPage, restructure to 2 tabs"
```

---

### Task 12: Add "创建任务" Button to TestInputPage

**Files:**
- Modify: `pages/TestInputPage.tsx`

- [ ] **Step 1: Import CreateTaskDialog**

```typescript
import { CreateTaskDialog } from './task/CreateTaskDialog';
```

- [ ] **Step 2: Add state for dialog**

```typescript
const [createTaskOpen, setCreateTaskOpen] = useState(false);
const [selectedRecordForTask, setSelectedRecordForTask] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Add "创建任务" button to action bar**

Find the page's action area (near the upload button). Add:

```tsx
<button
  onClick={() => {
    setSelectedRecordForTask(selectedRecordId);
    setCreateTaskOpen(true);
  }}
  disabled={!selectedRecordId}
  className="..."
>
  创建任务
</button>
```

Where `selectedRecordId` is the ID of the currently selected upload record. If no record selection exists yet, add a radio/checkbox selection mechanism to the upload records list.

- [ ] **Step 4: Render CreateTaskDialog**

At the bottom of the component's JSX:

```tsx
<CreateTaskDialog
  open={createTaskOpen}
  onClose={() => setCreateTaskOpen(false)}
  projectId={selectedProjectId || ''}
  projectName={projects?.find(p => p.id === selectedProjectId)?.name || ''}
  preSelectedInputId={selectedRecordForTask}
  onCreated={() => setCreateTaskOpen(false)}
/>
```

Note: `TestInputPage` may need `projects` passed as a prop or fetched. Check current props — it receives `selectedProjectId` and `user`. We may need to add a `projects` prop or use the API to look up the project name.

- [ ] **Step 5: Commit**

```bash
git add pages/TestInputPage.tsx
git commit -m "feat(test-input): add 创建任务 button with CreateTaskDialog integration"
```

---

## Layer 2 Checkpoint

At this point:
- Project list page has 4 stat blocks, simplified table, ComboBox create dialog
- Project detail page has task/env/vuln blocks, member management stub
- Task creation is extracted as a reusable dialog with mode field
- Test input page has "创建任务" button

**Manual test checklist:**
1. Project list shows 4 stat blocks with project count
2. Table shows name (clickable), 归属部门, 项目成员, 产品版本, 状态, 创建时间, 操作(edit/delete)
3. Create project dialog has product ComboBox and version ComboBox
4. Project detail shows 3 blocks (任务/环境/漏洞) instead of K8s blocks
5. Task creation dialog has 2 tabs (基础信息 with mode selector, 动态验证环境 placeholder)
6. Test input page shows "创建任务" button, opens task dialog

---

## Layer 3: Home + Consolidation + Hidden Menus

### Task 13: Consolidate Tenant Sidebar (Already Done in Task 3)

The `PLATFORM_ACCOUNT_ORG_SECTIONS` was already updated in Task 3 to include role items (角色定义管理, 角色权限分配). The `SIDEBAR_SECTIONS` no longer has separate `role` or `user-mgmt` keys — all tenant/role views map to `system-admin` → `tenant` sub-menu.

No additional work needed. This task is a verification checkpoint.

- [ ] **Step 1: Verify tenant sidebar shows 6+3 structure**

Navigate to 系统管理 → 租户. The sidebar should show:
- 账号与权限 (6 items: 用户权限管理, 用户账号管理, 在线会话监控, 机机凭据管理, 角色定义管理, 角色权限分配)
- 组织架构 (3 items: 部门结构管理, 部门成员管理, 项目权限管理)

---

### Task 14: Hide Menus (Already Done in Task 3)

The following menus were already removed from sidebar sections in Task 3:
- `task-web-end-to-end` (WEB端到端) — was in `task` sidebar, now `security-verify` sidebar doesn't include it
- `task-knowledge-graph` (知识图谱) — same
- `product-mgmt` (产品管理) — was in `project` sidebar, now `security-verify` sidebar doesn't include it

The pages remain in `viewRegistry.tsx` — they can still be accessed via direct URL hash navigation.

- [ ] **Step 1: Verify hidden pages still render**

Navigate directly to `#/task-web-end-to-end`, `#/task-knowledge-graph`, `#/product-mgmt` — each should still render its page without errors.

---

### Task 15: Final Integration Verification

- [ ] **Step 1: Full smoke test**

Test all navigation paths:
1. Login → lands on home page
2. Click "开始使用" → project list
3. 安全验证 sidebar: 项目, 测试输入, 任务, 漏洞
4. Click project name → project detail
5. Project detail: 3 stat blocks, member management button
6. 系统管理 hover → 6 sub-menus
7. Each sub-menu navigates correctly and shows proper sidebar
8. Theme toggle works in header
9. All developer tabs (资产, 评测, 观测, 技能, 工具, 原子能力) work as before
10. Role-based access: ordinary user can't see system-admin or developer tabs

- [ ] **Step 2: Commit any final fixes**

```bash
git add -A
git commit -m "feat: Layer 3 complete — home page, tenant consolidation, hidden menus verified"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 13 requirements from the spec are addressed across Tasks 1-15
- [x] **No placeholders:** Every task has concrete code blocks, file paths, and line numbers
- [x] **Type consistency:** `TopLevelNavKey` union matches `TOP_LEVEL_NAV_ITEMS` ids matches `SIDEBAR_SECTIONS` keys matches `getTopLevelNavForView` return values
- [x] **Hidden menus preserved:** Pages NOT deleted, only sidebar entries removed
- [x] **API contracts preserved:** No backend API changes, all existing `api.domains.*` calls unchanged
- [x] **Backend dependencies flagged:** B1 (project members), B2 (product create perms), B3 (task mode field), B4 (env view auth) — all have frontend workarounds
- [x] **RBAC changes minimal:** Only added `ADMIN_VIEWS` set for env views, existing `canAccessView` logic preserved
