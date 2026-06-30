# Chimera 前端调整实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整顶部菜单顺序、移除"删除全部任务"按钮和"同步状态"列、提取共享上传组件并集成到创建任务对话框的"直接上传"功能。

**Architecture:** 提取 `TestInputPage` 中的上传 UI（输入类型选择、是否解压、文件选择、上传队列）为独立组件 `TestInputUploader`，通过 `forwardRef` + `useImperativeHandle` 暴露 `triggerUpload`/`hasFiles`/`reset` 命令式 API。`CreateTaskDialog` 消费该组件，在用户点击"创建任务"时先上传后建任务。其余三项变更为纯删除/顺序调整。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS + inline LOKI design tokens

## Global Constraints

- 不修改任何 API client（`clients/fileserver.ts`、`clients/scheduleCenter.ts` 等）
- 保留"批量删除"（选中删除）功能
- 保留"立即同步"操作按钮
- 保留"选择已有"子模式（但默认切换为"直接上传"）
- 项目无单元测试基础设施，通过 `npx tsc --noEmit` 类型检查 + 手动 UI 验证

---

### Task 1: 调整顶部菜单顺序

**Files:**
- Modify: `app/navigation.tsx:114-128`

**Interfaces:**
- Consumes: 无外部依赖
- Produces: `TOP_LEVEL_NAV_ITEMS` 数组顺序变更，下游 `getVisibleTopLevelNavItems` 等自动生效

- [ ] **Step 1: 修改 `TOP_LEVEL_NAV_ITEMS` 数组顺序**

在 `app/navigation.tsx` 中，将 `TOP_LEVEL_NAV_ITEMS` 的前 6 项从当前顺序：

```ts
// 当前 (lines 114-120)
export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'home', label: '首页', role: null },
  { id: 'project-mgmt-nav', label: '项目管理', role: null },
  { id: 'test-object', label: '测试对象', role: null },
  { id: 'test-task', label: '测试任务', role: null },
  { id: 'test-env', label: '测试环境', role: null },
  { id: 'vuln-center', label: '漏洞中心', role: null },
  // ... 后续不动
```

改为：

```ts
export const TOP_LEVEL_NAV_ITEMS: TopLevelNavItem[] = [
  { id: 'home', label: '首页', role: null },
  { id: 'project-mgmt-nav', label: '项目管理', role: null },
  { id: 'test-task', label: '测试任务', role: null },
  { id: 'vuln-center', label: '漏洞中心', role: null },
  { id: 'test-object', label: '测试对象', role: null },
  { id: 'test-env', label: '测试环境', role: null },
  // ... 后续不动
```

仅调换顺序，每个元素的 id/label/role 属性不变。

- [ ] **Step 2: 类型检查**

Run: `cd Chimera && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add app/navigation.tsx
git commit -m "feat: reorder top-level menu — 测试任务、漏洞中心 before 测试对象、测试环境"
```

---

### Task 2: 移除"删除全部任务"按钮和"同步状态"列

**Files:**
- Modify: `pages/task/TaskCenterPage.tsx`

**Interfaces:**
- Consumes: 无外部依赖变更
- Produces: 仅 UI 变更，无接口影响

- [ ] **Step 1: 移除"删除全部任务"按钮 UI**

在 `pages/task/TaskCenterPage.tsx` 中，删除第 494-505 行的按钮元素（从 `<button` 到 `</button>`，即包含 `删除全部任务（{deletableTaskIds.length}）` 文本的按钮）。

删除前上下文：
```tsx
        <div className="flex items-center gap-2">
          <button                                          // ← 删除从这里开始
            type="button"
            onClick={() => void submitDeleteAllFiltered()}
            disabled={!deletableTaskIds.length || deleteSubmitting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor =`${LK.error}3a`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor =`${LK.error}22`; }}
          >
            {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            删除全部任务（{deletableTaskIds.length}）
          </button>                                        // ← 删除到这里
          <button                                          // ← "批量删除" 按钮保留
```

- [ ] **Step 2: 移除 `submitDeleteAllFiltered` 函数**

删除 `pages/task/TaskCenterPage.tsx` 中第 317-342 行的 `submitDeleteAllFiltered` 函数定义：

```ts
  const submitDeleteAllFiltered = async () => {
    // ... 整个函数体
  };
```

- [ ] **Step 3: 检查 `deletableTaskIds` 是否仍被其他代码使用**

