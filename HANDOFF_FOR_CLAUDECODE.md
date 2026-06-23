# HANDOFF_FOR_CLAUDECODE.md

> 项目：Chimera · 企业级 AI 安全研发平台
> 分支：`local`（跟踪 `origin/local`）
> 最后提交：`6ac3c9b` refactor(P2-B4)
> 编写日期：2026-06-22
> 目的：让 claudecode+glm5.2 继续 **P4-3 剩余任务** 和 **Modal 颜色统一**

---

## 1. 当前状态分析

### 已完成情况（opencode+glm5.1）
- ✅ P0-P2.B4: 基础组件 + application 组件 + 部分页面迁移
- ✅ P4-3: 大部分页面的规范收敛（但不完整）

### 遗留问题（基于代码扫描）

#### 1.1 PageHeader 迁移未完成
**现状**: 搜索显示只有约 20 个文件明确使用 PageHeader，相对于 ~195 个页面文件，迁移覆盖率较低

**未迁移域分布（基于文件分布预估）**：
```
pages/execution/    约32文件未迁移
pages/environment/  约17文件未迁移  
pages/platform/     约17文件未迁移
pages/vuln/         约9文件未迁移
pages/orchestration/ 约9文件未迁移
pages/task/         约5文件未迁移
pages/assets/       约6文件未迁移
pages/project/      约3文件未迁移
```

#### 1.2 P3 规范收敛遗留问题
**具体问题文件（基于 grep 扫描）**：

1. **bg-theme-app 违规**（至少 20 文件）：
   - `pages/execution/DataflowVulnScanTaskDetailPage.tsx`
   - `pages/orchestration/AppInstancePage.tsx`
   - `pages/environment/EnvAiAgentSessionManagePage.tsx`
   - `pages/platform/AiGatewayPage.tsx`
   - `pages/platform/DepartmentMemberPage.tsx`
   - `pages/platform/ChimeraScheduleCenterPage.tsx`
   - `pages/vuln/vuln-engine/CasesWorkspace.tsx`
   - `pages/orchestration/WorkflowInstanceDetailPage.tsx`
   - `pages/orchestration/WorkflowInstanceLogsPage.tsx`
   - `pages/orchestration/WorkflowInstancePage.tsx`
   - `pages/ai4app/AppScanTaskDetailPage.tsx`
   - `pages/ai4app/AppScanOverviewPage.tsx`
   - `pages/assets/PvcManagementPage.tsx`
   - `pages/assets/TaskMgmtPage.tsx`
   - `pages/execution/DataflowAnalysisConfigPage.tsx`
   - `pages/execution/MobileSecurityIpcVulnPage.tsx`
   - `pages/execution/DataflowVulnScanConfigPage.tsx`
   - `pages/execution/VulnVerifyV2TaskPage.tsx`
   - `pages/execution/VulnVerifyTaskPage.tsx`
   - 以及更多...

2. **超标圆角**（6 文件）：
   - `pages/execution/VulnVerifyV2TaskPage.tsx`
   - `pages/execution/VulnVerifyTaskPage.tsx`
   - `pages/execution/ExecutionCodeAuditPage.tsx`
   - `pages/execution/ExecutionCodeAuditDetailPage.tsx`
   - `pages/environment/AgentDetailPage.tsx`
   - `pages/execution/ReportsPage.tsx`

3. **font-black 残留**（4 文件）：
   - `pages/execution/VulnVerifyV2TaskPage.tsx`
   - `pages/execution/VulnVerifyTaskPage.tsx`
   - `pages/platform/AiGatewayDashboardPage.tsx`
   - `pages/HomePage.tsx`

#### 1.3 Modal 颜色搭配问题
**问题**: 现有 Modal 组件和自定义弹窗颜色不统一，存在多种背景色和边框色组合

---

## 2. Modal 颜色统一规范

### 2.1 标准 Modal 颜色规范

**统一使用 design-system Modal 组件**：
```tsx
import { Modal } from '../../design-system';

// 标准使用
<Modal 
  open={isOpen} 
  onClose={() => setIsOpen(false)}
  className="max-w-md"
>
  {/* 内容 */}
</Modal>
```

### 2.2 Modal 颜色标准

**背景层级**：
- Overlay: `rgba(5,10,20,0.72)` + `blur(6px)` (固定)
- 容器背景: `bg-theme-surface` (统一使用 surface 层级)
- 边框: `border border-theme-border` (1px 默认边框)

