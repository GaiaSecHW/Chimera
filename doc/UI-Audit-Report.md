# Chimera UI Audit Report

> 审计日期：2026-06-17  
> 项目技术栈：React + TypeScript + Vite + Tailwind CSS v3.4.17  
> 审计范围：229 个 TSX 文件，175,528 行代码

---

## 统计概览

| 类别 | 独立值数 | 总出现次数 | 最常用值 |
|---|:---:|:---:|---|
| 颜色（hex + rgba） | 120 hex + 128 rgba | ~1,538 + ~896 | `#26324a`(110次), `rgba(79,115,255,0.14)`(79次) |
| 字体大小（自定义 bracket） | 13 | 2,587 | `text-[11px]`(1,212次), `text-[10px]`(1,125次) |
| 字体大小（Tailwind 标准） | 10 | 7,324 | `text-xs`(3,287次), `text-sm`(3,154次) |
| margin | 43 标准 + 1 自定义 | ~3,931 | `mt-1`(1,247次), `mt-2`(820次) |
| padding | 85 标准 + 7 自定义 | ~15,615 | `px-3`(2,508次), `py-2`(2,246次) |
| border-radius（自定义 bracket） | 16 | 594 | `rounded-[2rem]`(241次) |
| border-radius（Tailwind 标准） | 7 | 6,080 | `rounded-xl`(1,893次), `rounded-lg`(1,597次) |

---

## 严重问题 (CRITICAL)

### C-1: 70 个文件定义了仅暗黑主题的 `const LK = {...}` 硬编码色板

> 影响范围：70+ TSX 文件，~2,510 个 inline `style={{}}` 块

所有 LK 对象只包含暗黑值（`#070d18`, `#111a2b`, `#f5f7ff` 等），切换到 chimera 暖色主题时，这些页面仍显示暗黑底色 + 浅色文字，导致大面积可读性崩溃。

涉及的关键文件（部分）：

- `pages/DashboardPage.tsx`
- `pages/HomePage.tsx`
- `pages/project/ProjectMgmtPage.tsx`
- `pages/project/ProjectDetailPage.tsx`
- `pages/task/KnowledgeGraphPage.tsx`
- `pages/task/WebEndToEndPage.tsx`
- `pages/task/CreateTaskDialog.tsx`
- `pages/task/TaskCenterPage.tsx`
- `pages/task/TaskCenterTimelinePage.tsx`
- `pages/vuln/VulnOverviewPage.tsx`
- `pages/vuln/VulnEnginePage.tsx`
- `pages/vuln/VulnIntakePage.tsx`
- `pages/vuln/ReviewJudgmentPage.tsx`
- `pages/vuln/vuln-engine/CasesWorkspace.tsx`
- `pages/execution/B2SConfigPage.tsx`
- `pages/execution/B2STaskDetailPage.tsx`
- `pages/execution/BinarySecurityConfigPage.tsx`
- `pages/execution/BinarySecurityMetricsDashboardPage.tsx`
- `pages/execution/BinarySecurityTaskDetailPage.tsx`
- `pages/execution/BinaryEvolutionShared.tsx`
- `pages/execution/DataflowVulnScannerPage.tsx`
- `pages/execution/StaticPipelineFlow.tsx`
- `pages/execution/ToolOverviewPage.tsx`
- `pages/execution/WarningListPanel.tsx`
- `pages/execution/VulnVerifyTaskPage.tsx`
- ... 以及另外约 44 个文件

**统一方案：** 废弃 LK 对象，改用 CSS 变量实时读取工具：

```ts
// utils/themeTokens.ts — 从 CSS 变量实时读取
export const tk = {
  primary:       'var(--brand-primary)',
  surface:       'var(--bg-surface)',
  elevated:      'var(--bg-elevated)',
  border:        'var(--border-default)',
  ink:           'var(--text-primary)',
  inkSoft:       'var(--text-secondary)',
  muted:         'var(--text-muted)',
  success:       'var(--success)',
  warning:       'var(--warning)',
  error:         'var(--danger)',
  info:          'var(--info)',
  successSoft:   'var(--success-soft)',
  warningSoft:   'var(--warning-soft)',
  errorSoft:     'var(--danger-soft)',
  infoSoft:      'var(--info-soft)',
};
```

