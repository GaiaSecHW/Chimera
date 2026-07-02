# 项目切换重构（项目管理卡片化 + 卡片驱动切换）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「项目管理」从资产管理子菜单提升为顶级导航并卡片化，点击卡片即切换全局项目（选中态 + 右上角闪烁反馈 + 300ms 跳转测试任务页），右上角下拉切换器保留但视觉弱化。

**Architecture:** 不改动「按项目过滤」消费层——`selectedProjectId` 仍是 `App.tsx` 持有的全局唯一真相，约 90 个下游页面通过 prop 透明消费。本次只新增/调整「设定该值的入口」：导航配置（`navigation.tsx`）、项目页渲染与点击行为（`ProjectMgmtPage.tsx`）、右上角指示器反馈与弱化（`Header.tsx` + `styles.css`）。

**Tech Stack:** React + TypeScript + Vite + Tailwind CSS（lucide-react 图标）。设计令牌见 `styles.css`（`--brand-primary` / `--brand-primary-mask`）。

## Global Constraints

- 不修改后端，不修改约 90 个下游消费页面，不修改 `selectedProjectId` 的所有权（`App.tsx`）、深链路由、登录恢复逻辑。
- 不把 `project-mgmt` 加入 `PROJECT_REQUIRED_VIEWS`（它是「选项目」入口，未选项目时必须可访问）。
- 排除模块不动：`sec-assessment-*`（独立评估项目概念）、`secocto`（全局无项目过滤）。
- 跳转顺序硬性要求：**先 `setSelectedProjectId`，再延时 `setCurrentView('task-list')`**，否则到达 `task-list` 时会被 `App.tsx` 门禁踢回首页。
- 品牌色：选中态/动画统一使用 `var(--brand-primary)`（#2563EB）与 `var(--brand-primary-mask)`。
- 自动化门禁：每个任务结束运行 `npm run lint`（即 `tsc --noEmit`）必须零报错；本仓库无单测框架，UI/交互行为以明确的手动浏览器步骤验证。

---

## File Structure

- `app/navigation.tsx` — 顶级导航项、view→nav 映射、各 nav 默认 view、侧边栏分区、assets-center 子项。**改**。
- `pages/project/ProjectMgmtPage.tsx` — 项目页：列表改卡片、卡片点击切换+跳转+选中动画。**改**。
- `layout/Header.tsx` — 右上角项目指示器：监听 `selectedProjectId` 触发闪烁；下拉视觉弱化。**改**。
- `styles.css` — 新增项目切换闪烁关键帧与工具类。**改**。

---

## Task 1: 把「项目管理」提升为顶级导航

**Files:**
- Modify: `app/navigation.tsx`（`TopLevelNavKey` 52-65；`TOP_LEVEL_NAV_ITEMS` 116-130；`getTopLevelNavForView` 410；`getTopLevelDefaultView` 443-460；`SIDEBAR_SECTIONS` 484+；`ASSETS_CENTER_SIDEBAR_MAP` 731-739；`ASSETS_CENTER_CHILDREN` 772-776；`getAssetsCenterActiveChild` 778-783）

**Interfaces:**
- Consumes: 现有 `navigateToView`、`getTopLevelDefaultView` 已在 `App.tsx:700` 通过 `onSelectTopLevelNav={(nav) => navigateToView(getTopLevelDefaultView(nav, user))}` 接线；`viewRegistry.tsx:286` 已渲染 `ProjectMgmtPage`。无需改这两处。
- Produces: 新增顶级 nav key `'project-mgmt-nav'`，默认 view 为 `'project-mgmt'`；`project-mgmt`/`project-detail` 的顶栏归属改为 `'project-mgmt-nav'`。

- [ ] **Step 1: 在 `TopLevelNavKey` 联合类型中加入新 key**

`app/navigation.tsx` 第 52-65 行，在 `'home'` 之后加入 `'project-mgmt-nav'`：

```typescript
export type TopLevelNavKey =
  | 'home'
  | 'project-mgmt-nav'
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
```

- [ ] **Step 2: 在顶级导航数组中插入「项目管理」（首页与测试任务之间）**

`app/navigation.tsx` 第 116-118 行，在 `home` 与 `test-task` 之间插入一行：

