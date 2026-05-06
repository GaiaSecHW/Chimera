# SecFlow Frontend Domain Migration Plan

## Goal

Move the frontend from a page-bucket structure into a domain-oriented structure that matches the product backbone:

`project -> assets -> environment -> orchestration -> execution -> vuln -> platform`

This document focuses on **physical directory migration**, not just API-entry cleanup.

## Current Status

The following layers are already largely aligned:

- navigation: `app/navigation.tsx`
- view registry: `app/viewRegistry.tsx`
- domain API entrypoints: `clients/*/index.ts` and `api.domains.*`
- main domains already using grouped API access:
  - `env`
  - `workflow`
  - `system-analysis`
  - `aiwf`
  - large parts of `pentest`
  - large parts of `inputs/assets`
  - project/platform entry pages

This means the remaining work is mostly:

- moving files into domain folders
- adding temporary re-export shims where helpful
- updating imports in small batches

## Target Directory Shape

Recommended target:

```text
app/
  navigation.tsx
  viewRegistry.tsx

domains/
  project/
    pages/
    components/
    api/
  assets/
    pages/
    components/
    api/
  environment/
    pages/
    components/
    api/
  orchestration/
    pages/
    components/
    api/
  execution/
    pages/
    components/
    api/
  vuln/
    pages/
    components/
    api/
  platform/
    pages/
    components/
    api/

shared/
  components/
  layout/
  services/
  utils/
  types/
```

If a full `domains/` move feels too large right now, use this interim version first:

```text
pages/
  project/
  assets/
  environment/
  orchestration/
  execution/
  vuln/
  platform/

components/
  assets/
  environment/
  orchestration/
  platform/
```

## Domain Mapping

### Project

Move into `pages/project/`:

- `pages/ProjectMgmtPage.tsx`
- `pages/ProjectDetailPage.tsx`

### Assets

Move into `pages/assets/`:

- `pages/StaticPackagesPage.tsx`
- `pages/StaticPackageDetailPage.tsx`
- `pages/DeployScriptPage.tsx`
- `pages/inputs/BaseResourcePage.tsx`
- `pages/inputs/CodeAuditPage.tsx`
- `pages/inputs/DocAnalysisPage.tsx`
- `pages/inputs/OtherInputPage.tsx`
- `pages/inputs/OutputPvcPage.tsx`
- `pages/inputs/ProjectFileExplorerPage.tsx`
- `pages/inputs/PublicResourceManagementPage.tsx`
- `pages/inputs/PvcManagementPage.tsx`
- `pages/inputs/ReleasePackagePage.tsx`
- `pages/inputs/TaskMgmtPage.tsx`

Move into `components/assets/`:

- `components/ProjectDirectoryPickerModal.tsx`

### Environment

Move into `pages/environment/`:

- all files under `pages/env/`

Move into `components/environment/`:

- `pages/env/ai-agent/shared.tsx`
- `pages/env/llm-binding/TemplateLlmBindingEditor.tsx`

### Orchestration

Move into `pages/orchestration/`:

- all files under `pages/workflow/`
- all files under `pages/aiwf/`

Move into `components/orchestration/`:

- `components/workflow/AppWorkflowLlmBindingsEditor.tsx`

### Execution

Move into `pages/execution/`:

- all files under `pages/system-analysis/`
- execution-focused files under `pages/pentest/`
  - `ExecutionCodeAuditPage.tsx`
  - `ExecutionCodeAuditDetailPage.tsx`
  - `ExecutionWorkPlatformPage.tsx`
  - `B2STaskCreatePage.tsx`
  - `B2STaskListPage.tsx`
  - `B2STaskQueuePage.tsx`
  - `B2STaskResultPage.tsx`
  - `ReportsPage.tsx`
  - `B2SCompactTable.tsx`
  - `B2SStatsHeader.tsx`

### Vuln

Move into `pages/vuln/`:

- vuln lifecycle files under `pages/pentest/`
  - `VulnEnginePage.tsx`
  - `VulnOverviewPage.tsx`
  - `VulnIntakePage.tsx`
  - `VulnAnalysisPage.tsx`
  - `VulnAnalysisDetailPage.tsx`
  - `VulnVerificationPage.tsx`
  - `VulnVerificationDetailPage.tsx`
  - `VulnDecisionPage.tsx`
  - `VulnDecisionDetailPage.tsx`
  - `VulnQueuePage.tsx`
  - `VulnServicesPage.tsx`
  - `VulnReproConfigPage.tsx`
  - `vuln-engine/*`

### Platform

Move into `pages/platform/`:

- `pages/AdminDashboardPage.tsx`
- `pages/ConfigCenterLlmPage.tsx`
- `pages/ConfigCenterLlmChatPage.tsx`
- all files under `pages/user/`
- all files under `pages/org/`

Move into `components/platform/`:

- `components/configcenter/LlmProviderChatWorkspace.tsx`

## Migration Order

### Phase 1: Add Destination Folders

Create folders only:

- `pages/project`
- `pages/assets`
- `pages/environment`
- `pages/orchestration`
- `pages/execution`
- `pages/vuln`
- `pages/platform`
- `components/assets`
- `components/environment`
- `components/orchestration`
- `components/platform`

Success criteria:

- no imports changed yet
- tree exists

### Phase 2: Move Low-Risk Leaf Files

Move simple files first:

