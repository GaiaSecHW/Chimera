# Chimera Design System 落地计划（分阶段）

> 生成日期：2026-06-18 · 配套文档：`doc/design-system-analysis.md`
> 原则：**不改 Token 基座**（`styles.css` 变量 + `tailwind.config.js` 为单一真相），React 层只做"薄封装 + 补行为"。
> 每个阶段可独立合入、独立验收，不阻塞业务开发。

---

## 总览

| 阶段 | 目标 | 产出 | 风险 |
|---|---|---|---|
| **P0** | 薄封装现有能力 | Button/Input/Select/Card/Modal + FormField | 低（包现有 CSS 类） |
| **P1** | 补齐 §14 应用级组件 | PageHeader/StatisticCard/Toolbar/DataTable/PageSection/EmptyState | 中（新建） |
| **P2** | 批量收编替换 | 替换 ≥22 StatCard / ≥13 SectionCard / 106 页头 | 中（量大，需逐域） |
| **P3** | 规范收敛清理 | 清 font-black / glow / bg-app 误用 | 低（机械替换 + 抽查） |

**铁律**：P0/P1 只新增、不替换业务代码；P2 才动业务页面；P3 收尾。每阶段独立可回滚。

---

## 阶段 P0 · 薄封装基础件（1 周）

**定位**：不重新设计样式，只把已达标的 CSS 类包成受控 React 组件，补 CSS 无法表达的行为（variant / loading / disabled / icon / a11y）。

### 交付组件

| 组件 | 包裹的现有类 | 仅补充的行为 |
|---|---|---|
| `Button` | `.btn` + `.btn-primary/secondary/icon/danger-soft` | `variant` / `size` / `loading`（spinner）/ `icon` / `disabled` |
| `Input` | `.form-input` | 受控值 / `error` 态 / `prefix-suffix` 插槽 |
| `Select` | `.form-select` | `options` / 受控 / `placeholder` |
| `FormField` | `.form-label` + `.required` | `label` / `hint` / `error` / `children`（合并 7 处 `FieldRow`） |
| `Card` | token 类（`bg-theme-surface`+`border-theme-border`+`rounded-xl`） | **强制 `--bg-surface`**（堵 102 处 `bg-app` 误用）/ `padding` 档位 |
| `Modal` | `.modal-overlay/container/md/xl` | 受控开关 / ESC 关闭 / focus trap / `size` |

### 目录

```
design-system/
├── index.ts
├── primitives/
│   ├── Button/{index.tsx, Button.tsx}
│   ├── Input/  Select/  FormField/
│   ├── Card/   Modal/
│   └── index.ts
```

### 验收
- 每个组件渲染出的 className 与现有 `.btn-*`/`.form-*`/`.modal-*` 完全一致（视觉零回归）。
- 不新增任何 CSS 变量、不改 `styles.css`。
- `Card` 默认 `--bg-surface`，无法传入 `bg-app`。
- 提供 1 个 demo 页（仅开发可见）覆盖全部 variant。

---

## 阶段 P1 · 补齐 §14 应用级组件（1.5 周）

**定位**：DESIGN.md §14 规定但 0 落地的 6 个组件。这是收益最大的部分。

### 交付组件（严格按 §14 props）

| 组件 | §14 | 关键 props | 底层复用 |
|---|---|---|---|
| `PageHeader` | 14.1 | `title` / `description` / `actions` | 内部用 token 类 |
| `StatisticCard` | 14.2 | `label` / `value` / `icon` / `trend?` | 复用 `.metric-card` 规格 |
| `Toolbar` | 14.3 | `search` / `filters` / `actions`（含 `SearchInput` 子件） | `Input`/`Select`（P0） |
| `DataTable` | 14.4 | `columns` / `data` / `loading` / `empty` / `pagination` / `bulkActions` | 底层 `ExecutionTable*` + 新 `Pagination` |
| `PageSection` | 14.6 | `title` / `actions` / `children` | `Card`（P0） |
| `EmptyState` | 14.5 | `icon` / `title` / `description` / `action` | 统一 4 私有签名 |

### 目录

```
design-system/
├── application/
│   ├── PageHeader/  StatisticCard/  PageSection/  EmptyState/
│   ├── Toolbar/{index.tsx, SearchInput.tsx}
│   ├── DataTable/{index.tsx, Pagination.tsx}
│   └── index.ts
├── feedback/                    # 迁移 useUiFeedback / DialogService（仅移动，不重写）
└── patterns/                    # 可选：StandardListPage / StandardDetailPage 骨架
```

