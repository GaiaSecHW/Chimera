# HANDOFF_FOR_P5.md

> 项目：Chimera · 企业级 AI 安全研发平台
> 分支：`local`（跟踪 `origin/local`）
> 前置条件：P4 全部完成并推送
> 配套文档：`HANDOFF_FOR_OPENCODE.md`（API参考）、`DESIGN.md`（设计规范）
> 目标：统一全站表格、徽章、加载态、分页等高频组件样式

---

## 1. P5 总体规划

### 1.1 阶段定位

**P5 是组件样式统一阶段**，重点关注用户高频交互组件的视觉和功能统一。

| 子阶段 | 核心目标 | 影响范围 | 复杂度 | 预计时间 |
|--------|----------|----------|--------|----------|
| **P5-1** | 表格统一（含选中功能） | ~80文件 | 高 | 5-8天 |
| **P5-2** | Badge/StatusBadge 统一 | ~50文件 | 低 | 1-2天 |
| **P5-3** | Loading/Spinner 统一 | ~40文件 | 低 | 1天 |
| **P5-4** | Pagination 统一 | ~30文件 | 中 | 1-2天 |
| **P5-5** | Dropdown 统一 | ~25文件 | 高 | 2-3天 |
| **P5-6** | Toast/Alert 统一 | ~20文件 | 中 | 1-2天 |
| **P5-7** | Tabs 统一 | ~15文件 | 中 | 1-2天 |
| **P5-8** | 其他组件统一 | ~10文件 | 低 | 1天 |

**总计：约 13-20 天**

### 1.2 执行原则

1. **按域分批迁移**：每个子任务按业务域分批，降低风险
2. **功能优先**：先保证功能完整，再优化视觉细节
3. **向后兼容**：新旧组件可并存，逐步替换
4. **视觉验收**：每个阶段完成后进行视觉对比测试

### 1.3 验证基线

```bash
cd /c/zwd_work/Chimera
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望：2（始终保持不变）
```

---

## 2. P5-1: 表格统一（含选中功能）

### 2.1 问题分析

**当前表格使用情况**：
- 原生 `<table>` 标签：116 处
- `DataTable` 组件：43 处
- `ExecutionTable` 系列：多处

**存在的问题**：
- 表格样式不统一（边框、内距、圆角等）
- 选中功能实现方式多样
- 分页、排序、筛选逻辑重复
- 空状态和加载态不统一

### 2.2 目标规范

#### DataTable 标准功能
```tsx
interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

interface DataTableBulkActions {
  selectedKeys: string[];
  onSelectChange: (keys: string[]) => void;
  render: (selected: string[]) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  minWidth?: number;
  pagination?: PaginationProps;
  bulkActions?: DataTableBulkActions;  // 选中功能
  className?: string;
  rowClassName?: (row: T, index: number) => string;  // 行定制样式（新增）
}
```

#### 标准表格样式
```css
/* 基于 ExecutionTable 系列 */
- 表头：bg-theme-elevated, text-xs uppercase, text-theme-text-muted
- 表格行：hover:bg-theme-elevated, divide-y divide-theme-border
- 单元格：px-3 py-2, text-sm, text-theme-text-secondary
- 边框：1px border-theme-border, rounded-xl
```

### 2.3 迁移策略

#### 优先级分类

**优先级1：标准表格（90%）**
- 无复杂交互，只需要基本展示和选中功能
- 直接替换为 DataTable + bulkActions

**优先级2：需要行高亮的表格（8%）**
- 需要选中行高亮等特殊样式
- 使用 DataTable + rowClassName

**优先级3：复杂表格（2%）**
- 需要右键菜单、拖拽、动态列等高级功能
- 保持原生 table，列入已知例外

#### 执行顺序
按域分批迁移（从易到难）：

