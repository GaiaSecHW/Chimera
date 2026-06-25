# 漏洞详情 Markdown 只读展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在漏洞中心漏洞详情页，把判定引擎返回的 `confirm_records[].reason` 等长文本用只读 Markdown 渲染展示，新增"判定依据"区块，并抽取一个可复用、已做 sanitize 的 `MarkdownViewer` 组件。

**Architecture:** 新建共享 `MarkdownViewer`（`react-markdown` + `remark-gfm` + `rehype-sanitize`），放在 `design-system/primitives`。`VulnCaseDetailLayout` 增加 `confirmRecords` prop，在右侧摘要列"关键结论"上方新增"判定依据"区块。`VulnEnginePage.loadCaseDetail` 负责拉取 `getCaseConfirmRecords` 并下传。字段分层：`result` 作为结论（普通字段），`reason` 作为 Markdown 依据。

**Tech Stack:** React + TypeScript + Vite, Tailwind（theme token 类如 `text-theme-text-primary`/`bg-theme-surface`/`border-theme-border`），`react-markdown@^10`, `remark-gfm@^4`, `rehype-sanitize@^6`（均已安装）。

## Global Constraints

- **验证方式：** 本项目**没有单元测试框架**（无 vitest/jest，仅有 Playwright e2e）。`npm run lint` 实际是 `tsc --noEmit`。因此每个任务的验证 = `npm run lint` 通过 + 描述的行为核对，而非 TDD 单测。不要伪造单测代码；若要补单测需先引入测试框架，超出本次范围。
- **依赖：** `react-markdown`、`remark-gfm`、`rehype-sanitize` 均已在 `package.json`，**禁止重复安装或升级**。
- **样式约定：** 共享组件用 Tailwind theme token 类（`text-theme-text-*`、`bg-theme-surface`、`bg-theme-elevated`、`border-theme-border`），与 `design-system/primitives/Card`、`pages/execution/SystemAnalysisTaskDetailPage.tsx` 既有 Markdown 渲染保持一致。`cx` 来自 `design-system/utils/cx`。
- **安全：** 共享 `MarkdownViewer` 必须启用 `rehype-sanitize`（默认 schema），因为 `confirm_records.reason` 来自外部判定引擎，信任度低于内部报告。
- **字段分层（不得破坏）：** `result` / `engine_name` / `engine_version` / `status` 一律按普通字段渲染；只有 `reason` 走 MarkdownViewer。`decision_status`、`validation_result`、`displaySummary.key_points`、`reportDocument.content` 保持各自独立展示。
- **中文文案：** 区块标题用"判定依据"；空态用"暂无判定依据"。

---

## File Structure

- **Create** `design-system/primitives/MarkdownViewer/MarkdownViewer.tsx` — 共享只读 Markdown 渲染组件（带 sanitize、theme token 样式、空态兜底）。
- **Create** `design-system/primitives/MarkdownViewer/index.ts` — 导出 `MarkdownViewer` 与 `MarkdownViewerProps`。
- **Modify** `design-system/primitives/index.ts` — 新增 `MarkdownViewer` 的 re-export。
- **Modify** `clients/vuln.ts:365` — 给 `getCaseConfirmRecords` 增加 `VulnConfirmRecord` 类型，收紧返回类型。
- **Modify** `pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx` — 增加 `confirmRecords` prop；新增"判定依据"区块；复用 `MarkdownViewer`。
- **Modify** `pages/vuln/VulnEnginePage.tsx` — 新增 `confirmRecords` state；`loadCaseDetail` 拉取确认记录；渲染时下传 prop。

---

### Task 1: 给 confirm_records 增加类型并收紧 API 返回类型

**Files:**
- Modify: `clients/vuln.ts:365`

**Interfaces:**
- Produces: `VulnConfirmRecord`（export interface），供 Task 3 / Task 4 引用。

- [ ] **Step 1: 在 `clients/vuln.ts` 顶部类型区新增 `VulnConfirmRecord`**

在 `clients/vuln.ts` 文件中，`VulnCaseReportDocument` 等类型附近（搜索 `export interface VulnCaseReportDocument` 找到类型聚集处）新增：

```ts
export interface VulnConfirmRecord {
  engine_name: string;
  engine_version?: string;
  status: string;
  result: string;
  reason?: string;
}
```

- [ ] **Step 2: 收紧 `getCaseConfirmRecords` 返回类型**

将 `clients/vuln.ts:365-366` 当前内容：

```ts
  getCaseConfirmRecords: async (caseId: string): Promise<{ confirm_records: any[]; validation_result?: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/vuln-confirm`, { headers: getHeaders() })),
