# P0 薄封装基础件 · 可执行规格

> 配套：`doc/design-system-plan.md`（阶段 P0）
> 原则：**包裹现有 `styles.css` 类，不新增 CSS / token**。React 层只补 CSS 无法表达的行为。
> 范围：`Button` / `Input` / `Select` / `FormField` / `Card` / `Modal`，统一出口 `design-system/index.ts`。

---

## 通用约定

- 所有组件 `forwardRef`，透传原生属性（`Button` 透 `ButtonHTMLAttributes`，`Input` 透 `InputHTMLAttributes`…）。
- `className` 一律 **追加** 到内部 class 之后（允许局部覆盖间距/宽度，不允许覆盖颜色/圆角）。
- 不引入新依赖；图标用既有 `lucide-react`。
- 禁止出现硬编码颜色/`font-black`/glow；内部只用现有 `.btn-*`/`.form-*`/`.modal-*` 与 `theme-*` token 类。

```ts
// design-system/utils/cx.ts
export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');
```

---

## 1. Button

包裹：`.btn` + `.btn-primary` / `.btn-secondary` / `.btn-icon` / `.btn-danger-soft`（§6）

```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';   // md=默认(px-3.5 py-2.5)，sm 仅用于密集工具栏

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;        // 默认 'secondary'
  size?: ButtonSize;              // 默认 'md'
  loading?: boolean;              // true → 显示 spinner + 自动 disabled
  icon?: React.ReactNode;         // 左侧图标，gap-1.5
  iconOnly?: boolean;             // true → 用 .btn-icon（方形 p-2.5），需配 aria-label
  fullWidth?: boolean;
}
```

variant → class 映射：

| variant | class |
|---|---|
| primary | `.btn .btn-primary` |
| secondary | `.btn .btn-secondary` |
| ghost | `.btn-icon`（透明工具按钮） |
| danger | `.btn-danger-soft` |
| `iconOnly` | `.btn-icon` |

行为：
- `loading`：左侧渲染 `<Loader2 className="animate-spin" size={14}/>`，`disabled` 强制 true，文字保留。
- `disabled`/`loading`：依赖现有 `.btn-primary:disabled`（`opacity-50 cursor-not-allowed`）；其余 variant 追加同等 disabled 类。
- `iconOnly` 且无 `aria-label` → 开发期 `console.warn`。

验收：`<Button variant="primary">保存</Button>` 渲染 class 与现有手写 `.btn .btn-primary` 完全一致。

---

## 2. Input

包裹：`.form-input`（§7）

```ts
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;              // true → 边框 --danger-border
  prefix?: React.ReactNode;       // 左插槽（图标/单位）
  suffix?: React.ReactNode;       // 右插槽（清除/单位）
}
```

行为：
- 默认 `.form-input`（已含 focus ring `0 0 0 2px var(--brand-soft)`，不重写）。
- `invalid`：追加 `border-state-danger-border`（用现有 token 类，不新增）。
- 有 `prefix/suffix` 时外包 `relative` 容器，input 加 `pl-*/pr-*`；无插槽时不包裹，保持零开销。
- 错误**文案**不在此组件渲染，由 `FormField.error` 统一负责（避免双重错误 UI）。

验收：无插槽时 DOM 与裸 `<input class="form-input">` 等价。

---

## 3. Select

包裹：`.form-select`（§8，原生 `<select>`，含自定义箭头与 option 暗色）

```ts
interface SelectOption { label: string; value: string; disabled?: boolean; }

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  placeholder?: string;           // 渲染为首个 disabled+hidden option
  invalid?: boolean;
}
```

行为：
- 渲染 `.form-select` + `options.map(<option>)`；`placeholder` → `<option value="" disabled hidden>`。
- 复杂多选/搜索下拉 **不在 P0 范围**（DESIGN §8 要求自定义 popover，归 P2 `Combobox` 候选）。注释标注边界。

验收：option 背景/文字走现有 `.form-select option`（`#18233a`/`#d6def0`），无需额外样式。

---

## 4. FormField

合并：7 处私有 `FieldRow`/`Field`；包裹 `.form-label` + `.required`（§7.2）

```ts
interface FormFieldProps {
  label: React.ReactNode;
  htmlFor?: string;               // 关联控件 id（a11y）
  required?: boolean;             // true → label 后 .required 红星
  hint?: React.ReactNode;         // label 旁/下方弱说明
  error?: React.ReactNode;        // 有值 → 下方 text-xs text-state-danger
  children: React.ReactNode;      // 控件本体（Input/Select/...）
}
```

结构（与 §7.2 一致）：
```
<div class="flex flex-col gap-1">
  <label class="form-label">{label}{required && <span class="required">*</span>}
    {hint && <span class="ml-2 font-normal text-theme-text-muted">{hint}</span>}</label>
  {children}
  {error && <p class="text-xs text-state-danger">{error}</p>}
</div>
```