1. **pages/vuln/** (~15文件) - 核心业务域，优先处理
2. **pages/task/** (~8文件) - 功能相对简单
3. **pages/project/** (~5文件) - 文件数量少
4. **pages/ai4app/** (~6文件) - 新增域
5. **pages/orchestration/** (~12文件) - 中等复杂度
6. **pages/platform/** (~17文件) - 已有部分DataTable
7. **pages/environment/** (~18文件) - 表格数量多
8. **pages/execution/** (~25文件) - 最复杂，最后处理
9. **pages/assets/** (~8文件) - 包含复杂表格，混合处理

### 2.4 迁移模板

#### 标准表格迁移（含选中功能）

**迁移前（原生 table + 自定义选中）**：
```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleSelect = (id: string) => {
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelectedIds(next);
};

const toggleSelectAll = () => {
  if (selectedIds.size === data.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(data.map(item => item.id)));
  }
};

{selectedIds.size > 0 && (
  <div className="批量操作栏">
    <span>已选中 {selectedIds.size} 条记录</span>
    <button onClick={() => batchDelete(Array.from(selectedIds))}>批量删除</button>
  </div>
)}

<table className="w-full text-left">
  <thead>
    <tr>
      <th><input type="checkbox" checked={selectedIds.size === data.length} onChange={toggleSelectAll} /></th>
      <th>名称</th>
      <th>状态</th>
    </tr>
  </thead>
  <tbody>
    {data.map(item => (
      <tr key={item.id}>
        <td><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} /></td>
        <td>{item.name}</td>
        <td><StatusBadge status={item.status} /></td>
      </tr>
    ))}
  </tbody>
</table>
```

**迁移后（DataTable + bulkActions）**：
```tsx
import { DataTable, StatusBadge, Button } from '../../design-system';

const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

const columns: DataTableColumn<ItemType>[] = [
  { 
    key: 'name', 
    header: '名称', 
    render: (row) => <span className="text-theme-text-primary">{row.name}</span>
  },
  { 
    key: 'status', 
    header: '状态', 
    align: 'center',
    render: (row) => <StatusBadge status={row.status} />
  },
];

<DataTable
  columns={columns}
  data={data}
  rowKey={(row) => String(row.id)}
  loading={loading}
  empty={<EmptyState title="暂无数据" />}
  bulkActions={{
    selectedKeys,
    onSelectChange: setSelectedKeys,
    render: (selected) => (
      <div className="flex items-center gap-2">
        <Button variant="danger" onClick={() => batchDelete(selected)}>
          批量删除({selected.length})
        </Button>
        <Button variant="secondary" onClick={() => batchExport(selected)}>
          批量导出
        </Button>
      </div>
    ),
  }}
  pagination={{
    page,
    perPage,
    total,
    onPageChange: setPage,
  }}
/>
```

#### 需要行高亮的表格迁移

**迁移前**：
```tsx
<tr className={selectedIds.has(item.id) ? 'bg-blue-50/30' : ''}>
  {/* ... */}
</tr>
```

**迁移后**：
```tsx
<DataTable
  // ... 其他props
  rowClassName={(row) => 
    selectedKeys.includes(row.id) ? 'bg-blue-50/30' : ''
  }
  bulkActions={{
    selectedKeys,
    onSelectChange: setSelectedKeys,
    render: (selected) => (/* ... */),
  }}
/>
```

### 2.5 已知例外（保持原生 table）

| 文件 | 原因 |
|------|------|
| `pages/assets/BaseResourcePage.tsx` | 需要 `rowClassName` 和特殊选中样式 |
| `pages/assets/PvcManagementPage.tsx` | 需要 `rowProps`、`onContextMenu` |
| `pages/assets/ChimeraScheduleCenterPage.tsx` | 动态 `visibleColumns` |
| `pages/assets/ProjectFileExplorerPage.tsx` | 复杂文件树结构，2233行工作区布局 |

### 2.6 扩展 DataTable 组件

如需支持 `rowClassName`，在 `design-system/application/DataTable/DataTable.tsx` 中添加：

```tsx
// 在 DataTableProps 接口中添加
interface DataTableProps<T> {
  // ... 现有props
  rowClassName?: (row: T, index: number) => string;
}