### 验收
- `DataTable` 内置 Loading / Empty / Pagination / Bulk，业务页不再写原生 `<table>`。
- `StatisticCard` 能覆盖现有 22 处 StatCard/MetricCard 的全部用例（label/value/icon/trend/tone）。
- 提供迁移示例：选 1 个标准列表页（如 `ProjectMgmtPage`）改造为 `PageHeader→StatisticCard→Toolbar→DataTable`，作为后续模板。

---

## 阶段 P2 · 批量收编替换（按域滚动，2–3 周）

**定位**：用 P0/P1 组件替换业务页面内联实现。**按业务域分批**，每批一个 PR，便于回归。

### 替换批次（按重复密度排序）

| 批次 | 域 | 主要替换项 | 涉及文件 |
|---|---|---|---|
| B1 | `pages/execution/*` Config 页 | `SectionCard`/`FieldRow`/`PanelActions` → `PageSection`/`FormField`/`FormActionBar` | 6 Config 页 |
| B2 | `pages/execution/*` Detail 页 | `MetricCard` → `StatisticCard` | ~8 文件 |
| B3 | `pages/platform/*` | `SummaryCard`/`MetricCard` → `StatisticCard`；表格 → `DataTable` | ~6 文件 |
| B4 | `pages/vuln/*` `pages/assets/*` | `StatCards`/私有 Badge/表格 | ~12 文件 |
| B5 | 其余域 + 页头统一 | `PageHeader` 替换 106 处内联标题块 | 滚动推进 |

### 配套
- 新增 `FormActionBar`（收编 8 处 `PanelActions`）、统一 `Badge`（收编绕过 `StatusBadge` 的本地实现）。
- 每批替换后删除对应私有定义（`const SectionCard`/`StatCard` 等），避免双轨并存。

### 验收
- 每批 PR：TypeScript `tsc --noEmit` 通过；对应 smoke/e2e 通过；视觉抽查无回归。
- 批次完成后，该域内 `grep` 不再出现私有 `SectionCard`/`StatCard`/`MetricCard` 定义。

---

## 阶段 P3 · 规范收敛清理（穿插进行，1 周）

**定位**：清理 DESIGN.md 附录 C `[需收敛]` 项。多为机械替换，可借 P2 顺手做，也可独立批量。

| 收敛项 | 范围 | 做法 |
|---|---|---|
| `font-black` → `font-semibold/bold` | 3102 处 | 优先清 DS 组件内部 + 高频页；批量替换 + 抽查 |
| 移除蓝色 glow | `.theme-shell-active` / `.theme-primary-button` / `shadow-brand` | 改 `styles.css`：删 box-shadow，激活态靠品牌底色 + focus ring |
| 卡片 `bg-app` 误用 | 102 文件 | P0 `Card` 已堵新增；存量随 P2 逐域改 `--bg-surface` |
| `rounded-3xl`/`rounded-2xl` 超标 | 31 文件 + `.table-container` | 统一降到 `rounded-xl`（卡片）/ `rounded-2xl`（仅弹窗） |
| `window.confirm/alert` | 35 文件 | 替换为 `useUiFeedback.confirm` |

### 验收
- DS 组件内部零 `font-black`、零 glow。
- `styles.css` 移除 glow 后，主按钮/侧栏激活态视觉确认通过。

---

## 治理（贯穿全程）

1. **统一出口**：业务页只从 `@/design-system` import；加 ESLint 规则禁止页面内私有定义 `SectionCard`/`StatCard`/`PageHeader` 等名称。
2. **域内 shared 保留**：`b2sPresentation`/`vuln-engine/shared`/`BinaryEvolutionShared` 的业务特化保留，通用部分上移 DS。
3. **不动基座**：禁止在 DS 组件里新增 CSS 变量或硬编码颜色，一切引用 `styles.css` token。
4. **迁移即删除**：替换一处，删一处私有定义，杜绝双轨。

---

## 里程碑建议

| 周 | 阶段 | 标志 |
|---|---|---|
| W1 | P0 | 6 个薄封装件 + demo 合入 |
| W2–W3 | P1 | 6 个应用级组件 + 1 个样板列表页改造 |
| W4–W6 | P2 | 按 B1–B5 滚动替换，私有重复定义清零 |
| 穿插 | P3 | glow/`font-black`/`bg-app` 收敛 |

> 排期为建议值，可按实际并行度压缩。P0+P1 是"建设"，P2+P3 是"迁移"，建设完成后迁移可由多人并行分域推进。
