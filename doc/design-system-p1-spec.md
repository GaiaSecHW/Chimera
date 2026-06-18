# P1 应用级组件 · 可执行规格

> 配套：`doc/design-system-plan.md`（阶段 P1）、`doc/design-system-p0-spec.md`
> 定位：DESIGN.md §14 规定但 **0 落地** 的 6 个页面级组件。这是消除最大重复面（106 页头 / 62 指标卡 / 64 表格）的关键。
> 依赖：复用 P0 的 `Card` / `Button` / `Input` / `Select`，底层表格复用现有 `components/execution/ExecutionTable*`。

---

## 通用约定

- 同 P0：`forwardRef`、透传原生属性、`className` 追加、零新增 CSS/token。
- 应用级组件**只组合**已有 primitives 与 token 类，不直接写颜色。
- 解锁的页面改造模板见文末 §7（§14.7/14.8 骨架）。

---

## 1. PageHeader（§14.1）

替代：106 文件内联标题块。

```ts
interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;        // 右对齐操作区（通常 1 主 + N 次 Button）
  back?: { label?: string; onClick: () => void };  // 详情页返回（§13.2 详情范式）
  className?: string;
}
```

结构（§14.1 规范）：
```
<header class="pb-4 border-b border-theme-border">
  {back && <button>← {label}</button>}            // text-sm text-muted，ghost
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-theme-text-primary">{title}</h1>
      {description && <p class="text-sm text-theme-text-muted mt-1">{description}</p>}
    </div>
    {actions && <div class="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
</header>
```

规范要点：`title` 用 `font-semibold`（**非 `font-black`**）；底部 1px `--border-default`；`pb-4`。

验收：能替换标准列表页/详情页头部；`back` 形态满足 §13.2 详情页返回。

---

## 2. StatisticCard（§14.2）

替代：≥22 处私有 `StatCard`/`MetricCard`/`SummaryCard`/`KpiCard`。

```ts
type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type Trend = { direction: 'up' | 'down'; value: string };

interface StatisticCardProps {
  label: React.ReactNode;           // text-xs uppercase text-muted
  value: React.ReactNode;           // text-3xl font-semibold（§14.2 高度88）
  icon?: React.ReactNode;
  trend?: Trend;                    // up→emerald-400 / down→rose-400（§11.3）
  hint?: React.ReactNode;           // 次要说明
  tone?: StatTone;                  // value 取色，默认 default(--text-primary)
  onClick?: () => void;             // 可点（如跳转），有则加 hover/cursor
}
```

结构：基于 P0 `Card`（padding sm）+ `.metric-card` 规格：
```
<Card padding="sm" class="flex items-center justify-between" [role/onClick]>
  <div>
    <p class="text-xs uppercase tracking-wider text-theme-text-muted">{label}</p>
    <p class="text-3xl font-semibold {toneColor}">{value}</p>
    {trend && <span class="text-xs {trendColor}">{arrow}{trend.value}</span>}
    {hint && <p class="text-xs text-theme-text-faint mt-0.5">{hint}</p>}
  </div>
  {icon && <div class="text-theme-text-muted">{icon}</div>}
</Card>
```

覆盖性检查（必须能表达现有全部用例）：`label`/`value`/`icon`/`tone`/`trend`/`hint`/`onClick` —— 对应 `EnvManagementPage` 的 `tone`、`DataflowVulnScannerPage` 的 `hint`、`DashboardPage` 的 `onClick`。

验收：22 处私有实现的 props 均可映射；网格用法 `grid gap-4 md:grid-cols-2 xl:grid-cols-4`。

---

## 3. Toolbar（§14.3）

替代：43 文件内联搜索 + 散落筛选区。

```ts
interface ToolbarProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    onSubmit?: () => void;          // 回车触发
  };
  filters?: React.ReactNode;        // 中部：Select / 状态筛选 / TagFilter
  actions?: React.ReactNode;        // 右部：Refresh / Create / Export（Button）
  className?: string;
}
```