// 在渲染 tr 元素时使用
<tr
  key={key}
  onClick={onRowClick ? () => onRowClick(row) : undefined}
  className={cx(
    'group transition-colors hover:bg-theme-elevated',
    onRowClick && 'cursor-pointer',
    rowClassName?.(row, index)  // 添加自定义类名
  )}
>
```

### 2.7 验收标准

```bash
# 1. 原生 table 数量显著减少
grep -rn "<table" pages/ --include="*.tsx" | grep -v "ExecutionTable\|DataTable" | wc -l
# 期望：大幅减少，只保留已知例外

# 2. DataTable 使用增加
grep -rn "DataTable" pages/ --include="*.tsx" | wc -l
# 期望：显著增加

# 3. TypeScript 验证
npx tsc --noEmit 2>&1 | grep -vE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"
# 期望：只有 2 个基线错误

# 4. 功能验证
- 选中功能正常工作
- 批量操作功能正常
- 分页功能正常
- 空状态和加载态正常显示
```

### 2.8 提交格式

```bash
git commit -m "refactor(P5-1): migrate tables to DataTable in <域名>"
```

---

## 3. P5-2: Badge/StatusBadge 统一

### 3.1 问题分析

**现状**：
- 存在 `StatusBadge` 组件，但可能使用不充分
- 大量内联 badge 样式实现
- 配色不统一（indigo-50、rose-200、cyan-500 等）

### 3.2 目标规范

**统一的 Badge 组件**：
```tsx
interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default' | 'brand';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

// 使用示例
<Badge variant="success">运行中</Badge>
<Badge variant="danger">失败</Badge>
<Badge variant="warning">等待中</Badge>
```

**标准样式**：
```css
/* 基于 DESIGN.md 暗色徽章配方 */
- 背景色：variant-500/15（15%透明度）
- 文字色：variant-400
- 边框色：variant-500/20（20%透明度）
- 圆角：rounded-full / rounded-md
- 内距：px-2 py-0.5（sm） / px-3 py-1（md）
- 字号：text-[10px] / text-xs
- 字重：font-medium
- 大写：uppercase tracking-wider
```

### 3.3 迁移策略

#### 识别目标
搜索所有内联 badge 实现：
```bash
grep -rn "inline-flex.*rounded.*px.*py.*text-.*bg-.*-" pages/ --include="*.tsx" | head -30
```

#### 替换规则

**常见内联模式 → Badge 组件**：
```tsx
// ❌ 迁移前（各种内联变体）
className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] border-indigo-200 bg-indigo-50 text-indigo-700"
className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700"
className="bg-cyan-500 text-white rounded-lg px-4 py-2 text-sm font-medium"
className="bg-red-500/15 text-red-400 px-2 py-1 rounded-full border border-red-500/20"

// ✅ 迁移后
import { Badge } from '../../design-system';

<Badge variant="success">运行中</Badge>
<Badge variant="danger">失败</Badge>
<Badge variant="brand">自定义</Badge>
<Badge variant="warning">等待中</Badge>
```

#### 配色映射
| 现有配色 | Badge variant |
|----------|---------------|
| `emerald`/`green`/`success` | `success` |
| `rose`/`red`/`danger`/`error` | `danger` |
| `amber`/`orange`/`warning`/`pending` | `warning` |
| `blue`/`info` | `info` |
| `indigo`/`brand`/`primary` | `brand` |
| `slate`/`gray`/`default` | `default` |

### 3.4 执行顺序

1. **先统一 StatusBadge 组件** - 确保已有组件符合规范
2. **按域迁移内联 badge** - vuln → execution → platform → 其他域
3. **统一状态语义** - 确保相同状态使用相同配色

### 3.5 验收标准

```bash
# 内联 badge 模式大幅减少
grep -rn "inline-flex.*rounded.*px.*py.*text-.*bg-.*-" pages/ --include="*.tsx" | wc -l
# 期望：接近 0