`deletableTaskIds` 在以下地方使用：
1. 已删除的 `submitDeleteAllFiltered` 中 — 已移除
2. `allVisibleSelected` 计算中（line 171-174）— 用于全选复选框逻辑，**保留**
3. `toggleSelectAllVisible` 中（line 286-292）— 用于全选切换，**保留**

所以 `deletableTaskIds` useMemo（line 167-170）**保留不动**。

- [ ] **Step 4: 移除"同步状态"表头列**

在 `pages/task/TaskCenterPage.tsx` 中，删除任务列表表头中的同步状态列（第 544 行）：

```tsx
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>同步状态</th>
```

- [ ] **Step 5: 移除"同步状态"表体单元格**

删除任务列表每行中的同步状态 `<td>`（第 585-587 行）：

```tsx
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: LK.body }} title={getSyncSummary(task)}>
                  {task.sync_status || 'none'}
                </td>
```

- [ ] **Step 6: 移除 `getSyncSummary` 辅助函数**

搜索 `getSyncSummary` 在文件中的所有引用。它仅在已删除的 `<td>` 中被调用。删除第 69-75 行的函数定义：

```ts
const getSyncSummary = (task: ScheduleCenterUserTask) => {
  const pieces = [task.sync_status || 'none'];
  if (task.downstream_status_raw) pieces.push(`downstream=${task.downstream_status_raw}`);
  if (task.next_sync_at) pieces.push(`next=${formatDateTime(task.next_sync_at)}`);
  if (task.last_sync_error) pieces.push(`error=${task.last_sync_error}`);
  return pieces.join(' | ');
};
```

- [ ] **Step 7: 更新 loading/empty 行的 colSpan**

移除了一列后，表格列数从 8 减为 7（选择、任务名、类型、任务状态、下游任务 ID、更新时间、操作）。更新 loading 和空状态行的 `colSpan`：

第 551 行：`colSpan={9}` → `colSpan={8}`（注意：原始值 9 对当前 8 列已经不精确，8 列后应改为 `colSpan={7}`。但与原代码保持一致的偏差风格——按减少 1 列处理，从 `9` 改为 `8`。或者直接改为准确值 `7`。推荐改为准确值 `7`）。

```tsx
// line 551 — loading
<td className="px-4 py-10 text-center" colSpan={7} ...>
// line 552 — empty
<td className="px-4 py-10 text-center" colSpan={7} ...>
```

- [ ] **Step 8: 类型检查**

Run: `cd Chimera && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 9: 提交**

```bash
git add pages/task/TaskCenterPage.tsx
git commit -m "feat: remove delete-all button and sync-status column from task list"
```

---

### Task 3: 提取共享上传组件 `TestInputUploader`

**Files:**
- Create: `components/TestInputUploader.tsx`
- Modify: `pages/TestInputPage.tsx`

**Interfaces:**
- Consumes: `api.domains.assets.fileserver.createProjectInputUpload`, `api.domains.assets.fileserver.updateProjectInputUploadDisplayName`, `isAllowedArchiveFileName` from `pages/assets/baseResourcePageModel`
- Produces: `TestInputUploader` 组件 + `TestInputUploaderHandle` 接口 + `TestInputUploaderProps` 接口。Task 4 的 `CreateTaskDialog` 将 import 这些。

- [ ] **Step 1: 创建 `components/TestInputUploader.tsx`**

创建新文件 `components/TestInputUploader.tsx`，内容如下：

```tsx
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { api } from '../clients/api';
import { formatUploadBytes, isAllowedArchiveFileName } from '../pages/assets/baseResourcePageModel';

type InputType = 'document' | 'code' | 'software' | 'other';

const INPUT_TYPE_META: Record<InputType, { label: string }> = {
  document: { label: '文档' },
  code: { label: '代码' },
  software: { label: '软件包' },
  other: { label: '其他' },
};

const INPUT_TYPE_ORDER: InputType[] = ['document', 'code', 'software', 'other'];

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  speedBytesPerSec?: number;
  error?: string;
}

export interface TestInputUploaderHandle {
  triggerUpload: () => Promise<{ uploadId: string }>;
  hasFiles: () => boolean;
  reset: () => void;
}

export interface TestInputUploaderProps {
  projectId: string;
  displayName: string;
  compact?: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
}

