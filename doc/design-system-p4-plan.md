# P4 执行规划 — 控件样式统一 + 页面 Padding 统一

> 前置条件：P3 全部完成并推送
> 配套文档：`HANDOFF_FOR_OPENCODE.md`（API 参考）、`OPENCODE_TASK.md`（P2-B5/P3）
> 目标：让用户在浏览器能看到 input/select/button/弹窗内部表单的视觉统一

---

## 背景与问题

P2 的策略是"只换壳不动内容"，P3 清理了字重/颜色/圆角。但此时表单控件依然杂乱：

| 问题 | 当前情况 | 目标 |
|---|---|---|
| Input 背景色 | 62处 `bg-theme-bg-app`（违规）、27处 `bg-theme-surface`（也违规）、7处 `bg-theme-elevated`（正确）| 统一 `form-input`（`--bg-elevated`）|
| Input 圆角 | `rounded-2xl`/`rounded-[2rem]`/`rounded-xl`/`rounded-lg` 全部混用 | 统一 `rounded-lg`（8px）|
| Input 内距 | `px-6 py-4`/`px-4 py-3`/`px-4 py-2`/`px-3 py-2.5` 各异 | 统一 `px-3 py-2.5` |
| Button 样式 | 各页面手写颜色/圆角/字重 | 统一 `.btn-primary`/`.btn-secondary`/`.btn-icon` |
| Textarea | 22处不用 `form-textarea`（白底白字 bug 复发风险） | 统一 `form-textarea` |
| 页面根 padding | 41个文件用 `p-10`/`p-8`（是规范 2.5 倍），其余 `p-4`/`p-6` 各异 | 统一 `px-5 py-5 md:px-6 2xl:px-8 space-y-4` |

**各域未迁移规模：**
```
pages/execution:    input=39文件, button=53文件（最大）
pages/platform:     input=14文件, button=17文件
pages/environment:  input=14文件, button=18文件
pages/orchestration: input=7文件, button=9文件
pages/vuln:         input=5文件,  button=9文件
pages/assets:       input=7文件,  button=8文件
pages/task:         input=3文件,  button=6文件
pages/project:      input=2文件,  button=3文件
pages/ai4app:       input=1文件,  button=3文件
```

---

## 验证基线（开始前）

```bash
cd /c/zwd_work/Chimera
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望：2（始终不得增加）
```

---

## P4-1：页面根容器 Padding 统一

### 规范（DESIGN.md §3.3 / §13.3）
```css
/* 所有内容页面的根容器 */
px-5 py-5 md:px-6 2xl:px-8 space-y-4
/* 区块间距 */
space-y-4  （标准）
space-y-6  （宽松，大区块之间）
```

### 识别目标
找每个页面文件 `return (` 后的第一个 `<div className="...">`，特征是包含：
- `h-full overflow-y-auto` 或 `overflow-y-auto`
- `p-10` / `p-8` / `p-6`（不符合规范的）

### 替换映射
```
p-10 space-y-8   → px-5 py-5 md:px-6 2xl:px-8 space-y-4
p-10 space-y-10  → px-5 py-5 md:px-6 2xl:px-8 space-y-4
p-8 space-y-6    → px-5 py-5 md:px-6 2xl:px-8 space-y-4
p-8 space-y-8    → px-5 py-5 md:px-6 2xl:px-8 space-y-4
p-6 space-y-6    → px-5 py-5 md:px-6 2xl:px-8 space-y-4
```

保留不变的：
- `animate-in fade-in duration-500`（动画类保留）
- `pb-24`（底部超额 padding，防止内容被底栏遮住，保留）
- `h-full overflow-y-auto`（滚动结构，保留）
- `custom-scrollbar`（滚动条样式，保留）

### 示例
```tsx
// 替换前
<div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto bg-theme-app">

// 替换后
<div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto">
```

### 涉及文件数：~41 个

commit：`refactor(P4): standardize page root padding to design-system spec`

---

## P4-2：Input / Textarea 统一

### 规范（DESIGN.md §7）
```css
.form-input {
  rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors;
  background-color: var(--bg-elevated);   /* 暗色背景 */
  border-color: var(--border-default);
  color: var(--text-secondary);
}
.form-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);  /* focus ring，非 glow */
}

.form-textarea {
  /* 同 form-input，多行 */
}
```