```typescript
export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'home', label: '首页', role: null },
  { id: 'project-mgmt-nav', label: '项目管理', role: null },
  { id: 'test-task', label: '测试任务', role: null },
```

（其余条目保持不变。）

- [ ] **Step 3: 调整 view→顶栏归属映射**

`app/navigation.tsx` `getTopLevelNavForView` 第 410 行当前为：

```typescript
  if (view === 'project-mgmt' || view === 'project-detail' || view === 'product-mgmt') return 'assets-center';
```

替换为两行（`project-mgmt`/`project-detail` 归新顶栏，`product-mgmt` 仍归资产管理）：

```typescript
  if (view === 'project-mgmt' || view === 'project-detail') return 'project-mgmt-nav';
  if (view === 'product-mgmt') return 'assets-center';
```

- [ ] **Step 4: 为新顶栏添加默认 view**

`app/navigation.tsx` `getTopLevelDefaultView` 第 444-459 行的 switch 中，在 `case 'home'` 之后加入：

```typescript
    case 'home': return 'home';
    case 'project-mgmt-nav': return 'project-mgmt';
    case 'test-task': return 'task-list';
```

- [ ] **Step 5: 为新顶栏添加侧边栏分区**

`app/navigation.tsx` `SIDEBAR_SECTIONS`（第 484 行起），在 `home: [],` 之后加入单项分区（图标 `Briefcase` 已在文件顶部导入）：

```typescript
export const SIDEBAR_SECTIONS: Record<string, NavSection[]> = {
  home: [],
  'project-mgmt-nav': [
    {
      title: '项目管理',
      items: [
        { id: 'project-mgmt', label: '项目概览', icon: Briefcase, aliases: ['project-detail'] },
      ],
    },
  ],
  'test-task': [
```

- [ ] **Step 6: 从资产管理子项中移除「项目管理」，避免双入口**

`app/navigation.tsx` 第 772-776 行 `ASSETS_CENTER_CHILDREN`，删除 `projectMgmt` 一行，保留另两项：

```typescript
export const ASSETS_CENTER_CHILDREN: { key: AssetsCenterChildKey; label: string; defaultView: string }[] = [
  { key: 'testObject', label: '测试对象', defaultView: 'test-input-root' },
  { key: 'testEnv', label: '测试环境', defaultView: 'env-access' },
];
```

第 770 行 `AssetsCenterChildKey` 类型移除 `'projectMgmt'`：

```typescript
export type AssetsCenterChildKey = 'testObject' | 'testEnv';
```

- [ ] **Step 7: 修正资产管理 active-child 判定与侧边栏映射**

`app/navigation.tsx` `getAssetsCenterActiveChild`（778-783 行）移除 `projectMgmt` 分支并把默认值改为 `'testObject'`：

```typescript
export const getAssetsCenterActiveChild = (currentView: string): AssetsCenterChildKey => {
  if (currentView.startsWith('test-input-')) return 'testObject';
  if (currentView === 'env-access' || currentView === 'env-management') return 'testEnv';
  return 'testObject';
};
```

`app/navigation.tsx` `ASSETS_CENTER_SIDEBAR_MAP`（731-739 行）删除整个 `projectMgmt:` 键及其内容，使该 map 只剩 `testObject` / `testEnv`：

```typescript
const ASSETS_CENTER_SIDEBAR_MAP: Record<string, NavSection[]> = {
  testObject: [
```

（删掉 `projectMgmt: [ { title: '项目管理', items: [ { id: 'project-mgmt', ... } ] } ],` 这一整块；`product-mgmt` 页仍可由 `viewRegistry.tsx:298` 正常渲染，不依赖该侧边栏项。）

- [ ] **Step 8: 运行 lint 验证类型一致**

Run: `npm run lint`
Expected: 无报错退出（exit 0）。若报 `AssetsCenterChildKey` 残留引用，按报错处删除对应 `projectMgmt` 用法。

- [ ] **Step 9: 手动验证导航**

Run: `npm run dev`，浏览器打开应用。
验证：
1. 顶栏顺序为「首页 · 项目管理 · 测试任务 · 漏洞中心 · 资产管理 · …」。
2. 点击「项目管理」→ 进入 `project-mgmt` 页，且「项目管理」tab 高亮。
3. 点击「资产管理」下拉，只剩「测试对象 / 测试环境」两项，不再有「项目管理」。
4. 在项目页点任意项目进入详情后，顶栏仍高亮「项目管理」（因 `project-detail` 已归该顶栏）。