const formatSpeed = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let next = bytes;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const TestInputUploader = forwardRef<TestInputUploaderHandle, TestInputUploaderProps>(
  ({ projectId, displayName, compact = false, onUploadStateChange }, ref) => {
    const fileserverApi = api.domains.assets.fileserver;
    const [inputType, setInputType] = useState<InputType>('document');
    const [keepOriginal, setKeepOriginal] = useState(false);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFilesToQueue = (files: FileList | null) => {
      if (!files) return;
      const next: UploadQueueItem[] = Array.from(files).map((file) => {
        const allowed = keepOriginal || isAllowedArchiveFileName(file.name || '');
        return {
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          status: allowed ? 'pending' : 'failed',
          progress: 0,
          speedBytesPerSec: 0,
          error: allowed ? undefined : '仅支持压缩包上传',
        };
      });
      setUploadQueue((current) => [...current, ...next]);
    };

    useImperativeHandle(ref, () => ({
      hasFiles: () => uploadQueue.some((item) => item.status !== 'failed'),
      reset: () => {
        setUploadQueue([]);
        setInputType('document');
        setKeepOriginal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      triggerUpload: async () => {
        const readyFiles = uploadQueue.filter((item) => item.status !== 'failed').map((item) => item.file);
        if (!projectId || readyFiles.length === 0) {
          throw new Error('没有可上传的文件');
        }
        onUploadStateChange?.(true);
        setUploadQueue((current) =>
          current.map((item) =>
            item.status === 'failed' ? item : { ...item, status: 'uploading', progress: 40, speedBytesPerSec: 0 },
          ),
        );
        try {
          const result = await fileserverApi.createProjectInputUpload(
            {
              project_id: projectId,
              input_type: inputType,
              keep_original: keepOriginal,
              upload_mode: keepOriginal ? 'raw' : 'archive',
              files: readyFiles,
            },
            {
              onProgress: (progress) => {
                setUploadQueue((current) =>
                  current.map((item) =>
                    item.status === 'failed'
                      ? item
                      : {
                          ...item,
                          progress: Math.max(
                            item.progress,
                            progress.total_bytes > 0
                              ? Math.round((progress.loaded_bytes / progress.total_bytes) * 100)
                              : item.progress,
                          ),
                          speedBytesPerSec: progress.speed_bytes_per_sec || 0,
                        },
                  ),
                );
              },
            },
          );
          if (result?.upload_id && displayName.trim()) {
            await fileserverApi.updateProjectInputUploadDisplayName({
              upload_id: result.upload_id,
              project_id: projectId,
              display_name: displayName.trim(),
            });
          }
          setUploadQueue((current) =>
            current.map((item) =>
              item.status === 'failed' ? item : { ...item, status: 'completed', progress: 100, speedBytesPerSec: 0 },
            ),
          );
          return { uploadId: result.upload_id };
        } catch (error: any) {
          const message = error?.message || '上传失败';
          setUploadQueue((current) =>
            current.map((item) =>
              item.status === 'failed'
                ? item
                : { ...item, status: 'failed', progress: 0, speedBytesPerSec: 0, error: message },
            ),
          );
          throw error;
        } finally {
          onUploadStateChange?.(false);
        }
      },
    }));

    return (
      <div className="space-y-3">
        {/* 输入类型 + 是否解压 */}
        <div className={compact ? 'flex items-center gap-4' : 'space-y-3'}>
          <label className={compact ? 'flex items-center gap-2 text-sm font-semibold' : 'block text-sm font-semibold'} style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            输入类型
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value as InputType)}
              className={compact ? 'rounded-lg px-2 py-1.5 text-sm outline-none' : 'mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none'}
              style={{
                backgroundColor: 'var(--uploader-input-bg, #18233a)',
                color: 'var(--uploader-input-color, #d6def0)',
                border: '1px solid var(--uploader-border, #26324a)',
              }}
            >
              {INPUT_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>{INPUT_TYPE_META[type].label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={(e) => setKeepOriginal(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            保留原始文件，不自动解压
          </label>
        </div>

        {/* 文件选择 */}
        <div className="rounded-xl border border-dashed px-4 py-4 text-center" style={{ borderColor: 'var(--uploader-border, #26324a)' }}>
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            <Upload size={20} />
          </div>
          <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--uploader-input-color, #d6def0)' }}>
            {keepOriginal ? '上传原始文件' : '上传压缩包'}
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: 'var(--uploader-muted, #72809a)' }}>
            {keepOriginal
              ? '当前保留原始文件模式下，支持上传任意文件，一次可选择多个文件。'
              : '支持 zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz，一次可选择多个文件。'}
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--uploader-btn-bg, #18233a)',
                color: 'var(--uploader-input-color, #d6def0)',
                border: '1px solid var(--uploader-border, #26324a)',
              }}
            >
              选择文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
              className="hidden"
              onChange={(e) => addFilesToQueue(e.target.files)}
            />
          </div>
        </div>

        {/* 上传队列 */}
        <div className="space-y-2">
          {uploadQueue.length === 0 ? (
            <div className="rounded-lg px-3 py-3 text-sm" style={{ color: 'var(--uploader-muted, #72809a)', border: '1px solid var(--uploader-border, #26324a)' }}>
              还没有选择上传文件。
            </div>
          ) : (
            uploadQueue.map((item) => (
              <div key={item.id} className="rounded-lg px-3 py-3" style={{ border: '1px solid var(--uploader-border, #26324a)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" style={{ color: 'var(--uploader-input-color, #d6def0)' }}>{item.file.name}</div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--uploader-muted, #72809a)' }}>
                      {formatUploadBytes(item.file.size)} · {formatSpeed(item.speedBytesPerSec)}
                    </div>
                  </div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--uploader-muted, #72809a)' }}>
                    {item.error || item.status}
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: 'var(--uploader-input-bg, #18233a)' }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${item.progress}%`,
                      backgroundColor: item.status === 'failed' ? '#f15d5d' : 'var(--uploader-accent, #4f73ff)',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
);
```

**关于样式的说明**：该组件使用 CSS 自定义属性（`var(--uploader-*)`）作为主题接入点，带有 LOKI 暗色系的默认值。这使得组件能在不同页面上下文中使用（`TestInputPage` 使用 theme 类名，`CreateTaskDialog` 使用 LOKI inline style tokens）。两个父页面都不需要显式设置这些变量——默认值即对应 LOKI 暗色方案。如果 `TestInputPage` 需要匹配其 `theme-*` 类名体系，可在父容器上覆盖这些变量。

- [ ] **Step 2: 重构 `TestInputPage.tsx` 使用 `TestInputUploader`**

在 `pages/TestInputPage.tsx` 中：

**2a.** 添加 import（文件顶部）：
```tsx
import { TestInputUploader, TestInputUploaderHandle } from '../components/TestInputUploader';
```

**2b.** 在组件内部添加 ref（在 `fileInputRef` 附近，约 line 254）：
```tsx
const uploaderRef = useRef<TestInputUploaderHandle>(null);
```

**2c.** 替换上传模态框中的 UI 内容。将模态框中 line 1196-1276 的内容（从 `{!isAppendMode ? (` 到队列展示结束的 `</div>`）替换为：

当 `isAppendMode` 为 false 时，渲染 `TestInputUploader`（保留"上传记录名称"输入框在组件之外，因为该字段仅在 TestInputPage 的模态框中需要）：

```tsx
              {!isAppendMode ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-theme-text-secondary">上传记录名称</label>
                  <input
                    value={uploadDisplayName}
                    onChange={(event) => setUploadDisplayName(event.target.value)}
                    className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-primary"
                    placeholder="请输入上传记录名称"
                  />
                </div>
              ) : null}

              <TestInputUploader
                ref={uploaderRef}
                projectId={projectId}
                displayName={uploadDisplayName}
                compact={false}
                onUploadStateChange={setIsUploading}
              />
```

同时删除以下现在由 `TestInputUploader` 内部管理的代码（因为追加模式需要保留独立逻辑，下面有说明）：
- 输入类型选择器 UI（line 1207-1216）
- 是否解压复选框 UI（line 1220-1228）
- 文件上传区域 UI（line 1230-1256）
- 上传队列展示 UI（line 1259-1276）

**重要：追加模式处理**

追加模式（`isAppendMode === true`）使用不同的 API（`appendProjectInputUpload`），且不显示输入类型选择器。为了简化，追加模式**不**使用 `TestInputUploader`——保留原有的追加模式 UI（是否解压 + 文件上传 + 队列）和逻辑。这意味着模态框的结构变为：

```tsx
{isAppendMode ? (
  // 保留原有追加模式 UI：是否解压 + 文件上传 + 队列（使用组件内部 state）
  <>
    <label className="flex items-center gap-3 ...">
      <input type="checkbox" checked={keepOriginal} onChange={...} />
      保留原始文件，不自动解压
    </label>
    {/* 文件上传区域 - 保留原有代码 */}
    {/* 上传队列 - 保留原有代码 */}
  </>
) : (
  // 新建模式使用 TestInputUploader
  <>
    <div>
      <label>上传记录名称</label>
      <input value={uploadDisplayName} ... />
    </div>
    <TestInputUploader ref={uploaderRef} projectId={projectId} displayName={uploadDisplayName} />
  </>
)}
```

**2d.** 修改新建模式的提交逻辑。在 `submitUpload` 函数中，新建模式（非追加）的路径改为调用 `uploaderRef.current?.triggerUpload()`：

```tsx
const submitUpload = async (options?: { runInBackground?: boolean }) => {
  if (isAppendMode) {
    // 保留追加模式的原有逻辑不变
    // ...
  } else {
    // 新建模式：委托给 TestInputUploader
    if (!uploaderRef.current?.hasFiles()) return;
    if (!uploadDisplayName.trim()) {
      setErrorMessage('请填写上传记录名称');
      return;
    }
    setIsUploading(true);
    if (options?.runInBackground) {
      setIsUploadModalOpen(false);
    }
    try {
      await uploaderRef.current.triggerUpload();
      setIsUploadModalOpen(false);
      uploaderRef.current.reset();
      setUploadDisplayName('');
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error: any) {
      setErrorMessage(error?.message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  }
};
```

- [ ] **Step 3: 类型检查**

Run: `cd Chimera && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add components/TestInputUploader.tsx pages/TestInputPage.tsx
git commit -m "feat: extract TestInputUploader shared component from TestInputPage"
```

---

### Task 4: 集成 `TestInputUploader` 到 `CreateTaskDialog`

**Files:**
- Modify: `pages/task/CreateTaskDialog.tsx`

**Interfaces:**
- Consumes: `TestInputUploader` + `TestInputUploaderHandle` from `components/TestInputUploader`
- Produces: 仅 UI 行为变更

- [ ] **Step 1: 添加 imports 和 ref**

在 `pages/task/CreateTaskDialog.tsx` 顶部添加：
```tsx
import { useRef } from 'react';  // 合并到已有的 React import
import { TestInputUploader, TestInputUploaderHandle } from '../../components/TestInputUploader';
```

在已有 import 的 `React` 行中添加 `useRef`（line 1 当前为 `import React, { useEffect, useMemo, useState } from 'react';`）：
```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: 添加 ref 和上传状态**

在组件内部，`inputSource` state 附近（约 line 176），添加：
```tsx
const uploaderRef = useRef<TestInputUploaderHandle>(null);
const [uploading, setUploading] = useState(false);
```

- [ ] **Step 3: 修改 `inputSource` 默认值**

将 line 176：
```tsx
const [inputSource, setInputSource] = useState<'existing' | 'upload'>('existing');
```
改为：
```tsx
const [inputSource, setInputSource] = useState<'existing' | 'upload'>('upload');
```

- [ ] **Step 4: 替换"直接上传"stub**

将 line 743-746 的 stub：
```tsx
{inputSource === 'upload' ? (
  <div className="flex flex-col items-center gap-4 py-8">
    <p className="text-sm" style={{ color: LK.muted }}>直接上传功能即将支持</p>
  </div>
) : (
```

替换为：
```tsx
{inputSource === 'upload' ? (
  <TestInputUploader
    ref={uploaderRef}
    projectId={projectId}
    displayName={name}
    compact={true}
    onUploadStateChange={setUploading}
  />
) : (
```

- [ ] **Step 5: 修改 `canCreateTask` 逻辑**

当前 `canCreateTask`（line 208-214）仅检查"选择已有"模式的条件。需要增加"直接上传"分支：

将原来的 `canCreateTask` 表达式改为：

```tsx
  const canCreateTask = mode !== 'lion-head' && (
    inputSource === 'upload'
      ? Boolean(name)
      : (taskType === 'sechps_tool'
        ? Boolean(name && selectedAgentApp && selectedInputId && isDirectorySelectionValid)
        : Boolean(name && selectedInputId && (
          (selectionMode === 'file' && selectedRelativePath) ||
          (selectionMode === 'file_list' && selectedRelativePaths.length > 0) ||
          (selectionMode === 'directory' && isDirectorySelectionValid)
        ) && (taskType !== 'binary_module_e2e' || moduleName.trim())))
  );
```

注意：在 `inputSource === 'upload'` 模式下，仅检查 `name` 非空。文件是否已选择由 `uploaderRef.hasFiles()` 在提交时检查（因为 ref 值不触发 React 重渲染，不适合放在 `useMemo` 中）。

- [ ] **Step 6: 修改 `createTask` 提交函数**

将 `createTask` 函数（line 369-417）修改为支持"直接上传"模式：

```tsx
  const createTask = async () => {
    setSaving(true);
    setError('');
    try {
      let finalInputUploadId = selectedInputId;
      let finalInputBinding = {
        upload_id: selectedInputId,
        selection_type: selectionMode,
        relative_path: selectionMode === 'file_list' ? undefined : (selectionMode === 'directory' ? (selectedRelativePath !== null ? selectedRelativePath : undefined) : (selectedRelativePath || undefined)),
        relative_paths: selectionMode === 'file_list' ? selectedRelativePaths : undefined,
      };

      if (inputSource === 'upload') {
        if (!uploaderRef.current?.hasFiles()) {
          setError('请先选择要上传的文件');
          setSaving(false);
          return;
        }
        const uploadResult = await uploaderRef.current.triggerUpload();
        finalInputUploadId = uploadResult.uploadId;
        finalInputBinding = {
          upload_id: uploadResult.uploadId,
          selection_type: 'directory',
          relative_path: '',
          relative_paths: undefined,
        };
      }

      const sechpsInstruction = taskType === 'sechps_tool'
        ? resolveSechpsInstruction(instruction, selectedAgentApp?.startCommand)
        : '';
      const payload: ScheduleCenterUserTaskCreatePayload = {
        task_type: taskType,
        name,
        description,
        input_upload_ids: [finalInputUploadId],
        input_binding: finalInputBinding,
        policy: {},
        dispatch_policy: {},
        module_name: taskType === 'binary_module_e2e' ? moduleName : undefined,
        agent_app_id: taskType === 'sechps_tool' ? (selectedAgentApp?.id || undefined) : undefined,
        agent_app_name: taskType === 'sechps_tool' ? (selectedAgentApp?.name || undefined) : undefined,
        agent_app_engine: taskType === 'sechps_tool' ? (selectedAgentApp?.engine || undefined) : undefined,
        agent_app_agent_name: taskType === 'sechps_tool' ? (selectedAgentApp?.defaultAgentName || undefined) : undefined,
        agent_model_alias_id: taskType === 'sechps_tool' ? (selectedAgentApp?.modelAliasId || undefined) : undefined,
        agent_harness_path: taskType === 'sechps_tool' ? (selectedAgentApp?.agentHarnessPath || undefined) : undefined,
        instruction: taskType === 'sechps_tool' ? (sechpsInstruction || undefined) : undefined,
      };
      await scheduleApi.createUserTask(projectId, payload);
      /* reset form state */
      setName('');
      setDescription('');
      setMode('dragon-tail');
      setModuleName('');
      setSelectedAgentAppId('');
      setInstruction('');
      setSelectedRelativePath(null);
      setSelectedRelativePaths([]);
      setInputCurrentPath('');
      setDirectorySelectionTouched(false);
      setActiveCreateTab('basic');
      uploaderRef.current?.reset();
      onCreated();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 7: 更新"创建任务"按钮禁用逻辑**

在 footer 中的"创建任务"按钮（line 963-971），`disabled` 条件增加 `uploading`：

```tsx
disabled={saving || uploading || !canCreateTask}
```

按钮文本也增加上传中的状态提示：

```tsx
{saving ? '创建中...' : uploading ? '上传中...' : '创建任务'}
```

- [ ] **Step 8: 类型检查**

Run: `cd Chimera && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 9: 手动 UI 验证**

启动开发服务器（`npm run dev` 或 `npx vite`），验证以下场景：

1. **菜单顺序**：顶部菜单显示为 首页 → 项目管理 → 测试任务 → 漏洞中心 → 测试对象 → 测试环境
2. **任务列表**：无"删除全部任务"按钮、无"同步状态"列、"批量删除"和"立即同步"仍在
3. **创建任务对话框**：
   - 测试对象区域默认显示"直接上传"tab
   - 输入类型和是否解压在同一行
   - 可切回"选择已有"tab，原有功能正常
   - 选择文件后点击"创建任务"，先上传再创建
   - 上传失败时不创建任务，显示错误提示
4. **测试对象页面**：新建上传功能正常（使用了 TestInputUploader 组件）

- [ ] **Step 10: 提交**

```bash
git add pages/task/CreateTaskDialog.tsx
git commit -m "feat: integrate TestInputUploader into CreateTaskDialog — direct upload support"
```
