# Chimera Design System

> 企业级 AI 安全研发平台设计规范

---

## 0. 设计定位与原则

### 0.1 产品定位

Chimera 是面向企业的一体化安全平台，融合四重定位：

- **AI 安全平台** — AI 驱动的安全分析与决策
- **漏洞运营平台** — 漏洞的接入、分析、验证、运营全流程
- **Agent 平台** — 智能体编排、会话、任务调度
- **企业级研发安全平台** — 贯穿研发流程的安全能力

### 0.2 目标用户

| 用户 | 核心诉求 | 设计影响 |
|---|---|---|
| 安全工程师 | 快速研判、批量操作、深度数据 | 高信息密度、强表格、键盘友好 |
| 渗透测试工程师 | 任务编排、终端/日志、结果回溯 | 终端风格区、时间线、状态可视 |
| 开发人员 | 配置即代码、清晰反馈 | 表单规范、代码块、明确状态 |
| 项目经理 | 概览、进度、指标 | 指标卡、看板、趋势图 |

### 0.3 设计目标

**保留**：深色主题 · 企业级专业感 · 高信息密度 · 数据驱动界面

**避免**：腾讯云/阿里云控制台风格 · 传统后台管理系统风格 · 过重边框 · 过度发光 · 过度渐变

### 0.4 参考风格

- **Primary**：Linear（克制、近黑蓝底、1px 弱边框、极小圆角、几乎无阴影、靠层级而非装饰）、Supabase Studio（扁平、紧凑、数据优先）
- **Secondary**：LangSmith、OpenAI Platform（AI 平台的现代留白与中性灰阶）

### 0.5 六条视觉原则

1. **深色专业风格** — 蓝调近黑底色，长时间使用不刺眼，呈现专业感
2. **卡片弱边框** — 1px 低对比边框 + 背景层级区分，而非粗边框/重阴影
3. **高信息密度** — 紧凑间距、小号正文、表格优先，单屏承载更多信息
4. **AI 平台现代感** — 留白克制但有呼吸，靠排版与层级而非渐变发光
5. **统一间距系统** — 4px 基准网格，全站一致
6. **统一组件规范** — Token 驱动，组件行为/尺寸/状态可预测

### 0.6 实现机制

全站样式由 CSS 变量驱动，集中在 `styles.css` 的 `:root[data-theme='chimera-classic']`，组件通过 `theme-*` 工具类（见 `@layer components`）与 `tailwind.config.js` 的语义色引用变量。**改主题只改变量，不改组件。**

> ⚠️ 演进标注：本规范为目标态。现有代码中部分按钮使用 `font-black` 与蓝色 glow 阴影、卡片使用 12–16px 圆角，与 Linear/Supabase 的克制原则有偏差，标注为 `[需收敛]`，逐步对齐。

---

## 1. Color System

### 1.1 设计基调

