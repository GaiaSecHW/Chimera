# 漏洞上报：SDK 下载与认证上报方式

本页说明如何向「漏洞中心」上报安全漏洞，包含 SDK 下载、公共字段、文件上报规则、示例 payload 与认证正式上报接口。

## 1. SDK 下载

平台提供多种上报 SDK，**所有方式均需认证**。实际目录、版本与下载地址通过接口动态获取：

```
GET /api/vuln/public/intake/catalog
```

返回的 `items` 包含以下类别（`kind`）：

| kind | 说明 |
| --- | --- |
| `cli` | 命令行上报工具 |
| `plugin` | 插件式上报 |
| `skill` | 技能/流程式上报 |
| `openapi` | OpenAPI 规范上报 |

每个 SDK 卡片包含：标题、描述、`filename`、`download_url`、目录 `version`（默认 `1.0.0`）。

## 2. 公共字段

上报 payload 的公共字段如下（`required` 标注是否必填）：

| 字段 | 必填 | 说明 |
| --- | :---: | --- |
| `project_id` | ✅ | 目标项目标识，正式上报时用于项目绑定与项目级权限校验。 |
| `report_id` |  | 上报方自己的唯一编号，用于追踪、复核与后续回调。 |
| `title` | ✅ | 漏洞标题。 |
| `summary` |  | 漏洞摘要与简要说明。 |
| `severity` | ✅ | 风险等级，只支持严重、高危、中危、低危四档。 |
| `cvss_score` | ✅ | CVSS 基础分最终分，用于统一量化风险。 |
| `confidence` | ✅ | 置信度，0 到 100。 |
| `state` | ✅ | 上报方当前判断，默认建议为 `suspected`。 |
| `category` |  | 通用问题类别，例如 `sql_injection`。 |
| `rule_id` / `rule_name` |  | 插件或工具自身规则标识。 |
| `fingerprint` |  | 上报方自己的指纹，平台只保留不做去重。 |
| `reported_at` |  | 来源实际发现时间。 |
| `reporter` | ✅ | 上报者身份，必须包含 `name`、`version`、`type`，建议同时带 `endpoint`。 |
| `subject` | ✅ | 被上报对象，必须包含 `type` 与 `locator`。 |
| `evidence` |  | 轻量证据摘要、复现提示、引用列表。 |
| `artifacts` |  | 文件、目录、脚本、截图、原始结果等产物清单。 |
| `metadata` |  | 所有非统一字段统一放入这里。 |

## 3. 自定义元数据（`metadata.*`）

| key | 说明 |
| --- | --- |
| `metadata.source` | 来源特有字段，例如扫描模式、插件配置、执行入口。 |
| `metadata.runtime` | 运行环境、容器、节点、账号、网络上下文等。 |
| `metadata.tool_output` | 原始扫描输出、回包摘要、AST/IR 摘要等。 |
| `metadata.custom` | 上报方完全自定义的字段，平台原样保存。 |

## 4. 文件与文件夹上报（`artifacts`）

| 场景 | 说明 |
| --- | --- |
| 单文件上报 | 使用 `kind=file/text/json/binary`，支持 `content` 内联内容或 `content_ref` 外部引用。 |
| 文件夹结构上报 | 使用 `kind=directory` 或 `tree`，并通过 `children` 递归表达目录树结构。 |
| 压缩包或外部文件 | 使用 `kind=archive`，并通过 `content_ref` 指向外部文件或对象存储引用。 |
| 二进制内容 | 使用 `kind=binary`，`encoding=base64`，将内容以内联 base64 传递。 |
| 清单与引用混合 | 可以在一个 `artifacts` 数组中同时放目录清单、文本文件和 `content_ref` 引用。 |

> 目录结构请使用 `artifacts[].children` 递归表达；外部文件、压缩包、大文件或已有上传对象请放在 `content_ref`；文本、JSON、二进制小文件可直接通过 `content` 内联传递。

## 5. 示例 payload

各模式（`cli` / `plugin` / `skill` / `openapi`）的完整示例 payload 通过接口动态获取：

```
GET /api/vuln/public/intake/example/{kind}
```

返回的 JSON 即为该模式下的标准上报体结构，可在此基础上替换 `project_id`、`title`、`severity` 等字段后直接使用。

## 6. 认证正式上报（公开 API）

### 接口

```
POST /api/vuln/public/intake/submissions
```

- **必填**：`project_id`、`title`、`severity`、`cvss_score`、`confidence`、`reporter`、`subject`
- **定位**：`project_id` 标识目标项目，并执行项目级权限校验
- **认证**：请求必须携带 `Bearer Token`（复用 auth 微服务登录态）
- **限制**：不支持匿名上报
- **行为**：后端会自动记为 `created_by_type=human`，`created_by` 取认证身份
- **关联**：请在 `reporter.name`、`reporter.version` 中明确上报者身份，便于后续验证复现回调
- **文件**：简易上报可不传 `artifacts`；正常上报建议通过 `artifacts` 传递文件和目录结构

### 项目级 Token

- 标识：`project-sdk:{project_id}`（或返回的 `machine_code`）
- 作用域：默认 `project`
- 过期：未返回 `expires_at` 时为永不过期

Token 通过项目级接口刷新获取，复制后作为 `Authorization: Bearer <token>` 使用。

### 推荐上报流程

1. 先获取项目级认证 Token（auth 微服务登录态）。
2. 选择模式：简易上报（不带文件）或正常上报（带文件/目录）。
3. 组装 payload 并调用认证接口，后续可按返回漏洞 ID 继续补充资料。

### curl 示例

简易上报（不带文件）：

```bash
curl -X POST "/api/vuln/public/intake/submissions" \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  --data @payload-simple.json
```

正常上报（带文件）：

```bash
curl -X POST "/api/vuln/public/intake/submissions" \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  --data @payload-with-files.json
```

### OpenAPI 模板

完整接口规范可通过 OpenAPI 模板接口获取：

```
GET /api/vuln/public/intake/openapi.json
```

（对应前端 `vulnApi.vuln.getPublicOpenApiSpecUrl()`）