inline style 改写为 `style={{ backgroundColor: tk.surface, color: tk.ink }}`。

---

### C-2: 61+ 处 `color: '#ffffff'` 硬编码白色文字

> 影响文件：Header.tsx, DashboardPage.tsx, ProjectMgmtPage.tsx, 所有 vuln/execution 页面

切换暖色主题后，白色文字在浅色背景上完全不可见。

分布统计：

| 文件类别 | 出现次数 |
|---|:---:|
| Header.tsx | 2 |
| DashboardPage.tsx | 1 |
| AtomicCapabilityOverviewPage.tsx | 2 |
| B2S/BinarySecurity Config 页面 | 2 |
| ProjectMgmtPage.tsx | 4 |
| Vuln 页面 (Overview/Engine/Intake/AutoVerify) | 5 |
| Task 页面 (KnowledgeGraph/WebEndToEnd/CreateTask/TaskCenter) | 7 |
| vuln-engine 子页面 (CasesWorkspace/WorkspaceViews) | 10+ |
| ReviewJudgment 页面 | 3 |
| Firmware 页面 | 6 |
| DataflowVulnScannerPage.tsx | 1 |
| Reports/SystemAnalysis/Tool 页面 | 7+ |
| VulnParameterConfigPage.tsx | 2 |
| BinarySecurityMetricsDashboardPage.tsx | 4 |

**统一方案：** 全部替换为 `color: 'var(--text-inverse)'` 或使用 Tailwind `text-theme-text-inverse`。

---

### C-3: 按钮主色 7 种不同值，无统一主色

| 实际使用的"主色" | hex 值 | 文件数 |
|---|---|:---:|
| `bg-blue-600` | #2563eb | 20+ |
| `bg-sky-600` | #0284c7 | 5+ |
| `bg-slate-900` | #0f172a | 8+ |
| `bg-brand-primary` (CSS var) | 动态 | 3 |
| `bg-violet-600` | #7c3aed | DialogService prompt |
| `bg-indigo-600` | #4f46e5 | RoleMgmtPage |
| `bg-emerald-600` | #059669 | AgentDetailPage |

**统一方案：** 所有 primary 按钮统一使用 `bg-brand-primary`（已定义为 CSS 变量），hover 用 `hover:bg-brand-primary-hover`。tailwind.config.js 中已定义 `brand.primary` 和 `brand.hover`，只需替换 className。

---

### C-4: 表单输入 9 种不同样式范式

当前存在的样式范式：

1. `theme-form-input` / `theme-login-input` CSS 类（仅 3+2 次使用）
2. Tailwind `rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm`（compact）
3. Tailwind `rounded-xl ... px-4 py-3 text-sm`（standard）
4. Tailwind `rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3`（larger）
5. Tailwind `rounded-[2rem] ... py-5 font-medium`（search/prominent）
6. Tailwind `rounded-[2.5rem] ... py-5 font-medium`（large search）
7. Inline JS `style={FORM_INPUT_STYLE}`（DataflowVulnScannerPage，使用 `borderRadius: 12px`）
8. Inline JS `style={{ backgroundColor: LK.surfaceRaised }}`（vuln-engine 页面）
9. 传统 CSS `.btn` 类（DataflowFileserverRunDashboardPage，完全脱离 Tailwind）

**统一方案：** 建立 3 级表单组件系统：

| 级别 | border-radius | padding | 用途 |
|---|---|---|---|
| compact | `rounded-xl` (12px) | `px-3 py-2` | 下拉框、小输入 |
| standard | `rounded-xl` (12px) | `px-4 py-3` | 常规表单输入 |
| prominent | `rounded-2xl` (16px) | `px-5 py-4` | 搜索框、登录输入 |

所有表单组件统一使用 `bg-theme-surface border-theme-border text-theme-text-primary focus:border-brand-primary focus:ring-brand-soft`。

---

## 中等问题 (MODERATE)

### M-1: 弹窗 13 种 border-radius + 9 种 backdrop 组合

当前状况：

