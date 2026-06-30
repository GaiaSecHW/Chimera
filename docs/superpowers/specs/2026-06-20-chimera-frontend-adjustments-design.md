# Chimera 前端调整设计文档

日期: 2026-06-20

## 概述

对 Chimera 前端进行四项改动：调整顶部菜单顺序、移除"删除全部任务"按钮、在创建任务对话框中集成直接上传能力、移除任务列表"同步状态"列。

## 变更 1：顶部菜单顺序调整

**文件**: `app/navigation.tsx`

修改 `TOP_LEVEL_NAV_ITEMS` 数组中前六项的顺序：

| 当前顺序 | 目标顺序 |
|---|---|
| 首页 | 首页 |
| 项目管理 | 项目管理 |
| 测试对象 | **测试任务** |
| 测试任务 | **漏洞中心** |
| 测试环境 | **测试对象** |
| 漏洞中心 | **测试环境** |

仅改数组元素顺序，不改 id/label/role 等属性。其余菜单项（资产、评测、观测等）顺序不变。

## 变更 2：移除"删除全部任务"按钮

**文件**: `pages/task/TaskCenterPage.tsx`

移除内容：
- 按钮 UI（约 `:494-505`，显示"删除全部任务（N）"）
- `submitDeleteAllFiltered` 处理函数（`:317-342`）
- `deletableTaskIds` 计算逻辑（仅在该按钮使用的情况下）

保留：
- "批量删除"（选中删除）按钮及其逻辑不动

## 变更 3：创建任务对话框集成直接上传

这是最复杂的变更，分三部分。

### 3.1 提取共享组件 `TestInputUploader`

**新文件**: `components/TestInputUploader.tsx`

从 `pages/TestInputPage.tsx` 的上传模态框中提取以下功能为独立组件：
- 输入类型选择器（文档/代码/软件包/其他）
- 是否解压复选框（"保留原始文件，不自动解压"）
- 文件选择按钮 + 文件类型校验（keepOriginal=false 时仅允许压缩包）
- 上传队列展示（文件名、进度条、速度）

**组件接口**:

```tsx
interface TestInputUploaderHandle {
  triggerUpload: () => Promise<{ uploadId: string }>;
  hasFiles: () => boolean;
  reset: () => void;
}

interface TestInputUploaderProps {
  projectId: string;
  displayName: string;       // 上传记录名（创建任务时取任务名）
  compact?: boolean;         // true: 输入类型+是否解压同一行；false: 分两行（默认）
  onUploadStateChange?: (uploading: boolean) => void;
}
```

组件内部管理状态：
- `inputType: InputType`（默认 `'document'`）
- `keepOriginal: boolean`（默认 `false`）
- `uploadQueue: UploadQueueItem[]`
- `fileInputRef`

父组件通过 `React.useRef<TestInputUploaderHandle>` 获取命令式方法：
- `triggerUpload()`: 执行上传，调用 `fileserverApi.createProjectInputUpload()`，上传完成后调用 `updateProjectInputUploadDisplayName()`。返回 Promise，成功 resolve `{ uploadId }`，失败 reject。
- `hasFiles()`: 检查是否已选择文件。
- `reset()`: 清空队列和状态。

`compact={true}` 布局（CreateTaskDialog 使用）：
```
┌──────────────────────────────────────────────────┐
│  输入类型: [文档 ▾]    ☐ 保留原始文件，不自动解压   │  ← flex-row gap-4，一行
│                                                  │
│  [选择文件]                                       │
│  file1.zip  ████████░░ 80%  2.3MB/s              │
└──────────────────────────────────────────────────┘
```

复用的代码/逻辑来源（均来自 `pages/TestInputPage.tsx`）：
- `InputType` 类型定义和 `INPUT_TYPE_META` / `INPUT_TYPE_ORDER`（`:36`, `:59-66`）
- `UploadQueueItem` 接口（`:45-52`）
- `isAllowedArchiveFileName` 校验（`:524`）
- `addFilesToQueue` 逻辑（`:521-535`）
- 上传 API 调用（`:596-614`）— `fileserverApi.createProjectInputUpload`
- 上传记录命名（`:617-621`）— `fileserverApi.updateProjectInputUploadDisplayName`

