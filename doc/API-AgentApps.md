# Agent 市场后端接口 SPEC（对齐后端实现）

本文档定义 Chimera 开发者工具总览页中 Agent 市场相关后端接口。所有接口使用 `/api` 前缀并要求 `Authorization: Bearer <token>`，除非路由显式标记为公开。

## 1. 认证约定

所有接口都需要登录态认证。

请求头：

```http
Authorization: Bearer <chimera_token>
```

前端登录成功后将 token 存储在 `localStorage.chimera_token`，后续接口从当前登录态动态带出 Bearer Token。

## 2. 字段命名约定

### 2.1 部门范围

前端页面展示为"部门范围"，下拉只包含：

| 选项 | 前端含义 | 提交值 |
|------|----------|--------|
| 公开 | 所有人可见 | `isPublic=true`, `departmentId=''`, `tenantId=''` |
| 当前用户部门 | 当前登录用户所属部门可见 | `isPublic=false`, `departmentId=<用户部门ID>`, `tenantId=<用户部门ID>` |

说明：

- `departmentId` 是当前系统主字段。
- `tenantId` 仅作为兼容字段同步提交，后端可映射到同一部门字段。
- 当前登录用户部门来自 `/api/auth/validate-human-token` 返回的 `department_id` 和 `department_name`。

### 2.2 Agent说明

前端字段"Agent说明"提交到后端字段：

```text
inputRequirements
```

### 2.3 模型

前端字段"模型"提交到后端字段：

```text
modelAliasId
```

该字段关联 AI Gateway 模型别名。

### 2.4 Harness 上传

当前前端只提供"上传压缩包"，不提供上传文件夹。

压缩包通过 `multipart/form-data` 提交：

| FormData 字段 | 类型 | 说明 |
|---------------|------|------|
| `agentHarnessFileType` | string | 固定为 `archive` |
| `agentHarnessFile` | file | 用户选择的 `.zip`、`.tar`、`.gz`、`.tgz`、`.7z` 等压缩包 |

## 3. 用户信息接口依赖

### Validate Human Token

```http
POST /api/auth/validate-human-token
```

前端已存在调用，用于登录后校验 token 并获取当前用户信息。

响应至少需要包含：

```json
{
  "id": 1,
  "username": "admin",
  "is_active": true,
  "role": ["admin"],
  "platform_role": "ordinary_admin",
  "department_member_id": 10,
  "department_id": 2,
  "department_name": "安全"
}
```

## 4. 模型别名接口

### List Model Aliases

```http
GET /api/aigw/model-aliases
Authorization: Bearer <chimera_token>
```

用途：创建/编辑 Agent 时填充"模型"下拉框。

响应：

```json
[
  {
    "id": 1,
    "alias_name": "claude-sonnet",
    "max_tokens_default": 4096,
    "temperature_default": 0.7,
    "enabled": true,
    "description": "默认开发模型",
    "created_at": "2026-06-09T09:00:00Z",
    "updated_at": "2026-06-09T09:00:00Z"
  }
]
```

前端只展示 `enabled !== false` 的数据。

## 5. Agent App 数据模型

后端返回的 Agent App 结构如下（不含 `_metrics`、`Tenant`、`User` 嵌套对象）：

