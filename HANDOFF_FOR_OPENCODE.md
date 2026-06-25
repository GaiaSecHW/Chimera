# HANDOFF_FOR_OPENCODE.md

> 项目：Chimera · 企业级 AI 安全研发平台
> 分支：`local`（跟踪 `origin/local`）
> 最后提交：`6ac3c9b` refactor(P2-B4)
> 编写日期：2026-06-18
> 目的：让接手模型能继续执行 **B5（全局 PageHeader 迁移）** 和 **P3（规范收敛清理）**。

---

## 1. 项目背景

Chimera 是 React 19 + TypeScript 5 + Tailwind CSS 3 + Vite 6 的单页应用（SPA），无 URL 路由，通过 view key 切换视图。

**关键文件：**
- `styles.css` — CSS 变量主题源 + `@layer components`（`.btn-*` / `.form-*` / `.modal-*` 等）
- `tailwind.config.js` — 语义色引用变量，content 路径含 `design-system/**`
- `DESIGN.md` — 设计规范（目标态）
- `design-system/` — 本次新建的设计系统（primitives + application）
- `app/navigation.tsx` — 导航结构
- `app/viewRegistry.tsx` — 视图注册

**技术约定：**
- 所有 import 用相对路径（`../../design-system`），不用 `@/` 别名（虽然 tsconfig 定义了，但项目未实际使用）
- `tsc --noEmit` 是 lint 命令（`npm run lint`）
- 既有基线 tsc 错误 2 个（与本工作无关，**不要去修**）：
  - `pages/execution/EntryAnalysisConfigPage.tsx` — Expected 0 arguments but got 1
  - `pages/execution/SystemAnalysisConfigPage.tsx` — Property 'super_fast_mode' is missing

---

## 2. DESIGN.md 核心规范摘要

### 颜色 Token
```
背景层级（深色→浅）：app #070d18 → surface #111a2b → elevated #18233a
文本：primary #f5f7ff · secondary #d6def0 · muted #a4aec4 · faint #72809a
边框：default #26324a · subtle #1b2438
品牌：primary #2563EB · hover #3B82F6
语义：success #10b981 · warning #f59e0b · danger #f43f5e · info #3b82f6
```

### 关键原则
- **卡片必须用 `bg-theme-surface`**，不可用 `bg-theme-app`（层级铁律）
- **边框用 `border-theme-border`**（1px 弱边框）
- **圆角**：控件 `rounded-lg`(8px)，卡片 `rounded-xl`(12px)，弹窗 `rounded-2xl`(16px)
- **禁止 glow**：无 `box-shadow: 0 0 Xpx rgba(59,130,246,...)` 外发光
- **字重目标**：正文 `font-normal`，按钮/标签 `font-medium`，标题 `font-semibold`，关键指标 `font-bold`，**禁用 `font-black`**
- **间距基准 4px**，页面根 padding `px-5 py-5 md:px-6 2xl:px-8`

---

## 3. 已完成内容（P0–P2.B4）

### P0 ✅ design-system/primitives/
| 组件 | 文件 | 说明 |
|---|---|---|
| Button | primitives/Button/ | variant: primary/secondary/ghost/danger; loading/icon/iconOnly |
| Input | primitives/Input/ | invalid/prefix/suffix |
| Select | primitives/Select/ | options/placeholder |
| FormField | primitives/FormField/ | label/hint/error/required |
| Card | primitives/Card/ | 背景强制 bg-surface，padding: none/sm/md/lg |
| Modal | primitives/Modal/ | createPortal+inline-style overlay；open/onClose/size/title/description/footer/closeOnOverlay/closeOnEsc/className |
| SegmentedControl | primitives/SegmentedControl/ | value/onChange/options/icon/size/aria-label |

### P1 ✅ design-system/application/
| 组件 | 文件 |
|---|---|
| PageHeader | application/PageHeader/ |
| StatisticCard | application/StatisticCard/ |
| PageSection | application/PageSection/ |
| EmptyState | application/EmptyState/ |
| Toolbar + SearchInput | application/Toolbar/ |
| DataTable + Pagination | application/DataTable/ |
| FormActionBar | application/FormActionBar/ |

**统一出口：** `import { ... } from '../../design-system'`（路径相对于调用文件）

