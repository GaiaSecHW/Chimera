# Chimera 组件分析报告（Design System 视角）

> 生成日期：2026-06-18 · 范围：`pages/ components/ layout/ theme/ styles.css tailwind.config.js`
> 基准规范：`DESIGN.md`（目标态设计系统）
> 说明：本报告仅做分析，不修改任何代码。

---

## 摘要

| 指标 | 数值 |
|---|---|
| 业务页面 / 组件 `.tsx` 文件 | 193 |
| `styles.css` 已定义组件类 | ~20（按钮/输入/表格/卡片/弹窗等） |
| DESIGN.md §14 规定的"应用级组件"已落地为代码 | **0 / 6**（仅有一个语义不一致的 `EmptyState`） |
| 内联重复的页头（`text-2xl/3xl` 标题块） | **106 个文件** |
| 内联重复的指标卡（`text-3xl`） | **62 个文件** |
| 内联重复的弹窗外壳（`fixed inset-0 z-[`） | **55 个文件** |
| 原生 `<table>` 自绘表格 | **64 个文件**（仅 12 个文件复用 `ExecutionTable`） |
| `font-black` 出现次数（§2.3 `[需收敛]`） | **3102 次** |
| 卡片误用 `bg-theme-app` 底色（§11.2 铁律违反） | **102 个文件** |

**核心结论**：Chimera 拥有完整、成熟的 **Design Token 基座**（CSS 变量 + `tailwind.config.js` 语义色 + `@layer components` 基础类），但缺失 **应用级组件层**。DESIGN.md §14 明确规定的 6 个页面级组件（PageHeader / StatisticCard / Toolbar / DataTable / EmptyState / PageSection）几乎全部以**内联 + 各页面私有重复定义**的方式散落，导致大规模重复与规范漂移。

---

## 1. 现有可复用组件清单

### 1.1 基座层 · CSS 组件类（`styles.css` `@layer components`）— 已可复用，质量良好

