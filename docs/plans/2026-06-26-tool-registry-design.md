# 工具注册中心(Tool Registry)设计

日期:2026-06-26
范围:MVP 闭环优先
权威后端:扩展 AgentManage(NestJS + MySQL)

## 背景与问题

当前「工具」入口存在三套互不相通的机制:

1. **前端硬编码** —— `toolCatalog.ts`(4 个工具)+ `navigation.tsx`(写死的「开发者工具」9 项菜单),完全静态。
2. **menu 注册服务**(`secflow-platform-menu`,Flask,内存/Redis)—— 各微服务通过 `/api/menu/register` 上报菜单项 + 成熟度 + 健康检查,靠心跳维持,重启即清。只用于动态菜单与健康聚合。
3. **AgentManage 市场**(NestJS + MySQL)—— 开发者上传 Agent harness(`agent_app`:engine、gitea 仓库、`is_public`、`status`),另有 `agent_definition`。

后果:工具来源混乱,没有统一的"准生证"概念,无法以注册状态为闸门控制下游能力。

## 目标

把「工具」按钮做成系统工具的**准生证注册中心**:注册 ≠ 可用;只有审核通过(状态=已上线)的工具才解锁下游能力——开放给用户 / 上报漏洞中心 / 创建任务 / 获取网关密钥。

## 关键决策(已与干系人对齐)

| # | 决策 | 选择 |
|---|---|---|
| 1 | 纳管范围 | 全部统一(微服务工具 + 开发者 Agent + 未来新工具) |
| 2 | 准生证授予 | 管理员审核制(复用 menu 成熟度三态) |
| 3 | 权威后端 | 扩展 AgentManage(已有 MySQL + 审批语义) |
| 4 | 闸门校验 | 下游服务强校验 |
| 5 | 交付范围 | MVP 闭环优先 |
| 6 | 存量工具 | 种子为内置工具(isBuiltin + online) |
| 7 | 工具 vs 微服务 | 一对一(工具=独立条目,盖亚三入口=三条) |
| 8 | 任务闸门契约 | 创建任务请求体显式带 `tool_id` |

## 设计 1:整体架构与定位

把 AgentManage 升级为全平台「工具注册中心」,成为系统工具与开发者 Agent 的唯一准生证签发处。

三方新分工:

| 组件 | 改造前 | 改造后 |
|---|---|---|
| `toolCatalog.ts` + `navigation.tsx` | 静态写死 4+9 项 | 删除硬编码,运行时拉取注册中心 |
| AgentManage | 只管开发者上传 Agent | 权威后端:统一 `tool` 实体 + 准生证状态机 + 审核 + **菜单唯一真相源** |
| menu 服务 | 动态菜单 + 健康聚合 | **降级为纯健康探测服务**(路线 B):不再作为菜单来源 |

边界:
- 注册中心(AgentManage)= 持久化的「工具档案 + 准生证状态」(慢变、需审批历史),**菜单的唯一真相源**
- menu 服务 = 运行时「这工具现在健康吗」(快变、靠心跳),**纯健康探测**
- 前端「工具」页 = 两者合并视图(档案/菜单项来自注册中心,健康徽标来自 menu,靠 `service_id` 关联)

### 现状事实订正(实现前必读)

核实代码后纠正两处之前文档的不准确假设:

1. **前端从未消费 menu 的菜单树**。`clients/menu.ts` 只调 `/api/menu/health` 与 `/api/menu/services/health/summary` 两个接口,只拿健康数据。menu 的 `/api/menu/menu`(动态菜单树)前端从未调用。
2. 因此**现状菜单 100% 来自硬编码 `navigation.tsx`**;menu 服务当前仅给已写死的菜单项叠加健康徽标。menu 的"动态菜单"能力实际未被使用。

### menu / AgentManage 关系(路线 B:收敛)

- **AgentManage 是唯一注册入口和菜单真相源**。微服务工具上线(status=online)时,由 AgentManage 把 `runtime`(service_id / health_path / namespace 等)**同步推给 menu** 去探活。微服务不再自己调 menu 注册菜单项。
- menu 退化为「给定 service_id + health_path,定时探活并返回健康状态」的纯探测服务,不承载任何治理/菜单语义。
- 关联键:`tool.runtime.serviceId` ↔ menu 的 `service_id`。前端用它把档案与健康拼成一个视图。