### P2.B1 ✅ execution Config 页（9 文件）
`SectionCard`/`FieldRow`/`PanelActions` → `PageSection`/`FormField`/`FormActionBar`
- DataflowAnalysis/DataflowVulnScan/EntryAnalysis/BinarySecurity/SystemAnalysis/FirmwareUnpack/B2S ConfigPage
- EntryAnalysis/SystemAnalysis ModelsPage

### P2.B2 ✅ execution Detail 页（7 文件）
`MetricCard` → `StatisticCard`（含 tone/hint 字段映射）
- DataflowAnalysis/DataflowVulnScan/EntryAnalysis/SystemAnalysis TaskDetailPage
- MobileSecurityIpcVulnPage / BinarySecurityMetricsDashboardPage / DataflowVulnScannerPage

### P2.B3 ✅ platform 域
- 私有卡片（4 文件）：MetricCard/SummaryCard → StatisticCard（含 tone 枚举映射）
- 弹窗（17 处）：RoleMgmtPage/DepartmentPage/MachineTokenPage/ProjectPage/UserMgmtPage/DepartmentMemberPage/ConfigCenterLlmPage/AiGatewayPage
- 表格（9 个）：RoleMgmtPage/OnlineSessionPage/MachineTokenPage/ProjectPage/UserPermissionPage/UserMgmtPage/DepartmentMemberPage/AiGatewayDashboardPage/AiGatewayTokenStatsPage/AiGatewayPage(3个)

### P2.B4 ✅ vuln/assets 域
- 弹窗（13 处）：VulnEnginePage/BaseResourcePage/DeployScriptPage/PvcManagementPage/StaticPackagesPage/TaskMgmtPage
- 表格（4 个）：ReviewJudgmentPage/DeployScriptPage/StatisticPackagesPage/TaskMgmtPage
- StatCards → StatisticCard：`pages/vuln/vuln-engine/shared.tsx`

---

## 4. B5 执行规则：PageHeader 迁移

### 目标
将全站所有页面的内联手写页头替换为 `PageHeader` 组件。

### 未迁移文件域分布（约 110 个文件含内联标题）
```
pages/execution/  约32文件
pages/environment/ 约17文件
pages/platform/   约17文件（B3已做表格/弹窗，页头未动）
pages/vuln/       约9文件
pages/orchestration/ 约9文件
pages/task/       约5文件
pages/assets/     约6文件
pages/project/    约3文件
```

### 已迁移样本（参考）
`pages/vuln/VulnIntakePage.tsx`：
```tsx
import { ..., PageHeader, ... } from '../../design-system';

<PageHeader
  title="漏洞中心"
  description="统一管理当前项目的漏洞生命周期，覆盖上报、研判、验证与处置全流程"
/>
```

详情页样本（带返回）：
```tsx
<PageHeader
  title="任务详情"
  back={{ label: '返回列表', onClick: () => onNavigate('task-list') }}
  actions={<Button variant="primary">操作</Button>}
/>
```

### 识别规则
找每个页面文件顶部的页头区域，特征：
```tsx
// 常见模式1：纯标题
<h1 className="text-2xl font-black text-theme-text-primary">页面标题</h1>
<p className="text-sm text-theme-text-muted">副标题</p>

// 常见模式2：标题+操作
<div className="flex items-center justify-between">
  <h1 className="text-2xl ...">标题</h1>
  <button>操作</button>
</div>

// 常见模式3：带返回
<button onClick={...}><ArrowLeft/>返回</button>
<h1 ...>标题</h1>
```

### 替换原则
1. **只替换页头区域**，不动页面其余内容
2. `title` = 原 `h1`/`h2` 文案
3. `description` = 紧跟标题的副标题文案（`text-sm text-muted`）
4. `actions` = 右侧操作按钮区
5. `back` = 返回按钮的 `{ label?, onClick }`
6. 删除原来的包裹 div（通常是 `flex justify-between` 那层）
7. **不要改页面其余内容**

### PageHeader 完整 Props
```ts
interface PageHeaderProps {
  title: React.ReactNode;          // 必填
  description?: React.ReactNode;   // 副标题，可选
  actions?: React.ReactNode;       // 右侧操作区，可选
  back?: { label?: string; onClick: () => void }; // 返回按钮，可选
  className?: string;
}
```