```

改为：

```ts
  getCaseConfirmRecords: async (caseId: string): Promise<{ confirm_records: VulnConfirmRecord[]; validation_result?: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/vuln-confirm`, { headers: getHeaders() })),
```

- [ ] **Step 3: 类型检查**

Run: `npm run lint`
Expected: 无新增报错（`tsc --noEmit` 通过）。注意 `VulnIntakePage.tsx:930` 把 `confirm?.confirm_records` 存进 `any` state，类型收紧后不会破坏它。

- [ ] **Step 4: Commit**

```bash
git add clients/vuln.ts
git commit -m "feat(vuln): 为 confirm_records 增加 VulnConfirmRecord 类型并收紧返回类型"
```

---

### Task 2: 新建共享 MarkdownViewer 组件

**Files:**
- Create: `design-system/primitives/MarkdownViewer/MarkdownViewer.tsx`
- Create: `design-system/primitives/MarkdownViewer/index.ts`
- Modify: `design-system/primitives/index.ts`

**Interfaces:**
- Produces: `MarkdownViewer` 组件、`MarkdownViewerProps`（`{ content?: string | null; emptyText?: string; className?: string }`）。Task 3、Task 5 使用 `<MarkdownViewer content={...} />`。

- [ ] **Step 1: 创建 `design-system/primitives/MarkdownViewer/MarkdownViewer.tsx`**

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

import { cx } from '../../utils/cx';

export interface MarkdownViewerProps {
  /** Markdown 原文。null/undefined/纯空白 时显示 emptyText。 */
  content?: string | null;
  /** 空态文案，默认"暂无内容"。 */
  emptyText?: string;
  /** 追加到最外层容器的 className。 */
  className?: string;
}

/**
 * 只读 Markdown 渲染组件。
 * - 启用 rehype-sanitize（默认 schema），过滤来自外部来源的危险 HTML/脚本。
 * - 使用 theme token Tailwind 类，与设计系统其它组件配色一致。
 * - 不提供编辑/预览切换。
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  emptyText = '暂无内容',
  className,
}) => {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    return (
      <div className={cx('rounded-lg px-3 py-4 text-sm text-theme-text-secondary', className)}>
        {emptyText}
      </div>
    );
  }
  return (
    <div className={cx('markdown-body break-words leading-6 text-sm text-theme-text-secondary', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-400 underline decoration-cyan-300 underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold text-theme-text-primary last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold text-theme-text-primary last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-base font-semibold text-theme-text-primary last:mb-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 text-sm font-semibold text-theme-text-primary last:mb-0">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-theme-border bg-theme-elevated px-4 py-2 italic text-theme-text-secondary last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-theme-elevated">{children}</thead>,
          th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-semibold text-theme-text-primary">{children}</th>,
          td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top">{children}</td>,
          code: ({ children, className: codeClassName }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 font-mono text-xs text-theme-text-primary">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
```

- [ ] **Step 2: 创建 `design-system/primitives/MarkdownViewer/index.ts`**

```ts
export { MarkdownViewer } from './MarkdownViewer';
export type { MarkdownViewerProps } from './MarkdownViewer';
```

- [ ] **Step 3: 在 `design-system/primitives/index.ts` 末尾新增 re-export**

在文件末尾追加（紧跟 `SegmentedControl` 导出之后）：

```ts
export { MarkdownViewer } from './MarkdownViewer';
export type { MarkdownViewerProps } from './MarkdownViewer';
```

- [ ] **Step 4: 类型检查**

Run: `npm run lint`
Expected: `tsc --noEmit` 通过。

- [ ] **Step 5: Commit**

```bash
git add design-system/primitives/MarkdownViewer/MarkdownViewer.tsx design-system/primitives/MarkdownViewer/index.ts design-system/primitives/index.ts
git commit -m "feat(design-system): 新增共享只读 MarkdownViewer（含 rehype-sanitize）"
```

---

### Task 3: 在详情布局新增"判定依据"区块（含 confirmRecords prop）

**Files:**
- Modify: `pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx`

**Interfaces:**
- Consumes: `MarkdownViewer`（来自 Task 2，从 `../../../design-system` 导入）；`VulnConfirmRecord`（来自 Task 1，从 `../../../clients/vuln` 导入）。
- Produces: `VulnCaseDetailLayout` 新增可选 prop `confirmRecords?: VulnConfirmRecord[]`。Task 4 传入该 prop。

- [ ] **Step 1: 更新 import**

在 `pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx` 第 45-51 行的 `import type { ... } from '../../../clients/vuln';` 块中，把 `VulnConfirmRecord` 加入导入：

```ts
import type {
  VulnCaseDisplaySummary,
  VulnCaseEvidenceSummary,
  VulnCaseReportDocument,
  VulnCaseReportSummary,
  VulnCaseWorkspaceSummary,
  VulnConfirmRecord,
} from '../../../clients/vuln';
```

并在文件顶部 React 相关 import 下方新增（紧跟 lucide-react import 之后即可）：

```ts
import { MarkdownViewer } from '../../../design-system';
```

- [ ] **Step 2: 在 props 接口中新增 `confirmRecords`**

在第 94-110 行的 `VulnCaseDetailLayout` props 类型中，在 `stageActionContent?: React.ReactNode;` 之后新增一行：

```ts
  confirmRecords?: VulnConfirmRecord[];
```

并在解构参数（第 112-128 行附近，`stageActionContent` 同级）末尾新增 `confirmRecords`：

```ts
  confirmRecords,
```

- [ ] **Step 3: 新增"判定依据"区块**

在右侧摘要列（`<div className="space-y-4">`，当前第 292 行附近，含"关键结论"section 的容器）中，**在"关键结论" section 之前**插入新的"判定依据" section。"关键结论" section 的起始标识为：

```tsx
          <section
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>关键结论</div>
```

在该 `<section ...>` 之前插入：

```tsx
          <section
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>判定依据</div>
            {(confirmRecords || []).length > 0 ? (
              <div className="mt-3 space-y-3">
                {(confirmRecords || []).map((record, index) => (
                  <div
                    key={`${record.engine_name}-${index}`}
                    className="rounded-lg"
                    style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.borderSoft }}
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
                      <span className="text-sm font-semibold" style={{ color: LK.ink }}>
                        {record.engine_name || '未知引擎'}
                      </span>
                      {record.engine_version ? (
                        <span className="text-xs" style={{ color: LK.muted }}>{record.engine_version}</span>
                      ) : null}
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
                      >
                        {record.result === 'yes' ? '判定成立' : record.result === 'no' ? '判定不成立' : (record.result || '-')}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: LK.muted }}>{record.status || ''}</span>
                    </div>
                    <div className="px-3 py-2">
                      <MarkdownViewer content={record.reason} emptyText="暂无判定依据" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg px-3 py-4 text-sm" style={{ color: LK.muted }}>暂无判定依据</div>
            )}
          </section>
```

- [ ] **Step 4: 类型检查**

Run: `npm run lint`
Expected: `tsc --noEmit` 通过。`confirmRecords` 为可选 prop，未传入时不影响其它调用方。

- [ ] **Step 5: Commit**

```bash
git add pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx
git commit -m "feat(vuln): 漏洞详情新增判定依据区块，Markdown 渲染 confirm reason"
```

---

### Task 4: 在 VulnEnginePage 拉取并下传 confirmRecords

**Files:**
- Modify: `pages/vuln/VulnEnginePage.tsx`

**Interfaces:**
- Consumes: `vulnApi.vuln.getCaseConfirmRecords`（`clients/vuln.ts:365`）；`VulnCaseDetailLayout.confirmRecords` prop（Task 3 新增）。
- Produces: 漏洞详情页可见的"判定依据"区块有真实数据。

- [ ] **Step 1: 新增 `confirmRecords` state**

在 `pages/vuln/VulnEnginePage.tsx` 的 state 声明区（第 153-218 行附近，紧跟 `setReportError`/`reportError` 相关 state 之后）新增：

```ts
  const [confirmRecords, setConfirmRecords] = useState<any[]>([]);
```

- [ ] **Step 2: 在 `loadCaseDetail` 中拉取确认记录**

当前 `loadCaseDetail`（第 433-457 行）的 try 块内 `Promise.all` 为：

```ts
      const [detail, timeline, recommendations, reports] = await Promise.all([
        vulnApi.vuln.getCaseDetail(caseId),
        vulnApi.vuln.getCaseTimeline(caseId),
        vulnApi.vuln.getRecommendedActions(caseId),
        vulnApi.vuln.listCaseReports(caseId),
      ]);
```

改为（新增第 5 项，带失败回退，与 `VulnIntakePage.tsx:926` 一致）：

```ts
      const [detail, timeline, recommendations, reports, confirm] = await Promise.all([
        vulnApi.vuln.getCaseDetail(caseId),
        vulnApi.vuln.getCaseTimeline(caseId),
        vulnApi.vuln.getRecommendedActions(caseId),
        vulnApi.vuln.listCaseReports(caseId),
        vulnApi.vuln.getCaseConfirmRecords(caseId).catch(() => ({ confirm_records: [] })),
      ]);
```

并在该 try 块内 `setSelectedReportId(initialReportId);` 之后新增：

```ts
      setConfirmRecords(confirm?.confirm_records || []);
```

- [ ] **Step 3: 在 caseId 为空分支清空 confirmRecords**

`loadCaseDetail` 开头（第 433-439 行）当前为：

```ts
  const loadCaseDetail = async (caseId: string) => {
    if (!caseId) {
      setSelectedCaseDetail(null);
      setSelectedCaseTimeline([]);
      setRecommendedActions([]);
      return;
    }
```

在 `setRecommendedActions([]);` 之后新增：

```ts
      setConfirmRecords([]);
```

- [ ] **Step 4: 渲染时下传 prop**

在第 1346-1364 行的 `<VulnCaseDetailLayout ... />` JSX 中，在 `stageActionContent={stageSpecificPanel}` 之后新增一行：

```tsx
              confirmRecords={confirmRecords}
```

- [ ] **Step 5: 类型检查**

Run: `npm run lint`
Expected: `tsc --noEmit` 通过。

- [ ] **Step 6: Commit**

```bash
git add pages/vuln/VulnEnginePage.tsx
git commit -m "feat(vuln): VulnEnginePage 拉取 confirm_records 并下传详情布局"
```

---

### Task 5: 复用 MarkdownViewer 渲染报告正文（DRY 收敛）

**Files:**
- Modify: `pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx`

**Interfaces:**
- Consumes: `MarkdownViewer`（Task 2）。

**说明：** 详情页报告正文当前用文件内局部 `MarkdownContent`（第 68-74 行）渲染 `reportDocument.content`（第 283 行）。该局部组件未做 sanitize。本任务把它替换为共享 `MarkdownViewer`，统一渲染口径并补上 sanitize。这是可独立驳回的样式/安全收敛，故单列。

- [ ] **Step 1: 替换报告正文渲染**

当前第 282-283 行附近：

```tsx
            ) : reportDocument?.content ? (
              <MarkdownContent content={reportDocument.content} />
            ) : (
```

改为：

```tsx
            ) : reportDocument?.content ? (
              <MarkdownViewer content={reportDocument.content} />
            ) : (
```

- [ ] **Step 2: 删除不再使用的局部 `MarkdownContent` 及其 import**

删除第 68-74 行的局部函数（确认本文件仅此处使用 `ReactMarkdown`/`remarkGfm`，见 Step 1 后唯一引用已切换为 `MarkdownViewer`）：

```tsx
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words leading-7 text-sm" style={{ color: LK.body }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
```

删除该函数后，第 2-3 行的 `ReactMarkdown`、`remarkGfm` 不再被引用，一并删除：

```ts
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
```

（已核实：本文件中 `ReactMarkdown`/`remarkGfm` 仅出现在被删除的 `MarkdownContent` 内部。）

- [ ] **Step 3: 类型检查**

Run: `npm run lint`
Expected: `tsc --noEmit` 通过，无"未使用 import"相关报错。

- [ ] **Step 4: Commit**

```bash
git add pages/vuln/vuln-engine/VulnCaseDetailLayout.tsx
git commit -m "refactor(vuln): 报告正文复用共享 MarkdownViewer，补 sanitize"
```

---

### Task 6: 最终验证

**Files:** 无（仅验证）。

- [ ] **Step 1: 全量类型检查**

Run: `npm run lint`
Expected: `tsc --noEmit` 通过，零报错。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: Vite 构建成功。

- [ ] **Step 3: 行为核对（手动 / e2e）**

在漏洞中心打开一个有 `confirm_records` 的案例详情（`/api/vuln/cases/{case_id}/vuln-confirm` 返回含 `reason`）：

- 右侧"判定依据"区块出现，含 `engine_name`、`engine_version`、`result`（`yes→判定成立`、`no→判定不成立`）、`status`，`reason` 以 Markdown 渲染（标题/列表/代码块/表格正常）。
- 无 `confirm_records` 或接口失败时，区块显示"暂无判定依据"，不报错。
- "关键结论"、主报告正文、`validation_result` 等其它字段展示不受影响。
- 含 `<script>` 的 reason 被剥离（不执行）。
- 报告正文 Markdown 仍正常渲染（Task 5 收敛后）。

- [ ] **Step 4: 收尾说明**

无需提交（本任务无代码改动）。若 Step 3 发现问题，回到对应 Task 修复后重新验证。
