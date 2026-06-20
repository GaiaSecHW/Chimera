# OPENCODE_TASK.md — Chimera Design System 迁移任务

> **读此文件后立刻开始执行，不要重新审查已完成工作。**
> 配套文档：`HANDOFF_FOR_OPENCODE.md`（详细规范与 API 参考）
> 项目路径：`/c/zwd_work/Chimera`（Git Bash / Windows）
> 当前分支：`local`，跟踪 `origin/local`

---

## 禁止事项

- ❌ 禁止重新审查或重构 P0/P1/P2-B1~B4 已完成的组件和迁移
- ❌ 禁止修改 `design-system/` 目录下的组件实现（除非有明确 bug）
- ❌ 禁止修改以下两个既有基线错误所在文件的报错行：
  - `pages/execution/EntryAnalysisConfigPage.tsx`（Expected 0 arguments）
  - `pages/execution/SystemAnalysisConfigPage.tsx`（super_fast_mode missing）
- ❌ 禁止新增任何 CSS 变量或修改 `styles.css` 的 Token 定义区
- ❌ 禁止使用 `rowKey="string"` / `emptyText=` / `rowClassName=` / `title:` 等 DataTable 不支持的 prop
- ❌ 禁止在 Modal 的 open 条件里用 `open={cond && !!obj}` 模式（会 null crash）

---

## 任务一：P2-B5 — 全局 PageHeader 迁移

### 目标
将所有页面的内联手写页头替换为 `PageHeader` 组件。

### 验证基线（开始前跑一次）
```bash
cd /c/zwd_work/Chimera
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望输出：2（固定基线，不得增加）
```

### import 路径
```tsx
import { PageHeader } from '../../design-system';
// 路径相对于调用文件，如 pages/vuln/X.tsx → '../../design-system'
// pages/vuln/vuln-engine/X.tsx → '../../../design-system'
```

### 识别页头的特征
```tsx
// 特征1：standalone h1/h2
<h1 className="text-2xl font-black text-theme-text-primary">标题</h1>
<p className="text-sm text-theme-text-muted">副标题</p>

// 特征2：flex justify-between 包裹标题+按钮
<div className="flex items-center justify-between ...">
  <div>
    <h1 ...>标题</h1>
    <p>副标题</p>
  </div>
  <div className="flex gap-2">
    <button>操作</button>
  </div>
</div>

// 特征3：带返回按钮
<button onClick={goBack}><ArrowLeft/> 返回</button>
<h1 ...>标题</h1>
```

### 替换后的标准形态
```tsx
// 基础列表页
<PageHeader
  title="页面标题"
  description="一句话说明"
  actions={<button className="btn btn-primary">新建</button>}
/>

// 详情页（带返回）
<PageHeader
  title="详情标题"
  back={{ label: '返回', onClick: () => onNavigate('list-view') }}
  actions={<button className="btn btn-secondary">导出</button>}
/>

// 无操作的简单页头
<PageHeader title="页面标题" description="说明文字" />
```

### PageHeader Props（完整）
```ts
interface PageHeaderProps {
  title: React.ReactNode;           // 必填
  description?: React.ReactNode;    // 副标题
  actions?: React.ReactNode;        // 右侧操作区
  back?: { label?: string; onClick: () => void }; // 返回按钮
  className?: string;
}
```

### 执行顺序（按域，每域一个 commit）

**第1域：`pages/project/`（3文件，最简单，先热身）**
- `project/ProductMgmtPage.tsx`
- `project/ProjectDetailPage.tsx`
- `project/ProjectMgmtPage.tsx`

**第2域：`pages/task/`（5文件）**
- `task/KnowledgeGraphPage.tsx`
- `task/TaskCenterPage.tsx`
- `task/TaskCenterTimelinePage.tsx`
- `task/WebEndToEndPage.tsx`
- `task/TaskVulnListPage.tsx`（若存在）

**第3域：`pages/orchestration/`（9文件）**
- `orchestration/AppTemplatePage.tsx`
- `orchestration/AppTemplateDetailPage.tsx`
- `orchestration/AppInstancePage.tsx`
- `orchestration/AppInstanceDetailPage.tsx`
- `orchestration/JobTemplatePage.tsx`
- `orchestration/JobTemplateDetailPage.tsx`
- `orchestration/WorkflowInstancePage.tsx`
- `orchestration/WorkflowInstanceDetailPage.tsx`
- `orchestration/WorkflowInstanceLogsPage.tsx`