- radius 从 `rounded-xl`(12px) 到 `rounded-[3.5rem]`(56px)，共 13 种值
- backdrop 从 `bg-slate-900/60 blur-md` 到 `bg-slate-950/80 blur-xl`
- max-h 从 85vh 到 92vh

**统一方案：**

| 弹窗级别 | width | radius | max-height |
|---|---|---|---|
| small（确认） | max-w-md | rounded-[2rem] | max-h-[85vh] |
| medium（表单） | max-w-2xl | rounded-[2rem] | max-h-[88vh] |
| large（详情） | max-w-4xl | rounded-[2rem] | max-h-[88vh] |
| fullscreen-picker | max-w-5xl | rounded-[2rem] | max-h-[90vh] |

backdrop 统一：`bg-slate-950/60 backdrop-blur-md`（已通过 CSS override 映射到主题变量）。

---

### M-2: 表格 header 无统一规范

thead 样式至少出现 8 种组合：

| 维度 | 变体数 | 示例 |
|---|:---:|---|
| 背景色 | 5+ | `bg-slate-50` / `bg-slate-100/50` / `bg-theme-elevated` / `LK.surfaceRaised`(inline) / 无背景 |
| 字号 | 3 | `text-[10px]` / `text-[11px]` / `text-xs` |
| font-weight | 4 | `font-black` / `font-bold` / `font-semibold` / `font-medium` |
| tracking | 7 | `0.08em` ~ `0.24em` + `tracking-widest` |
| 文字色 | 4+ | `text-slate-400` / `text-slate-500` / `text-theme-text-faint` / `LK.muted`(inline) |
| 边框 | 3 | `border-slate-100` / `border-slate-200` / `border-theme-border` |

单元格 padding 也极不统一：从 `px-3 py-2` 到 `px-8 py-6`。

**统一方案：** 抽出 `<TableHeader>` 组件或统一 className：

```
thead: bg-theme-elevated border-b border-theme-border
th:   text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint px-4 py-3
td:   px-4 py-3 text-sm
```

---

### M-3: 按钮规格不统一

| 维度 | 变体数 | 具体值 |
|---|:---:|---|
| border-radius | 6 | rounded-lg / xl / 2xl / [2rem] / [1.5rem] / [1.8rem] |
| padding | 7 | px-3/py-2 / px-4/py-2 / px-4/py-2.5 / px-5/py-3 / px-8/py-4 / py-5(全宽) / px-10/py-4 |
| font-weight | 3 | font-black / font-bold / font-semibold |
| disabled opacity | 4 | 30% / 40% / 50% / 60% |
| font-size | 3 | text-xs / text-sm / 无显式 |

**统一方案：** 建立 4 级按钮系统：

| 级别 | radius | padding | font | disabled |
|---|---|---|---|---|
| sm | rounded-xl | px-3 py-1.5 | text-xs font-bold | opacity-50 |
| md | rounded-xl | px-4 py-2.5 | text-sm font-bold | opacity-50 |
| lg | rounded-2xl | px-6 py-3 | text-sm font-black | opacity-50 |
| hero | rounded-2xl | px-8 py-4 | font-black | opacity-50 |

---

### M-4: 暗黑主题 CSS override 缺口

chimera（暖色）主题缺少以下 override，导致切换后出现暗黑色块：

| 缺失项 | 影响文件数 | 问题描述 |
|---|:---:|---|
| `hover:bg-slate-600/700/800` | 20+ | hover 时显示暗黑色块 |
| `text-slate-100` | 16+ | 浅色文字在浅色背景不可见 |
| `bg-black/50` | 1 | 暗黑遮罩在暖色主题下突兀 |
| `--border-subtle` 未定义 | 4 | CSS 引用未定义变量，渲染为空 |

**统一方案：** 在 `styles.css` 的 `@layer utilities` 中补充 chimera 专属 override，参照 chimera-classic 的模式。定义 `--border-subtle` 变量。

---

## 轻微问题 (LOW)

### L-1: `.theme-login-input` 硬编码 `color: #f1f5f9`

暖色主题下浅色文字在浅色背景上不可见。应改为 `color: var(--text-primary)`。

