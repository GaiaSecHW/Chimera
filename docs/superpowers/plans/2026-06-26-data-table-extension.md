# 公共表格组件（扩展现有 DataTable）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 `design-system` 的 `DataTable`，补齐行号、表头排序、行选中高亮、默认 10 行等能力，并将 `VulnIntakePage.tsx` 第 2773 行的手写表格迁移到 `DataTable`。

**Architecture:** 在现有 `DataTable.tsx` / `Pagination.tsx` 上新增可选 prop（向后兼容，12+ 现有调用方零改动），沿用 `ExecutionTable` 原生 `<table>` 体系。排序受控（父组件持有状态，组件回传 `onSortChange`）。分页保持回调式。行号跨页全局。行选中高亮用 `--brand-primary-mask` CSS 变量（内联 style，因 Tailwind 未将其映射为颜色类）。

**Tech Stack:** React 19 + TypeScript 5.8 + Tailwind 3.4 + lucide-react。无单元测试框架；验证用 `npm run lint`（= `tsc --noEmit`）与 `npm run build`（= `vite build`）。

## Global Constraints

- **无单元测试框架**：仓库仅有 Playwright e2e（需运行环境+鉴权，不适用于组件级 TDD）。每个步骤的"测试"= `npm run lint`；关键里程碑加跑 `npm run build`。遵循既有约定，不引入新测试框架。
- **`tsconfig.json` 未开启 `noUnusedLocals`/`noUnusedParameters`**：未使用变量/导入不会导致 `tsc` 失败。
- **`--brand-primary-mask` 是 CSS 变量**（`styles.css` 中定义，非 Tailwind 颜色类）：行选中高亮用内联 `style={{ backgroundColor: 'var(--brand-primary-mask)' }}`。
- **所有 `DataTable`/`Pagination` 新增字段均为可选**：现有 12+ 调用方零改动。
- **不改 `components/execution/ExecutionTable.tsx` 既有样式**。
- 提交信息沿用仓库中文 conventional commit 风格（如 `feat(设计系统): ...`）。
- 每个任务结尾提交一次；不要一次性提交多任务。

## File Structure

- `design-system/application/DataTable/Pagination.tsx` — `perPage` 改可选（默认 10），默认 `perPageOptions` 调整为 `[10, 20, 50, 100]`
- `design-system/application/DataTable/DataTable.tsx` — 新增排序、行号、行选中高亮能力
- `design-system/application/DataTable/index.ts` — 导出 `DataTableSortState` 类型
- `design-system/application/index.ts` — 导出 `DataTableSortState` 类型
- `pages/vuln/VulnIntakePage.tsx` — 第 2773 行手写表格迁移到 `DataTable`；`pageSize` 20→10；删除被替代的 `renderSortHeader`/`handleSortChange` 及其专用导入

---

### Task 1: Pagination 默认值（perPage 可选默认 10）

**Files:**
- Modify: `design-system/application/DataTable/Pagination.tsx`

**Interfaces:**
- Produces: `PaginationProps.perPage` 由必填改为可选；未传时默认 `10`。`perPageOptions` 默认值变为 `[10, 20, 50, 100]`。

- [ ] **Step 1: 修改 `PaginationProps.perPage` 为可选**

在 `design-system/application/DataTable/Pagination.tsx`，把接口中的 `perPage: number;` 改为 `perPage?: number;`：

```ts
export interface PaginationProps {
  page: number;
  perPage?: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
  className?: string;
}
```

- [ ] **Step 2: 解构默认值**

同文件，把解构处的 `perPage,` 改为 `perPage = 10,`，把 `perPageOptions = [20, 50, 100],` 改为 `perPageOptions = [10, 20, 50, 100],`：

```ts
export const Pagination: React.FC<PaginationProps> = ({
  page,
  perPage = 10,
  total,
  onPageChange,
  onPerPageChange,
  perPageOptions = [10, 20, 50, 100],
  className,
}) => {
```

- [ ] **Step 3: 类型检查**

Run: `npm run lint`
Expected: 通过（无错误）。`perPage` 在 `totalPages`/`from`/`to` 中已使用，可选+默认值不影响逻辑。

- [ ] **Step 4: 提交**

```bash
git add design-system/application/DataTable/Pagination.tsx
git commit -m "feat(设计系统): Pagination perPage 改可选默认10、perPageOptions 默认含10"
```

---

### Task 2: DataTable 排序支持（受控）