---

## 5. P3 执行规则：规范收敛清理

### P3-1：移除 glow（一次性，改 styles.css）
删除 `styles.css` 中的蓝色 glow：
- 第 163 行 `.theme-shell-active` 的 `box-shadow: 0 2px 12px rgba(59, 130, 246, 0.32);` → 删除
- 第 199 行 `.theme-primary-button` 的 `box-shadow: 0 2px 12px rgba(59, 130, 246, 0.28);` → 删除
- 第 204 行 `.theme-primary-button:hover` 的 `box-shadow: 0 4px 18px rgba(59, 130, 246, 0.36);` → 删除
- 第 221 行 `focus` 的 `box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);` → 改为 `box-shadow: 0 0 0 2px var(--brand-soft);`（已是正确值，确认即可）

### P3-2：font-black 替换（约 3081 处，按语义）
替换规则：
```
页面主标题 (h1/h2)    → font-semibold
卡片区块标题          → font-semibold
按钮/标签/徽章        → font-medium
关键数值（大数字）    → font-bold
表头 uppercase        → font-semibold（ExecutionTable 已是，其余手写表头）
正文/描述             → font-medium 或 font-normal
```

**注意**：不要机械全部替换成 `font-semibold`，按上述语义判断。

优先级（先改这些，收益最大）：
1. `design-system/` 内部（应已为零，确认）
2. `pages/platform/` 内弹窗内部
3. `pages/execution/` Config 页的遗留
4. layout/Header.tsx / layout/Sidebar.tsx

### P3-3：卡片 bg-app 违规（约 102 文件）
将作为卡片/面板背景的 `bg-theme-bg-app`/`bg-theme-app` 改为 `bg-theme-surface`。

**识别**：`rounded-xl`/`rounded-2xl` 与 `bg-theme-bg-app` 同时出现的情况。
**不改**：页面根容器的 `bg-theme-app`（它本来就该是最深底色）。

### P3-4：超标圆角（31 文件）
- 卡片/面板 `rounded-3xl`/`rounded-[3rem]`/`rounded-[2.5rem]` → `rounded-xl`（12px）
- 弹窗 `rounded-3xl` → `rounded-2xl`（16px）
- 控件（input/button）`rounded-2xl` → `rounded-lg`（8px）

### P3-5：window.confirm/alert → useUiFeedback（35 文件）
```tsx
// 替换前
const ok = window.confirm('确认删除？');

// 替换后
const { confirm } = useUiFeedback();
const ok = await confirm({ message: '确认删除？', danger: true });
```
注意：`confirm` 返回 Promise，调用处需 `async/await`。

---

## 6. PageHeader 迁移标准

### 标准列表页骨架
```tsx
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader
    title="页面名称"
    description="一句话说明"
    actions={<Button variant="primary" icon={<Plus size={14}/>}>新建</Button>}
  />
  {/* 可选：指标卡行 */}
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <StatisticCard label="总数" value={total} />
  </div>
  {/* 可选：工具栏 */}
  <Toolbar search={...} filters={...} actions={...} />
  {/* 数据表格 */}
  <DataTable columns={...} data={...} rowKey={...} />
</div>
```

### 标准详情页骨架
```tsx
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader
    title="详情标题"
    back={{ label: '返回', onClick: () => onNavigate('list') }}
    actions={<Button variant="secondary">导出</Button>}
  />
  <PageSection title="基础信息">...</PageSection>
  <PageSection title="配置项">...</PageSection>
</div>
```

### 不需要加 PageHeader 的情况
- 页面是**工作区/编辑器**布局（如 ProjectFileExplorerPage、WorkflowPage、VulnEnginePage 主体）
- 页面已经有自定义大型 hero banner（如 MachineTokenPage 顶部渐变横幅）
- 组件不是页面级（如 shared.tsx 里的子组件）

---

## 7. DataTable 使用标准

