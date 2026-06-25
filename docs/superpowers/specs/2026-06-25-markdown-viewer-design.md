# Markdown Viewer for Vulnerability Detail

Date: 2026-06-25

## Background

The vulnerability center detail view includes returned data that may be formatted as Markdown. Rendering that content as plain text makes reports, reproduction steps, code snippets, tables, and remediation guidance harder to read.

The requirement is read-only display. The page does not need Markdown editing, drafts, save behavior, or preview/edit switching.

## Identified Markdown Fields

Investigation of the detail page (`pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx`) and the `vuln-confirm` API response (`/api/vuln/cases/{case_id}/vuln-confirm`) found the following Markdown-capable content:

- **`confirm_records[].reason`** — the rationale returned by each confirmation engine (e.g. WEB漏洞判定引擎). This is free-form Markdown text describing why the engine reached its verdict. **This field is the primary target of this change** — it is currently not rendered as Markdown and is the main source of the "data looks bad" complaint.
- **`reportDocument.content`** — the structured Markdown report body. Already rendered through a local `MarkdownContent` in the same file.

The `confirm_records` array entries also carry scalar metadata that must stay as plain fields:

- `engine_name`, `engine_version` — engine identity
- `status` — `completed` / `failed` / etc.
- `result` — `yes` / `no` / etc. — **the verdict itself**

These scalar fields must NOT be swallowed by Markdown rendering. They belong to the "verdict" layer; `reason` belongs to the "rationale" layer.

## Goals

- Render Markdown content in vulnerability detail with readable formatting.
- Support common security report structures: headings, paragraphs, ordered and unordered lists, blockquotes, tables, inline code, fenced code blocks, and links.
- Keep the implementation lightweight and consistent with existing vulnerability/detail page styling.
- Avoid unsafe raw HTML rendering from backend-provided content.
- Provide graceful empty-content display.

## Non-goals

- No Markdown editing UI.
- No toolbar, split preview, autosave, or draft state.
- No rich-text/WYSIWYG editing.
- No broad redesign of vulnerability center layout.

## Recommended Approach

Create or reuse a shared read-only `MarkdownViewer` component and use it in the vulnerability detail fields that can contain Markdown.

The viewer should be based on the existing project pattern already used in several detail pages: `react-markdown` plus `remark-gfm`. Unlike the existing local `MarkdownContent` copies, the shared `MarkdownViewer` must add `rehype-sanitize` (default schema), because `confirm_records.reason` comes from external confirmation engines and is less trusted than internally generated reports. `rehype-sanitize` is an explicit new dependency to install.

## Component Behavior

`MarkdownViewer` should accept at least:

- `content: string | null | undefined`
- Optional `emptyText`, defaulting to `暂无内容`
- Optional className for local layout adjustments

Rendering behavior:

- Empty or whitespace-only content shows the empty state.
- Markdown is rendered read-only.
- Links open in a new tab with `rel="noreferrer"`.
- Tables are wrapped in a horizontal scroll container.
- Code blocks and inline code use theme-compatible styling.
- Long lines and wide content should not break the surrounding detail layout.

## Integration

In the vulnerability detail display area, replace plain text rendering for Markdown-capable fields with `MarkdownViewer`.

The first integration target is the confirmation-result response from:

`/api/vuln/cases/{case_id}/vuln-confirm`

Display each `confirm_records[]` item as a dedicated confirmation card:

- Header: `engine_name`, `engine_version`, `status`, and `result`
- Body: `reason`, rendered with `MarkdownViewer`

The card should make the relationship explicit:

- `result` is the engine verdict / 当前结论
- `reason` is the Markdown-rendered 判定依据 / 结论说明

Placement: render the confirmation card(s) in the detail page as a dedicated section titled `判定依据` (or `结论说明`), positioned in the right-hand summary column of `VulnCaseDetailLayout`, above or adjacent to the existing `关键结论` block so the user can compare the engine verdict against the key-points summary without confusing it with the main report body. If `confirm_records` is empty or the request fails, show the empty state — do not hide the section.

The existing detail-page fields should remain separate:

- `decision_status` and `validation_result` stay as status/metric fields.
- `displaySummary.key_points` remains a short summary list.
- `reportDocument.content` remains the main structured Markdown report body.

This separation prevents the confirmation rationale from appearing to overwrite the current verdict or the main report.

The integration should be narrow: only fields known to contain Markdown or fields currently showing returned data that users expect to read as Markdown should switch to the viewer. Other scalar fields, status labels, and structured metadata should keep their current display.

## Error Handling and Safety

- Do not enable raw HTML rendering unless a strict sanitize schema is intentionally defined.
- If the content is missing, show the empty state rather than an empty block.
- If content is very large, preserve page usability with existing detail page patterns such as scrollable containers or truncation/expand behavior if that pattern already exists nearby.

## Testing and Verification

Verify `MarkdownViewer` with sample content containing:

- Headings and paragraphs
- Ordered and unordered lists
- A Markdown table
- Inline code and fenced code blocks
- A blockquote
- An external link
- Empty content
- A payload with raw `<script>` / inline `onclick` — confirm `rehype-sanitize` strips it

Verify the confirmation card integration:

- A `confirm_records` item with a long Markdown `reason` renders as readable Markdown, with `engine_name` / `version` / `status` / `result` shown as plain header fields.
- An empty or missing `confirm_records` shows the empty state in the `判定依据` section.
- The card does not visually merge into the main report body or the `关键结论` block.

Check that the vulnerability detail page remains visually aligned with the existing card/detail style and that wide tables or code blocks do not overflow the page.