**禁止的颜色**：
- ❌ `bg-white` / `bg-slate-50` (浅色底)
- ❌ `bg-theme-app` (层级过低，会发黑)
- ❌ `border-rose-200` / `border-gray-200` (浅色边框)
- ❌ `shadow-sm` / `shadow-lg` (多层重阴影)

### 2.3 需要修改的 Modal 模式

#### 模式 1: 内联弹窗迁移
**原代码**：
```tsx
{isOpen && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50">
    <div className="bg-white w-full max-w-md rounded-[3rem] border border-rose-200 p-6 shadow-sm">
      {/* 内容 */}
    </div>
  </div>
)}
```

**修改为**：
```tsx
<Modal open={isOpen} onClose={() => setIsOpen(false)} className="max-w-md">
  {/* 内容保持不变，删除两层外层div */}
</Modal>
```

#### 模式 2: 已有 Modal 但颜色错误
**检查点**：
- Modal 内部的 `div` 是否使用了错误背景色
- 是否有浅色边框
- 是否有不必要的阴影

**修复**：
```tsx
// ❌ 错误
<Modal open={isOpen} onClose={onClose}>
  <div className="bg-white p-6 rounded-xl border border-rose-200">
    {/* 内容 */}
  </div>
</Modal>

// ✅ 正确  
<Modal open={isOpen} onClose={onClose}>
  <div className="p-6">
    {/* 内容 - 默认背景已经是 bg-theme-surface */}
  </div>
</Modal>
```

### 2.4 Modal 内部组件颜色规范

**表单输入**：
- Input: `bg-theme-elevated` (在 Modal 内部再抬一层)
- Select: 同上
- Textarea: 同上

**按钮**：
- Primary: `btn-primary` (已使用品牌色)
- Secondary: `btn-secondary` (使用 elevated 背景)
- Cancel: Ghost 按钮

**文本**：
- 标题: `text-theme-text-primary` / `font-semibold`
- 描述: `text-theme-text-secondary` / `text-sm`
- 错误: `text-theme-text-danger`

---

## 3. 剩余任务执行计划

### Phase 1: Modal 颜色统一（高优先级）

#### Step 1.1: 扫描所有 Modal 使用
```bash
# 找到所有 Modal 或自定义弹窗
grep -r "Modal\|fixed.*inset-0" pages/ --include="*.tsx" | grep -v "node_modules"
```

#### Step 1.2: 逐文件修复颜色
按域分批处理：
1. `pages/platform/` - 优先修复（用户可见度高）
2. `pages/vuln/` - 核心业务域
3. `pages/execution/` - 任务执行域
4. `pages/assets/` - 资产管理
5. `pages/orchestration/` - 编排域
6. `pages/environment/` - 环境域
7. `pages/task/` - 任务域
8. `pages/project/` - 项目域

#### Step 1.3: 修复要点
- 统一使用 `Modal` 组件
- 移除所有浅色背景（`bg-white`, `bg-slate-*`）
- 移除浅色边框（`border-rose-*`, `border-gray-*`）
- 移除多余阴影（`shadow-sm`, `shadow-lg`）
- 统一圆角为 `rounded-2xl` (16px)

### Phase 2: PageHeader 迁移继续

#### Step 2.1: 识别未迁移页面
```bash
# 找到所有有 h1/h2 标题但没有 PageHeader 的页面
grep -r "text-2xl.*font\|text-3xl.*font" pages/ --include="*.tsx" | 
  grep -v "PageHeader" | 
  grep -v "node_modules"
```

#### Step 2.2: 批量迁移模式
**标准迁移模板**：
```tsx
// 原代码
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-black text-theme-text-primary">页面标题</h1>
    <button className="btn-primary">操作</button>
  </div>
  {/* 其他内容 */}
</div>

// 迁移后
import { PageHeader } from '../../design-system';

<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader
    title="页面标题"
    description="可选的副标题"
    actions={<Button variant="primary">操作</Button>}
  />
  {/* 其他内容保持不变 */}
</div>
```

#### Step 2.3: 迁移顺序（按页面重要性）
1. **核心列表页**（用户高频使用）
   - `pages/platform/UserMgmtPage.tsx`
   - `pages/platform/RoleMgmtPage.tsx`
   - `pages/vuln/VulnIntakePage.tsx` (可能已迁移)

2. **详情页**（带返回按钮）
   - `pages/execution/*TaskDetailPage.tsx`
   - `pages/orchestration/*InstanceDetailPage.tsx`

3. **配置页**（表单类）
   - `pages/execution/*ConfigPage.tsx`
   - `pages/platform/*ConfigPage.tsx`