### Props（只有这些，其余不支持）
```ts
interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;        // 注意：不是 title
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;     // 必须是函数，不能是字符串
  loading?: boolean;
  empty?: React.ReactNode;        // 不是 emptyText
  onRowClick?: (row: T) => void;  // 只有一个参数，没有 event
  minWidth?: number;              // 默认 1080
  pagination?: { page, perPage, total, onPageChange, onPerPageChange? };
  bulkActions?: { selectedKeys, onSelectChange, render };
  className?: string;
}
```

### 常见错误（避免）
```tsx
// ❌ 错
rowKey="id"
rowKey={(row, e) => ...}
emptyText="暂无数据"
rowClassName={...}
rowProps={...}
title: '列名'

// ✅ 对
rowKey={(row) => String(row.id)}
empty={<div>暂无数据</div>}
header: '列名'
```

### 标准用法（IIFE 模式）
```tsx
{(() => {
  const columns: DataTableColumn<MyType>[] = [
    { key: 'name', header: '名称', render: (row) => <span>{row.name}</span> },
    { key: 'status', header: '状态', align: 'center', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', header: '操作', align: 'right', render: (row) => (
      <button onClick={() => handleDelete(row.id)} className="btn-danger-soft">删除</button>
    )},
  ];
  return (
    <DataTable<MyType>
      columns={columns}
      data={filteredItems}
      rowKey={(row) => String(row.id)}
      loading={loading}
      minWidth={900}
    />
  );
})()}
```

---

## 8. Modal 使用标准

### Props
```ts
interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: 'md' | 'xl';             // 控制内置尺寸类，可被 className 覆盖
  title?: React.ReactNode;        // 不传则不渲染内置头部
  description?: React.ReactNode;
  footer?: React.ReactNode;       // 不传则不渲染内置底部
  closeOnOverlay?: boolean;       // 默认 true
  closeOnEsc?: boolean;           // 默认 true
  children: React.ReactNode;
  className?: string;             // 追加到容器，用于指定 max-w-*
}
```

### 关键：null crash 防护
当弹窗依赖一个可能为 null 的对象时，**不能** 只在 open 条件里加 `!!obj`：

```tsx
// ❌ 错（children 仍会被求值，obj.name 崩溃）
<Modal open={isOpen && !!selectedItem} onClose={...}>
  <h3>{selectedItem.name}</h3>
</Modal>

// ✅ 对（obj 为 null 时根本不渲染 Modal）
{selectedItem && (
  <Modal open={isOpen} onClose={...}>
    <h3>{selectedItem.name}</h3>
  </Modal>
)}
```

### Modal 外壳迁移模式（shell-only）
将内联弹窗外壳替换为 Modal，内部内容保持原样：
```tsx
// 原来
{isOpen && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center ...">
    <div className="bg-theme-bg-app w-full max-w-md rounded-[3rem] ...">
      {/* 内容 */}
    </div>
  </div>
)}

// 替换后
<Modal open={isOpen} onClose={() => setIsOpen(false)} className="max-w-md">
  {/* 内容原样保留，删除两层外层 div */}
</Modal>
```

**注意**：替换时删除两层外层 div，保留内部所有内容。如果内层有一个 `<div className="... max-w-md ...">` 作为容器，也要删除（它的宽度已经由 Modal className 接管）。

---

## 9. StatisticCard 使用标准

### Props
```ts
type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface StatisticCardProps {
  label: React.ReactNode;           // text-xs uppercase 小标签
  value: React.ReactNode;           // text-3xl 大数值
  icon?: React.ReactNode;
  trend?: { direction: 'up' | 'down'; value: string };
  hint?: React.ReactNode;           // 数值下方小字说明
  tone?: StatTone;                  // 数值颜色
  onClick?: () => void;
  className?: string;
}
```

### tone 映射参考（私有组件迁移时）
```
emerald/green/成功/active/healthy → 'success'
rose/red/失败/danger/error        → 'danger'
amber/orange/warning/pending      → 'warning'
blue/info                         → 'info'
indigo/brand/primary              → 'brand'
slate/default/neutral/无          → 'default'（省略 tone）
```

### 常见私有组件替换
```tsx
// 原来（各种私有 StatCard/MetricCard/SummaryCard）
const StatCard = ({ label, value }) => (
  <div className="metric-card">
    <div className="text-[11px] uppercase">{label}</div>
    <div className="text-2xl font-black">{value}</div>
  </div>
);

// 替换后
import { StatisticCard } from '../../design-system';
// 调用点不变，只改实现体：
const StatCard = ({ label, value }) => <StatisticCard label={label} value={value} />;
```