**第4域：`pages/ai4app/`（3文件）**
- `ai4app/AppScanOverviewPage.tsx`
- `ai4app/AppScanMonitorPage.tsx`
- `ai4app/AppScanTaskDetailPage.tsx`

**第5域：`pages/vuln/`（9文件，VulnIntakePage 已迁移跳过）**
跳过：`vuln/VulnIntakePage.tsx`（已完成）
- `vuln/VulnOverviewPage.tsx`
- `vuln/VulnParameterConfigPage.tsx`
- `vuln/VulnAutoVerifyCreatePage.tsx`
- `vuln/ReviewJudgmentPage.tsx`
- `vuln/VulnEnginePage.tsx`（工作区布局，仅加页头，不改主体）
- `vuln/vuln-engine/CasesWorkspace.tsx`（子组件，**跳过**）
- `vuln/vuln-engine/VulnCaseDetailLayout.tsx`（判断是否是顶级页面）
- `vuln/vuln-engine/WorkspaceViews.tsx`（子组件，**跳过**）

**第6域：`pages/assets/`（6文件，跳过工作区）**
跳过：`assets/ProjectFileExplorerPage.tsx`（2233行工作区布局）
- `assets/BaseResourcePage.tsx`
- `assets/FileserverArchiveTasksPage.tsx`
- `assets/PvcManagementPage.tsx`
- `assets/StaticPackageDetailPage.tsx`
- `assets/TaskMgmtPage.tsx`

**第7域：`pages/platform/`（17文件，部分已有 B3 改动）**
跳过：`platform/MachineTokenPage.tsx`（自定义 hero banner）
- 其余 16 个文件逐一处理

**第8域：`pages/environment/`（17文件）**
跳过：`environment/WorkflowPage.tsx`（工作区）
- 其余 16 个文件逐一处理

**第9域：`pages/execution/`（32文件，最大）**
跳过：
- `execution/AgentSessionDialogHeader.tsx`（是子组件 header，非页面）
- `execution/BinaryEvolutionShared.tsx`（共享子组件）
- `execution/binarySecurityMetricsDataflowVuln.tsx`（数据/工具文件）
- `execution/b2s-advanced/ReviewEffectivenessPanel.tsx`（面板子组件）
- 已迁移：`execution/DataflowVulnScannerPage.tsx`（已完成）
- 其余约 27 个文件逐一处理

**收尾：单独页面**
- `pages/DashboardPage.tsx`
- `pages/HomePage.tsx`

### 每域 commit 格式
```bash
git add -A
git commit -m "refactor(P2-B5): add PageHeader to <域名> pages"
git pull --rebase origin local
git push origin local
```

### 每域验证
```bash
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望：2（不得增加）
```

---

## 任务二：P3 — 规范收敛清理

> 开始 P3 前，B5 必须已全部完成并推送。

### P3-1：移除 glow（一次性，改 `styles.css`）

定位并修改以下行（用 `grep -n "rgba(59" styles.css` 确认行号）：

```css
/* 删除这三行 box-shadow glow */
/* styles.css 约第163行 .theme-shell-active */
box-shadow: 0 2px 12px rgba(59, 130, 246, 0.32);   /* → 删除整行 */

/* 约第199行 .theme-primary-button */
box-shadow: 0 2px 12px rgba(59, 130, 246, 0.28);   /* → 删除整行 */

/* 约第204行 .theme-primary-button:hover */
box-shadow: 0 4px 18px rgba(59, 130, 246, 0.36);   /* → 删除整行 */

/* 约第221行 focus 状态 */
box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);    /* → 改为 box-shadow: 0 0 0 2px var(--brand-soft); */
```

commit：`fix(P3): remove blue glow shadows from styles.css`

### P3-2：`font-black` 替换（~3081处，按语义）

**替换规则：**
```
h1/h2/h3 页面标题、卡片区块标题  → font-semibold
按钮文字、标签文字、徽章文字      → font-medium
大数值（text-2xl/3xl 数字）       → font-bold
表头文字（uppercase tracking）    → font-semibold
正文/描述文字                      → font-medium 或 font-normal
```

**禁止：** 不要把所有 `font-black` 机械替换成同一个值。

**优先顺序：**
1. `layout/Header.tsx` 和 `layout/Sidebar.tsx`（全局框架先干净）
2. `pages/platform/` 所有弹窗内部（B3 只换了壳，内部还有大量 `font-black`）
3. `pages/execution/` Config 和 Detail 页
4. `pages/vuln/` `pages/assets/`
5. 其余域

**每域完成后 tsc 验证，按域 commit：**
```bash
git commit -m "refactor(P3): replace font-black in <域名> pages"
```