```json
{
  "id": "string",
  "userId": "string",
  "tenantId": "string | null",
  "departmentId": 1,
  "modelAliasId": 1,
  "name": "string",
  "engine": "opencode | claudecode | agentflow",
  "agentHarnessPath": "/data/agent-harness/{repoName}",
  "agentHarnessRepoName": "{repoName}",
  "agentHarnessGiteaUrl": "http://localhost:10081/agent-harness/{repoName}",
  "defaultAgentName": "string",
  "startCommand": "string | null",
  "notes": "string | null",
  "inputRequirements": "string | null",
  "requireCodedmap": false,
  "status": "active",
  "isPublic": false,
  "createdAt": "2026-06-10T00:00:00.000Z",
  "updatedAt": "2026-06-10T00:00:00.000Z"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | Agent App ID |
| `userId` | string | 是 | 创建者用户 ID（前端展示当前登录用户名代替） |
| `name` | string | 是 | Agent 名称 |
| `engine` | string | 是 | `opencode`、`claudecode` 或 `agentflow` |
| `agentHarnessPath` | string | 否 | Harness 存储路径 |
| `agentHarnessRepoName` | string | 否 | Gitea 仓库名 |
| `agentHarnessGiteaUrl` | string | 否 | Gitea 仓库 URL |
| `defaultAgentName` | string | 是 | 默认 Agent 名称 |
| `startCommand` | string | 否 | 启动命令 |
| `inputRequirements` | string | 否 | Agent 说明 |
| `requireCodedmap` | boolean | 否 | 前端默认提交 `false` |
| `status` | string | 否 | 状态文本 |
| `isPublic` | boolean | 是 | 是否公开 |
| `departmentId` | number | 否 | 所属部门 ID |
| `tenantId` | string | 否 | 兼容字段 |
| `modelAliasId` | number | 否 | 绑定的模型别名 ID |
| `notes` | string | 否 | 备注 |
| `createdAt` | string | 否 | 创建时间 |
| `updatedAt` | string | 是 | 更新时间 |

**说明：** 后端不返回 `_metrics`、`Tenant`、`User` 嵌套对象。前端：
- "开发者"字段使用当前登录用户名 `user.username`
- "私有 · 部门名称" 使用当前登录用户部门名 `user.department_name`

## 6. Agent App 接口

### 6.1 List Agent Apps

```http
GET /api/agent-apps?departmentId=<id>&tenantId=<id>
Authorization: Bearer <chimera_token>
```

用途：进入开发者工具总览页时加载 Agent 市场列表。

查询参数：
- `departmentId`：过滤指定部门的 Agent（可选）
- `tenantId`：兼容过滤参数（可选）

不传参数时返回所有公开 + 当前用户部门的 Agent。

响应：

```json
{
  "apps": [
    {
      "id": "agent-001",
      "userId": "string",
      "name": "漏洞复核助手",
      "engine": "opencode",
      "agentHarnessPath": "/data/agent-harness/repo-001",
      "agentHarnessRepoName": "repo-001",
      "agentHarnessGiteaUrl": "http://localhost:10081/agent-harness/repo-001",
      "defaultAgentName": "security-reviewer",
      "startCommand": "npm run start",
      "inputRequirements": "输入漏洞编号和复核要求",
      "requireCodedmap": false,
      "status": "active",
      "isPublic": false,
      "departmentId": 2,
      "tenantId": "2",
      "modelAliasId": 1,
      "updatedAt": "2026-06-10T00:00:00.000Z"
    }
  ]
}
```

前端调用时传入当前用户 `departmentId` 和 `tenantId`（值相同）。

### 6.2 Get Agent App

```http
GET /api/agent-apps/:id
Authorization: Bearer <chimera_token>
```

响应（注意使用 `{app: {...}}` 包装）：

```json
{
  "app": {
    "id": "agent-001",
    "userId": "string",
    "name": "漏洞复核助手",
    "engine": "opencode",
    "agentHarnessPath": "/data/agent-harness/repo-001",
    "agentHarnessRepoName": "repo-001",
    "agentHarnessGiteaUrl": "http://localhost:10081/agent-harness/repo-001",
    "defaultAgentName": "security-reviewer",
    "status": "active",
    "isPublic": false,
    "updatedAt": "2026-06-10T00:00:00.000Z"
  }
}
```

### 6.3 Create Agent App

```http
POST /api/agent-apps
Content-Type: multipart/form-data
Authorization: Bearer <chimera_token>
```

用途：创建 Agent。

FormData：

```text
name=漏洞复核助手
engine=opencode
defaultAgentName=security-reviewer
startCommand=npm run start
inputRequirements=输入漏洞编号和复核要求
modelAliasId=1
isPublic=false
requireCodedmap=false
departmentId=2
tenantId=2
agentHarnessFileType=archive
agentHarnessFile=<binary file>
```

**响应：返回创建的实体直接（无 `{app: ...}` 包装）**：

```json
{
  "id": "agent-001",
  "userId": "string",
  "name": "漏洞复核助手",
  "engine": "opencode",
  "agentHarnessPath": "/data/agent-harness/repo-001",
  "agentHarnessRepoName": "repo-001",
  "agentHarnessGiteaUrl": "http://localhost:10081/agent-harness/repo-001",
  "defaultAgentName": "security-reviewer",
  "isPublic": false,
  "departmentId": 2,
  "tenantId": "2",
  "modelAliasId": 1,
  "updatedAt": "2026-06-10T00:00:00.000Z"
}
```

### 6.4 Update Agent App

```http
PUT /api/agent-apps/:id
Authorization: Bearer <chimera_token>
```

两种 Content-Type：

**JSON 更新（不替换 Harness）：**

```json
{
  "name": "漏洞复核助手",
  "engine": "opencode",
  "defaultAgentName": "security-reviewer",
  "startCommand": "npm run start",
  "inputRequirements": "输入漏洞编号和复核要求",
  "modelAliasId": 1,
  "requireCodedmap": false,
  "isPublic": false,
  "departmentId": 2,
  "tenantId": 2
}
```

**multipart/form-data 更新（替换 Harness）：**

与创建接口一致的 FormData，但 `agentHarnessFile` 可选。

**响应：**

```json
{
  "app": {
    "id": "agent-001",
    "userId": "string",
    "name": "漏洞复核助手",
    "engine": "opencode",
    "defaultAgentName": "security-reviewer",
    "isPublic": false,
    "departmentId": 2,
    "updatedAt": "2026-06-10T00:00:00.000Z"
  },
  "giteaUploaded": true
}
```

### 6.5 Delete Agent App

```http
DELETE /api/agent-apps/:id
Authorization: Bearer <chimera_token>
```

响应：

```json
{
  "success": true
}
```

同时删除对应的 Gitea 仓库和本地 Harness 目录。

### 6.6 List Harness Branches

```http
GET /api/agent-apps/:id/branches
Authorization: Bearer <chimera_token>
```

响应：

```json
{
  "branches": [
    {
      "name": "main",
      "commit": {},
      "protected": false
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 分支名称 |
| `commit` | object | Gitea 原始 commit 信息 |
| `protected` | boolean | 是否受保护分支 |

注意：分支列表无 `giteaUrl` 字段。前端可通过 `agentHarnessGiteaUrl` + `/src/branch/{name}` 构造跳转地址。

### 6.7 Sync Agent Apps（保留 stub）

```http
POST /api/agent-apps/sync
Authorization: Bearer <chimera_token>
```

响应：

```json
{
  "success": true,
  "message": "Gitea sync is reserved for implementation after connection details are confirmed."
}
```

前端调用成功后展示 `message` 内容并重新请求 Agent 列表。

## 7. Agent Definitions（新接口）

```http
GET /api/agent-definitions
Authorization: Bearer <chimera_token>
```

返回活跃的 Agent Definition 记录（按创建时间倒序）：

```json
{
  "agents": [
    {
      "id": "string",
      "userId": "string",
      "tenantId": "string | null",
      "name": "string",
      "displayName": "string",
      "description": "string | null",
      "category": "string | null",
      "modelConfigId": "string | null",
      "model": "string | null",
      "systemPrompt": "string | null",
      "allowedTools": ["string"],
      "skills": ["string"],
      "isActive": true,
      "isBuiltin": false,
      "isPublic": false,
      "createdAt": "2026-06-10T00:00:00.000Z",
      "updatedAt": "2026-06-10T00:00:00.000Z"
    }
  ]
}
```

当前前端未使用此接口，预留供未来 Agent Definition 管理使用。

## 8. Docs

```http
GET /api/docs/agent-harness
```

返回开发者指南 markdown 文本：

```json
{
  "content": "markdown document content"
}
```

此接口为公开路由，不需要认证。

## 9. 校验规则建议

### 创建 Agent

后端至少校验：

- `name` 非空。
- `engine` 只能是 `opencode`、`claudecode`、`agentflow`。
- `defaultAgentName` 非空。
- 创建时必须包含 `agentHarnessFile`。
- `agentHarnessFileType` 当前只接受 `archive`。
- `isPublic=false` 时必须有 `departmentId` 或兼容字段 `tenantId`。
- `modelAliasId` 如果传入，必须能匹配存在且启用的模型别名。

### 编辑 Agent

后端至少校验：

- JSON 更新不要求上传 Harness。
- Multipart 更新如果包含 `agentHarnessFile`，则替换原 Harness。
- `isPublic=true` 时清空部门归属。
- `isPublic=false` 时保存当前部门归属。

## 10. 错误响应约定

建议统一返回：

```json
{
  "message": "错误描述"
}
```

前端通过公共 `handleResponse` 读取错误信息并展示。

常见状态码：

| 状态码 | 场景 |
|--------|------|
| 400 | 参数格式错误、缺少必填字段 |
| 401 | 未登录或 token 无效 |
| 403 | 无权限操作该 Agent |
| 404 | Agent 或模型别名不存在 |
| 409 | Agent 名称冲突 |
| 413 | Harness 文件过大 |
| 415 | Harness 文件类型不支持 |
| 500 | 服务端内部错误 |

## 11. 前端当前提交格式汇总

### 创建时

```text
POST /api/agent-apps
Authorization: Bearer <chimera_token>
Content-Type: multipart/form-data

name=<string>
engine=<opencode|claudecode|agentflow>
defaultAgentName=<string>
startCommand=<string, optional>
inputRequirements=<string, optional>
modelAliasId=<number string, optional>
isPublic=<true|false>
requireCodedmap=false
departmentId=<current department id or empty>
tenantId=<current department id or empty>
agentHarnessFileType=archive
agentHarnessFile=<File>
```

### 编辑但不换 Harness

```json
PUT /api/agent-apps/{id}
Authorization: Bearer <chimera_token>
Content-Type: application/json

{
  "name": "<string>",
  "engine": "opencode",
  "defaultAgentName": "<string>",
  "startCommand": "<string or null>",
  "inputRequirements": "<string or null>",
  "modelAliasId": 1,
  "requireCodedmap": false,
  "isPublic": false,
  "departmentId": 2,
  "tenantId": 2
}
```

### 编辑并替换 Harness

与创建时相同，使用 `multipart/form-data`，方法为 PUT。

## 12. 前端操作步骤

1. 登录系统 → 表现：系统保存 `chimera_token`，通过 `/api/auth/validate-human-token` 获取当前用户部门信息。
2. 打开"开发者 / 工具总览" → 表现：页面请求 `GET /api/agent-apps?departmentId=<id>&tenantId=<id>` 展示 Agent 市场，同时请求 `GET /api/aigw/model-aliases` 填充模型下拉数据。
3. 点击"创建新工具" → 表现：弹出创建窗口，部门范围只展示"公开"和当前用户部门。
4. 选择模型并上传 Harness 压缩包 → 表现：页面记录 `modelAliasId` 和压缩包文件，ZIP 自动解析引擎配置。
5. 点击提交 → 表现：前端向 `POST /api/agent-apps` 发送 `multipart/form-data`，成功后刷新列表。
6. 编辑 Agent 且不重新上传 Harness → 表现：前端向 `PUT /api/agent-apps/{id}` 发送 JSON。
7. 编辑 Agent 并重新上传 Harness → 表现：前端向 `PUT /api/agent-apps/{id}` 发送 `multipart/form-data`。
8. 删除 Agent → 表现：前端向 `DELETE /api/agent-apps/{id}` 发送请求，成功后刷新列表。