文件位置：`styles.css:210`

---

### L-2: `.theme-shell-active` 硬编码 `color: #ffffff`

应改为 `color: var(--text-inverse)`。

文件位置：`styles.css:158`

---

### L-3: DataflowFileserverRunDashboardPage.tsx 使用传统 CSS `.btn` 类

与项目全局 Tailwind 方式完全脱节，包含 `.btn`、`.btn-sm`、`.btn-danger`、`.btn-warning`、`.btn-close`、`.btn-inline-compact`、`.btn-back` 等自定义 CSS 类，定义在 inline `<style>` 标签中（line 369-438）。应重构为 Tailwind className。

---

### L-4: 字体大小体系过于碎片化

自定义字号 `text-[8px]`(54次)、`text-[9px]`(169次)、`text-[10px]`(1,125次)、`text-[11px]`(1,212次) 与标准 `text-xs`(12px)、`text-sm`(14px) 之间无明确层级映射，还有零散的 `text-[12px]`(21次)、`text-[13px]`(4次)、`text-[15px]`(2次) 等值。

**统一方案：** 将自定义字号映射到语义 token，在 tailwind.config.js 中扩展：

| 语义 token | 当前值 | 建议 |
|---|---|---|
| `fontSize.caption` | text-[9px] / text-[10px] | 统一为 `10px` |
| `fontSize.label` | text-[11px] | 统一为 `11px` |
| `text-xs` | 12px | 保持标准 |
| `text-sm` | 14px | 保持标准 |
| `text-base` | 16px | 保持标准 |
| `text-lg` | 18px | 保持标准 |

---

### L-5: border-radius 体系过于庞大

16 种自定义 + 7 种标准 = 23 种 radius 值。大量近似值共存：
- `rounded-[1.2rem]`(7), `rounded-[1.25rem]`(20), `rounded-[1.35rem]`(19, timeline)
- `rounded-[1.5rem]`(99, detail), `rounded-[1.6rem]`(19, panel)
- `rounded-[1.75rem]`(32), `rounded-[1.8rem]`(18), `rounded-[2rem]`(241)
- `rounded-[2.25rem]`(2, section), `rounded-[2.5rem]`(75), `rounded-[3rem]`(66)
- `rounded-[3.5rem]`(2), `rounded-[2.75rem]`(1)

**统一方案：** 收敛为 5 级语义，使用 tailwind.config.js 中已定义的语义 token：

| 语义 token | 当前混乱值 | 统一值 | 用途 |
|---|---|---|---|
| radius-sm | rounded-lg | `rounded-lg` (8px) | 小型元素、紧凑按钮 |
| radius-md | rounded-xl / [1rem~1.5rem] | `rounded-xl` (12px) | 标准输入、按钮 |
| radius-lg | rounded-2xl / [1.6rem~2.5rem] | `rounded-2xl` (16px) | 卡片、面板 |
| radius-xl | rounded-[2rem] / [3rem] | `rounded-panel` (1.6rem) 或 `rounded-[2rem]` (32px) | 弹窗、大面积容器 |
| radius-full | rounded-full | `rounded-full` | 圆形元素 |

---

## 总体统一方案总结

| 维度 | 当前状态 | 目标状态 |
|---|---|---|
| **颜色** | 120 hex + 128 rgba 硬编码，70 个 LK 文件 | 全部通过 CSS 变量 + tailwind theme token |
| **字体** | 13 自定义 + 10 标准 = 23 种 | 收敛为 6 语义层级（caption / label / xs / sm / base / lg） |
| **间距** | 85 种 padding + 43 种 margin | 保持 Tailwind 标准 4px 基准，消除负值/自定义值 |
| **border-radius** | 23 种 | 收敛为 5 级语义（sm / md / lg / xl / full） |
| **按钮** | 7 色 / 6 radius / 7 padding / 4 disabled | 4 级统一规格（sm / md / lg / hero） |
| **表单** | 9 范式 | 3 级统一规格 + theme token |
| **表格** | 8+ thead 样式 | 组件化统一，theme token |
| **弹窗** | 13 radius / 9 backdrop | 4 级统一规格，统一 backdrop |
| **暗黑主题** | LK 对象阻断 + 61 处硬编码白色 + CSS override 缺口 | 全面 CSS 变量化 + 补齐 override |

