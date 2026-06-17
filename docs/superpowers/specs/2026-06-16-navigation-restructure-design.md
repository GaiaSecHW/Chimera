# Chimera UI 导航重构 & 功能改造设计文档

> 日期：2026-06-16
> 状态：已确认，待实施
> 方案：分层渐进改造（A方案）

---

## 目录

1. [改造原则](#改造原则)
2. [第一层：导航结构重构](#第一层导航结构重构)
3. [第二层：页面功能改造](#第二层页面功能改造)
4. [第三层：首页 + 租户整合 + 隐藏菜单](#第三层首页--租户整合--隐藏菜单)
5. [后端待确认事项](#后端待确认事项)
6. [文件变更清单](#文件变更清单)

---

## 改造原则

1. **界面改动不影响现有功能**，接口仍复用已有的
2. 如果涉及后端接口需要同步改动，先标记，不直接修改前端代码
3. 涉及菜单去掉不展示的，**只去掉菜单，不删除页面**（URL 直接访问仍可用）
4. 保留全局项目切换器（`selectedProjectId`），但新的"安全验证"Tab 页面与其无关联

---

## 第一层：导航结构重构

### 1.1 新顶级菜单结构

**改造前** (17 个顶级 Tab)：

```
[仪表盘] [项目 资产 任务 环境 漏洞] | [评测 观测 技能 工具 原子能力] | [AI网关 任务调度 进化 租户 角色 用户]
 null       user 组                      developer 组                    admin 组
```

**改造后** (7 个顶级 Tab)：

```
[首页] [安全验证] | [资产 评测 观测 技能 工具 原子能力] | [系统管理▾]
 null    user         developer 组                        admin（悬浮子菜单）
```

具体的 `TOP_LEVEL_NAV_ITEMS` 变更：

| id | label | role | 说明 |
|---|---|---|---|
| `home` | 首页 | `null` | **新增**，所有角色可见 |
| `security-verify` | 安全验证 | `'user'` | **新增**，替代原 project/task/vuln |
| `assets` | 资产 | `'developer'` | 从 `user` 改为 `developer` |
| `assessment` | 评测 | `'developer'` | 不变 |
| `observe` | 观测 | `'developer'` | 不变 |
| `skill` | 技能 | `'developer'` | 不变 |
| `tools` | 工具 | `'developer'` | 不变 |
| `atomic` | 原子能力 | `'developer'` | 不变 |
| `system-admin` | 系统管理 | `'admin'` | **新增**，悬浮子菜单 |

**移除的顶级 Tab：** `dashboard`, `project`, `task`, `environment`, `vuln`, `aigw`, `schedule`, `evolution`, `tenant`, `role`, `user-mgmt`

这些 Tab 对应的视图和页面**全部保留**，只是不再作为独立顶级菜单。

### 1.2 "系统管理"悬浮子菜单

`system-admin` 是特殊的顶级菜单项，行为与其他 Tab 不同：

- **鼠标悬浮**时展示浮层（popover），包含 6 个子菜单项（平铺列表）
- **点击子菜单项**导航到对应的默认视图
- 不直接导航（点击 Tab 本身也打开浮层）
- 浮层使用 `onMouseEnter/onMouseLeave` 控制，带 150ms 延迟关闭防止误操作

浮层子菜单项：

| 子菜单 | 导航到的默认视图 | 说明 |
|---|---|---|
| 仪表盘 | `dashboard` | 从顶级 Tab 移入 |
| AI网关 | `aigw-dashboard` | 从顶级 Tab 移入 |
| 任务调度 | `chimera-platform-schedule` | 从顶级 Tab 移入 |
| 进化 | `binary-evolution-center` | 从顶级 Tab 移入 |
| 租户 | `user-mgmt-access`（或 getUserCenterDefaultView） | 从顶级 Tab 移入，角色管理合入 |
| 环境 | `env-agent` | 从 user 组移入 admin |

选中某个子菜单后，该子菜单高亮，左侧边栏显示该项的子菜单。`system-admin` 顶级 Tab 也保持高亮状态。

**实现要点：**
- `getTopLevelNavForView` 需要将原来映射到 `dashboard`/`aigw`/`schedule`/`evolution`/`tenant`/`environment` 的视图全部映射到 `system-admin`
- `getTopLevelDefaultView('system-admin', user)` 返回 `dashboard`
- **Sidebar 动态选择机制**：`SIDEBAR_SECTIONS['system-admin']` 不存在。新增一个辅助函数 `getSystemAdminSidebarSections(currentView: string): NavSection[]`，根据当前视图前缀返回原来对应 Tab 的 sidebar sections。例如 `currentView.startsWith('env-')` 返回原 environment 的 sidebar，`currentView.startsWith('aigw-')` 返回原 aigw 的 sidebar，以此类推。`dashboard` 返回空数组（仪表盘无侧边栏）。Sidebar.tsx 中当 `activeTopLevelNav === 'system-admin'` 时调用该函数替代查表。
- **悬浮菜单高亮**：Header.tsx 中新增一个函数 `getSystemAdminActiveChild(currentView: string): string`，返回当前视图归属的子菜单 key（如 'aigw'/'schedule'/'evolution'/'tenant'/'environment'/'dashboard'），用于浮层中高亮当前子菜单

### 1.3 "安全验证"侧边栏

`SIDEBAR_SECTIONS['security-verify']`：

```typescript
[
  {
    title: '安全验证',
    items: [
      { id: 'project-mgmt', label: '项目', icon: Briefcase, aliases: ['project-detail'], healthKey: 'projectHealth' },
      { id: 'test-input-root', label: '测试输入', icon: FileBox, requiresProject: true },
      { id: 'task-list', label: '任务', icon: ListChecks, requiresProject: true },
      { id: 'vuln-overview', label: '漏洞', icon: Shield, aliases: ['vuln-engine'], requiresProject: true, healthKey: 'vulnHealth' },
    ],
  },
]
```

注意事项：
- `project-mgmt` 不设 `requiresProject`（项目列表本身不需要先选项目）
- `test-input-root` 设 `requiresProject: true`（需要项目上下文来关联上传）
- 原来 `task` Tab 下的"任务输入"菜单移到安全验证下的"测试输入"
- 任务/漏洞在安全验证外只读，项目空间内可操作（通过 `readOnly` prop 控制）

**`getTopLevelNavForView` 映射更新：**
- `project-mgmt`, `project-detail`, `product-mgmt` → `security-verify`
- `test-input-*` → `security-verify`
- `task-*` → `security-verify`
- `vuln-*` → `security-verify`

### 1.4 角色切换移除 & 主题切换移位

**移除（Header.tsx）：**
- `visibleRoles` state（`useState<Set<string>>`）
- `toggleRole` 函数
- `isRoleDropdownOpen` state
- `roleDropdownRef`
- 整个角色下拉 dropdown 的 JSX 渲染（约 lines 119-149）
- `getVisibleTopLevelNavItems` 调用时去掉第二个参数

**主题切换移到角色下拉原位（Header.tsx）：**
- 在原来角色下拉按钮位置放置主题切换图标按钮
- 引入 `useTheme` hook
- 图标：`theme === 'chimera-classic'` → `MoonStar` → 点击切换到深色；否则 `SunMedium` → 点击切换到经典
- Tooltip 提示当前主题名

**Sidebar.tsx 底部移除主题切换：**
- 移除 footer 区域的主题切换按钮（只保留折叠/展开按钮）

### 1.5 去掉的 UI 元素

**ThemeLogo badge（Header.tsx）：**
- `<ThemeLogo>` 组件的 `showBadge` prop 传 `false`
- 保留 logo 和 "Chimera" 文字，只去掉 badge 文字（"Security Platform" / "Warm Light"）

**用户下拉菜单（Header.tsx）：**
- 移除"系统设置"菜单项（`setCurrentView('sys-settings')`）
- 移除"用户管理"菜单项（`setCurrentView(getUserCenterDefaultView(user))`）
- 保留"修改密码"和"退出系统"

### 1.6 首页

- 新增视图 ID: `home`
- 新增 `TopLevelNavKey` 值: `'home'`
- `DEFAULT_VIEW` 从 `'dashboard'` 改为 `'home'`
- `getTopLevelNavForView('home')` 返回 `'home'`
- `getTopLevelDefaultView('home', user)` 返回 `'home'`
- `SIDEBAR_SECTIONS['home']` = `[]`（无侧边栏）

**HomePage 组件：**
- 居中卡片布局，LOKI 深色主题样式
- `ThemeLogo` 大号 + "欢迎使用 Chimera 系统" 文字
- "开始使用"按钮 → `setCurrentView('project-mgmt')`

### 1.7 RBAC 调整

**`utils/rbac.ts`：**
- 环境视图 (`env-agent`, `env-service`, `env-template`, `env-tasks`, `env-ai-*`, `env-process-monitor-*`) 加入权限控制
- 方式：加入 `SUPER_ADMIN_ONLY_VIEWS` 集合，或新建 `ADMIN_VIEWS` 集合（对 `ordinary_admin` 和 `super_admin` 都放行）
- 推荐新建 `ADMIN_VIEWS`（ordinary_admin + super_admin 可访问），因为环境管理功能 ordinary_admin 也可能需要

**不变：**
- 资产视图不改 RBAC（通过 Tab role 控制可见性已足够）
- 安全验证下的 project/task/vuln 视图保持默认 allow

---

## 第二层：页面功能改造

### 2.1 项目列表页（ProjectMgmtPage.tsx）

**概览区：**
- 标题文字从"项目空间"改为"项目概览"
- 3 个方块 → 4 个方块：

| 方块 | 数据来源 | 说明 |
|------|----------|------|
| 项目 | `projects.length` | 用户权限范围内的项目总数 |
| 任务 | `scheduleCenterApi` 汇总 | 遍历项目或全局统计 |
| 环境 | `environmentApi` 汇总 | 代理/节点总数 |
| 漏洞 | `vulnApi` 汇总 | 漏洞案例总数 |

- 数据加载使用 loading 骨架屏，避免阻塞页面渲染

**列表表格：**

| 列 | 改动 |
|----|------|
| 项目 | 只显示 `name`，去掉描述和 ID。点击名称进入项目空间。 |
| 命名空间 | **移除** |
| 可见性 | **移除** |
| 负责人 | 改为"项目成员"，多成员用省略号展示，hover tooltip 显示全部 |
| 其他列 | 保留，各列 `whitespace-nowrap` / `truncate` 单行展示 |

**操作列：**
- 移除"切换"按钮（`switchToProject`）
- 移除 ArrowRight 图标
- 保留编辑和删除（受 `can_manage` 控制）

**列表分区：**
- 不再分"公开项目"/"部门项目"两个区域
- 合并为一个统一列表，创建时默认 `is_public: false`

**项目成员数据来源（临时方案）：**
- 显示 `owner_name` 字段（现有数据）
- 后续后端提供成员列表接口后替换为真实成员数据

### 2.2 项目创建弹框

**字段变更：**

| 字段 | 状态 | 说明 |
|------|------|------|
| 项目名称* | 保留 | |
| 项目简述 | 保留 | textarea |
| 归属部门* | 保留 | 下拉选择 |
| 产品名称* | **新增** | ComboBox：手动输入（新增） + 下拉选择（历史数据） |
| 版本号* | **新增** | ComboBox：手动输入 + 下拉选择 |
| 项目可见性 | **移除** | 默认 `is_public: false`（部门项目） |
| 产品版本下拉 | **移除** | 被产品名称 + 版本号替代 |

**ComboBox 交互：**

1. **产品名称下拉数据**：调用 `productsApi.getTree()` → 提取所有 `is_leaf` 产品的 `name` 去重
2. **用户选择已有产品** → 自动加载该产品的 `versions[]` 供版本号下拉
3. **用户手动输入新产品名** → 版本号下拉清空，支持手动输入
4. **混合模式**：选择已有产品后也可手动输入新版本号

**提交逻辑：**

```
if (选择了已有产品+版本) {
  product_version_id = 已选版本.id
} else if (手动输入了新产品) {
  const product = await productsApi.create({ name: 产品名称, code: 产品名称 })
  const version = await productsApi.createVersion(product.id, { version: 版本号, name: 版本号 })
  product_version_id = version.id
} else if (选择了已有产品 + 手动输入新版本) {
  const version = await productsApi.createVersion(已选产品.id, { version: 版本号, name: 版本号 })
  product_version_id = version.id
}
await projectsApi.create({ name, description, is_public: false, department_id, product_version_id })
```

> **后端待确认 B2**：普通用户是否有权调用 `productsApi.create` / `createVersion`。前端先不限制，后端返错时提示用户。

### 2.3 项目空间页（ProjectDetailPage.tsx）

**方块改造：**

| 方块 | 数据来源 | 点击行为 |
|------|----------|----------|
| 任务 | `scheduleCenterApi.listUserTasks(projectId)` → 总数 | 下方显示任务列表 |
| 环境 | `environmentApi.getAgents(projectId)` → 总数 | 下方显示环境列表 |
| 漏洞 | `vulnApi.getOverview(projectId)` → 总数 | 下方显示漏洞列表 |

- 原有的 K8s 标签页（overview/pods/network/storage）移除
- 重建 Ingress TLS 按钮移除
- 项目 SDK Token 卡片暂时保留（`can_manage` 用户可见），后续确认

**方块下方列表：**
- 默认显示任务列表
- 点击方块切换显示对应列表
- 列表复用现有组件逻辑，传入 `readOnly=false`（项目空间内可操作）

**项目成员管理：**
- 页面右上角增加"管理成员"按钮（Users 图标）
- 点击弹出 Modal：
  - 成员列表 table（姓名、角色、操作列）
  - 添加成员：搜索用户输入框 + 角色下拉 + 确认
  - 修改角色：行内下拉
  - 移除成员：操作列删除按钮 + 二次确认

> **后端待确认 B1**：需要 `GET /api/project/{id}/members` 接口。现有 `bindRole`/`unbindRole` 可复用。前端先用 mock 数据 + 空态 UI。

### 2.4 任务创建弹框重构

**任务列表（TaskCenterPage）表格改动：**
- 去掉"运行父凭证"列（`parent_task_key_name` / `parent_task_key_prefix`）
- "任务名"列只显示 `task.name`，不再显示 `task.id`
- 所有列添加 `whitespace-nowrap`，确保单行展示
- 表头列数从 10 调整为 9（含 checkbox 列）

**提取为独立组件：** `pages/task/CreateTaskDialog.tsx`

原来内联在 `TaskCenterPage.tsx` 中（约 380 行 modal 代码），提取为独立组件以支持复用（测试输入页面也需要调用）。

**新 Tab 结构：**

**Tab 1 — 基础信息：**

| 字段 | 类型 | 说明 |
|------|------|------|
| 任务名称* | text input | |
| 模式* | select | 龙尾 / 噬首 / 羊角（前端字段，暂不传后端） |
| 任务类型* | select | 联动：根据模式过滤。映射待定，先显示全部 6 种类型 |
| 测试输入* | radio/tab 切换 | "选择已有"（从上传记录选）/ "直接上传"（内嵌上传） |
| 描述 | textarea | |

测试输入 "选择已有" 模式：
- 下拉选择当前项目的 `ProjectInputUploadRecord`
- 选择后展示文件树浏览器（复用现有逻辑）

测试输入 "直接上传" 模式：
- 内嵌简化版上传区域
- 选择文件 → 调 `fileserverApi.createProjectInputUpload` → 上传完成后自动选中
- 复用 `TestInputPage` 的上传逻辑核心代码

**Tab 2 — 动态验证环境（可选）：**
- Tab 标签显示"（可选）"后缀
- 内容区显示占位说明："后续支持动态验证环境配置"
- 不阻塞提交——只要基础信息填写完整即可提交

**提交逻辑：** 复用现有 `scheduleCenterApi.createUserTask(projectId, payload)`。Payload 结构不变。`mode` 字段前端本地记录（localStorage 或组件状态），暂不传后端。

> **后端待确认 B3**：后续 `createUserTask` payload 可能需要新增 `mode` 字段。

**Props 设计：**
```typescript
interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  preSelectedInputId?: string;  // 从测试输入页面跳转时预选
  onCreated: () => void;        // 创建成功回调（刷新列表）
}
```

### 2.5 测试输入页面增强（TestInputPage.tsx）

- 页面操作区增加"创建任务"按钮
- 按钮激活条件：用户已选中一条输入记录（单选）
- 点击后打开 `CreateTaskDialog`，传入 `preSelectedInputId`
- 弹框中"测试输入"字段自动预选该记录
- 需要额外传入项目信息（从 `selectedProjectId` + `projects` 推导）

### 2.6 安全验证外的只读模式

在安全验证 Tab 下的任务列表和漏洞页面，当**不在项目空间内**时：
- 显示所有项目的汇总数据
- 隐藏"创建"按钮和其他写操作按钮
- 列表仍可筛选、搜索、查看详情
- 实现方式：页面组件接收 `readOnly?: boolean` prop

在项目空间（`project-detail`）内的任务/环境/漏洞列表：
- 正常显示所有操作按钮
- `readOnly=false`

---

## 第三层：首页 + 租户整合 + 隐藏菜单

### 3.1 首页（HomePage.tsx）

**新建文件：** `pages/HomePage.tsx`

布局：
- 无侧边栏（`SIDEBAR_SECTIONS['home'] = []`）
- 居中卡片布局
- LOKI 深色主题样式（与现有页面一致）

内容：
- `ThemeLogo` 组件（大号，`size="large"`, `showBadge`）
- "欢迎使用 Chimera 系统" 标题文字
- "开始使用"主按钮 → `setCurrentView('project-mgmt')`

用户登录后默认进入此页。

### 3.2 租户菜单侧边栏重组

`PLATFORM_ACCOUNT_ORG_SECTIONS` 更新为新结构：

```typescript
const PLATFORM_ACCOUNT_ORG_SECTIONS: NavSection[] = [
  {
    title: '账号与权限',
    items: [
      { id: 'user-mgmt-access', label: '用户权限管理', icon: Shield },
      { id: 'user-mgmt-users', label: '用户账号管理', icon: Users },
      { id: 'user-mgmt-online', label: '在线会话监控', icon: Globe },
      { id: 'user-mgmt-machine', label: '机机凭据管理', icon: Cpu },
      { id: 'user-mgmt-roles', label: '角色定义管理', icon: Shield },   // 从角色Tab合入
      { id: 'user-mgmt-perms', label: '角色权限分配', icon: Users },    // 从角色Tab合入
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

- `SIDEBAR_SECTIONS['tenant']` 使用更新后的 `PLATFORM_ACCOUNT_ORG_SECTIONS`
- 独立的 `role` 顶级 Tab 和 `user-mgmt` 顶级 Tab 移除
- `getTopLevelNavForView` 将 `user-mgmt-roles`, `user-mgmt-perms` 映射到 `system-admin`（租户子菜单下）
- 同理 `user-mgmt-*` 和 `org-mgmt-*` 视图全部映射到 `system-admin`

### 3.3 隐藏菜单（只移除菜单项，不删除页面）

| 隐藏菜单 | 原属 Tab | SIDEBAR_SECTIONS 处理 | viewRegistry 处理 |
|----------|----------|-------------------|--------------------|
| WEB端到端 (`task-web-end-to-end`) | task | 从侧边栏移除 | **保留** |
| 知识图谱 (`task-knowledge-graph`) | task | 从侧边栏移除 | **保留** |
| 产品管理 (`product-mgmt`) | project | 从侧边栏移除 | **保留** |

这些视图通过 URL hash 直接访问仍可正常渲染。

---

## 后端待确认事项

| 编号 | 事项 | 描述 | 前端临时策略 | 优先级 |
|------|------|------|-------------|--------|
| B1 | 项目成员列表接口 | `GET /api/project/{id}/members` 返回成员列表（含 user_id, username, role） | mock 数据 + 空态 UI | 高 |
| B2 | 产品创建权限 | 普通用户能否调 `POST /api/project/products` 和 `createVersion` | 不限制，后端返错时提示 | 中 |
| B3 | 任务 mode 字段 | `createUserTask` payload 是否支持新增 `mode` 字段（龙尾/噬首/羊角） | 前端本地记录，不传后端 | 低 |
| B4 | 环境视图权限 | `env-*` 视图后端 API 是否需要额外鉴权 | 前端 RBAC 守卫控制 | 低 |

---

## 文件变更清单

### 新建文件

| 文件路径 | 说明 |
|----------|------|
| `pages/HomePage.tsx` | 首页欢迎页 |
| `pages/task/CreateTaskDialog.tsx` | 独立的任务创建弹框组件（从 TaskCenterPage 提取） |

### 修改文件

| 文件路径 | 层次 | 改动概述 |
|----------|------|----------|
| `app/navigation.tsx` | 第一层 | 重构 TOP_LEVEL_NAV_ITEMS（新增 home/security-verify/system-admin），重构 SIDEBAR_SECTIONS，更新 getTopLevelNavForView/getTopLevelDefaultView，更新 PLATFORM_ACCOUNT_ORG_SECTIONS，移除隐藏菜单项 |
| `layout/Header.tsx` | 第一层 | 系统管理悬浮子菜单渲染、移除角色切换 UI、主题切换移到角色原位、ThemeLogo showBadge=false、移除用户菜单的系统设置/用户管理项 |
| `layout/Sidebar.tsx` | 第一层 | 移除底部主题切换按钮、支持 system-admin 动态侧边栏选择 |
| `utils/rbac.ts` | 第一层 | 新增 ADMIN_VIEWS 集合（env-* 视图），canAccessView 更新 |
| `App.tsx` | 第一层 | DEFAULT_VIEW 改为 'home'，首页路由 |
| `app/viewRegistry.tsx` | 第一/二层 | 新增 home 视图渲染，传递 readOnly prop |
| `types/types.ts` | 第一层 | ViewType 联合类型新增 'home', 'security-verify' |
| `pages/project/ProjectMgmtPage.tsx` | 第二层 | 概览方块改4个、列表列调整、创建弹框改造（ComboBox产品/版本）、移除分区 |
| `pages/project/ProjectDetailPage.tsx` | 第二层 | 方块改任务/环境/漏洞、成员管理 Modal、移除K8s标签页 |
| `pages/task/TaskCenterPage.tsx` | 第二层 | 任务创建逻辑提取到 CreateTaskDialog、调用新组件；任务列表去掉"运行父凭证"列，"任务名"列不再显示 ID，所有列单行展示（whitespace-nowrap） |
| `pages/TestInputPage.tsx` | 第二层 | 增加"创建任务"按钮、集成 CreateTaskDialog |

### 不变的文件

- `components/ThemeLogo.tsx` — 组件本身不变，只是调用时传不同 props
- `theme/themes.ts` — 主题定义不变
- `theme/ThemeProvider.tsx` — 不变
- `clients/*` — 所有 API 客户端不变
- 所有被隐藏菜单对应的页面文件 — 不删除不修改
