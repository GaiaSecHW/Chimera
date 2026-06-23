# P2 / P3 执行手册 · 改现有页面

> 配套：`design-system-plan.md` / `p0-spec.md` / `p1-spec.md`
> 适用前提：**P0 + P1 组件已合入**（P2 改列表/详情页依赖 P1；改 Config 页只依赖 P0）。
> 本手册回答："组件建好了，怎么安全地把 193 个页面迁过来"。

---

## 0. 迁移总纪律（必须遵守）

1. **替换即删**：替换一处内联实现，立即删除对应的私有 `const SectionCard/StatCard/...`，杜绝双轨并存。
2. **按域成批**：一个 PR 只动一个业务域，便于回归与回滚。
3. **不混阶段**：一个 PR 要么做"组件替换"（P2），要么做"纯样式收敛"（P3），不要同一文件两件事混提——除非该文件本就在本批替换范围内（此时顺手收敛）。
4. **视觉零回归优先**：迁移目标是结构归一，不是改外观。如发现替换后视觉变化，先确认是"修正违规"（预期）还是"组件缺能力"（需补 props）。
5. **不手改未建组件的页面**：P1 未就绪前，不要手改列表/详情页头与表格。

---

## 1. P2 批次划分与顺序

按"重复密度 × 风险"排序，先 Config（只依赖 P0、模式统一），后列表/详情（依赖 P1）。

| 批次 | 域 / 范围 | 替换映射 | 依赖 | 预估文件 |
|---|---|---|---|---|
| **B1** | `pages/execution/*` Config 页 | `SectionCard`→`PageSection`；`FieldRow`→`FormField`；`PanelActions`→`FormActionBar` | P0 | 6 |
| **B2** | `pages/execution/*` Detail 页 | `MetricCard`→`StatisticCard` | P1 | ~8 |
| **B3** | `pages/platform/*` | `SummaryCard/MetricCard`→`StatisticCard`；原生表格→`DataTable` | P1 | ~6 |
| **B4** | `pages/vuln/*`、`pages/assets/*` | `StatCards`/私有 Badge/表格 → DS | P1 | ~12 |
| **B5** | 全局页头 + 其余域 | 内联标题块→`PageHeader`（106 处滚动推进） | P1 | 滚动 |

> 建议把 B1 作为**首个样板 PR**：模式最统一（6 个 Config 页几乎同构），改完即验证 P0 组件的覆盖度。

---

## 2. 单文件迁移流程（标准作业）

对每个目标文件，按固定步骤操作：

```
1. 读文件 → 标出内联实现：私有组件定义 + 调用点
2. 自顶向下替换：
   - import { PageSection, StatisticCard, ... } from '@/design-system'
   - 调用点 props 一一映射（见 §3 映射表）
3. 删除文件内私有定义（const SectionCard/StatCard/FieldRow/PanelActions...）
4. 顺手收敛该文件内 P3 项（font-black/bg-app/rounded-3xl）——仅限本文件
5. tsc --noEmit + 该域 smoke/e2e
6. 视觉抽查（dev 起页面，对比改前后）
```

**收尾校验（每批 PR 必跑）**：
```bash
# 该域内不应再有私有重复定义
grep -rnE "(const|function) (SectionCard|StatCard|MetricCard|SummaryCard|FieldRow|PanelActions)" pages/<域>/
# 期望：空
```

---

## 3. 内联 → DS 组件 props 映射表

| 现有内联 | DS 组件 | props 映射 | 注意 |
|---|---|---|---|
| `SectionCard{title,subtitle,actions}` | `PageSection` | `title`/`description`/`actions` | `subtitle`→`description`；背景自动转 `--bg-surface` |
| `FieldRow{label,hint}` | `FormField` | `label`/`hint`/`children` | 加 `htmlFor` 关联控件 |
| `PanelActions{saving,onSave,onReset}` | `FormActionBar` | 同名透传 | — |
| `StatCard/MetricCard{label,value,icon}` | `StatisticCard` | `label`/`value`/`icon` | — |
| `StatCard{...,tone}`（EnvManagement） | `StatisticCard` | `tone` | tone 枚举对齐 default/success/... |
| `MetricCard{...,hint}`（DataflowVulnScanner） | `StatisticCard` | `hint` | — |
| `KpiCard{...,onClick,caption}`（Dashboard） | `StatisticCard` | `onClick`/`hint(caption)` | — |
| `SummaryCard{label,value,tone}`（platform） | `StatisticCard` | `tone` | 颜色走语义 token |
| `EmptyState{text}` / `Placeholder{text}` | `EmptyState` | `title=text` | 旧单参→title |
| `EmptyState{icon,title,description}` | `EmptyState` | 同名 | — |
| 原生 `<table>` + 手写分页 | `DataTable` | `columns`/`data`/`pagination` | 状态列 render 内用 `Badge` |
| 内联 `fixed inset-0 z-[...]` 弹窗 | `Modal`(P0) | `open`/`onClose`/`title`/`footer` | — |
| 内联标题块 `text-2xl ...` | `PageHeader` | `title`/`description`/`actions` | 详情页加 `back` |
| 本地 `StatusBadge`/`HealthBadge` | 统一 `Badge` | `tone`/`children` | 保留域内业务 Badge 的特化 |

