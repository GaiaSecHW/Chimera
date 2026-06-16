---
version: alpha
name: LOKI-Agent-Testing-Console-design-analysis
description: A dark agent-testing and security-analysis console for LOKI. The interface uses a fixed navy sidebar, blue primary actions, dense tables and cards, graph-heavy threat workflows, and a white report-preview surface inside an otherwise near-black shell.

colors:
  primary: "#4f73ff"
  primary-soft: "#7590ff"
  primary-deep: "#3f63f1"
  primary-muted: "rgba(79, 115, 255, 0.14)"
  canvas: "#070d18"
  surface: "#111a2b"
  surface-raised: "#18233a"
  surface-glass: "rgba(17, 26, 43, 0.84)"
  sidebar: "#0d1526"
  border: "#26324a"
  border-soft: "#1b2438"
  ink: "#f5f7ff"
  ink-soft: "#d6def0"
  body: "#a4aec4"
  muted: "#72809a"
  muted-soft: "#8b95a8"
  success: "#45c06f"
  warning: "#d5a13a"
  error: "#f15d5d"
  info: "#4f8cff"
  critical: "#ff4d4f"
  high: "#ff8b3d"
  medium: "#f0b64c"
  low: "#49c5ff"
  paper: "#ffffff"
  paper-ink: "#0f172a"
  paper-muted: "#50607a"
  paper-border: "#d7deea"
  paper-accent: "#2d5bff"

typography:
  display-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.4px
  title-lg:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.2px
  title-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  title-sm:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
  body-md:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
  body-sm:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  nav-label:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
  nav-nested:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  caption:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code-xs:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
    fontSize: 11px
    fontWeight: 400
    lineHeight: 16px
  code-sm:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
  button-sm:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px

rounded:
  xs: 4px
  sm: 8px
  md: 10px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  sidebar-expanded: 240px
  sidebar-collapsed: 56px

components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body-md}"
  sidebar-expanded:
    backgroundColor: "{colors.sidebar}"
    borderColor: "{colors.border}"
    width: "{spacing.sidebar-expanded}"
  sidebar-collapsed:
    backgroundColor: "{colors.sidebar}"
    borderColor: "{colors.border}"
    width: "{spacing.sidebar-collapsed}"
  nav-group:
    backgroundColor: transparent
    textColor: "{colors.muted-soft}"
    typography: "{typography.caption}"
    padding: "{spacing.md} {spacing.lg} {spacing.xs}"
  nav-row:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.nav-label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    iconSize: 16px
  nav-row-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary-soft}"
    rounded: "{rounded.md}"
  nav-row-active:
    backgroundColor: "{colors.primary-muted}"
    textColor: "{colors.primary}"
    borderColor: "{colors.primary}"
    rounded: "{rounded.md}"
  nav-nested:
    borderColor: "{colors.border-soft}"
    typography: "{typography.nav-nested}"
    padding: "{spacing.xs} 0 {spacing.xs} {spacing.lg}"
  page-header:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    padding: "{spacing.xl} {spacing.2xl}"
  toolbar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-soft}"
    padding: "0 {spacing.2xl} {spacing.lg}"
  panel:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  panel-compact:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border-soft}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.lg}"
  data-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
  data-table-header:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted-soft}"
    typography: "{typography.caption}"
    padding: "{spacing.sm} {spacing.md}"
  data-table-cell:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.sm} {spacing.md}"
    borderColor: "{colors.border-soft}"
  project-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  source-card:
    backgroundColor: "rgba(79, 115, 255, 0.06)"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border-soft}"
    borderLeftColor: "{colors.primary}"
    borderLeftWidth: 3px
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  sink-card:
    backgroundColor: "rgba(255, 139, 61, 0.06)"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border-soft}"
    borderLeftColor: "{colors.high}"
    borderLeftWidth: 3px
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  graph-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  findings-rail:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  detail-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  severity-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.sm}"
  status-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.body}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.sm}"
  status-chip-success:
    backgroundColor: "rgba(69, 192, 111, 0.14)"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
  status-chip-warning:
    backgroundColor: "rgba(213, 161, 58, 0.14)"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
  status-chip-error:
    backgroundColor: "rgba(241, 93, 93, 0.14)"
    textColor: "{colors.error}"
    rounded: "{rounded.pill}"
  text-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  select:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  toggle:
    backgroundColor: "{colors.surface-raised}"
    activeColor: "{colors.primary}"
    rounded: "{rounded.pill}"
  tabs:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.button-sm}"
    borderBottomColor: transparent
    borderBottomWidth: 2px
  tabs-active:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    borderBottomColor: "{colors.primary}"
    borderBottomWidth: 2px
  upload-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  upload-dropzone:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted-soft}"
    borderColor: "{colors.border}"
    borderStyle: dashed
    rounded: "{rounded.lg}"
    padding: "{spacing.3xl}"
  modal-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  terminal-panel:
    backgroundColor: "#050505"
    textColor: "#e7e7e7"
    borderColor: "#ff5a49"
    typography: "{typography.code-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  report-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    borderColor: "{colors.paper-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.3xl}"