### 3.2 CreateTaskDialog 集成

**文件**: `pages/task/CreateTaskDialog.tsx`

#### 默认子模式

`inputSource` 的 `useState` 初始值从 `'existing'` 改为 `'upload'`。

#### 替换 stub

将当前 "直接上传功能即将支持" 占位符（`:743-746`）替换为：

```tsx
<TestInputUploader
  ref={uploaderRef}
  projectId={projectId}
  displayName={taskName}
  compact={true}
  onUploadStateChange={setUploading}
/>
```

#### 创建任务流程

点击"创建任务"按钮后的逻辑分支：

```
inputSource === 'existing':
  → 走原有逻辑（选择已有上传记录 → 创建任务）

inputSource === 'upload':
  1. 校验：任务名非空、uploaderRef.hasFiles() === true
  2. 调用 uploaderRef.triggerUpload()
     - 内部执行 fileserverApi.createProjectInputUpload({
         project_id, input_type, keep_original,
         upload_mode: keepOriginal ? 'raw' : 'archive', files
       })
     - 上传完成后设置 displayName 为任务名
     - 返回 { uploadId }
  3. 用 uploadId 创建任务：
     - input_upload_ids: [uploadId]
     - 原有 createTask API 调用
  4. 错误处理：
     - 上传失败 → 提示错误信息，不创建任务，用户可重试
     - 任务创建失败 → 提示错误（上传记录已存在，不会丢失）
```

#### 按钮状态

"创建任务"按钮在上传过程中显示 loading 状态（Loader2 图标 + 禁用），防止重复提交。

### 3.3 TestInputPage 重构

**文件**: `pages/TestInputPage.tsx`

将模态框中的上传 UI（输入类型选择器、是否解压复选框、文件选择、队列展示）替换为 `<TestInputUploader compact={false} />`。

模态框自身仍负责：
- 打开/关闭逻辑
- "后台运行" vs "创建上传记录" 两个提交按钮
- 追加模式（`isAppendMode`）处理——追加模式下不显示输入类型选择器（与现有行为一致）
- 模态框标题切换（"新建上传" vs "追加上传"）

注意：追加模式使用不同的 API（`appendProjectInputUpload`），TestInputUploader 的 `triggerUpload` 需要支持区分创建和追加，或者追加模式由 TestInputPage 自行处理上传调用而不通过 `triggerUpload`。推荐后者——追加模式下 TestInputPage 直接调用 append API，仅复用 TestInputUploader 的 UI 部分（文件选择 + 队列），不调用 `triggerUpload`。

## 变更 4：移除任务列表"同步状态"列

**文件**: `pages/task/TaskCenterPage.tsx`

移除内容：
- 表头 `<th>同步状态</th>`（`:544`）
- 表体对应 `<td>` 单元格（`:585-587`）
- `getSyncSummary` 辅助函数（`:69-75`），如无其他调用方

保留：
- "操作"列中的"立即同步"按钮不动
- `requestSync` 处理函数及相关 API 调用不动

## 涉及文件清单

| 文件 | 操作 |
|---|---|
| `app/navigation.tsx` | 修改：调整菜单顺序 |
| `pages/task/TaskCenterPage.tsx` | 修改：移除"删除全部任务"按钮 + "同步状态"列 |
| `pages/task/CreateTaskDialog.tsx` | 修改：集成 TestInputUploader，改默认子模式 |
| `pages/TestInputPage.tsx` | 修改：提取上传逻辑到共享组件 |
| `components/TestInputUploader.tsx` | 新建：共享上传组件 |

## 不变项

- 所有 API client（`clients/fileserver.ts`, `clients/scheduleCenter.ts`）不修改
- "批量删除"（选中删除）功能保留
- "立即同步"操作按钮保留
- "选择已有"子模式功能保留（但不再是默认）
- 创建任务对话框的两步 tab（基础信息 / 动态验证环境）结构不变