---

## 4. P3 规范收敛（穿插 / 独立批量）

P3 项可在 P2 改到某文件时顺手做（推荐），也可对未排入 P2 的文件独立批量做。

### 4.1 `font-black` → `font-semibold/bold`（3102 处）
- **DS 组件内部**：P0/P1 阶段已保证为零。
- **业务页**：随 P2 逐文件清；剩余未触及文件最后统一批量。
- 替换准则：标题/卡片标题→`font-semibold`；关键指标→`font-bold`；徽章/标签→`font-medium`。**不要无脑全替 semibold**，按 §2.3 语义。

### 4.2 移除蓝色 glow（`styles.css` / `tailwind.config.js`）
集中且一次性，**不分散到业务页**：
- `.theme-shell-active`：删 `box-shadow: 0 2px 12px rgba(59,130,246,...)`，激活态靠 `--brand-primary` 底色 + focus ring。
- `.theme-primary-button`：删 glow（并把 `font-black`→`font-semibold`、`rounded-xl`→按 §6 用 `.btn-primary`）。
- `tailwind.config.js` `shadow-brand`：标记弃用，搜索引用清零后移除。
- 改完全站回归一次（侧栏激活态 + 主按钮）。

### 4.3 卡片 `bg-app` 误用（102 文件）
- **新增**：P0 `Card`/`PageSection` 已从源头堵死。
- **存量**：随 P2 逐域改；`grep -rl "bg-theme-bg-app\|bg-theme-app"` 跟踪剩余量作为收敛进度指标。

### 4.4 超标圆角（31 文件 + `.table-container`）
- 卡片/容器 `rounded-2xl/3xl` → `rounded-xl`；弹窗保留 `rounded-2xl`。
- `.table-container` 由 `rounded-2xl` 改 `rounded-xl`（一处 CSS，全站生效）。

### 4.5 `window.confirm/alert`（35 文件）→ `useUiFeedback.confirm`
- 逐文件替换；注意 `confirm` 是异步 Promise，调用处需 `await`。

---

## 5. 治理落地（防回潮）

迁移期同步加护栏，避免边改边长新债：

1. **ESLint 规则**（自定义/`no-restricted-syntax`）：
   - 禁止在 `pages/**` 内定义名为 `SectionCard|StatCard|MetricCard|SummaryCard|FieldRow|PanelActions|PageHeader|EmptyState` 的组件。
   - 禁止 `pages/**` 直接 `className` 含 `font-black`（warn）。
2. **import 收口**：业务页只允许从 `@/design-system` 引 UI 组件（域内 shared 例外白名单）。
3. **CI 检查**：PR 跑 `tsc --noEmit` + 上述 grep 守卫（私有定义计数不增）。
4. **进度看板**：用 grep 计数做趋势（私有定义数、`font-black` 数、`bg-app` 卡片数），逐周下降。

---

## 6. 验收里程碑

| 节点 | 标志 | 验证 |
|---|---|---|
| B1 完成 | execution Config 页无私有 `SectionCard/FieldRow/PanelActions` | grep 守卫为空 |
| B2–B4 完成 | 各域无私有 `StatCard/MetricCard`；表格走 `DataTable` | grep + 视觉抽查 |
| B5 完成 | `PageHeader` 覆盖标准列表/详情页 | 抽查页头一致 |
| P3 完成 | 全站去 glow；DS 组件零 `font-black`；`bg-app` 卡片趋零 | 全站回归 + grep 趋势 |
| 收尾 | ESLint 护栏生效，私有定义计数稳定为 0 | CI 绿 |

---

## 7. 回滚与风险

- 每批独立 PR → 出问题只回滚该域。
- `DataTable`/`StatisticCard` 若迁移中发现覆盖不全 → **补 props 到组件**（回 P1），不在业务页 fork 私有实现。
- 大域（execution）文件多，B 批可再切子批（如 B2 按 Dataflow / Entry / System / Binary 分子 PR）。

> 文档链完成：分析(`analysis`) → 计划(`plan`) → P0(`p0-spec`) → P1(`p1-spec`) → P2/P3(`本手册`)。可据此排期并启动 P0 实现。