4. **概览页**（Dashboard类）
   - `pages/ai4app/AppScanOverviewPage.tsx`
   - `pages/redline/RedlineOverviewPage.tsx`

### Phase 3: P3 规范收尾

#### Step 3.1: 修复残留的 bg-theme-app
**目标文件**（20+ 个文件）
```bash
# 批量替换
find pages/ -name "*.tsx" -exec sed -i 's/bg-theme-bg-app/bg-theme-surface/g' {} \;
find pages/ -name "*.tsx" -exec sed -i 's/bg-theme-app/bg-theme-surface/g' {} \;
```

**注意**: 只替换作为卡片/面板背景的 `bg-theme-app`，保留页面根容器的背景。

#### Step 3.2: 修复超标圆角
**目标文件**（6 个文件）
```bash
# 替换规则
rounded-3xl → rounded-xl (卡片/面板)
rounded-[3rem] → rounded-xl
rounded-[2.5rem] → rounded-2xl (弹窗)
rounded-2xl (控件) → rounded-lg
```

**具体文件**：
- `pages/execution/VulnVerifyV2TaskPage.tsx`
- `pages/execution/VulnVerifyTaskPage.tsx` 
- `pages/execution/ExecutionCodeAuditPage.tsx`
- `pages/execution/ExecutionCodeAuditDetailPage.tsx`
- `pages/environment/AgentDetailPage.tsx`
- `pages/execution/ReportsPage.tsx`

#### Step 3.3: 移除残留的 font-black
**目标文件**（4 个文件）
```tsx
// 替换规则
页面主标题 (h1/h2) → font-semibold
关键数值大数字 → font-bold  
其他 → font-medium
```

---

## 4. 验证检查清单

### 4.1 TypeScript 验证
```bash
# 每完成一个域后验证
cd C:/zwd_work/Chimera
npx tsc --noEmit 2>&1 | grep -vE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"
# 期望: 只有 2 个基线错误
```

### 4.2 Modal 颜色检查
```bash
# 确保没有残留的浅色背景
grep -r "bg-white\|bg-slate-50\|bg-gray-50" pages/ --include="*.tsx" | 
  grep -v "node_modules" | 
  grep -v "// "
```

### 4.3 PageHeader 迁移检查
```bash
# 检查是否还有内联标题
grep -r "text-2xl.*font\|text-3xl.*font" pages/ --include="*.tsx" | 
  grep -v "PageHeader" | 
  grep -v "node_modules" |
  wc -l
# 期望: 接近 0
```

### 4.4 设计规范检查
```bash
# 检查 bg-theme-app 违规（排除页面根容器）
grep -r "bg-theme-app\|bg-theme-bg-app" pages/ --include="*.tsx" | 
  grep -v "node_modules" |
  wc -l
# 期望: 很少或没有

# 检查超标圆角
grep -r "rounded-3xl\|rounded-\[3rem\]\|rounded-\[2\.5rem\]" pages/ --include="*.tsx" | 
  grep -v "node_modules" |
  wc -l  
# 期望: 0

# 检查 font-black
grep -r "font-black" pages/ --include="*.tsx" | 
  grep -v "node_modules" |
  wc -l
# 期望: 0
```

---

## 5. 已知例外（跳过不修改）

### 5.1 特殊布局页面
- `pages/assets/MachineTokenPage.tsx` - 有自定义渐变 hero banner
- `pages/environment/WorkflowPage.tsx` - 工作区布局
- `pages/assets/ProjectFileExplorerPage.tsx` - 复杂文件树布局
- `pages/vuln/vuln-engine/CasesWorkspace.tsx` - 工作区布局

### 5.2 特殊 Modal 需求
- `pages/platform/AiGatewayPage.tsx` 末尾全屏面板 - `z-[260]` 全屏密钥管理面板
- 所有 `z-[160]` 弹窗 - 高层级导入预览弹窗

### 5.3 特殊表格需求
- `pages/assets/BaseResourcePage.tsx` 表格 - 需要 `rowClassName`
- `pages/assets/PvcManagementPage.tsx` 表格 - 需要 `rowProps`/`onContextMenu`

---

## 6. 关键技术规范

### 6.1 import 路径规范
```tsx
// 必须使用相对路径，不用 @/ 别名
import { PageHeader, Modal, Button, DataTable } from '../../design-system';
```

