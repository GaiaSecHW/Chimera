# Task Report View Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "查看任务" button with a unified markdown report viewer that reads task output from the fileserver API and renders it with an auto-generated, collapsible table of contents.

**Architecture:** A new `TaskReportViewPage` component reads markdown files via `fileserverApi.getProjectFilesystemChildren()` + `fetchProjectFilesystemPreviewBlob()`. Navigation is wired through `chimera-navigate-view` event → App.tsx state → viewRegistry routing. Markdown is rendered with `react-markdown` + `remarkGfm` + `rehypeRaw` + `rehypeSanitize`. TOC is extracted from heading nodes and rendered in a collapsible sidebar.

**Tech Stack:** React, react-markdown, remark-gfm, rehype-raw, rehype-sanitize, fileserverApi (existing)

## Global Constraints

- All existing dependencies (`react-markdown`, `remark-gfm`, `rehype-raw`, `rehype-sanitize`) are already in the project — no new installs needed.
- Follow the project's existing dark-theme color constants pattern (`LK.*` in TaskVulnListPage, `theme-*` classes in TaskReportStep).
- The page uses `fileserverApi` from `clients/fileserver.ts` — no backend API changes.
- File path convention: `/tasks/{taskId}/output` under the project filesystem root.

---

### Task 1: Create `TaskReportViewPage` Component

**Files:**
- Create: `pages/task/TaskReportViewPage.tsx`

**Interfaces:**
- Consumes: `fileserverApi.getProjectFilesystemChildren(projectId, path)` → `ProjectFilesystemChildrenResponse` (has `.files: ProjectFilesystemEntry[]` where each has `.name: string`, `.path: string`); `fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, path)` → `Blob`; `reportSanitizeSchema` from `pages/redline/components/reportMarkdownSanitize`; `PageHeader` from `design-system`
- Produces: `TaskReportViewPage` React component with `Props: { projectId: string; taskId: string; onBack: () => void }`

- [ ] **Step 1: Create `pages/task/TaskReportViewPage.tsx` with full implementation**

Create the file with this content:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../design-system';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { reportSanitizeSchema } from '../redline/components/reportMarkdownSanitize';
import { fileserverApi } from '../../clients/fileserver';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

/* ── Theme tokens (matching TaskVulnListPage LK style) ── */
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  error: '#f15d5d',
} as const;

/* ── TOC extraction ── */
interface TocItem {
  level: number;
  text: string;
  id: string;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w一-鿿\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const extractToc = (markdown: string): TocItem[] => {
  const results: TocItem[] = [];
  const seen = new Map<string, number>();
  const regex = /^(#{1,4})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    let id = slugify(text);
    const count = seen.get(id) || 0;
    if (count > 0) id = `${id}-${count}`;
    seen.set(id, count + 1);
    results.push({ level, text, id });
  }
  return results;
};

/* ── Markdown custom components ── */
const buildMdComponents = (toc: TocItem[]): Components => {
  const makeHeading = (level: number) => {
    const Component: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
      const text = String(
        React.Children.toArray(children)
          .map((c) => (typeof c === 'string' ? c : ''))
          .join('')
      ).trim();
      const item = toc.find((t) => t.level === level && t.text === text);
      const id = item?.id || slugify(text);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      const sizeClass =
        level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
      return (
        <Tag id={id} className={`mb-3 ${sizeClass} font-bold text-theme-text-primary last:mb-0 scroll-mt-4`}>
          {children}
        </Tag>
      );
    };
    return Component;
  };

  return {
    h1: makeHeading(1),
    h2: makeHeading(2),
    h3: makeHeading(3),
    h4: makeHeading(4),
    p: ({ children }) => <p className="mb-3 last:mb-0 text-theme-text-primary">{children}</p>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-400 underline">
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-4 border-slate-500 bg-theme-surface px-4 py-2 italic text-theme-text-secondary last:mb-0">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="min-w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-theme-surface">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-theme-border px-3 py-2 font-bold text-theme-text-primary">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-theme-border px-3 py-2 align-top text-theme-text-primary">{children}</td>
    ),
    code: ({ children, className }) =>
      className ? (
        <code className="block overflow-x-auto rounded-lg border border-theme-border bg-theme-elevated px-4 py-3 font-mono text-xs text-theme-text-primary">
          {children}
        </code>
      ) : (
        <code className="rounded bg-theme-surface px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">
          {children}
        </code>
      ),
    pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
    hr: () => <hr className="my-4 border-theme-border" />,
    img: ({ src, alt }) => (
      <img src={src} alt={alt || ''} className="max-w-full rounded-lg my-3" style={{ maxHeight: 600 }} />
    ),
  };
};