### 识别目标
所有 `<input>` 和 `<textarea>` 带有手写 className（而非直接用 `form-input`/`form-textarea`）。

### 替换规则

**Input：**
```tsx
// 这些都替换为 className="form-input"（加宽度等修饰类另外追加）
className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-theme-text-primary"
className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm outline-none"
className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
className="w-full px-4 py-3 bg-theme-bg-app border border-theme-border rounded-xl text-sm focus:ring-2 ring-blue-500 outline-none"

// 替换后：追加宽度/margin，但核心样式走 class
className="form-input w-full"
className="form-input"
className="form-input mt-1 w-full"
```

**Textarea：**
```tsx
// 替换前
className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-theme-text-primary resize-none"
className="form-input min-h-[66px] rounded-lg px-3 py-2 text-sm resize-none"  // 混用 form-input

// 替换后
className="form-textarea w-full resize-none"
className="form-textarea min-h-[66px]"
```

**保留不替换的：**
- `type="checkbox"` / `type="radio"` — 不是文本输入，跳过
- `type="range"` / `type="color"` / `type="file"` — 特殊控件，跳过
- 搜索框已用 `SearchInput` DS 组件的，跳过
- `className="form-input"` 已经是正确的，跳过

### 执行顺序（按弹窗优先）

弹窗内部的 input 最影响用户感知，优先改：
1. `pages/platform/` 所有弹窗内的 input（RoleMgmtPage、ProjectPage、UserMgmtPage 等）
2. `pages/assets/` 弹窗内 input
3. `pages/vuln/` 表单 input
4. `pages/execution/` Config 页的表单 input
5. `pages/environment/` input
6. 其余域

commit 格式：`refactor(P4): replace inline input styles with form-input in <域名>`

---

## P4-3：Select 统一

### 规范（DESIGN.md §8）
```css
.form-select {
  rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors;
  background-color: var(--bg-elevated);
  border-color: var(--border-default);
  color: var(--text-secondary);
}
```

### 识别目标
`<select>` 元素带手写 className，且不包含 `form-select`。

### 替换规则
```tsx
// 替换前（各种手写变体）
className="w-full rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm font-medium text-theme-text-secondary outline-none transition"
className="rounded-xl border border-theme-border px-3 py-2 text-sm"
className="bg-theme-bg-app border border-theme-border rounded-lg px-3 py-2 text-sm"

// 替换后
className="form-select"
className="form-select w-full"
```

**不替换：**
- 已是 `form-select` 的
- `pages/vuln/VulnIntakePage.tsx` 的 Select 组件（已用 DS）

commit：`refactor(P4): replace inline select styles with form-select in <域名>`

---

## P4-4：Button 统一

### 规范（DESIGN.md §6 / P0 Button 组件）

已有的 CSS 类：
```css
.btn            /* 基类：inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors */
.btn-primary    /* 品牌色，白字 */
.btn-secondary  /* bg-elevated，muted 文字，带边框 */
.btn-icon       /* 方形图标按钮 p-2.5 */
.btn-danger-soft /* 危险操作 */
```

### 识别规则

以下 button 模式可以直接替换：

**主操作 → `btn btn-primary`：**
```tsx
// 特征：bg-blue-600/bg-indigo-600/bg-brand-primary + 白字
className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white"
className="rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white hover:bg-theme-elevated"
// → className="btn btn-primary"
```

**次操作 → `btn btn-secondary`：**
```tsx
// 特征：bg-theme-bg-app/bg-theme-elevated + border + muted文字
className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
// → className="btn btn-secondary"
```

**图标按钮 → `btn-icon`：**
```tsx
// 特征：只有图标无文字，p-2/p-3
className="p-3 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-indigo-400 rounded-xl transition-all"
// → className="btn-icon"
```

**危险操作 → `btn-danger-soft`：**
```tsx
// 特征：bg-red-500/bg-rose-500 相关
className="px-4 py-2 bg-red-500/15 text-red-400 rounded-xl"
// → className="btn-danger-soft"
```

