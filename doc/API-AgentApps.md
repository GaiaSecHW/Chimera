# Agent 市场后端接口 SPEC

本文档定义 Chimera 开发者工具总览页中 Agent 市场相关后端接口。后端按本 SPEC 实现后，前端可完成 Agent 列表、创建、编辑、删除、同步、分支查看、模型选择和 Harness 上传。

## 1. 认证约定

所有接口都需要登录态认证。

请求头：

```http
Authorization: Bearer <chimera_token>
```

前端登录成功后将 token 存储在 `localStorage.chimera_token`，后续接口从当前登录态动态带出 Bearer Token。

## 2. 字段命名约定

### 2.1 部门范围

前端页面展示为“部门范围”，下拉只包含：

| 选项 | 前端含义 | 提交值 |
|------|----------|--------|
| 公开 | 所有人可见 | `isPublic=true`, `departmentId=''`, `tenantId=''` |
| 当前用户部门 | 当前登录用户所属部门可见 | `isPublic=false`, `departmentId=<用户部门ID>`, `tenantId=<用户部门ID>` |

说明：

- `departmentId` 是当前系统主字段。
- `tenantId` 仅作为兼容字段同步提交，后端可映射到同一部门字段。
- 当前登录用户部门来自 `/api/auth/validate-human-token` 返回的 `department_id` 和 `department_name`。

### 2.2 Agent说明

前端字段“Agent说明”提交到后端字段：

```text
inputRequirements
```

### 2.3 模型

前端字段“模型”提交到后端字段：

```text
modelAliasId
```

该字段关联 AI Gateway 模型别名。

### 2.4 Harness 上传

当前前端只提供“上传压缩包”，不提供上传文件夹。

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

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `department_id` | number \| null | 否 | 当前用户所属部门 ID |
| `department_name` | string \| null | 否 | 当前用户所属部门名称 |
| `department_member_id` | number \| null | 否 | 用户部门成员关系 ID |

## 4. 模型别名接口

### List Model Aliases

```http
GET /api/aigw/model-aliases
```

用途：创建/编辑 Agent 时填充“模型”下拉框。

请求头：

```http
Authorization: Bearer <chimera_token>
```

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

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | 是 | 模型别名 ID |
| `alias_name` | string | 是 | 模型别名名称，前端下拉展示该字段 |
| `enabled` | boolean | 是 | 前端只展示 `enabled !== false` 的数据 |
| `description` | string | 否 | 描述信息 |
| `max_tokens_default` | number | 是 | 默认最大 token |
| `temperature_default` | number | 是 | 默认 temperature |
| `created_at` | string | 否 | 创建时间 |
| `updated_at` | string | 否 | 更新时间 |

## 5. Agent App 数据模型

前端期望列表接口返回 `apps` 数组，单个 Agent App 结构如下：