行为：
- 不强制把 `invalid` 传给子控件——`error` 存在时由调用方决定是否给 `Input invalid`，或后续提供 `FormField` 自动注入（P0 先不做注入，保持简单）。

验收：能 1:1 替换 `DataflowAnalysisConfigPage` 等处的 `FieldRow`。

---

## 5. Card

**唯一需新建**（无通用卡片类，仅 `.metric-card` 特例）。强制 §11.2 层级铁律。

```ts
type CardPadding = 'none' | 'sm' | 'md' | 'lg';   // 0 / p-4 / p-5 / p-6

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;          // 默认 'md'(p-5)
  as?: 'div' | 'section' | 'article';
  // 注意：不提供 surface/bg 入参 —— 背景强制 --bg-surface，杜绝 bg-app 误用
}
```

固定 class：`rounded-xl border border-theme-border bg-theme-surface` + padding 档：

| padding | class |
|---|---|
| none | （无） |
| sm | `p-4` |
| md | `p-5` |
| lg | `p-6` |

行为：
- 背景**写死** `bg-theme-surface`，无 prop 可改 → 从源头堵住 102 处 `bg-app` 误用。
- 内嵌块需要再抬一层时，调用方自行用 `bg-theme-elevated`（不在 Card 职责内）。

验收：渲染 class 恒为 `rounded-xl border border-theme-border bg-theme-surface p-5`（默认），与 §11.1 示例一致。

---

## 6. Modal

包裹：`.modal-overlay` / `.modal-container` / `.modal-md` / `.modal-xl`（§11.4）

```ts
interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: 'md' | 'xl';             // 默认 'md'(448) / 'xl'(576)
  title?: React.ReactNode;        // 渲染标准头部
  description?: React.ReactNode;
  footer?: React.ReactNode;       // 操作区（通常放 Button）
  closeOnOverlay?: boolean;       // 默认 true
  closeOnEsc?: boolean;           // 默认 true
  children: React.ReactNode;      // body
}
```

结构：
```
.modal-overlay  → .modal-container.modal-md|xl
  [header: title(text-base/lg font-semibold) + description(text-sm text-muted) + 右上 X(Button ghost)]
  [body: children, p-5, overflow-auto]
  [footer: 右对齐, p-4 border-t]
```

行为（CSS 类无法表达，P0 重点补这些）：
- `open=false` 时返回 `null`（不渲染）。
- `closeOnEsc`：监听 `keydown` Escape → `onClose`。
- `closeOnOverlay`：点遮罩层（非 container）→ `onClose`。
- **focus trap**：打开时焦点移入容器，Tab 循环锁在内部，关闭后焦点归还触发元素。
- `role="dialog"` `aria-modal="true"`，`aria-labelledby` 关联 title。
- body 滚动锁（打开时 `document.body` overflow hidden）。
- 圆角用 `.modal-container`（`rounded-2xl`，§11.4 合规），**不用** `rounded-3xl`。

验收：可替换 `UiFeedback` 之外的 55 处内联 `fixed inset-0 z-[...]` 弹窗；视觉与现有 `.modal-*` 一致。

---

## 目录与出口

```
design-system/
├── index.ts                      # re-export 全部
├── utils/cx.ts
└── primitives/
    ├── Button/{Button.tsx, index.ts}
    ├── Input/{Input.tsx, index.ts}
    ├── Select/{Select.tsx, index.ts}
    ├── FormField/{FormField.tsx, index.ts}
    ├── Card/{Card.tsx, index.ts}
    ├── Modal/{Modal.tsx, index.ts}
    └── index.ts
```

```ts
// design-system/index.ts
export * from './primitives';
// design-system/primitives/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Select } from './Select';
export { FormField } from './FormField';
export { Card } from './Card';
export { Modal } from './Modal';
export type { ButtonProps, InputProps, SelectProps, FormFieldProps, CardProps, ModalProps };
```

---

## P0 整体验收清单

- [ ] 6 组件全部 `forwardRef` + 透传原生属性 + `className` 追加。
- [ ] 未改 `styles.css`、未改 `tailwind.config.js`、未新增 CSS 变量。
- [ ] `Button/Input/Select/Modal` 渲染 class 与对应现有手写一致（视觉零回归）。
- [ ] `Card` 背景恒为 `--bg-surface`，无 prop 可改。
- [ ] `Modal` 具备 ESC / overlay 关闭 / focus trap / body 滚动锁 / a11y。
- [ ] `FormField` 可 1:1 替换至少一处现有 `FieldRow`（PR 内含示例）。
- [ ] 开发期 demo 页覆盖全部 variant/size/状态。
- [ ] `tsc --noEmit` 通过。
- [ ] 组件内零 `font-black` / 零 glow / 零硬编码颜色。

> 不在 P0 范围（明确划界）：搜索型 `Combobox`/多选下拉（→ P2）、`Tabs`（→ P2）、`DataTable`/`PageHeader` 等应用级件（→ P1）。