# Badge 组件使用增加
grep -rn "Badge\|StatusBadge" pages/ --include="*.tsx" | wc -l
# 期望：显著增加
```

---

## 4. P5-3: Loading/Spinner 统一

### 4.1 问题分析

**现状**：
- 多种 loading 实现方式（`Loader2` + `animate-spin`、自定义 loading、CSS 动画等）
- 样式不统一（颜色、大小、位置）

### 4.2 目标规范

**统一的 Loading 组件**：
```tsx
interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  fullHeight?: boolean;
  className?: string;
}

// 使用示例
<Loading size="sm" />
<Loading fullHeight />
```

**标准样式**：
```css
- 统一使用 lucide-react 的 Loader2 图标
- 颜色：text-theme-text-muted
- 动画：animate-spin
- 大小：sm(14px) / md(18px) / lg(24px)
- fullHeight：flex h-full items-center justify-center py-24
```

### 4.3 迁移策略

#### 替换规则

**常见 loading 模式 → Loading 组件**：
```tsx
// ❌ 迁移前
<Loader2 className="animate-spin mx-auto text-blue-400" />
<Loader2 size={18} className="mx-auto animate-spin text-theme-text-muted" />
<div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>

// ✅ 迁移后
import { Loading } from '../../design-system';

<Loading size="sm" />
<Loading size="md" />
<Loading fullHeight />
```

### 4.4 验收标准

```bash
# 手写 loading 模式减少
grep -rn "Loader2.*animate-spin" pages/ --include="*.tsx" | grep -v "Loading" | wc -l
# 期望：接近 0
```

---

## 5. P5-4: Pagination 统一

### 5.1 问题分析

**现状**：
- 多个自定义 pagination 实现
- 样式和交互不一致

### 5.2 目标规范

**使用 DataTable 内置的 Pagination**：
```tsx
import { Pagination } from '../../design-system';

<Pagination
  page={page}
  perPage={perPage}
  total={total}
  onPageChange={setPage}
  onPerPageChange={setPerPage}  // 可选
/>
```

**注意**：DataTable 的 pagination prop 直接使用此组件。

### 5.3 迁移策略

#### 替换规则

**常见手写分页 → Pagination 组件**：
```tsx
// ❌ 迁移前
<button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>上一页</button>
<span>第 {page} 页，共 {totalPages} 页</span>
<button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页</button>

// ✅ 迁移后
import { Pagination } from '../../design-system';

<Pagination
  page={page}
  perPage={perPage}
  total={total}
  onPageChange={setPage}
/>
```

### 5.4 验收标准

```bash
# 手写分页减少
grep -rn "上一页\|下一页\|onPageChange\|setPage.*Math\." pages/ --include="*.tsx" | wc -l
# 期望：接近 0
```

---

## 6. P5-5: Dropdown 统一

### 6.1 问题分析

**现状**：
- 多个自定义 dropdown 实现（如 `ProjectMgmtPage.tsx`）
- 交互逻辑和样式不统一

### 6.2 目标规范

**统一的 Dropdown 组件**（需在 design-system 中实现）：
```tsx
interface DropdownItem {
  label: string;
  value?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[] | React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

// 使用示例
<Dropdown
  trigger={<Button variant="secondary">选项</Button>}
  items={[
    { label: '编辑', onClick: handleEdit },
    { label: '删除', onClick: handleDelete, disabled: true },
  ]}
/>
```

### 6.3 执行策略

1. **先实现 Dropdown 组件**
2. **按域迁移** - platform → assets → execution → 其他域
3. **注意边界处理** - 点击外部关闭、ESC 关闭等

### 6.4 验收标准

```bash
# 自定义 dropdown 状态管理减少
grep -rn "showDropdown\|setShowDropdown" pages/ --include="*.tsx" | wc -l
# 期望：显著减少
```

---

## 7. P5-6: Toast/Alert 统一

### 7.1 问题分析

**现状**：
- 自定义 toast 实现（如 `WorkflowInstancePage.tsx`）
- 多种提示模式并存

### 7.2 目标规范

**统一的 Alert/Toast 组件**（需在 design-system 中实现）：
```tsx
interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  message: string;
  onClose?: () => void;
  className?: string;
}