### P3-3：卡片 `bg-app` 违规修复（~102文件）

**识别规则：** `rounded-xl`/`rounded-2xl`/`rounded-[Xrem]` 与 `bg-theme-bg-app` 同时出现时，该元素是卡片，背景改为 `bg-theme-surface`。

**不改：** 页面根容器的 `bg-theme-app`/`bg-theme-bg-app`（这是最深底色，正确）。

```bash
# 扫描违规文件
grep -rl "bg-theme-bg-app\|bg-theme-app" --include=*.tsx pages | wc -l
```

**按域逐文件修改，每域一个 commit：**
```bash
git commit -m "fix(P3): fix bg-surface layering violations in <域名>"
```

### P3-4：超标圆角修正（31文件）

```
rounded-3xl → rounded-2xl（弹窗）或 rounded-xl（卡片）
rounded-[3rem]/rounded-[2.5rem] → rounded-xl（卡片）
rounded-[2rem] → rounded-xl（卡片）
控件上的 rounded-2xl → rounded-lg（input/button）
```

可与 P3-2/P3-3 合并在同一文件修改时顺带处理。

### P3-5：`window.confirm/alert` → `useUiFeedback`（10文件）

```tsx
// 替换前
if (!window.confirm('确认删除？')) return;

// 替换后
import { useUiFeedback } from '../../components/UiFeedback';
const { confirm } = useUiFeedback();
// ...
const ok = await confirm({ message: '确认删除？', danger: true });
if (!ok) return;
```

**注意：** `confirm` 是 async，调用处函数需改为 `async`。

扫描目标：
```bash
grep -rl "window\.confirm\|window\.alert" --include=*.tsx pages
```

---

## 关键工作流

### 开始每个文件前
```bash
# 确认基线
npx tsc --noEmit 2>&1 | grep -cE "error TS"  # 期望 2
```

### 每域完成后
```bash
git add -A
git commit -m "refactor(P2-B5|P3): <描述>"
git pull --rebase origin local  # 远程活跃，必须先 pull
git push origin local
```

### 遇到 rebase 冲突时
- `VulnIntakePage.tsx` 优先保留远程文案，用 DS 组件渲染
- `design-system/` 内文件冲突极少，用我们的版本
- 其他页面冲突：保留远程业务逻辑，仅保留我们的 DS import 和组件替换

---

## 跳过文件完整清单（不要修改）

| 文件 | 原因 |
|---|---|
| `pages/assets/ProjectFileExplorerPage.tsx` | 2233行工作区，无标准页头 |
| `pages/environment/WorkflowPage.tsx` | 工作区布局 |
| `pages/platform/MachineTokenPage.tsx` | 自定义渐变 hero banner |
| `pages/execution/AgentSessionDialogHeader.tsx` | 子组件非页面 |
| `pages/execution/BinaryEvolutionShared.tsx` | 共享子组件 |
| `pages/execution/binarySecurityMetricsDataflowVuln.tsx` | 数据工具文件 |
| `pages/execution/b2s-advanced/ReviewEffectivenessPanel.tsx` | 面板子组件 |
| `pages/vuln/vuln-engine/CasesWorkspace.tsx` | 工作区子组件 |
| `pages/vuln/vuln-engine/WorkspaceViews.tsx` | 工作区子组件 |
| `pages/assets/BaseResourcePage.tsx` 表格 | rowClassName 不兼容 DataTable |
| `pages/assets/PvcManagementPage.tsx` 表格 | rowProps/onContextMenu 不兼容 |
| `pages/assets/ChimeraScheduleCenterPage.tsx` 表格 | 动态 visibleColumns |
| `pages/vuln/VulnIntakePage.tsx` | B4已完成，**不要再改** |
| `pages/execution/DataflowVulnScannerPage.tsx` | B2已完成，**不要再改** |

---

## 最终验收标准

B5 完成时：
- [ ] `grep -rl "PageHeader" --include=*.tsx pages | wc -l` 数量显著增加（期望 80+）
- [ ] `npx tsc --noEmit 2>&1 | grep -cE "error TS"` 仍为 2

P3 完成时：
- [ ] `grep -rE "font-black" --include=*.tsx pages | wc -l` 趋近 0
- [ ] `grep -n "box-shadow.*rgba(59, 130, 246" styles.css` 无 glow 行
- [ ] `grep -rl "bg-theme-bg-app" --include=*.tsx pages | wc -l` 趋近 0
- [ ] `npx tsc --noEmit 2>&1 | grep -cE "error TS"` 仍为 2
