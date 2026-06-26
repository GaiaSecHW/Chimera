# 公共表格组件设计：扩展现有 DataTable

- 日期：2026-06-26
- 范围：扩展 `design-system/application/DataTable/DataTable.tsx`，并迁移 `pages/vuln/VulnIntakePage.tsx` 第 2773 行附近的手写表格
- 目标：将第 2773 行的表格抽成公共组件，支持行号、复选框、可配置列、自定义单元格、表头排序、分页等可配置项，并固定表头加粗与行选中高亮样式

## 背景与现状

代码库中已存在设计系统组件 `design-system/application/DataTable/DataTable.tsx`，被 12+ 页面使用（assets、platform、vuln 等）。它基于 `components/execution/ExecutionTable.tsx` 的原生 `<table>` 元素体系，已支持：

- 可配置列（`columns`：`key`/`header`/`align`/`width`/`render`/`className`）
- 自定义单元格内容（`render`）
- 复选框多选（`bulkActions`，作为第一列）
- 分页（`pagination`：`page`/`perPage`/`total`/`onPageChange`/`onPerPageChange`/`perPageOptions`）
- 行点击（`onRowClick`）
- 加载态、空态

但缺少本次需求要求的：行号、表头点击排序、行选中高亮、默认 10 行、`page`/`rows` 命名约定。

`VulnIntakePage.tsx` 第 2773 行的表格是**手写 CSS grid-divs** 实现，未使用 `DataTable`，且与 `AlertCenterPage.tsx` 共享一套 `renderSortHeader` 排序模式。本设计通过扩展 `DataTable` 补齐缺失能力，再将第 2773 行表格迁移至 `DataTable`，统一两种表格风格。

## 决策

- **扩展而非新建**：在现有 `DataTable` 上新增可选能力，现有 12+ 调用方零改动，其他页面后续可按需开启排序/行号/选中高亮。
- **排序受控**：父组件持有排序状态并负责实际排序/请求，组件只回传变更。匹配现有 `VulnIntakePage`/`AlertCenterPage` 排序触发后端 refetch 的模式。
- **分页回调式**：组件保持 `onPageChange`/`onPerPageChange` 回调，父组件自行拼装 `page=N&rows=N` 请求，灵活适配任意后端。
- **行号跨页全局**：分页时行号跨页连续（第 2 页每页 10 条则从 11 起）。

## 详细设计

### 1. 组件位置与导出

- 扩展 `design-system/application/DataTable/DataTable.tsx`，不新建文件。
- 沿用 `ExecutionTable` 原生 `<table>` 体系。
- 继续从 `design-system/index.ts` 统一导出 `DataTable`、`Pagination` 及相关类型。

### 2. 列配置 `DataTableColumn<T>` 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `sortable` | `boolean?` | 该列是否启用点击排序 |
| `sortKey` | `string?` | 排序回传标识，默认取 `key`。即"排序传参可自定义" |
| `defaultDirection` | `'asc' \| 'desc'?` | 首次点击该列的默认方向，默认 `'asc'` |

### 3. `DataTable` 新增 Props

| Prop | 类型 | 说明 |
|---|---|---|
| `showRowNumber` | `boolean?` | 是否显示行号列，位于第一列 |
| `sort` | `{ field: string; direction: 'asc' \| 'desc' }?` | 受控排序状态 |
| `onSortChange` | `(sort: { field: string; direction: 'asc' \| 'desc' }) => void?` | 排序变更回调 |
| `selectedRowKey` | `string?` | 命中行加选中高亮 |
| 复用 `bulkActions` | — | 复选框多选（位于行号后） |
| 复用 `pagination` | — | 分页 |

新增类型导出：`DataTableSortState`。

### 4. 列顺序

`[行号] → [复选框] → [数据列]`，各项按需开启。仅当 `showRowNumber` 为真时渲染行号列；仅当 `bulkActions` 存在时渲染复选框列。

### 5. 行号（跨页全局）

- 有 `pagination` 时：`行号 = (pagination.page - 1) * pagination.perPage + index + 1`
- 无 `pagination` 时：`行号 = index + 1`
- 行号单元格右对齐，窄列（`w-12` 一类）。

### 6. 排序（受控）