/* ── Main Component ── */
export const TaskReportViewPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [activeTocId, setActiveTocId] = useState('');

  const toc = useMemo(() => extractToc(markdown), [markdown]);
  const mdComponents = useMemo(() => buildMdComponents(toc), [toc]);

  const loadReport = useCallback(async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError('');
    try {
      const dirPath = `/tasks/${taskId}/output`;
      const children = await fileserverApi.getProjectFilesystemChildren(projectId, dirPath);
      const mdFile = children.files.find((f) => f.name.endsWith('.md'));
      if (!mdFile) {
        setMarkdown('');
        setError('');
        setLoading(false);
        return;
      }
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, mdFile.path);
      const text = await blob.text();
      setMarkdown(text);
    } catch (err: any) {
      const msg = err?.message || '加载报告失败';
      if (msg.includes('404') || msg.includes('not found') || msg.includes('Not Found')) {
        setMarkdown('');
        setError('');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const scrollToSection = (id: string) => {
    setActiveTocId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  /* ── Render ── */
  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <div className="px-5 py-5 md:px-6 2xl:px-8">
        <PageHeader
          title="任务报告"
          description={
            <span className="font-mono text-xs" style={{ color: LK.muted }}>
              task_id: {taskId || '—'}
            </span>
          }
          back={{ label: '返回', onClick: onBack }}
          actions={
            <button
              onClick={() => void loadReport()}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = LK.primary;
                e.currentTarget.style.color = LK.primarySoft;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = LK.border;
                e.currentTarget.style.color = LK.inkSoft;
              }}
            >
              <RefreshCw size={15} /> 刷新
            </button>
          }
        />
      </div>

      {/* Error banner */}
      {error ? (
        <div
          className="mx-5 md:mx-6 2xl:mx-8 mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
        >
          {error}
          <button
            onClick={() => void loadReport()}
            className="ml-3 underline"
          >
            重试
          </button>
        </div>
      ) : null}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden mx-5 md:mx-6 2xl:mx-8 mb-5 rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        {/* TOC sidebar */}
        {!tocCollapsed && toc.length > 0 ? (
          <nav
            className="flex-shrink-0 border-r overflow-y-auto py-4 px-2"
            style={{ width: 192, borderColor: LK.border }}
          >
            <div className="flex items-center justify-between px-3 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>
                目录
              </div>
              <button
                onClick={() => setTocCollapsed(true)}
                className="p-0.5 rounded hover:bg-white/5"
                title="收起目录"
              >
                <ChevronLeft size={14} style={{ color: LK.muted }} />
              </button>
            </div>
            {toc.map((item) => (
              <div
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="py-1.5 text-xs rounded-lg cursor-pointer truncate transition-colors"
                style={{
                  paddingLeft: item.level === 1 ? 12 : item.level === 2 ? 24 : item.level === 3 ? 36 : 48,
                  paddingRight: 12,
                  backgroundColor: activeTocId === item.id ? LK.primaryMuted : 'transparent',
                  color: activeTocId === item.id ? LK.primary : LK.body,
                }}
                onMouseEnter={(e) => {
                  if (activeTocId !== item.id) e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                }}
                onMouseLeave={(e) => {
                  if (activeTocId !== item.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={item.text}
              >
                {item.text}
              </div>
            ))}
          </nav>
        ) : toc.length > 0 ? (
          <div className="flex-shrink-0 border-r py-4 px-1" style={{ borderColor: LK.border }}>
            <button
              onClick={() => setTocCollapsed(false)}
              className="p-1.5 rounded hover:bg-white/5"
              title="展开目录"
            >
              <ChevronRight size={14} style={{ color: LK.muted }} />
            </button>
          </div>
        ) : null}

        {/* Markdown content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20" style={{ color: LK.muted }}>
              <Loader2 size={20} className="animate-spin mr-2" />
              加载报告中...
            </div>
          ) : !markdown && !error ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: LK.muted }}>
              <FileText size={40} className="mb-3 opacity-40" />
              <div className="text-sm">暂无报告</div>
              <div className="text-xs mt-1">任务完成后报告将在此展示</div>
            </div>
          ) : markdown ? (
            <div className="break-words leading-7 max-w-none prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, [rehypeSanitize, reportSanitizeSchema]]}
                components={mdComponents}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd C:/Users/icsl/Desktop/projects/GaiaSecHW/Chimera && npx tsc --noEmit pages/task/TaskReportViewPage.tsx 2>&1 | head -20`

If TypeScript is not configured for single-file check, alternatively confirm no red underlines or just ensure the build doesn't error (deferred to final integration test).

- [ ] **Step 3: Commit**

```bash
git add pages/task/TaskReportViewPage.tsx
git commit -m "feat: add TaskReportViewPage component for markdown report rendering"
```

---

### Task 2: Wire Navigation — App.tsx, viewRegistry.tsx

**Files:**
- Modify: `App.tsx:103-106` (add state), `App.tsx:338-341` (add event handler), `App.tsx:740-741` (pass to ctx)
- Modify: `app/viewRegistry.tsx:70` (add import), `app/viewRegistry.tsx:158-163` (add ctx fields), `app/viewRegistry.tsx:309-316` (add case)

**Interfaces:**
- Consumes: `TaskReportViewPage` from Task 1
- Produces: `task-report-view` view in the navigation system; `ctx.activeTaskReportTaskId` field in `ViewContext`

- [ ] **Step 1: Add state in `App.tsx`**

After line 106 (`const [activeTaskVulnListTaskId, setActiveTaskVulnListTaskId] = useState<string>('');`), add:

```typescript
  const [activeTaskReportTaskId, setActiveTaskReportTaskId] = useState<string>('');
```

- [ ] **Step 2: Add event handler in `App.tsx`**

After the `taskVulnListTaskId` block (line 338-341), add:

```typescript
      const taskReportTaskId = String(detail?.taskReportTaskId || '').trim();
      if (taskReportTaskId) {
        setActiveTaskReportTaskId(taskReportTaskId);
      }
```

- [ ] **Step 3: Pass state to `renderCurrentView` context in `App.tsx`**

After line 740 (`activeTaskVulnListTaskId,`), add:

```typescript
                    activeTaskReportTaskId,
```

After line 769 (`setActiveTaskVulnListTaskId: (id) => setActiveTaskVulnListTaskId(id),`), add:

```typescript
                    setActiveTaskReportTaskId: (id) => setActiveTaskReportTaskId(id),
```

- [ ] **Step 4: Add import in `app/viewRegistry.tsx`**

After line 70 (`import { TaskVulnListPage } from '../pages/task/TaskVulnListPage';`), add:

```typescript
import { TaskReportViewPage } from '../pages/task/TaskReportViewPage';
```

- [ ] **Step 5: Add fields to `ViewContext` interface in `app/viewRegistry.tsx`**

After `activeTaskVulnListTaskId: string;` (line 163), add:

```typescript
  activeTaskReportTaskId: string;
```

After `setActiveTaskVulnListTaskId: (id: string) => void;` (line 189), add:

```typescript
  setActiveTaskReportTaskId: (id: string) => void;
```

- [ ] **Step 6: Add `case 'task-report-view'` in `app/viewRegistry.tsx`**

After the `task-vuln-list` case block (after line 316, `);`), add:

```typescript
    case 'task-report-view':
      return (
        <TaskReportViewPage
          projectId={ctx.selectedProjectId}
          taskId={ctx.activeTaskReportTaskId}
          onBack={() => ctx.setCurrentView('task-list')}
        />
      );
```

- [ ] **Step 7: Commit**

```bash
git add App.tsx app/viewRegistry.tsx
git commit -m "feat: wire task-report-view navigation in App.tsx and viewRegistry"
```

---

### Task 3: Replace "查看任务" Button — TaskCenterPage.tsx & ProjectDetailPage.tsx

**Files:**
- Modify: `pages/task/TaskCenterPage.tsx:263-292` (openTask function), `pages/task/TaskCenterPage.tsx:560-570` (button rendering)
- Modify: `pages/project/ProjectDetailPage.tsx:221-226` (openTask function), `pages/project/ProjectDetailPage.tsx:462-465` (button rendering)

**Interfaces:**
- Consumes: `task-report-view` navigation from Task 2
- Produces: Updated UI — "查看报告" button replacing "查看任务" for all task types

- [ ] **Step 1: Replace `openTask` in `TaskCenterPage.tsx`**

Replace lines 263-292 (the entire `openTask` function) with:

```typescript
  const openTask = (task: ScheduleCenterUserTask) => {
    saveTaskCenterReturnContext();
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: {
        view: 'task-report-view',
        taskReportTaskId: task.id,
      },
    }));
  };
```

- [ ] **Step 2: Update button rendering in `TaskCenterPage.tsx`**

Replace lines 560-570 (the button block with `isAdmin` and `sechps_tool` checks):

```tsx
                    {task.task_type !== 'sechps_tool' && isAdmin ? (
                      <button
                        onClick={() => openTask(task)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
                      >
                        查看任务 <ArrowRight size={12} />
                      </button>
                    ) : null}
```

with:

```tsx
                    <button
                      onClick={() => openTask(task)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
                    >
                      查看报告 <ArrowRight size={12} />
                    </button>
```

Note: removed the `{task.task_type !== 'sechps_tool' && isAdmin ? (...) : null}` wrapper — the button now shows for all tasks unconditionally.

- [ ] **Step 3: Replace `openTask` in `ProjectDetailPage.tsx`**

Replace lines 221-226 (the `openTask` function) with:

```typescript
  const openTask = (task: any) => {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: {
        view: 'task-report-view',
        taskReportTaskId: task.id,
      },
    }));
  };
```

- [ ] **Step 4: Update button rendering in `ProjectDetailPage.tsx`**

Replace line 462 condition:

```tsx
                        {task.task_type !== 'sechps_tool' && TASK_DOWNSTREAM_VIEW[task.task_type] && (
                          <button className={actionBtnClass} style={actionBtnStyle} onClick={() => openTask(task)}>
                            查看任务 <ArrowRight size={12} />
                          </button>
                        )}
```

with:

```tsx
                        <button className={actionBtnClass} style={actionBtnStyle} onClick={() => openTask(task)}>
                          查看报告 <ArrowRight size={12} />
                        </button>
```

Note: removed the `task.task_type !== 'sechps_tool' && TASK_DOWNSTREAM_VIEW[task.task_type]` condition — all tasks now show the button.

- [ ] **Step 5: Commit**

```bash
git add pages/task/TaskCenterPage.tsx pages/project/ProjectDetailPage.tsx
git commit -m "feat: replace 查看任务 button with unified 查看报告 for all task types"
```

---

### Task 4: Manual Integration Test

**Files:** None (verification only)

- [ ] **Step 1: Start dev server and test navigation**

Run: `npm run dev` (or the project's dev command)

Test checklist:
1. Go to 测试任务 page → verify "查看报告" button appears for all task types (including sechps_tool)
2. Click "查看报告" → verify it navigates to the report view page
3. If the task has a markdown file at `/tasks/{taskId}/output/*.md` → verify it renders with headings, tables, inline HTML
4. If no markdown file → verify "暂无报告" placeholder shows
5. Verify TOC appears on the left with correct heading hierarchy
6. Click a TOC item → verify it scrolls to the heading
7. Click TOC collapse button → verify sidebar collapses to a single icon
8. Click expand button → verify sidebar reopens
9. Click 返回 → verify it goes back to task center
10. Click 刷新 → verify it reloads the report
11. Test from 项目详情 page → verify "查看报告" button works the same way

- [ ] **Step 2: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix: address integration test findings for task report view"
```