### 6.2 颜色使用规范
```tsx
// ✅ 正确
bg-theme-surface       // 卡片背景
bg-theme-elevated      // 输入框/次级背景
border-theme-border    // 默认边框
text-theme-text-primary // 主文本
text-theme-text-muted  // 次要文本

// ❌ 错误
bg-white / bg-slate-50  // 浅色底
border-gray-200         // 浅色边框  
text-gray-900           // 浅色文本
```

### 6.3 圆角规范
```tsx
// ✅ 正确
rounded-lg   // 8px - 按钮/输入
rounded-xl   // 12px - 卡片/面板
rounded-2xl  // 16px - 弹窗

// ❌ 错误
rounded-3xl / rounded-[3rem] // 过圆
```

### 6.4 Modal 使用要点
```tsx
// null crash 防护
{selectedItem && (  // ✅ 正确 - null 时完全不渲染
  <Modal open={isOpen} onClose={...}>
    <h3>{selectedItem.name}</h3>
  </Modal>
)}

// ❌ 错误 - children 仍会求值
<Modal open={isOpen && !!selectedItem} onClose={...}>
  <h3>{selectedItem.name}</h3>  
</Modal>
```

---

## 7. 提交与协作规范

### 7.1 Commit 模板
```bash
# Phase 1 提交
git commit -m "fix(p4-modal): unify modal colors in platform domain"

# Phase 2 提交  
git commit -m "refactor(p4-pageheader): migrate page headers in execution domain"

# Phase 3 提交
git commit -m "fix(p4-design): remove bg-theme-app violations and fix border-radius"
```

### 7.2 推送前检查
```bash
# 1. TypeScript 验证
npx tsc --noEmit

# 2. 重新基线
git pull --rebase origin local

# 3. 推送
git push origin local
```

### 7.3 冲突处理
如遇冲突（特别是 `VulnIntakePage.tsx`）：
- 优先保留远程变更的文案/字段
- 使用 design-system 组件渲染
- 确保颜色符合最新规范

---

## 8. 快速参考

### Design System 组件速查
```tsx
import {
  // Primitives
  Button, Input, Select, FormField, Card, Modal, SegmentedControl,
  // Application  
  PageHeader, StatisticCard, PageSection, EmptyState,
  Toolbar, SearchInput, DataTable, Pagination, FormActionBar,
} from '../../design-system';
```

### 常见页面模板
```tsx
// 列表页模板
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader
    title="页面名称"
    description="一句话说明"
    actions={<Button variant="primary">新建</Button>}
  />
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <StatisticCard label="总数" value={total} />
  </div>
  <Toolbar search={...} filters={...} />
  <DataTable columns={...} data={...} rowKey={(row) => String(row.id)} />
</div>

// 详情页模板
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
  <PageHeader
    title="详情标题"
    back={{ label: '返回', onClick: () => navigate('list') }}
  />
  <PageSection title="基础信息">{...}</PageSection>
  <PageSection title="配置项">{...}</PageSection>
</div>
```

---

## 9. 风险提示

### 高风险项
1. **Modal 颜色统一**: 涉及全站弹窗，用户可见度高，需仔细测试
2. **PageHeader 迁移**: 量大且每个页面结构不同，需逐文件判断
3. **bg-theme-app 替换**: 需区分页面根容器和卡片背景

### 中风险项
1. **Modal null crash**: 条件渲染弹窗时必须正确处理 null 情况
2. **font-black 语义**: 不能机械替换，需按语义判断字重级别

### 低风险项
1. **圆角标准化**: 直接替换即可，影响范围小
2. **路径修复**: import 路径统一，tsc 会报错提示

---

## 10. 成功标准

### 量化指标
- ✅ Modal 颜色统一率: 100%（无浅色背景残留）
- ✅ PageHeader 迁移率: >90%（核心页面全覆盖）
- ✅ bg-theme-app 违规: <5 处（仅页面根容器）
- ✅ 超标圆角: 0 处
- ✅ font-black: 0 处
- ✅ TypeScript 错误: 保持 2 个基线错误

### 质量标准
- 所有 Modal 统一使用 `bg-theme-surface`
- 所有页面标题统一使用 PageHeader
- 设计规范符合 DESIGN.md 要求
- 代码通过 TypeScript 验证

---

> **最后更新**: 2026-06-22  
> **接手模型**: claudecode+glm5.2  
> **预计完成**: P4-3 剩余任务 + Modal 颜色统一  
> **验证命令**: `npx tsc --noEmit 2>&1 | grep -vE "EntryAnalysisConfigPage|SystemAnalysisConfigPage"`