**Files:**
- Modify: `design-system/application/DataTable/DataTable.tsx`
- Modify: `design-system/application/DataTable/index.ts`
- Modify: `design-system/application/index.ts`

**Interfaces:**
- Produces: `DataTableColumn<T>` 新增 `sortable?`/`sortKey?`/`defaultDirection?`；`DataTableProps<T>` 新增 `sort?`/`onSortChange?`；新类型 `DataTableSortState`。后续任务与迁移任务消费这些。

- [ ] **Step 1: 导入排序图标**

在 `design-system/application/DataTable/DataTable.tsx` 顶部，把：

```ts
import { Loader2 } from 'lucide-react';
```

改为：

```ts
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
```

- [ ] **Step 2: 扩展 `DataTableColumn` 字段**

同文件，把 `DataTableColumn` 接口改为：

```ts
export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: string;
  defaultDirection?: 'asc' | 'desc';
}
```

- [ ] **Step 3: 新增 `DataTableSortState` 类型与 Props**

在 `DataTableColumn` 之后新增类型：

```ts
export interface DataTableSortState {
  field: string;
  direction: 'asc' | 'desc';
}
```

把 `DataTableProps` 增加两个可选字段（追加到接口末尾，`className?: string;` 之前或之后均可）：

```ts
export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  minWidth?: number;
  pagination?: Omit<PaginationProps, 'className'>;
  bulkActions?: DataTableBulkActions;
  className?: string;
  showRowNumber?: boolean;
  sort?: DataTableSortState;
  onSortChange?: (sort: DataTableSortState) => void;
  selectedRowKey?: string;
}
```

> 注：`showRowNumber` 与 `selectedRowKey` 在 Task 3/4 才用到，此处一并声明以避免反复改接口。

- [ ] **Step 4: 解构新 Props**

把 `DataTable` 函数签名解构改为：

```ts
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  minWidth = 1080,
  pagination,
  bulkActions,
  className,
  showRowNumber = false,
  sort,
  onSortChange,
  selectedRowKey,
}: DataTableProps<T>) {
```

- [ ] **Step 5: 新增排序表头渲染函数**

在 `alignClass` 定义之后、`return` 之前，新增：

```ts
  const renderSortableHeader = (col: DataTableColumn<T>) => {
    const field = col.sortKey ?? col.key;
    const active = sort?.field === field;
    const asc = active && sort?.direction === 'asc';
    const desc = active && sort?.direction === 'desc';
    const handleClick = () => {
      if (!onSortChange) return;
      if (active) {
        onSortChange({ field, direction: sort?.direction === 'asc' ? 'desc' : 'asc' });
      } else {
        onSortChange({ field, direction: col.defaultDirection ?? 'asc' });
      }
    };
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex cursor-pointer items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-faint hover:text-theme-text-secondary"
      >
        {col.header}
        <span className="inline-flex items-center gap-0.5 leading-none">
          <ArrowUp size={12} className={asc ? 'text-theme-text-secondary' : 'text-theme-text-faint'} />
          <ArrowDown size={12} className={desc ? 'text-theme-text-secondary' : 'text-theme-text-faint'} />
        </span>
      </button>
    );
  };
```

- [ ] **Step 6: 表头使用排序渲染**

把 `<thead><tr>` 中列渲染部分：

```tsx
            {columns.map((col) => (
              <ExecutionTableTh key={col.key} align={col.align} className={col.className}>
                {col.header}
              </ExecutionTableTh>
            ))}
```

改为：

```tsx
            {columns.map((col) => (
              <ExecutionTableTh key={col.key} align={col.align} className={col.className}>
                {col.sortable ? renderSortableHeader(col) : col.header}
              </ExecutionTableTh>
            ))}
```

- [ ] **Step 7: 导出新类型**

`design-system/application/DataTable/index.ts` 改为：

```ts
export { DataTable } from './DataTable';
export type { DataTableProps, DataTableColumn, DataTableBulkActions, DataTableSortState } from './DataTable';
export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';
```

`design-system/application/index.ts` 的 `DataTable` 类型导出块改为：

```ts
export { DataTable, Pagination } from './DataTable';
export type {
  DataTableProps,
  DataTableColumn,
  DataTableBulkActions,
  DataTableSortState,
  PaginationProps,
} from './DataTable';
```

- [ ] **Step 8: 类型检查**

Run: `npm run lint`
Expected: 通过。