---

## 推荐实施顺序

1. **Phase 1 — 基础设施**：建立 `utils/themeTokens.ts`（tk 对象），补齐 `styles.css` CSS 变量和 override 缺口
2. **Phase 2 — 核心迁移**：逐批替换 70 个文件的 LK → tk，替换 61 处 `#ffffff` → `var(--text-inverse)`
3. **Phase 3 — 规范收敛**：统一按钮 4 级规格，统一表单 3 级规格，统一弹窗 4 级规格
4. **Phase 4 — 精细优化**：收敛 font-size 到 6 语义层级，收敛 border-radius 到 5 级语义，重构 DataflowFileserverRunDashboardPage.tsx 的传统 CSS

---

## 附录：高频 LK 硬编码色值与 CSS 变量对照表

| LK 键 | 硬编码值 | 应替换的 CSS 变量 | chimera-classic 值 | chimera 值 |
|---|---|---|---|---|
| `primary` | `#4f73ff` | `var(--brand-primary)` | #4f73ff | #b7791f |
| `primarySoft` | `#7590ff` | `var(--brand-primary-hover)` | #7590ff | #c68a2a |
| `primaryDeep` | `#3f63f1` | `var(--brand-secondary)` | #3f63f1 | #d97706 |
| `primaryMuted` | `rgba(79,115,255,0.14)` | `var(--brand-soft)` | rgba(79,115,255,0.14) | rgba(183,121,31,0.12) |
| `canvas` | `#070d18` | `var(--bg-app)` | #070d18 | #f7f3ea |
| `surface` | `#111a2b` | `var(--bg-surface)` | #111a2b | #fffdf8 |
| `surfaceRaised` | `#18233a` | `var(--bg-elevated)` | #18233a | #f2eadb |
| `surfaceGlass` | `rgba(17,26,43,0.84)` | `var(--bg-login-card)` | rgba(17,26,43,0.84) | rgba(255,252,246,0.92) |
| `border` | `#26324a` | `var(--border-default)` | #26324a | rgba(134,104,58,0.16) |
| `borderSoft` | `#1b2438` | — (需新增 `--border-subtle`) | #1b2438 | rgba(134,104,58,0.08) |
| `ink` | `#f5f7ff` | `var(--text-primary)` | #f5f7ff | #2f2418 |
| `inkSoft` | `#d6def0` | `var(--text-secondary)` | #d6def0 | #5b4a38 |
| `body` | `#a4aec4` | `var(--text-muted)` | #a4aec4 | #7f6b56 |
| `muted` | `#72809a` | `var(--text-faint)` | #72809a | #a18c73 |
| `mutedSoft` | `#8b95a8` | — (需新增 `--text-muted-soft`) | #8b95a8 | 需定义 |
| `success` | `#45c06f` | `var(--success)` | #45c06f | #2f855a |
| `warning` | `#d5a13a` | `var(--warning)` | #d5a13a | #b7791f |
| `error` | `#f15d5d` | `var(--danger)` | #f15d5d | #c05621 |
| `info` | `#4f8cff` | `var(--info)` | #4f8cff | #9c6b2f |
| `successMuted` | `rgba(69,192,111,0.14)` | `var(--success-soft)` | rgba(69,192,111,0.14) | rgba(46,139,87,0.12) |
| `warningMuted` | `rgba(213,161,58,0.14)` | `var(--warning-soft)` | rgba(213,161,58,0.14) | rgba(217,119,6,0.12) |
| `errorMuted` | `rgba(241,93,93,0.14)` | `var(--danger-soft)` | rgba(241,93,93,0.14) | rgba(194,65,12,0.12) |
| `infoMuted` | `rgba(79,140,255,0.14)` | `var(--info-soft)` | rgba(79,140,255,0.14) | rgba(156,107,47,0.12) |

> 注：`borderSoft` / `mutedSoft` 对应的 CSS 变量目前未定义，需在两个主题的 `:root` 中新增 `--border-subtle` 和 `--text-muted-soft`。