- [ ] **Step 10: Commit**

```bash
git add app/navigation.tsx
git commit -m "feat(nav): 将项目管理提升为顶级导航，置于首页与测试任务之间"
```

---

## Task 2: 项目列表改卡片（保留管理能力）

**Files:**
- Modify: `pages/project/ProjectMgmtPage.tsx`（替换第 731-873 行的 `DataTable` 渲染块；其余逻辑、handler、统计块、弹窗全部保留不动）

**Interfaces:**
- Consumes: 组件内已有 `tableProjects: SecurityProject[]`、`tableLoading`、`tableTotal`、`safePage`、`pageSize`、`setCurrentPage`、`handlePageSizeChange`、`canManageProjectMembers(project)`、`project.can_manage`、`setMemberModalProject`、`openEditModal(event, project)`、`handleDeleteClick(event, ids)`、`handleRowClick(id)`、设计令牌 `LK`。全部复用。
- Produces: 一个卡片网格替换原表格；本任务卡片**主体点击**沿用现有 `handleRowClick`（进 `project-detail`），切换+跳转行为在 Task 3 接入。

- [ ] **Step 1: 用卡片网格替换 DataTable 渲染块**

`pages/project/ProjectMgmtPage.tsx`，将第 731-873 行 `{(() => { const columns... return (<div className='px-4'><DataTable .../></div>); })()}` 整块替换为下面的卡片网格。`Building2`、`Users`、`Edit3`、`Trash2` 图标已在文件顶部导入；新增需要的 `ChevronRight`、`Check` 图标请在第 2-14 行的 lucide 导入中补上。

