# 安全验证拆分 + 任务创建模式改造 设计文档

**日期：** 2026-06-17

**目标：** 将顶端菜单"安全验证"拆分为 5 个独立顶端菜单，侧边栏默认收缩，"测试输入"全局改名为"测试对象"，任务创建弹框的模式选择从下拉框改为 3 个小 tab。

**约束：** 不影响现有功能，接口复用已有的，只改 UI 层。

---

## 1. 顶端导航拆分

### 1.1 移除 `security-verify`，新增 5 个顶级导航

从 `TOP_LEVEL_NAV_ITEMS` 中移除 `security-verify`，替换为 5 个新项。在 `TopLevelNavKey` union 中同步更新。

| 顺序 | id | label | role | 默认视图 | showDividerBefore |
|---|---|---|---|---|---|
| 2 | `project-mgmt-nav` | 项目管理 | `null` | `project-mgmt` | — |
| 3 | `test-object` | 测试对象 | `null` | `test-input-root` | — |
| 4 | `test-env` | 测试环境 | `null` | `env-access` | — |
| 5 | `test-task` | 测试任务 | `null` | `task-list` | — |
| 6 | `vuln-center` | 漏洞中心 | `null` | `vuln-intake` | — |

位置：在 `home` 之后、`assets` 之前（`assets` 保留 `showDividerBefore: true`）。

### 1.2 `getTopLevelNavForView` 更新

现有的 `security-verify` 分支拆为 5 个独立分支：

```
view === 'project-mgmt' || view === 'project-detail' || view === 'product-mgmt' → 'project-mgmt-nav'
view.startsWith('test-input-')                                                  → 'test-object'
view === 'env-access' || view === 'env-management'                              → 'test-env'
view === 'task-list' || view.startsWith('task-')                                → 'test-task'
view === 'vuln-intake' || view.startsWith('vuln-')                              → 'vuln-center'
```

注意：`env-access` 和 `env-management` 同时属于 `test-env`（顶端导航映射）和 `system-admin` 下的环境子菜单。`getTopLevelNavForView` 中 `test-env` 的判断必须在 `system-admin` 之前，保证从测试环境菜单进入时高亮正确。系统管理→环境下的 env-access/env-management 仍然保留（通过系统管理子菜单进入时由 system-admin 分支处理）。

### 1.3 `getTopLevelDefaultView` 更新

新增 5 个 case：

```
'project-mgmt-nav' → 'project-mgmt'
'test-object'      → 'test-input-root'
'test-env'         → 'env-access'
'test-task'        → 'task-list'
'vuln-center'      → 'vuln-intake'
```

移除 `'security-verify'` case。

### 1.4 `SIDEBAR_SECTIONS` 更新

移除 `'security-verify'` 键，新增 5 个键：

```typescript
'project-mgmt-nav': [
  { title: '项目管理', items: [
    { id: 'project-mgmt', label: '项目管理', icon: Briefcase, aliases: ['project-detail'], healthKey: 'projectHealth' },
  ]},
],
'test-object': [
  { title: '测试对象', items: [
    { id: 'test-input-root', label: '测试对象', icon: FileBox, requiresProject: true },
  ]},
],
'test-env': [
  { title: '测试环境', items: [
    { id: 'env-access', label: '环境接入', icon: Terminal, requiresProject: true, healthKey: 'envHealth' },
    { id: 'env-management', label: '环境管理', icon: ServerCog, requiresProject: true, healthKey: 'envHealth' },
  ]},
],
'test-task': [
  { title: '测试任务', items: [
    { id: 'task-list', label: '测试任务', icon: ListTodo, requiresProject: true },
  ]},
],
'vuln-center': [
  { title: '漏洞中心', items: [
    { id: 'vuln-intake', label: '漏洞中心', icon: Shield, aliases: ['vuln-overview', 'vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
  ]},
],
```

系统管理→环境 的侧边栏（`SYSTEM_ADMIN_SIDEBAR_MAP.environment`）保持不变，仍包含完整的环境管理菜单。

---

## 2. 侧边栏默认收缩

**文件：** `App.tsx`

将 `isSidebarCollapsed` 的初始值从 `false` 改为 `true`：

```typescript
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
```

用户仍可通过侧边栏的展开/收缩按钮手动切换。

