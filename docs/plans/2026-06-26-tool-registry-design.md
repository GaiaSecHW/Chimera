# 工具注册中心(Tool Registry)设计

日期:2026-06-26
范围:MVP 闭环优先
权威后端:扩展 AgentManage(NestJS + MySQL)

## 背景与问题

当前「工具」入口存在两套互不相通的来源:

1. **前端硬编码** —— `toolCatalog.ts`(4 个工具)+ `navigation.tsx`(写死的「开发者工具」9 项菜单),完全静态。
2. **AgentManage 市场**(NestJS + MySQL)—— 开发者上传 Agent harness(`agent_app`:engine、gitea 仓库、`is_public`、`status`),另有 `agent_definition`。

后果:工具来源混乱,有的是开发者上传的 Agent,有的写死在前端菜单。没有统一的「准生证」概念,无法以注册状态为闸门控制下游能力。

> 现状事实(实现前必读):核实代码后确认,**现状菜单 100% 来自硬编码 `navigation.tsx`**。前端没有任何运行时菜单来源——「开发者工具」分组的 9 项、`toolCatalog.ts` 的 4 项卡片,全是写死的常量。改造的核心就是把这份硬编码迁移到工具注册中心,由准生证状态驱动。

## 目标

把「工具」按钮做成系统工具的**准生证注册中心**:注册 ≠ 可用;只有审核通过(状态=online)的工具才能被下游使用——开放给用户 / 上报漏洞中心 / 创建任务 / 获取网关密钥。下游服务以 `tool_id` 回注册中心校验有效性,防止绕过注册中心直接调用。能力不分项授权:工具一旦上线,默认即可使用全部下游能力。

## 关键决策(已与干系人对齐)

| # | 决策 | 选择 |
|---|---|---|
| 1 | 纳管范围 | 全部统一(微服务工具 + 开发者 Agent + 未来新工具) |
| 2 | 准生证授予 | 管理员审核制(成熟度三态) |
| 3 | 权威后端 | 扩展 AgentManage(已有 MySQL + 审批语义) |
| 4 | 闸门校验 | 下游服务强校验 |
| 5 | 交付范围 | MVP 闭环优先 |
| 6 | 存量工具 | 种子为内置工具(isBuiltin + online) |
| 7 | 工具 vs 微服务 | 一对一(工具=独立条目,盖亚三入口=三条) |
| 8 | 任务闸门契约 | 创建任务请求体显式带 `tool_id` |
| 9 | 健康探测 | AgentManage 内置探测(单一真相源) |
| 10 | 版本治理 | 轻治理:`current_version` 指针 + 升版不重审,任务表不关注版本 |

## 设计 1:整体架构与定位

AgentManage 升级为全平台**唯一**的「工具注册中心」,既是系统工具与开发者 Agent 的唯一准生证签发处,也是菜单的唯一真相源和健康状态的唯一来源。前端只面对 AgentManage 一个后端。

分工:

| 组件 | 改造前 | 改造后 |
|---|---|---|
| `toolCatalog.ts` + `navigation.tsx` | 静态写死 4+9 项 | 删除硬编码,运行时拉取注册中心 |
| AgentManage | 只管开发者上传 Agent | 唯一权威后端:`tool` 实体 + 准生证状态机 + 审核 + 菜单真相源 + 健康探测 |

边界(全部收敛进 AgentManage):
- 工具档案 + 准生证状态(慢变、需审批历史)→ 持久化在 MySQL
- 菜单可见性 → 完全由准生证状态(status=online)决定
- 微服务工具健康 → AgentManage 后台调度器按 `runtime.healthPath` 定时探活,结果写回 `tool` 记录
- 前端「工具」页 → 只调 AgentManage:一个接口同时拿到档案、状态、健康

### 菜单可见性规则

| 工具中心状态 | 菜单是否展示 |
|---|---|
| 未注册 | 不展示(无准生证) |
| draft / pending | 不展示(未过审) |
| offline | 不展示(已下线) |
| online | 展示 + 健康徽标 |

结论:菜单可见性完全由准生证决定。这正是「只有注册并审核上线后才能开放给用户」诉求的落地点。

## 设计 2:数据模型