结构（§14.3 左中右）：
```
<div class="flex items-center gap-3 flex-wrap">
  {search && <SearchInput .../>}        // 左，min-w-[220px]，带 Search 图标 prefix
  {filters && <div class="flex items-center gap-2">{filters}</div>}  // 中
  {actions && <div class="ml-auto flex items-center gap-2">{actions}</div>}  // 右
</div>
```

子件 `SearchInput`（单独导出，供 Toolbar 内部与独立使用）：P0 `Input` + `prefix={<Search size={14}/>}` + 受控值 + Enter→`onSubmit`。

验收：能组合出"搜索 + 状态 Select + 刷新/新建"的标准工具栏；不内置业务筛选逻辑（由 `filters` 插槽注入）。

---

## 4. DataTable（§14.4）—— P1 重点

替代：64 文件原生 `<table>`。底层复用 `ExecutionTable*`，对外提供声明式 API + 内置 Loading/Empty/Pagination/Bulk。

```ts
interface Column<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';   // 数值列右对齐
  width?: number | string;
  render?: (row: T, index: number) => React.ReactNode;  // 默认取 row[key]
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;                 // → 骨架行 / 居中 spinner（§9.2）
  empty?: React.ReactNode;           // 空态，默认 <EmptyState/>
  onRowClick?: (row: T) => void;     // 行可点 → interactive row class
  minWidth?: number;                 // 透传 ExecutionTable（默认 1080）
  pagination?: {
    page: number; perPage: number; total: number;
    onPageChange: (page: number) => void;
    onPerPageChange?: (n: number) => void;
  };
  bulkActions?: {                    // 批量操作（§14.4）
    selectedKeys: string[];
    onSelectChange: (keys: string[]) => void;
    render: (selected: string[]) => React.ReactNode;  // 批量操作栏内容
  };
}
```

组成：
- 表体：`ExecutionTable` + `ExecutionTableHead/Th/Td` + `ExecutionTableEmptyRow`（已有，§9 合规）。
- `loading`：渲染骨架行（n 行占位）或 `ExecutionTableEmptyRow` + spinner。
- `empty`（`data.length===0 && !loading`）：默认 `EmptyState`（§5）。
- `pagination`：底部新增 `Pagination` 子件（页码 + 每页 + 总数，`font-mono tabular-nums`）。
- `bulkActions`：表头加全选 checkbox，选中时顶部浮出批量操作栏。
- 状态列：约定调用方 `render` 里用统一 `Badge`/`StatusBadge`（§9.2），DataTable 不强插。

子件 `Pagination`（单独导出）：
```ts
interface PaginationProps {
  page: number; perPage: number; total: number;
  onPageChange: (p: number) => void;
  onPerPageChange?: (n: number) => void;
  perPageOptions?: number[];        // 默认 [20,50,100]
}
```

验收：替换 1 个真实列表页（如 `ProjectMgmtPage`/`UserMgmtPage`）的原生表格，Loading/Empty/分页/批量全部走组件；`tsc` 通过。

---

## 5. PageSection（§14.6）

替代：≥13 处私有 `SectionCard`/`PanelCard`/`CardShell`。

```ts
interface PageSectionProps {
  title?: React.ReactNode;          // text-base font-semibold（非 black）
  description?: React.ReactNode;
  actions?: React.ReactNode;        // 区块级操作，右对齐
  children: React.ReactNode;
  className?: string;
}
```

结构（基于 P0 `Card` padding md，强制 `--bg-surface`）：
```
<Card as="section" padding="md" class="space-y-4">
  {(title || actions) && (
    <div class="flex items-start justify-between gap-4">
      <div>
        {title && <h2 class="text-base font-semibold text-theme-text-primary">{title}</h2>}
        {description && <p class="text-xs text-theme-text-muted mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  )}
  {children}
</Card>
```

规范要点：背景 `--bg-surface`（修正现有 `SectionCard` 误用 `bg-app`）；`rounded-xl`（修正 `rounded-2xl`）；`font-semibold`（修正 `font-black`）。