- `sortable` 为真的列，表头渲染为可点击按钮，显示 `▲`/`▼` 指示符（沿用现有 `ArrowUp`/`ArrowDown` 图标与配色：激活态 `text-theme-text-secondary`，非激活态 `text-theme-text-faint`）。
- 激活列判定：某列的 `sortKey ?? key` 等于 `sort.field` 即为当前激活列。`sort.field` 为空串时表示无激活列。
- 点击逻辑：
  - 点击当前激活列 → 切换 `asc` ↔ `desc`
  - 点击新列 → 设 `field = 该列 sortKey ?? key`，`direction = 该列 defaultDirection`（默认 `'asc'`）
- 通过 `onSortChange({ field, direction })` 回传；父组件据此更新 `sort` 状态并重新拉取/排序。
- 非排序列表头保持纯文本。

### 7. 选中行高亮

- `rowKey(row) === selectedRowKey` 的 `<tr>` 追加高亮 class（`bg-brand-primary-mask`）。
- 行点击仍触发 `onRowClick`，由父组件据此更新 `selectedRowKey`。
- 高亮与 hover 样式共存：高亮优先级高于 hover。

### 8. 分页

- `PaginationProps.perPage` 改为可选，默认 `10`。
- 默认 `perPageOptions` 调整为 `[10, 20, 50, 100]`。
- 不传 `pagination` 则不渲染分页组件（保持现有行为）。
- 保持回调式 API（`onPageChange`/`onPerPageChange`），父组件自行拼装 `page=N&rows=N` 请求。
- 现有调用方均显式传 `perPage`，不受默认值变更影响。

### 9. 表头加粗

- 沿用 `ExecutionTableHead` 的 `font-semibold`（已为粗体），满足"表头文字加粗"。
- 不改动 `ExecutionTable` 既有样式，避免影响其他使用方。

### 10. 迁移第 2773 行表格

用 `<DataTable>` 替换 `VulnIntakePage.tsx` 第 2773 行附近的手写 grid-divs 表格（含表头、表体、分页条）。

列配置：

| 列 | sortable | sortKey | defaultDirection | render |
|---|---|---|---|---|
| 任务名称 | 否 | — | — | 任务名称（`getTaskName`） |
| 标题 | 是 | `title` | `asc` | 标题文本 |
| 人工确认状态 | 是 | `conclusion` | `desc` | 结论文本/占位 |
| 工具 | 是 | `reporter` | `asc` | reporter.name + version |
| 更新时间 | 是 | `updated_at` | `desc` | `formatTime` |
| 创建时间 | 是 | `created_at` | `asc` | `formatTime` |
| 操作 | 否 | — | — | 复制ID/确认/下载/删除按钮组 |

接线：

- `selectedRowKey={selectedSuspicionId}`、`onRowClick={(item) => setSelectedSuspicionId(item.id)}`
- `sort={{ field: sortField, direction: sortDirection }}`、`onSortChange` 接现有 `sortField`/`sortDirection`（删除页内 `renderSortHeader`，改由组件渲染）
- `pagination={{ page: currentPage, perPage: pageSize, total: listTotal, onPageChange: setCurrentPage, onPerPageChange: setPageSize, perPageOptions: [20, 50, 100, 200, 500, 1000] }}`
- 复选框：接现有 `bulkActions`（`selectedSuspicionIds`/`toggleSuspicionSelection`/`toggleSelectAllVisible`/批量删除渲染），按需显隐
- `showRowNumber`：默认不开启（保持现有视觉）；如需开启另行配置

**行为变更（待确认）**：2773 表当前 `pageSize` 初始值为 `20`。为对齐"默认显示 10 行"需求，建议将 `useState(20)` 改为 `useState(10)`。若希望保留 20，请在评审时指出。

## 向后兼容

- 所有新增字段均为可选，现有 12+ 调用方无需改动。
- `perPage` 由必填改为可选（默认 10），仅影响未显式传值的调用方（实测均显式传值，无影响）。
- `perPageOptions` 默认值新增 `10` 选项，不影响显式传值的调用方。
- 不改动 `ExecutionTable` 样式。

## 不在范围内（YAGNI）

- 不实现客户端排序（uncontrolled sort），排序一律受控由父组件处理。
- 不内置构造 `page=N&rows=N` 查询字符串，由父组件拼装。
- 不做多行选中高亮（仅单行 `selectedRowKey`）；多选仍由 `bulkActions` 复选框承担。
- 不迁移 `AlertCenterPage.tsx` 的同类表格（可后续单独迁移）。
- 不改动 `ExecutionTable` 底层样式。