// 使用示例
<Alert variant="success" message="操作成功" />
<Alert variant="danger" message="操作失败" onClose={() => setShowAlert(false)} />
```

**或者 useUiFeedback hook**：
```tsx
const { toast } = useUiFeedback();
toast.success('操作成功');
toast.error('操作失败');
```

### 7.3 迁移策略

#### 替换规则

**自定义 toast → Alert 组件**：
```tsx
// ❌ 迁移前
const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3000);
};

// ✅ 迁移后
import { Alert } from '../../design-system';

const [alert, setAlert] = useState<{ message: string; variant: 'success' | 'danger' | 'warning' | 'info' } | null>(null);
```

### 7.4 验收标准

```bash
# 自定义 toast 状态管理减少
grep -rn "toast.*useState\|showToast" pages/ --include="*.tsx" | wc -l
# 期望：显著减少
```

---

## 8. P5-7: Tabs 统一

### 8.1 问题分析

**现状**：
- 多个自定义 tab 实现
- 样式和交互不统一

### 8.2 目标规范

**统一的 Tabs 组件**（需在 design-system 中实现）：
```tsx
interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: TabItem[];
  className?: string;
}

// 使用示例
<Tabs
  value={activeTab}
  onChange={setActiveTab}
  items={[
    { value: 'timeline', label: '时间线' },
    { value: 'results', label: '结果' },
    { value: 'tasks', label: '任务' },
  ]}
/>
```

### 8.3 迁移策略

#### 替换规则

**自定义 tabs → Tabs 组件**：
```tsx
// ❌ 迁移前
const [activeTab, setActiveTab] = useState<'timeline' | 'results' | 'tasks'>('timeline');

<div className="flex gap-4 border-b">
  <button onClick={() => setActiveTab('timeline')} className={activeTab === 'timeline' ? 'border-b-2 border-brand-primary' : ''}>时间线</button>
  <button onClick={() => setActiveTab('results')} className={activeTab === 'results' ? 'border-b-2 border-brand-primary' : ''}>结果</button>
</div>

// ✅ 迁移后
import { Tabs } from '../../design-system';

<Tabs
  value={activeTab}
  onChange={setActiveTab}
  items={[
    { value: 'timeline', label: '时间线' },
    { value: 'results', label: '结果' },
  ]}
/>
```

### 8.4 验收标准

```bash
# 自定义 tab 状态管理减少
grep -rn "activeTab.*useState\|setActiveTab" pages/ --include="*.tsx" | wc -l
# 期望：显著减少
```

---

## 9. P5-8: 其他组件统一

### 9.1 Timeline 统一

**目标**：统一时间线组件（主要用于 vuln 域）

**规范**：
- 统一的时间点样式
- 统一的连接线样式
- 统一的内容卡片样式

### 9.2 Progress 统一

**目标**：统一进度条组件

**规范**：
```tsx
interface ProgressProps {
  value: number;  // 0-100
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}
```

### 9.3 Breadcrumb 统一

**目标**：统一面包屑导航（如存在）

**规范**：
```tsx
interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}
```

---

## 10. 总体验收标准

### 10.1 代码质量
```bash
# TypeScript 验证
npx tsc --noEmit 2>&1 | grep -vE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"
# 期望：只有 2 个基线错误

