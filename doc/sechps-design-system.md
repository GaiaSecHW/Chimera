# SecHPS Design System

> Dark-first Developer Tool UI，适用于 AI 平台、安全平台、DevOps 后台等现代深色管理系统。
> 风格对标：Vercel Dashboard / Linear / Raycast / GitHub Dark

---

## 目录

1. [设计理念](#1-设计理念)
2. [颜色体系](#2-颜色体系)
3. [字体体系](#3-字体体系)
4. [间距体系](#4-间距体系)
5. [圆角体系](#5-圆角体系)
6. [阴影体系](#6-阴影体系)
7. [按钮体系](#7-按钮体系)
8. [表单体系](#8-表单体系)
9. [卡片体系](#9-卡片体系)
10. [弹窗体系](#10-弹窗体系)
11. [表格体系](#11-表格体系)
12. [徽章与状态](#12-徽章与状态)
13. [提示与通知](#13-提示与通知)
14. [Glass 效果](#14-glass-效果)
15. [滚动条](#15-滚动条)
16. [布局参数](#16-布局参数)
17. [响应式断点](#17-响应式断点)
18. [动画与过渡](#18-动画与过渡)
19. [Design Token 完整清单](#19-design-token-完整清单)
20. [theme.css 完整文件](#20-themecss-完整文件)

---

## 1. 设计理念

| 原则 | 说明 |
|------|------|
| **Dark-first** | 全站深色主题，无浅色切换，背景三层灰度递进 |
| **克制配色** | 主色 Indigo + 辅色 Cyan，功能色仅 4 种，中性色 Zinc |
| **信息密度** | 无斑马纹、无多余装饰，分割线 + hover 区分行 |
| **科技质感** | backdrop-blur 玻璃效果、accent glow 阴影、微动画过渡 |
| **系统字体** | 使用 OS 原生 system-ui，无外部字体依赖 |

---

## 2. 颜色体系

### 2.1 背景层级（从深到浅）

| Token | Hex | 用途 |
|-------|-----|------|
| `--bg-base` | `#1c1c1e` | 页面最底层背景 / Input 背景 / Select option 背景 |
| `--bg-surface` | `#2c2c2e` | 卡片 / 弹窗 / 面板表面 |
| `--bg-surface-hover` | `#3a3a3c` | hover 态背景 / 次级按钮背景 / 边框色 |
| `--bg-overlay` | `rgba(0,0,0,0.6)` | Modal 遮罩 |
| `--bg-glass` | `rgba(44,44,46,0.8)` | 玻璃效果背景 |
| `--bg-glass-strong` | `rgba(44,44,46,0.9)` | 强玻璃效果背景 |

**层级示意**：

```
┌─────────────────────────────────────┐  ← bg-base (#1c1c1e)  页面底色
│  ┌───────────────────────────────┐  │  ← bg-surface (#2c2c2e) 卡片/弹窗
│  │  ┌─────────────────────────┐  │  │  ← bg-surface-hover (#3a3a3c) hover态
│  │  │  元素 hover 区域        │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 2.2 文字层级（从亮到暗）

| Token | Hex | 用途 |
|-------|-----|------|
| `--text-heading` | `#f5f5f5` | 标题文字（h1-h4） |
| `--text-primary` | `#e5e5e5` | 正文主文字 / Input 输入文字 |
| `--text-secondary` | `#a1a1a3` | 二级描述文字 / 次级按钮文字 |
| `--text-muted` | `#7c7c7e` | 弱化文字 / 表头文字 / 图标色 |
| `--text-placeholder` | `#64748b` | Placeholder 文字 |
| `--text-white` | `#ffffff` | 主按钮文字 |

### 2.3 边框层级

| Token | Hex | 用途 |
|-------|-----|------|
| `--border-base` | `#3a3a3c` | 常态边框 / 表格分割线 |
| `--border-light` | `#2c2c2e` | 轻边框（极少使用） |
| `--border-muted` | `rgba(58,58,60,0.5)` | 卡片边框 / 弹窗边框 |
| `--border-subtle` | `rgba(58,58,60,0.4)` | 搜索栏淡化边框 |

### 2.4 主色（Primary / Indigo）

| Token | Hex | 用途 |
|-------|-----|------|
| `--primary-400` | `#818cf8` | 链接高亮 / prose link / hover 减淡 |
| `--primary-500` | `#6366f1` | accent / focus ring / checkbox accent |
| `--primary-600` | `#4f46e5` | 主按钮常态 |
| `--primary-700` | `#4338ca` | 主按钮 hover 加深 |

完整色阶（按需使用）：

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#eef2ff` | `#e0e7ff` | `#c7d2fe` | `#a5b4fc` | `#818cf8` | `#6366f1` | `#4f46e5` | `#4338ca` | `#3730a3` | `#312e81` | `#1e1b4b` |

### 2.5 辅色（Cyan）

| 用途 | 配色模式 |
|------|----------|
| Sidebar active | `bg: rgba(6,182,212,0.15)` `text: #22d3ee` `border: #06b6d4` |
| Badge cyan | `bg: rgba(6,182,212,0.15)` `text: #22d3ee` `border: rgba(6,182,212,0.2)` |
| Metric icon | `bg: linear-gradient(135deg, rgba(34,211,238,0.2), rgba(59,130,246,0.2))` |

### 2.6 功能色（Semantic）

| 语义 | 常态 | Hover | 淡背景 | 淡边框 | 文字色 |
|------|------|-------|--------|--------|--------|
| **Danger** | `#dc2626` | `#b91c1c` | `rgba(153,27,27,0.2)` | `rgba(153,27,27,0.4)` | `#f87171` |
| **Success** | `#16a34a` | `#15803d` | `rgba(20,83,45,0.2)` | `rgba(20,83,45,0.4)` | `#4ade80` |
| **Warning** | `#ca8a04` | `#a16207` | `rgba(113,63,18,0.2)` | `rgba(113,63,18,0.4)` | `#fbbf24` |
| **Info** | `#2563eb` | `#1d4ed8` | `rgba(30,64,175,0.2)` | `rgba(30,64,175,0.4)` | `#60a5fa` |

**Ghost 按钮（无背景型）使用淡背景做 hover，文字色做常态**。

### 2.7 Zinc 中性色

| 950 | 900 | 800 | 700 | 600 | 500 | 400 | 300 | 200 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| `#09090B` | `#18181B` | `#27272A` | `#3F3F46` | `#52525B` | `#71717A` | `#A1A1AA` | `#D4D4D8` | `#E4E4E7` | `#F4F4F5` |

高频使用：`zinc-900`(背景) / `zinc-800`(边框) / `zinc-700`(次级底) / `zinc-400`(次级文字)

---

## 3. 字体体系

### 3.1 Font Family

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
```

### 3.2 Font Size

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-size-2xs` | 10px | Badge(sm)、Sidebar section 标题 |
| `--font-size-xs` | 12px | Badge(md)、Label(sm)、表头文字、InlineError |
| `--font-size-sm` | 14px | **正文基准 / 按钮文字 / 描述文字 / TableCell** |
| `--font-size-base` | 16px | Card title / 正文大号 |
| `--font-size-lg` | 18px | Modal title / SectionTitle |
| `--font-size-xl` | 20px | PageTitle(sm) / MetricCard value |
| `--font-size-2xl` | 24px | PageTitle(md) / MetricCard value(md) |
| `--font-size-3xl` | 30px | PageTitle(lg) |

### 3.3 Font Weight

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-weight-normal` | 400 | 正文（极少显式使用） |
| `--font-weight-medium` | 500 | 按钮 / Label / Badge / Tree node |
| `--font-weight-semibold` | 600 | 标题(h1-h4) / 表头文字 |
| `--font-weight-bold` | 700 | MetricCard 数值 |

### 3.4 Line Height

| 场景 | Token | 值 |
|------|-------|-----|
| 正文 | `--line-height-relaxed` | 1.625 |
| 表格 prose | `--line-height-prose-sm` | 1.6 |
| 表格 prose lg | `--line-height-prose-lg` | 1.75 |
| 标题 | 默认 | 1.2-1.4 |

### 3.5 Letter Spacing

| 场景 | 值 |
|------|-----|
| 表头文字 | `0.05em`（uppercase + tracking-wider） |
| Sidebar section | `0.1em`（tracking-widest） |
| 其他 | 默认 |

---

## 4. 间距体系

### 4.1 Padding

| 场景 | Token 组合 | 值(px) |
|------|-----------|--------|
| Badge sm | `px-1.5 py-0.5` | 6/2 |
| Badge md | `px-2 py-1` | 8/4 |
| Button sm | `px-3 py-1.5` | 12/6 |
| Input/Select | `px-3 py-2` | 12/8 |
| Button md | `px-4 py-2` | 16/8 |
| Alert | `px-4 py-3` | 16/12 |
| Card padding sm | `p-3 → md:p-4` | 12→16 |
| Card padding md | `p-4 → md:p-5` | 16→20 |
| Card padding lg | `p-5 → md:p-6` | 20→24 |
| Modal Header/Footer | `px-6 py-4` | 24/16 |
| 页面水平间距 | `px-4 → md:px-6 → lg:px-8` | 16→24→32 |

### 4.2 Gap

| Token | 值 | 用途 |
|-------|-----|------|
| `--spacing-1` | 4px | 紧凑 gap |
| `--spacing-1.5` | 6px | Tree node gap |
| `--spacing-2` | 8px | 小间距 |
| `--spacing-3` | 12px | **Alert 内容间距 / 按钮组 gap** |
| `--spacing-4` | 16px | **Header gap / 通用间距** |
| `--spacing-6` | 24px | 大间距 |
| `--spacing-8` | 32px | Grid xl gap |

### 4.3 表格 Padding

| 场景 | Padding | 行高约 |
|------|---------|--------|
| 标准 | `px-6 py-4` | 56px |
| 紧凑 | `px-3 py-2` | 36px |
| 响应式 | `px-3 → md:px-4 py-3` | 44px |
| 表头 | `px-3 → md:px-4 py-3` | 44px |

---

## 5. 圆角体系

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 4px | Badge / 小 Tab |
| `--radius-md` | 6px | Input(旧范式) / Select(旧) / Dropdown |
| `--radius-base` | 8px | **Button / Alert / Table / Panel / Input(新范式)** |
| `--radius-lg` | 12px | **Card / Modal / Dropdown 面板** |
| `--radius-xl` | 16px | 大弹窗 / 登录卡片 |
| `--radius-full` | 9999px | Spinner / 关闭按钮 / StatusBadge / toggle |

**统一圆角建议**：新项目统一使用 `--radius-base`(8px) 作为表单控件圆角，`--radius-lg`(12px) 作为卡片/弹窗圆角。

---

## 6. 阴影体系

| Token | CSS 值 | 用途 |
|-------|--------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)` | Card 常态 |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.25)` | Card hover |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.25)` | 大弹窗 |
| `--shadow-xl` | `0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.25)` | Modal |
| `--shadow-glow` | `0 0 20px rgba(99,102,241,0.15)` | 主按钮发光效果 |
| `--shadow-glow-strong` | `0 0 30px rgba(99,102,241,0.25)` | 强化发光效果 |

---

## 7. 按钮体系

### 7.1 Variant

| Variant | 背景 | 文字 | Hover 背景 | Focus Ring | Disabled |
|---------|------|------|-----------|------------|----------|
| **Primary** | `var(--primary-600)` | `var(--text-white)` | `var(--primary-700)` | `var(--accent-ring)` | `opacity:0.5` |
| **Secondary** | `var(--bg-surface)` | `var(--text-secondary)` | `var(--bg-surface-hover)` | — | `opacity:0.5` |
| **Outline** | `transparent` | `var(--text-secondary)` | `var(--bg-base)` | — | `opacity:0.5` |
| **Danger** | `var(--color-danger)` | `var(--text-white)` | `var(--color-danger-hover)` | `var(--color-danger)` | `opacity:0.5` |
| **Success** | `var(--color-success)` | `var(--text-white)` | `var(--color-success-hover)` | — | `opacity:0.5` |
| **Warning** | `var(--color-warning)` | `var(--text-white)` | `var(--color-warning-hover)` | `var(--color-warning)` | `opacity:0.5` |
| **Ghost-Danger** | `transparent` | `var(--color-danger-text)` | `var(--color-danger-bg)` | — | — |
| **Ghost-Success** | `transparent` | `var(--color-success-text)` | `var(--color-success-bg)` | — | — |
| **Ghost-Info** | `transparent` | `var(--color-info-text)` | `var(--color-info-bg)` | — | — |

### 7.2 Size

| Size | Padding | Font Size | Height(约) |
|------|---------|-----------|------------|
| **sm** | `6px 12px` | 12px | 28px |
| **md** | `8px 16px` | 14px | 36px |
| **lg** | `12px 24px` | 16px | 44px |
| **icon** | `6px` | — | 28px |

### 7.3 完整 CSS

```css
/* 按钮 Base */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-base);
  padding: 8px 16px;
  transition: background-color var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  border: none;
  outline: none;
  line-height: 1;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Primary */
.btn-primary { background: var(--primary-600); color: var(--text-white); }
.btn-primary:hover:not(:disabled) { background: var(--primary-700); }
.btn-primary:focus-visible { box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent-ring); }

/* Primary Glow（强调型） */
.btn-primary-glow {
  background: var(--primary-500);
  color: var(--text-white);
  box-shadow: var(--shadow-glow);
}
.btn-primary-glow:hover:not(:disabled) {
  background: var(--primary-400);
  box-shadow: 0 0 20px rgba(99,102,241,0.4);
}

/* Secondary */
.btn-secondary {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-muted);
}
.btn-secondary:hover:not(:disabled) { background: var(--bg-surface-hover); }

/* Outline */
.btn-outline {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-base);
}
.btn-outline:hover:not(:disabled) { background: var(--bg-base); }

/* Danger */
.btn-danger { background: var(--color-danger); color: var(--text-white); }
.btn-danger:hover:not(:disabled) { background: var(--color-danger-hover); }
.btn-danger:focus-visible { box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--color-danger); }

/* Success */
.btn-success { background: var(--color-success); color: var(--text-white); }
.btn-success:hover:not(:disabled) { background: var(--color-success-hover); }

/* Warning */
.btn-warning { background: var(--color-warning); color: var(--text-white); }
.btn-warning:hover:not(:disabled) { background: var(--color-warning-hover); }

/* Ghost 系列 */
.btn-ghost-danger { background: transparent; color: var(--color-danger-text); }
.btn-ghost-danger:hover:not(:disabled) { background: var(--color-danger-bg); }
.btn-ghost-success { background: transparent; color: var(--color-success-text); }
.btn-ghost-success:hover:not(:disabled) { background: var(--color-success-bg); }
.btn-ghost-info { background: transparent; color: var(--color-info-text); }
.btn-ghost-info:hover:not(:disabled) { background: var(--color-info-bg); }

/* Size */
.btn-sm { padding: 6px 12px; font-size: var(--font-size-xs); }
.btn-lg { padding: 12px 24px; font-size: var(--font-size-base); }
.btn-icon { padding: 6px; border-radius: var(--radius-base); }
```

---

## 8. 表单体系

### 8.1 Input

| 属性 | 规范值 |
|------|--------|
| 高度 | `padding: 8px 12px`（约 38px） |
| 背景 | `var(--bg-base)` #1c1c1e |
| 边框 | `1px solid var(--border-input)` #3a3a3c |
| 圆角 | `var(--radius-base)` 8px |
| 文字色 | `var(--text-primary)` #e5e5e5 |
| Placeholder | `var(--text-placeholder)` #64748b |
| 聚焦边框 | `var(--accent)` #6366f1 |
| 聚焦 Ring | `box-shadow: 0 0 0 1px var(--accent)` |
| 禁用 | `opacity: 0.6; cursor: not-allowed; color: var(--text-placeholder)` |

### 8.2 Select

| 属性 | 规范值 |
|------|--------|
| 同 Input | — |
| 下拉箭头 | 自定义 SVG chevron（见 theme.css） |
| option 背景 | `var(--bg-surface)` #2c2c2e |
| option hover | `var(--bg-surface-hover)` #3a3a3c |
| option 文字 | `var(--text-primary)` #e5e5e5 |

### 8.3 Textarea

| 属性 | 规范值 |
|------|--------|
| 同 Input | — |
| resize | `none`（默认不可拉伸） |
| 代码型 | `font-family: var(--font-mono); font-size: var(--font-size-sm)` |

### 8.4 Checkbox / Radio

| 属性 | 规范值 |
|------|--------|
| accent-color | `var(--accent)` #6366f1 |
| 尺寸 | `16px × 16px` |

### 8.5 完整 CSS

```css
.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 8px 12px;
  background-color: var(--bg-base);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-base);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--text-placeholder);
}

.form-input:disabled,
.form-select:disabled,
.form-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  color: var(--text-placeholder);
}

.form-textarea { resize: none; }
.form-textarea--code { font-family: var(--font-mono); }

.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2371717A' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'%3e%3c/path%3e%3c/svg%3e");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.5em 1.5em;
  padding-right: 2.5rem;
}

.form-select option {
  color: var(--text-primary);
  background-color: var(--bg-surface);
}

.form-select option:hover,
.form-select option:checked {
  background-color: var(--bg-surface-hover);
}

.form-checkbox,
.form-radio {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}
```

---

## 9. 卡片体系

### 9.1 Variant

| Variant | 背景 | 边框 | 圆角 | Hover |
|---------|------|------|------|-------|
| **default** | `var(--bg-surface)` | `1px solid var(--border-muted)` | `var(--radius-lg)` 12px | 边框→base / 背景→zinc-800/50 |
| **surface** | `rgba(var(--bg-surface),0.5)` | `1px solid rgba(var(--border-muted),0.5)` | 12px | 同上 |
| **outline** | `transparent` | `1px solid var(--zinc-800)` | 12px | 同上 |
| **ghost** | `transparent` | `无边框` | 12px | — |

### 9.2 内部结构

| 区域 | Padding | Border |
|------|---------|--------|
| Card Header | `16px 20px → md:20px 24px` | `border-bottom: 1px solid var(--border-base)` |
| Card Content | `16px 20px → md:20px 24px` | — |
| Card Footer | `16px 20px → md:20px 24px` | `border-top: 1px solid var(--border-base)` |

### 9.3 MetricCard

| 属性 | 值 |
|------|-----|
| 背景 | `var(--bg-surface)` |
| 边框 | `1px solid rgba(39,39,42,0.5)` |
| 圆角 | `var(--radius-base)` 8px |
| Padding | `12px → md:16px` |
| 数值字号 | `20px → md:24px font-weight:700` |
| 标签字号 | `12px` |
| Icon 容器 | `32px × 32px rounded-lg bg-gradient-to-br from-{color}-500/20 to-blue-600/20` |

### 9.4 完整 CSS

```css
.card {
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-muted);
  box-shadow: var(--shadow-sm);
}

.card--hoverable {
  transition: border-color var(--transition-normal), background-color var(--transition-normal), box-shadow var(--transition-normal);
}
.card--hoverable:hover {
  border-color: var(--border-base);
  background-color: rgba(39, 39, 42, 0.5);
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 16px 20px;
}
.card-header--bordered { border-bottom: 1px solid var(--border-base); padding-bottom: 16px; margin-bottom: 16px; }
.card-header-title { font-size: 16px; font-weight: var(--font-weight-semibold); color: var(--text-heading); }
@media (min-width: 768px) { .card-header-title { font-size: 18px; } }

.card-content { padding: 16px 20px; }
@media (min-width: 768px) { .card-content { padding: 20px 24px; } }

.card-footer { padding: 16px 20px; }
```

---

## 10. 弹窗体系

### 10.1 结构参数

| 元素 | 样式 |
|------|------|
| **Overlay** | `fixed inset-0; background: var(--bg-overlay); backdrop-filter: blur(4px); z-index: 50` |
| **容器** | `background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); border: 1px solid var(--border-muted)` |
| **Header** | `padding: 16px 24px; border-bottom: 1px solid var(--border-muted)` |
| **标题** | `font-size: 18px; font-weight: 600; color: var(--text-heading)` |
| **关闭按钮** | `padding: 4px; color: var(--text-muted); border-radius: var(--radius-full)` hover→`color: var(--text-secondary); background: var(--zinc-700)` |
| **Body** | `flex:1; overflow-y:auto; padding: 24px` |
| **Footer** | `padding: 16px 24px; gap: 12px; border-top: 1px solid var(--border-muted); justify-content: flex-end` |

### 10.2 尺寸

| Size | max-width |
|------|-----------|
| **sm** | 448px |
| **md** | 512px |
| **lg** | 672px |
| **xl** | 896px |
| **full** | 90vw |

### 10.3 完整 CSS

```css
.modal-overlay {
  position: fixed; inset: 0;
  background-color: var(--bg-overlay);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 50; padding: 16px;
}

.modal-container {
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-muted);
  width: 100%; max-height: 90vh;
  display: flex; flex-direction: column;
}

.modal-sm  { max-width: 448px; }
.modal-md  { max-width: 512px; }
.modal-lg  { max-width: 672px; }
.modal-xl  { max-width: 896px; }
.modal-full { max-width: 90vw; }

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-muted);
}

.modal-header-title {
  font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--text-heading);
}

.modal-close {
  padding: 4px; color: var(--text-muted); border-radius: var(--radius-full);
  background: transparent; border: none; cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}
.modal-close:hover { color: var(--text-secondary); background-color: var(--zinc-700); }

.modal-body { flex: 1; overflow-y: auto; padding: 24px; }

.modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-muted);
}
```

---

## 11. 表格体系

### 11.1 核心参数

| 元素 | 样式 |
|------|------|
| **容器** | `border-radius: var(--radius-base); border: 1px solid var(--zinc-800); overflow-x:auto` |
| **thead** | `background: rgba(24,24,27,0.6); position: sticky; top:0; z-index:10` |
| **th** | `padding: 12px→md:16px 12px; font-size: 12px→md:14px; font-weight:600; color: var(--text-muted); uppercase; letter-spacing:0.05em` |
| **行分割** | `border-bottom: 1px solid var(--zinc-800)` |
| **td** | `padding: 12px→md:16px 12px; font-size: 14px→md:16px; color: var(--text-secondary)` |
| **行 hover** | `background: rgba(39,39,42,0.4); transition: background-color 150ms` |
| **可点击行** | `cursor: pointer` |
| **无斑马纹** | 仅分割线 + hover |

### 11.2 数据文字层级

| 层级 | 字号 | 字重 | 颜色 |
|------|------|------|------|
| 主数据 | 14px | 500 | `var(--text-primary)` |
| 辅助数据 | 14px | 400 | `var(--text-muted)` |
| 标题数据 | 14px | 600 | `var(--text-heading)` |

### 11.3 完整 CSS

```css
.table-container {
  width: 100%; border-radius: var(--radius-base);
  border: 1px solid var(--zinc-800);
  overflow-x: auto; overflow-y: hidden;
}

.table { width: 100%; border-collapse: collapse; }

.table-head {
  background-color: rgba(24, 24, 27, 0.6);
  position: sticky; top: 0; z-index: 10;
}

.table-head-cell {
  padding: 12px 16px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
}
@media (min-width: 768px) { .table-head-cell { font-size: var(--font-size-sm); } }

.table-row {
  border-bottom: 1px solid var(--zinc-800);
  transition: background-color var(--transition-fast);
}
.table-row--hoverable:hover { background-color: rgba(39, 39, 42, 0.4); }
.table-row--clickable { cursor: pointer; }

.table-cell {
  padding: 12px 16px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
@media (min-width: 768px) { .table-cell { font-size: var(--font-size-base); } }

/* 空状态 */
.table-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
}
```

---

## 12. 徽章与状态

### 12.1 Badge

| Variant | 背景 | 文字色 | 边框 |
|---------|------|--------|------|
| **cyan** | `rgba(6,182,212,0.15)` | `#22d3ee` | `rgba(6,182,212,0.2)` |
| **emerald** | `rgba(16,185,129,0.15)` | `#34d399` | `rgba(16,185,129,0.2)` |
| **amber** | `rgba(245,158,11,0.15)` | `#fbbf24` | `rgba(245,158,11,0.2)` |
| **rose** | `rgba(244,63,94,0.15)` | `#fb7185` | `rgba(244,63,94,0.2)` |
| **violet** | `rgba(139,92,246,0.15)` | `#a78bfa` | `rgba(139,92,246,0.2)` |
| **gray** | `rgba(63,63,70,0.5)` | `var(--text-muted)` | `var(--border-base)` |

| Size | Padding | Font Size |
|------|---------|-----------|
| **sm** | `2px 6px` | 10px |
| **md** | `4px 8px` | 12px |

### 12.2 StatusBadge（胶囊型）

| 状态 | 背景 | 文字色 |
|------|------|--------|
| **pending** | `var(--zinc-700)` | `var(--text-secondary)` |
| **running** | `rgba(30,64,175,0.3)` | `var(--color-info-text)` |
| **completed** | `rgba(16,185,129,0.15)` | `var(--color-success-text)` |
| **failed** | `rgba(244,63,94,0.15)` | `var(--color-danger-text)` |

```css
.badge {
  display: inline-flex; align-items: center;
  border-radius: var(--radius-sm); font-weight: var(--font-weight-medium);
  border: 1px solid transparent;
}
.badge-sm { padding: 2px 6px; font-size: 10px; }
.badge-md { padding: 4px 8px; font-size: var(--font-size-xs); }

.badge--cyan    { background: rgba(6,182,212,0.15); color: #22d3ee; border-color: rgba(6,182,212,0.2); }
.badge--emerald { background: rgba(16,185,129,0.15); color: #34d399; border-color: rgba(16,185,129,0.2); }
.badge--amber   { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.2); }
.badge--rose    { background: rgba(244,63,94,0.15); color: #fb7185; border-color: rgba(244,63,94,0.2); }
.badge--violet  { background: rgba(139,92,246,0.15); color: #a78bfa; border-color: rgba(139,92,246,0.2); }
.badge--gray    { background: rgba(63,63,70,0.5); color: var(--text-muted); border-color: var(--border-base); }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium); border-radius: var(--radius-full);
}
.status-badge--pending   { background: var(--zinc-700); color: var(--text-secondary); }
.status-badge--running   { background: rgba(30,64,175,0.3); color: var(--color-info-text); }
.status-badge--completed { background: rgba(16,185,129,0.15); color: var(--color-success-text); }
.status-badge--failed    { background: rgba(244,63,94,0.15); color: var(--color-danger-text); }
```

---

## 13. 提示与通知

### 13.1 Alert

| Type | 背景 | 边框 | 文字色 |
|------|------|------|--------|
| **danger** | `rgba(153,27,27,0.2)` | `rgba(153,27,27,0.4)` | `#f87171` |
| **success** | `rgba(20,83,45,0.2)` | `rgba(20,83,45,0.4)` | `#4ade80` |
| **warning** | `rgba(113,63,18,0.2)` | `rgba(113,63,18,0.4)` | `#fbbf24` |
| **info** | `rgba(30,64,175,0.2)` | `rgba(30,64,175,0.4)` | `#60a5fa` |

```css
.alert {
  padding: 16px 12px; border-radius: var(--radius-base);
  display: flex; align-items: flex-start; gap: 12px;
}
.alert--danger  { background: var(--color-danger-bg);  border: 1px solid var(--color-danger-border);  color: var(--color-danger-text); }
.alert--success { background: var(--color-success-bg); border: 1px solid var(--color-success-border); color: var(--color-success-text); }
.alert--warning { background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); color: var(--color-warning-text); }
.alert--info    { background: var(--color-info-bg);    border: 1px solid var(--color-info-border);    color: var(--color-info-text); }

.alert-title { font-weight: var(--font-weight-medium); margin-bottom: 4px; }
.alert-content { font-size: var(--font-size-sm); opacity: 0.9; }
```

### 13.2 Toast（推荐 react-hot-toast）

```js
// Toast 配置
import { Toaster } from 'react-hot-toast';

<Toaster
  position="top-right"
  toastOptions={{
    duration: 4000,
    style: {
      background: '#2c2c2e',
      color: '#e5e5e5',
      border: '1px solid #3a3a3c',
    },
    success: { style: { background: '#064e3b', border: '1px solid #059669' } },
    error:   { style: { background: '#7f1d1d', border: '1px solid #dc2626' } },
  }}
/>
```

---

## 14. Glass 效果

| Token | 值 |
|-------|-----|
| `.glass` | `background: rgba(44,44,46,0.8); backdrop-filter: blur(12px); border: 1px solid rgba(58,58,60,0.5)` |
| `.glass-strong` | `background: rgba(44,44,46,0.9); backdrop-filter: blur(16px); border: 1px solid rgba(58,58,60,0.8)` |

---

## 15. 滚动条

| 类型 | 宽度 | Track | Thumb | Thumb hover |
|------|------|-------|-------|-------------|
| **默认** | 6px | transparent | `rgba(161,161,170,0.2)` | `rgba(161,161,170,0.35)` |
| **Sidebar** | 4px | transparent | `rgba(161,161,170,0.15)` | `rgba(161,161,170,0.3)` |
| **Content** | 8px | `rgba(28,28,30,0.3)` | `rgba(161,161,170,0.4)` | `rgba(161,161,170,0.6)` |
| **Thin** | 4px | transparent | `rgba(161,161,170,0.15)` | — |
| **Hide** | 隐藏 | — | — | — |

---

## 16. 布局参数

| Token | 值 | 用途 |
|-------|-----|------|
| `--header-height` | 56px | Header 高度 |
| `--footer-height` | 48px | Footer 高度 |
| `--sidebar-collapsed` | 64px | Sidebar 折叠宽度 |
| `--sidebar-expanded` | 240px | Sidebar 展开宽度 |
| `--panel-sm` | 240px | 小面板宽度 |
| `--panel-md` | 320px | 中面板宽度 |
| `--panel-lg` | 400px | 大面板宽度 |

---

## 17. 响应式断点

| 断点 | 值 | 用途 |
|------|-----|------|
| `sm` | 640px | 手机横屏 |
| `md` | 768px | 平板竖屏 |
| `lg` | 1024px | 平板横屏 / 小桌面 |
| `xl` | 1280px | 标准桌面 |
| `2xl` | 1536px | 大桌面 |
| `3xl` | 1920px | 超大桌面 |
| `4xl` | 2560px | 4K 屏幕 |

---

## 18. 动画与过渡

### 18.1 Transition

| Token | 值 | 用途 |
|-------|-----|------|
| `--transition-fast` | `150ms ease` | color / background-color / border-color |
| `--transition-normal` | `200ms ease` | hover 效果 / all |
| `--transition-slow` | `300ms ease` | 侧边栏折叠 / slide-in |

### 18.2 Animation

| 名称 | Duration | 用途 |
|------|----------|------|
| `fadeIn` | 200ms ease-out | 元素出现 |
| `slideUp` | 300ms ease-out | 从下方滑入 |
| `slideInRight` | 300ms ease-out | 从右侧滑入 |
| `slideInLeft` | 300ms ease-out | 从左侧滑入 |
| `scaleIn` | 200ms ease-out | 缩放出现 |
| `spin` | — (CSS infinite) | Loading spinner |

---

## 19. Design Token 完整清单

```css
:root {
  /* ===== Background ===== */
  --bg-base:            #1c1c1e;
  --bg-surface:         #2c2c2e;
  --bg-surface-hover:   #3a3a3c;
  --bg-surface-alt:     #1c1c1e;
  --bg-overlay:         rgba(0, 0, 0, 0.6);
  --bg-glass:           rgba(44, 44, 46, 0.8);
  --bg-glass-strong:    rgba(44, 44, 46, 0.9);
  --bg-input:           #1c1c1e;

  /* ===== Border ===== */
  --border-base:        #3a3a3c;
  --border-light:       #2c2c2e;
  --border-muted:       rgba(58, 58, 60, 0.5);
  --border-subtle:      rgba(58, 58, 60, 0.4);
  --border-input:       #3a3a3c;
  --border-input-focus: #6366f1;

  /* ===== Text ===== */
  --text-primary:       #e5e5e5;
  --text-secondary:     #a1a1a3;
  --text-muted:         #7c7c7e;
  --text-placeholder:   #64748b;
  --text-heading:       #f5f5f5;
  --text-white:         #ffffff;

  /* ===== Primary (Indigo) ===== */
  --primary-50:         #eef2ff;
  --primary-100:        #e0e7ff;
  --primary-200:        #c7d2fe;
  --primary-300:        #a5b4fc;
  --primary-400:        #818cf8;
  --primary-500:        #6366f1;
  --primary-600:        #4f46e5;
  --primary-700:        #4338ca;
  --primary-800:        #3730a3;
  --primary-900:        #312e81;
  --primary-950:        #1e1b4b;

  /* ===== Accent ===== */
  --accent:             #6366f1;
  --accent-hover:       #818cf8;
  --accent-ring:        #6366f1;
  --accent-cyan:        #22d3ee;
  --accent-cyan-400:    #06b6d4;

  /* ===== Semantic Colors ===== */
  --color-danger:              #dc2626;
  --color-danger-hover:        #b91c1c;
  --color-danger-bg:           rgba(153, 27, 27, 0.2);
  --color-danger-border:       rgba(153, 27, 27, 0.4);
  --color-danger-text:         #f87171;

  --color-success:             #16a34a;
  --color-success-hover:       #15803d;
  --color-success-bg:          rgba(20, 83, 45, 0.2);
  --color-success-border:      rgba(20, 83, 45, 0.4);
  --color-success-text:        #4ade80;

  --color-warning:             #ca8a04;
  --color-warning-hover:       #a16207;
  --color-warning-bg:          rgba(113, 63, 18, 0.2);
  --color-warning-border:      rgba(113, 63, 18, 0.4);
  --color-warning-text:        #fbbf24;

  --color-info:                #2563eb;
  --color-info-hover:          #1d4ed8;
  --color-info-bg:             rgba(30, 64, 175, 0.2);
  --color-info-border:         rgba(30, 64, 175, 0.4);
  --color-info-text:           #60a5fa;

  /* ===== Zinc Neutral ===== */
  --zinc-950:           #09090B;
  --zinc-900:           #18181B;
  --zinc-800:           #27272A;
  --zinc-700:           #3F3F46;
  --zinc-600:           #52525B;
  --zinc-500:           #71717A;
  --zinc-400:           #A1A1AA;
  --zinc-300:           #D4D4D8;

  /* ===== Shadow ===== */
  --shadow-sm:          0 1px 2px 0 rgba(0, 0, 0, 0.2), 0 1px 3px 0 rgba(0, 0, 0, 0.15);
  --shadow-md:          0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.25);
  --shadow-lg:          0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.25);
  --shadow-xl:          0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
  --shadow-glow:        0 0 20px rgba(99, 102, 241, 0.15);
  --shadow-glow-strong: 0 0 30px rgba(99, 102, 241, 0.25);

  /* ===== Border Radius ===== */
  --radius-sm:          4px;
  --radius-md:          6px;
  --radius-base:        8px;
  --radius-lg:          12px;
  --radius-xl:          16px;
  --radius-full:        9999px;

  /* ===== Font ===== */
  --font-sans:          system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono:          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  --font-size-2xs:      10px;
  --font-size-xs:       12px;
  --font-size-sm:       14px;
  --font-size-base:     16px;
  --font-size-lg:       18px;
  --font-size-xl:       20px;
  --font-size-2xl:      24px;
  --font-size-3xl:      30px;
  --font-weight-normal:    400;
  --font-weight-medium:    500;
  --font-weight-semibold:  600;
  --font-weight-bold:      700;
  --line-height-normal:    1.5;
  --line-height-relaxed:   1.625;

  /* ===== Spacing ===== */
  --spacing-0:          0px;
  --spacing-0.5:        2px;
  --spacing-1:          4px;
  --spacing-1.5:        6px;
  --spacing-2:          8px;
  --spacing-3:          12px;
  --spacing-4:          16px;
  --spacing-5:          20px;
  --spacing-6:          24px;
  --spacing-8:          32px;
  --spacing-10:         40px;
  --spacing-12:         48px;

  /* ===== Layout ===== */
  --header-height:       56px;
  --footer-height:       48px;
  --sidebar-collapsed:   64px;
  --sidebar-expanded:    240px;
  --panel-sm:            240px;
  --panel-md:            320px;
  --panel-lg:            400px;

  /* ===== Transition ===== */
  --transition-fast:     150ms ease;
  --transition-normal:   200ms ease;
  --transition-slow:     300ms ease;
}
```

---

## 20. theme.css 完整文件

以下文件可直接复制到 React + Vite 项目中使用：

```css
/*
 * SecHPS Design System — theme.css
 * 
 * 适用：React + Vite 项目，配合 Tailwind CSS 或纯 CSS 使用
 * 风格：Dark-first Developer Tool UI
 * 版本：1.0.0
 */

/* ================================
   Design Tokens
   ================================ */

:root {
  /* ===== Background ===== */
  --bg-base:            #1c1c1e;
  --bg-surface:         #2c2c2e;
  --bg-surface-hover:   #3a3a3c;
  --bg-surface-alt:     #1c1c1e;
  --bg-overlay:         rgba(0, 0, 0, 0.6);
  --bg-glass:           rgba(44, 44, 46, 0.8);
  --bg-glass-strong:    rgba(44, 44, 46, 0.9);
  --bg-input:           #1c1c1e;

  /* ===== Border ===== */
  --border-base:        #3a3a3c;
  --border-light:       #2c2c2e;
  --border-muted:       rgba(58, 58, 60, 0.5);
  --border-subtle:      rgba(58, 58, 60, 0.4);
  --border-input:       #3a3a3c;
  --border-input-focus: #6366f1;

  /* ===== Text ===== */
  --text-primary:       #e5e5e5;
  --text-secondary:     #a1a1a3;
  --text-muted:         #7c7c7e;
  --text-placeholder:   #64748b;
  --text-heading:       #f5f5f5;
  --text-white:         #ffffff;

  /* ===== Primary (Indigo) ===== */
  --primary-50:         #eef2ff;
  --primary-100:        #e0e7ff;
  --primary-200:        #c7d2fe;
  --primary-300:        #a5b4fc;
  --primary-400:        #818cf8;
  --primary-500:        #6366f1;
  --primary-600:        #4f46e5;
  --primary-700:        #4338ca;
  --primary-800:        #3730a3;
  --primary-900:        #312e81;
  --primary-950:        #1e1b4b;

  /* ===== Accent ===== */
  --accent:             #6366f1;
  --accent-hover:       #818cf8;
  --accent-ring:        #6366f1;
  --accent-cyan:        #22d3ee;

  /* ===== Semantic Colors ===== */
  --color-danger:              #dc2626;
  --color-danger-hover:        #b91c1c;
  --color-danger-bg:           rgba(153, 27, 27, 0.2);
  --color-danger-border:       rgba(153, 27, 27, 0.4);
  --color-danger-text:         #f87171;

  --color-success:             #16a34a;
  --color-success-hover:       #15803d;
  --color-success-bg:          rgba(20, 83, 45, 0.2);
  --color-success-border:      rgba(20, 83, 45, 0.4);
  --color-success-text:        #4ade80;

  --color-warning:             #ca8a04;
  --color-warning-hover:       #a16207;
  --color-warning-bg:          rgba(113, 63, 18, 0.2);
  --color-warning-border:      rgba(113, 63, 18, 0.4);
  --color-warning-text:        #fbbf24;

  --color-info:                #2563eb;
  --color-info-hover:          #1d4ed8;
  --color-info-bg:             rgba(30, 64, 175, 0.2);
  --color-info-border:         rgba(30, 64, 175, 0.4);
  --color-info-text:           #60a5fa;

  /* ===== Zinc Neutral ===== */
  --zinc-950:           #09090B;
  --zinc-900:           #18181B;
  --zinc-800:           #27272A;
  --zinc-700:           #3F3F46;
  --zinc-600:           #52525B;
  --zinc-500:           #71717A;
  --zinc-400:           #A1A1AA;
  --zinc-300:           #D4D4D8;

  /* ===== Shadow ===== */
  --shadow-sm:          0 1px 2px 0 rgba(0, 0, 0, 0.2), 0 1px 3px 0 rgba(0, 0, 0, 0.15);
  --shadow-md:          0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.25);
  --shadow-lg:          0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.25);
  --shadow-xl:          0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
  --shadow-glow:        0 0 20px rgba(99, 102, 241, 0.15);
  --shadow-glow-strong: 0 0 30px rgba(99, 102, 241, 0.25);

  /* ===== Border Radius ===== */
  --radius-sm:          4px;
  --radius-md:          6px;
  --radius-base:        8px;
  --radius-lg:          12px;
  --radius-xl:          16px;
  --radius-full:        9999px;

  /* ===== Font ===== */
  --font-sans:          system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono:          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  --font-size-2xs:      10px;
  --font-size-xs:       12px;
  --font-size-sm:       14px;
  --font-size-base:     16px;
  --font-size-lg:       18px;
  --font-size-xl:       20px;
  --font-size-2xl:      24px;
  --font-size-3xl:      30px;
  --font-weight-normal:    400;
  --font-weight-medium:    500;
  --font-weight-semibold:  600;
  --font-weight-bold:      700;
  --line-height-normal:    1.5;
  --line-height-relaxed:   1.625;

  /* ===== Spacing ===== */
  --spacing-0:          0px;
  --spacing-0.5:        2px;
  --spacing-1:          4px;
  --spacing-1.5:        6px;
  --spacing-2:          8px;
  --spacing-3:          12px;
  --spacing-4:          16px;
  --spacing-5:          20px;
  --spacing-6:          24px;
  --spacing-8:          32px;
  --spacing-10:         40px;
  --spacing-12:         48px;

  /* ===== Layout ===== */
  --header-height:       56px;
  --footer-height:       48px;
  --sidebar-collapsed:   64px;
  --sidebar-expanded:    240px;
  --panel-sm:            240px;
  --panel-md:            320px;
  --panel-lg:            400px;

  /* ===== Transition ===== */
  --transition-fast:     150ms ease;
  --transition-normal:   200ms ease;
  --transition-slow:     300ms ease;
}

/* ================================
   Base Reset
   ================================ */

html, body {
  height: 100%;
  overflow-x: hidden;
}

body {
  font-family: var(--font-sans);
  color: var(--text-primary);
  background-color: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: var(--line-height-normal);
}

/* ================================
   Typography
   ================================ */

h1 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
  letter-spacing: -0.01em;
}
@media (min-width: 768px) { h1 { font-size: var(--font-size-2xl); } }
@media (min-width: 1024px) { h1 { font-size: var(--font-size-3xl); } }

h2 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
}
@media (min-width: 768px) { h2 { font-size: var(--font-size-xl); } }

h3 {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
}
@media (min-width: 768px) { h3 { font-size: var(--font-size-lg); } }

h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
}
@media (min-width: 768px) { h4 { font-size: var(--font-size-base); } }

p {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}
@media (min-width: 768px) { p { font-size: var(--font-size-base); } }

/* ================================
   Buttons
   ================================ */

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-base);
  padding: var(--spacing-2) var(--spacing-4);
  transition: background-color var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  border: none;
  outline: none;
  line-height: 1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary-600);
  color: var(--text-white);
}
.btn-primary:hover:not(:disabled) { background-color: var(--primary-700); }
.btn-primary:focus-visible { box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent-ring); }

.btn-primary-glow {
  background-color: var(--primary-500);
  color: var(--text-white);
  box-shadow: var(--shadow-glow);
}
.btn-primary-glow:hover:not(:disabled) {
  background-color: var(--primary-400);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
}

.btn-secondary {
  background-color: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-muted);
}
.btn-secondary:hover:not(:disabled) { background-color: var(--bg-surface-hover); }

.btn-outline {
  background-color: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-base);
}
.btn-outline:hover:not(:disabled) { background-color: var(--bg-base); }

.btn-danger {
  background-color: var(--color-danger);
  color: var(--text-white);
}
.btn-danger:hover:not(:disabled) { background-color: var(--color-danger-hover); }
.btn-danger:focus-visible { box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--color-danger); }

.btn-success {
  background-color: var(--color-success);
  color: var(--text-white);
}
.btn-success:hover:not(:disabled) { background-color: var(--color-success-hover); }

.btn-warning {
  background-color: var(--color-warning);
  color: var(--text-white);
}
.btn-warning:hover:not(:disabled) { background-color: var(--color-warning-hover); }
.btn-warning:focus-visible { box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--color-warning); }

.btn-ghost-danger {
  background-color: transparent;
  color: var(--color-danger-text);
}
.btn-ghost-danger:hover:not(:disabled) { background-color: var(--color-danger-bg); }

.btn-ghost-success {
  background-color: transparent;
  color: var(--color-success-text);
}
.btn-ghost-success:hover:not(:disabled) { background-color: var(--color-success-bg); }

.btn-ghost-info {
  background-color: transparent;
  color: var(--color-info-text);
}
.btn-ghost-info:hover:not(:disabled) { background-color: var(--color-info-bg); }

.btn-sm { padding: var(--spacing-1.5) var(--spacing-3); font-size: var(--font-size-xs); }
.btn-lg { padding: var(--spacing-3) var(--spacing-6); font-size: var(--font-size-base); }
.btn-icon { padding: var(--spacing-1.5); border-radius: var(--radius-base); }

/* ================================
   Form Controls
   ================================ */

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: var(--spacing-3) var(--spacing-3);
  background-color: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-base);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--text-placeholder);
}

.form-input:disabled,
.form-select:disabled,
.form-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  color: var(--text-placeholder);
}

.form-textarea { resize: none; }
.form-textarea--code { font-family: var(--font-mono); }

.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2371717A' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'%3e%3c/path%3e%3c/svg%3e");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.5em 1.5em;
  padding-right: 2.5rem;
}

.form-select option {
  color: var(--text-primary);
  background-color: var(--bg-surface);
}

.form-select option:hover,
.form-select option:checked {
  background-color: var(--bg-surface-hover);
}

.form-checkbox,
.form-radio {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

/* ================================
   Cards
   ================================ */

.card {
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-muted);
  box-shadow: var(--shadow-sm);
}

.card--hoverable {
  transition: border-color var(--transition-normal), background-color var(--transition-normal), box-shadow var(--transition-normal);
}

.card--hoverable:hover {
  border-color: var(--border-base);
  background-color: rgba(39, 39, 42, 0.5);
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-5);
}

.card-header--bordered {
  border-bottom: 1px solid var(--border-base);
  padding-bottom: var(--spacing-4);
  margin-bottom: var(--spacing-4);
}

.card-header-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
}
@media (min-width: 768px) { .card-header-title { font-size: var(--font-size-lg); } }

.card-header-description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.card-content {
  padding: var(--spacing-4) var(--spacing-5);
}
@media (min-width: 768px) { .card-content { padding: var(--spacing-5) var(--spacing-6); } }

.card-footer {
  padding: var(--spacing-4) var(--spacing-5);
}

.metric-card {
  padding: var(--spacing-3) var(--spacing-4);
  border: 1px solid rgba(39, 39, 42, 0.5);
  border-radius: var(--radius-base);
  background-color: var(--bg-surface);
}
@media (min-width: 768px) { .metric-card { padding: var(--spacing-4) var(--spacing-5); } }

.metric-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-heading);
}
@media (min-width: 768px) { .metric-value { font-size: var(--font-size-2xl); } }

.metric-label {
  font-size: var(--font-size-xs);
  margin-top: 2px;
}

/* ================================
   Modal / Dialog
   ================================ */

.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: var(--bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: var(--spacing-4);
}

.modal-container {
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-muted);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-sm  { max-width: 448px; }
.modal-md  { max-width: 512px; }
.modal-lg  { max-width: 672px; }
.modal-xl  { max-width: 896px; }
.modal-full { max-width: 90vw; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-6);
  border-bottom: 1px solid var(--border-muted);
}

.modal-header-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-heading);
}

.modal-close {
  padding: var(--spacing-1);
  color: var(--text-muted);
  border-radius: var(--radius-full);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.modal-close:hover {
  color: var(--text-secondary);
  background-color: var(--zinc-700);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-6);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-6);
  border-top: 1px solid var(--border-muted);
}

/* ================================
   Alert
   ================================ */

.alert {
  padding: var(--spacing-4) var(--spacing-4);
  border-radius: var(--radius-base);
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
}

.alert--danger  { background: var(--color-danger-bg);  border: 1px solid var(--color-danger-border);  color: var(--color-danger-text); }
.alert--success { background: var(--color-success-bg); border: 1px solid var(--color-success-border); color: var(--color-success-text); }
.alert--warning { background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); color: var(--color-warning-text); }
.alert--info    { background: var(--color-info-bg);    border: 1px solid var(--color-info-border);    color: var(--color-info-text); }

.alert-title {
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-1);
}

.alert-content {
  font-size: var(--font-size-sm);
  opacity: 0.9;
}

.alert-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

/* ================================
   Badge
   ================================ */

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
  border: 1px solid transparent;
}

.badge-sm { padding: var(--spacing-0.5) var(--spacing-1.5); font-size: var(--font-size-2xs); }
.badge-md { padding: var(--spacing-1) var(--spacing-2);     font-size: var(--font-size-xs); }

.badge--cyan    { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border-color: rgba(6, 182, 212, 0.2); }
.badge--emerald { background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.2); }
.badge--amber   { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.2); }
.badge--rose    { background: rgba(244, 63, 94, 0.15);  color: #fb7185; border-color: rgba(244, 63, 94, 0.2); }
.badge--violet  { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border-color: rgba(139, 92, 246, 0.2); }
.badge--gray    { background: rgba(63, 63, 70, 0.5);   color: var(--text-muted); border-color: var(--border-base); }

/* ================================
   Status Badge
   ================================ */

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: var(--spacing-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-full);
}

.status-badge--pending   { background: var(--zinc-700);           color: var(--text-secondary); }
.status-badge--running   { background: rgba(30, 64, 175, 0.3);   color: var(--color-info-text); }
.status-badge--completed { background: rgba(16, 185, 129, 0.15); color: var(--color-success-text); }
.status-badge--failed    { background: rgba(244, 63, 94, 0.15);  color: var(--color-danger-text); }

/* ================================
   Table
   ================================ */

.table-container {
  width: 100%;
  border-radius: var(--radius-base);
  border: 1px solid var(--zinc-800);
  overflow-x: auto;
  overflow-y: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table-head {
  background-color: rgba(24, 24, 27, 0.6);
  position: sticky;
  top: 0;
  z-index: 10;
}

.table-head-cell {
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
}
@media (min-width: 768px) { .table-head-cell { font-size: var(--font-size-sm); } }

.table-row {
  border-bottom: 1px solid var(--zinc-800);
  transition: background-color var(--transition-fast);
}

.table-row--hoverable:hover {
  background-color: rgba(39, 39, 42, 0.4);
}

.table-row--clickable {
  cursor: pointer;
}

.table-cell {
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
@media (min-width: 768px) { .table-cell { font-size: var(--font-size-base); } }

.table-empty {
  padding: var(--spacing-8);
  text-align: center;
  color: var(--text-muted);
}

/* ================================
   Glass Effect
   ================================ */

.glass {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-muted);
}

.glass-strong {
  background: var(--bg-glass-strong);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(58, 58, 60, 0.8);
}

/* ================================
   Loading
   ================================ */

.spinner {
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

.spinner-sm  { width: 16px; height: 16px; border: 2px solid transparent; border-top-color: var(--primary-500); }
.spinner-md  { width: 24px; height: 24px; border: 2px solid transparent; border-bottom-color: var(--primary-500); }
.spinner-lg  { width: 32px; height: 32px; border: 2px solid transparent; border-bottom-color: var(--primary-500); }
.spinner-xl  { width: 48px; height: 48px; border: 2px solid transparent; border-top-color: var(--primary-500); border-bottom-color: var(--primary-500); }

.spinner-white { border-top-color: var(--text-white); border-bottom-color: var(--text-white); }

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 17, 32, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10;
  border-radius: var(--radius-base);
}

.loading-overlay--fullscreen {
  position: fixed;
  inset: 0;
  background-color: rgba(11, 17, 32, 0.8);
  backdrop-filter: blur(4px);
  z-index: 50;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ================================
   Scrollbar
   ================================ */

.scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar::-webkit-scrollbar-track { background: transparent; }
.scrollbar::-webkit-scrollbar-thumb { background-color: rgba(161, 161, 170, 0.2); border-radius: 3px; }
.scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(161, 161, 170, 0.35); }
.scrollbar { scrollbar-width: thin; scrollbar-color: rgba(161, 161, 170, 0.2) transparent; }

.scrollbar-sidebar::-webkit-scrollbar { width: 4px; }
.scrollbar-sidebar::-webkit-scrollbar-track { background: transparent; }
.scrollbar-sidebar::-webkit-scrollbar-thumb { background-color: rgba(161, 161, 170, 0.15); }
.scrollbar-sidebar::-webkit-scrollbar-thumb:hover { background-color: rgba(161, 161, 170, 0.3); }
.scrollbar-sidebar { scrollbar-width: thin; scrollbar-color: rgba(161, 161, 170, 0.15) transparent; }

.scrollbar-content::-webkit-scrollbar { width: 8px; }
.scrollbar-content::-webkit-scrollbar-track { background: rgba(28, 28, 30, 0.3); border-radius: 4px; }
.scrollbar-content::-webkit-scrollbar-thumb { background-color: rgba(161, 161, 170, 0.4); border-radius: 4px; }
.scrollbar-content::-webkit-scrollbar-thumb:hover { background-color: rgba(161, 161, 170, 0.6); }
.scrollbar-content { scrollbar-width: auto; scrollbar-color: rgba(161, 161, 170, 0.4) rgba(28, 28, 30, 0.3); }

.scrollbar-thin::-webkit-scrollbar { width: 4px; height: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background-color: rgba(161, 161, 170, 0.15); }

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* ================================
   Animations
   ================================ */

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

@keyframes slideInLeft {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.animate-fade-in       { animation: fadeIn 0.2s ease-out; }
.animate-slide-up      { animation: slideUp 0.3s ease-out; }
.animate-slide-in-right { animation: slideInRight 0.3s ease-out; }
.animate-slide-in-left  { animation: slideInLeft 0.3s ease-out; }
.animate-scale-in      { animation: scaleIn 0.2s ease-out; }

/* ================================
   Responsive Helpers
   ================================ */

@media (max-width: 640px) {
  .mobile-full-width { width: 100%; max-width: none; }
  .mobile-stack { flex-direction: column; gap: var(--spacing-3); }
  .mobile-hide  { display: none; }
}

@media (min-width: 641px) and (max-width: 1024px) {
  .tablet-hide { display: none; }
}

@media (min-width: 1025px) {
  .desktop-hide { display: none; }
}

@media (min-width: 1536px) {
  .ultra-wide-max-width { max-width: 1280px; margin-left: auto; margin-right: auto; }
}

@media (min-width: 1920px) {
  .xxl-max-width { max-width: 1440px; margin-left: auto; margin-right: auto; }
}

@media (min-width: 2560px) {
  .xxxl-max-width { max-width: 1600px; margin-left: auto; margin-right: auto; }
}
```

---

## 使用指南

### 纯 CSS 项目

1. 复制 `theme.css` 到项目 `src/styles/theme.css`
2. 在入口文件引入：`import './styles/theme.css'`
3. 使用 CSS 类名：`<button class="btn btn-primary">创建</button>`

### Tailwind CSS 项目

1. 复制 `:root` 变量块到 `globals.css`
2. 在 `tailwind.config.ts` 中映射变量：

```ts
// tailwind.config.ts
const config: Config = {
  theme: {
    extend: {
      colors: {
        dark: {
          bg:            'var(--bg-base)',
          surface:       'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          border:        'var(--border-base)',
          text:          'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          'text-muted':  'var(--text-muted)',
        },
        primary: {
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
        },
      },
      borderRadius: {
        card:   'var(--radius-lg)',
        panel:  'var(--radius-xl)',
      },
      boxShadow: {
        glow:        'var(--shadow-glow)',
        'glow-strong': 'var(--shadow-glow-strong)',
        card:        'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
      },
    },
  },
};
```

3. 组件中使用 Tailwind 类名：`<button className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2">`

### CSS-in-JS 项目（styled-components / emotion）

```tsx
// 引入变量后在 styled 中引用
const Button = styled.button`
  background-color: var(--primary-600);
  color: var(--text-white);
  padding: var(--spacing-2) var(--spacing-4);
  border-radius: var(--radius-base);
  &:hover { background-color: var(--primary-700); }
`;
```