在 AgentManage 的 MySQL 库 `agent_market` 新增 `tool` 表,只放通用治理层 + 前端入口层,实现层按 `kind` 多态:`kind='agent'` 用 `agent_app_id` 关联已有 `agent_app` 表;`kind='microservice'` 用 `runtime` JSON 内联部署信息。一对一建模:盖亚固件/源码/模块 = 三条记录,`runtime` 内 `namespace/deployment` 相同但 `view_id` + `catalog` 不同。

### 建表 DDL

```sql
CREATE TABLE `tool` (
  `id`                VARCHAR(36)  NOT NULL COMMENT '工具ID,如 binary-security',
  `name`              VARCHAR(255) NOT NULL COMMENT '工具显示名',
  `kind`              VARCHAR(20)  NOT NULL COMMENT '载体类型: microservice / agent',

  -- 治理层
  `status`            VARCHAR(20)  NOT NULL DEFAULT 'draft'
                      COMMENT '准生证状态: draft/pending/online/offline',
  `is_builtin`        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否内置种子工具',
  `submitted_by`      VARCHAR(64)  NULL COMMENT '提交人',
  `reviewed_by`       VARCHAR(64)  NULL COMMENT '审核人',
  `review_note`       TEXT         NULL COMMENT '审核意见/驳回原因',
  `reviewed_at`       DATETIME     NULL COMMENT '审核时间',

  -- 前端入口层
  `view_id`           VARCHAR(128) NOT NULL COMMENT '前端路由 view',
  `icon`              VARCHAR(64)  NULL COMMENT '图标名',
  `menu_group`        VARCHAR(64)  NULL COMMENT '所属菜单分组,如 开发者工具',
  `order`             INT          NOT NULL DEFAULT 0 COMMENT '菜单排序',
  `catalog`           JSON         NULL COMMENT '总览页元数据 summary/tags/usageSections',

  -- 实现层(按 kind 解释)
  `runtime`           JSON         NULL COMMENT 'kind=microservice: namespace/deployment/apiPrefix/healthPath',
  `agent_app_id`      VARCHAR(36)  NULL COMMENT 'kind=agent: 关联 agent_app.id',
  `current_version`   VARCHAR(128) NULL COMMENT '当前上线版本: 镜像tag(微服务)/commit(agent),升版直接覆盖',

  -- 健康(由内置探测器写回)
  `health_status`     VARCHAR(20)  NOT NULL DEFAULT 'unknown'
                      COMMENT 'healthy / unhealthy / unknown',
  `last_health_check` DATETIME     NULL COMMENT '最近一次探活时间',

  `created_at`        DATETIME     NOT NULL,
  `updated_at`        DATETIME     NOT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_status`      (`status`),
  KEY `idx_kind`        (`kind`),
  KEY `idx_menu_group`  (`menu_group`, `order`),
  KEY `idx_agent_app`   (`agent_app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='工具注册中心:统一纳管微服务工具与开发者 Agent 的准生证档案';
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) | 主键,工具唯一标识(如 `binary-security`) |
| `name` | varchar(255) | 显示名(如 盖亚-二进制固件) |
| `kind` | varchar(20) | `microservice`(K8s 微服务)/ `agent`(开发者上传) |
| `status` | varchar(20) | 准生证状态机:`draft→pending→online→offline` |
| `is_builtin` | tinyint(1) | 内置种子工具,迁移时直接 online,闸门兜底 fail-open |
| `submitted_by`/`reviewed_by`/`review_note`/`reviewed_at` | — | 审核轨迹 |
| `view_id` | varchar(128) | 前端路由 view,取代 `navigation.tsx` 硬编码 |
| `icon`/`menu_group`/`order` | — | 菜单渲染元数据,取代 `navigation.tsx` 硬编码 |
| `catalog` | json | 总览页卡片元数据,取代 `toolCatalog.ts` 硬编码 |
| `runtime` | json | `kind=microservice` 时存 `{namespace,deployment,apiPrefix,healthPath}` |
| `agent_app_id` | varchar(36) | `kind=agent` 时关联 `agent_app.id` |
| `current_version` | varchar(128) | 当前上线版本(镜像 tag / commit),升版直接覆盖 |
| `health_status`/`last_health_check` | — | 由内置探测器(设计 3)维护,前端直接读 |

### 关联与约束

- 与 `agent_app` 软关联:`agent_app_id` 不设外键(允许 agent 工具档案独立于具体 app 存在),由应用层保证一致性。
- `kind` 与实现层字段的互斥由应用层校验:`microservice` 必填 `runtime`、`agent` 必填 `agent_app_id`。
- 种子迁移:9 个系统工具以 `kind='microservice', is_builtin=1, status='online'` 灌入,`runtime` 取自现有部署信息,`catalog` 取自 `toolCatalog.ts`。

要点:
- `catalog` 吃掉 `toolCatalog.ts` 的 summary/tags/usageSections。
- `view_id/icon/menu_group/order` 吃掉 `navigation.tsx` 的硬编码菜单项。
- 闸门只校验注册有效性(`status='online'`),不做分能力授权:工具一旦上线,默认即可创建任务/上报漏洞/取密钥。闸门目的是防绕过(见设计 4),不是限权。
- `health_status/last_health_check` 由内置探测器(设计 3)维护,前端直接读。

### 版本管理(轻治理:升版不重审)

工具的版本来自底层载体:微服务=镜像 tag(`YYYYMMDD-HHMMSS-<sha>`),agent=gitea commit。版本语义遵循以下原则:

- **准生证发给工具,不发给版本**。`tool` 始终单条记录,`current_version` 是指向"当前上线版本"的指针。
- **升版 = 覆盖 `current_version`,工具保持 online,不触发重新审核**。开发者迭代顺畅,版本质量由工具 owner 自行把关。
- **不建独立 `tool_version` 留痕表**。要追溯历史版本,K8s 滚更记录与 gitea commit history 自带,无需在注册中心复制一份。
- **任务表/漏洞表不关注工具版本**。任务只需通过 `tool_id`(现有 `task_type`/`agent_app_id`)识别到工具即可;工具当前是 v1 还是 v2 是 `tool` 表自己的状态,不向数据层泄漏。版本对数据层零侵入:工具升版,历史任务/漏洞的关联不受任何影响,用户访问工具时自然命中最新版。

## 设计 3:准生证状态机 + 健康探测 + API

### 状态机

```
        开发者提交              管理员审核通过
 draft ──────────► pending ──────────────► online
   ▲                  │                      │
   │ 管理员驳回         │ 管理员驳回(带 reviewNote) │ 管理员/开发者下线
   └──────────────────┘                      ▼
                                          offline ──(重新提交)──► pending
```

- 内置种子工具:迁移时直接 `status=online, isBuiltin=true`,跳过审核。
- 普通注册:`draft → pending → online`,每次状态变更写审核轨迹(who/when/note)。

### 内置健康探测

AgentManage 后台起一个定时调度器(NestJS `@Interval` 或 cron):
- 周期(如 30s)遍历所有 `kind=microservice && status=online` 的工具
- 按 `runtime.apiPrefix + runtime.healthPath` 发起 HTTP 探活,超时/非 2xx 记一次失败
- 连续失败达阈值(如 2 次)置 `healthStatus=unhealthy`,成功置 `healthy`,写回 `tool` 记录
- `kind=agent` 工具不参与微服务探活(健康语义不同,MVP 不探,`healthStatus=unknown`)

前端直接读 `tool.healthStatus`,无需再调任何其它后端。

### REST API(`/api/tools`)

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| POST | `/api/tools` | 开发者注册工具(建 draft) | 登录用户 |
| PUT | `/api/tools/:id` | 改元数据(仅 draft/offline 可改) | owner |
| POST | `/api/tools/:id/submit` | draft → pending | owner |
| POST | `/api/tools/:id/review` | pending → online / 驳回,带 note | 管理员 |
| POST | `/api/tools/:id/offline` | online → offline | 管理员/owner |
| GET | `/api/tools` | 列表(按 status/kind 过滤,含 healthStatus) | 登录用户 |
| GET | `/api/tools/:id` | 详情 | 登录用户 |
| GET | `/api/tools/:id/gate` | 注册有效性校验(下游服务调) | 服务间 |

`gate` 判定 = `工具存在 && status==='online'`,返回 `{ allowed: boolean, reason?: string }`。它只回答"这是不是一个有效上线的工具",防止绕过注册中心直接调下游接口。不区分能力类型。

## 设计 4:能力闸门校验(下游强校验)

MVP 只对「创建任务」这一条链路做真实强校验。下游后端是 **`chirmera-platform-schedule`(调度中心)**。前端 `CreateTaskDialog` → `scheduleApi.createUserTask` → `POST /api/chirmera-platform-schedule/projects/{projectId}/user-task`。

```
前端 CreateTaskDialog
   │ scheduleApi.createUserTask(projectId, { tool_id, ... })
   ▼
chirmera-platform-schedule(调度中心,下游)   ← 闸门挂这里
   │ ① 取 tool_id
   │ ② GET /api/tools/{tool_id}/gate
   ▼
AgentManage 工具注册中心
   └─► { allowed } = (工具存在 && status==='online')
   ▼
schedule:allowed=false → 拒绝建任务 + reason;true → 正常入队
```

闸门目的是**防绕过**:没在注册中心注册(或未上线)的 `tool_id` 想直接调下游接口建任务,会被拒。不限制已上线工具的能力。

MVP 范围:
- 只在调度中心接入强校验。
- 其余下游(漏洞上报 / 网关密钥)`gate` 接口已通用(同一个无参 gate),下游暂不接入,后续按同一模式复制——校验逻辑完全一致,都是"tool_id 是否有效上线"。
- 前端门控同步做:未上线工具不展示创建入口,与后端强校验形成双层。

兜底策略:
- 注册中心不可达 → 非内置工具 **fail-closed**(默认拒绝);内置工具(isBuiltin)**fail-open**,防注册中心单点拖垮存量业务。
- gate 结果加 30s TTL 缓存,避免每次建任务都打注册中心。

前提改动:创建任务请求体显式增加 `tool_id` 字段,由前端传入,调度中心直接 gate。不走 engine/profile 反查(脆弱且散逻辑)。

## 设计 5:前端改造 + 迁移步骤 + 测试

前端改造(去硬编码):

1. 新增 `clients/toolRegistry.ts` → 调 AgentManage `/api/tools`(列表含 status + healthStatus)。
2. `navigation.tsx`「开发者工具」分组:改为运行时拉取 `GET /api/tools?status=online&group=开发者工具`,按 `order` 渲染,健康徽标读 `healthStatus`。黑板等 iframe 类工具同样纳入(MVP 不动黑板实现)。
3. `toolCatalog.ts`:删除硬编码常量,`ToolOverviewPage` 改读注册中心 `catalog` 字段。
4. `CreateTaskDialog`:提交带 `tool_id`;未上线工具不展示创建入口。
5. 新增工具注册/审核页:开发者提交注册(填 runtime 或关联 agentApp),管理员审核列表(pending → online/驳回)。

迁移步骤(顺序,可回滚):

```
1. AgentManage: 建 tool 表 + migration          → 验证: 表结构存在
2. 种子 migration: 9个系统工具灌为 online/builtin → 验证: GET /api/tools 返回9条
3. AgentManage: /api/tools CRUD + 状态机 + gate   → 验证: gate 对 online 返 allowed
4. AgentManage: 内置健康探测调度器               → 验证: online 微服务工具 healthStatus 被刷新
5. schedule: createUserTask 前加 gate + fail 策略 → 验证: 下线工具建任务被拒
6. 前端: toolRegistry client + 菜单/总览页改造    → 验证: 菜单项来自接口 + 健康徽标
7. 前端: 注册/审核页 + 创建任务带 tool_id         → 验证: 全流程跑通
```

测试(Playwright 前端完整操作验证):
- 注册新工具 → 待审核 → 管理员通过 → 工具出现在菜单 → 可创建任务
- 下线工具 → 菜单消失 + 直接建任务被调度中心拒(403 + reason)
- 微服务工具健康接口故障 → 菜单仍展示但健康徽标转 unhealthy
- 内置工具在注册中心「故障」时仍可创建任务(fail-open 验证)

## 后续阶段(非 MVP)

- 漏洞上报(secflow-platform-vuln)接入 `gate` 防绕过校验
- 网关密钥(aigw/configcenter)接入 `gate` 防绕过校验
- Agent 类工具的健康/就绪语义(harness 可拉起、engine 可用)纳入探测