---

## Overview

LOKI is an internal agent-testing and security-analysis console, not a marketing site. The visual system is a dark, dense workspace with a fixed left sidebar, page-scoped headers, and blue primary actions. Most screens feel closer to a security operations console than a consumer SaaS dashboard.

The interface is Chinese-first in labels and workflows, but it keeps English technical tokens where they help scanning: `Source`, `Sink`, `LLM`, `JSON`, `PDF`, `Agent`, `CVSS`, `RCE`, and model names. The tiny violet app mark is decorative; the operational accent is blue. That blue is used for navigation selection, primary actions, active tabs, and focus states.

**Key Characteristics:**
- Fixed dark sidebar organized into labeled section groups, with a brand block pinned to the top and a user-profile block to the bottom.
- Page headers pair a title, a short explanatory subtitle, and a right-aligned action cluster.
- Dense dark cards, tables, chips, and dialogs sit on a near-black canvas with hairline borders.
- Security views rely on graphs, severity chips, and split-panel inspector layouts.
- Report output deliberately flips to a white paper preview inside the dark shell.
- The UI uses nested scroll regions and compact controls rather than large empty white space.

## Colors

### Brand & Action
- **Primary Blue** (`{colors.primary}` — `#4f73ff`): The main action signal for buttons, active tabs, focused inputs, and selected navigation.
- **Primary Soft** (`{colors.primary-soft}` — `#7590ff`): Hover emphasis and secondary blue highlights.
- **Primary Deep** (`{colors.primary-deep}` — `#3f63f1`): Focus borders and stronger active-state blue.
- **Primary Muted** (`{colors.primary-muted}`): Low-alpha fill behind selected nav rows and subtle active states.

### Surface
- **Canvas** (`{colors.canvas}` — `#070d18`): The app background.
- **Sidebar** (`{colors.sidebar}` — `#0d1526`): The fixed left rail and brand block.
- **Surface** (`{colors.surface}` — `#111a2b`): Default panel and card fill.
- **Surface Raised** (`{colors.surface-raised}` — `#18233a`): Inputs, headers, active tabs, and hover rows.
- **Surface Glass** (`{colors.surface-glass}`): Slightly translucent dark fill for larger panels and modals.
- **Border** (`{colors.border}` — `#26324a`): Primary panel and shell border.
- **Border Soft** (`{colors.border-soft}` — `#1b2438`): Secondary separators, row dividers, and inner rails.