### 「注册了 menu 但未在工具中心注册」的菜单可见性

| 注册 menu | 工具中心状态 | 菜单是否展示 |
|---|---|---|
| ✓ | 未注册 | **不展示**(无准生证,进不了菜单) |
| ✓ | pending / draft | **不展示**(未过审) |
| ✗ | online | 展示,健康徽标显示「未知/离线」 |
| ✓ | online | 展示 + 健康徽标正常 |

结论:菜单可见性完全由工具注册中心的准生证决定,menu 注册与否不影响"是否进菜单",只影响"健康徽标"。这正是「只有注册并审核上线后才能开放给用户」诉求的落地点。

## 设计 2:数据模型

在 AgentManage MySQL 新增 `tool` 表,只放通用治理层 + 前端入口层,实现层按 `kind` 多态内联。`kind=agent` 关联已有 `agent_app`;`kind=microservice` 内联 `runtime`(对齐 menu register 入参)。一对一建模:盖亚固件/源码/模块 = 三条记录,共享相同 `namespace/deployment` 但不同 `viewId` + `catalog`。

```ts
@Entity('tool')
export class Tool {
  @PrimaryColumn('varchar', 36) id: string;        // 'binary-security' / 'source-security' ...
  @Column() name: string;
  @Column() kind: 'microservice' | 'agent';

  // —— 治理层(两类共享)——
  @Column({ default: 'draft' })
  status: 'draft' | 'pending' | 'online' | 'offline';
  @Column({ name: 'is_builtin', default: false }) isBuiltin: boolean;
  @Column('simple-json', { nullable: true })
  capabilities?: {
    createTask?: boolean;
    reportVuln?: boolean;
    gatewayKey?: boolean;
    userVisible?: boolean;
  };
  @Column({ nullable: true }) submittedBy?: string;
  @Column({ nullable: true }) reviewedBy?: string;
  @Column('text', { nullable: true }) reviewNote?: string;
  @Column('datetime', { nullable: true }) reviewedAt?: Date;

  // —— 前端入口层(两类共享)——
  @Column() viewId: string;
  @Column({ nullable: true }) icon?: string;
  @Column({ nullable: true }) menuGroup?: string;
  @Column('int', { default: 0 }) order: number;
  @Column('simple-json', { nullable: true }) catalog?: ToolCatalogMeta; // summary/tags/usageSections

  // —— 实现层(内联,按 kind 解释)——
  @Column('simple-json', { nullable: true })
  runtime?: { namespace: string; deployment: string; apiPrefix: string; healthPath: string }; // kind=microservice
  @Column({ name: 'agent_app_id', nullable: true }) agentAppId?: string; // kind=agent

  createdAt: Date; updatedAt: Date;
}
```

要点:
- `catalog` 吃掉 `toolCatalog.ts` 的 summary/tags/usageSections。
- `viewId/icon/menuGroup/order` 吃掉 `navigation.tsx` 的硬编码菜单项。
- `capabilities` 是闸门数据基础:下游校验既看 `status===online` 也看对应能力位。
- 种子迁移:9 个系统工具以 `kind='microservice', isBuiltin=true, status='online'` 灌入。

## 设计 3:准生证状态机 + 审核 API

状态流转:

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

AgentManage 新增 REST(`/api/tools`):

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| POST | `/api/tools` | 开发者注册工具(建 draft) | 登录用户 |
| PUT | `/api/tools/:id` | 改元数据(仅 draft/offline 可改) | owner |
| POST | `/api/tools/:id/submit` | draft → pending | owner |
| POST | `/api/tools/:id/review` | pending → online / 驳回,带 note | 管理员 |
| POST | `/api/tools/:id/offline` | online → offline | 管理员/owner |
| GET | `/api/tools` | 列表(按 status/kind/visible 过滤) | 登录用户 |
| GET | `/api/tools/:id` | 详情 | 登录用户 |
| GET | `/api/tools/:id/gate?cap=createTask` | 闸门校验(下游服务调) | 服务间 |

`gate` 判定 = `status==='online' && capabilities[cap]===true`,返回 `{ allowed: boolean, reason?: string }`。

## 设计 4:能力闸门校验(下游强校验)