- `pages/system-analysis/*`
- `pages/aiwf/*`
- `pages/workflow/*`
- `pages/user/*`
- `pages/org/*`
- `pages/StaticPackagesPage.tsx`
- `pages/StaticPackageDetailPage.tsx`
- `pages/DeployScriptPage.tsx`

After each sub-batch:

- update imports
- run `npm run lint`

Success criteria:

- no runtime behavior changes
- lint passes after each sub-batch

### Phase 3: Move Shared Domain Components

Move component files with narrow dependency surfaces:

- `components/ProjectDirectoryPickerModal.tsx`
- `components/configcenter/LlmProviderChatWorkspace.tsx`
- `components/workflow/AppWorkflowLlmBindingsEditor.tsx`
- `pages/env/ai-agent/shared.tsx`
- `pages/env/llm-binding/TemplateLlmBindingEditor.tsx`

Recommendation:

- after move, leave a temporary re-export shim in the old path for 1 migration round

Example shim:

```ts
export { ProjectDirectoryPickerModal } from '../assets/ProjectDirectoryPickerModal';
export type { ProjectDirectorySelection } from '../assets/ProjectDirectoryPickerModal';
```

Success criteria:

- imports continue working during transition
- no large fan-out breakage

### Phase 4: Move Assets Domain

Move:

- `pages/inputs/*`
- `pages/ProjectDetailPage.tsx` can stay for now or move after assets if easier

This phase has more import churn because file explorer and PVC pages are heavily connected.

Recommended order inside assets:

1. `TaskMgmtPage.tsx`
2. `BaseResourcePage.tsx`
3. `PvcManagementPage.tsx`
4. `ProjectFileExplorerPage.tsx`
5. tab wrapper pages like `PublicResourceManagementPage.tsx`

Success criteria:

- project file explorer works
- PVC browser works
- upload/download still works

### Phase 5: Move Environment Domain

Move the whole `pages/env/` tree into `pages/environment/`.

Recommended sub-order:

1. `EnvProcessMonitor*`
2. `EnvAiHelperPage.tsx`
3. `EnvAiSessionPage.tsx`
4. `EnvAiBatchSessionPage.tsx`
5. `EnvAiAgentSessionManagePage.tsx`
6. `AgentDetailPage.tsx`
7. `EnvAgentPage.tsx`
8. `ServiceMgmtPage.tsx`
9. `EnvTemplatePage.tsx`

Success criteria:

- service deploy works
- helper session works
- template edit works
- terminal window works

### Phase 6: Move Security Mainline

Move execution and vuln files:

1. execution files from `pages/pentest/`
2. vuln lifecycle files from `pages/pentest/`

Recommended sub-order:

1. `VulnOverviewPage.tsx`
2. `VulnEnginePage.tsx`
3. `VulnIntakePage.tsx`
4. detail wrappers
5. `ExecutionCodeAudit*`
6. `B2S*`

Success criteria:

- intake still creates cases
- case lifecycle actions still work
- code audit create/restart/delete still works
- B2S create/list/detail still works

### Phase 7: Move Project And Platform

Move:

- `ProjectMgmtPage.tsx`
- `ProjectDetailPage.tsx`
- `ConfigCenterLlmPage.tsx`
- `ConfigCenterLlmChatPage.tsx`
- `AdminDashboardPage.tsx`

Success criteria:

- project create/edit/delete works
- config center CRUD/chat works
- admin dashboard still refreshes

### Phase 8: Remove Temporary Shims

Only after all imports have been updated:

- delete old path re-export shims
- delete empty folders like `pages/inputs`
- delete stale aliases

Success criteria:

- no old folder references in repo
- lint passes

## Import Rewrite Rules

Use these rules during migration:

- page-to-page domain imports should prefer new domain paths
- shared reusable helpers should move to `components/<domain>` or `shared/components`
- API access should continue using `api.domains.*` where available
- avoid introducing new direct imports from low-level clients unless the file is intentionally a thin leaf

## Validation Checklist

Run after every batch:

1. `npm run lint`
2. smoke test top navigation
3. smoke test project selection
4. smoke test at least one page in the moved domain

Recommended smoke cases:

- assets: upload/download/preview
- environment: deploy service + open detail
- orchestration: open template detail + instance detail
- execution: create code audit task
- vuln: intake + case detail + stage transition
- platform: config center load + chat load

## Search Queries For Cleanup

Useful checks:

```bash
rg "pages/inputs"
rg "pages/pentest"
rg "pages/env"
rg "pages/workflow"
rg "pages/aiwf"
rg "api\\.(projects|resources|environment|workflow|vuln|configCenter|staticPackages|deployScript)"
rg "from '../../clients/' pages components
```

## What Can Stay As-Is

These are acceptable to keep for now if they are still useful:

- direct `authApi` usage for project machine token helpers
- direct `orgApi` usage in platform governance pages
- direct `binaryToSourceApi` types if only used as TS models

They are no longer structural blockers.

## Suggested Next Concrete Task

If continuing from the current state, the best next step is:

1. create the physical destination folders
2. move `pages/system-analysis/*` into `pages/execution/`
3. move `pages/aiwf/*` and `pages/workflow/*` into `pages/orchestration/`
4. leave temporary re-export shims
5. run `npm run lint`

That gives the highest architectural payoff with the lowest breakage risk.