### Text
- **Ink** (`{colors.ink}` — `#f5f7ff`): Strong headings and selected labels.
- **Ink Soft** (`{colors.ink-soft}` — `#d6def0`): Default text on dark surfaces.
- **Body** (`{colors.body}` — `#a4aec4`): Secondary labels and table content.
- **Muted** (`{colors.muted}` — `#72809a`): Dim helper text and lower-priority metadata.
- **Muted Soft** (`{colors.muted-soft}` — `#8b95a8`): Captions, group labels, and disabled hints.

### Semantic
- **Success** (`{colors.success}` — `#45c06f`): Enabled, running, passed, or healthy states.
- **Warning** (`{colors.warning}` — `#d5a13a`): Needs attention, pending, or partial states.
- **Error** (`{colors.error}` — `#f15d5d`): Failed, destructive, or invalid states.
- **Info** (`{colors.info}` — `#4f8cff`): Informational emphasis and secondary system cues.
- **Critical** (`{colors.critical}` — `#ff4d4f`): Severe vulnerabilities and top-priority findings.
- **High** (`{colors.high}` — `#ff8b3d`): High-risk security findings.
- **Medium** (`{colors.medium}` — `#f0b64c`): Medium-risk security findings.
- **Low** (`{colors.low}` — `#49c5ff`): Low-risk or informational findings.

### Paper Preview
- **Paper** (`{colors.paper}` — `#ffffff`): The report preview surface.
- **Paper Ink** (`{colors.paper-ink}` — `#0f172a`): Report title and body text.
- **Paper Muted** (`{colors.paper-muted}` — `#50607a`): Report metadata and caption text.
- **Paper Border** (`{colors.paper-border}` — `#d7deea`): Rules and page framing.
- **Paper Accent** (`{colors.paper-accent}` — `#2d5bff`): Blue rules and report emphasis.

## Typography

### Font Family
The app uses a restrained system-sans stack for almost everything:
1. **System sans** for navigation, headers, buttons, forms, tables, and cards.
2. **System mono** for JSON, code snippets, console output, IDs, and model tokens.