- [ ] **Step 9: 提交**

```bash
git add design-system/application/DataTable/DataTable.tsx design-system/application/DataTable/index.ts design-system/application/index.ts
git commit -m "feat(设计系统): DataTable 支持受控表头排序（sortable/sortKey/defaultDirection）"
```

---

### Task 3: DataTable 行号列（跨页全局）

**Files:**
- Modify: `design-system/application/DataTable/DataTable.tsx`

**Interfaces:**
- Consumes: `showRowNumber`（Task 2 已声明）、`pagination.page`、`pagination.perPage`
- Produces: `showRowNumber=true` 时第一列渲染行号；列顺序 `[行号] → [复选框] → [数据列]`

- [ ] **Step 1: 计算行号基准与 colSpan**

在 `DataTable` 函数内 `alignClass` 之前，把：

```ts
  const colSpan = columns.length + (bulkActions ? 1 : 0);
```

改为：

```ts
  const rowNumberBase = pagination ? (pagination.page - 1) * (pagination.perPage ?? 10) : 0;
  const colSpan = columns.length + (showRowNumber ? 1 : 0) + (bulkActions ? 1 : 0);
```

- [ ] **Step 2: 表头加行号列**

在 `<thead><tr>` 中，`{bulkActions && (...)}` **之前**插入行号表头：

```tsx
            {showRowNumber && (
              <ExecutionTableTh className="w-12 text-center" align="center">
                #
              </ExecutionTableTh>
            )}
            {bulkActions && (
```

（即行号列在复选框列之前。）

- [ ] **Step 3: 表体加行号单元格**

在 `<tbody>` 行渲染中，`{bulkActions && (...)}` **之前**插入行号单元格：

```tsx
                  {showRowNumber && (
                    <ExecutionTableTd className="w-12 text-center tabular-nums text-theme-text-faint" align="center">
                      {rowNumberBase + index + 1}
                    </ExecutionTableTd>
                  )}
                  {bulkActions && (
```

- [ ] **Step 4: 类型检查**

Run: `npm run lint`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add design-system/application/DataTable/DataTable.tsx
git commit -m "feat(设计系统): DataTable 支持 showRowNumber 行号列（跨页全局）"
```

---

### Task 4: DataTable 行选中高亮

**Files:**
- Modify: `design-system/application/DataTable/DataTable.tsx`

**Interfaces:**
- Consumes: `selectedRowKey`（Task 2 已声明）、`rowKey`
- Produces: `rowKey(row) === selectedRowKey` 的行加 `--brand-primary-mask` 背景。

- [ ] **Step 1: 行加高亮内联样式**

在 `<tbody>` 行渲染中，把 `<tr>`：

```tsx
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cx(
                    'group transition-colors hover:bg-theme-elevated',
                    onRowClick && 'cursor-pointer',
                  )}
                >
```

改为：

```tsx
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cx(
                    'group transition-colors hover:bg-theme-elevated',
                    onRowClick && 'cursor-pointer',
                  )}
                  style={
                    selectedRowKey && key === selectedRowKey
                      ? { backgroundColor: 'var(--brand-primary-mask)' }
                      : undefined
                  }
                >
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npm run lint`
Expected: 通过。

Run: `npm run build`
Expected: 构建成功（验证 design-system 改动整体可构建）。

- [ ] **Step 3: 提交**

```bash
git add design-system/application/DataTable/DataTable.tsx
git commit -m "feat(设计系统): DataTable 支持 selectedRowKey 行选中高亮"
```

---

### Task 5: 迁移 VulnIntakePage 第 2773 行表格到 DataTable

**Files:**
- Modify: `pages/vuln/VulnIntakePage.tsx`

**Interfaces:**
- Consumes: Task 2/3/4 产出的 `DataTable`、`DataTableColumn`、`sort`/`onSortChange`/`selectedRowKey`/`pagination`/`showRowNumber`
- Produces: 第 2773 行手写 grid-divs 表格被 `<DataTable>` 取代；`pageSize` 默认 10；`renderSortHeader`/`handleSortChange` 及专用图标导入删除。

- [ ] **Step 1: `pageSize` 初始值 20 → 10**

把（约第 629 行）：

```ts
  const [pageSize, setPageSize] = useState(20);
```

改为：

```ts
  const [pageSize, setPageSize] = useState(10);