MVP 只对「创建任务」这一条链路做真实强校验。下游后端是 **`chirmera-platform-schedule`(调度中心)**,不是 workflow。前端 `CreateTaskDialog` → `scheduleApi.createUserTask` → `POST /api/chirmera-platform-schedule/projects/{projectId}/user-task`。

```
前端 CreateTaskDialog
   │ scheduleApi.createUserTask(projectId, { tool_id, ... })
   ▼
chirmera-platform-schedule(调度中心,下游)   ← 闸门挂这里
   │ ① 取 tool_id
   │ ② GET /api/tools/{tool_id}/gate?cap=createTask
   ▼
AgentManage 注册中心
   └─► { allowed } = (status==='online' && capabilities.createTask===true)
   ▼
schedule:allowed=false → 拒绝建任务 + reason;true → 正常入队
```

MVP 范围:
- 只在调度中心接入强校验。
- 其余三能力(漏洞上报 / 网关密钥 / 用户可见)`gate` 接口已通用支持,下游暂不接入,后续按同一模式复制。
- 前端门控同步做:未上线工具不展示创建入口,与后端强校验形成双层。

兜底策略:
- 注册中心不可达 → 非内置工具 **fail-closed**(默认拒绝);内置工具(isBuiltin)**fail-open**,防注册中心单点拖垮存量业务。
- gate 结果加 30s TTL 缓存,避免每次建任务都打注册中心。

前提改动:创建任务请求体显式增加 `tool_id` 字段,由前端传入,调度中心直接 gate。不走 engine/profile 反查(脆弱且散逻辑)。

## 设计 5:前端改造 + 迁移步骤 + 测试

前端改造(去硬编码):

1. 新增 `clients/toolRegistry.ts` → 调 AgentManage `/api/tools`。
2. `navigation.tsx`「开发者工具」分组:改为运行时拉取 `GET /api/tools?visible=true&group=开发者工具`,按 `order` 渲染。黑板等 iframe 类工具同样纳入(MVP 不动黑板实现)。
3. `toolCatalog.ts`:删除硬编码常量,`ToolOverviewPage` 改读注册中心 `catalog` 字段。
4. `CreateTaskDialog`:提交带 `tool_id`;未上线工具不展示创建入口。
5. 新增工具注册/审核页:开发者提交注册(填 runtime 或关联 agentApp),管理员审核列表(pending → online/驳回)。

迁移步骤(顺序,可回滚):

```
1. AgentManage: 建 tool 表 + migration        → 验证: 表结构存在
2. 种子 migration: 9个系统工具灌为 online/builtin → 验证: GET /api/tools 返回9条
3. AgentManage: /api/tools CRUD + 状态机 + gate → 验证: gate 对 online 返 allowed
4. schedule: createUserTask 前加 gate + fail 策略 → 验证: 下线工具建任务被拒
5. 前端: toolRegistry client + 菜单/总览页改造    → 验证: 菜单项来自接口
6. 前端: 注册/审核页 + 创建任务带 tool_id        → 验证: 全流程跑通
```

测试(Playwright 前端完整操作验证):
- 注册新工具 → 待审核 → 管理员通过 → 工具出现在菜单 → 可创建任务
- 下线工具 → 菜单消失 + 直接建任务被调度中心拒(403 + reason)
- 内置工具在注册中心「故障」时仍可用(fail-open 验证)

## 后续阶段(非 MVP)

- 漏洞上报(secflow-platform-vuln)接入 `gate?cap=reportVuln`
- 网关密钥(aigw/configcenter)接入 `gate?cap=gatewayKey`
- 用户可见性(`userVisible`)全面接管前端门控
- **menu 收敛(路线 B)落地**:AgentManage 在工具 online 时把 `runtime.serviceId / healthPath` 同步推给 menu(新增内部接口,如 `POST /api/menu/probe-targets`),微服务移除自带的 menu 注册/心跳逻辑,menu 不再接受业务方直接注册菜单项。
  - MVP 阶段:不动 menu,沿用现有 `service_id` 关联拿健康(松耦合),前端按 `tool.runtime.serviceId` 去 `/api/menu/services/health/summary` 取健康。
  - 收敛阶段:切换为 AgentManage → menu 单向推送,统一注册入口。