```tsx
        {tableLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={22} style={{ color: LK.muted }} />
          </div>
        ) : tableProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
            >
              <Building2 size={20} />
            </div>
            <p className="text-sm" style={{ color: LK.muted }}>
              {debouncedSearch.trim() ? '没有匹配的项目' : '当前没有项目'}
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {tableProjects.map((project) => {
                const canMembers = canManageProjectMembers(project);
                const canManage = !!project.can_manage;
                return (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(project.id)}
                    className="group relative flex flex-col rounded-xl p-4 text-left transition-all"
                    style={{
                      backgroundColor: LK.surfaceRaised,
                      border: `1px solid ${LK.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {/* 标题 + 详情入口 */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold" style={{ color: LK.ink }} title={project.name}>
                        {project.name}
                      </h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRowClick(project.id); }}
                        className="shrink-0 rounded-md p-1 transition-colors"
                        style={{ color: LK.muted }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = LK.muted; }}
                        title="项目详情"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* 基础信息 */}
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: LK.muted }}>归属部门</dt>
                        <dd className="truncate" style={{ color: LK.body }}>{project.department_name || '未绑定'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: LK.muted }}>产品版本</dt>
                        <dd className="truncate" style={{ color: LK.inkSoft }}>
                          {project.product_version || project.product_version_name || '未归属版本'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: LK.muted }}>创建人</dt>
                        <dd className="truncate" style={{ color: LK.body }}>{project.owner_name || '-'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: LK.muted }}>创建时间</dt>
                        <dd className="truncate" style={{ color: LK.muted }}>
                          {project.created_at ? new Date(project.created_at).toLocaleString() : '未知'}
                        </dd>
                      </div>
                    </dl>

                    {/* 右下角三个操作按钮：始终显示，无权限置灰 */}
                    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-3" style={{ borderColor: LK.border }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (canMembers) setMemberModalProject(project); }}
                        disabled={!canMembers}
                        className="rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: LK.muted }}
                        onMouseEnter={(e) => { if (canMembers) { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                        title={canMembers ? '成员管理' : '仅项目创建人或管理员可管理成员'}
                      >
                        <Users size={15} />
                      </button>
                      <button
                        onClick={(e) => { if (canManage) openEditModal(e, project); else e.stopPropagation(); }}
                        disabled={!canManage}
                        className="rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: LK.muted }}
                        onMouseEnter={(e) => { if (canManage) { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                        title={canManage ? '编辑项目' : '无编辑权限'}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={(e) => { if (canManage) handleDeleteClick(e, [project.id]); else e.stopPropagation(); }}
                        disabled={!canManage}
                        className="rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: LK.muted }}
                        onMouseEnter={(e) => { if (canManage) { e.currentTarget.style.backgroundColor = `${LK.error}22`; e.currentTarget.style.color = LK.error; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                        title={canManage ? '删除项目' : '无删除权限'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分页 */}
            {tableTotal > 0 && (
              <div className="mt-4 flex items-center justify-end gap-3 text-xs" style={{ color: LK.muted }}>
                <span>共 {tableTotal} 个项目</span>
                <button
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(safePage - 1)}
                  className="rounded-md px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ border: `1px solid ${LK.border}` }}
                >
                  上一页
                </button>
                <span>第 {safePage} / {Math.max(1, Math.ceil(tableTotal / pageSize))} 页</span>
                <button
                  disabled={safePage >= Math.ceil(tableTotal / pageSize)}
                  onClick={() => setCurrentPage(safePage + 1)}
                  className="rounded-md px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ border: `1px solid ${LK.border}` }}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 2: 补充 lucide 图标导入**

`pages/project/ProjectMgmtPage.tsx` 顶部图标导入块（第 2-14 行）加入 `Check` 与 `ChevronRight`（按字母序插入即可），供本任务与 Task 3 使用：

```tsx
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Edit3,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Users,
} from 'lucide-react';
```

- [ ] **Step 3: 运行 lint**

Run: `npm run lint`
Expected: 零报错。若提示 `DataTable`/`DataTableColumn` 已不再使用，删除第 18 行 import 中的 `DataTable, DataTableColumn,`（保留 `DropdownSelect, PageHeader`）。

- [ ] **Step 4: 手动验证卡片**

Run: `npm run dev`，进入「项目管理」。
验证：
1. 项目以卡片网格展示，每张卡显示名称、归属部门、产品版本、创建人、创建时间。
2. 右下角始终有 3 个按钮；无权限项目上按钮置灰、`cursor-not-allowed`、hover 出提示文案。
3. 有权限时：成员管理弹窗、编辑弹窗、删除确认均与改造前一致。
4. 搜索、分页、刷新、初始化项目按钮正常。
5. 点击卡片主体或右上角箭头 → 进入项目详情页（本任务暂为原行为，Task 3 改）。

- [ ] **Step 5: Commit**

```bash
git add pages/project/ProjectMgmtPage.tsx
git commit -m "feat(project): 项目列表改为卡片式展示，操作按钮始终可见无权限置灰"
```

---

## Task 3: 卡片点击 → 切换项目 + 选中动画 + 跳转测试任务

**Files:**
- Modify: `pages/project/ProjectMgmtPage.tsx`（新增 `justSelectedId` state 与 `handleCardSelect`；改卡片主体 onClick 与选中样式）

**Interfaces:**
- Consumes: props `setSelectedProjectId`、`setActiveProjectId`、`setCurrentView`（均已在 `ProjectMgmtPageProps` 中，见第 24-32 行）；`Check` 图标（Task 2 已导入）。
- Produces: 卡片主体点击行为变为「选中 + 切换全局项目 + 300ms 后跳 `task-list`」。

- [ ] **Step 1: 新增选中态 state 与跳转 timer 引用**

`pages/project/ProjectMgmtPage.tsx`，在组件内已有 state 声明区（约第 120 行 `const [error, setError] = ...` 附近）加入：

```tsx
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

（`useRef`、`useState` 已在第 1 行导入。）

- [ ] **Step 2: 新增 `handleCardSelect`，并在卸载时清理 timer**

在 `handleRowClick`（第 516-520 行）附近加入新处理函数：

```tsx
  // 卡片主体点击：选中 → 切换全局项目 → 约 300ms 后跳转测试任务页。
  // 顺序保证：先 setSelectedProjectId，再延时 setCurrentView，避免 task-list 门禁踢回首页。
  const handleCardSelect = (id: string) => {
    setJustSelectedId(id);
    setSelectedProjectId(id);
    setActiveProjectId(id);
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      setCurrentView('task-list');
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);
```

- [ ] **Step 3: 卡片主体改用 `handleCardSelect` 并加选中样式**

把 Task 2 中卡片根 `<div>` 的 `onClick={() => handleRowClick(project.id)}` 改为 `onClick={() => handleCardSelect(project.id)}`，并把内联 `style` 改为根据 `justSelectedId` 切换深蓝选中态：

```tsx
                    onClick={() => handleCardSelect(project.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCardSelect(project.id); }}
                    className="group relative flex flex-col rounded-xl p-4 text-left transition-all"
                    style={{
                      backgroundColor: justSelectedId === project.id ? LK.primaryMuted : LK.surfaceRaised,
                      border: `1px solid ${justSelectedId === project.id ? LK.primary : LK.border}`,
                      boxShadow: justSelectedId === project.id ? `0 8px 24px ${LK.primary}33` : 'none',
                      transform: justSelectedId === project.id ? 'translateY(-2px)' : 'none',
                      cursor: 'pointer',
                    }}
```

注意：右上角的「项目详情」箭头按钮保持 `onClick={(e) => { e.stopPropagation(); handleRowClick(project.id); }}`（进详情，不触发切换跳转），这是 Task 2 的写法，无需改动。

- [ ] **Step 4: 选中卡片右上角浮现勾选标记**

在卡片根 `<div>` 内最前面（标题块之上）插入仅选中时显示的勾选角标：

```tsx
                    {justSelectedId === project.id && (
                      <span
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full"
                        style={{ backgroundColor: LK.primary, color: '#fff' }}
                      >
                        <Check size={14} />
                      </span>
                    )}
```

- [ ] **Step 5: 运行 lint**

Run: `npm run lint`
Expected: 零报错。

- [ ] **Step 6: 手动验证切换+跳转**

Run: `npm run dev`，进入「项目管理」。
验证：
1. 点击某卡片主体 → 卡片立即变深蓝边框 + 背景微染 + 上提 + 右上角勾选角标。
2. 右上角项目指示器名称随即更新为该项目（Task 4 再加闪烁）。
3. 约 300ms 后自动跳转「测试任务」页，且**不被踢回首页**（验证门禁顺序正确）。
4. 进入测试任务页后，页面数据按新选中的项目过滤。
5. 点右上角箭头按钮仍进项目详情、不触发跳转测试任务。

- [ ] **Step 7: Commit**

```bash
git add pages/project/ProjectMgmtPage.tsx
git commit -m "feat(project): 卡片点击切换全局项目并跳转测试任务，含选中态动画"
```

---

## Task 4: 右上角指示器闪烁反馈 + 下拉弱化

**Files:**
- Modify: `styles.css`（文件末尾追加关键帧与工具类）
- Modify: `layout/Header.tsx`（指示器 `useEffect` 监听 `selectedProjectId`；下拉按钮样式弱化）

**Interfaces:**
- Consumes: Header 已有 props `selectedProjectId`、`projects`、`currentProject`（第 102 行）；`useEffect`、`useRef`、`useState` 已在第 17 行导入。
- Produces: 任意来源的 `selectedProjectId` 变化都会让右上角指示器闪烁一次；右上角下拉视觉弱化为次要入口。

- [ ] **Step 1: 在 styles.css 追加闪烁关键帧与工具类**

`styles.css` 文件末尾追加：

```css
@keyframes project-switch-flash {
  0%   { background-color: var(--brand-primary-mask); box-shadow: 0 0 0 2px var(--brand-primary); }
  60%  { background-color: var(--brand-primary-mask); box-shadow: 0 0 0 2px var(--brand-primary); }
  100% { background-color: transparent; box-shadow: 0 0 0 0 transparent; }
}
.project-switch-flash {
  animation: project-switch-flash 0.6s ease-out;
  border-radius: 0.75rem;
}
```

- [ ] **Step 2: Header 监听 selectedProjectId 变化触发闪烁**

`layout/Header.tsx`，在 `const currentProject = ...`（第 102 行）之后加入 ref 与 effect：

```tsx
  const currentProject = projects.find((p) => p.id === selectedProjectId) || { name: '选择项目' };

  const projectIndicatorRef = useRef<HTMLDivElement>(null);
  const isFirstProjectRender = useRef(true);
  useEffect(() => {
    // 跳过首次挂载，仅在后续切换时闪烁
    if (isFirstProjectRender.current) {
      isFirstProjectRender.current = false;
      return;
    }
    const el = projectIndicatorRef.current;
    if (!el) return;
    el.classList.remove('project-switch-flash');
    // 强制 reflow 以便重复触发动画
    void el.offsetWidth;
    el.classList.add('project-switch-flash');
    const onEnd = () => el.classList.remove('project-switch-flash');
    el.addEventListener('animationend', onEnd, { once: true });
    return () => el.removeEventListener('animationend', onEnd);
  }, [selectedProjectId]);
```

- [ ] **Step 3: 给指示器容器挂上 ref 并弱化下拉按钮**

`layout/Header.tsx` 第 249-259 行，给外层容器加 `ref={projectIndicatorRef}`，并弱化按钮样式（缩小、降透明度、去常驻边框）：

```tsx
          <div className="relative min-w-0 max-w-[15rem]" ref={projectDropdownRef}>
            <div ref={projectIndicatorRef}>
              <button
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="flex items-center gap-1.5 px-1.5 py-1 max-w-[13rem] rounded-xl text-xs font-medium opacity-70 hover:opacity-100 head-tab-hover transition-opacity"
                title="快速切换项目（主入口在“项目管理”页）"
              >
                <span className="truncate flex-1 text-left">{currentProject.name}</span>
                <span onClick={(e) => { e.stopPropagation(); fetchProjects(true); }} className="shrink-0 text-theme-text-faint text-theme-text-primary-hover transition-all">
                  <RotateCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                </span>
                <ChevronDown size={12} className="shrink-0 text-theme-text-faint" />
              </button>
            </div>
            {isProjectDropdownOpen && (
```

注意：原 `{isProjectDropdownOpen && (...)}` 下拉面板（第 260-285 行）整体保留不动，只是现在嵌在新加的 `<div ref={projectIndicatorRef}>` 的**同级**（面板仍由外层 `projectDropdownRef` 容器包裹）。确认闭合标签：新加的 `<div ref={projectIndicatorRef}>` 在 `</button>` 后立即 `</div>` 闭合，下拉面板留在其外、`projectDropdownRef` 容器内。

- [ ] **Step 4: 运行 lint**

Run: `npm run lint`
Expected: 零报错。

- [ ] **Step 5: 手动验证闪烁与弱化**

Run: `npm run dev`。
验证：
1. 右上角项目指示器明显弱化（更小、半透明、无常驻边框），hover 时恢复清晰。
2. 在「项目管理」点卡片切换 → 右上角指示器闪烁一次蓝色高亮并更新名称。
3. 直接用右上角下拉切换项目 → 指示器同样闪烁一次（验证「任意来源」一致反馈）。
4. 首次进入页面（挂载）时不闪烁。
5. 连续快速切换两个不同项目，第二次仍能正常闪烁（验证 reflow 重触发）。

- [ ] **Step 6: Commit**

```bash
git add styles.css layout/Header.tsx
git commit -m "feat(header): 项目切换时右上角指示器闪烁反馈，下拉切换器视觉弱化"
```

---

## Self-Review（已执行）

**1. Spec coverage**
- §1 导航位置 → Task 1（全部子项）。✅
- §2 列表改卡片 + 3 按钮始终显示无权限置灰 + 详情按钮 → Task 2。✅
- §3 选中态 + 右上角闪烁 + 300ms 跳转 + 下拉弱化 → Task 3（选中/跳转）+ Task 4（闪烁/弱化）。✅
- §4 门禁与顺序（先 set 再延时跳转、project-mgmt 不进 PROJECT_REQUIRED_VIEWS）→ Global Constraints + Task 3 Step 2/Step 6。✅
- §5 验证 → 各任务手动验证步骤。✅

**2. Placeholder scan**：无 TBD/TODO；所有代码步骤含完整代码与确切行号。✅

**3. Type consistency**：`handleCardSelect`/`justSelectedId`/`navTimerRef`/`projectIndicatorRef` 命名贯穿一致；`AssetsCenterChildKey` 在 Task 1 Step 6/7 同步收窄；新 nav key `'project-mgmt-nav'` 在类型联合、数组、映射、默认 view、侧边栏五处一致。✅

**4. 跨模块反馈**：右上角闪烁放在 Header 监听 `selectedProjectId`（Task 4），与卡片页解耦，覆盖「卡片切换」「下拉切换」两种来源。✅