| 类 | 职责 | 与 DESIGN.md 一致性 |
|---|---|---|
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-icon` / `.btn-danger-soft` | 按钮体系（§6） | ✅ 符合（`rounded-lg`、`px-3.5 py-2.5`、`font-medium`） |
| `.form-input` / `.form-select` / `.form-label` | 表单控件（§7/§8） | ✅ 符合（`rounded-lg`、`--bg-elevated`、2px focus ring） |
| `.table-container` | 表格容器（§9） | ⚠️ 用 `rounded-2xl`，规范目标为 `rounded-xl` |
| `.metric-card` | 指标卡（§11.3） | ✅ 符合 |
| `.modal-overlay` / `.modal-container` / `.modal-md` / `.modal-xl` | 弹窗（§11.4） | ✅ 符合 |
| `.bg-theme-*` / `.text-theme-*` / `.border-theme-*` | Token 工具类 | ✅ 主题驱动核心 |
| `.theme-shell-active` / `.theme-shell-muted` / `.theme-brand-chip` | 侧栏壳层态 | ⚠️ `theme-shell-active` 带蓝色 glow（§5 `[需收敛]`） |

### 1.2 React 组件层 · 真正可复用且应保留

| 组件 | 路径 | 用途 | 当前复用度 |
|---|---|---|---|
| `StatusBadge` | `components/StatusBadge.tsx` | 通用状态徽章（§10.2） | **30 文件**（最佳实践范例） |
| `ExecutionTable*` 系列 | `components/execution/ExecutionTable.tsx` | 表格容器/表头/单元格/空行（§9） | 12 文件 |
| `useUiFeedback`（notify/confirm/prompt + `feedbackNodes`） | `components/UiFeedback.tsx` | 全局通知/确认/输入弹窗 | 44 文件 |
| `DialogService` | `components/DialogService.tsx` | 命令式对话框服务 | 全局 |
| `GlobalUploadWidget` + `services/uploadCenter` | `components/upload-center/` | 全局上传中心 | 全局 |
| `XTerminal` | `components/XTerminal.tsx` | xterm 终端封装 | 终端类页面 |
| `ComposeViewer` | `components/ComposeViewer.tsx` | compose/yaml 查看器 | 环境类页面 |
| `ThemeLogo` | `components/ThemeLogo.tsx` | 主题感知 Logo | Header |
| `ThemeProvider` / `themes.ts` | `theme/` | 主题切换（`data-theme` + localStorage） | 全局 |
| `Header` / `Sidebar` | `layout/` | 全局框架（§12） | 全局 |
| `HealthBadge` / `AgentStateBadges` / `JsonBlock` | `components/environment/shared.tsx` | 环境域共享 UI | 环境域 |
| `TemplateLlmBindingEditor` | `components/environment/TemplateLlmBindingEditor.tsx` | LLM 绑定编辑器 | 编排/环境域 |
| `StatCard`（已导出版） | `pages/execution/BinaryEvolutionShared.tsx` | 指标卡 | 二进制域 |
| `B2SStatusBadge` / `B2SPhaseBadge` | `pages/execution/b2sPresentation.tsx` | B2S 状态徽章 | B2S 域 |
| `SectionCard`（已导出版） | `pages/execution/b2s-observability/B2SCommonCards.tsx` | 区块卡片 | B2S 观测域 |
| `StatCards` | `pages/vuln/vuln-engine/shared.tsx` | 漏洞引擎指标行 | 漏洞引擎域 |

> 说明：1.2 中"域内 shared"组件（如 `BinaryEvolutionShared`、`b2sPresentation`、`vuln-engine/shared`）是局部良性复用，但语义与下方"重复组件"高度重叠，应作为收编进 Design System 的优先候选。

---

## 2. 重复组件清单

同一语义的组件在多个页面被**各自私有重新实现**，签名/样式互不一致。这是当前最大的技术债。

### 2.1 指标卡 / StatCard / MetricCard / SummaryCard / KpiCard —— **≥22 处私有实现**

| 名称 | 代表位置（部分） |
|---|---|
| `StatCard` ×6 | `AppScanMonitorPage`、`EnvAiAgentOverviewPage`、`EnvManagementPage:335`、`B2SStatsHeader:76`、`BinaryEvolutionShared:93`、`FirmwareEvolutionCenterPage:286` |
| `MetricCard` ×10 | `BinarySecurityMetricsDashboardPage:2429`、`DataflowAnalysisTaskDetailPage:443`、`DataflowVulnScannerPage:588`、`DataflowVulnScanTaskDetailPage:372`、`EntryAnalysisTaskDetailPage:1538`、`MobileSecurityIpcVulnPage:1790`、`SystemAnalysisTaskDetailPage:382`、`AiGatewayDashboardPage:23`、`AiGatewayTokenStatsPage:28`、`VulnCaseDetailLayout:76`、`AigwLogDetailsDialog:440` |
| `SummaryCard` ×3 | `VulnVerifyTaskPage:146`、`DepartmentMemberPage:965`、`UserMgmtPage:756` |
| `KpiCard` ×1 / `StatCards` ×1 / `StageMetricPill` ×1 | `DashboardPage:123`、`vuln-engine/shared:308`、`BinarySecurityOverviewPage:282` |

→ 全部应被 §14.2 `StatisticCard` 一个组件替代。

### 2.2 区块卡片 SectionCard / PanelCard / CardShell / Section —— **≥13 处私有实现**

`SectionCard` 在 `DataflowAnalysisConfigPage`、`DataflowVulnScanConfigPage`、`EntryAnalysisConfigPage`、`BinarySecurityConfigPage`、`SystemAnalysisConfigPage`、`FirmwareUnpackConfigPage`、`EntryAnalysisModelsPage`、`SystemAnalysisModelsPage`、`B2SConfigPage`、`AppScanMonitorPage`、`b2s-observability/*` 等处反复定义，签名近乎一致（`title/subtitle/actions/children`）。
→ 应被 §14.6 `PageSection` 替代。

### 2.3 配置页字段行 FieldRow / Field / FormRow —— **≥7 处私有实现**

`FieldRow` 在 6 个 Config 页面 + `EntryAnalysisModelsPage` 重复；`DataflowVulnScannerPage` 另有 `Field`。签名一致（`label/hint/children`）。
→ 应抽为 Design System 表单原语 `FormField`。

### 2.4 配置页保存栏 PanelActions —— **8 处私有实现**

`PanelActions`（`saving/onSave/onReset`）在 8 个 Config 页面逐字重复。
→ 应抽为 `FormActionBar`。

### 2.5 空状态 EmptyState / Placeholder —— **签名分裂的重复**

| 实现 | 签名 |
|---|---|
| `components/environment/shared.tsx:46` | `{ text }` |
| `pages/execution/TaskConfigPanels.tsx:106` | `{ text }` |
| `pages/task/WebEndToEndPage.tsx:460` | `{ icon, title, description }` |
| `pages/DashboardPage.tsx:190` `Placeholder` | `{ text }` |
| 另有 **96 个文件**内联"暂无/无数据"文案 |

→ 应统一为 §14.5 `EmptyState`（`icon/title/description/action`）。

### 2.6 状态徽章 Badge —— 已有 `StatusBadge` 仍被绕过重写

`DataflowVulnScannerPage:563`、`VulnVerifyTaskPage:167` 各自重定义本地 `StatusBadge`；`FirmwareUnpackerPage` 有 `TaskStatusBadge`/`PhaseStatusBadge`；`environment/shared` 有 `HealthBadge`；`VulnVerifyReportView` 有 `VerdictBadge`/`DimensionBadge`。
→ 应收敛到统一 `Badge`/`StatusBadge`（带 tone 映射表）。

### 2.7 页头 PageHeader —— **106 文件内联**，零组件化

标题 + 副标题 + 右侧操作 + 底部分隔线的结构在 106 个文件中手写。→ §14.1 `PageHeader` 完全缺失。

### 2.8 弹窗外壳 Modal —— **55 文件内联** `fixed inset-0 z-[...]`

虽有 `.modal-overlay`/`.modal-container` CSS 类，但 55 个文件仍手写遮罩层（z-index、blur、容器圆角各异，部分用 `rounded-3xl` 违规）。→ 缺失 `Modal` React 封装。

### 2.9 文件备份/导出别名（非重复，仅记录）

`pages/environment/llm-binding/TemplateLlmBindingEditor.tsx` 是对 `components/environment/TemplateLlmBindingEditor.tsx` 的 **re-export**（4 行），属良性别名，非真实重复。

---

## 3. 可以纳入 Design System 的组件

按"先补齐 DESIGN.md §14 规定项 → 再收编高频域内组件"的优先级排列。

### 3.1 P0 · DESIGN.md §14 已规定但代码缺失（必须新建）

| 组件 | 规范出处 | 替代的重复项 |
|---|---|---|
| `PageHeader` | §14.1 | 2.7（106 文件） |
| `StatisticCard` | §14.2 | 2.1（≥22 处） |
| `Toolbar`（Search + Filters + Actions） | §14.3 | 43 文件内联搜索 + 39 文件内联分页 |
| `DataTable`（Loading/Empty/Pagination/Bulk） | §14.4 | 2.8 表格（64 文件原生 table） |
| `EmptyState` | §14.5 | 2.5（4 私有 + 96 内联） |
| `PageSection` | §14.6 | 2.2（≥13 处） |

### 3.2 P1 · 已存在、质量达标，直接迁入 DS 作为正式 API

- `StatusBadge` → 升级为带 tone 映射的统一 `Badge`/`StatusBadge`
- `ExecutionTable*` → 作为 `DataTable` 的底层 primitive
- `useUiFeedback` / `DialogService` → DS 反馈层（Notice / Confirm / Prompt）
- `Modal`（从 `.modal-*` CSS 类封装出 React 组件）

### 3.3 P1 · 高频域内组件，提炼为通用原语后纳入

- `FormField`（合并 2.3 的 7 处 `FieldRow`/`Field`）
- `FormActionBar`（合并 2.4 的 8 处 `PanelActions`）
- `Button`（把 `.btn-*` CSS 类封装为受控 React 组件，统一 variant/size/icon/loading）
- `JsonBlock`（已存在于 environment/shared，提升为通用）

### 3.4 P2 · 候选（需评估是否通用）

- `Tabs` / 分段控件（26 文件内联 `activeTab`）
- `SearchInput`、`Pagination`（作为 `Toolbar`/`DataTable` 的子件单独导出）
- `MetricTrend`（指标卡趋势数字，§11.3）

---

## 4. 不符合 DESIGN.md 的组件

对照 DESIGN.md 的 `[需收敛]` 演进清单（附录 C）与铁律，存在以下规范偏差：

### 4.1 字重违规 —— `font-black` (900)（§2.3）

- 全库 **3102 次** `font-black`，规范目标为 `font-semibold`/`font-bold`。
- 典型违规组件：`UiFeedback.tsx`（通知标题/确认弹窗均 `font-black`）、`environment/shared.tsx` 的 `HealthBadge`/`AgentStateBadges`（`font-black`）、`ExecutionTable` 表头（`font-black`）、几乎全部私有 `SectionCard`/`StatCard`。

### 4.2 卡片层级铁律违规 —— 卡片用 `bg-theme-app`（§11.2）

- **102 个文件**使用 `bg-theme-app` / `bg-theme-bg-app`，其中多处用作卡片/区块底色。
- 确证案例：`DataflowAnalysisConfigPage:70` 的 `SectionCard` 用 `bg-theme-bg-app`（应为 `--bg-surface`）→ 与底色同层"发黑塌陷"。

### 4.3 圆角超标 —— `rounded-3xl` / 历史大圆角（§4）

- **31 个文件**使用 `rounded-2xl/3xl`；`UiFeedback.tsx` 的确认/输入弹窗用 `rounded-3xl`（规范弹窗为 `rounded-2xl`=16px）。
- `.table-container` 用 `rounded-2xl`，规范目标 `rounded-xl`。

### 4.4 蓝色 glow 阴影违规（§5 / 附录 C-2）

- `styles.css` `.theme-shell-active`、`.theme-primary-button` 仍带 `box-shadow: 0 2px 12px rgba(59,130,246,…)` 外发光。
- `tailwind.config.js` 保留 `shadow-brand`（= `--shadow-brand` glow）。
- 规范要求：移除 glow，主按钮靠品牌底色 + focus ring。

### 4.5 `.theme-primary-button` 自身违反多条

- 同时命中 `font-black`（§2.3）+ `rounded-xl` 按钮（§6 应 `rounded-lg`）+ glow（§5）。规范已标注用 `.btn-primary` 取代。

### 4.6 徽章配方不统一（§10）

- `HealthBadge`/`AgentStateBadges` 用 `text-[11px] font-black tracking-[0.16em]`，与 §10.1 标准配方（`text-[10px]/xs font-medium`）不一致。
- 多处私有 `StatusBadge` 绕过统一组件，颜色映射各自维护。

### 4.7 反馈层绕过统一组件

- 35 个文件仍用 `window.confirm`/`alert`，未走 `useUiFeedback.confirm`（暗色规范弹窗）。

---

## 5. 推荐的 Design System 目录结构

在保留现有 Token 基座（`styles.css` + `tailwind.config.js` + `theme/`）不动的前提下，新增 `design-system/`（或 `ds/`）目录，分三层：**Foundations → Primitives → Application**，与 DESIGN.md 的章节结构对齐。

```
design-system/
├── index.ts                      # 统一出口，业务页面只从这里 import
├── README.md                     # 用法 + 与 DESIGN.md 章节映射
│
├── foundations/                  # 设计变量的 TS 镜像（只读，引用 CSS 变量）
│   ├── tokens.ts                 # color/spacing/radius/shadow token 常量
│   ├── typography.ts             # 字号/字重阶梯（§2）
│   └── index.ts
│
├── primitives/                   # 基础组件（对应 DESIGN.md §6–§11）
│   ├── Button/                   # 封装 .btn-* → variant/size/icon/loading（§6）
│   ├── Input/                    # 封装 .form-input（§7）
│   ├── Select/                   # 封装 .form-select（§8）
│   ├── FormField/                # 合并 7 处 FieldRow（§7.2）
│   ├── Badge/                    # 收编 StatusBadge/HealthBadge/...（§10）
│   ├── Card/                     # 卡片基类，强制 --bg-surface（§11）
│   ├── Modal/                    # 封装 .modal-*（§11.4）
│   ├── Spinner/  Skeleton/       # 加载态（122 文件内联 animate-spin）
│   ├── JsonBlock/                # 从 environment/shared 提升
│   └── index.ts
│
├── application/                  # 页面级组件（对应 DESIGN.md §14，P0 必建）
│   ├── PageHeader/               # §14.1
│   ├── StatisticCard/            # §14.2（收编 ≥22 处 StatCard/MetricCard）
│   ├── Toolbar/                  # §14.3（SearchInput + Filters + Actions）
│   │   ├── SearchInput.tsx
│   │   └── index.tsx
│   ├── DataTable/                # §14.4（底层用 ExecutionTable + Pagination）
│   │   ├── Pagination.tsx
│   │   └── index.tsx
│   ├── EmptyState/               # §14.5（统一 4 私有 + 96 内联）
│   ├── PageSection/              # §14.6（收编 ≥13 处 SectionCard）
│   ├── FormActionBar/            # 收编 8 处 PanelActions
│   └── index.ts
│
├── feedback/                     # 全局反馈层
│   ├── useUiFeedback.ts          # 迁移自 components/UiFeedback.tsx
│   ├── DialogService.tsx         # 迁移自 components/
│   └── index.ts
│
├── patterns/                     # 页面骨架模板（对应 DESIGN.md §13.2 / §14.7-8）
│   ├── StandardListPage.tsx      # PageHeader→StatisticCard→Toolbar→DataTable
│   ├── StandardDetailPage.tsx    # PageHeader→PageSection→Timeline/Logs
│   └── index.ts
│
└── theme/                        # （保持现状，或软链至现有 theme/）
    ├── ThemeProvider.tsx
    └── themes.ts
```

### 5.1 落地约定

- **业务页面只允许 `import { ... } from '@/design-system'`**，禁止页面内私有定义 `SectionCard`/`StatCard`/`PageHeader` 等（可加 ESLint 规则）。
- **域内 shared 组件**（`b2sPresentation`、`vuln-engine/shared`、`BinaryEvolutionShared`）保留，但其中通用部分上移到 `design-system/`，域内只留业务特化。
- **现有 CSS 基座不动**：`design-system/primitives/*` 只是把 `.btn-*` / `.form-*` / `.modal-*` 等类封装成受控 React 组件，单一数据源仍是 `styles.css` 变量。
- 迁移顺序建议：先建 `application/` 6 个 P0 组件（消除最大重复面）→ 再 `primitives/Button|Badge|Modal` → 最后批量替换内联实现并清理 `font-black`/glow/层级违规。

### 5.2 与 DESIGN.md 章节映射（便于校对）

| DS 目录 | DESIGN.md 章节 |
|---|---|
| `foundations/` | §1–§5（Color/Type/Spacing/Radius/Shadow） |
| `primitives/Button` | §6 |
| `primitives/Input` `Select` `FormField` | §7 §8 |
| `primitives/Card` `Modal` | §11 |
| `primitives/Badge` | §10 |
| `application/DataTable` | §9 §14.4 |
| `application/PageHeader/StatisticCard/Toolbar/EmptyState/PageSection` | §14.1–14.6 |
| `patterns/` | §13.2 §14.7 §14.8 |

---

## 附：方法学与口径

- 文件计数基于 `grep -rl` 去重统计，正则匹配类名/标题模式，存在 ±少量误差（如多页头同文件只计 1 次）。
- "重复"判定标准：≥2 个文件各自定义**语义等价**的本地组件（相同 props 意图）。
- 规范符合性以 DESIGN.md 的"目标态 + `[需收敛]`清单"为准；`[需收敛]`项属已知技术债，本报告予以量化而非新发现。