---

## 10. 已知例外情况（跳过，不要改）

### 表格跳过
| 文件 | 原因 |
|---|---|
| `pages/assets/BaseResourcePage.tsx` 表格 | 需要 `rowClassName`（行选中高亮），DataTable 不支持 |
| `pages/assets/PvcManagementPage.tsx` 表格 | 需要 `rowProps`/`onContextMenu`，DataTable 不支持 |
| `pages/assets/ChimeraScheduleCenterPage.tsx` 所有表格 | 动态 `visibleColumns`，列不能静态定义 |
| `pages/assets/ProjectFileExplorerPage.tsx` 表格 | 2233 行工作区布局，文件树结构复杂 |

### PageHeader 跳过
| 文件 | 原因 |
|---|---|
| `pages/assets/MachineTokenPage.tsx` | 有自定义渐变 hero banner，不加 PageHeader |
| `pages/environment/WorkflowPage.tsx` | 工作区布局，无标准页头 |
| `pages/vuln/vuln-engine/` 内子组件 | 非页面级，不加页头 |

### 弹窗跳过
| 位置 | 原因 |
|---|---|
| `pages/platform/AiGatewayPage.tsx` 末尾全屏面板 | `fixed inset-0 z-[260]` 是全屏密钥管理面板，不是居中弹窗 |
| 各文件 `z-[160]` 弹窗（导入预览） | z-index 高于 Modal 默认值（z-9999），保留原有结构 |
| `pages/assets/DepartmentMemberPage.tsx` 第 842 行 import 弹窗 | z-[160]，保留 |

---

## 11. 剩余风险项

### 高风险
1. **B5 PageHeader 量大**：~110 个文件，每个页面的页头结构各不同，需逐文件读取判断。建议每次处理一个域（execution/platform/vuln 等），域内完成后立即 tsc 验证。

2. **P3 font-black 语义判断**：3081 处不能盲目全替成 `font-semibold`，需按上下文判断字重级别。建议从 `design-system/` 内部和 `layout/` 开始，确保核心组件先干净。

### 中风险
3. **Modal null crash 模式**：所有涉及条件渲染的弹窗，必须用 `{obj && <Modal open={...}>` 而不是 `open={...&&!!obj}`。每次迁移弹窗时核查。

4. **VulnIntakePage 已被多次修改**：这个文件经历了最多的改动和冲突解决，如需再改，先仔细阅读当前状态。

5. **DataTable 不支持的 prop**：子代理常错误使用 `rowKey="string"`（应为函数）、`emptyText`（应为 `empty`）、`title:`（应为 `header:`）、`rowClassName`/`rowProps`（不支持）。每次 tsc 后检查这类错误。

### 低风险
6. **git 合并冲突**：远程分支活跃（多人提交），每次 push 前先 fetch，用 `git pull --rebase origin local`。如果 VulnIntakePage 再次冲突，优先保留远程的文案/字段，用 DS 组件渲染。

7. **Tailwind 扫描**：`tailwind.config.js` 已加入 `design-system/**`，新增 DS 文件后无需再改此配置。

---

## 快速操作参考

### 执行一个文件的 B5 迁移
```bash
# 1. 读文件顶部区域（找页头 div）
# 2. 添加 PageHeader import
# 3. 替换页头区域
# 4. 验证
npx tsc --noEmit 2>&1 | grep -viE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"
```

### commit + push 模板
```bash
git add -A
git commit -m "refactor(P2-B5): add PageHeader to <域名> pages"
git pull --rebase origin local
git push origin local
```

### 验证当前基线
```bash
cd /c/zwd_work/Chimera
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望输出：2
```

---

## design-system 出口速查

```ts
// 从 design-system 统一导入
import {
  // Primitives
  Button, Input, Select, FormField, Card, Modal, SegmentedControl,
  // Application
  PageHeader, StatisticCard, PageSection, EmptyState,
  Toolbar, SearchInput, DataTable, Pagination, FormActionBar,
} from '../../design-system';  // 路径相对于调用文件
```