```

- [ ] **Step 2: 删除被替代的 `handleSortChange`**

删除 `handleSortChange`（约 1869-1876 行）整段：

```ts
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection(field === 'updated_at' || field === 'confidence' || field === 'conclusion' ? 'desc' : 'asc');
  };
```

> `renderSortHeader`（约 1935-1952 行）在 Step 5 被 `caseColumns` 定义替换，此处暂不删除。

- [ ] **Step 3: 删除仅被 `renderSortHeader` 使用的图标导入**

> 顺序说明：`ArrowUp`/`ArrowDown` 仅被 `renderSortHeader` 使用，该函数在 Step 5 被替换后即无引用。本步先删导入，Step 5 随即移除唯一引用；本任务仅在 Step 7 做整体类型检查，中间态不单独验证。

在顶部 lucide-react 导入块中，删除 `ArrowDown,` 与 `ArrowUp,` 两行（保留 `ArrowLeft`、`ArrowRight`，它们在别处仍被使用）。即把：

```ts
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
```

改为：

```ts
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
```

- [ ] **Step 4: 在 design-system 导入中加入 DataTable 相关**

把（约第 37 行）：

```ts
import { MarkdownViewer, Modal, PageHeader, PageSection, StatisticCard } from '../../design-system';
```

改为：

```ts
import { DataTable, DataTableColumn, EmptyState, MarkdownViewer, Modal, PageHeader, PageSection, StatisticCard } from '../../design-system';
```

- [ ] **Step 5: 用 `caseColumns` 定义替换 `renderSortHeader`**

在组件函数体内（约 1935-1952 行），用下面的 `caseColumns` 定义**替换**原 `renderSortHeader` 整段。该位置在 `getTaskName`(1899)、`handleDeleteSingleFromList`(1658)、`openManualConfirm`(1698)、`handleCreateDownloadJob`(1744) 之后，是合法的函数体语句位置（不能放在 JSX 内）：

```tsx
  const caseColumns: DataTableColumn<any>[] = [
    {
      key: 'taskName',
      header: '任务名称',
      render: (item) => (
        <div className="min-w-0" title={getTaskName(item)}>
          <div className="truncate text-sm font-semibold text-theme-text-secondary">{getTaskName(item)}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: '标题',
      sortable: true,
      sortKey: 'title',
      defaultDirection: 'asc',
      render: (item) => <div className="text-sm font-semibold text-theme-text-primary">{item.title}</div>,
    },
    {
      key: 'conclusion',
      header: '人工确认状态',
      sortable: true,
      sortKey: 'conclusion',
      defaultDirection: 'desc',
      render: (item) =>
        item.is_human_finished ? (
          <div className={`text-sm font-semibold ${(item.finished_reason || item.validation_result) === 'vulnerable' ? 'text-state-danger font-bold' : 'text-theme-text-secondary'}`}>
            {toConclusionText(item.finished_reason || item.validation_result)}
          </div>
        ) : (
          <span className="text-sm text-theme-text-faint">—</span>
        ),
    },
    {
      key: 'reporter',
      header: '工具',
      sortable: true,
      sortKey: 'reporter',
      defaultDirection: 'asc',
      render: (item) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-theme-text-secondary">{item.reporter?.name || 'unknown'}</div>
          <div className="mt-0.5 text-xs text-theme-text-faint">{item.reporter?.version || 'n/a'}</div>
        </div>
      ),
    },
    {
      key: 'updated_at',
      header: '更新时间',
      sortable: true,
      sortKey: 'updated_at',
      defaultDirection: 'desc',
      render: (item) => <span className="text-sm text-theme-text-muted">{formatTime(item.updated_at || item.created_at)}</span>,
    },
    {
      key: 'created_at',
      header: '创建时间',
      sortable: true,
      sortKey: 'created_at',
      defaultDirection: 'asc',
      render: (item) => <span className="text-sm text-theme-text-muted">{formatTime(item.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      render: (item) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={async (event) => {
              event.stopPropagation();
              try {
                await navigator.clipboard.writeText(item.id);
                setSuccessMessage('已复制漏洞 ID');
              } catch { /* ignore */ }
            }}
            title="复制漏洞 ID"
            aria-label={`复制漏洞 ID ${item.id}`}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-primary-mask)'; e.currentTarget.style.color = 'var(--brand-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <ClipboardCopy size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openManualConfirm(item);
            }}
            disabled={manualConfirmSubmitting}
            title={item.finished_reason ? '重新判定' : '确认漏洞'}
            aria-label={`确认漏洞 ${item.title}`}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-primary-mask)'; e.currentTarget.style.color = 'var(--brand-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <ShieldCheck size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCreateDownloadJob([item.id], 'single');
            }}
            disabled={creatingDownload}
            title={creatingDownload ? '创建下载任务中' : '下载'}
            aria-label={`下载漏洞 ${item.title}`}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-primary-mask)'; e.currentTarget.style.color = 'var(--brand-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteSingleFromList(item.id, item.title);
            }}
            disabled={bulkDeleting || rowDeletingId === item.id}
            title={rowDeletingId === item.id ? '删除中' : '删除'}
            aria-label={`删除漏洞 ${item.title}`}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {rowDeletingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </div>
      ),
    },
  ];
