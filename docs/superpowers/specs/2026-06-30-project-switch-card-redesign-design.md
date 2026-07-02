# 项目切换重构：项目管理卡片化 + 卡片驱动切换

**日期**：2026-06-30
**状态**：设计已确认，待评审

## 背景与目标

当前项目切换的唯一入口是右上角的下拉切换器（`layout/Header.tsx`）。
用户希望把切换入口从右上角移到一个更合适的位置：把「项目管理」提升为顶级菜单并卡片化，
点击卡片即完成项目切换并进入工作流。

**关键约束**：保留现有「按项目过滤」的整条链路不变。
`selectedProjectId` 仍是全局唯一真相（owned by `App.tsx`，持久化到 `localStorage.last_project_id`），
约 90 个下游页面通过 `projectId={ctx.selectedProjectId}` prop 透明消费，
深链路由、登录后项目恢复逻辑全部不动。
**本次只新增/调整「设定 `selectedProjectId` 的入口」，不触碰消费层。**

不在本次范围内：
- 安全评估（`sec-assessment-*`）——使用独立的「评估项目」概念，不受影响。
- 编排/技能库（`secocto`）——全局数据，无项目过滤。
- 后端任何改动。

## 设计

### 1. 导航位置调整（`app/navigation.tsx`）

- `TOP_LEVEL_NAV_ITEMS`（约 line 116）：在 `home` 与 `test-task` 之间插入新顶级项
  `{ id: 'project-mgmt-nav', label: '项目管理', role: null }`。
  顶栏变为：`首页 · 项目管理 · 测试任务 · 漏洞中心 · 资产管理 · …`
- `getTopLevelNavForView`（约 line 410）：将 `project-mgmt` 与 `project-detail` 的归属
  从 `assets-center` 改为 `project-mgmt-nav`，使新顶级 tab 正确高亮。
  `product-mgmt` 仍归 `assets-center`。
- `getTopLevelDefaultView`（约 line 443）：新增 `case 'project-mgmt-nav': return 'project-mgmt';`
- `SIDEBAR_SECTIONS`：为 `project-mgmt-nav` 增加单项侧边栏（「项目概览」→ `project-mgmt`），
  与同级 tab 视觉一致。
- 移除 `assets-center` 下原有的 `project-mgmt` 侧边栏项（约 line 736），保证项目管理只有一个入口。

### 2. 列表改卡片（`pages/project/ProjectMgmtPage.tsx`）

替换 `DataTable` 渲染块（约 lines 731–873）为响应式卡片网格。
**其余逻辑全部复用、不改动**：服务端分页拉取（`tableProjects`、search、sort、pagination）、
创建/编辑/删除/成员 handler、权限判定（`canManageProjectMembers`、`can_manage`）、顶部统计块。

每张卡片展示：
- 名称（标题，醒目）
- 归属部门（`department_name`）
- 产品版本（`product_version` / `product_version_name`）
- 创建人（`owner_name`）
- 创建时间（`created_at`）
- 右下角固定 **3 个操作按钮**：成员管理 / 编辑 / 删除
  - 复用现有 handler：`setMemberModalProject`、`openEditModal`、`handleDeleteClick`。
  - **始终渲染 3 个**；无权限时灰色禁用（`cursor-not-allowed`）并加 `title` 说明原因
    （如「仅项目创建人可管理成员」「无编辑权限」），保证所有卡片视觉对齐。
- 「详情」按钮：进入 `project-detail`（与卡片主体的跳转区分开，见 §3）。

网格：`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`，下方保留现有分页栏。

### 3. 卡片点击：选中 + 切换 + 跳转 + 动画

点击卡片主体时（避开操作按钮区，按钮用 `stopPropagation`）：

1. 被点卡片立即进入「选中态」：深蓝色边框 + 背景微染（`--brand-primary-mask`）
   + 右上角浮现勾选标记 + 轻微上提（`translateY(-2px)` + 阴影）。纯 CSS transition，约 150ms。
   组件内用 `justSelectedId` state 控制。
2. 调用 `setSelectedProjectId(project.id)` + `setActiveProjectId(project.id)`——全局项目切换。
3. 右上角项目指示器做一次高亮闪烁（highlight pulse，约 300ms），把视线引向右上角确认上下文已变。
4. 约 300ms 后 `setCurrentView('task-list')` 跳转测试任务页。用 `setTimeout` 衔接，组件卸载时清理。

**右上角闪烁的实现**（跨组件，干净做法）：
在 `Header.tsx` 的项目指示器上监听 `selectedProjectId` 变化（`useEffect` 依赖 `selectedProjectId`），
变化时给元素临时添加一个动画 class、动画结束后移除。
这样**任何来源**的切换（卡片页、右上角下拉）都获得一致的闪烁反馈，
卡片页与 Header 无需直接通信。

**右上角下拉切换器**（保留但弱化）：
- 保留点开下拉切换的能力，作为「已熟悉项目时」的次要快捷入口。
- 视觉弱化：缩小尺寸、降低对比度、去掉常驻边框；主入口让位给卡片页。
  具体弱化程度在实现时给初版，再微调。

### 4. 边界与门禁

- `project-mgmt` 不加入 `PROJECT_REQUIRED_VIEWS`（现状即如此），未选项目时新入口仍可访问。
- 跳转目标 `task-list` 在门禁集合内，但跳转**前**已 `setSelectedProjectId`，
  到达时项目上下文已存在，不会被 `App.tsx` 踢回首页。
  实现必须保证顺序：先 set 项目，再延时 setView。
- 过滤链路、深链路由、登录恢复逻辑全部不变。

## 验证（手动为主，纯前端交互改动）

1. 导航：项目管理出现在「首页」与「测试任务」之间，点击高亮正确。
2. 卡片：5 个信息字段齐全；3 个操作按钮始终显示，无权限置灰且 hover 有提示；增删改/成员功能与原列表一致。
3. 切换：点卡片 → 卡片选中深蓝 → 右上角项目名闪烁并更新 → 约 300ms 跳转测试任务页，且不被门禁踢回首页。
4. 右上角下拉：仍可切换、已弱化；从下拉切换同样触发右上角闪烁。
5. 回归：进入若干按项目过滤的页面（漏洞中心、环境管理等），确认数据随新切换正确过滤。

## 受影响文件

- `app/navigation.tsx` — 顶级导航项、view→nav 映射、默认 view、侧边栏。
- `pages/project/ProjectMgmtPage.tsx` — 列表改卡片、卡片点击切换+跳转+选中动画。
- `layout/Header.tsx` — 项目指示器监听 `selectedProjectId` 触发闪烁动画；下拉视觉弱化。