验收：能 1:1 替换 6 个 Config 页的 `SectionCard`；配合 `FormField`(P0) + `FormActionBar`(见下) 重构配置页。

---

## 5b. FormActionBar（配套，收编 8 处 PanelActions）

```ts
interface FormActionBarProps {
  saving?: boolean;
  saveText?: string;                // 默认 '保存'
  resetText?: string;               // 默认 '重置'
  onSave: () => void;
  onReset?: () => void;             // 无则不渲染重置
  disabled?: boolean;
  extra?: React.ReactNode;          // 左侧附加（如校验提示）
}
```
结构：右对齐 `Button variant=secondary(重置)` + `Button variant=primary loading=saving(保存)`。

---

## 6. EmptyState（§14.5）

统一：4 处私有签名（`{text}` vs `{icon,title,description}`）+ 96 处内联文案。

```ts
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;         // CTA Button
  className?: string;
  variant?: 'block' | 'inline';     // block=独立区块(虚线框) / inline=表格内居中
}
```

结构：
```
<div class="flex flex-col items-center justify-center text-center gap-2 py-10">
  {icon && <div class="text-theme-text-faint">{icon}</div>}
  <p class="text-sm font-medium text-theme-text-secondary">{title}</p>
  {description && <p class="text-xs text-theme-text-faint">{description}</p>}
  {action}
</div>
```

迁移注意：旧 `EmptyState({text})` → 映射为 `title={text}`（提供 codemod 或手改清单）；保留 `block` 变体的虚线框以兼容 `environment/shared` 既有观感。

验收：作为 `DataTable.empty` 默认值；可替换 3 处私有 EmptyState 与 Dashboard 的 `Placeholder`。

---

## 7. 解锁的页面骨架模板（§14.7 / §14.8）

P1 完成后，列表/详情页改造遵循固定骨架（可选做成 `patterns/` 模板组件）：

**标准列表页（§14.7）**
```tsx
<div class="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader title=… actions={<Button variant="primary">新建</Button>} />
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <StatisticCard … /> …
  </div>
  <Toolbar search=… filters=… actions=… />
  <DataTable columns=… data=… loading=… pagination=… />
</div>
```

**标准详情页（§14.8）**
```tsx
<div class="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader back=… title=… />
  <PageSection title="基础信息">…</PageSection>
  <PageSection title="配置">…</PageSection>
  {/* Timeline / Logs */}
</div>
```

---

## 目录与出口

```
design-system/
├── application/
│   ├── PageHeader/{index.tsx}
│   ├── StatisticCard/{index.tsx}
│   ├── Toolbar/{index.tsx, SearchInput.tsx}
│   ├── DataTable/{index.tsx, Pagination.tsx}
│   ├── PageSection/{index.tsx}
│   ├── FormActionBar/{index.tsx}
│   ├── EmptyState/{index.tsx}
│   └── index.ts
├── patterns/                       # 可选
│   ├── StandardListPage.tsx
│   └── StandardDetailPage.tsx
└── index.ts                        # re-export primitives + application
```

---

## P1 整体验收清单

- [ ] 6 件（+`FormActionBar`/`SearchInput`/`Pagination` 子件）实现，复用 P0 primitives，零新增 CSS。
- [ ] `StatisticCard` 覆盖 22 处私有实现全部 props 用例（含 tone/trend/hint/onClick）。
- [ ] `PageSection` 渲染背景恒 `--bg-surface`、`rounded-xl`、标题 `font-semibold`。
- [ ] `DataTable` 内置 Loading/Empty/Pagination/Bulk，底层复用 `ExecutionTable*`。
- [ ] 提供 **2 个样板改造 PR**：1 标准列表页 + 1 标准详情页，作为 P2 模板。
- [ ] 组件内零 `font-black` / 零 glow / 零 `bg-app` 卡片。
- [ ] `tsc --noEmit` 通过；相关 smoke/e2e 通过。

> 不在 P1 范围：业务域特化组件（B2S/漏洞引擎专用视图）、`Tabs`/`Combobox`（→ P2 候选）、批量替换业务页面（→ P2）。