```

- [ ] **Step 6: 用 `<DataTable>` 替换手写表格块**

删除第 2772-2948 行的整个表格包裹块（从 `<div>` 包裹的 `<div className="overflow-hidden">` 表头/表体，到下方分页条 `</div></div>`），替换为：

```tsx
            <DataTable
              columns={caseColumns}
              data={pagedSuspicions}
              rowKey={(item) => item.id}
              loading={loading}
              empty={<EmptyState title="当前筛选条件下没有漏洞。" />}
              onRowClick={(item) => setSelectedSuspicionId(item.id)}
              selectedRowKey={selectedSuspicionId}
              sort={{ field: sortField, direction: sortDirection }}
              onSortChange={({ field, direction }) => {
                setSortField(field as SortField);
                setSortDirection(direction);
              }}
              pagination={{
                page: currentPage,
                perPage: pageSize,
                total: listTotal,
                onPageChange: (p) => setCurrentPage(p),
                onPerPageChange: (s) => setPageSize(s),
                perPageOptions: [10, 20, 50, 100, 200, 500, 1000],
              }}
            />
```

> 说明：被替换块以 `<div>`（含 `<div className="overflow-hidden">` 与 `grid grid-cols-[1.5fr_2.2fr_1.1fr_1.2fr_1.1fr_1.1fr_0.9fr]` 表头）起始，到分页条 `首页/上一页/下一页/末页` 的 `</div>` 与外层 `</div>` 结束。`DataTable` 自带表头加粗、空态、加载态、分页，故手写分页条一并移除。

- [ ] **Step 7: 类型检查**

Run: `npm run lint`
Expected: 通过。若报 `caseColumns` 作用域问题，确认其定义在 `cases` Tab 渲染分支内、`<DataTable>` 之前。

- [ ] **Step 8: 构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 9: 手动验证（dev）**

Run: `npm run dev`，打开漏洞中心列表页，确认：
- 表头加粗、点击 标题/人工确认状态/工具/更新时间/创建时间 可排序（▲▼ 指示）
- 点击某行 → 该行高亮（`--brand-primary-mask` 背景）并打开详情
- 操作列四个按钮（复制ID/确认/下载/删除）工作正常且不触发行跳转
- 分页默认 10 条/页，切换页码/每页大小生效
- 加载态、空态正常

- [ ] **Step 10: 提交**

```bash
git add pages/vuln/VulnIntakePage.tsx
git commit -m "refactor(漏洞中心): 列表表格迁移到 DataTable、默认每页10条、移除手写排序表头"
```

---

## Self-Review 结论

- **Spec 覆盖**：行号(Task3)、复选框(已由 `bulkActions` 支持，列顺序 Task3 保证行号在前)、可配置列(既有)、自定义单元格(既有 `render`)、表头排序(Task2)、分页默认10(Task1)、表头加粗(既有 `font-semibold`)、行选中高亮(Task4)、迁移 2773(Task5) — 全覆盖。
- **占位符**：无 TBD/TODO；每步含完整代码。
- **类型一致**：`DataTableSortState`、`showRowNumber`、`selectedRowKey`、`sort`/`onSortChange` 在声明(Task2)与消费(Task3/4/5)中一致；`caseColumns` 的 `sortKey` 值与 `SortField` 联合类型成员一致。
- **未启用复选框**：2773 表当前复选框为 `hidden`、`handleDeleteSelectedFromList` 从未被调用；迁移不接入 `bulkActions` 以保持现有视觉，既有 bulk 相关状态/函数保留（`noUnusedLocals` 关闭，不报错），后续可按需接入。