# 无新增 ESLint 错误
npm run lint
# 期望：通过
```

### 10.2 视觉统一性

- 所有表格使用统一样式和交互
- 所有 badge 使用统一配色和规格
- 所有 loading 使用统一样式
- 所有分页使用统一组件
- 所有下拉菜单使用统一交互
- 所有提示消息使用统一样式

### 10.3 功能完整性

- 表格选中、分页、排序功能正常
- Badge 状态显示准确
- Loading 状态显示正确
- 分页跳转正常
- Dropdown 交互流畅
- Alert 提示及时

---

## 11. 风险提示

### 11.1 高风险项

1. **表格统一（P5-1）**
   - 量大且复杂，需逐文件分析
   - 选中功能需仔细测试
   - 特殊表格需要扩展组件或保持例外

2. **Dropdown 统一（P5-5）**
   - 交互复杂（点击外部、ESC关闭等）
   - 边界处理需完善
   - 可能需要新增组件

### 11.2 中风险项

1. **Tabs 统一（P5-7）**
   - 某些页面可能有复杂的 tab 逻辑
   - 需要保持原有交互行为

2. **Toast/Alert 统一（P5-6）**
   - 涉及全局状态管理
   - 需确保不影响现有反馈机制

### 11.3 低风险项

1. **Badge 统一（P5-2）**
   - 主要是样式替换
   - 风险较小

2. **Loading 统一（P5-3）**
   - 直接替换即可
   - 影响范围小

---

## 12. Git 工作流

### 12.1 分支策略

```bash
# 确保在 local 分支
git checkout local
git pull --rebase origin local
```

### 12.2 提交格式

```bash
# 每个子任务完成后
git add -A
git commit -m "refactor(P5-X): unify <组件名> in <域名>"
git pull --rebase origin local
git push origin local
```

### 12.3 冲突处理

如遇冲突：
1. 优先保留远程变更
2. 确保组件符合最新设计规范
3. 运行 `npx tsc --noEmit` 验证

---

## 13. 进度跟踪

### 13.1 每日检查

```bash
# 统计进度
echo "表格统一：$(grep -rn 'DataTable' pages/ --include='*.tsx' | wc -l) / ~100"
echo "Badge统一：$(grep -rn 'Badge\|StatusBadge' pages/ --include='*.tsx' | wc -l) / ~150"
echo "Loading统一：$(grep -rn 'Loading' pages/ --include='*.tsx' | wc -l) / ~80"
```

### 13.2 周报模板

```markdown
## P5 进度汇报

### 本周完成
- P5-X: <组件名> 统一，完成 <域A>/<域B>/<域C>，涉及 X 个文件

### 进行中
- P5-Y: <组件名> 统一，完成 <域A>，正在进行 <域B>

### 遇到问题
- <问题描述>，已解决/待解决

### 下周计划
- 完成 P5-Y 剩余域
- 开始 P5-Z
```

---

## 14. 成功标准

### 14.1 量化指标

| 组件 | 统一率 | 目标 |
|------|--------|------|
| 表格 | DataTable覆盖率 | >90% |
| Badge | 组件使用率 | >95% |
| Loading | 组件使用率 | >90% |
| Pagination | 组件使用率 | >95% |
| Dropdown | 组件使用率 | >80% |
| Toast/Alert | 组件使用率 | >85% |
| Tabs | 组件使用率 | >85% |

### 14.2 质量标准

- ✅ 设计规范符合 DESIGN.md 要求
- ✅ 代码通过 TypeScript 验证
- ✅ 视觉一致性达标
- ✅ 功能完整性保证
- ✅ 无新增基线错误

---

> **最后更新**: 2026-06-22  
> **接手模型**: claudecode+glm5.2  
> **预计完成**: P5-1 → P5-8（13-20天）  
> **验证命令**: `npx tsc --noEmit 2>&1 | grep -vE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"`