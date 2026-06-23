# 任务报告查看页面设计

> 日期：2026-06-22
> 状态：Draft

## 概述

替换测试任务列表中现有的"查看任务"按钮逻辑。原按钮按 `task_type` 跳转到各下游系统（binary-security-detail、source-security-detail 等）的详情页。新逻辑改为统一跳转到一个新的「任务报告查看页」，从 `/data/files/{projectId}/tasks/{taskId}/output` 目录读取 markdown 文档并渲染展示，同时根据 markdown 标题自动生成可收缩的目录。

## 需求

1. 所有任务类型统一使用"查看报告"按钮（替换原"查看任务"）
2. 点击后跳转到 `TaskReportViewPage`，读取并渲染 markdown 文档
3. 自动从 markdown heading 生成左侧目录导航（参照 `TaskReportStep` 的目录样式）
4. 目录侧边栏支持收缩/展开
5. Markdown 渲染需同时支持内嵌 HTML 元素
6. 文件名不固定，需先列目录找到 `.md` 文件

## 方案选择

**方案 A（已选）：前端直读 fileserver API**

前端直接使用已有的 `fileserverApi.getProjectFilesystemChildren()` + `fetchProjectFilesystemPreviewBlob()` 读取文件，零后端改动。

其他方案（已排除）：
- 方案 B：schedule 后端新增接口 — 需要改两个仓库，schedule 服务无文件读取能力
- 方案 C：fileserver WebSocket — 对静态报告过度复杂

## 架构

### 数据获取流程

```
用户点击"查看报告"
  → chimera-navigate-view { view: 'task-report-view', taskReportProjectId, taskReportTaskId }
  → App.tsx 处理事件，存入状态
  → viewRegistry 渲染 TaskReportViewPage

TaskReportViewPage 挂载：
  1. fileserverApi.getProjectFilesystemChildren(projectId, `/tasks/${taskId}/output`)
  2. 在 children 中找到第一个 .md 文件
  3. fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, `/tasks/${taskId}/output/${filename}`)
  4. blob.text() → markdown 字符串
  5. 从 markdown 提取 headings → TOC
  6. react-markdown 渲染
```

### 错误处理

- 目录不存在 / 空目录 / 无 .md 文件 → 显示"暂无报告"提示
- 网络错误 → 显示错误信息 + 重试按钮

## 组件设计

### 新增文件：`pages/task/TaskReportViewPage.tsx`

**Props：**
```typescript
interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}
```

**页面布局：**
```
┌──────────────────────────────────────────────────────┐
│ PageHeader: "任务报告"  [返回]               [刷新]   │
├─────────────┬────────────────────────────────────────┤
│ [折叠按钮]  │  Markdown 渲染区域                      │
│ 目录 (w-48) │                                        │
│             │  # 标题                                 │
│ > 标题   ←  │  ## 第一章                              │
│   第一章    │  内容...                                │
│   第二章    │  <table>HTML也支持</table>              │
│   ...      │                                        │
└─────────────┴────────────────────────────────────────┘
```

**TOC 生成逻辑：**
- 正则 `/^(#{1,4})\s+(.+)$/gm` 从 markdown 源文本提取所有 heading
- 生成 `{ level: number, text: string, id: string }` 数组
- `id` 用 slugify 逻辑生成（lowercase + 替换空格为 `-` + 去除特殊字符）
- 自定义 `h1`~`h4` 组件注入对应 `id` 属性
- 点击 TOC 项 → `document.getElementById(id).scrollIntoView({ behavior: 'smooth' })`
- 按层级缩进：h1 无缩进，h2 `pl-3`，h3 `pl-6`，h4 `pl-9`

**TOC 折叠：**
- 默认展开 `w-48`
- 折叠后只显示展开图标按钮
- 折叠状态用 `useState<boolean>` 控制

**Markdown 渲染配置：**
- `react-markdown` + `remarkGfm`（GFM 表格、删除线等）
- `rehypeRaw`（支持内嵌 HTML 元素）
- `rehypeSanitize` + `reportSanitizeSchema`（安全过滤）
- 自定义 `Components` 基于 TaskReportStep 的 `mdComponents` 扩展，h1-h4 加 `id` 属性

**状态管理：**
```typescript
const [markdown, setMarkdown] = useState('');
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [tocCollapsed, setTocCollapsed] = useState(false);
const [activeToc, setActiveToc] = useState('');
```

## 导航集成

### App.tsx

- 新增状态 `activeTaskReportProjectId` + `activeTaskReportTaskId`
- 监听事件 `chimera-navigate-view` detail 中的 `view: 'task-report-view'`
- 提取 `taskReportProjectId` 和 `taskReportTaskId` 设置到状态

### viewRegistry.tsx

```typescript
case 'task-report-view':
  return (
    <TaskReportViewPage
      projectId={ctx.activeTaskReportProjectId || ctx.selectedProjectId}
      taskId={ctx.activeTaskReportTaskId}
      onBack={() => ctx.setCurrentView('task-center')}
    />
  );
```

### TaskCenterPage.tsx

**`openTask` 改为：**
```typescript
const openTask = (task: ScheduleCenterUserTask) => {
  saveTaskCenterReturnContext();
  window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
    detail: {
      view: 'task-report-view',
      taskReportProjectId: selectedProjectId,
      taskReportTaskId: task.id,
    },
  }));
};
```

**按钮变更：**
- 文案从"查看任务"改为"查看报告"
- 移除 `isAdmin` 条件检查
- 移除 `task.task_type !== 'sechps_tool'` 条件
- 移除 `TASK_DOWNSTREAM_VIEW` 的判断（不再区分 task_type）

### ProjectDetailPage.tsx

同样改为导航到 `task-report-view`，使用 `task.id`。

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `pages/task/TaskReportViewPage.tsx` | 新增 | 核心页面组件 |
| `pages/task/TaskCenterPage.tsx` | 修改 | 替换 openTask 逻辑、按钮文案 |
| `pages/project/ProjectDetailPage.tsx` | 修改 | 替换 openTask 逻辑、按钮文案 |
| `app/viewRegistry.tsx` | 修改 | 新增 `task-report-view` case |
| `App.tsx` | 修改 | 新增状态 + 事件处理 |

## 不在范围内

- 后端接口改动（使用现有 fileserver API）
- markdown 编辑功能
- 文件上传功能
- Agent Harness 任务的特殊处理（统一使用报告页）