```json
{
  "id": "agent-001",
  "name": "漏洞复核助手",
  "engine": "opencode",
  "agentHarnessPath": "/agents/security-reviewer.zip",
  "defaultAgentName": "security-reviewer",
  "startCommand": "npm run start",
  "inputRequirements": "输入漏洞编号和复核要求",
  "requireCodedmap": false,
  "status": "active",
  "isPublic": false,
  "departmentId": 2,
  "tenantId": 2,
  "modelAliasId": 1,
  "Tenant": {
    "name": "安全"
  },
  "User": {
    "name": "管理员",
    "username": "admin"
  },
  "_metrics": {
    "successRate": 95,
    "avgLatency": 3200,
    "runCount": 128,
    "lastRunAt": "2026-06-09T09:00:00Z"
  },
  "notes": "可选备注",
  "createdAt": "2026-06-09T09:00:00Z",
  "updatedAt": "2026-06-09T09:00:00Z"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | Agent App ID |
| `name` | string | 是 | Agent 名称 |
| `engine` | string | 是 | `opencode`、`claudecode` 或 `agentflow` |
| `agentHarnessPath` | string \| null | 否 | Harness 存储路径或仓库路径 |
| `defaultAgentName` | string | 是 | 默认 Agent 名称 |
| `startCommand` | string \| null | 否 | 启动命令 |
| `inputRequirements` | string \| null | 否 | Agent说明 |
| `requireCodedmap` | boolean | 否 | 当前前端不展示该字段，提交时默认为 `false` |
| `status` | string | 否 | 状态文本 |
| `isPublic` | boolean | 是 | 是否公开 |
| `departmentId` | number \| string \| null | 否 | 所属部门 ID |
| `tenantId` | number \| string \| null | 否 | 兼容字段，建议与 `departmentId` 一致 |
| `modelAliasId` | number \| null | 否 | 绑定的模型别名 ID |
| `Tenant.name` | string | 否 | 范围展示名称，兼容旧结构 |
| `User.name` | string \| null | 否 | 创建人展示名 |
| `User.username` | string | 否 | 创建人用户名 |
| `_metrics.successRate` | number | 否 | 成功率，百分比 |
| `_metrics.avgLatency` | number | 否 | 平均耗时，毫秒 |
| `_metrics.runCount` | number | 否 | 运行次数 |
| `_metrics.lastRunAt` | string | 否 | 最近运行时间 |
| `notes` | string | 否 | 备注 |
| `createdAt` | string | 否 | 创建时间 |
| `updatedAt` | string | 是 | 更新时间 |

## 6. Agent App 接口

### 6.1 List Agent Apps

```http
GET /api/agent-apps
```

用途：进入开发者工具总览页时加载 Agent 市场列表。

响应：

```json
{
  "apps": [
    {
      "id": "agent-001",
      "name": "漏洞复核助手",
      "engine": "opencode",
      "defaultAgentName": "security-reviewer",
      "startCommand": "npm run start",
      "inputRequirements": "输入漏洞编号和复核要求",
      "requireCodedmap": false,
      "status": "active",
      "isPublic": false,
      "departmentId": 2,
      "tenantId": 2,
      "modelAliasId": 1,
      "Tenant": { "name": "安全" },
      "User": { "name": "管理员", "username": "admin" },
      "_metrics": {
        "successRate": 95,
        "avgLatency": 3200,
        "runCount": 128,
        "lastRunAt": "2026-06-09T09:00:00Z"
      },
      "updatedAt": "2026-06-09T09:00:00Z"
    }
  ]
}
```

权限建议：

- 返回公开 Agent。
- 返回当前用户部门下的 Agent。
- 如超级管理员需要看全量，可由后端按角色扩展。

### 6.2 Create Agent App

```http
POST /api/agent-apps
Content-Type: multipart/form-data
```

用途：创建 Agent。

前端固定使用 `multipart/form-data`，因为创建时必须上传 Harness 压缩包。

FormData 示例：

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

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Agent 名称 |
| `engine` | string | 是 | `opencode`、`claudecode` 或 `agentflow` |
| `defaultAgentName` | string | 是 | 默认 Agent 名称 |
| `startCommand` | string | 否 | 启动命令 |
| `inputRequirements` | string | 否 | Agent说明 |
| `modelAliasId` | number/string | 否 | 模型别名 ID |
| `isPublic` | boolean/string | 是 | 是否公开，FormData 中是字符串 `true` 或 `false` |
| `requireCodedmap` | boolean/string | 是 | 当前前端提交 `false` |
| `departmentId` | number/string | 条件必填 | `isPublic=false` 时为当前用户部门 ID |
| `tenantId` | number/string | 否 | 兼容字段，值同 `departmentId` |
| `agentHarnessFileType` | string | 是 | 固定 `archive` |
| `agentHarnessFile` | file | 是 | Harness 压缩包 |

成功响应建议：

```json
{
  "id": "agent-001",
  "name": "漏洞复核助手",
  "engine": "opencode",
  "defaultAgentName": "security-reviewer",
  "inputRequirements": "输入漏洞编号和复核要求",
  "isPublic": false,
  "departmentId": 2,
  "tenantId": 2,
  "modelAliasId": 1,
  "agentHarnessPath": "/agents/agent-001/security-reviewer.zip",
  "updatedAt": "2026-06-09T09:00:00Z"
}
```

### 6.3 Update Agent App with JSON

```http
PUT /api/agent-apps/{id}
Content-Type: application/json
```

用途：编辑 Agent，但不替换 Harness 文件。

请求体示例：

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

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Agent 名称 |
| `engine` | string | 是 | `opencode`、`claudecode` 或 `agentflow` |
| `defaultAgentName` | string | 是 | 默认 Agent 名称 |
| `startCommand` | string \| null | 否 | 启动命令 |
| `inputRequirements` | string \| null | 否 | Agent说明 |
| `modelAliasId` | number \| null | 否 | 模型别名 ID |
| `requireCodedmap` | boolean | 是 | 当前前端提交 `false` |
| `isPublic` | boolean | 是 | 是否公开 |
| `departmentId` | number/string/null | 条件必填 | `isPublic=false` 时为当前用户部门 ID |
| `tenantId` | number/string/null | 否 | 兼容字段 |

### 6.4 Update Agent App with Harness

```http
PUT /api/agent-apps/{id}
Content-Type: multipart/form-data
```

用途：编辑 Agent 并替换 Harness 压缩包。

FormData 与创建接口一致：

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

### 6.5 Delete Agent App

```http
DELETE /api/agent-apps/{id}
```

用途：删除 Agent。

成功响应建议：

```json
{
  "success": true
}
```

### 6.6 List Harness Branches

```http
GET /api/agent-apps/{id}/branches
```

用途：展开 Agent 卡片时展示 Harness 分支列表。

响应：

```json
{
  "branches": [
    {
      "name": "main",
      "giteaUrl": "https://gitea.example.com/org/repo/src/branch/main"
    },
    {
      "name": "dev",
      "giteaUrl": "https://gitea.example.com/org/repo/src/branch/dev"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 分支名称 |
| `giteaUrl` | string | 是 | 分支跳转地址 |

### 6.7 Sync Agent Apps

```http
POST /api/agent-apps/sync
```

用途：点击页面“同步”按钮后触发后端同步 Agent 应用。

请求体：无。

成功响应建议：

```json
{
  "success": true,
  "synced": 3
}
```

前端调用成功后会重新请求 `GET /api/agent-apps`。

## 7. 校验规则建议

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
- `tenantId` 与 `departmentId` 同时存在时，优先使用 `departmentId`。

## 8. 错误响应约定

建议统一返回：

```json
{
  "message": "错误描述"
}
```

前端会通过公共 `handleResponse` 读取错误信息并展示。

常见状态码建议：

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

## 9. 前端当前提交格式汇总

### 创建时

创建接口始终提交 `multipart/form-data`：

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

与创建时相同，使用 `multipart/form-data`，方法为：

```http
PUT /api/agent-apps/{id}
```

## 10. 前端操作步骤

1. 登录系统 -> 表现：系统保存 `chimera_token`，并通过 `/api/auth/validate-human-token` 获取当前用户部门信息。
2. 打开“开发者 / 工具总览” -> 表现：页面请求 `/api/agent-apps` 展示 Agent 市场，同时请求 `/api/aigw/model-aliases` 填充模型下拉数据。
3. 点击“创建 Agent” -> 表现：弹出创建窗口，部门范围只展示“公开”和当前用户部门。
4. 选择模型并上传 Harness 压缩包 -> 表现：页面记录 `modelAliasId` 和压缩包文件。
5. 点击提交 -> 表现：前端向 `/api/agent-apps` 发送 `multipart/form-data`。
6. 编辑 Agent 且不重新上传 Harness -> 表现：前端向 `/api/agent-apps/{id}` 发送 JSON。
7. 编辑 Agent 并重新上传 Harness -> 表现：前端向 `/api/agent-apps/{id}` 发送 `multipart/form-data`。