The document/report preview keeps the same general sans tone, but with more breathing room and stronger hierarchy. Keep the main product typography compact; the interface is operational, not promotional.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-md}` | 24px | 600 | 32px | Page title / workspace title. |
| `{typography.title-lg}` | 18px | 600 | 28px | Modal or panel title. |
| `{typography.title-md}` | 16px | 600 | 24px | Card title, section heading. |
| `{typography.title-sm}` | 14px | 600 | 20px | Field labels and compact headings. |
| `{typography.body-md}` | 14px | 400 | 22px | Default body copy. |
| `{typography.body-sm}` | 13px | 400 | 20px | Dense tables, helper copy, and summaries. |
| `{typography.nav-label}` | 13px | 500 | 18px | Primary sidebar navigation. |
| `{typography.nav-nested}` | 12px | 500 | 16px | Secondary or nested nav items. |
| `{typography.caption}` | 12px | 400 | 16px | Chips, helper labels, and metadata. |
| `{typography.code-xs}` | 11px | 400 | 16px | Tiny IDs and technical fragments. |
| `{typography.code-sm}` | 12px | 400 | 18px | JSON snippets, console text, and logs. |
| `{typography.button-sm}` | 13px | 500 | 18px | Buttons and compact actions. |

## Layout

### App Shell
The shell is a fixed left sidebar plus a fluid content area. The sidebar is about 240 px wide, uses a darker floor than the main canvas, and ends with a user profile block at the bottom. The main content stays full-height and is organized page by page rather than through a global top navigation.

### Page Headers
Most pages use the same header rhythm: title, one-line subtitle, then a right-aligned action group. Top-level actions live in the upper-right, often with a primary blue button and a secondary dark button or icon control.

### Content Density
- Page padding: `{spacing.xl}` to `{spacing.2xl}` around headers and panels.
- Panel padding: `{spacing.lg}` for standard cards, `{spacing.md}` for compact operational blocks.
- Tables are dense: 12–13 px text, compact vertical cell padding, soft row dividers.
- Filters, stat cards, and action buttons sit in tight horizontal toolbars above content.
- Long lists and logs scroll inside the page body or a fixed-height side rail.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Level 0 — App Floor | `{colors.canvas}` with no shadow. | Body background and shell base. |
| Level 1 — Panel | `{colors.surface}` plus 1 px `{colors.border}`. | Cards, tables, side rails, and summary blocks. |
| Level 2 — Raised Control | `{colors.surface-raised}` plus a soft border. | Inputs, headers, hover rows, and selected tabs. |
| Level 3 — Floating | `{colors.surface}` plus stronger border and backdrop. | Modals and focus overlays. |
| Level 4 — Paper | `{colors.paper}` with `paper-border`. | PDF preview and export output. |

Depth comes from small shifts in fill and border contrast, not from heavy shadow. Keep the stack flat and readable.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Tiny code chips and micro controls. |
| `{rounded.sm}` | 8px | Small buttons and inline controls. |
| `{rounded.md}` | 10px | Navigation rows and compact inputs. |
| `{rounded.lg}` | 12px | Panels, cards, tables, and graph containers. |
| `{rounded.xl}` | 16px | Modals and larger floating surfaces. |
| `{rounded.pill}` | 9999px | Status chips, severity chips, and tabs. |

## Components

### Navigation

**`sidebar-expanded`** — Fixed left workspace rail.
- `{colors.sidebar}` background, `{colors.border}` right border, roughly `240px` wide.

**`nav-group`** — Sidebar section label.
- Small muted label with tight spacing above grouped items.

**`nav-row`** — Primary navigation item.
- 16 px icon, 13 px label, rounded `10px`, compact vertical rhythm.

**`nav-row-hover`** — Hover state for navigation.
- Subtle lift into `{colors.surface-raised}` with brighter blue text.

**`nav-row-active`** — Current page highlight.
- Low-alpha blue fill, blue text, and a clear selected-state border.

**`nav-nested`** — Secondary nav item under a group.
- Slightly smaller label and tighter indent; keep it visibly subordinate.

### Tables & Cards

**`data-table`** — Dense management table.
- Dark surface fill, hairline border, compact row height, and a muted header strip.

**`stat-card`** — Top-of-page metric tile.
- Compact card with a large number-first figure over a small caption label. The figure is color-coded to its category, so a row of tiles reads as an at-a-glance summary band.

**`project-card`** — Project runtime tile.
- Status chip, name, and metadata rows with an inline run/stop control. Below sits a fixed row of pipeline phase tags, each colored by completion state (neutral when not started, blue when running, green when complete), plus the model binding and source path in muted mono.

**`panel`** — Default dark container.
- Slightly translucent fill, 12 px radius, and 16 px padding.

**`panel-compact`** — Condensed container for dense content.
- Used for catalog lists, tags, and small content blocks.

### Security Taxonomy

**`source-card`** — Blue-accent observable input card.
- Thin blue left-border accent (3 px), very faint blue tint background, standard hairline border on the other three sides. Used for observable agent inputs. In the catalog these carry a colored severity score in the top-right and a row of compact monospace metric chips (CVSS-style vector notation).

**`sink-card`** — Warm-accent risky output card.
- Thin amber/orange left-border accent (3 px), very faint warm tint background. Used for risky agent actions and side effects — the warm accent visually pairs against the blue source card to signal the source→sink risk relationship.

**`severity-chip`** — Finding priority indicator.
- Pill-shaped, high-contrast, and used for `CRITICAL`, `HIGH`, `MEDIUM`, and `LOW` labels.

### Controls

**`tabs`** and **`tabs-active`** — Underline-style tabs.
- Tabs sit on a transparent background with a 2 px bottom border. Inactive tabs use `{colors.body}` text and a transparent border; the active tab uses `{colors.primary}` text and a 2 px `{colors.primary}` underline. No pill shape.

**`button-primary`** — Main action.
- Blue fill, white text, compact padding, and small radius.

**`button-secondary`** — Default action.
- Dark fill with a hairline border.

**`button-ghost`** — Utility action.
- Transparent until hover; used for icon buttons, refresh, and less important controls.

**`text-input`** and **`select`** — Form controls.
- Raised dark fill, clear blue focus treatment, and 13 px text.

**`toggle`** — Binary configuration switch.
- Small, dark, and blue when active.

### Modal & Import Flow

**`modal-panel`** — Create/edit dialog.
- Floating dark panel, rounded `16px`, centered stage, and clear footer actions.

**`upload-card`** — Import method selector.
- Three-option choice surface for zip upload, folder upload, or Git repository import.

**`upload-dropzone`** — Drag-and-drop target.
- Dashed border, muted helper copy, and generous inner padding.

### Analysis & Output

**`graph-canvas`** — Threat-analysis graph surface.
- Full-bleed dark canvas with connector lines, zoom controls, and a right-side result rail.

**`findings-rail`** — Severity list panel.
- Stacked cards with risk labels, scores, and summary text.

**`detail-panel`** — Expanded evidence or trace panel.
- Used for selected items requiring deeper inspection — trace output, extracted evidence, or generated explanations.

**`terminal-panel`** — Console-style runtime preview.
- Near-black fill, monospace text, and a strong red outline for high-visibility runtime output.

**`report-sheet`** — Print-style output page.
- White paper surface with blue rules, black typography, and generous page margins.

## Interactions

- Use smooth transitions for navigation selection, tab switches, hover states, and modal entry.
- Keep primary actions in the upper-right of the page header.
- Prefer border and fill changes over shadow animation.
- Active state should be obvious but not loud; blue fill is enough.
- Security severity should be legible at a glance, with chips driving prioritization.
- Graph selection should update the inspector or detail panel without leaving the page.
- Internal scrollbars are acceptable for long rails, catalogs, and logs.
- The report preview should feel printable and static, not like another dark dashboard card.

## Do's and Don'ts

### Do
- Use `{colors.canvas}` as the app floor and `{colors.surface}` / `{colors.surface-raised}` for layered chrome.
- Keep the sidebar fixed and information-dense.
- Use blue for action, green for success, amber for caution, and red for danger.
- Build with cards, tables, chips, and graph surfaces instead of open whitespace.
- Keep the paper preview visually separate from the rest of the console.

### Don't
- Don't introduce a light theme anywhere except the report preview.
- Don't replace the left sidebar with a top navigation bar.
- Don't use purple as the main action color; keep it limited to branding or decoration.
- Don't rely on heavy shadows to show hierarchy.
- Don't turn the threat-analysis pages into marketing-style dashboards.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar collapses or overlays; tables scroll horizontally; graph rails stack. |
| Tablet | 768–1023px | Sidebar may default collapsed; card grids become two columns. |
| Desktop | ≥ 1024px | Full sidebar, split rails, graph canvas, and report preview all fit comfortably. |

### Touch Targets
- Keep buttons at least 32 px tall in dense desktop views.
- Increase sidebar and tab target size on mobile overlay navigation.
- Preserve clear spacing between adjacent chips and icon-only actions.

## Iteration Guide

1. Start with the shell, sidebar, and page-header pattern.
2. Add the dark surface stack, border system, and compact control styling.
3. Build management tables and project cards next.
4. Add source/sink taxonomy cards and severity chips for the security workflows.
5. Finish with graph analysis, modal forms, and the white report-sheet preview.
6. Tune spacing and radii against the screenshots rather than inventing new visual rules.

## Known Gaps

- The exact font stack and blue hex values are approximations from static screenshots.
- Fine-grained spacing, graph node geometry, and report-page margins may need live calibration.
- Empty, loading, and error states were not fully captured in the screenshot set.