---

## 3. "测试输入" 全局改名为 "测试对象"

### 3.1 navigation.tsx

- sidebar label: `'测试输入'` → `'测试对象'`（已在 1.4 节体现）

### 3.2 TestInputPage.tsx

页面内所有 UI 文案 `'测试输入'` 改为 `'测试对象'`，包括：
- 页面标题
- 搜索框 placeholder
- 空状态文案
- 任何按钮文案中的"测试输入"

**不改：** 组件文件名 `TestInputPage.tsx` 不改（避免大范围 import 变更），视图 ID `test-input-root` 不改（避免路由/映射变更）。

### 3.3 CreateTaskDialog.tsx

弹框中引用"测试输入"文案的地方改为"测试对象"。

---

## 4. 任务创建弹框 — 模式改造

**文件：** `pages/task/CreateTaskDialog.tsx`

### 4.1 现有结构

```
外层大 Tab: [基础信息] [动态验证环境（可选）]
基础信息内:
  - 任务名称
  - 模式（下拉框：龙尾/噬首/羊角）
  - 任务类型（下拉框：6种工具）
  - Agent Harness 专属字段
  - 测试输入
  - 描述
```

### 4.2 新结构

```
外层大 Tab: [基础信息] [动态验证环境（可选）]
基础信息内:
  - 任务名称
  - 模式（3个小tab: 龙尾 | 噬首 | 羊角）← 默认选中"龙尾"
  - 工具（下拉框：6种工具，不根据模式过滤）
  - Agent Harness 专属字段（当工具=sechps_tool时显示）
  - 测试对象（原"测试输入"）
  - 描述
```

### 4.3 实现细节

- `MODE_OPTIONS` 数组不变，仍为 3 项
- `mode` state 初始值从 `''` 改为 `'dragon-tail'`（默认选中龙尾）
- 移除模式 `<select>` 下拉框
- 新增 3 个小 tab 按钮，样式参考现有 `CREATE_TABS` 的 tab 样式，但更紧凑（inline pill 风格）
- `TASK_TYPES` 不变，6 种工具全部展示
- "任务类型" label 改为 "工具"
- 提交时 mode 字段取当前选中的 tab 值

---

## 5. 类型更新

**文件：** `app/navigation.tsx`

`TopLevelNavKey` union 更新：

```typescript
export type TopLevelNavKey =
  | 'home'
  | 'project-mgmt-nav'
  | 'test-object'
  | 'test-env'
  | 'test-task'
  | 'vuln-center'
  | 'assets'
  | 'assessment'
  | 'observe'
  | 'skill'
  | 'tools'
  | 'atomic'
  | 'system-admin';
```

移除 `'security-verify'`。

---

## 6. 文件变更清单

| 文件 | 变更 |
|---|---|
| `app/navigation.tsx` | TopLevelNavKey 移除 security-verify 新增 5 个；TOP_LEVEL_NAV_ITEMS 替换；SIDEBAR_SECTIONS 替换；getTopLevelNavForView 拆分；getTopLevelDefaultView 拆分 |
| `App.tsx` | `isSidebarCollapsed` 初始值 → `true` |
| `pages/TestInputPage.tsx` | 所有"测试输入"文案 → "测试对象" |
| `pages/task/CreateTaskDialog.tsx` | 模式下拉→3个小tab，mode默认值→'dragon-tail'，"任务类型"label→"工具"，"测试输入"→"测试对象" |
| `layout/Header.tsx` | 无需改动（5个新菜单都是普通按钮，不需要悬浮下拉） |
| `layout/Sidebar.tsx` | 无需改动（已支持 SIDEBAR_SECTIONS 动态读取） |
| `types/types.ts` | ViewType 无需改动（视图ID不变） |
| `docs/superpowers/specs/2026-06-16-navigation-restructure-design.md` | 同步记录本次变更 |

### 不变的文件/功能

- 所有页面组件文件名不改
- 所有视图 ID 不改（`project-mgmt`, `test-input-root`, `task-list`, `vuln-intake`, `env-access`, `env-management`）
- 所有 API 接口不变
- 系统管理→环境 的完整侧边栏不变
- RBAC 权限逻辑不变（`canAccessView` 不受影响）