### 注意：不替换的情况
- 带特殊 hover 动画的大型 CTA 按钮（如 hero banner 内）
- Toggle 开关按钮（有 active/inactive 两态）
- 导航类按钮（已用 `theme-shell-active`/`theme-shell-muted`）
- loading 状态用了 `disabled:opacity-50 cursor-not-allowed` 的，确认 `.btn-primary:disabled` 已包含此样式（已包含，可直接替换）

### 执行顺序（弹窗内优先）
1. `pages/platform/` 所有弹窗内的 button（确认/取消按钮）
2. `pages/assets/` 弹窗内 button
3. 各域页面内的工具栏按钮
4. 详情页操作按钮

commit：`refactor(P4): replace inline button styles with btn classes in <域名>`

---

## P4-5：弹窗内部整体清理

P2 的弹窗只换了外壳，内部的 form 结构通常是这样：

```tsx
// 当前弹窗内部（典型 platform 弹窗）
<Modal open={...} onClose={...} className="max-w-md">
  <div className="p-10 pb-4 border-b ...">          {/* 弹窗自定义头部 */}
    <h3 className="text-xl font-black ...">标题</h3>
  </div>
  <form className="p-10 space-y-6">
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase ...">字段名</label>
      <input className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl ..." />
    </div>
    <button className="rounded-2xl bg-indigo-600 text-white font-black ...">提交</button>
  </form>
</Modal>
```

执行 P4-2/P4-3/P4-4 之后，同一弹窗会变成：

```tsx
<Modal open={...} onClose={...} className="max-w-md">
  <div className="p-8 pb-4 border-b ...">
    <h3 className="text-xl font-semibold ...">标题</h3>  {/* P3已改字重 */}
  </div>
  <form className="p-6 space-y-4">                       {/* P4-1改内距 */}
    <div className="space-y-1.5">
      <label className="form-label">字段名</label>        {/* 顺手改 */}
      <input className="form-input w-full" />             {/* P4-2 */}
    </div>
    <button className="btn btn-primary w-full">提交</button>  {/* P4-4 */}
  </form>
</Modal>
```

**弹窗 form 内距规范：**
```
外层 padding：p-6（从 p-10 降）
space-y：space-y-4（从 space-y-6/8 降）
label：改为 className="form-label"（已有 CSS 类）
```

---

## 执行顺序总览

```
P4-1  页面根容器 padding 统一    (~41文件, 每文件1行)     先做，最快
P4-2  Input/Textarea 统一        (~158处, 分域)           弹窗内部优先
P4-3  Select 统一                (~333处 select, 分域)    与 P4-2 同步
P4-4  Button 统一                (~2188处 button, 分域)   量最大，分批
P4-5  弹窗内部 form 内距/label   (~30个弹窗)              P4-1~4后顺带
```

**建议：同一个文件里 P4-1 到 P4-5 一起做**，不要分多次触碰同一文件。

---

## Commit 格式

```bash
# 每个域完成后
git add -A
git commit -m "refactor(P4): unify form controls and page padding in <域名>"
git pull --rebase origin local
git push origin local
```

---

## 最终验收

```bash
# 根容器 padding 统一
grep -rl '"p-10 \|" p-10' --include=*.tsx pages | xargs grep -l "h-full\|overflow-y-auto" | wc -l
# 期望：趋近 0

# Input 未迁移
grep -rh '<input' --include=*.tsx pages | grep 'className=' | grep -v "form-input\|checkbox\|radio\|range\|file\|color" | wc -l
# 期望：趋近 0（残留为特殊控件）

# tsc 基线
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# 期望：2（不变）
```

---

## 已知例外（不要改）

| 文件/位置 | 原因 |
|---|---|
| 所有 `type="checkbox"` input | 复选框，不用 form-input |
| 所有 `type="radio"` input | 单选框，不用 form-input |
| `pages/execution/DataflowFileserverRunDashboardPage.tsx` 内 textarea | 该文件生成 HTML 字符串，不是 JSX textarea |
| hero banner 内大型 CTA button | 品牌展示，保留自定义样式 |
| `layout/Header.tsx` 的导航按钮 | 已用 `theme-shell-active`/`theme-shell-muted`，P3已处理 |
| `pages/assets/ProjectFileExplorerPage.tsx` | 工作区，跳过 |