近黑的**蓝调深色**（navy）为底，**indigo (#2563EB)** 为品牌强调色。背景靠 4 级明度层叠制造纵深，而非阴影。语义色统一走"暗底 + 高亮文字"的低饱和暗色徽章模式。

### 1.2 背景层级（Surface Hierarchy）

层级是本系统的核心——纵深由背景明度递进表达，而非边框/阴影。

| Token | 变量 | 值 | 用途 |
|---|---|---|---|
| App | `--bg-app` | `#070d18` | 页面最底层、最暗 |
| Surface | `--bg-surface` | `#111a2b` | **卡片 / 面板 / 弹窗**（默认卡片层）|
| Elevated | `--bg-elevated` | `#18233a` | 卡片内嵌块 / 输入框 / 次级按钮 / 悬浮态 |
| Sidebar | `--bg-sidebar` | `#0d1526` | 侧栏 |
| Sidebar-muted | `--bg-sidebar-muted` | `#18233a` | 侧栏次级块 |
| Header | `--bg-header` | `#0d1526` | 顶栏 |

> 层级规则：`app < surface < elevated`。卡片放在 app 上用 surface；卡片内的内嵌区/输入框用 elevated。**禁止卡片与底色同层**（会塌陷成"发黑"一片）。

### 1.3 文本色阶

| Token | 变量 | 值 | 用途 |
|---|---|---|---|
| Primary | `--text-primary` | `#f5f7ff` | 标题、关键数值 |
| Secondary | `--text-secondary` | `#d6def0` | 正文 |
| Muted | `--text-muted` | `#a4aec4` | 辅助说明、表头 |
| Faint | `--text-faint` | `#72809a` | 占位符、禁用、最弱信息 |
| Muted-soft | `--text-muted-soft` | `#8b95a8` | 表单标签 |

### 1.4 边框色

弱边框是关键原则——边框只用于分隔，不用于强调。

| Token | 变量 | 值 | 用途 |
|---|---|---|---|
| Default | `--border-default` | `#26324a` | 默认 1px 边框（卡片、输入、表格）|
| Strong | `--border-strong` | `#33415c` | 强调分隔（少用）|
| Subtle | `--border-subtle` | `#1b2438` | 极弱分隔（内部 divider）|

### 1.5 品牌色

| Token | 变量 | 值 | 用途 |
|---|---|---|---|
| Primary | `--brand-primary` | `#2563EB` | 主操作、激活态、链接、焦点环 |
| Hover | `--brand-primary-hover` | `#3B82F6` | 主色悬浮 |
| Secondary | `--brand-secondary` | `#4f46e5` | 主按钮按下/次强调 |
| Soft | `--brand-soft` | `rgba(99,102,241,0.15)` | 品牌色浅底（chip、focus ring）|
| Border | `--brand-border` | `rgba(99,102,241,0.4)` | 品牌色边框 |

### 1.6 语义色（State）

统一模式：实色用于文字/图标，`-soft`（15% 透明）用于背景，`-border`（40% 透明）用于边框。

| 语义 | 实色变量 | 值 | soft / border |
|---|---|---|---|
| Success | `--success` | `#10b981` | `--success-soft` / `--success-border` |
| Warning | `--warning` | `#f59e0b` | `--warning-soft` / `--warning-border` |
| Danger | `--danger` | `#f43f5e` | `--danger-soft` / `--danger-border` |
| Info | `--info` | `#3b82f6` | `--info-soft` / `--info-border` |

**徽章/状态配方**（暗色风格，禁用浅底深字）：
```
bg-{color}-500/15  +  text-{color}-400  +  border-{color}-500/20
```

### 1.7 强调色板（图表/分类）

用于图表、多分类标签。统一 `-400`（文字/描边）/ `-500/15`（填充）：

`cyan` · `emerald` · `amber` · `rose` · `violet` · `blue` · `sky` · `indigo`

### 1.8 禁用项

- ❌ 浅色底（`bg-white` / `bg-slate-50` 实底）—— 已全局重映射到暗色变量
- ❌ 浅底深字徽章（`bg-emerald-50 text-emerald-700`）
- ❌ 高饱和纯色大面积填充
- ❌ 多色渐变背景（仅允许品牌微光 `--gradient-brand`，≤8% 透明度）

---

## 2. Typography

### 2.1 字体族

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC',
  Arial, sans-serif;
```
系统字体优先（性能 + 原生观感），完整 CJK 回退。等宽场景（代码/日志/ID/路径）用 `font-mono`。

### 2.2 字号阶梯（信息密度优先）

| Token | size / line-height | 用途 |
|---|---|---|
| `text-[10px]` | 10 / 14 | 角标、徽章、超密标签 |
| `text-xs` | 12 / 16 | 表格、表单标签、辅助信息（**高密度主力**）|
| `text-sm` | 14 / 20 | **正文默认**、按钮、输入 |
| `text-base` | 16 / 24 | 卡片标题 |
| `text-lg` | 18 / 28 | 区块标题 |
| `text-xl` | 20 / 28 | 页面副标题 |
| `text-2xl` | 24 / 32 | 弹窗/页面主标题 |
| `text-3xl` | 30 / 36 | 大数值、Hero 标题（克制使用）|

### 2.3 字重

| 权重 | 用途 |
|---|---|
| `font-normal` (400) | 正文、表格内容 |
| `font-medium` (500) | 按钮、标签、强调正文 |
| `font-semibold` (600) | **标题、卡片标题、数值**（目标主力）|
| `font-bold` (700) | 关键指标、强调 |

> `[需收敛]` 现有大量 `font-black` (900)；目标用 `font-semibold`/`font-bold`，避免过粗带来的"后台系统"厚重感。

### 2.4 字距与排版

- 大写标签（表头、徽章、kicker）：`uppercase tracking-[0.14em~0.2em]`
- 数值/ID/路径：`font-mono`，必要时 `tabular-nums` 对齐
- 正文不加字距；标题可 `tracking-tight`

---

## 3. Spacing System

### 3.1 基准

**4px 网格**（Tailwind 默认）。所有间距取 4 的倍数。

### 3.2 间距语义阶梯

| Token | px | 用途 |
|---|---|---|
| `1` | 4 | 图标与文字、徽章内距 |
| `1.5` | 6 | 紧凑 gap |
| `2` | 8 | 控件内距、紧凑列表 |
| `2.5` | 10 | 输入/按钮纵向内距 |
| `3` | 12 | 卡片内距（紧凑）、表格单元格 |
| `4` | 16 | **标准内距 / gap（主力）** |
| `5` | 20 | 卡片内距（标准）|
| `6` | 24 | 卡片内距（宽松）、区块间距 |
| `8` | 32 | 页面分区、大留白 |

### 3.3 应用约定

| 场景 | 间距 |
|---|---|
| 页面根 padding | `px-5 py-5 md:px-6 2xl:px-8` |
| 卡片内 padding | `p-4` ~ `p-6` |
| 表格单元格 | `px-3 py-2` ~ `px-4 py-3` |
| 表单字段纵向 gap | `space-y-4` / `gap-4` |
| 按钮/输入内距 | `px-3.5 py-2.5`（sm） |
| 卡片网格 gap | `gap-3` ~ `gap-4` |

### 3.4 布局尺寸

| 项 | 值 |
|---|---|
| 侧栏展开 | `w-60` (240px) |
| 侧栏收起 | `w-24` (96px) |
| 弹窗 md / xl | 448 / 576px |
| 内容最大宽 | 按页面，宽表格全宽滚动 |

---

## 4. Radius System

向 Linear 收敛——**克制的圆角**，控件小、容器中、弹窗略大。

| Token | px | 用途 |
|---|---|---|
| `rounded-md` | 6 | 徽章、小 chip、`btn-danger-soft` |
| `rounded-lg` | 8 | **按钮、输入、select（控件主力）** |
| `rounded-xl` | 12 | **卡片、面板、指标卡（容器主力）** |
| `rounded-2xl` | 16 | 弹窗、大容器 |
| `rounded-full` | 100% | 状态点、头像、pill 徽章 |

自定义语义半径（已收敛至 12px 一档）：`panel` `card` `section` = `0.75rem`，`detail` `timeline` = `0.5rem`。

> `[需收敛]` 历史上 `card`/`section` 曾达 32–36px，已统一压到 12px。新代码直接用 `rounded-lg` / `rounded-xl`。避免 `rounded-3xl` 等过圆造成的"消费级 App"观感。

---

## 5. Shadow System

**核心理念：靠背景层级 + 1px 弱边框表达纵深，而非阴影。** 这是与腾讯云/阿里云控制台拉开差距的关键。

| Token | 值 | 用途 |
|---|---|---|
| `shadow-none` | — | **默认**：卡片、面板、表格（仅用边框）|
| `shadow-panel` | `0 1px 2px rgba(0,0,0,.2), 0 1px 3px rgba(0,0,0,.15)` | 需要轻微抬升的卡片（克制）|
| `shadow-overlay` | `0 8px 24px rgba(0,0,0,.4)` | 弹窗、下拉、popover、悬浮终端 |

### 5.1 禁用项

- ❌ **发光（glow）**：`0 0 20px rgba(99,102,241,...)` 类外发光
- ❌ 彩色投影（蓝色/品牌色 box-shadow）
- ❌ 多层重投影、`shadow-2xl` 大范围扩散（仅 modal overlay 例外）

> `[需收敛]` 现有 `.theme-primary-button` / `.theme-shell-active` 带蓝色 glow（`0 2px 12px rgba(59,130,246,.28)`），`--shadow-brand` 为 glow。目标：移除 glow，主按钮靠品牌底色本身区分，焦点用 focus ring 表达。

### 5.2 焦点环（替代发光的状态表达）

```css
focus: border-color: var(--brand-primary);
       box-shadow: 0 0 0 2px var(--brand-soft);   /* 2px 柔环，非发光 */
```

---

## 6. Button Design

### 6.1 变体

| 变体 | 背景 | 文字 | 边框 | 用途 |
|---|---|---|---|---|
| **Primary** | `--brand-primary` | white | none | 主操作（每屏 ≤1 个主区）|
| **Secondary** | `--bg-elevated` | `--text-muted`→hover `--text-primary` | 1px `--border-default` | 次操作 |
| **Ghost / Icon** | transparent / `--bg-surface` | `--text-muted`→hover brand | hover 1px brand | 工具栏、图标按钮 |
| **Danger-soft** | `--danger-soft` | `--danger` | none | 删除等破坏性操作 |

### 6.2 规格

```
尺寸(sm/默认)：px-3.5 py-2.5  text-sm  font-medium  rounded-lg
图标按钮      ：p-2.5  rounded-lg
gap(图标+文字)：gap-1.5
过渡          ：transition-colors
禁用          ：opacity-50 cursor-not-allowed
```

### 6.3 现有类

`.btn-primary` · `.btn-secondary` · `.btn-icon` · `.btn-danger-soft` · `.btn`（基类）

> `[需收敛]` `.theme-primary-button` 用 `font-black` + glow → 改 `font-medium`/`font-semibold`，去 glow。Primary hover 用 `--brand-primary-hover`/`--brand-secondary`，不加外发光。

---

## 7. Input Design

### 7.1 规格

| 属性 | 值 |
|---|---|
| 背景 | `--bg-elevated`（在卡片内）/ `--bg-surface`（独立）|
| 边框 | 1px `--border-default` |
| 圆角 | `rounded-lg` (8px) |
| 内距 | `px-3 py-2.5` |
| 字号 | `text-sm` |
| 文字 / 占位 | `--text-secondary` / `--text-faint` |
| 焦点 | border→brand + `0 0 0 2px var(--brand-soft)` |
| 禁用 | `--text-muted`，`opacity` 降低，`cursor-not-allowed` |

现有类：`.form-input` / `.theme-form-input`（大圆角变体）/ `.theme-login-input`（登录大尺寸 `px-5 py-4`）

### 7.2 标签与校验

- 标签：`.form-label`（`text-xs font-medium`，`--text-muted-soft`）
- 必填：`.required`（`--danger`）
- 错误态：边框 `--danger-border`，下方 `text-xs text-state-danger` 提示

---

## 8. Select Design

与 Input 同规格（`.form-select`：`rounded-lg`、`--bg-elevated`、`px-3 py-2.5`）。

| 属性 | 值 |
|---|---|
| 选项背景 | `#18233a`（`--bg-elevated`）|
| 选项文字 | `#d6def0`（`--text-secondary`）|
| 焦点 | 同 input |
| 自定义箭头 | 右侧 chevron 图标，`--text-muted` 描边 |

> 复杂多选/搜索下拉用自定义 popover（背景 `--bg-surface`，`shadow-overlay`，hover 项 `--bg-elevated`），不用原生 `<select>`。

---

## 9. Table Design

表格是高信息密度的核心载体——紧凑、弱分隔、可悬浮。

### 9.1 结构规格

| 部位 | 规格 |
|---|---|
| 容器 | `.table-container`：`rounded-xl`(目标) / `--bg-surface` / 1px `--border-default` / `overflow-hidden` |
| 表头 | `--bg-elevated`，`text-xs uppercase tracking-wider`，`--text-muted`，`font-semibold` |
| 表头单元格 | `px-3 py-2` ~ `px-4 py-3`，`text-left` |
| 行分隔 | `divide-y divide-[--border-subtle]`（极弱）|
| 行悬浮 | `hover:bg-theme-elevated`（轻微提亮）|
| 单元格 | `px-3 py-2`，`text-xs`~`text-sm`，`--text-secondary` |
| 数值列 | `font-mono tabular-nums`，右对齐 |

### 9.2 约定

- 状态列用 Tag（见 §11），不用纯文字
- 操作列右对齐，用 ghost/icon 按钮
- 宽表横向滚动（`overflow-x-auto`），表头可 sticky
- 空态：居中 `--text-faint` 提示 + 可选 CTA
- 加载：骨架行或居中 spinner

现有组件：`ExecutionTable` 系列（`ExecutionTableTd` 等）

---

## 10. Tag Design

### 10.1 语义徽章（暗色配方）

```
inline-flex items-center  rounded-full / rounded-md
px-2 py-0.5  text-[10px]/text-xs  font-medium  uppercase tracking-wider
bg-{color}-500/15  text-{color}-400  border border-{color}-500/20
```

### 10.2 状态映射（StatusBadge）

| 状态类 | 配色 |
|---|---|
| 成功/运行/健康/就绪 | `emerald-500/15` + `emerald-400` |
| 失败/错误/离线 | `rose-500/15` + `rose-400` |
| 等待/检查中 | `amber-500/15` + `amber-400` |
| 未就绪 | `orange-500/15` + `orange-400` |
| 中性/默认 | `--bg-elevated` + `--text-muted` + `--border-default` |

### 10.3 形态

- **状态点**：`h-2 w-2 rounded-full bg-{color}-400`（极简，用于列表前缀）
- **Pill 徽章**：`rounded-full`，用于状态
- **方形标签**：`rounded-md`，用于分类/计数

> 现有：`components/StatusBadge.tsx`、`environment/shared.tsx` 的 `HealthBadge`。

---

## 11. Card Design

### 11.1 核心规格（弱边框 + 层级）

| 属性 | 值 |
|---|---|
| 背景 | `--bg-surface`（在 app 底上）|
| 边框 | **1px `--border-default`**（弱）|
| 圆角 | `rounded-xl` (12px) |
| 阴影 | `shadow-none`（默认）|
| 内距 | `p-4` ~ `p-6` |

```html
<div class="rounded-xl border border-theme-border bg-theme-surface p-5">…</div>
```

### 11.2 层级铁律

- 卡片必须用 `--bg-surface`，**不可用 `--bg-app`**（与底色同层会"发黑"塌陷）
- 卡片**内嵌块**用 `--bg-elevated`（再抬一层）
- 嵌套深度建议 ≤2 层背景层级

### 11.3 指标卡（Metric Card）

`.metric-card`：`flex items-center justify-between rounded-xl px-4 py-3`，`--bg-surface` + 1px 边框。
- 数值：`text-2xl/3xl font-semibold --text-primary`
- 标签：`text-xs uppercase --text-muted`
- 趋势：`text-xs`，up→emerald-400 / down→rose-400

### 11.4 弹窗（Modal）

`.modal-overlay`（`rgba(5,10,20,0.72)` + `blur(6px)`）+ `.modal-container`（`--bg-surface`，1px 边框，`rounded-2xl`，`shadow-overlay`）。尺寸 `modal-md` 448 / `modal-xl` 576。

---

## 12. Layout Design

### 12.1 框架

```
┌────────────────────────────────────────────┐
│ Header  (--bg-header, 1px 底边)              │
├──────────┬─────────────────────────────────┤
│ Sidebar  │  Main Content                    │
│ 240/96px │  (--bg-app, 滚动区)              │
│ --bg-    │  ┌──────────────────────────┐    │
│ sidebar  │  │ Page (见 §13)            │    │
│          │  └──────────────────────────┘    │
└──────────┴─────────────────────────────────┘
```

### 12.2 导航层级

- **顶级导航**（Header / 一级菜单）：业务域切换
- **侧栏分组**（`SIDEBAR_SECTIONS`）：域内功能页，含图标、健康标识、`requiresProject` 守卫
- 侧栏可收起（240↔96px）；激活态：品牌底 `theme-shell-active`（目标去 glow），非激活 `theme-shell-muted`
- 定义集中在 `app/navigation.tsx`，视图注册在 `app/viewRegistry.tsx`

### 12.3 滚动与定位

- 内容区独立滚动，Header/Sidebar 固定
- 长表格表头 sticky；筛选/工具栏可 sticky
- 自定义滚动条（细、低对比）

---

## 13. Page Structure Design

### 13.1 标准页面骨架

```
1. Page Header（页头）
   ├─ 标题区：H1 (text-2xl/3xl font-semibold) + 副标题 (text-sm --text-muted)
   └─ 操作区：主操作(Primary) + 次操作(Secondary/Icon)，右对齐
   └─ 底部 1px 弱分隔线

2. Toolbar（工具栏，可选）
   ├─ 筛选(Select/Input) + 搜索
   └─ 视图切换 / 批量操作栏

3. Content（内容区）
   ├─ 指标卡行（Metric Cards，grid gap-4）—— 概览类页面
   ├─ 主体：Table / Card 网格 / 详情面板
   └─ 分页 / 加载更多

4. Empty / Loading / Error 态
   └─ 居中，--text-faint，可带 CTA
```

### 13.2 页面类型范式

| 类型 | 结构 | 例 |
|---|---|---|
| **概览/Dashboard** | 页头 + 指标卡行 + 图表/表格 | 安全概览、网关 Dashboard |
| **列表/管理** | 页头 + 工具栏 + 表格 + 分页 | 任务、资产、用户管理 |
| **详情** | 页头(带返回) + Tab/分区卡片 + 时间线/日志 | 任务详情、Agent 详情 |
| **配置** | 页头 + 分组表单卡片 + 保存栏 | 引擎配置、调度配置 |
| **工作区** | 分栏（树/列表 + 主区 + 详情） + 终端/编辑器 | 文件浏览、漏洞引擎 |

### 13.3 间距与节奏

- 页面根：`px-5 py-5 md:px-6 2xl:px-8`
- 区块之间：`space-y-4` ~ `space-y-6`
- 页头与内容：`pb-4` + 1px 分隔
- 卡片网格：`grid gap-4`，响应式列（`md:grid-cols-2 xl:grid-cols-3/4`）

### 13.4 响应式

断点 `sm/md/lg/xl/2xl`（+ 项目自定义 `3xl/4xl`）。密度优先：小屏堆叠、大屏多列；字号/内距随屏递进（`text-sm md:text-base`、`p-4 md:p-5`）。

---
# 14. Application Components

Application Components 是 Chimera 页面级组件规范。

所有业务页面必须优先使用这些组件。

禁止重复实现相同功能的页面结构。

---

## 14.1 PageHeader

统一页面头部。

结构：

PageHeader
├── title
├── description
└── actions

Props：

```tsx
<PageHeader
  title="项目管理"
  description="管理平台中的所有项目"
  actions={[
    <Button>创建项目</Button>
  ]}
/>
```

规范：

* title：text-2xl font-semibold
* description：text-sm text-muted
* actions：右对齐
* 底部带 1px border
* padding-bottom: 16px

适用：

* 列表页
* 详情页
* 配置页

---

## 14.2 StatisticCard

统一指标卡。

Props：

```tsx
<StatisticCard
  label="项目数"
  value="21"
  icon={<ProjectIcon />}
/>
```

规范：

* 高度：88px
* rounded-xl
* bg-surface
* border-default
* value：text-3xl font-semibold
* label：text-xs uppercase

适用：

* Dashboard
* 项目概览
* 漏洞概览
* Agent概览

---

## 14.3 Toolbar

统一搜索和筛选区域。

结构：

Toolbar
├── Search
├── Filters
└── Actions

规范：

左侧：

* SearchInput

中间：

* Select
* TagFilter
* StatusFilter

右侧：

* Refresh
* Create
* Export

适用：

* 所有列表页

---

## 14.4 DataTable

统一数据表格。

包含：

* Loading
* Empty
* Pagination
* Bulk Actions

规范：

* 使用统一 Table Design
* 不允许单页面自定义表格风格
* 操作列右对齐
* 状态列统一使用 StatusBadge

---

## 14.5 EmptyState

统一空状态。

结构：

Icon
Title
Description
Action

Props：

```tsx
<EmptyState
  title="暂无项目"
  description="点击创建项目开始使用"
  action={<Button>创建项目</Button>}
/>
```

---

## 14.6 PageSection

统一页面区块。

Props：

```tsx
<PageSection
  title="基础信息"
>
  content
</PageSection>
```

规范：

* rounded-xl
* bg-surface
* border-default
* padding: 20px

适用：

* 详情页
* 配置页
* 设置页

---

## 14.7 Standard List Page

所有列表页必须遵循：

PageHeader
↓
StatisticCard Row
↓
Toolbar
↓
DataTable

禁止创建新的列表页结构。

---

## 14.8 Standard Detail Page

所有详情页必须遵循：

PageHeader
↓
PageSection
↓
PageSection
↓
Timeline / Logs

禁止创建新的详情页结构。

## 附录 A：Token 速查

```
背景:  app #070d18 · surface #111a2b · elevated #18233a · sidebar #0d1526
文本:  primary #f5f7ff · secondary #d6def0 · muted #a4aec4 · faint #72809a
边框:  default #26324a · strong #33415c · subtle #1b2438
品牌:  primary #2563EB · hover #3B82F6 · secondary #4f46e5
语义:  success #10b981 · warning #f59e0b · danger #f43f5e · info #3b82f6
圆角:  控件 8px(lg) · 卡片 12px(xl) · 弹窗 16px(2xl)
阴影:  默认 none · 卡片轻抬 panel · 浮层 overlay（禁 glow）
间距:  4px 基准；卡片 p-4~6；单元格 px-3 py-2；gap-4 主力
字号:  正文 text-sm · 密集 text-xs · 标题 text-base~2xl
字重:  正文 400 · 标签/按钮 500 · 标题 600 · 强调 700
```

## 附录 B：核心文件

| 文件 | 职责 |
|---|---|
| `styles.css` | CSS 变量（主题源）、`@layer components`（组件类）、浅色→暗色 utility 重映射 |
| `tailwind.config.js` | `theme/brand/state/chart` 语义色（引用变量）、自定义圆角/阴影 |
| `theme/themes.ts` · `theme/ThemeProvider.tsx` | 主题定义与切换（`data-theme`，localStorage 持久化）|
| `app/navigation.tsx` · `app/viewRegistry.tsx` | 导航结构与视图注册 |
| `layout/Header.tsx` · `layout/Sidebar.tsx` | 全局框架 |
| `components/StatusBadge.tsx` · `ExecutionTable*` · `environment/shared.tsx` | 复用 UI 组件 |

## 附录 C：演进清单 `[需收敛]`

1. 按钮/标题 `font-black` (900) → `font-semibold`/`font-medium`
2. 移除按钮与激活态的蓝色 glow（`box-shadow: 0 2px 12px rgba(59,130,246,…)` / `--shadow-brand`）→ 靠品牌底色 + focus ring
3. 历史大圆角（曾 32–36px）→ 已统一 12px，新代码用 `rounded-lg/xl`
4. 个别页面卡片仍用 `--bg-app`（层级塌陷"发黑"）→ 逐页提升为 `--bg-surface`
5. 残留浅色硬编码 → 已全局重映射，新增代码直接用 `theme-*` 类
```
