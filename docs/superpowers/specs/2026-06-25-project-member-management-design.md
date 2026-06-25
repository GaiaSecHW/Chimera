# 项目成员管理 — 设计规格

> 日期：2026-06-25
> 范围：项目管理列表操作栏新增「成员管理」按钮，弹框展示项目成员列表，支持新增与删除成员。
> API 参考：`project_members_api.md`（服务 secflow-platform-project，前缀 `/api/project`）。

## 1. 目标与非目标

**目标**
- 项目管理列表（`ProjectMgmtPage`）每行操作列新增「成员管理」入口。
- 点击弹出模态框，展示该项目成员列表（用户名、部门、身份、加入时间）。
- 支持新增成员（搜索系统用户 → 多选 → 批量添加）。
- 支持删除成员（非创建人单行移除）。
- 按 API 权限模型门控：仅项目创建人或 super_admin 可见入口。

**非目标（YAGNI）**
- 不做成员分页 UI（`page_size=200` 一次拉取 + 搜索过滤）。
- 不做批量移除（单行移除即可）。
- 不做角色选择（角色固定 `member`）。
- 不改造既有 `bindRole`/`unbindRole` 单条接口签名。

## 2. 架构方案

**选定方案：抽取可复用 `ProjectMemberModal` 组件**，新文件 `pages/project/ProjectMemberModal.tsx`。
- 列表页 `ProjectMgmtPage` 与详情页 `ProjectDetailPage`（替换现有「即将上线」占位）共用同一组件。
- 不内联进 `ProjectMgmtPage`（已 1217 行，避免继续膨胀与重复）。

### 组件契约

```ts
interface ProjectMemberModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}
```

- 入口已由调用方按 `canManageMembers` 门控（仅创建人/super_admin 能打开），故组件内**总是**显示新增/删除控件，不再传 `canManage`。
- 自管状态：成员列表、加载/错误、搜索添加面板（关键词、结果、选中集、提交中）、移除中 id。
- 打开时即拉取一次成员列表；增删成功后刷新。
- ESC / 遮罩点击关闭。

## 3. API 客户端改动（`clients/projects.ts`）

`projectsApi` 已有 `bindRole`（POST `/role`）与 `unbindRole`（DELETE `/role?user_id=`）。补齐：

| 方法 | HTTP | 路径 |
|---|---|---|
| `listMembers(projectId, { search?, page?, page_size? })` | GET | `/{id}/members` |
| `searchAddableUsers(projectId, q, limit?)` | GET | `/{id}/users/search` |
| `batchAddMembers(projectId, user_ids: string[])` | POST | `/{id}/members/batch` |

移除复用现有 `unbindRole`（单行 DELETE `/role?user_id=`）。

新增并导出响应类型：

```ts
export interface ProjectMember {
  user_id: string;
  username: string;
  is_creator: boolean;
  department_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectAddableUser {
  id: number;
  username: string;
  department_name: string | null;
  is_already_member: boolean;
}
```

`listMembers` 返回 `{ items: ProjectMember[]; total: number }`；
`searchAddableUsers` 返回 `{ items: ProjectAddableUser[]; total: number }`；
`batchAddMembers` 返回批量结果（`{ results, succeeded, failed }`），组件据 `succeeded/failed` 给提示。

## 4. 权限门控

```
isCreator    = String(userPermissions.user_id) === project.owner_id
isSuperAdmin = !!userPermissions.is_admin
canManageMembers = isCreator || isSuperAdmin
```

- `ProjectMgmtPage`：已在 bootstrap 加载 `userPermissions`（`orgApi.getUserPermissions()`）。按钮仅 `canManageMembers` 时渲染。
- `ProjectDetailPage`：从 `projects` 按 id 取 `owner_id`；若未持有 `userPermissions`，则补一次 `orgApi.getUserPermissions()` 取 `user_id`/`is_admin` 计算门控，按钮仅 `canManageMembers` 时显示。

> 注：API 文档区分「创建人」与「super_admin」可操作；部门管理员有项目编辑/删除权（`can_manage`）但**不能**管理成员，故不能复用 `can_manage`。

## 5. 列表页改动（`ProjectMgmtPage.tsx`）

- 操作列（现 edit/delete，仅 `can_manage` 显示）旁新增 `Users` 图标按钮，`title="成员管理"`，样式与现有图标按钮一致（hover 着色）。
- 显隐条件：`canManageMembers`（独立于 `can_manage`）。
- 新增 state `memberModalProject: SecurityProject | null`；点击置位，渲染：
  ```tsx
  {memberModalProject && (
    <ProjectMemberModal
      projectId={memberModalProject.id}
      projectName={memberModalProject.name}
      onClose={() => setMemberModalProject(null)}
    />
  )}
  ```

## 6. 模态框 UX

布局（自上而下）：
1. **头部**：标题「项目成员管理 — {projectName}」+ 右上关闭 X。
2. **工具条**：成员搜索输入（按用户名过滤，防抖 300ms，调 `listMembers` 带 `search`）+ 右侧「添加成员」按钮。
3. **成员列表表格**：列 — 用户名 / 部门 / 身份徽章（创建人=primary 徽章，普通成员=普通标签）/ 加入时间 / 操作。非创建人行末尾「移除」图标按钮；创建人不可移除。
4. **添加面板**（点「添加成员」展开内联）：搜索框（防抖调 `searchAddableUsers`）→ 结果列表带勾选框（`is_already_member=true` 标「已加入」并禁用勾选）→「添加选中（n）」按钮调 `batchAddMembers` → 成功提示 + 关闭面板 + 刷新成员列表。
5. **状态**：加载 spinner、错误内联提示、空态文案。

样式：新组件用 theme tokens（`bg-theme-surface`、`border-theme-border`、`text-theme-text-primary` 等），遵循 AGENTS.md；与既有 `LK` 模态框引用同一组 CSS 变量，视觉一致。

## 7. 详情页改动（`ProjectDetailPage.tsx`）

- 删除 544–569 行「即将上线」占位模态。
- 复用 `<ProjectMemberModal>`：按钮（267–271 行「管理成员」）按 `canManageMembers` 门控显隐。
- 若 `ProjectDetailPage` 未持有 `userPermissions`，bootstrap 补 `orgApi.getUserPermissions()`。

## 8. 错误处理

- API 403（非创建人）/ 400（如移除创建人）/ 422 / 网络错误：模态框内联红色提示，不关闭模态框。
- 批量添加：据 `succeeded/failed` 给「成功添加 n 人，跳过/失败 m 人」式提示。
- 增删成功后刷新成员列表。

## 9. 验证

- `npm run lint`（= `tsc --noEmit`）必须 0 错误。
- 无单测框架；手测清单：
  1. 列表页：非创建人/非超管不显示按钮；创建人/超管显示。
  2. 成员列表加载、创建人徽章、加入时间。
  3. 搜索添加：关键词搜索、多选、已加入禁用、批量添加后列表刷新。
  4. 移除：非创建人可移除、创建人无移除按钮、移除后列表刷新。
  5. 详情页占位替换为真实模态、权限门控一致。

## 10. 涉及文件

| 文件 | 改动 |
|---|---|
| `clients/projects.ts` | 新增 3 个 API 方法 + 2 个类型导出 |
| `pages/project/ProjectMemberModal.tsx` | 新建可复用模态组件 |
| `pages/project/ProjectMgmtPage.tsx` | 操作列加按钮 + state + 渲染模态 |
| `pages/project/ProjectDetailPage.tsx` | 替换占位 + 权限门控 + bootstrap 取 userPermissions |
