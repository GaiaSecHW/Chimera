import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Edge, Handle, MarkerType, Node, NodeProps, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronRight, Clock3, Info, Loader2, Plus, RefreshCw, RotateCcw, Search, Server, SquareTerminal, Trash2, Wrench, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import {
  IpcAuditArtifact,
  IpcAuditArtifactContent,
  IpcAuditAttemptDetail,
  IpcAuditCapability,
  IpcAuditCatalogRefreshJob,
  IpcAuditExecutorMode,
  IpcAuditEvent,
  IpcAuditPipelineMode,
  IpcAuditProviderList,
  IpcAuditPresetProject,
  IpcAuditProviderSummary,
  IpcAuditReportFormat,
  IpcAuditRuntimeConfig,
  IpcAuditStageLog,
  IpcAuditStageSessionFile,
  IpcAuditStageSessionSummary,
  IpcAuditTaskDetail,
  IpcAuditTaskGraphSource,
  IpcAuditTaskReportOutput,
  IpcAuditTaskReportOutputSpec,
  IpcAuditTaskSummary,
  IpcAuditTaskTemplate,
  IpcAuditWorkspaceSummary,
} from '../../clients/ipcAudit';
import { StatisticCard, PageHeader } from '../../design-system';
import { AppSaSessionEvent, AppSaSessionMeta } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { mergeAgentSessionToolResults } from './agentSessionParsing';

type StageName = string;
type ExecutorMode = IpcAuditExecutorMode;
type PipelineMode = IpcAuditPipelineMode;
type GraphSourceType = 'inline_json' | 'python_builder';
type BuilderSourceMode = 'entry' | 'code';
type ProjectInputKind = 'preset_project' | 'custom_project';

interface ReportOutputDraft {
  key: string;
  outputId: string;
  nodeId: string;
  title: string;
  path: string;
  format: IpcAuditReportFormat;
  required: boolean;
  order: string;
}

interface GraphTemplateConfig {
  pipelineMode: PipelineMode;
  executorMode: ExecutorMode;
  modelName: string;
  providerKey: string;
  graphSourceType: GraphSourceType;
  builderSourceMode: BuilderSourceMode;
  inlineJsonText: string;
  pythonBuilderEntry: string;
  pythonBuilderCode: string;
  reportOutputs: ReportOutputDraft[];
}

interface GraphTemplateRecord {
  templateId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  config: GraphTemplateConfig;
}

interface ProjectInputItem {
  path: string;
  displayName: string;
  kind: ProjectInputKind;
  source: 'preset' | 'custom';
  preset?: IpcAuditPresetProject;
}

interface IpcAuditReadyState {
  status: string;
  ready: boolean;
  checks: Record<string, boolean>;
}

interface AuditedResultSummary {
  artifact: IpcAuditArtifact;
  vulnerabilitiesFound: string;
  pocsDeveloped: string;
  infoFindings: string;
}

interface TaskRuntimeSummary {
  executorMode: string;
  model: string;
  taskModel: string;
  providerKeys: string[];
  providerSnapshots: Record<string, any>[];
}

interface TaskGraphManifestReport {
  output_id: string;
  node_id?: string;
  title: string;
  relative_path: string;
  format: string;
  required: boolean;
  exists: boolean;
}

interface TaskGraphManifestPipelineNode {
  id: string;
  depends_on: string[];
  agent: string;
  model?: string | null;
  tools?: string | null;
  target?: Record<string, any> | null;
  success_criteria?: Record<string, any>[];
  prompt?: string | null;
}

interface TaskGraphManifestNodeRuntime {
  status: string;
  message?: string | null;
  return_code?: number | null;
  log_path?: string | null;
  session_files: string[];
  reports: TaskGraphManifestReport[];
}

interface TaskGraphManifest {
  kind: string;
  pipeline?: {
    name?: string | null;
    working_dir?: string | null;
    nodes: TaskGraphManifestPipelineNode[];
  } | null;
  nodes: Record<string, TaskGraphManifestNodeRuntime>;
  reports: TaskGraphManifestReport[];
}

interface TaskGraphNodeView {
  id: string;
  label: string;
  status: string;
  message: string;
  returnCode: number | null;
  dependsOn: string[];
  agent: string;
  model: string;
  tools: string;
  targetCwd: string;
  prompt: string;
  sessionFiles: string[];
  reports: IpcAuditTaskReportOutput[];
  hasEventsJsonl: boolean;
  hasLastMessage: boolean;
  hasPrompt: boolean;
}

type TaskGraphCanvasNodeData = Record<string, unknown> & {
  label: string;
  status: string;
  agent: string;
  model: string;
  reportCount: number;
  active: boolean;
  hasEventsJsonl: boolean;
  hasLastMessage: boolean;
};

type TaskGraphCanvasNodeType = Node<TaskGraphCanvasNodeData, 'taskGraphNode'>;

type GraphEditorTarget = 'inline_json' | 'python_entry' | 'python_code';

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancel_requested']);
const CANCELLABLE_TASK_STATUSES = new Set(['queued', 'running']);
const HIDDEN_READY_CHECK_KEYS = new Set(['executor_config:opencode_cli']);

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  cancel_requested: '取消中',
  cancelled: '已取消',
  succeeded: '已完成',
  partial_success: '部分成功',
  failed: '失败',
  needs_attention: '待处理',
};

const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  queued: '排队中',
  running: '执行中',
  succeeded: '成功',
  partial_success: '部分成功',
  failed: '失败',
  skipped: '已跳过',
  cancelled: '已取消',
  cancel_requested: '取消中',
};

const statusTone = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    case 'partial_success':
    case 'needs_attention':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
    case 'failed':
      return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
    case 'cancelled':
      return 'border-theme-border bg-theme-elevated text-theme-text-muted';
    case 'cancel_requested':
    case 'running':
      return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
    case 'queued':
    case 'pending':
      return 'border-violet-500/20 bg-violet-500/15 text-violet-400';
    case 'skipped':
      return 'border-theme-border bg-theme-elevated text-theme-text-muted';
    default:
      return 'border-theme-border bg-theme-elevated text-theme-text-secondary';
  }
};

const formatTaskStatus = (status?: string | null) => TASK_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');
const formatStageStatus = (status?: string | null) => STAGE_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');
const isActiveTaskStatus = (status?: string | null) => ACTIVE_TASK_STATUSES.has(String(status || '').toLowerCase());
const isCancellableTaskStatus = (status?: string | null) => CANCELLABLE_TASK_STATUSES.has(String(status || '').toLowerCase());
const isCompletedTaskStatus = (status?: string | null) => ['succeeded', 'partial_success'].includes(String(status || '').toLowerCase());
const humanizeIdentifier = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.toLowerCase() === 'poc') return 'PoC';
  if (raw.toLowerCase() === 'audit') return 'Audit';
  return raw
    .split(/[_\-./]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};
const formatStageLabel = (stage?: string | null) => {
  if (!stage) return '-';
  return humanizeIdentifier(stage);
};
const formatInputKind = (kind?: string | null) => {
  if (kind === 'preset_project') return '预设项目';
  if (kind === 'custom_project') return '自定义路径';
  if (kind === 'existing_audit_report') return '已有审计报告';
  return kind || '-';
};
const formatExecutorMode = (mode?: string | null) => {
  if (mode === 'agentflow_cli') return 'AgentFlow';
  if (mode === 'codex_cli') return 'Codex';
  if (mode === 'opencode_cli') return 'OpenCode';
  if (mode === 'mock') return 'Mock';
  return mode || '-';
};
const formatPipelineMode = (mode?: string | null) => {
  if (mode === 'custom_graph') return 'Custom Graph';
  if (mode === 'audit_then_poc') return 'Audit + PoC';
  if (mode === 'audit_only') return 'Audit Only';
  if (mode === 'poc_only') return 'PoC Only';
  return humanizeIdentifier(mode);
};
const formatReportFormat = (format?: string | null) => {
  if (format === 'markdown') return 'Markdown';
  if (format === 'json') return 'JSON';
  if (format === 'text') return 'Text';
  return humanizeIdentifier(format);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatSize = (value?: number | null) => {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return`${value} B`;
  if (value < 1024 * 1024) return`${(value / 1024).toFixed(1)} KB`;
  return`${(value / 1024 / 1024).toFixed(2)} MB`;
};

const fileNameOf = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized;
};

const isJsonlPath = (path?: string | null) => fileNameOf(path).toLowerCase().endsWith('.jsonl');

const isMarkdownArtifact = (artifact?: IpcAuditArtifact | null, contentType?: string | null) => {
  const name =`${artifact?.display_name || ''} ${artifact?.relative_path || ''}`.toLowerCase();
  return String(contentType || artifact?.content_type || '').toLowerCase().includes('markdown')
    || name.endsWith('.md')
    || name.endsWith('.markdown');
};

const isJsonArtifact = (artifact?: IpcAuditArtifact | null, contentType?: string | null) => {
  const name =`${artifact?.display_name || ''} ${artifact?.relative_path || ''}`.toLowerCase();
  return String(contentType || artifact?.content_type || '').toLowerCase().includes('json') || name.endsWith('.json');
};

const formatPreviewContent = (artifact: IpcAuditArtifact | null, content: IpcAuditArtifactContent | null) => {
  const raw = content?.content || '';
  if (!artifact || !content || !isJsonArtifact(artifact, content.content_type)) return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const isAuditedResultArtifact = (artifact: IpcAuditArtifact) => {
  const name =`${artifact.display_name || ''} ${artifact.relative_path || ''}`.toLowerCase();
  return name.includes('audited-result.json') || artifact.artifact_kind === 'audited_result_json';
};

const findAuditedResultArtifact = (items: IpcAuditArtifact[]) =>
  items.find(isAuditedResultArtifact) || null;

const readNestedValue = (payload: unknown, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = payload;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const formatAuditedResultValue = (value: unknown): string => {
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return value.trim() || '-';
  return '-';
};

const readAuditedResultField = (payload: unknown, paths: string[]): string => {
  for (const path of paths) {
    const value = readNestedValue(payload, path);
    if (value !== undefined && value !== null) return formatAuditedResultValue(value);
  }
  return '-';
};

const parseAuditedResultSummary = (artifact: IpcAuditArtifact, content: string): AuditedResultSummary => {
  const payload = JSON.parse(content);
  return {
    artifact,
    vulnerabilitiesFound: readAuditedResultField(payload, [
      'vulnerabilities_found',
      'summary.vulnerabilities_found',
      'counts.vulnerabilities_found',
      'counts.poc_confirmed_problem_count',
      'statistics.vulnerabilities_found',
      'statistics.vulnerabilities_confirmed',
    ]),
    pocsDeveloped: readAuditedResultField(payload, [
      'pocs_developed',
      'summary.pocs_developed',
      'counts.pocs_developed',
      'counts.poc_generated_count',
      'statistics.pocs_developed',
      'poc_built_success_count',
    ]),
    infoFindings: readAuditedResultField(payload, [
      'info_findings',
      'summary.info_findings',
      'counts.info_findings',
      'statistics.info_findings',
      'notes',
    ]),
  };
};

const normalizeStageNames = (values: Array<string | null | undefined>): string[] => {
  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
};

const deriveStageNamesFromAttempt = (attempt?: IpcAuditAttemptDetail | null): string[] => {
  const config = asRecord(attempt?.effective_config);
  const configured = Array.isArray(config.stage_names) ? config.stage_names.map((item) => String(item || '').trim()) : [];
  const stageRuns = Array.isArray(attempt?.stage_runs) ? attempt.stage_runs.map((item) => item.stage_name) : [];
  const reportOutputNodes = Array.isArray(attempt?.report_outputs) ? attempt.report_outputs.map((item) => item.node_id) : [];
  return normalizeStageNames([...configured, ...stageRuns, ...reportOutputNodes]);
};

const emptyStageSessionMap = (stageNames: string[]): Record<string, IpcAuditStageSessionSummary[]> =>
  Object.fromEntries(stageNames.map((stageName) => [stageName, []]));

const emptyStageLogMap = (stageNames: string[]): Record<string, IpcAuditStageLog | null> =>
  Object.fromEntries(stageNames.map((stageName) => [stageName, null]));

const extractNodeIdsFromInlineGraphContent = (value: unknown): string[] => {
  const graph = asRecord(value);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  return normalizeStageNames(nodes.map((item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? String((item as Record<string, unknown>).id || '').trim()
      : ''
  )));
};

const extractNodeIdsFromInlineGraphText = (value: string): string[] => {
  try {
    return extractNodeIdsFromInlineGraphContent(JSON.parse(value));
  } catch {
    return [];
  }
};

const createDraftKey = () =>`report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toReportOutputDraft = (item: Partial<IpcAuditTaskReportOutputSpec>, index = 0): ReportOutputDraft => ({
  key: createDraftKey(),
  outputId: String(item.output_id || '').trim(),
  nodeId: String(item.node_id || '').trim(),
  title: String(item.title || '').trim(),
  path: String(item.path || '').trim(),
  format: (item.format || 'markdown') as IpcAuditReportFormat,
  required: item.required !== false,
  order: String(item.order ?? index * 10),
});

const buildDefaultReportOutputs = (_mode: PipelineMode, declaredNodes: string[] = []): ReportOutputDraft[] => {
  const nodes = declaredNodes.length > 0 ? declaredNodes : ['stage_1'];
  return nodes.map((nodeId, index) => toReportOutputDraft({
    output_id:`${nodeId.replace(/[^a-zA-Z0-9_\-]/g, '_')}_report`,
    node_id: nodeId,
    title:`${formatStageLabel(nodeId)} Report`,
    path:`exports/${nodeId}-report.md`,
    format: 'markdown',
    required: true,
    order: (index + 1) * 10,
  }, index));
};

const cloneReportOutputDrafts = (items: ReportOutputDraft[]): ReportOutputDraft[] =>
  items.map((item) => ({ ...item, key: createDraftKey() }));

const defaultCustomGraphAuditedResultPath = '[[ task.attempt_root ]]/exports/audited-result.json';
const defaultOpenCodeNodeProvider = {
  name: 'opencode',
  options: {
    chunkTimeout: 120000,
  },
};

const defaultAuditGraphPrompt =`OpenHarmony IPC deep OOB audit task.
Embedded workflow profile: openharmony-project-deep-oob-audit
Repo root: [[ task.repo_root ]]
Subproject: [[ task.project_path ]]
Output report path: [[ task.report_outputs["audit_report"].absolute_path ]]

This prompt is self-contained. Do not invoke, require, or assume any external Codex/OpenCode skill.

Goal:
- Audit only the specified OpenHarmony subproject for IPC-reachable out-of-bounds memory reads/writes.
- Stay scoped to the subproject source for candidate surfaces and broad searches.
- Do not use rg/find from Repo root to discover candidates. If readtags or a direct code reference points to a file outside the subproject, read that exact file directly as dependency context only.
- Write the final Markdown report exactly to Output report path. Create parent directories if needed.

Workflow:
1. Find IPC-reachable attack surfaces first.
- Search under the subproject for server-side IPC handlers and parcel consumers: OnRemoteRequest, OnRemoteRequestInner, IRemoteStub, RemoteStub, IPCObjectStub, transaction dispatch switches/tables, and helpers that read MessageParcel/data.
- Prefer rg under the subproject first. Exclude tests, fuzzers, demos, and sample code unless they reveal the production path.
- The process cwd is intended to be the Subproject path. Do not cd to Repo root or run bare rg/find there.
- Do not run broad rg searches from Repo root. Repo-root access is only for reading exact files resolved by readtags or already referenced from the subproject code.

2. Resolve real implementations; never guess.
- When a relevant function or class is declared, generated, virtual, or referenced indirectly, resolve its real implementation before judging safety.
- Prefer readtags against the Repo root tags file when available: readtags -e -t <Repo root>/tags <symbol> | grep -v test.
- If readtags returns definitions in another project, open those returned files directly. Do not use repo-wide rg to rediscover or expand the search.
- If an implementation cannot be found, record it in an Unresolved section and do not claim a vulnerability based on assumptions.

3. Build the full serialization/deserialization object graph.
- For each IPC transaction, enumerate every parcel read in order: scalar fields, strings, vectors, arrays, maps, file descriptors, raw buffers, blobs, shared memory, ReadParcelable/ReadStrongParcelable, Unmarshalling, ReadFromParcel, and helper parsers.
- For each reconstructed object, inspect field validation, nested member types, constructors, setters, normalizers, conversion helpers, and later consumers.
- Treat all deserialized fields as attacker-controlled until a relevant invariant is proven.

4. Report only concrete OOB read/write issues.
- A valid finding needs this chain: attacker controls IPC parcel data; validation is missing/incomplete or invalidated later; tainted value reaches index/offset/length/stride/count/copy arithmetic; the use can cross the target object's or buffer's bounds.
- Do not report permission issues, null dereference, use-after-free, double free, memory leaks, gradual resource exhaustion, or pure integer overflow unless they are necessary to prove a concrete OOB read/write.

5. Trace into dependent classes and sinks.
- Follow tainted fields beyond the immediate MessageParcel reader into business logic, storage classes, codecs, TLV parsers, flatten/unflatten code, and custom binary parsers.
- Pay special attention to size/count/length/capacity/offset/stride/index/start/end fields, paired offset+length or width+height+stride fields, enum/tag controlled decoding, raw pointers/views, and container sizes trusted before indexing/copying.
- Inspect sinks such as memcpy, memmove, memset, strncpy-like helpers, manual pointer arithmetic, subspan slicing, vector/array/string indexing, and loops controlled by parcel-derived counts.

6. Demand concrete evidence.
- Cite exact attacker-controlled parcel fields and exact later OOB sinks.
- Include file paths and line numbers wherever possible.
- If safety depends on an assumption you cannot prove from code, mark the path unresolved instead of reporting it.
- Keep external files resolved by readtags clearly marked as dependency context, not as new audit scope.

Report requirements:
- Include Scope: Repo root, Subproject, audited IPC entrypoints, and transaction codes if known.
- For each finding include title, severity, affected IPC entrypoint/transaction path, deserialization chain, dependent class/helper chain, concrete OOB sink, attacker-controlled fields, impact, evidence, exploitability notes, and suggested fix.
- If no issue is found, say so explicitly and summarize the IPC surfaces and object graphs inspected.
- Add an Unresolved section for missing definitions or uncertain paths, including the exact rg/readtags attempts made.`;

const defaultPocGraphPrompt =`OpenHarmony IPC audit report PoC validation task.
Embedded workflow profile: openharmony-ipc-project-report-poc
Repo root: [[ task.repo_root ]]
Subproject: [[ task.project_path ]]
Project report: [[ task.report_outputs["audit_report"].absolute_path ]]
Output PoC report path: [[ task.report_outputs["poc_report"].absolute_path ]]
Output audited result json path: ${defaultCustomGraphAuditedResultPath}
PoC report language: 简体中文. Do not translate code blocks, paths, identifiers, or classification tokens.

Container PoC runtime rules:
- You are already inside the chimera-app-ipc-audit container.
- Do not start an additional service/OHEMU Docker container. Do not call ohemu-container.sh, docker run, docker exec, or docker compose.
- Use the in-container QEMU helper: [[ task.poc_runtime.helper_bin ]]
- The helper sources OpenHarmony QEMU scripts from: [[ task.poc_runtime.ohemu_src ]]
- OpenHarmony workspace root: [[ task.poc_runtime.workspace_root ]]
- Prepared qcow2 root: [[ task.poc_runtime.qcow2_root ]]
- Default boot dir: [[ task.poc_runtime.boot_dir ]]
- QEMU runtime/state root: [[ task.poc_runtime.runtime_root ]]
- Per-task overlay disk root: [[ task.poc_runtime.overlay_root ]]
- Default QEMU arch/network: [[ task.poc_runtime.arch ]]/[[ task.poc_runtime.network_mode ]]
- Default HDC endpoint in this container: [[ task.poc_runtime.hdc_bind ]]:[[ task.poc_runtime.hdc_port ]]
- HDC binary: [[ task.poc_runtime.hdc_bin ]]
- Preferred instance name for this task: [[ task.poc_runtime.instance_name ]]

Use these commands when runtime testing is needed:
  [[ task.poc_runtime.helper_bin ]] list
  [[ task.poc_runtime.helper_bin ]] ensure [[ task.poc_runtime.instance_name ]]
  [[ task.poc_runtime.hdc_bin ]] tconn [[ task.poc_runtime.hdc_bind ]]:<HDC_PORT_FROM_HELPER_LIST>
  [[ task.poc_runtime.hdc_bin ]] list targets

Network rules:
- In bridge mode, the guest normally receives a 192.168.111.x address and [[ task.poc_runtime.helper_bin ]] starts socat to forward [[ task.poc_runtime.hdc_bind ]]:<HDC_PORT> to <GUEST_IP>:55555.
- Prefer the HDC endpoint printed by the helper or recorded in the runtime/state/*.env file; do not guess the IP/port.
- The helper waits for the helper-reported HDC endpoint to become Connected before returning, unless OHEMU_WAIT_FOR_HDC_READY=0 is explicitly set.
- If bridge setup is unavailable, usermode may show a 20.20.20.x guest IP and QEMU hostfwd may listen before hdcd is ready; still use the helper-reported HDC endpoint and wait for Connected.

Disk safety rules:
- QEMU must run only with per-task overlay qcow2 files under [[ task.poc_runtime.overlay_root ]].
- The prepared base qcow2 files under [[ task.poc_runtime.qcow2_root ]]/[[ task.poc_runtime.arch ]]/base are backing files only; do not write to them.
- Do not run QEMU directly on OpenHarmony out/*/images/*.img, prepared base qcow2 files, or any shared qcow2 cache file.
- If overlay creation fails or no per-task overlay exists, classify runtime verification as BLOCKED_ENV instead of running on the shared images.

Failure handling rules:
- If the runtime helper returns an error, preserve stdout/stderr verbatim in the report and classify the runtime step as BLOCKED_ENV unless you already have enough evidence for CONFIRMED_NO_POC or CONFIRMED_BUT_NOT_REPRODUCED.
- Read the HDC port from the helper output or from the state file under the runtime/state directory; do not assume guest-side port 5555 is the host-connect port.
- If the helper, qemu binary, mounted workspace, prepared qcow2 cache, boot images, or hdc binary is missing, classify runtime verification as BLOCKED_ENV and record the exact failing command and output.

This prompt is self-contained. Do not invoke, require, or assume any external Codex/OpenCode skill.

Goal:
- Validate the issues in Project report against the reported subproject code and exact referenced dependency files only.
- Always write a PoC report exactly to Output PoC report path. Create parent directories if needed.
- Always write a JSON stats file exactly to Output audited result json path. Create parent directories if needed.

Scope rules:
- Keep code validation scoped to the reported subproject and exact files already cited by the report, direct code references, or readtags.
- The process cwd is intended to be the Subproject path. Do not cd to Repo root or run bare rg/find there.
- Do not run broad rg/find searches from Repo root. If readtags resolves helper classes or implementations in another project, read those exact files directly as dependency context.
- If a reported sink cannot be triggered from OnRemoteRequest or an equivalent IPC stub dispatch into the service-side implementation, classify it as NOT_APPLICABLE and do not generate a PoC for it.
- For Lite system reports, issues based on Lite IPC IpcIo rather than MessageParcel-based IPC are NOT_APPLICABLE in this workflow.
- Do not patch the target service implementation to force a crash.

Validation workflow:
1. Load Project report and extract each issue's component, file/function, root cause, impact, transaction code/interface token hints, and prerequisites.
2. Confirm or refute each issue with code evidence:
- Reachability from IPC entrypoint to service-side implementation.
- Attacker control from IPC data such as MessageParcel fields, raw buffers, vectors, strings, fds, ashmem, or parcelized objects.
- The exact memory-safety hazard.
- Whether mitigations exist in helpers, callees, service guards, or permission gates.
3. Use these classification tokens exactly: CONFIRMED_POC_FEASIBLE, CONFIRMED_NO_POC, CONFIRMED_BUT_NOT_REPRODUCED, BLOCKED_ENV, NOT_APPLICABLE, NOT_CONFIRMED.
4. If all issues are NOT_CONFIRMED or NOT_APPLICABLE, skip PoC build/runtime work and still write the report and JSON stats.

PoC workflow when feasible:
1. Derive the minimal trigger details: target SA/service, how to obtain IRemoteObject, request code, interface token, parameter order, and malformed payload.
2. Prefer a small standalone native PoC source under a task-local or repo-local audit directory. Keep it focused and do not add/modify GN targets by default.
3. Prefer manual clang++ compilation inside the current container from existing out/<product> metadata when available. Use existing obj/**/<target>.ninja, *_module_info.json, packaged .so files, and generated sources instead of running GN.
4. If the current build outputs do not contain enough metadata/generated code/libraries, record BLOCKED_ENV or CONFIRMED_NO_POC with exact missing prerequisites instead of modifying BUILD.gn.
5. If runtime testing is possible, use the in-container QEMU helper from the runtime rules above to boot or reuse OHEMU/QEMU inside the current container, connect with hdc, deploy the PoC, run it, and collect stdout/stderr, hilog, tombstone/faultlogger, or service death/restart evidence.
6. If the PoC builds but does not crash after one minimal adjustment, classify as CONFIRMED_BUT_NOT_REPRODUCED and record evidence.

PoC report requirements:
- Write in the requested report language, normally 简体中文.
- Preserve code, paths, commands, logs, return codes, GN targets, identifiers, and classification tokens verbatim.
- Include Source report path and short summary.
- Include Issue validation for every issue with classification and code evidence.
- Include PoC design, build commands/results, runtime commands/results, selected in-container QEMU instance/HDC port if used, and limitations.
- If no PoC was attempted, explain why using the classification evidence.

JSON stats requirements:
- Write valid JSON to Output audited result json path.
- Use this stable schema:
{"vulnerabilities_found": 0,"pocs_developed": 0,"info_findings": 0,"report": {"project_report":"<Project report>","poc_report":"<Output PoC report path>"
  },"counts": {"audit_findings_total": 0,"poc_confirmed_problem_count": 0,"poc_generated_count": 0,"poc_generated_crash_count": 0
  },"notes": []
}
- vulnerabilities_found counts confirmed real vulnerability findings, including CONFIRMED_POC_FEASIBLE, CONFIRMED_NO_POC, and CONFIRMED_BUT_NOT_REPRODUCED.
- pocs_developed counts generated PoC programs/scripts/binaries.
- info_findings counts informational findings, environmental blockers, unresolved items, or non-vulnerability observations worth surfacing.
- audit_findings_total counts issues described in Project report.
- poc_confirmed_problem_count counts confirmed real problems, including CONFIRMED_POC_FEASIBLE, CONFIRMED_NO_POC, and CONFIRMED_BUT_NOT_REPRODUCED.
- poc_generated_count counts generated PoC programs/scripts/binaries.
- poc_generated_crash_count counts generated PoCs that produced crash/service-death evidence.`;

const defaultCustomGraphPipeline = {
  name: 'custom-graph',
  nodes: [
    {
      id: 'audit',
      agent: 'opencode',
      provider: defaultOpenCodeNodeProvider,
      retries: 1000,
      timeout_seconds: 7200,
      prompt: defaultAuditGraphPrompt,
      success_criteria: [
        {
          kind: 'file_nonempty',
          path: '[[ task.report_outputs["audit_report"].absolute_path ]]',
        },
      ],
    },
    {
      id: 'poc',
      agent: 'opencode',
      provider: defaultOpenCodeNodeProvider,
      depends_on: ['audit'],
      retries: 1000,
      timeout_seconds: 7200,
      prompt: defaultPocGraphPrompt,
      success_criteria: [
        {
          kind: 'file_nonempty',
          path: '[[ task.report_outputs["poc_report"].absolute_path ]]',
        },
        {
          kind: 'json_valid',
          path: defaultCustomGraphAuditedResultPath,
        },
      ],
    },
  ],
};

const defaultCustomGraphContent = JSON.stringify(defaultCustomGraphPipeline, null, 2);

const defaultPythonBuilderCode = [
  'import argparse',
  'import json',
  'from pathlib import Path',
  '',
  'from agentflow import Graph, opencode',
  '',`AUDIT_PROMPT = ${JSON.stringify(defaultAuditGraphPrompt)}`,`POC_PROMPT = ${JSON.stringify(defaultPocGraphPrompt)}`,`AUDIT_REPORT_PATH = ${JSON.stringify('[[ task.report_outputs["audit_report"].absolute_path ]]')}`,`POC_REPORT_PATH = ${JSON.stringify('[[ task.report_outputs["poc_report"].absolute_path ]]')}`,`AUDITED_RESULT_PATH = ${JSON.stringify(defaultCustomGraphAuditedResultPath)}`,`OPENCODE_PROVIDER = ${JSON.stringify(defaultOpenCodeNodeProvider)}`,
  '',
  'def parse_args():',
  '    parser = argparse.ArgumentParser()',
  '    parser.add_argument("--context", required=True)',
  '    parser.add_argument("--output", required=True)',
  '    return parser.parse_args()',
  '',
  'def build_graph(context: dict) -> Graph:',
  '    task = context.get("task") if isinstance(context.get("task"), dict) else context',
  '    work_dir = str(task.get("project_path") or task.get("repo_root") or".")',
  '    with Graph("custom-graph", working_dir=work_dir, concurrency=1) as dag:',
  '        audit = opencode(',
  '            task_id="audit",',
  '            prompt=AUDIT_PROMPT,',
  '            provider=OPENCODE_PROVIDER,',
  '            tools="read_write",',
  '            retries=1000,',
  '            timeout_seconds=7200,',
  '            success_criteria=[',
  '                {"kind":"file_nonempty","path": AUDIT_REPORT_PATH},',
  '            ],',
  '        )',
  '        poc = opencode(',
  '            task_id="poc",',
  '            prompt=POC_PROMPT,',
  '            provider=OPENCODE_PROVIDER,',
  '            tools="read_write",',
  '            retries=1000,',
  '            timeout_seconds=7200,',
  '            success_criteria=[',
  '                {"kind":"file_nonempty","path": POC_REPORT_PATH},',
  '                {"kind":"json_valid","path": AUDITED_RESULT_PATH},',
  '            ],',
  '        )',
  '        audit >> poc',
  '    return dag',
  '',
  'def main():',
  '    args = parse_args()',
  '    context = json.loads(Path(args.context).read_text(encoding="utf-8"))',
  '    output_path = Path(args.output)',
  '    output_path.parent.mkdir(parents=True, exist_ok=True)',
  '    dag = build_graph(context)',
  '    pipeline = json.loads(dag.to_json())',
  '    output_path.write_text(json.dumps(pipeline, ensure_ascii=False, indent=2), encoding="utf-8")',
  '',
  'if __name__ =="__main__":',
  '    main()',
].join('\n');

const normalizeBuilderState = (
  builderSourceMode: BuilderSourceMode,
  pythonBuilderEntry: string,
  pythonBuilderCode: string,
): {
  builderSourceMode: BuilderSourceMode;
  pythonBuilderEntry: string;
  pythonBuilderCode: string;
} => {
  const normalizedEntry = String(pythonBuilderEntry || '').trim();
  const normalizedCode = String(pythonBuilderCode || '');
  if (builderSourceMode === 'entry' && normalizedEntry && !normalizedCode.trim()) {
    return {
      builderSourceMode: 'entry',
      pythonBuilderEntry: normalizedEntry,
      pythonBuilderCode: '',
    };
  }
  if (normalizedCode.trim()) {
    return {
      builderSourceMode: 'code',
      pythonBuilderEntry: normalizedEntry,
      pythonBuilderCode: normalizedCode,
    };
  }
  if (normalizedEntry) {
    return {
      builderSourceMode: 'entry',
      pythonBuilderEntry: normalizedEntry,
      pythonBuilderCode: '',
    };
  }
  return {
    builderSourceMode: 'code',
    pythonBuilderEntry: '',
    pythonBuilderCode: defaultPythonBuilderCode,
  };
};

const templateToRecord = (template: IpcAuditTaskTemplate): GraphTemplateRecord => {
  const graphSource = template.config.graph_source || null;
  const inlineNodes = graphSource?.type === 'inline_json'
    ? extractNodeIdsFromInlineGraphContent(graphSource.content)
    : [];
  const normalizedBuilder = normalizeBuilderState(
    graphSource?.type === 'python_builder' && graphSource.code ? 'code' : 'entry',
    graphSource?.type === 'python_builder' ? String(graphSource.entry || '') : '',
    graphSource?.type === 'python_builder' ? String(graphSource.code || '') : '',
  );
  return {
    templateId: template.template_id,
    name: template.name,
    description: template.description || null,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    config: {
      pipelineMode: 'custom_graph',
      executorMode: 'agentflow_cli',
      modelName: String(template.config.model || ''),
      providerKey: String((template.config.provider_keys || [])[0] || ''),
      graphSourceType: graphSource?.type === 'python_builder' ? 'python_builder' : 'inline_json',
      builderSourceMode: normalizedBuilder.builderSourceMode,
      inlineJsonText: graphSource?.type === 'inline_json'
        ? JSON.stringify(graphSource.content || {}, null, 2)
        : defaultCustomGraphContent,
      pythonBuilderEntry: normalizedBuilder.pythonBuilderEntry,
      pythonBuilderCode: normalizedBuilder.pythonBuilderCode,
      reportOutputs: cloneReportOutputDrafts((template.config.report_outputs || []).map((item, index) => toReportOutputDraft({
        output_id: item.output_id,
        node_id: item.node_id,
        title: item.title,
        path: item.path,
        format: item.format,
        required: item.required,
        order: item.order ?? index * 10,
      }, index))),
    },
  };
};

const shortPath = (value?: string | null) => {
  if (!value) return '-';
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 4 ?`.../${parts.slice(-4).join('/')}` : value;
};

const toSearchText = (value?: string | null) => String(value || '').trim().toLowerCase();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const asRecordArray = (value: unknown): Record<string, any>[] => (
  Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, any>[]
    : []
);

type SessionDeltaParseResult = {
  sessionMeta: Record<string, any> | null;
  events: AppSaSessionEvent[];
  warnings: string[];
  lineCount: number;
};

const SESSION_THINKING_LEVEL_MAP: Record<string, string> = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  'x-high': 'xhigh',
  xhigh: 'xhigh',
};

const sessionNestedRecord = (value: Record<string, any>, key: string): Record<string, any> => asRecord(value[key]);

const sessionFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (value != null && typeof value !== 'object') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
};

const sessionNestedSdkSpecific = (...records: Record<string, any>[]): Record<string, any> => {
  for (const record of records) {
    const sdk = sessionNestedRecord(record, 'sdk_specific');
    if (Object.keys(sdk).length) return sdk;
    const runtime = sessionNestedRecord(record, 'runtime_config');
    const runtimeSdk = sessionNestedRecord(runtime, 'sdk_specific');
    if (Object.keys(runtimeSdk).length) return runtimeSdk;
  }
  return {};
};

const normalizeSessionTimestamp = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1000000000000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return asString(value);
};

const normalizeToolName = (value: unknown, fallback = 'tool') => {
  const name = asString(value).trim();
  return name || fallback;
};

const trimSessionTextBlock = (value: string): string => value.replace(/^\n+|\n+$/g, '');

const pushSessionTextPart = (parts: Array<Record<string, any>>, type: 'text' | 'thinking', value: unknown) => {
  const text = trimSessionTextBlock(asString(value));
  if (!text.trim()) return;
  parts.push({ type, text });
};

const parseTaggedTextParts = (content: string): Array<Record<string, any>> => {
  const parts: Array<Record<string, any>> = [];
  const pattern = /<think>([\s\S]*?)<\/think>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    pushSessionTextPart(parts, 'text', content.slice(lastIndex, match.index));
    pushSessionTextPart(parts, 'thinking', match[1] || '');
    lastIndex = match.index + match[0].length;
  }
  pushSessionTextPart(parts, 'text', content.slice(lastIndex));
  return parts;
};

const buildSessionMessageEvent = (
  lineNo: number,
  timestamp: string,
  role: string,
  parts: Array<Record<string, any>>,
  rawLine: string,
  extra: Partial<AppSaSessionEvent> = {},
): AppSaSessionEvent => ({
  type: 'message',
  line: lineNo,
  event_index: lineNo,
  timestamp,
  display_timestamp: timestamp,
  role,
  render_role: role,
  parts,
  raw_line: rawLine,
  ...extra,
});

const buildSessionStatusEvent = (
  lineNo: number,
  timestamp: string,
  type: string,
  summary: string,
  rawLine: string,
): AppSaSessionEvent => ({
  type,
  line: lineNo,
  event_index: lineNo,
  timestamp,
  display_timestamp: timestamp,
  summary,
  raw_line: rawLine,
});

const buildToolEvents = (
  lineNo: number,
  timestamp: string,
  toolName: string,
  callId: string,
  input: unknown,
  output: string,
  rawLine: string,
  isError: boolean,
): AppSaSessionEvent[] => {
  const events = [
    buildSessionMessageEvent(lineNo, timestamp, 'assistant', [{
      type: 'toolCall',
      name: toolName,
      id: callId,
      arguments: input && typeof input === 'object' ? input as Record<string, any> : {},
    }], rawLine),
  ];
  if (output || isError) {
    events.push(buildSessionMessageEvent(lineNo, timestamp, 'toolResult', [{
      type: 'toolResult',
      name: toolName,
      text: output || '(no output)',
      isError,
    }], rawLine, {
      toolCallId: callId,
      toolName,
      isError,
    }));
  }
  return events;
};

const toolNameFromTitle = (value: unknown) => {
  const title = asString(value);
  const match = /^tool (?:result|error):\s*(.+)$/i.exec(title.trim());
  return normalizeToolName(match?.[1] || '', '');
};

const isSilentSessionLifecycleEvent = (obj: Record<string, any>): boolean => {
  const eventType = String(obj.type || '');
  const partType = String(asRecord(obj.part).type || '');
  const title = asString(obj.title).toLowerCase();
  return title === 'thread.started'
    || title === 'turn.started'
    || eventType === 'thread.started'
    || eventType === 'turn.started'
    || partType === 'step-start'
    || partType === 'step-finish';
};

const parseSessionMessageParts = (content: unknown): Array<Record<string, any>> => {
  const parts: Array<Record<string, any>> = [];
  if (typeof content === 'string') {
    return parseTaggedTextParts(content);
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const item = content as Record<string, any>;
    const contentType = String(item.type || item.kind || '');
    if (contentType === 'text' || typeof item.text === 'string') {
      return parseTaggedTextParts(asString(item.text));
    }
    if (contentType === 'thinking' || typeof item.thinking === 'string') {
      pushSessionTextPart(parts, 'thinking', item.thinking || item.text || '');
      return parts;
    }
    if (contentType === 'toolCall' || contentType === 'tool_call') {
      parts.push({
        type: 'toolCall',
        name: normalizeToolName(item.name || item.tool),
        id: item.id || item.callId || item.callID || '',
        arguments: item.arguments || item.args || item.input || {},
      });
      return parts;
    }
    if (contentType === 'toolResult' || contentType === 'tool_result' || typeof item.output === 'string') {
      parts.push({
        type: 'toolResult',
        text: item.text || item.output || '',
        name: normalizeToolName(item.name || item.tool, ''),
        isError: Boolean(item.isError ?? item.is_error ?? item.error ?? false),
      });
      return parts;
    }
    return parts;
  }
  if (!Array.isArray(content)) return parts;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const part = item as Record<string, any>;
    const contentType = String(part.type || part.kind || '');
    if (contentType === 'text') {
      parts.push(...parseTaggedTextParts(asString(part.text)));
    } else if (contentType === 'thinking') {
      pushSessionTextPart(parts, 'thinking', part.thinking || part.text || '');
    } else if (contentType === 'toolCall' || contentType === 'tool_call') {
      parts.push({
        type: 'toolCall',
        name: normalizeToolName(part.name || part.tool),
        id: part.id || part.callId || part.callID || '',
        arguments: part.arguments || part.args || part.input || {},
      });
    } else if (contentType === 'toolResult' || contentType === 'tool_result') {
      parts.push({
        type: 'toolResult',
        text: part.text || part.output || '',
        name: normalizeToolName(part.name || part.tool, ''),
        isError: Boolean(part.isError ?? part.is_error ?? part.error ?? false),
      });
    } else {
      parts.push({ type: 'unknown', detail: JSON.stringify(part).slice(0, 200) });
    }
  }
  return parts;
};

const parseSessionJsonlObject = (obj: Record<string, any>, rawLine: string, lineNo: number): {
  sessionMeta?: Record<string, any>;
  events?: AppSaSessionEvent[];
} => {
  const eventType = String(obj.type || obj.kind || '');
  const timestamp = normalizeSessionTimestamp(obj.timestamp || obj.time || '');
  const payload = sessionNestedRecord(obj, 'payload');
  const data = sessionNestedRecord(obj, 'data');
  const config = sessionNestedRecord(obj, 'config');
  const metadata = sessionNestedRecord(obj, 'metadata');
  const options = sessionNestedRecord(obj, 'options');
  const settings = sessionNestedRecord(obj, 'settings');
  const message = obj.message && typeof obj.message === 'object' ? obj.message as Record<string, any> : {};
  const raw = asRecord(obj.raw);
  const sdk = sessionNestedSdkSpecific(obj, payload, data, config, metadata, options, settings);
  if (isSilentSessionLifecycleEvent(obj)) {
    return {};
  }
  const modelProvider = sessionFirstString(
    obj.provider,
    obj.modelProvider,
    obj.model_provider,
    payload.provider,
    data.provider,
    config.provider,
    metadata.provider,
    options.provider,
    settings.provider,
    message.provider,
    sdk.provider,
  );
  const modelId = sessionFirstString(
    obj.modelId,
    obj.modelID,
    obj.model_id,
    obj.model,
    obj.modelName,
    obj.model_name,
    payload.modelId,
    payload.model_id,
    payload.model,
    data.modelId,
    data.model_id,
    data.model,
    config.model,
    metadata.modelId,
    metadata.model_id,
    metadata.model,
    options.modelId,
    options.model_id,
    options.model,
    settings.modelId,
    settings.model_id,
    settings.model,
    message.modelId,
    message.model_id,
    message.model,
    sdk.model,
  );
  const thinkingLevel = sessionFirstString(
    obj.thinkingLevel,
    obj.thinking_level,
    obj.thinking,
    obj.reasoningEffort,
    obj.reasoning_effort,
    obj.level,
    payload.thinkingLevel,
    payload.thinking_level,
    payload.thinking,
    payload.reasoning_effort,
    payload.level,
    data.thinkingLevel,
    data.thinking_level,
    data.thinking,
    data.reasoning_effort,
    data.level,
    config.thinkingLevel,
    config.thinking_level,
    config.thinking,
    config.reasoning_effort,
    config.level,
    metadata.thinkingLevel,
    metadata.thinking_level,
    metadata.thinking,
    metadata.reasoning_effort,
    metadata.level,
    options.thinkingLevel,
    options.thinking_level,
    options.thinking,
    options.reasoning_effort,
    options.level,
    settings.thinkingLevel,
    settings.thinking_level,
    settings.thinking,
    settings.reasoning_effort,
    settings.level,
    message.thinkingLevel,
    message.thinking_level,
    message.thinking,
    message.reasoning_effort,
    message.level,
    sdk.thinking,
    sdk.reasoning_effort,
    sdk.level,
  );
  if (eventType === 'session') {
    return {
      sessionMeta: {
        id: obj.id || obj.sessionID || obj.session_id || '',
        version: obj.version || '',
        timestamp,
        cwd: obj.cwd || obj.path || '',
        provider: modelProvider,
        model: modelId,
        thinking: thinkingLevel,
      },
    };
  }
  if (['model_change', 'model', 'model_changed', 'set_model'].includes(eventType) || (modelId && !eventType.startsWith('message'))) {
    return {
      events: [{
        type: 'model_change',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        provider: modelProvider,
        modelId,
        raw_line: rawLine,
      }],
    };
  }
  if (['thinking_level_change', 'thinking_level', 'thinking', 'reasoning_effort_change', 'reasoning_effort'].includes(eventType) || (thinkingLevel && !eventType.startsWith('message'))) {
    const level = thinkingLevel;
    return {
      events: [{
        type: 'thinking_level_change',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        thinkingLevel: level,
        thinkingLevelClass:`thinking-${SESSION_THINKING_LEVEL_MAP[level.toLowerCase()] || 'off'}`,
        raw_line: rawLine,
      }],
    };
  }
  if (eventType === 'message' || eventType === 'message_end' || eventType === 'assistant_message' || eventType === 'agent_message') {
    const content = message.content ?? obj.content ?? obj.text ?? (typeof obj.message === 'string' ? obj.message : '');
    const parts = parseSessionMessageParts(content);
    const inferredRole = parts.length === 1 && parts[0].type === 'toolResult' ? 'toolResult' : 'assistant';
    const role = String(message.role || obj.role || inferredRole);
    if (parts.length === 0) return {};
    const event = buildSessionMessageEvent(lineNo, timestamp, role, parts, rawLine);
    if (role === 'toolResult') {
      const resultPart = parts.find((part) => part.type === 'toolResult') || {};
      event.toolCallId = message.toolCallId || message.tool_call_id || '';
      event.toolName = message.toolName || message.tool_name || resultPart.name || '';
      event.isError = Boolean(message.isError ?? message.is_error ?? resultPart.isError ?? false);
    }
    return { events: [event] };
  }
  if (eventType === 'item_completed') {
    const rawItem = asRecord(raw.item);
    const rawItemType = asString(rawItem.type).trim().toLowerCase();
    const content = rawItem.text ?? obj.content ?? '';
    if (rawItemType === 'agent_message' || asString(content).trim()) {
      const parts = parseSessionMessageParts(content);
      if (parts.length > 0) {
        return { events: [buildSessionMessageEvent(lineNo, timestamp, 'assistant', parts, rawLine)] };
      }
    }
    return {
      events: [buildSessionStatusEvent(
        lineNo,
        timestamp,
        'item_completed',
        asString(obj.title ||`Item completed${rawItemType ?`: ${rawItemType}` : ''}`),
        rawLine,
      )],
    };
  }
  if (eventType === 'text') {
    const part = asRecord(obj.part);
    const parts = parseSessionMessageParts(part.text ?? obj.text ?? obj.content);
    if (parts.length === 0) return {};
    return { events: [buildSessionMessageEvent(lineNo, timestamp, 'assistant', parts, rawLine)] };
  }
  if (eventType === 'tool_use' || eventType === 'tool_call') {
    const part = asRecord(obj.part);
    const state = asRecord(part.state);
    const metadataState = asRecord(state.metadata);
    const toolName = normalizeToolName(part.tool || state.title || obj.tool || obj.name);
    const callId = sessionFirstString(part.callID, part.callId, part.id, obj.callID, obj.callId, obj.id);
    const input = state.input || part.input || obj.input || obj.arguments || {};
    const output = asString(state.output ?? metadataState.output ?? part.output ?? obj.output ?? '');
    const status = sessionFirstString(state.status, obj.status);
    return {
      events: buildToolEvents(
        lineNo,
        timestamp,
        toolName,
        callId,
        input,
        output,
        rawLine,
        status === 'error' || status === 'failed',
      ),
    };
  }
  if (eventType === 'tool_result' || eventType === 'tool_error') {
    const part = asRecord(raw.part);
    const state = asRecord(part.state);
    const metadataState = asRecord(state.metadata);
    const toolName = normalizeToolName(part.tool || state.title || obj.tool || obj.name || toolNameFromTitle(obj.title));
    const callId = sessionFirstString(part.callID, part.callId, part.id, obj.callID, obj.callId, obj.id);
    const input = state.input || part.input || obj.input || obj.arguments || {};
    const output = asString(obj.content ?? state.output ?? metadataState.output ?? part.output ?? obj.output ?? '');
    const status = sessionFirstString(state.status, obj.status);
    return {
      events: buildToolEvents(
        lineNo,
        timestamp,
        toolName,
        callId,
        input,
        output,
        rawLine,
        eventType === 'tool_error' || status === 'error' || status === 'failed',
      ),
    };
  }
  if (eventType === 'stderr' || String(obj.source || '') === 'stderr') {
    const summary = asString(obj.content ?? obj.raw ?? obj.message ?? obj.title);
    if (!summary.trim()) return {};
    return { events: [buildSessionStatusEvent(lineNo, timestamp, 'stderr', summary, rawLine)] };
  }
  if (eventType === 'step_started' || eventType === 'step_start') {
    return {};
  }
  if (eventType === 'step_finished' || eventType === 'step_finish') {
    return {};
  }
  if (['completed', 'failed', 'cancelled', 'timed_out', 'permission'].includes(eventType)) {
    const summary = sessionFirstString(obj.content, obj.message, obj.title, eventType.replace(/_/g, ' '));
    if (eventType === 'failed') {
      return {
        events: [{
          type: 'error',
          line: lineNo,
          event_index: lineNo,
          timestamp,
          display_timestamp: timestamp,
          summary,
          raw_line: rawLine.slice(0, 200),
        }],
      };
    }
    return { events: [buildSessionStatusEvent(lineNo, timestamp, eventType, summary, rawLine)] };
  }
  if (eventType === 'event') {
    const title = asString(obj.title).trim().toLowerCase();
    const summary = sessionFirstString(obj.content, obj.message, obj.title, 'event');
    if (title === 'thread.started' || title === 'turn.started') {
      return {};
    }
    if (title === 'error') {
      return {
        events: [{
          type: 'error',
          line: lineNo,
          event_index: lineNo,
          timestamp,
          display_timestamp: timestamp,
          summary,
          raw_line: rawLine.slice(0, 200),
        }],
      };
    }
    return { events: [buildSessionStatusEvent(lineNo, timestamp, 'event', summary, rawLine)] };
  }
  if (eventType === 'error') {
    const error = asRecord(obj.error);
    const dataError = asRecord(error.data);
    const summary = asString(dataError.message || error.message || obj.message || obj.content || 'Agent error');
    return {
      events: [{
        type: 'error',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        summary,
        raw_line: rawLine.slice(0, 200),
      }],
    };
  }
  return {
    events: [{
      type: eventType || 'unknown_event',
      line: lineNo,
      event_index: lineNo,
      timestamp,
      display_timestamp: timestamp,
      summary: JSON.stringify(obj).slice(0, 200),
      raw_line: rawLine.slice(0, 200),
    }],
  };
};

const parseSessionJsonlDelta = (lines: string[], startLine: number): SessionDeltaParseResult => {
  const events: AppSaSessionEvent[] = [];
  const warnings: string[] = [];
  let sessionMeta: Record<string, any> | null = null;
  let lineCount = 0;

  lines.forEach((rawLine, index) => {
    const lineNo = startLine + index;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    lineCount += 1;
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      events.push(buildSessionStatusEvent(lineNo, '', 'stderr', trimmed, trimmed.slice(0, 200)));
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        events.push({ type: 'raw', line: lineNo, raw_line: trimmed.slice(0, 200), summary: trimmed.slice(0, 200) });
        return;
      }
      const mapped = parseSessionJsonlObject(parsed as Record<string, any>, trimmed, lineNo);
      if (mapped.sessionMeta) sessionMeta = mapped.sessionMeta;
      if (mapped.events) events.push(...mapped.events);
    } catch {
      warnings.push(`第 ${lineNo} 行 JSON 解析失败`);
      events.push({ type: 'raw', line: lineNo, raw_line: trimmed.slice(0, 200), summary: trimmed.slice(0, 200) });
    }
  });

  return { sessionMeta, events, warnings, lineCount };
};

const buildSessionSnapshotFromText = (path: string, content: string) => {
  const lines = content.split(/\r?\n/);
  const parsed = parseSessionJsonlDelta(lines, 1);
  return {
    path,
    session_meta: parsed.sessionMeta || {},
    events: parsed.events,
    warnings: parsed.warnings,
    line_count: parsed.lineCount,
  };
};

const buildProviderSnapshotMap = (value: unknown): Map<string, Record<string, any>> => {
  const map = new Map<string, Record<string, any>>();
  asRecordArray(value).forEach((item) => {
    const key = String(item.provider_key || '').trim();
    if (key) map.set(key, item);
  });
  return map;
};

const displayProviderName = (providerKey: string, snapshotMap: Map<string, Record<string, any>>) => {
  const snapshot = snapshotMap.get(providerKey);
  return String(snapshot?.display_name || providerKey).trim() || providerKey;
};

const buildTaskRuntimeSummary = (effectiveConfig: unknown): TaskRuntimeSummary | null => {
  const config = asRecord(effectiveConfig);
  const providerKeys = normalizeProviderKeys(config.provider_keys);
  const providerSnapshots = asRecordArray(config.provider_snapshots);
  const executorMode = asString(config.executor_mode || config.execution_mode).trim();
  const model = asString(config.model).trim();
  const taskModel = asString(config.task_model).trim();
  if (!executorMode && !model && !taskModel && providerKeys.length === 0 && providerSnapshots.length === 0) return null;
  return {
    executorMode,
    model,
    taskModel,
    providerKeys,
    providerSnapshots,
  };
};

const parseTaskGraphManifest = (content: string): TaskGraphManifest | null => {
  const payload = asRecord(JSON.parse(content));
  if (!payload || String(payload.kind || '').trim() !== 'custom_graph') return null;
  const pipeline = asRecord(payload.pipeline);
  const rawPipelineNodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
  const rawNodeMap = asRecord(payload.nodes);
  const manifestNodeMap: Record<string, TaskGraphManifestNodeRuntime> = {};
  Object.entries(rawNodeMap).forEach(([nodeId, rawValue]) => {
    const item = asRecord(rawValue);
    manifestNodeMap[nodeId] = {
      status: asString(item.status).trim(),
      message: asString(item.message).trim(),
      return_code: item.return_code == null ? null : Number(item.return_code),
      log_path: asString(item.log_path).trim(),
      session_files: Array.isArray(item.session_files) ? item.session_files.map((value) => asString(value).trim()).filter(Boolean) : [],
      reports: Array.isArray(item.reports)
        ? item.reports.map((report) => {
          const normalized = asRecord(report);
          return {
            output_id: asString(normalized.output_id).trim(),
            node_id: nodeId,
            title: asString(normalized.title).trim(),
            relative_path: asString(normalized.relative_path).trim(),
            format: asString(normalized.format).trim(),
            required: Boolean(normalized.required),
            exists: Boolean(normalized.exists),
          };
        })
        : [],
    };
  });
  return {
    kind: 'custom_graph',
    pipeline: {
      name: asString(pipeline.name).trim(),
      working_dir: asString(pipeline.working_dir).trim(),
      nodes: rawPipelineNodes.map((rawNode) => {
        const node = asRecord(rawNode);
        return {
          id: asString(node.id).trim(),
          depends_on: Array.isArray(node.depends_on) ? node.depends_on.map((value) => asString(value).trim()).filter(Boolean) : [],
          agent: asString(node.agent).trim(),
          model: asString(node.model).trim(),
          tools: asString(node.tools).trim(),
          target: node.target && typeof node.target === 'object' && !Array.isArray(node.target) ? node.target as Record<string, any> : null,
          success_criteria: asRecordArray(node.success_criteria),
          prompt: asString(node.prompt),
        };
      }).filter((node) => node.id),
    },
    nodes: manifestNodeMap,
    reports: Array.isArray(payload.reports)
      ? payload.reports.map((report) => {
        const normalized = asRecord(report);
        return {
          output_id: asString(normalized.output_id).trim(),
          node_id: asString(normalized.node_id).trim(),
          title: asString(normalized.title).trim(),
          relative_path: asString(normalized.relative_path).trim(),
          format: asString(normalized.format).trim(),
          required: Boolean(normalized.required),
          exists: Boolean(normalized.exists),
        };
      })
      : [],
  };
};

const extractPipelineNodesFromGraphSource = (graphSource: unknown): TaskGraphManifestPipelineNode[] => {
  const source = asRecord(graphSource);
  if (String(source.type || '').trim() !== 'inline_json') return [];
  const content = asRecord(source.content);
  const nodes = Array.isArray(content.nodes) ? content.nodes : [];
  return nodes.map((rawNode) => {
    const node = asRecord(rawNode);
    return {
      id: asString(node.id).trim(),
      depends_on: Array.isArray(node.depends_on) ? node.depends_on.map((value) => asString(value).trim()).filter(Boolean) : [],
      agent: asString(node.agent).trim(),
      model: asString(node.model).trim(),
      tools: asString(node.tools).trim(),
      target: node.target && typeof node.target === 'object' && !Array.isArray(node.target) ? node.target as Record<string, any> : null,
      success_criteria: asRecordArray(node.success_criteria),
      prompt: asString(node.prompt),
    };
  }).filter((node) => node.id);
};

const extractPipelineNodesFromEffectiveConfig = (effectiveConfig: unknown): TaskGraphManifestPipelineNode[] => {
  const config = asRecord(effectiveConfig);
  const materialized = extractPipelineNodesFromGraphSource(config.materialized_graph_source);
  if (materialized.length > 0) return materialized;
  return extractPipelineNodesFromGraphSource(config.graph_source);
};

const buildTaskGraphNodeViews = (
  attempt: IpcAuditAttemptDetail | null,
  manifest: TaskGraphManifest | null,
  reportOutputs: IpcAuditTaskReportOutput[],
  sessions: Record<string, IpcAuditStageSessionSummary[]>,
): TaskGraphNodeView[] => {
  const stageRunMap = new Map((attempt?.stage_runs || []).map((item) => [item.stage_name, item]));
  const pipelineNodes = (manifest?.pipeline?.nodes || []).length > 0
    ? (manifest?.pipeline?.nodes || [])
    : extractPipelineNodesFromEffectiveConfig(attempt?.effective_config);
  const pipelineNodeMap = new Map(pipelineNodes.map((item) => [item.id, item]));
  const manifestNodeMap = manifest?.nodes || {};
  const reportOutputMap = new Map<string, IpcAuditTaskReportOutput[]>();
  reportOutputs.forEach((item) => {
    const existing = reportOutputMap.get(item.node_id) || [];
    existing.push(item);
    reportOutputMap.set(item.node_id, existing);
  });
  reportOutputMap.forEach((items, nodeId) => {
    reportOutputMap.set(nodeId, [...items].sort((left, right) => ((left.order ?? 0) - (right.order ?? 0)) || left.title.localeCompare(right.title)));
  });
  const nodeIds = normalizeStageNames([
    ...pipelineNodes.map((item) => item.id),
    ...deriveStageNamesFromAttempt(attempt),
    ...Object.keys(manifestNodeMap),
  ]);
  return nodeIds.map((nodeId) => {
    const pipelineNode = pipelineNodeMap.get(nodeId);
    const runtimeNode = manifestNodeMap[nodeId];
    const stageRun = stageRunMap.get(nodeId);
    const sessionFiles = normalizeStageNames([
      ...(runtimeNode?.session_files || []),
      ...(sessions[nodeId] || []).map((item) => item.path),
    ]);
    return {
      id: nodeId,
      label: formatStageLabel(nodeId),
      status: String(runtimeNode?.status || stageRun?.status || 'pending').trim() || 'pending',
      message: String(runtimeNode?.message || stageRun?.message || '').trim(),
      returnCode: runtimeNode?.return_code ?? stageRun?.return_code ?? null,
      dependsOn: normalizeStageNames(pipelineNode?.depends_on || []),
      agent: String(pipelineNode?.agent || '').trim(),
      model: String(pipelineNode?.model || '').trim(),
      tools: String(pipelineNode?.tools || '').trim(),
      targetCwd: String(asRecord(pipelineNode?.target).cwd || '').trim(),
      prompt: String(pipelineNode?.prompt || '').trim(),
      sessionFiles,
      reports: reportOutputMap.get(nodeId) || [],
      hasEventsJsonl: sessionFiles.some((path) => ['trace.jsonl', 'events.jsonl'].includes(fileNameOf(path))),
      hasLastMessage: sessionFiles.some((path) => fileNameOf(path) === 'last-message.md'),
      hasPrompt: sessionFiles.some((path) => fileNameOf(path) === 'prompt.txt'),
    };
  });
};

const graphNodeBadgeTone = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded' || normalized === 'completed') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (normalized === 'running' || normalized === 'queued') return 'border-sky-500/20 bg-sky-500/15 text-sky-400';
  if (normalized === 'failed' || normalized === 'timed_out' || normalized === 'cancelled') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (normalized === 'skipped') return 'border-theme-border bg-theme-elevated text-theme-text-secondary';
  return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
};

const graphNodeCardTone = (status: string, active: boolean) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded' || normalized === 'completed') {
    return active ? 'border-emerald-300 bg-emerald-500/15' : 'border-emerald-500/20 bg-theme-elevated';
  }
  if (normalized === 'running' || normalized === 'queued') {
    return active ? 'border-sky-300 bg-sky-500/15' : 'border-sky-500/20 bg-theme-elevated';
  }
  if (normalized === 'failed' || normalized === 'timed_out' || normalized === 'cancelled') {
    return active ? 'border-rose-300 bg-rose-500/15' : 'border-rose-500/20 bg-theme-elevated';
  }
  if (normalized === 'skipped') {
    return active ? 'border-theme-border bg-theme-elevated' : 'border-theme-border bg-theme-elevated';
  }
  return active ? 'border-amber-300 bg-amber-500/15' : 'border-amber-500/20 bg-theme-elevated';
};

const buildTaskGraphFlow = (
  items: TaskGraphNodeView[],
  selectedNodeId: string,
): { nodes: TaskGraphCanvasNodeType[]; edges: Edge[] } => {
  const TASK_GRAPH_NODE_WIDTH = 240;
  const TASK_GRAPH_NODE_HEIGHT = 108;
  const TASK_GRAPH_COLUMN_GAP = 320;
  const TASK_GRAPH_ROW_GAP = 170;
  const dependencyMap = new Map(items.map((item) => [item.id, item.dependsOn.filter((dep) => items.some((candidate) => candidate.id === dep))]));
  const depthCache = new Map<string, number>();
  const resolveDepth = (nodeId: string, visiting: Set<string>): number => {
    if (depthCache.has(nodeId)) return depthCache.get(nodeId) || 0;
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    const depth = Math.max(0, ...((dependencyMap.get(nodeId) || []).map((dep) => resolveDepth(dep, visiting) + 1)));
    visiting.delete(nodeId);
    depthCache.set(nodeId, depth);
    return depth;
  };
  const groups = new Map<number, TaskGraphNodeView[]>();
  items.forEach((item) => {
    const depth = resolveDepth(item.id, new Set<string>());
    const existing = groups.get(depth) || [];
    existing.push(item);
    groups.set(depth, existing);
  });
  const sortedDepths = [...groups.keys()].sort((left, right) => left - right);
  const nodes: TaskGraphCanvasNodeType[] = [];
  sortedDepths.forEach((depth) => {
    const group = groups.get(depth) || [];
    group.forEach((item, index) => {
      nodes.push({
        id: item.id,
        type: 'taskGraphNode',
        position: { x: depth * TASK_GRAPH_COLUMN_GAP, y: index * TASK_GRAPH_ROW_GAP },
        data: {
          label: item.label,
          status: item.status,
          agent: item.agent,
          model: item.model,
          reportCount: item.reports.length,
          active: item.id === selectedNodeId,
          hasEventsJsonl: item.hasEventsJsonl,
          hasLastMessage: item.hasLastMessage,
        },
        draggable: false,
        selectable: true,
        style: { width: TASK_GRAPH_NODE_WIDTH },
        initialWidth: TASK_GRAPH_NODE_WIDTH,
        initialHeight: TASK_GRAPH_NODE_HEIGHT,
      } as TaskGraphCanvasNodeType);
    });
  });
  const edges: Edge[] = items.flatMap((item) => item.dependsOn
    .filter((dep) => items.some((candidate) => candidate.id === dep))
    .map((dep) => ({
      id:`${dep}->${item.id}`,
      source: dep,
      target: item.id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      animated: item.status === 'running',
    })));
  return { nodes, edges };
};

const normalizeReadyState = (value: { status?: string | null; ready?: boolean | null; checks?: Record<string, boolean> | null }): IpcAuditReadyState => ({
  status: value.status || 'unknown',
  ready: Boolean(value.ready),
  checks: value.checks && typeof value.checks === 'object' ? value.checks : {},
});

const formatReadyFailure = (checks?: Record<string, boolean>) => {
  const failedChecks = Object.entries(checks || {})
    .filter(([key, ok]) => !ok && !HIDDEN_READY_CHECK_KEYS.has(key))
    .map(([key]) => key);
  return failedChecks.length > 0 ?`失败检查项：${failedChecks.join(', ')}` : '服务未就绪';
};

const defaultStage = (
  stageNames: string[],
  sessions: Record<string, IpcAuditStageSessionSummary[]>,
  attempt?: IpcAuditAttemptDetail | null,
): StageName => {
  const ordered = normalizeStageNames(stageNames);
  for (const stageName of ordered) {
    if ((sessions[stageName] || []).length > 0) return stageName;
  }
  const running = attempt?.stage_runs.find((item) => item.status === 'running');
  if (running?.stage_name && ordered.includes(running.stage_name)) return running.stage_name;
  return ordered[0] || 'audit';
};

const preferredSession = (items: IpcAuditStageSessionSummary[]) => {
  return (
    items.find((item) => fileNameOf(item.path) === 'trace.jsonl') ||
    items.find((item) => fileNameOf(item.path) === 'events.jsonl') ||
    items.find((item) => fileNameOf(item.path) === 'last-message.md') ||
    items.find((item) => fileNameOf(item.path) === 'prompt.txt') ||
    items[0] ||
    null
  );
};

const normalizeProjectPathInput = (value: string) => value.trim().replace(/^\/+|\/+$/g, '');
const normalizeProviderKeys = (value: unknown): string[] => (
  Array.isArray(value)
    ? value
      .map((item) => String(item || '').trim())
      .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index)
    : []
);

const buildDefaultTitle = (inputPath?: string | null, displayName?: string | null) => {
  const rawPath = String(inputPath || '').trim();
  const pathName = fileNameOf(rawPath);
  const subject = String(displayName || '').trim() || (pathName === '-' ? rawPath : pathName);
  return`IPC漏洞扫描 · ${subject || '新任务'}`;
};

const buildBatchTaskTitle = (titlePrefix: string, targetCount: number, inputPath: string, displayName?: string | null) => {
  const trimmed = titlePrefix.trim();
  if (!trimmed) return buildDefaultTitle(inputPath, displayName);
  if (targetCount === 1) return trimmed;
  const pathName = fileNameOf(inputPath);
  const suffix = String(displayName || '').trim() || (pathName === '-' ? inputPath : pathName);
  return`${trimmed} · ${suffix}`;
};

const resolvePipelineMode = (capabilities: IpcAuditCapability | null, workspace: IpcAuditWorkspaceSummary | null) => {
  void capabilities;
  void workspace;
  return 'custom_graph' as PipelineMode;
};

const resolveExecutorMode = (capabilities: IpcAuditCapability | null) => {
  const supported = capabilities?.executor_modes || [];
  const preferred = capabilities?.default_executor_mode && capabilities.default_executor_mode !== 'mock'
    ? capabilities.default_executor_mode
    : supported.includes('agentflow_cli')
      ? 'agentflow_cli'
      : supported.includes('opencode_cli')
        ? 'opencode_cli'
        : supported.includes('codex_cli')
          ? 'codex_cli'
          : supported.find((item) => item !== 'mock') || supported[0] || 'opencode_cli';
  return (supported.includes(preferred) ? preferred : (supported[0] || 'codex_cli')) as ExecutorMode;
};

const modelHintForExecutor = (mode?: string | null, providerModel?: string | null) => {
  if (mode === 'agentflow_cli') {
    return providerModel
      ?`可留空，AgentFlow 节点会优先复用当前 Provider 的模型 ${providerModel}；图内如有更细粒度配置，以图定义为准。`
      : '可留空；若未选择 Provider，chimera 不会注入任何 provider/model，节点将直接使用 CLI 自带默认模型或图内配置。';
  }
  if (mode === 'opencode_cli') {
    return providerModel
      ?`可留空，自动使用当前 Provider 的模型 ${providerModel}；手填时建议使用 provider/model 形式。`
      : '可留空；若未选择 Provider，则不注入配置，直接使用 OpenCode 自带默认模型。';
  }
  if (mode === 'codex_cli') {
    return providerModel
      ?`可留空，自动使用当前 Provider 的模型 ${providerModel}。`
      : '可留空；若未选择 Provider，则不注入配置，直接使用 CLI 默认模型。';
  }
  return 'Mock 执行器不会真正调用模型，填写后仅记录到任务配置。';
};

const panelClassName = 'rounded-xl border border-theme-border bg-theme-surface p-5 ';

const MetricCard: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <StatisticCard label={label} value={value} hint={sub} />
);

const TaskGraphCanvasNode: React.FC<NodeProps<TaskGraphCanvasNodeType>> = ({ data }) => (
 <div className={`w-[240px] rounded-2xl border px-4 py-3 transition ${graphNodeCardTone(data.status, data.active)}`}>
 <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-theme-border !bg-slate-400" />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-theme-text-primary">{data.label}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-theme-text-muted">{data.agent || 'agentflow node'}</div>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${graphNodeBadgeTone(data.status)}`}>
        {formatStageStatus(data.status)}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
      {data.model ? <span className="rounded-full border border-theme-border bg-theme-elevated px-2 py-1 normal-case tracking-normal text-theme-text-muted">{data.model}</span> : null}
      <span>{data.reportCount} outputs</span>
      {data.hasEventsJsonl ? <span>jsonl</span> : null}
      {data.hasLastMessage ? <span>message</span> : null}
    </div>
 <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-theme-border !bg-slate-400" />
  </div>
);

const taskGraphNodeTypes = { taskGraphNode: TaskGraphCanvasNode };

const SessionTextViewer: React.FC<{ title: string; content?: string | null; truncated?: boolean }> = ({ title, content, truncated }) => (
  <div className="h-full overflow-auto rounded-2xl border border-theme-border bg-theme-surface p-4 text-theme-text-primary">
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-theme-border pb-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Session File</div>
        <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{title}</div>
      </div>
      {truncated ? <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">已截断</span> : null}
    </div>
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-theme-text-primary">{content || ''}</pre>
  </div>
);

const formatSessionEventTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN');
};

const SessionMarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-6">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-400 underline">{children}</a>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold text-theme-text-primary last:mb-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold text-theme-text-primary last:mb-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 text-base font-semibold text-theme-text-primary last:mb-0">{children}</h3>,
        blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 border-theme-border bg-theme-elevated px-4 py-2 italic text-theme-text-secondary last:mb-0">{children}</blockquote>,
        table: ({ children }) => <div className="mb-3 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-theme-elevated">{children}</thead>,
        th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-semibold text-theme-text-primary">{children}</th>,
        td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top">{children}</td>,
        code: ({ children, className }) => className
          ? <code className="block overflow-x-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 font-mono text-xs text-theme-text-primary">{children}</code>
          : <code className="rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">{children}</code>,
        pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

const SessionThinkingBlock: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-50/80 px-4 py-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-bold text-violet-400">
        {open ? '▼ hide' : '▶ thinking'}
      </button>
      {open ? <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 text-violet-950">{text}</pre> : null}
    </div>
  );
};

const SessionToolResultBlock: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const text = (event.parts || [])
    .filter((part) => part.type === 'text' || part.type === 'toolResult')
    .map((part) => String(part.text || ''))
    .join('\n');
  return (
    <div className={`rounded-2xl border px-4 py-3 ${event.isError ? 'border-rose-500/20 bg-rose-500/15' : 'border-emerald-500/20 bg-emerald-500/15'}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-theme-text-secondary">
        <Wrench size={12} />
        {event.toolName || 'Tool Result'}
      </div>
      {text ? <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-theme-text-secondary">{text}</pre> : null}
    </div>
  );
};

const SessionToolCallBlock: React.FC<{ part: Record<string, any> }> = ({ part }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-theme-text-secondary">
        <Wrench size={12} />
        <span>{part.name || 'tool'}</span>
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 text-xs font-semibold text-theme-text-muted">
        {open ? '▼ hide args' : '▶ show args'}
      </button>
      {open ? (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-secondary">
          {JSON.stringify(part.arguments || {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};

const sessionEventPresentation = (event: AppSaSessionEvent) => {
  if (event.type === 'stderr') {
    return {
      icon: <SquareTerminal size={13} />,
      label: 'stderr',
      className: 'border-amber-500/20 bg-amber-500/15 text-amber-300',
      textClassName: 'text-amber-300',
    };
  }
  if (event.type === 'error') {
    return {
      icon: <XCircle size={13} />,
      label: 'error',
      className: 'border-rose-500/20 bg-rose-500/15 text-rose-300',
      textClassName: 'text-rose-300',
    };
  }
  if (event.type === 'completed') {
    return {
      icon: <CheckCircle2 size={13} />,
      label: 'completed',
      className: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-300',
      textClassName: 'text-emerald-300',
    };
  }
  if (event.type === 'permission') {
    return {
      icon: <AlertTriangle size={13} />,
      label: 'permission',
      className: 'border-violet-500/20 bg-violet-500/15 text-violet-300',
      textClassName: 'text-violet-300',
    };
  }
  if (event.type === 'cancelled' || event.type === 'timed_out') {
    return {
      icon: <AlertTriangle size={13} />,
      label: event.type,
      className: 'border-theme-border bg-theme-elevated text-theme-text-primary',
      textClassName: 'text-theme-text-primary',
    };
  }
  return {
    icon: <Info size={13} />,
    label: event.type.replace(/_/g, ' '),
    className: 'border-theme-border bg-theme-elevated text-theme-text-primary',
    textClassName: 'text-theme-text-primary',
  };
};

const SessionStatusEvent: React.FC<{ event: AppSaSessionEvent }> = ({ event }) => {
  const time = formatSessionEventTime(event.timestamp || event.display_timestamp);
  const presentation = sessionEventPresentation(event);
  return (
    <div className={`rounded-2xl border px-4 py-3 ${presentation.className}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {presentation.icon}
        {presentation.label}
        {time ? <span className="font-medium normal-case tracking-normal opacity-70">{time}</span> : null}
      </div>
      {event.summary ? (
        <pre className={`mt-3 whitespace-pre-wrap break-all text-xs leading-6 ${presentation.textClassName}`}>
          {event.summary}
        </pre>
      ) : null}
    </div>
  );
};

const SessionMessage: React.FC<{ event: AppSaSessionEvent & { _toolResults?: AppSaSessionEvent[] } }> = ({ event }) => {
  const time = formatSessionEventTime(event.timestamp || event.display_timestamp);
  const parts = event.parts || [];

  if (event.role === 'user') {
    const text = parts.filter((part) => part.type === 'text').map((part) => String(part.text || '')).join('\n');
    return (
      <div className="rounded-xl bg-theme-elevated px-5 py-4 text-slate-100">
        {time ? <div className="mb-2 text-[11px] text-theme-text-muted">{time}</div> : null}
        <div className="text-sm leading-7"><SessionMarkdownMessage content={text} /></div>
      </div>
    );
  }

  if (event.role === 'assistant') {
    return (
 <div className="space-y-3 rounded-xl border border-theme-border bg-theme-surface px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
          <Bot size={13} />
          Assistant
          {time ? <span className="font-medium tracking-normal text-theme-text-muted">{time}</span> : null}
        </div>
        {parts.map((part, index) => {
          if (part.type === 'thinking') return <SessionThinkingBlock key={`thinking-${index}`} text={String(part.text || '')} />;
          if (part.type === 'text') return <div key={`text-${index}`} className="text-sm leading-7 text-theme-text-secondary"><SessionMarkdownMessage content={String(part.text || '')} /></div>;
          if (part.type === 'toolCall') return <SessionToolCallBlock key={`tool-${index}`} part={part} />;
          return null;
        })}
        {(event._toolResults || []).map((toolResult, index) => <SessionToolResultBlock key={`tool-result-${index}-${toolResult.line || index}`} event={toolResult} />)}
      </div>
    );
  }

  if (event.role === 'toolResult') {
    return <SessionToolResultBlock event={event} />;
  }

  return <div className="rounded-2xl bg-theme-elevated px-4 py-3 text-xs text-theme-text-muted">{event.role || event.type}</div>;
};

const TaskSessionViewer: React.FC<{
  sessionMeta?: AppSaSessionMeta | null;
  sessionHeader?: Record<string, any> | null;
  events: AppSaSessionEvent[];
  loading?: boolean;
  live?: boolean;
  error?: string | null;
}> = ({ sessionMeta, sessionHeader, events, loading = false, live = false, error = null }) => {
  const merged = useMemo(() => mergeAgentSessionToolResults(events), [events]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [merged.length]);

  const userCount = events.filter((event) => event.type === 'message' && event.role === 'user').length;
  const assistantCount = events.filter((event) => event.type === 'message' && event.role === 'assistant').length;
  const toolResultCount = events.filter((event) => event.type === 'message' && event.role === 'toolResult').length;
  const toolCallCount = events.reduce((count, event) => count + ((event.parts || []).filter((part) => part.type === 'toolCall').length), 0);

  if (loading) {
    return (
 <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-sm text-theme-text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" />
        加载会话中...
      </div>
    );
  }

  if (error) {
    return (
 <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-6 py-10 text-sm text-rose-400">
        {error}
      </div>
    );
  }

  if (!sessionMeta) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-theme-border bg-theme-surface text-sm text-theme-text-muted">
        请选择左侧会话
      </div>
    );
  }

  return (
 <div className="rounded-xl border border-theme-border bg-slate-50/70">
      <div className="border-b border-theme-border px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-theme-text-primary">{sessionMeta.display_name}</h2>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${live ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary'}`}>
            {live ? '实时连接中' : '历史会话'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">Session ID</div>
            <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{sessionHeader?.id || sessionMeta.session_id}</div>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">Started</div>
            <div className="mt-1 break-all text-xs text-theme-text-secondary">{sessionHeader?.timestamp || '-'}</div>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">Working Dir</div>
            <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{sessionHeader?.cwd || '-'}</div>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">Events</div>
            <div className="mt-1 text-xs text-theme-text-secondary">{events.length}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold text-theme-text-muted">
          <span>User {userCount}</span>
          <span>Assistant {assistantCount}</span>
          <span>Tool Calls {toolCallCount}</span>
          <span>Results {toolResultCount}</span>
        </div>
      </div>

      <div ref={scrollerRef} className="max-h-[calc(100vh-24rem)] overflow-auto px-6 py-5">
        <div className="space-y-4">
          {merged.length > 0 ? merged.map((event) => {
            if (event.type === 'model_change') {
              return <div key={`model-${event.line}`} className="text-xs text-theme-text-muted">Model: <span className="font-semibold text-cyan-400">{event.provider || ''}/{event.modelId || ''}</span></div>;
            }
            if (event.type === 'thinking_level_change') {
              return <div key={`thinking-level-${event.line}`} className="text-xs text-theme-text-muted">Thinking: <span className="font-semibold text-violet-400">{event.thinkingLevel || ''}</span></div>;
            }
            if (event.type === 'message') {
              return <SessionMessage key={`message-${event.line}`} event={event} />;
            }
            if (['stderr', 'completed', 'cancelled', 'timed_out', 'permission', 'event', 'item_completed', 'error'].includes(event.type)) {
              return <SessionStatusEvent key={`status-${event.line}-${event.type}`} event={event} />;
            }
            return <div key={`raw-${event.line}`} className="rounded-2xl bg-theme-elevated px-4 py-3 text-xs text-theme-text-muted">[Line {event.line}] {event.summary || event.type}</div>;
          }) : (
            <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
              Empty session
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ArtifactPreviewBody: React.FC<{ artifact: IpcAuditArtifact; content: IpcAuditArtifactContent }> = ({ artifact, content }) => {
  const formatted = formatPreviewContent(artifact, content);
  if (isMarkdownArtifact(artifact, content.content_type)) {
    return (
      <div className="markdown-body max-w-none break-words rounded-2xl bg-theme-surface px-6 py-5 text-sm leading-7 text-theme-text-secondary">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {formatted || ' '}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-theme-border bg-theme-surface px-5 py-4 font-mono text-[12px] leading-6 text-theme-text-primary">
      {formatted || ' '}
    </pre>
  );
};

export const MobileSecurityIpcVulnPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.ipcAudit;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const graphDefinitionCardRef = useRef<HTMLDivElement | null>(null);
  const inlineJsonInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pythonBuilderEntryInputRef = useRef<HTMLInputElement | null>(null);
  const pythonBuilderCodeInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<IpcAuditCapability | null>(null);
  const [readyState, setReadyState] = useState<IpcAuditReadyState | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<IpcAuditRuntimeConfig | null>(null);
  const [maxParallelDraft, setMaxParallelDraft] = useState('1');
  const [savingRuntimeConfig, setSavingRuntimeConfig] = useState(false);
  const [workspaces, setWorkspaces] = useState<IpcAuditWorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');

  const [presetProjects, setPresetProjects] = useState<IpcAuditPresetProject[]>([]);
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetKeyword, setPresetKeyword] = useState('');
  const [refreshJob, setRefreshJob] = useState<IpcAuditCatalogRefreshJob | null>(null);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [providerOptions, setProviderOptions] = useState<IpcAuditProviderSummary[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [selectedProviderKey, setSelectedProviderKey] = useState('');

  const [selectedProjectPaths, setSelectedProjectPaths] = useState<string[]>([]);
  const [customProjectPaths, setCustomProjectPaths] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState('');
  const [title, setTitle] = useState('');
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('custom_graph');
  const [executorMode, setExecutorMode] = useState<ExecutorMode>('agentflow_cli');
  const [modelName, setModelName] = useState('');
  const [graphSourceType, setGraphSourceType] = useState<GraphSourceType>('inline_json');
  const [builderSourceMode, setBuilderSourceMode] = useState<BuilderSourceMode>('code');
  const [inlineJsonText, setInlineJsonText] = useState(defaultCustomGraphContent);
  const [pythonBuilderEntry, setPythonBuilderEntry] = useState('');
  const [pythonBuilderCode, setPythonBuilderCode] = useState(defaultPythonBuilderCode);
  const [reportOutputDrafts, setReportOutputDrafts] = useState<ReportOutputDraft[]>(
    buildDefaultReportOutputs('custom_graph', extractNodeIdsFromInlineGraphText(defaultCustomGraphContent)),
  );
  const [graphTemplates, setGraphTemplates] = useState<GraphTemplateRecord[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [customGraphExpanded, setCustomGraphExpanded] = useState(false);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<IpcAuditTaskSummary[]>([]);
  const [taskKeyword, setTaskKeyword] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskStageFilter, setTaskStageFilter] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<IpcAuditTaskDetail | null>(null);
  const [attempts, setAttempts] = useState<IpcAuditAttemptDetail[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState('');

  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [stageSessions, setStageSessions] = useState<Record<string, IpcAuditStageSessionSummary[]>>({});
  const [stageLogs, setStageLogs] = useState<Record<string, IpcAuditStageLog | null>>({});
  const [events, setEvents] = useState<IpcAuditEvent[]>([]);
  const [artifacts, setArtifacts] = useState<IpcAuditArtifact[]>([]);
  const [graphManifest, setGraphManifest] = useState<TaskGraphManifest | null>(null);
  const [graphManifestLoading, setGraphManifestLoading] = useState(false);
  const [graphManifestError, setGraphManifestError] = useState<string | null>(null);
  const [previewArtifact, setPreviewArtifact] = useState<IpcAuditArtifact | null>(null);
  const [previewArtifactContent, setPreviewArtifactContent] = useState<IpcAuditArtifactContent | null>(null);
  const [previewArtifactLoading, setPreviewArtifactLoading] = useState(false);
  const [previewArtifactError, setPreviewArtifactError] = useState<string | null>(null);
  const [auditedResultSummary, setAuditedResultSummary] = useState<AuditedResultSummary | null>(null);
  const [auditedResultLoading, setAuditedResultLoading] = useState(false);
  const [auditedResultError, setAuditedResultError] = useState<string | null>(null);
  const [taskAuditedResultSummaries, setTaskAuditedResultSummaries] = useState<Record<string, AuditedResultSummary | null>>({});
  const [taskAuditedResultLoadingIds, setTaskAuditedResultLoadingIds] = useState<Record<string, boolean>>({});
  const [taskRuntimeSummaries, setTaskRuntimeSummaries] = useState<Record<string, TaskRuntimeSummary | null>>({});
  const [taskRuntimeLoadingIds, setTaskRuntimeLoadingIds] = useState<Record<string, boolean>>({});

  const [selectedStage, setSelectedStage] = useState<StageName>('');
  const [selectedSessionPath, setSelectedSessionPath] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionFile, setSessionFile] = useState<IpcAuditStageSessionFile | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, IpcAuditStageSessionFile>>({});
  const [sessionEvents, setSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [sessionHeader, setSessionHeader] = useState<Record<string, any> | null>(null);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionStreamRef = useRef<EventSource | null>(null);
  const sessionCursorRef = useRef(0);
  const sessionLineRef = useRef(0);
  const graphManifestRef = useRef<TaskGraphManifest | null>(null);
  const graphManifestScopeRef = useRef('');

  const [creating, setCreating] = useState(false);
  const [validatingGraph, setValidatingGraph] = useState(false);
  const [actingTask, setActingTask] = useState(false);
  const [batchActingTasks, setBatchActingTasks] = useState(false);

  const selectedWorkspace = workspaces.find((item) => item.workspace_id === workspaceId) || null;
  const providerOptionMap = new Map<string, IpcAuditProviderSummary>();
  providerOptions.forEach((item) => {
    providerOptionMap.set(item.provider_key, item);
  });
  const selectedProvider = providerOptionMap.get(selectedProviderKey) || null;
  const providerFallbackModel = selectedProvider?.model || '';
  const applyProviderList = (providerResponse: IpcAuditProviderList) => {
    const items = Array.isArray(providerResponse.items) ? providerResponse.items : [];
    setProviderOptions(items);
    setSelectedProviderKey((current) => (
      current && items.some((item) => item.provider_key === current && item.enabled !== false)
        ? current
        : ''
    ));
  };
  const projectInputItemMap = new Map<string, ProjectInputItem>();
  presetProjects.forEach((item) => {
    const path = normalizeProjectPathInput(item.project_path);
    if (!path) return;
    projectInputItemMap.set(path, {
      path,
      displayName: item.display_name || fileNameOf(path),
      kind: 'preset_project',
      source: 'preset',
      preset: item,
    });
  });
  customProjectPaths.forEach((itemPath) => {
    const path = normalizeProjectPathInput(itemPath);
    if (!path || projectInputItemMap.has(path)) return;
    projectInputItemMap.set(path, {
      path,
      displayName: fileNameOf(path) === '-' ? path : fileNameOf(path),
      kind: 'custom_project',
      source: 'custom',
    });
  });
  const projectInputItems = Array.from(projectInputItemMap.values());
  const selectedProjectItems = selectedProjectPaths
    .map((path) => projectInputItemMap.get(path))
    .filter((item): item is ProjectInputItem => !!item);
  const currentAttempt = attempts.find((item) => item.attempt_id === selectedAttemptId) || selectedTask?.latest_attempt || null;
  const currentStageNames = deriveStageNamesFromAttempt(currentAttempt);
  const currentExecutorMode = String(currentAttempt?.effective_config?.executor_mode || currentAttempt?.effective_config?.execution_mode || '');
  const currentModelName = String(currentAttempt?.effective_config?.model || '').trim();
  const currentProviderKeys = normalizeProviderKeys(currentAttempt?.effective_config?.provider_keys);
  const currentProviderSnapshotMap = buildProviderSnapshotMap(currentAttempt?.effective_config?.provider_snapshots);
  const currentReportOutputs = useMemo(() => [...(currentAttempt?.report_outputs || [])].sort((left, right) => (
    (left.order ?? 0) - (right.order ?? 0)
    || left.title.localeCompare(right.title)
  )), [currentAttempt?.report_outputs]);
  const visibleArtifacts = artifacts.filter((item) => item.artifact_kind !== 'session_file');
  const currentGraphManifestArtifact = visibleArtifacts.find((item) => item.artifact_kind === 'graph_manifest') || null;
  const auditedResultArtifact = findAuditedResultArtifact(visibleArtifacts);
  const currentGraphScopeKey = showTaskDetail && selectedTask?.pipeline_mode === 'custom_graph' && selectedTaskId && selectedAttemptId
    ?`${selectedTaskId}:${selectedAttemptId}`
    : '';
  const taskGraphNodeViews = selectedTask?.pipeline_mode === 'custom_graph'
    ? buildTaskGraphNodeViews(currentAttempt, graphManifest, currentReportOutputs, stageSessions)
    : [];
  const selectedGraphNode = taskGraphNodeViews.find((item) => item.id === selectedStage) || taskGraphNodeViews[0] || null;
  const taskGraphFlowSignature = JSON.stringify({
    selectedNodeId: selectedGraphNode?.id || '',
    nodes: taskGraphNodeViews.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      agent: item.agent,
      model: item.model,
      dependsOn: item.dependsOn,
      reportCount: item.reports.length,
      hasEventsJsonl: item.hasEventsJsonl,
      hasLastMessage: item.hasLastMessage,
    })),
  });
  const taskGraphFlow = useMemo(
    () => buildTaskGraphFlow(taskGraphNodeViews, selectedGraphNode?.id || ''),
    [taskGraphFlowSignature],
  );
  const currentStageRun = currentAttempt?.stage_runs.find((item) => item.stage_name === selectedStage) || null;
  const selectedStageSessions = stageSessions[selectedStage] || [];
  const selectedStageLog = stageLogs[selectedStage];
  const selectedSessionSummary = selectedStageSessions.find((item) => item.path === selectedSessionPath) || null;
  const isSelectedTaskActive = ACTIVE_TASK_STATUSES.has(String(selectedTask?.status || '').toLowerCase())
    || ACTIVE_TASK_STATUSES.has(String(currentAttempt?.status || '').toLowerCase())
    || ACTIVE_TASK_STATUSES.has(String(currentStageRun?.status || '').toLowerCase());
  const selectedSessionMeta: AppSaSessionMeta | null = selectedSessionSummary ? {
    session_id: selectedSessionSummary.path,
    session_name: selectedSessionSummary.display_name || fileNameOf(selectedSessionSummary.path),
    relative_path: selectedSessionSummary.path,
    stage_group: formatStageLabel(selectedStage),
    role_name: currentExecutorMode || selectedStage,
    size: selectedSessionSummary.size || sessionFile?.content?.length || 0,
    mtime: selectedSessionSummary.created_at ? Date.parse(selectedSessionSummary.created_at) / 1000 : 0,
    event_count: sessionEvents.length,
    line_count: sessionFile?.content?.split(/\r?\n/).filter(Boolean).length || sessionEvents.length,
    is_active: isSelectedTaskActive,
    display_name:`${formatStageLabel(selectedStage)} · ${selectedSessionSummary.display_name || fileNameOf(selectedSessionSummary.path)}`,
    warnings: sessionWarnings,
  } : null;
  const effectiveTaskCount = tasks.length;
  const activeTaskCount = tasks.filter((item) => isActiveTaskStatus(item.status)).length;
  const filteredProjectInputItems = projectInputItems.filter((item) => {
    const keyword = toSearchText(presetKeyword);
    if (!keyword) return true;
    return`${toSearchText(item.displayName)} ${toSearchText(item.path)} ${toSearchText(item.preset?.project_key)} ${toSearchText(item.source)}`.includes(keyword);
  });
  const filteredTasks = tasks.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    const stage = String(item.current_stage || '').toLowerCase();
    if (taskStatusFilter !== 'all' && status !== taskStatusFilter) return false;
    if (taskStageFilter === 'none' && stage) return false;
    if (taskStageFilter !== 'all' && taskStageFilter !== 'none' && stage !== taskStageFilter) return false;
    const keyword = toSearchText(taskKeyword);
    if (!keyword) return true;
    const path = item.input_ref.project_path || item.input_ref.report_path || '';
    const runtimeSummary = taskRuntimeSummaries[item.task_id];
    const providerSearchText = runtimeSummary
      ? runtimeSummary.providerKeys.concat(runtimeSummary.providerSnapshots.map((snapshot) => String(snapshot.display_name || snapshot.provider_key || ''))).join(' ')
      : '';
    return`${toSearchText(item.title)} ${toSearchText(path)} ${toSearchText(item.task_id)} ${toSearchText(formatTaskStatus(item.status))} ${toSearchText(runtimeSummary?.executorMode)} ${toSearchText(runtimeSummary?.model)} ${toSearchText(runtimeSummary?.taskModel)} ${toSearchText(providerSearchText)}`.includes(keyword);
  });
  const taskStageOptions = normalizeStageNames(tasks.map((item) => item.current_stage));
  const supportedPipelineModes = ['custom_graph'] as PipelineMode[];
  const supportsAgentflowExecutor = (capabilities?.executor_modes || []).includes('agentflow_cli');
  const inlineGraphNodeIds = graphSourceType === 'inline_json'
    ? extractNodeIdsFromInlineGraphText(inlineJsonText)
    : [];
  const customGraphNodeIds = normalizeStageNames([
    ...inlineGraphNodeIds,
    ...reportOutputDrafts.map((item) => item.nodeId),
  ]);
  const customGraphNodeKey = customGraphNodeIds.join('|');
  const currentStageKey = currentStageNames.join('|');
  const supportedPipelineModeKey = supportedPipelineModes.join('|');
  const focusStageArtifacts = (stageName: string, preferredFileName?: 'trace.jsonl' | 'events.jsonl' | 'last-message.md' | 'prompt.txt') => {
    setSelectedStage(stageName);
    const items = stageSessions[stageName] || [];
    const next = preferredFileName
      ? items.find((item) => fileNameOf(item.path) === preferredFileName) || preferredSession(items)
      : preferredSession(items);
    if (next) setSelectedSessionPath(next.path);
  };
  const selectedTaskIdSet = new Set(selectedTaskIds);
  const selectedTaskSummaries = selectedTaskIds
    .map((taskId) => tasks.find((item) => item.task_id === taskId))
    .filter((item): item is IpcAuditTaskSummary => !!item);
  const selectedFilteredTaskCount = filteredTasks.filter((item) => selectedTaskIdSet.has(item.task_id)).length;
  const allFilteredTasksSelected = filteredTasks.length > 0 && selectedFilteredTaskCount === filteredTasks.length;
  const actionableSelectedTasks = selectedTaskSummaries.filter((item) => !isActiveTaskStatus(item.status));
  const skippedActiveSelectedTaskCount = selectedTaskSummaries.length - actionableSelectedTasks.length;
  const cancellableSelectedTasks = selectedTaskSummaries.filter((item) => isCancellableTaskStatus(item.status));
  const skippedNonCancellableSelectedTaskCount = selectedTaskSummaries.length - cancellableSelectedTasks.length;
  const serviceReady = Boolean(readyState?.ready);
  const baseDataLoading = bootstrapping || readyState === null;
  const workspaceScopedLoading = Boolean(readyState?.ready) && !workspaceId;
  const taskQueueLoading = tasksLoading || baseDataLoading || workspaceScopedLoading;
  const projectListLoading = presetLoading || baseDataLoading || workspaceScopedLoading;
  const providerPanelLoading = providersLoading || baseDataLoading || (serviceReady && !providerLoadError && providerOptions.length === 0);

  const closeSessionStream = () => {
    if (sessionStreamRef.current) {
      sessionStreamRef.current.close();
      sessionStreamRef.current = null;
    }
    setSessionLive(false);
  };

  useEffect(() => {
    graphManifestRef.current = graphManifest;
  }, [graphManifest]);

  useEffect(() => {
    if (!currentGraphScopeKey) {
      graphManifestRef.current = null;
      graphManifestScopeRef.current = '';
      return;
    }
    if (graphManifestScopeRef.current && graphManifestScopeRef.current !== currentGraphScopeKey) {
      graphManifestRef.current = null;
      setGraphManifest(null);
      setGraphManifestError(null);
      setGraphManifestLoading(false);
    }
    graphManifestScopeRef.current = currentGraphScopeKey;
  }, [currentGraphScopeKey]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setBootstrapping(true);
      setOverviewError(null);
      try {
        let ready: IpcAuditReadyState;
        try {
          ready = normalizeReadyState(await executionApi.getReady());
        } catch (error) {
          if (cancelled) return;
          setReadyState({ status: 'error', ready: false, checks: {} });
          setCapabilities(null);
          setRuntimeConfig(null);
          setWorkspaces([]);
          setWorkspaceId('');
          setPresetProjects([]);
          setProviderOptions([]);
          setProviderLoadError(null);
          setSelectedProviderKey('');
          setTasks([]);
          setPresetLoading(false);
          setTasksLoading(false);
          setOverviewError(`IPC 审计服务 ready 检查失败：${getErrorMessage(error, '无法连接后端服务')}`);
          return;
        }
        if (cancelled) return;
        setReadyState(ready);
        if (!ready.ready) {
          setCapabilities(null);
          setRuntimeConfig(null);
          setWorkspaces([]);
          setWorkspaceId('');
          setPresetProjects([]);
          setProviderOptions([]);
          setProviderLoadError(null);
          setSelectedProviderKey('');
          setTasks([]);
          setPresetLoading(false);
          setTasksLoading(false);
          setOverviewError(`IPC 审计服务未就绪：${formatReadyFailure(ready.checks)}`);
          return;
        }
        const [capability, workspaceItems, runtime] = await Promise.all([
          executionApi.getCapabilities(),
          executionApi.listWorkspaces(),
          executionApi.getRuntimeConfig(),
        ]);
        if (cancelled) return;
        setCapabilities(capability);
        setRuntimeConfig(runtime);
        setMaxParallelDraft(String(runtime.max_parallel_tasks || capability.max_parallel_tasks || 1));
        setWorkspaces(workspaceItems);
        setWorkspaceId((current) => {
          if (current && workspaceItems.some((item) => item.workspace_id === current)) return current;
          return capability.default_workspace_id
            || workspaceItems.find((item) => item.is_default)?.workspace_id
            || workspaceItems[0]?.workspace_id
            || '';
        });
      } catch (error: any) {
        if (cancelled) return;
        setOverviewError(`IPC 审计服务初始化失败：${getErrorMessage(error, '未知错误')}`);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!readyState?.ready) return;
    let cancelled = false;
    const loadProviders = async () => {
      setProvidersLoading(true);
      setProviderLoadError(null);
      try {
        const providerResponse = await executionApi.listProviders();
        if (cancelled) return;
        applyProviderList(providerResponse);
      } catch (error) {
        if (cancelled) return;
        setProviderOptions([]);
        setSelectedProviderKey('');
        setProviderLoadError(getErrorMessage(error, '加载 Provider 列表失败'));
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [readyState?.ready]);

  useEffect(() => {
    const supported = capabilities?.executor_modes || [];
    if (!supported.length) return;
    setExecutorMode((current) => (
      supported.includes(current)
        ? current
        : resolveExecutorMode(capabilities)
    ));
  }, [capabilities]);

  useEffect(() => {
    if (providerOptions.length === 0) {
      setSelectedProviderKey('');
      return;
    }
    const availableKeys = new Set(providerOptions.filter((item) => item.enabled !== false).map((item) => item.provider_key));
    setSelectedProviderKey((current) => (current && availableKeys.has(current) ? current : ''));
  }, [providerOptions]);

  useEffect(() => {
    setSelectedProjectPaths([]);
    setCustomProjectPaths([]);
    setCustomPath('');
    setPresetKeyword('');
    setTaskKeyword('');
    setTaskStatusFilter('all');
    setTaskStageFilter('all');
    setSelectedTaskIds([]);
    setTaskAuditedResultSummaries({});
    setTaskAuditedResultLoadingIds({});
    setRefreshJob(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const loadWorkspaceScopedData = async () => {
      setPresetLoading(true);
      setTasksLoading(true);
      setOverviewError(null);
      try {
        const [presetResponse, taskResponse] = await Promise.all([
          executionApi.listPresetProjects(workspaceId, { page: 1, perPage: 200 }),
          executionApi.listTasks({ workspaceId, projectId: projectId || undefined, page: 1, perPage: 100 }),
        ]);
        if (cancelled) return;
        setPresetProjects(presetResponse.items || []);
        setTasks(taskResponse.items || []);
      } catch (error: any) {
        if (cancelled) return;
        setOverviewError(error?.message || '加载工作区数据失败');
      } finally {
        if (!cancelled) {
          setPresetLoading(false);
          setTasksLoading(false);
        }
      }
    };
    void loadWorkspaceScopedData();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId) {
      setSelectedTask(null);
      setAttempts([]);
      setSelectedAttemptId('');
      setDetailError(null);
      return;
    }
    let cancelled = false;
    const loadTaskBase = async () => {
      setTaskDetailLoading(true);
      setDetailError(null);
      try {
        const [taskDetail, attemptItems] = await Promise.all([
          executionApi.getTask(selectedTaskId),
          executionApi.listAttempts(selectedTaskId),
        ]);
        if (cancelled) return;
        setSelectedTask(taskDetail);
        setTaskRuntimeSummaries((current) => ({
          ...current,
          [selectedTaskId]: buildTaskRuntimeSummary(taskDetail.latest_attempt?.effective_config),
        }));
        setAttempts(attemptItems);
        setSelectedAttemptId((current) => {
          if (current && attemptItems.some((item) => item.attempt_id === current)) return current;
          return taskDetail.latest_attempt?.attempt_id || attemptItems[0]?.attempt_id || '';
        });
      } catch (error: any) {
        if (cancelled) return;
        setSelectedTask(null);
        setAttempts([]);
        setSelectedAttemptId('');
        setDetailError(error?.message || '加载任务详情失败');
      } finally {
        if (!cancelled) setTaskDetailLoading(false);
      }
    };
    void loadTaskBase();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId || !selectedAttemptId) {
      setStageSessions({});
      setStageLogs({});
      setEvents([]);
      setArtifacts([]);
      setGraphManifest(null);
      setGraphManifestError(null);
      setGraphManifestLoading(false);
      setAuditedResultSummary(null);
      setAuditedResultError(null);
      setAuditedResultLoading(false);
      setSessionFile(null);
      setSessionEvents([]);
      setSessionHeader(null);
      setSessionWarnings([]);
      setSessionError(null);
      sessionCursorRef.current = 0;
      sessionLineRef.current = 0;
      setSelectedSessionPath('');
      closeSessionStream();
      return;
    }
    let cancelled = false;
    const loadAttemptResources = async () => {
      setResourcesLoading(true);
      setDetailError(null);
      const selectedAttempt = attempts.find((item) => item.attempt_id === selectedAttemptId) || null;
      const stageNames = deriveStageNamesFromAttempt(selectedAttempt);
      if (stageNames.length === 0) {
        setStageSessions({});
        setStageLogs({});
        setSelectedStage('');
        setSelectedSessionPath('');
        setResourcesLoading(false);
        return;
      }
      const [eventsResult, artifactsResult, sessionResults, logResults] = await Promise.all([
        executionApi.listEvents(selectedTaskId, { attemptId: selectedAttemptId, limit: 200 }).then((value) => ({ ok: true as const, value })).catch((reason) => ({ ok: false as const, reason })),
        executionApi.listArtifacts(selectedTaskId, selectedAttemptId).then((value) => ({ ok: true as const, value })).catch((reason) => ({ ok: false as const, reason })),
        Promise.allSettled(stageNames.map(async (stageName) => ({ stageName, value: await executionApi.listStageSessions(selectedTaskId, selectedAttemptId, stageName) }))),
        Promise.allSettled(stageNames.map(async (stageName) => ({ stageName, value: await executionApi.getStageLog(selectedTaskId, selectedAttemptId, stageName, { lines: 240 }) }))),
      ]);
      if (cancelled) return;

      if (eventsResult.ok) setEvents(eventsResult.value.items || []);
      else setEvents([]);

      if (artifactsResult.ok) setArtifacts(artifactsResult.value.items || []);
      else setArtifacts([]);

      const nextSessions = emptyStageSessionMap(stageNames);
      const nextLogs = emptyStageLogMap(stageNames);
      const errors: string[] = [];

      sessionResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          nextSessions[result.value.stageName] = result.value.value || [];
        } else {
          errors.push(getErrorMessage(result.reason, '加载阶段会话失败'));
        }
      });
      logResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          nextLogs[result.value.stageName] = result.value.value || null;
        } else {
          errors.push(getErrorMessage(result.reason, '加载阶段日志失败'));
        }
      });
      if (!eventsResult.ok && 'reason' in eventsResult) errors.push(getErrorMessage(eventsResult.reason, '加载事件流失败'));
      if (!artifactsResult.ok && 'reason' in artifactsResult) errors.push(getErrorMessage(artifactsResult.reason, '加载产物失败'));

      setStageSessions(nextSessions);
      setStageLogs(nextLogs);

      const nextStage = defaultStage(stageNames, nextSessions, selectedAttempt);
      setSelectedStage((current) => {
        if (current && stageNames.includes(current) && ((nextSessions[current] || []).length > 0 || nextLogs[current])) return current;
        return nextStage;
      });
      setSelectedSessionPath((current) => {
        const currentExists = stageNames.some((stageName) => (nextSessions[stageName] || []).some((item) => item.path === current));
        if (currentExists) return current;
        return preferredSession(nextSessions[nextStage] || [])?.path || '';
      });
      setDetailError(errors[0] || null);
      setResourcesLoading(false);
    };
    void loadAttemptResources();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, attempts]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId || !selectedAttemptId || selectedTask?.pipeline_mode !== 'custom_graph') {
      graphManifestRef.current = null;
      graphManifestScopeRef.current = '';
      setGraphManifest(null);
      setGraphManifestError(null);
      setGraphManifestLoading(false);
      return;
    }
    if (!currentGraphManifestArtifact?.artifact_id) {
      setGraphManifestLoading(false);
      if (!graphManifestRef.current && isCompletedTaskStatus(selectedTask?.status)) {
        setGraphManifestError('未找到 graph-manifest.json');
      } else {
        setGraphManifestError(null);
      }
      return;
    }
    let cancelled = false;
    const loadGraphManifest = async () => {
      setGraphManifestLoading(true);
      setGraphManifestError(null);
      try {
        const content = await executionApi.getArtifactContent(currentGraphManifestArtifact.artifact_id, { maxBytes: 1024 * 1024 });
        if (cancelled) return;
        const parsed = parseTaskGraphManifest(content.content || '');
        if (!parsed) {
          if (!graphManifestRef.current) {
            setGraphManifest(null);
          }
          setGraphManifestError('graph-manifest.json 不是可识别的 custom_graph 清单');
          return;
        }
        graphManifestRef.current = parsed;
        graphManifestScopeRef.current = currentGraphScopeKey;
        setGraphManifest(parsed);
      } catch (error: any) {
        if (cancelled) return;
        if (!graphManifestRef.current) {
          setGraphManifest(null);
        }
        setGraphManifestError(error?.message || '加载 graph-manifest.json 失败');
      } finally {
        if (!cancelled) setGraphManifestLoading(false);
      }
    };
    void loadGraphManifest();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, selectedTask?.pipeline_mode, selectedTask?.status, currentGraphManifestArtifact?.artifact_id, executionApi]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId || !selectedAttemptId || !selectedTask || !isCompletedTaskStatus(selectedTask.status)) {
      setAuditedResultSummary(null);
      setAuditedResultError(null);
      setAuditedResultLoading(false);
      return;
    }
    const artifact = auditedResultArtifact;
    if (!artifact) {
      setAuditedResultSummary(null);
      setAuditedResultError('未找到 audited-result.json');
      setAuditedResultLoading(false);
      setTaskAuditedResultSummaries((current) => ({ ...current, [selectedTaskId]: null }));
      return;
    }
    let cancelled = false;
    const loadAuditedResultSummary = async () => {
      setAuditedResultLoading(true);
      setAuditedResultError(null);
      try {
        const content = await executionApi.getArtifactContent(artifact.artifact_id, { maxBytes: 512 * 1024 });
        if (cancelled) return;
        const summary = parseAuditedResultSummary(artifact, content.content || '');
        setAuditedResultSummary(summary);
        setTaskAuditedResultSummaries((current) => ({ ...current, [selectedTaskId]: summary }));
      } catch (error: any) {
        if (cancelled) return;
        setAuditedResultSummary(null);
        setAuditedResultError(error?.message || '解析 audited-result.json 失败');
      } finally {
        if (!cancelled) setAuditedResultLoading(false);
      }
    };
    void loadAuditedResultSummary();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, selectedTask?.status, auditedResultArtifact?.artifact_id, executionApi]);

  useEffect(() => {
    if (!refreshJob?.refresh_job_id) return;
    if (!['queued', 'running'].includes(String(refreshJob.status || '').toLowerCase())) {
      setRefreshingCatalog(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextJob = await executionApi.getCatalogRefreshJob(refreshJob.refresh_job_id);
        if (cancelled) return;
        setRefreshJob(nextJob);
        const nextStatus = String(nextJob.status || '').toLowerCase();
        if (nextStatus === 'succeeded') {
          notify(`预设项目已刷新，发现 ${nextJob.discovered_count ?? 0} 个项目`, 'success');
          if (workspaceId) {
            const presetResponse = await executionApi.listPresetProjects(workspaceId, { page: 1, perPage: 200 });
            if (cancelled) return;
            setPresetProjects(presetResponse.items || []);
          }
          setRefreshingCatalog(false);
        }
        if (nextStatus === 'failed') {
          notify(nextJob.error_message || '预设项目刷新失败', 'error');
          setRefreshingCatalog(false);
        }
      } catch (error: any) {
        if (cancelled) return;
        notify(error?.message || '刷新预设项目状态失败', 'error');
        setRefreshingCatalog(false);
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshJob, workspaceId, notify, executionApi]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId || !selectedAttemptId || !selectedSessionPath) {
      setSessionFile(null);
      setSessionEvents([]);
      setSessionHeader(null);
      setSessionWarnings([]);
      setSessionError(null);
      sessionCursorRef.current = 0;
      sessionLineRef.current = 0;
      setSessionLoading(false);
      closeSessionStream();
      return;
    }
    const cacheKey =`${selectedTaskId}:${selectedAttemptId}:${selectedStage}:${selectedSessionPath}`;
    const cached = sessionCache[cacheKey];
    if (cached && !isSelectedTaskActive) {
      setSessionFile(cached);
      if (isJsonlPath(cached.path)) {
        const snapshot = buildSessionSnapshotFromText(cached.path, cached.content || '');
        setSessionEvents(snapshot.events || []);
        setSessionHeader(snapshot.session_meta || null);
        setSessionWarnings(snapshot.warnings || []);
        sessionCursorRef.current = cached.next_cursor ?? cached.content.length;
        sessionLineRef.current = snapshot.line_count || 0;
      } else {
        setSessionEvents([]);
        setSessionHeader(null);
        setSessionWarnings([]);
        sessionLineRef.current = 0;
      }
      setSessionError(null);
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    const loadSession = async () => {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const file = await executionApi.getStageSessionFile(selectedTaskId, selectedAttemptId, selectedStage, selectedSessionPath);
        if (cancelled) return;
        if (!isSelectedTaskActive) {
          setSessionCache((current) => ({ ...current, [cacheKey]: file }));
        }
        setSessionFile(file);
        if (isJsonlPath(file.path)) {
          const snapshot = buildSessionSnapshotFromText(file.path, file.content || '');
          setSessionEvents(snapshot.events || []);
          setSessionHeader(snapshot.session_meta || null);
          setSessionWarnings(snapshot.warnings || []);
          sessionCursorRef.current = file.next_cursor ?? file.content.length;
          sessionLineRef.current = snapshot.line_count || 0;
        } else {
          setSessionEvents([]);
          setSessionHeader(null);
          setSessionWarnings([]);
          sessionCursorRef.current = file.next_cursor ?? file.content.length;
          sessionLineRef.current = 0;
        }
      } catch (error: any) {
        if (cancelled) return;
        setSessionFile(null);
        setSessionEvents([]);
        setSessionHeader(null);
        setSessionWarnings([]);
        sessionLineRef.current = 0;
        setSessionError(error?.message || '加载会话文件失败');
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, selectedStage, selectedSessionPath, sessionCache, executionApi, isSelectedTaskActive]);

  useEffect(() => {
    closeSessionStream();
    if (
      !showTaskDetail ||
      !selectedTaskId ||
      !selectedAttemptId ||
      !selectedSessionPath ||
      !sessionFile ||
      !isJsonlPath(selectedSessionPath) ||
      !isSelectedTaskActive ||
      !capabilities?.supports_sse
    ) {
      return;
    }
    const source = executionApi.openStageSessionFileStream(selectedTaskId, selectedAttemptId, selectedStage, selectedSessionPath, {
      cursor: sessionCursorRef.current,
      pollMs: 1000,
    });
    sessionStreamRef.current = source;
    source.onopen = () => {
      setSessionLive(true);
      setSessionError(null);
    };
    source.addEventListener('snapshot', () => {
      setSessionLive(true);
    });
    source.addEventListener('delta', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (typeof payload.cursor === 'number') {
          sessionCursorRef.current = payload.cursor;
        }
        const lines = Array.isArray(payload.lines) ? payload.lines.map((line: unknown) => String(line)) : [];
        if (lines.length > 0) {
          const parsed = parseSessionJsonlDelta(lines, sessionLineRef.current + 1);
          sessionLineRef.current += parsed.lineCount || lines.length;
          if (parsed.events.length > 0) setSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length > 0) {
            setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          if (parsed.sessionMeta) {
            setSessionHeader((current) => ({ ...(current || {}), ...parsed.sessionMeta }));
          }
          setSessionFile((current) => current ? {
            ...current,
            content:`${current.content || ''}${(current.content || '').endsWith('\n') || !current.content ? '' : '\n'}${lines.join('\n')}\n`,
            next_cursor: sessionCursorRef.current,
            truncated: current.truncated,
          } : current);
        }
      } catch (error: any) {
        setSessionError(error?.message || '实时会话事件解析失败');
      }
    });
    source.addEventListener('file_event', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (payload.event === 'truncated') {
          sessionCursorRef.current = 0;
          sessionLineRef.current = 0;
          setSessionEvents([]);
          setSessionWarnings([]);
          setSessionHeader(null);
          setSessionFile((current) => current ? { ...current, content: '', next_cursor: 0, truncated: false } : current);
          setSessionError('会话文件已重置，正在重新接收输出');
        }
      } catch {
        setSessionError('实时会话文件事件解析失败');
      }
    });
    source.addEventListener('heartbeat', () => {
      setSessionLive(true);
    });
    source.onerror = () => {
      setSessionLive(false);
    };
    return () => {
      if (sessionStreamRef.current === source) {
        source.close();
        sessionStreamRef.current = null;
        setSessionLive(false);
      } else {
        source.close();
      }
    };
  }, [
    showTaskDetail,
    selectedTaskId,
    selectedAttemptId,
    selectedStage,
    selectedSessionPath,
    sessionFile?.path,
    isSelectedTaskActive,
    capabilities?.supports_sse,
    executionApi,
  ]);

  useEffect(() => {
    const shouldRefresh = activeTaskCount > 0 || (showTaskDetail && ACTIVE_TASK_STATUSES.has(String(selectedTask?.status || '').toLowerCase()));
    if (!shouldRefresh || !workspaceId) return;
    const timer = window.setInterval(async () => {
      try {
        const taskResponse = await executionApi.listTasks({ workspaceId, projectId: projectId || undefined, page: 1, perPage: 100 });
        setTasks(taskResponse.items || []);
        if (showTaskDetail && selectedTaskId) {
          const [taskDetail, attemptItems] = await Promise.all([
            executionApi.getTask(selectedTaskId),
            executionApi.listAttempts(selectedTaskId),
          ]);
          setSelectedTask(taskDetail);
          setTaskRuntimeSummaries((current) => ({
            ...current,
            [selectedTaskId]: buildTaskRuntimeSummary(taskDetail.latest_attempt?.effective_config),
          }));
          setAttempts(attemptItems);
          setSelectedAttemptId((current) => {
            if (current && attemptItems.some((item) => item.attempt_id === current)) return current;
            return taskDetail.latest_attempt?.attempt_id || attemptItems[0]?.attempt_id || '';
          });
        }
      } catch {
        // Ignore transient polling failures.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [workspaceId, projectId, selectedTaskId, selectedTask?.status, activeTaskCount, showTaskDetail, executionApi]);

  useEffect(() => {
    if (!showTaskDetail || !selectedTaskId || !selectedAttemptId || !isSelectedTaskActive) return;
    const timer = window.setInterval(async () => {
      if (currentStageNames.length === 0) return;
      const [eventsResult, artifactsResult, sessionResults, logResults] = await Promise.all([
        executionApi.listEvents(selectedTaskId, { attemptId: selectedAttemptId, limit: 200 }).then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
        executionApi.listArtifacts(selectedTaskId, selectedAttemptId).then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
        Promise.allSettled(currentStageNames.map(async (stageName) => ({ stageName, value: await executionApi.listStageSessions(selectedTaskId, selectedAttemptId, stageName) }))),
        Promise.allSettled(currentStageNames.map(async (stageName) => ({ stageName, value: await executionApi.getStageLog(selectedTaskId, selectedAttemptId, stageName, { lines: 240 }) }))),
      ]);
      if (eventsResult.ok) setEvents(eventsResult.value.items || []);
      if (artifactsResult.ok) setArtifacts(artifactsResult.value.items || []);

      const nextSessions = emptyStageSessionMap(currentStageNames);
      sessionResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          nextSessions[result.value.stageName] = result.value.value || [];
        }
      });
      setStageSessions(nextSessions);
      setStageLogs((current) => {
        const next = { ...emptyStageLogMap(currentStageNames), ...current };
        logResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            next[result.value.stageName] = result.value.value || null;
          }
        });
        return next;
      });
      setSelectedStage((current) => {
        if (current && currentStageNames.includes(current) && ((nextSessions[current] || []).length > 0 || stageLogs[current])) return current;
        return defaultStage(currentStageNames, nextSessions, currentAttempt);
      });
      setSelectedSessionPath((current) => {
        const currentExists = currentStageNames.some((stageName) => (nextSessions[stageName] || []).some((item) => item.path === current));
        if (currentExists) return current;
        const fallbackStage = defaultStage(currentStageNames, nextSessions, currentAttempt);
        return preferredSession(nextSessions[fallbackStage] || [])?.path || current;
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, isSelectedTaskActive, executionApi, currentAttempt, currentStageKey, stageLogs]);

  useEffect(() => {
    if (!selectedTaskId) {
      setShowTaskDetail(false);
      return;
    }
    if (tasks.some((item) => item.task_id === selectedTaskId)) return;
    setSelectedTaskId('');
    setShowTaskDetail(false);
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    const taskIds = new Set(tasks.map((item) => item.task_id));
    setSelectedTaskIds((current) => current.filter((taskId) => taskIds.has(taskId)));
    setTaskAuditedResultSummaries((current) => {
      const next: Record<string, AuditedResultSummary | null> = {};
      Object.entries(current).forEach(([taskId, summary]) => {
        if (taskIds.has(taskId)) next[taskId] = summary;
      });
      return next;
    });
    setTaskRuntimeSummaries((current) => {
      const next: Record<string, TaskRuntimeSummary | null> = {};
      Object.entries(current).forEach(([taskId, summary]) => {
        if (taskIds.has(taskId)) next[taskId] = summary;
      });
      return next;
    });
    setTaskRuntimeLoadingIds((current) => {
      const next: Record<string, boolean> = {};
      Object.entries(current).forEach(([taskId, loading]) => {
        if (taskIds.has(taskId)) next[taskId] = loading;
      });
      return next;
    });
  }, [tasks]);

  useEffect(() => {
    const targets = filteredTasks
      .filter((task) => taskRuntimeSummaries[task.task_id] === undefined && !taskRuntimeLoadingIds[task.task_id])
      .slice(0, 16);
    if (targets.length === 0) return;
    const targetIds = targets.map((task) => task.task_id);
    setTaskRuntimeLoadingIds((current) => {
      const next = { ...current };
      targetIds.forEach((taskId) => {
        next[taskId] = true;
      });
      return next;
    });
    const loadTaskRuntimeSummaries = async () => {
      const results = await Promise.allSettled(targets.map(async (task) => {
        const taskDetail = await executionApi.getTask(task.task_id);
        return { taskId: task.task_id, summary: buildTaskRuntimeSummary(taskDetail.latest_attempt?.effective_config) };
      }));
      setTaskRuntimeSummaries((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          const taskId = targets[index].task_id;
          next[taskId] = result.status === 'fulfilled' ? result.value.summary : null;
        });
        return next;
      });
      setTaskRuntimeLoadingIds((current) => {
        const next = { ...current };
        targetIds.forEach((taskId) => {
          delete next[taskId];
        });
        return next;
      });
    };
    void loadTaskRuntimeSummaries();
  }, [filteredTasks, taskRuntimeSummaries, taskRuntimeLoadingIds, executionApi]);

  useEffect(() => {
    const targets = filteredTasks
      .filter((task) => (
        isCompletedTaskStatus(task.status)
        && !!task.latest_attempt_id
        && taskAuditedResultSummaries[task.task_id] === undefined
        && !taskAuditedResultLoadingIds[task.task_id]
      ))
      .slice(0, 12);
    if (targets.length === 0) return;
    const targetIds = targets.map((task) => task.task_id);
    setTaskAuditedResultLoadingIds((current) => {
      const next = { ...current };
      targetIds.forEach((taskId) => {
        next[taskId] = true;
      });
      return next;
    });
    const loadTaskAuditedResults = async () => {
      const results = await Promise.allSettled(targets.map(async (task) => {
        const artifactList = await executionApi.listArtifacts(task.task_id, task.latest_attempt_id || '');
        const artifact = findAuditedResultArtifact(artifactList.items || []);
        if (!artifact) return { taskId: task.task_id, summary: null };
        const content = await executionApi.getArtifactContent(artifact.artifact_id, { maxBytes: 512 * 1024 });
        return { taskId: task.task_id, summary: parseAuditedResultSummary(artifact, content.content || '') };
      }));
      setTaskAuditedResultSummaries((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          const taskId = targets[index].task_id;
          next[taskId] = result.status === 'fulfilled' ? result.value.summary : null;
        });
        return next;
      });
      setTaskAuditedResultLoadingIds((current) => {
        const next = { ...current };
        targetIds.forEach((taskId) => {
          delete next[taskId];
        });
        return next;
      });
    };
    void loadTaskAuditedResults();
  }, [tasks, taskKeyword, taskStatusFilter, taskStageFilter, taskAuditedResultSummaries, executionApi]);

  useEffect(() => {
    if (!workspaceId) {
      setGraphTemplates([]);
      setSelectedTemplateId('');
      return;
    }
    let cancelled = false;
    const loadTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const items = await executionApi.listTemplates({ workspaceId });
        if (cancelled) return;
        setGraphTemplates((items || []).map(templateToRecord));
      } catch {
        if (cancelled) return;
        setGraphTemplates([]);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, executionApi]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (graphTemplates.some((item) => item.templateId === selectedTemplateId)) return;
    setSelectedTemplateId('');
  }, [graphTemplates, selectedTemplateId]);

  useEffect(() => {
    if (supportedPipelineModes.length === 0) return;
    setPipelineMode(resolvePipelineMode(capabilities, selectedWorkspace));
  }, [supportedPipelineModeKey, capabilities, selectedWorkspace]);

  useEffect(() => {
    setExecutorMode('agentflow_cli');
  }, [capabilities, pipelineMode]);

  useEffect(() => {
    if (reportOutputDrafts.length > 0) return;
    setReportOutputDrafts(buildDefaultReportOutputs(pipelineMode, customGraphNodeIds));
  }, [pipelineMode, customGraphNodeKey, reportOutputDrafts.length]);

  useEffect(() => {
    if (createModalOpen) {
      setCustomGraphExpanded(false);
    }
  }, [createModalOpen]);

  useEffect(() => {
    if (!createModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) {
        setCreateModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createModalOpen, creating]);

  const handleRefreshTasks = async () => {
    if (!workspaceId) return;
    setTasksLoading(true);
    setOverviewError(null);
    try {
      const taskResponse = await executionApi.listTasks({ workspaceId, projectId: projectId || undefined, page: 1, perPage: 100 });
      setTasks(taskResponse.items || []);
    } catch (error: any) {
      setOverviewError(error?.message || '刷新任务列表失败');
    } finally {
      setTasksLoading(false);
    }
  };

  const handleRefreshProviders = async () => {
    setProvidersLoading(true);
    setProviderLoadError(null);
    try {
      const providerResponse = await executionApi.listProviders();
      applyProviderList(providerResponse);
      notify(`已同步 ${Array.isArray(providerResponse.items) ? providerResponse.items.length : 0} 个 Provider`, 'success');
    } catch (error) {
      setProviderOptions([]);
      setSelectedProviderKey('');
      setProviderLoadError(getErrorMessage(error, '加载 Provider 列表失败'));
      notify(`Provider 列表加载失败：${getErrorMessage(error, '未知错误')}`, 'error');
    } finally {
      setProvidersLoading(false);
    }
  };

  const reloadPresetProjects = async () => {
    if (!workspaceId) return;
    setPresetLoading(true);
    try {
      const presetResponse = await executionApi.listPresetProjects(workspaceId, { page: 1, perPage: 200 });
      setPresetProjects(presetResponse.items || []);
    } catch (error: any) {
      notify(error?.message || '加载预设项目失败', 'error');
    } finally {
      setPresetLoading(false);
    }
  };

  const handleRefreshCatalog = async () => {
    if (!workspaceId) return;
    setRefreshingCatalog(true);
    try {
      const job = await executionApi.refreshPresetProjects(workspaceId, { source: 'bundle_scan', writeEntriesFile: false });
      setRefreshJob(job);
      const nextStatus = String(job.status || '').toLowerCase();
      if (nextStatus === 'succeeded') {
        await reloadPresetProjects();
        setRefreshingCatalog(false);
        notify(`预设项目已刷新，发现 ${job.discovered_count ?? 0} 个项目`, 'success');
        return;
      }
      if (nextStatus === 'failed') {
        setRefreshingCatalog(false);
        notify(job.error_message || '预设项目刷新失败', 'error');
        return;
      }
      notify('已提交预设项目刷新任务', 'success');
    } catch (error: any) {
      setRefreshingCatalog(false);
      notify(error?.message || '提交预设项目刷新失败', 'error');
    }
  };

  const handleToggleProjectPath = (pathValue: string) => {
    const normalized = normalizeProjectPathInput(pathValue);
    if (!normalized) return;
    setSelectedProjectPaths((current) => (
      current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized]
    ));
  };

  const handleSelectVisibleProjectPaths = () => {
    const visiblePaths = filteredProjectInputItems.map((item) => item.path);
    if (visiblePaths.length === 0) return;
    setSelectedProjectPaths((current) => Array.from(new Set([...current, ...visiblePaths])));
  };

  const handleClearSelectedProjectPaths = () => {
    setSelectedProjectPaths([]);
  };

  const handleToggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => (
      current.includes(taskId)
        ? current.filter((item) => item !== taskId)
        : [...current, taskId]
    ));
  };

  const handleToggleVisibleTaskSelection = () => {
    const visibleTaskIds = filteredTasks.map((item) => item.task_id);
    if (visibleTaskIds.length === 0) return;
    setSelectedTaskIds((current) => {
      const visibleIdSet = new Set(visibleTaskIds);
      const currentVisibleCount = current.filter((taskId) => visibleIdSet.has(taskId)).length;
      if (currentVisibleCount === visibleTaskIds.length) {
        return current.filter((taskId) => !visibleIdSet.has(taskId));
      }
      return Array.from(new Set([...current, ...visibleTaskIds]));
    });
  };

  const handleClearSelectedTasks = () => {
    setSelectedTaskIds([]);
  };

  const handleAddCustomProjectPath = () => {
    if (!canCreateCustomProject) {
      notify('当前工作区不允许添加自定义路径', 'error');
      return;
    }
    const normalized = normalizeProjectPathInput(customPath);
    if (!normalized) {
      notify('请先填写 repo 内项目路径', 'error');
      return;
    }
    setCustomProjectPaths((current) => (
      current.includes(normalized) || presetProjects.some((item) => normalizeProjectPathInput(item.project_path) === normalized)
        ? current
        : [...current, normalized]
    ));
    setSelectedProjectPaths((current) => current.includes(normalized) ? current : [...current, normalized]);
    setCustomPath('');
  };

  const handleRemoveCustomProjectPath = (pathValue: string) => {
    const normalized = normalizeProjectPathInput(pathValue);
    setCustomProjectPaths((current) => current.filter((item) => item !== normalized));
    setSelectedProjectPaths((current) => current.filter((item) => item !== normalized));
  };

  const applyTemplateConfig = (config: GraphTemplateConfig) => {
    const normalizedBuilder = normalizeBuilderState(
      config.builderSourceMode,
      config.pythonBuilderEntry || '',
      config.pythonBuilderCode || '',
    );
    setPipelineMode('custom_graph');
    setExecutorMode('agentflow_cli');
    setModelName(config.modelName || '');
    setSelectedProviderKey(config.providerKey || '');
    setGraphSourceType(config.graphSourceType);
    setBuilderSourceMode(normalizedBuilder.builderSourceMode);
    setInlineJsonText(config.inlineJsonText || defaultCustomGraphContent);
    setPythonBuilderEntry(normalizedBuilder.pythonBuilderEntry);
    setPythonBuilderCode(normalizedBuilder.pythonBuilderCode);
    setReportOutputDrafts(
      cloneReportOutputDrafts(
        config.reportOutputs.length > 0
          ? config.reportOutputs
          : buildDefaultReportOutputs('custom_graph', extractNodeIdsFromInlineGraphText(config.inlineJsonText || defaultCustomGraphContent)),
      ),
    );
  };

  const buildTemplateConfigPayload = () => ({
    pipeline_mode: 'custom_graph' as PipelineMode,
    executor_mode: 'agentflow_cli' as ExecutorMode,
    model: modelName.trim() || undefined,
    provider_keys: selectedProviderKey ? [selectedProviderKey] : [],
    graph_source: buildGraphSourcePayload(),
    report_outputs: buildReportOutputSpecs(),
  });

  const focusGraphEditor = (target: GraphEditorTarget) => {
    setCustomGraphExpanded(true);
    if (target === 'inline_json') {
      setGraphSourceType('inline_json');
    }
    if (target === 'python_entry' || target === 'python_code') {
      setGraphSourceType('python_builder');
      setBuilderSourceMode(target === 'python_entry' ? 'entry' : 'code');
    }
    graphDefinitionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      if (target === 'inline_json') {
        inlineJsonInputRef.current?.focus();
        return;
      }
      if (target === 'python_entry') {
        pythonBuilderEntryInputRef.current?.focus();
        return;
      }
      pythonBuilderCodeInputRef.current?.focus();
    }, 120);
  };

  const handleSaveTemplate = async () => {
    setCustomGraphExpanded(true);
    if (!workspaceId) {
      notify('请先选择工作区', 'error');
      return;
    }
    const normalizedName = templateName.trim();
    if (!normalizedName) {
      notify('请先填写模板名称', 'error');
      return;
    }
    try {
      const payload = {
        name: normalizedName,
        description: templateDescription.trim() || undefined,
        config: buildTemplateConfigPayload(),
      };
      const saved = selectedTemplateId
        ? await executionApi.updateTemplate(selectedTemplateId, payload)
        : await executionApi.createTemplate({ workspace_id: workspaceId, ...payload });
      const record = templateToRecord(saved);
      setGraphTemplates((current) => {
        const next = [...current.filter((item) => item.templateId !== record.templateId), record]
          .sort((left, right) => left.name.localeCompare(right.name));
        return next;
      });
      setSelectedTemplateId(record.templateId);
      notify(selectedTemplateId ? '模板已更新到服务端' : '模板已保存到服务端', 'success');
    } catch (error) {
      notify(getErrorMessage(error, '保存模板失败'), 'error');
    }
  };

  const handleLoadTemplate = () => {
    const target = graphTemplates.find((item) => item.templateId === selectedTemplateId) || null;
    if (!target) {
      notify('请选择一个模板', 'error');
      return;
    }
    setCustomGraphExpanded(true);
    applyTemplateConfig(target.config);
    setTemplateName(target.name);
    setTemplateDescription(target.description || '');
    notify(`已加载模板 ${target.name}`, 'success');
  };

  const handleDeleteTemplate = async () => {
    const target = graphTemplates.find((item) => item.templateId === selectedTemplateId) || null;
    if (!target) {
      notify('请选择一个模板', 'error');
      return;
    }
    const confirmed = await confirm({
      title: '删除模板',
      message:`确认删除服务端模板「${target.name}」吗？`,
      confirmText: '删除模板',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await executionApi.deleteTemplate(target.templateId);
      const nextTemplates = graphTemplates.filter((item) => item.templateId !== target.templateId);
      setGraphTemplates(nextTemplates);
      setSelectedTemplateId('');
      if (templateName.trim() === target.name) setTemplateName('');
      if ((templateDescription || '').trim() === (target.description || '').trim()) setTemplateDescription('');
      notify('模板已删除', 'success');
    } catch (error) {
      notify(getErrorMessage(error, '删除模板失败'), 'error');
    }
  };

  const handleResetReportOutputs = () => {
    setCustomGraphExpanded(true);
    setReportOutputDrafts(buildDefaultReportOutputs(pipelineMode, customGraphNodeIds));
  };

  const handleValidateInlineGraph = async () => {
    if (!workspaceId) {
      notify('请先选择工作区', 'error');
      return;
    }
    setValidatingGraph(true);
    try {
      const reportOutputs = buildReportOutputSpecs();
      const result = await executionApi.validateGraph({
        workspace_id: workspaceId,
        executor_mode: 'agentflow_cli',
        model: modelName.trim() || undefined,
        provider_keys: selectedProviderKey ? [selectedProviderKey] : [],
        graph_source: {
          type: 'inline_json',
          content: JSON.parse(inlineJsonText),
        },
        report_outputs: reportOutputs,
      });
      const nodeLabel = result.node_ids.length > 0 ?`：${result.node_ids.join(', ')}` : '';
      notify(`Graph JSON 校验通过，共 ${result.node_count} 个节点${nodeLabel}`, 'success');
    } catch (error) {
      notify(getErrorMessage(error, 'Graph JSON 校验失败'), 'error');
    } finally {
      setValidatingGraph(false);
    }
  };

  const handleValidatePythonBuilderCode = async () => {
    if (!workspaceId) {
      notify('请先选择工作区', 'error');
      return;
    }
    const code = pythonBuilderCode.trim();
    if (!code) {
      notify('请先填写 Python builder 代码', 'error');
      return;
    }
    setValidatingGraph(true);
    try {
      const reportOutputs = buildReportOutputSpecs();
      const result = await executionApi.validateGraph({
        workspace_id: workspaceId,
        executor_mode: 'agentflow_cli',
        model: modelName.trim() || undefined,
        provider_keys: selectedProviderKey ? [selectedProviderKey] : [],
        graph_source: {
          type: 'python_builder',
          code,
        },
        report_outputs: reportOutputs,
      });
      const nodeLabel = result.node_ids.length > 0 ?`：${result.node_ids.join(', ')}` : '';
      notify(`Python 图定义校验通过，共 ${result.node_count} 个节点${nodeLabel}`, 'success');
    } catch (error) {
      notify(getErrorMessage(error, 'Python builder 校验失败'), 'error');
    } finally {
      setValidatingGraph(false);
    }
  };

  const handleAddReportOutput = () => {
    setCustomGraphExpanded(true);
    setReportOutputDrafts((current) => current.concat(toReportOutputDraft({
      output_id:`report_${current.length + 1}`,
      node_id: customGraphNodeIds[current.length] || customGraphNodeIds[0] || '',
      title:`Report ${current.length + 1}`,
      path:`exports/report-${current.length + 1}.md`,
      format: 'markdown',
      required: true,
      order: (current.length + 1) * 10,
    }, current.length)));
  };

  const handleUpdateReportOutput = (key: string, field: keyof ReportOutputDraft, value: string | boolean) => {
    setReportOutputDrafts((current) => current.map((item) => (
      item.key === key
        ? { ...item, [field]: value }
        : item
    )));
  };

  const handleRemoveReportOutput = (key: string) => {
    setReportOutputDrafts((current) => current.filter((item) => item.key !== key));
  };

  const buildReportOutputSpecs = (): IpcAuditTaskReportOutputSpec[] => {
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();
    const normalized = reportOutputDrafts
      .map((item, index) => ({
        output_id: item.outputId.trim(),
        node_id: item.nodeId.trim(),
        title: item.title.trim(),
        path: item.path.trim(),
        format: item.format,
        required: item.required,
        order: Number(item.order || index * 10),
      }))
      .filter((item) => item.output_id || item.node_id || item.title || item.path);
    normalized.forEach((item, index) => {
      if (!item.output_id || !item.node_id || !item.title || !item.path) {
        throw new Error(`报告输出 #${index + 1} 需要完整填写 output_id、node_id、title 和 path`);
      }
      if (!Number.isFinite(item.order)) {
        throw new Error(`报告输出 #${index + 1} 的 order 必须是数字`);
      }
      if (seenIds.has(item.output_id)) {
        throw new Error(`重复的报告输出 ID：${item.output_id}`);
      }
      if (seenPaths.has(item.path)) {
        throw new Error(`重复的报告输出路径：${item.path}`);
      }
      seenIds.add(item.output_id);
      seenPaths.add(item.path);
    });
    return normalized;
  };

  const buildGraphSourcePayload = (): IpcAuditTaskGraphSource | undefined => {
    if (graphSourceType === 'inline_json') {
      let content: Record<string, any>;
      try {
        const parsed = JSON.parse(inlineJsonText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Graph JSON 顶层必须是对象');
        }
        content = parsed as Record<string, any>;
      } catch (error) {
        throw new Error(getErrorMessage(error, 'Graph JSON 解析失败'));
      }
      return {
        type: 'inline_json',
        content,
      };
    }
    const code = pythonBuilderCode.trim();
    if (code) {
      return {
        type: 'python_builder',
        code,
      };
    }
    const entry = pythonBuilderEntry.trim();
    if (entry) {
      return {
        type: 'python_builder',
        entry,
      };
    }
    throw new Error('请填写 Python builder 代码');
  };

  const handleCreateTask = async () => {
    if (!workspaceId) {
      notify('当前没有可用工作区', 'error');
      return;
    }
    if (selectedProjectItems.length === 0) {
      notify('请至少选择一个项目路径', 'error');
      return;
    }
    const normalizedProviderKey = String(selectedProviderKey || '').trim();
    const selectedProviderOption = providerOptionMap.get(normalizedProviderKey) || null;
    if (normalizedProviderKey && (!selectedProviderOption || selectedProviderOption.enabled === false)) {
      notify('当前 Provider 不可用，请刷新后重试', 'error');
      return;
    }
    if (!supportsAgentflowExecutor) {
      notify('当前服务未暴露 agentflow_cli，暂时不能创建 custom_graph 任务', 'error');
      return;
    }

    setCreating(true);
    try {
      const createdTasks: IpcAuditTaskSummary[] = [];
      const failedItems: Array<{ path: string; message: string }> = [];
      const resolvedPipelineMode = 'custom_graph' as PipelineMode;
      const resolvedExecutorMode = 'agentflow_cli' as ExecutorMode;
      const reportOutputs = buildReportOutputSpecs();
      const graphSource = buildGraphSourcePayload();
      await executionApi.validateGraph({
        workspace_id: workspaceId,
        executor_mode: resolvedExecutorMode,
        model: modelName.trim() || undefined,
        provider_keys: normalizedProviderKey ? [normalizedProviderKey] : [],
        graph_source: graphSource,
        report_outputs: reportOutputs,
      });
      for (const target of selectedProjectItems) {
        try {
          const inputRef = { kind: target.kind, project_path: target.path };
          const validation = await executionApi.validateInput(workspaceId, inputRef);
          const normalizedPath = validation.normalized_input_ref.project_path || validation.normalized_input_ref.report_path || target.path;
          const finalTitle = buildBatchTaskTitle(title, selectedProjectItems.length, normalizedPath, target.displayName);
          const createdTask = await executionApi.createTask({
            project_id: projectId || undefined,
            title: finalTitle,
            workspace_id: workspaceId,
            pipeline_mode: resolvedPipelineMode,
            input_ref: validation.normalized_input_ref,
            executor_mode: resolvedExecutorMode,
            model: modelName.trim() || undefined,
            provider_keys: normalizedProviderKey ? [normalizedProviderKey] : [],
            graph_source: graphSource,
            report_outputs: reportOutputs,
          });
          createdTasks.push(createdTask);
        } catch (error: any) {
          failedItems.push({ path: target.path, message: error?.message || '创建失败' });
        }
      }
      if (createdTasks.length === 0) {
        notify(failedItems[0]?.message || '创建任务失败', 'error');
        return;
      }
      notify(
        failedItems.length > 0
          ?`已创建 ${createdTasks.length} 个任务，${failedItems.length} 个失败`
          :`已创建 ${createdTasks.length} 个任务`,
        failedItems.length > 0 ? 'warning' : 'success',
      );
      setTitle('');
      setSelectedTaskId(createdTasks[0].task_id);
      setSelectedTaskIds(createdTasks.map((item) => item.task_id));
      setShowTaskDetail(false);
      await handleRefreshTasks();
      if (failedItems.length === 0) {
        setSelectedProjectPaths([]);
        setCreateModalOpen(false);
      } else {
        setSelectedProjectPaths(failedItems.map((item) => item.path));
      }
    } catch (error: any) {
      notify(error?.message || '创建任务失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '取消任务',
      message:`确认取消任务「${selectedTask.title}」吗？`,
      confirmText: '取消任务',
      cancelText: '保留任务',
      danger: true,
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.cancelTask(selectedTask.task_id);
      notify('已提交取消请求', 'success');
      await handleRefreshTasks();
      setSelectedTaskId(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '取消任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleRetryTask = async (stage?: StageName) => {
    if (!selectedTask) return;
    const message = stage === 'poc'
      ?`确认从 PoC 阶段重试任务「${selectedTask.title}」吗？`
      :`确认重新执行任务「${selectedTask.title}」吗？`;
    const confirmed = await confirm({
      title: stage === 'poc' ? '重试 PoC' : '重试任务',
      message,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.retryTask(selectedTask.task_id, stage ? { retry_scope: 'from_stage', stage } : { retry_scope: 'task' });
      notify(stage === 'poc' ? '已提交 PoC 重试' : '任务已重新排队', 'success');
      await handleRefreshTasks();
      setSelectedTaskId(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '重试任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '删除任务',
      message:`确认删除任务「${selectedTask.title}」以及当前产物目录吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.deleteTask(selectedTask.task_id, true);
      notify('任务已删除', 'success');
      setSelectedTaskId('');
      setShowTaskDetail(false);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '删除任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleBatchRetryTasks = async () => {
    if (selectedTaskSummaries.length === 0) {
      notify('请先选择任务', 'error');
      return;
    }
    if (actionableSelectedTasks.length === 0) {
      notify('选中的任务都处于运行中或取消中，不能批量重试', 'error');
      return;
    }
    const confirmed = await confirm({
      title: '批量重试任务',
      message:`确认重新执行 ${actionableSelectedTasks.length} 个任务吗？${skippedActiveSelectedTaskCount > 0 ?` ${skippedActiveSelectedTaskCount} 个运行中/取消中的任务会被跳过。` : ''}`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setBatchActingTasks(true);
    try {
      const results = await Promise.allSettled(
        actionableSelectedTasks.map((task) => executionApi.retryTask(task.task_id, { retry_scope: 'task' })),
      );
      const failedTaskIds = actionableSelectedTasks
        .filter((_, index) => results[index].status === 'rejected')
        .map((task) => task.task_id);
      const succeededCount = results.length - failedTaskIds.length;
      notify(
        failedTaskIds.length > 0
          ?`已重试 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          :`已重试 ${succeededCount} 个任务`,
        failedTaskIds.length > 0 ? 'warning' : 'success',
      );
      if (failedTaskIds.length > 0) setSelectedTaskIds(failedTaskIds);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '批量重试任务失败', 'error');
    } finally {
      setBatchActingTasks(false);
    }
  };

  const handleBatchCancelTasks = async () => {
    if (selectedTaskSummaries.length === 0) {
      notify('请先选择任务', 'error');
      return;
    }
    if (cancellableSelectedTasks.length === 0) {
      notify('选中的任务没有处于排队中或执行中，不能批量停止', 'error');
      return;
    }
    const confirmed = await confirm({
      title: '批量停止任务',
      message:`确认停止 ${cancellableSelectedTasks.length} 个排队中/执行中的任务吗？${skippedNonCancellableSelectedTaskCount > 0 ?` ${skippedNonCancellableSelectedTaskCount} 个非运行任务会被跳过。` : ''}`,
      confirmText: '确认停止',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setBatchActingTasks(true);
    try {
      const results = await Promise.allSettled(
        cancellableSelectedTasks.map((task) => executionApi.cancelTask(task.task_id)),
      );
      const failedTaskIds = cancellableSelectedTasks
        .filter((_, index) => results[index].status === 'rejected')
        .map((task) => task.task_id);
      const succeededCount = results.length - failedTaskIds.length;
      notify(
        failedTaskIds.length > 0
          ?`已停止 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          :`已提交 ${succeededCount} 个任务的停止请求`,
        failedTaskIds.length > 0 ? 'warning' : 'success',
      );
      if (failedTaskIds.length > 0) setSelectedTaskIds(failedTaskIds);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '批量停止任务失败', 'error');
    } finally {
      setBatchActingTasks(false);
    }
  };

  const handleBatchDeleteTasks = async () => {
    if (selectedTaskSummaries.length === 0) {
      notify('请先选择任务', 'error');
      return;
    }
    if (actionableSelectedTasks.length === 0) {
      notify('选中的任务都处于运行中或取消中，不能批量删除', 'error');
      return;
    }
    const confirmed = await confirm({
      title: '批量删除任务',
      message:`确认删除 ${actionableSelectedTasks.length} 个任务以及对应产物目录吗？此操作不可撤销。${skippedActiveSelectedTaskCount > 0 ?` ${skippedActiveSelectedTaskCount} 个运行中/取消中的任务会被跳过。` : ''}`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setBatchActingTasks(true);
    try {
      const results = await Promise.allSettled(
        actionableSelectedTasks.map((task) => executionApi.deleteTask(task.task_id, true)),
      );
      const failedTaskIds = actionableSelectedTasks
        .filter((_, index) => results[index].status === 'rejected')
        .map((task) => task.task_id);
      const deletedTaskIds = actionableSelectedTasks
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((task) => task.task_id);
      const succeededCount = deletedTaskIds.length;
      notify(
        failedTaskIds.length > 0
          ?`已删除 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          :`已删除 ${succeededCount} 个任务`,
        failedTaskIds.length > 0 ? 'warning' : 'success',
      );
      if (deletedTaskIds.includes(selectedTaskId)) {
        setSelectedTaskId('');
        setShowTaskDetail(false);
      }
      setSelectedTaskIds(failedTaskIds);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '批量删除任务失败', 'error');
    } finally {
      setBatchActingTasks(false);
    }
  };

  const handleSaveMaxParallelTasks = async () => {
    const value = Number(maxParallelDraft);
    if (!Number.isInteger(value) || value < 1 || value > 32) {
      notify('并发上限必须是 1 到 32 之间的整数', 'error');
      return;
    }
    setSavingRuntimeConfig(true);
    try {
      const nextRuntime = await executionApi.updateRuntimeConfig({ max_parallel_tasks: value });
      const nextCapabilities = await executionApi.getCapabilities();
      setRuntimeConfig(nextRuntime);
      setCapabilities(nextCapabilities);
      setMaxParallelDraft(String(nextRuntime.max_parallel_tasks));
      notify(`并发上限已更新为 ${nextRuntime.max_parallel_tasks}`, 'success');
    } catch (error: any) {
      notify(error?.message || '更新并发上限失败', 'error');
    } finally {
      setSavingRuntimeConfig(false);
    }
  };

  const handlePreviewArtifact = async (artifact: IpcAuditArtifact) => {
    setPreviewArtifact(artifact);
    setPreviewArtifactContent(null);
    setPreviewArtifactError(null);
    setPreviewArtifactLoading(true);
    try {
      const content = await executionApi.getArtifactContent(artifact.artifact_id, { maxBytes: 1024 * 1024 });
      setPreviewArtifactContent(content);
    } catch (error: any) {
      setPreviewArtifactError(error?.message || '加载产物预览失败');
    } finally {
      setPreviewArtifactLoading(false);
    }
  };

  const handlePreviewReportOutput = async (output: IpcAuditTaskReportOutput) => {
    if (!output.artifact_id || !output.preview_url || !output.download_url) {
      notify('当前报告输出还没有可预览的产物', 'error');
      return;
    }
    const artifact: IpcAuditArtifact = {
      artifact_id: output.artifact_id,
      task_id: selectedTaskId,
      attempt_id: selectedAttemptId,
      stage_name: output.node_id,
      artifact_kind: 'report_output',
      display_name: output.title,
      relative_path: output.path,
      content_type: output.content_type || (output.format === 'json' ? 'application/json' : output.format === 'text' ? 'text/plain' : 'text/markdown'),
      size: output.size || 0,
      sha256: output.sha256 || null,
      preview_url: output.preview_url,
      download_url: output.download_url,
      created_at: output.created_at || '',
    };
    await handlePreviewArtifact(artifact);
  };

  const handleCloseArtifactPreview = () => {
    setPreviewArtifact(null);
    setPreviewArtifactContent(null);
    setPreviewArtifactError(null);
    setPreviewArtifactLoading(false);
  };

  const canCreateCustomProject = !!selectedWorkspace?.allow_custom_project_path;
  const canRetryPoc = !!currentAttempt?.stage_runs.find((item) => item.stage_name === 'audit' && item.status === 'succeeded')
    && String(selectedTask?.pipeline_mode || '').toLowerCase() === 'audit_then_poc';
  const handleOpenTaskDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowTaskDetail(true);
  };
  const handleBackToList = () => setShowTaskDetail(false);

  return (
    <div className="space-y-6 px-8 pt-8 pb-10">
      <PageHeader
        title="IPC漏洞扫描"
        description="面向 OpenHarmony IPC 服务入口的自动化漏洞扫描，覆盖代码审计、PoC 验证、执行日志和产物追踪。"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="服务状态" value={baseDataLoading ? 'Loading' : readyState?.ready ? 'Ready' : readyState?.status || 'Unknown'} sub={capabilities?.service || 'chimera-app-ipc-audit'} />
        <MetricCard label="工作区" value={baseDataLoading ? '加载中' : selectedWorkspace?.display_name || '-'} sub={baseDataLoading ? '等待工作区' : selectedWorkspace?.workspace_id || '未选择'} />
        <div className="rounded-lg border border-theme-border bg-slate-50/90 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">并发上限</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={32}
              value={maxParallelDraft}
              onChange={(event) => setMaxParallelDraft(event.target.value)}
              disabled={!readyState?.ready || savingRuntimeConfig}
              className="w-20 rounded-lg border border-theme-border bg-theme-elevated px-2 py-1.5 text-sm font-semibold text-theme-text-primary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-theme-elevated disabled:text-theme-text-muted"
            />
            <button
              type="button"
              onClick={handleSaveMaxParallelTasks}
              disabled={!readyState?.ready || savingRuntimeConfig || String(runtimeConfig?.max_parallel_tasks || capabilities?.max_parallel_tasks || '') === maxParallelDraft.trim()}
              className="rounded-lg bg-theme-elevated px-3 py-1.5 text-xs font-bold text-white transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingRuntimeConfig ? '保存中' : '保存'}
            </button>
          </div>
          <div className="mt-1 text-xs font-medium text-theme-text-muted">
            {baseDataLoading
              ? '正在同步运行时配置...'
              :`当前运行 ${runtimeConfig?.active_attempts ?? activeTaskCount} 个，默认 ${runtimeConfig?.default_max_parallel_tasks ?? capabilities?.max_parallel_tasks ?? 1}`}
          </div>
        </div>
        <MetricCard label="PoC 能力" value={baseDataLoading ? '加载中' : selectedWorkspace?.supports_poc ? '开启' : '关闭'} sub={baseDataLoading ? '等待能力信息' : capabilities?.poc_runtime_available ? '运行环境可用' : '运行环境未就绪'} />
      </div>
      {readyState ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(readyState.checks || {})
            .filter(([key]) => !HIDDEN_READY_CHECK_KEYS.has(key))
            .map(([key, passed]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${passed ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400'}`}
            >
              {passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {key}
            </span>
          ))}
        </div>
      ) : null}
      {overviewError ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{overviewError}</div>
      ) : null}

      <div className="space-y-6">
        {!showTaskDetail ? (
        <section className="space-y-6">
          <div className={panelClassName}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Task Queue</div>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">任务列表</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-3 py-2 text-sm font-bold text-white transition hover:bg-theme-elevated"
                >
                  <Plus size={16} />
                  新建任务
                </button>
                <button
                  type="button"
                  onClick={handleRefreshTasks}
                  disabled={taskQueueLoading || !workspaceId}
                  className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskQueueLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  刷新
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="任务总数" value={effectiveTaskCount} />
              <MetricCard label="活跃任务" value={activeTaskCount} />
            </div>

            <div className="mt-4 rounded-2xl border border-theme-border bg-slate-50/80 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-theme-text-secondary">
                  <input
                    type="checkbox"
                    checked={allFilteredTasksSelected}
                    disabled={filteredTasks.length === 0}
                    onChange={handleToggleVisibleTaskSelection}
                    className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-theme-border disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  选择当前筛选结果
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-theme-text-muted">
                    已选择 {selectedTaskSummaries.length} 个，当前筛选 {filteredTasks.length} 个
                    {cancellableSelectedTasks.length > 0 ?`，可停止 ${cancellableSelectedTasks.length} 个` : ''}
                    {actionableSelectedTasks.length > 0 ?`，可重试/删除 ${actionableSelectedTasks.length} 个` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleBatchCancelTasks}
                    disabled={batchActingTasks || cancellableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-theme-elevated px-3 py-2 text-sm font-bold text-amber-400 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                    批量停止 {cancellableSelectedTasks.length > 0 ?`(${cancellableSelectedTasks.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchRetryTasks}
                    disabled={batchActingTasks || actionableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    批量重试 {actionableSelectedTasks.length > 0 ?`(${actionableSelectedTasks.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDeleteTasks}
                    disabled={batchActingTasks || actionableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-theme-elevated px-3 py-2 text-sm font-bold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    批量删除 {actionableSelectedTasks.length > 0 ?`(${actionableSelectedTasks.length})` : ''}
                  </button>
                  {selectedTaskSummaries.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearSelectedTasks}
                      disabled={batchActingTasks}
                      className="rounded-lg px-3 py-2 text-sm font-bold text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      清空选择
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <div className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5">
                <Search size={16} className="text-theme-text-muted" />
                <input
                  value={taskKeyword}
                  onChange={(event) => setTaskKeyword(event.target.value)}
                  placeholder="筛选标题、路径、任务 ID 或状态"
                  className="w-full bg-transparent text-sm font-semibold text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
                />
              </div>
              <select
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
                className="form-select"
              >
                <option value="all">全部状态</option>
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={taskStageFilter}
                onChange={(event) => setTaskStageFilter(event.target.value)}
                className="form-select"
              >
                <option value="all">全部阶段</option>
                {taskStageOptions.map((stageName) => (
                  <option key={stageName} value={stageName}>{formatStageLabel(stageName)}</option>
                ))}
                <option value="none">等待调度</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setTaskKeyword('');
                  setTaskStatusFilter('all');
                  setTaskStageFilter('all');
                }}
                disabled={!taskKeyword && taskStatusFilter === 'all' && taskStageFilter === 'all'}
                className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空筛选
              </button>
            </div>

            <div className="mt-4 max-h-[840px] space-y-3 overflow-auto pr-1">
              {taskQueueLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                  <Loader2 size={16} className="animate-spin" />
                  正在加载任务列表和工作区上下文...
                </div>
              ) : !serviceReady ? (
                <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-12 text-center text-sm font-semibold text-theme-text-muted">
                  等待服务就绪后加载任务列表。
                </div>
              ) : tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-12 text-center text-sm font-semibold text-theme-text-muted">
                  当前项目还没有 IPC 漏洞扫描任务。
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-12 text-center text-sm font-semibold text-theme-text-muted">
                  没有符合当前筛选条件的任务。
                </div>
              ) : (
                filteredTasks.map((item) => {
                  const active = item.task_id === selectedTaskId;
                  const checked = selectedTaskIdSet.has(item.task_id);
                  const path = item.input_ref.project_path || item.input_ref.report_path || '-';
                  const rowRuntimeSummary = taskRuntimeSummaries[item.task_id];
                  const rowRuntimeLoading = Boolean(taskRuntimeLoadingIds[item.task_id]);
                  const rowProviderSnapshotMap = buildProviderSnapshotMap(rowRuntimeSummary?.providerSnapshots);
                  const rowProviderKeys = rowRuntimeSummary?.providerKeys || [];
                  const rowModel = rowRuntimeSummary?.taskModel || rowRuntimeSummary?.model || '';
                  const rowAuditedResult = taskAuditedResultSummaries[item.task_id];
                  const rowAuditedResultLoading = Boolean(taskAuditedResultLoadingIds[item.task_id]);
                  return (
                    <div
                      key={item.task_id}
 className={`rounded-lg border transition ${checked ? 'border-sky-300 bg-sky-500/15 ' : active ? 'border-sky-300 bg-sky-50/70 ' : 'border-theme-border bg-theme-elevated hover:border-theme-border hover:bg-theme-elevated'}`}
                    >
                      <div className="flex items-start gap-3 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTaskSelection(item.task_id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-theme-border text-theme-text-primary focus:ring-theme-border"
                          aria-label={`选择任务 ${item.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenTaskDetail(item.task_id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-theme-text-primary">{item.title}</div>
                              <div className="mt-2 break-all font-mono text-[11px] text-theme-text-muted">{path}</div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                              {formatTaskStatus(item.status)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-theme-text-muted">
                            <span>{formatInputKind(item.input_ref.kind)}</span>
                            <span>{formatPipelineMode(item.pipeline_mode)}</span>
                            <span>{item.current_stage ?`当前阶段 ${formatStageLabel(item.current_stage)}` : '等待调度'}</span>
                            <span>{formatDateTime(item.created_at)}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {rowRuntimeLoading ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                                <Loader2 size={12} className="animate-spin" />
                                加载执行配置
                              </span>
                            ) : rowRuntimeSummary ? (
                              <>
                                {rowRuntimeSummary.executorMode ? (
                                  <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                    执行器 {formatExecutorMode(rowRuntimeSummary.executorMode)}
                                  </span>
                                ) : null}
                                <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                  Model {rowModel || '(default)'}
                                </span>
                                {rowProviderKeys.slice(0, 2).map((providerKey, index) => (
                                  <span key={`${item.task_id}-${providerKey}-${index}`} className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                    Provider {index + 1} · {displayProviderName(providerKey, rowProviderSnapshotMap)}
                                  </span>
                                ))}
                                {rowProviderKeys.length > 2 ? (
                                  <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                                    +{rowProviderKeys.length - 2} Provider
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                          {isCompletedTaskStatus(item.status) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {rowAuditedResultLoading ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                                  <Loader2 size={12} className="animate-spin" />
                                  解析 audited-result
                                </span>
                              ) : rowAuditedResult ? (
                                <>
                                  <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                    vulnerabilities_found {rowAuditedResult.vulnerabilitiesFound}
                                  </span>
                                  <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                    pocs_developed {rowAuditedResult.pocsDeveloped}
                                  </span>
                                  <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                    info_findings {rowAuditedResult.infoFindings}
                                  </span>
                                </>
                              ) : (
                                <span className="rounded-full border border-dashed border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                                  未解析到 audited-result.json
                                </span>
                              )}
                            </div>
                          ) : null}
                          <div className="mt-2 font-mono text-[11px] text-theme-text-muted">{item.task_id}</div>
                        </button>
                        <div className="hidden shrink-0 pt-1 text-[11px] font-bold text-theme-text-muted md:block">
                          点击内容查看详情
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
        ) : (
        <section className="space-y-6">
          <div className={panelClassName}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                >
                  <ArrowLeft size={16} />
                  返回任务列表
                </button>
              </div>

              {selectedTask ? (
                <div className="flex flex-wrap items-center gap-2">
                  {ACTIVE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                    <button
                      type="button"
                      onClick={handleCancelTask}
                      disabled={actingTask}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-2 text-sm font-bold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actingTask ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                      取消任务
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRetryTask()}
                        disabled={actingTask}
                        className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingTask ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                        重试任务
                      </button>
                      {canRetryPoc ? (
                        <button
                          type="button"
                          onClick={() => handleRetryTask('poc')}
                          disabled={actingTask}
                          className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/20 bg-blue-500/15 px-4 py-2 text-sm font-bold text-blue-400 transition hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Bot size={16} />
                          从 PoC 重试
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDeleteTask}
                        disabled={actingTask}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-2 text-sm font-bold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        删除任务
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-6 min-w-0 border-t border-theme-border pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Task Detail</div>
              <h2 className="mt-2 truncate text-2xl font-bold text-slate-950">{selectedTask?.title || '任务详情'}</h2>
              {selectedTask ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(selectedTask.status)}`}>
                    {formatTaskStatus(selectedTask.status)}
                  </span>
                  <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                    {formatInputKind(selectedTask.input_ref.kind)}
                  </span>
                  <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                    {formatPipelineMode(selectedTask.pipeline_mode)}
                  </span>
                  {selectedTask.current_stage ? (
                    <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                      当前阶段 {formatStageLabel(selectedTask.current_stage)}
                    </span>
                  ) : null}
                  {currentExecutorMode ? (
                    <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                      执行器 {formatExecutorMode(currentExecutorMode)}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                    Model {currentModelName || '(default)'}
                  </span>
                  {currentProviderKeys.map((providerKey, index) => {
                    const snapshot = currentProviderSnapshotMap.get(providerKey);
                    const displayName = String(snapshot?.display_name || providerKey).trim() || providerKey;
                    return (
                      <span key={`${providerKey}-${index}`} className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                        Provider {index + 1} · {displayName}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {detailError ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-400">{detailError}</div>
            ) : null}

            {!selectedTask ? (
              <div className="mt-6 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-16 text-center text-sm font-semibold text-theme-text-muted">
                正在加载任务详情，或任务已不可用。你可以返回任务列表后重新选择。
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="任务 ID" value={<span className="font-mono text-sm">{selectedTask.task_id}</span>} sub={selectedTask.message || '任务已创建'} />
                  <MetricCard label="输入路径" value={<span className="break-all font-mono text-sm">{shortPath(selectedTask.input_ref.project_path || selectedTask.input_ref.report_path)}</span>} sub={selectedTask.input_ref.project_path || selectedTask.input_ref.report_path || '-'} />
                  <MetricCard label="尝试次数" value={selectedTask.attempt_count} sub={`创建于 ${formatDateTime(selectedTask.created_at)}`} />
                  <MetricCard label="最近更新时间" value={formatDateTime(selectedTask.finished_at || selectedTask.started_at || selectedTask.created_at)} sub={selectedTask.created_by} />
                </div>

                {isCompletedTaskStatus(selectedTask.status) ? (
                  <div className="mt-5 rounded-2xl border border-theme-border bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Audited Result</div>
                        <h3 className="mt-1 text-sm font-semibold text-slate-950">audited-result.json 摘要</h3>
                      </div>
                      {auditedResultSummary ? (
                        <button
                          type="button"
                          onClick={() => handlePreviewArtifact(auditedResultSummary.artifact)}
                          className="self-start rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated sm:self-auto"
                        >
                          预览 JSON
                        </button>
                      ) : null}
                    </div>
                    {auditedResultLoading ? (
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-muted">
                        <Loader2 size={16} className="animate-spin" />
                        正在解析 audited-result.json...
                      </div>
                    ) : auditedResultSummary ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <MetricCard label="vulnerabilities_found" value={auditedResultSummary.vulnerabilitiesFound} sub={auditedResultSummary.artifact.relative_path} />
                        <MetricCard label="pocs_developed" value={auditedResultSummary.pocsDeveloped} sub={auditedResultSummary.artifact.relative_path} />
                        <MetricCard label="info_findings" value={auditedResultSummary.infoFindings} sub={auditedResultSummary.artifact.relative_path} />
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-muted">
                        {auditedResultError || '当前任务没有可解析的 audited-result.json。'}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 rounded-2xl border border-theme-border bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Report Outputs</div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-950">按任务声明的报告输出</h3>
                    </div>
                    <div className="text-xs font-semibold text-theme-text-muted">
                      {currentReportOutputs.length > 0 ?`${currentReportOutputs.length} 个输出` : '当前尝试未声明输出'}
                    </div>
                  </div>
                  {currentReportOutputs.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-muted">
                      当前尝试没有返回 report_outputs，后端会继续在普通产物列表中展示已有文件。
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {currentReportOutputs.map((item) => (
                        <article key={item.output_id} className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-theme-text-primary">{item.title}</div>
                              <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.path}</div>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${item.exists ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400'}`}>
                              {item.exists ? 'Ready' : (item.required ? 'Missing' : 'Optional')}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-theme-text-muted">
                            <span>节点 {formatStageLabel(item.node_id)}</span>
                            <span>{formatReportFormat(item.format)}</span>
                            <span>{item.size != null ? formatSize(item.size) : '-'}</span>
                            {item.created_at ? <span>{formatDateTime(item.created_at)}</span> : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.artifact_id ? (
                              <button
                                type="button"
                                onClick={() => void handlePreviewReportOutput(item)}
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                预览
                              </button>
                            ) : null}
                            {item.preview_url ? (
                              <a
                                href={item.preview_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                原始
                              </a>
                            ) : null}
                            {item.download_url ? (
                              <a
                                href={item.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                下载
                              </a>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {selectedTask.pipeline_mode === 'custom_graph' ? (
                  <div className="mt-6 rounded-2xl border border-theme-border bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">AgentFlow Graph</div>
                        <h3 className="mt-1 text-sm font-semibold text-slate-950">节点拓扑、状态与节点输出入口</h3>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-theme-text-muted">
                        <span>{taskGraphNodeViews.length} 个节点</span>
                        {graphManifestLoading ? <span>正在同步运行时图...</span> : null}
                        {graphManifest?.pipeline?.working_dir ? <span className="font-mono">{shortPath(graphManifest.pipeline.working_dir)}</span> : null}
                      </div>
                    </div>

                    {taskGraphNodeViews.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-muted">
                        {graphManifestError || '当前任务还没有可视化的运行时节点信息。任务启动后会根据 AgentFlow pipeline 自动展示。'}
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
                          <div className="h-[440px] bg-theme-elevated">
                            <ReactFlow
                              nodes={taskGraphFlow.nodes}
                              edges={taskGraphFlow.edges}
                              nodeTypes={taskGraphNodeTypes}
                              onNodeClick={(_, node) => focusStageArtifacts(node.id as StageName, 'trace.jsonl')}
                              fitView
                              nodesDraggable={false}
                              nodesConnectable={false}
                              elementsSelectable
                              panOnDrag
                              zoomOnScroll
                            >
                              <Background color="#e2e8f0" gap={18} />
                              <Controls showInteractive={false} />
                            </ReactFlow>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                          {selectedGraphNode ? (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-950">{selectedGraphNode.label}</div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{selectedGraphNode.id}</div>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${graphNodeBadgeTone(selectedGraphNode.status)}`}>
                                  {formatStageStatus(selectedGraphNode.status)}
                                </span>
                              </div>

                              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-theme-text-secondary">
                                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                  Agent
                                  <div className="mt-1 break-all font-mono text-sm text-theme-text-primary">{selectedGraphNode.agent || '-'}</div>
                                </div>
                                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                  Return Code
                                  <div className="mt-1 break-all font-mono text-sm text-theme-text-primary">{selectedGraphNode.returnCode ?? '-'}</div>
                                </div>
                                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                  Depends On
                                  <div className="mt-1 break-all font-mono text-sm text-theme-text-primary">{selectedGraphNode.dependsOn.length > 0 ? selectedGraphNode.dependsOn.join(', ') : '-'}</div>
                                </div>
                                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                  Model
                                  <div className="mt-1 break-all font-mono text-sm text-theme-text-primary">{selectedGraphNode.model || currentModelName || '(default)'}</div>
                                </div>
                              </div>

                              {selectedGraphNode.message ? (
                                <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-sm font-medium leading-6 text-theme-text-secondary">
                                  {selectedGraphNode.message}
                                </div>
                              ) : null}

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => focusStageArtifacts(selectedGraphNode.id, 'trace.jsonl')}
                                  className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                                >
                                  打开 trace.jsonl
                                </button>
                                <button
                                  type="button"
                                  onClick={() => focusStageArtifacts(selectedGraphNode.id, 'last-message.md')}
                                  className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                                >
                                  打开 last-message
                                </button>
                                <button
                                  type="button"
                                  onClick={() => focusStageArtifacts(selectedGraphNode.id, 'prompt.txt')}
                                  className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                                >
                                  打开 prompt
                                </button>
                              </div>

                              <div className="mt-4 space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Node Outputs</div>
                                {selectedGraphNode.reports.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-3 text-xs font-semibold text-theme-text-muted">
                                    当前节点没有声明 report output。
                                  </div>
                                ) : (
                                  selectedGraphNode.reports.map((item) => (
                                    <div key={item.output_id} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-bold text-theme-text-primary">{item.title}</div>
                                          <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.path}</div>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${item.exists ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400'}`}>
                                          {item.exists ? 'Ready' : 'Missing'}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-sm font-semibold text-theme-text-muted">
                              选择一个节点后，这里会显示节点状态、依赖和输出入口。
                            </div>
                          )}

                          {graphManifestError && !selectedGraphNode ? (
                            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-3 text-xs font-semibold text-amber-400">
                              {graphManifestError}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {currentStageNames.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-sm font-semibold text-theme-text-muted">
                      当前还没有可展示的阶段摘要。
                    </div>
                  ) : currentStageNames.map((stageName) => {
                    const stageRun = currentAttempt?.stage_runs.find((item) => item.stage_name === stageName) || null;
                    return (
                      <div key={stageName} className="rounded-2xl border border-theme-border bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-theme-text-primary">{formatStageLabel(stageName)}</div>
                            <div className="mt-1 text-xs font-medium text-theme-text-muted">
                              {stageRun?.started_at ?`开始于 ${formatDateTime(stageRun.started_at)}` : '尚未开始'}
                            </div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(stageRun?.status)}`}>
                            {formatStageStatus(stageRun?.status)}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-theme-text-secondary">
                          <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                            返回码
                            <div className="mt-1 font-mono text-sm text-theme-text-primary">{stageRun?.return_code ?? '-'}</div>
                          </div>
                          <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                            会话文件
                            <div className="mt-1 font-mono text-sm text-theme-text-primary">{(stageSessions[stageName] || []).length}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-xl border border-theme-border bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Session Explorer</div>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">动态图阶段会话与日志</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentStageNames.map((stageName) => (
                        <button
                          key={stageName}
                          type="button"
                          onClick={() => focusStageArtifacts(stageName)}
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${selectedStage === stageName ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'}`}
                        >
                          {formatStageLabel(stageName)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {currentStageNames.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-sm font-semibold text-theme-text-muted">
                      当前尝试还没有可枚举的阶段或节点，任务运行后会自动展示。
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-theme-border bg-theme-surface p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">尝试</div>
                        <select
                          value={selectedAttemptId}
                          onChange={(event) => setSelectedAttemptId(event.target.value)}
                          className="form-select mt-2 w-full"
                        >
                          {attempts.map((item) => (
                            <option key={item.attempt_id} value={item.attempt_id}>
                              Attempt {item.attempt_no} · {formatTaskStatus(item.status)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-2xl border border-theme-border bg-theme-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">会话文件</div>
                          {resourcesLoading ? <Loader2 size={14} className="animate-spin text-theme-text-muted" /> : null}
                        </div>
                        <div className="mt-3 max-h-[480px] space-y-2 overflow-auto pr-1">
                          {selectedStageSessions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-4 text-xs font-semibold text-theme-text-muted">
                              当前阶段还没有会话文件。
                            </div>
                          ) : (
                            selectedStageSessions.map((item) => {
                              const active = item.path === selectedSessionPath;
                              return (
                                <button
                                  key={item.path}
                                  type="button"
                                  onClick={() => setSelectedSessionPath(item.path)}
                                  className={`block w-full rounded-xl border px-3 py-3 text-left transition ${active ? 'border-sky-300 bg-sky-500/15' : 'border-theme-border bg-theme-surface hover:bg-theme-elevated'}`}
                                >
                                  <div className="truncate text-sm font-bold text-theme-text-primary">{item.display_name}</div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.path}</div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
                                    <span>{formatSize(item.size)}</span>
                                    <span>{formatDateTime(item.created_at)}</span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-h-[520px] overflow-hidden rounded-2xl border border-theme-border bg-slate-900/95">
                      {sessionLoading || taskDetailLoading ? (
                        <div className="flex h-full min-h-[520px] items-center justify-center text-sm font-semibold text-theme-text-faint">
                          <Loader2 size={18} className="mr-2 animate-spin" />
                          正在加载会话内容...
                        </div>
                      ) : !selectedSessionSummary || !sessionFile ? (
                        <div className="flex h-full min-h-[520px] items-center justify-center px-6 text-center text-sm font-semibold text-theme-text-muted">
                          当前没有可展示的会话文件。
                        </div>
                      ) : isJsonlPath(selectedSessionSummary.path) ? (
                        <div className="min-h-[520px] bg-theme-elevated p-4">
                          {sessionWarnings.length > 0 ? (
                            <div className="mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-xs font-semibold text-amber-400">
                              会话中有 {sessionWarnings.length} 行未能按 JSONL 解析，已作为原始输出保留。
                            </div>
                          ) : null}
                          <TaskSessionViewer
                            sessionMeta={selectedSessionMeta}
                            sessionHeader={sessionHeader}
                            events={sessionEvents}
                            loading={false}
                            live={sessionLive}
                            error={sessionError}
                          />
                        </div>
                      ) : (
                        <SessionTextViewer title={selectedSessionSummary.path} content={sessionFile.content} truncated={sessionFile.truncated} />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                      <Server size={16} />
                      阶段日志
                    </div>
                    <div className="mt-3 rounded-2xl border border-theme-border bg-theme-surface p-4 text-theme-text-primary">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-theme-border pb-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">
                          {formatStageLabel(selectedStage)} stdout / log
                        </div>
                        {currentStageRun ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(currentStageRun.status)}`}>
                            {formatStageStatus(currentStageRun.status)}
                          </span>
                        ) : null}
                      </div>
                      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-theme-text-primary">
                        {selectedStageLog?.content || '当前阶段暂无日志输出。'}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-xl border border-theme-border bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                      <Clock3 size={16} />
                      事件流
                    </div>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                      {events.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-sm font-semibold text-theme-text-muted">
                          当前尝试还没有事件记录。
                        </div>
                      ) : (
                        events.map((item) => {
                          const preview = Array.isArray(item.payload?.preview)
                            ? item.payload.preview.join('\n')
                            : typeof item.payload?.preview === 'string'
                              ? item.payload.preview
                              : '';
                          const eventTypes = item.payload?.event_types && typeof item.payload.event_types === 'object'
                            ? Object.entries(item.payload.event_types as Record<string, number>).map(([key, value]) =>`${key}×${value}`).join(' · ')
                            : '';
                          return (
                            <article key={`${item.event_seq}-${item.event_id}`} className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-theme-text-primary">{item.message}</div>
                                  <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{item.event_type}</div>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.level)}`}>
                                  {item.stage_name ?`${formatStageLabel(item.stage_name)} ·` : ''}{item.level}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-theme-text-muted">
                                <span>{formatDateTime(item.created_at)}</span>
                                {item.payload?.session_file_path ? <span className="font-mono">{shortPath(String(item.payload.session_file_path))}</span> : null}
                              </div>
                              {eventTypes ? <div className="mt-3 text-xs font-semibold text-theme-text-muted">{eventTypes}</div> : null}
                              {preview ? (
                                <pre className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-theme-border bg-theme-surface px-3 py-3 font-mono text-[12px] leading-6 text-theme-text-primary">
                                  {preview}
                                </pre>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-theme-border bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                      <Bot size={16} />
                      产物列表
                    </div>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                      {visibleArtifacts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-sm font-semibold text-theme-text-muted">
                          当前尝试还没有可展示产物。
                        </div>
                      ) : (
                        visibleArtifacts.map((item) => (
                          <article key={item.artifact_id} className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-theme-text-primary">{item.display_name}</div>
                                <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.relative_path}</div>
                              </div>
                              <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-theme-text-secondary">
                                {item.artifact_kind}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-theme-text-muted">
                              <span>{formatStageLabel(item.stage_name)}</span>
                              <span>{formatSize(item.size)}</span>
                              <span>{formatDateTime(item.created_at)}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handlePreviewArtifact(item)}
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                预览
                              </button>
                              <a
                                href={item.preview_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                原始
                              </a>
                              <a
                                href={item.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                              >
                                下载
                              </a>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        )}
      </div>
      {createModalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => !creating && setCreateModalOpen(false)}>
          <div
 className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-theme-border bg-theme-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 border-b border-theme-border px-5 py-4">
              <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Create Task</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">新建 IPC 扫描任务</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XCircle size={16} />
                关闭
              </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">工作区</div>
                    <select
                      value={workspaceId}
                      onChange={(event) => setWorkspaceId(event.target.value)}
                      className="form-select w-full"
                    >
                      {workspaces.map((item) => (
                        <option key={item.workspace_id} value={item.workspace_id}>
                          {item.display_name} ({item.workspace_id})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">项目路径列表</div>
                        <div className="mt-1 text-xs font-medium text-theme-text-muted">
                          预设项目和自定义路径统一在这里多选，提交后每个路径创建一个任务。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSelectVisibleProjectPaths}
                          disabled={filteredProjectInputItems.length === 0}
                          className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          全选当前
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSelectedProjectPaths}
                          disabled={selectedProjectItems.length === 0}
                          className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          清空选择
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 md:flex-row">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5">
                        <Search size={16} className="text-theme-text-muted" />
                        <input
                          value={presetKeyword}
                          onChange={(event) => setPresetKeyword(event.target.value)}
                          placeholder="筛选项目名称、路径或来源"
                          className="w-full bg-transparent text-sm font-semibold text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshCatalog}
                        disabled={refreshingCatalog || !workspaceId}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {refreshingCatalog ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        刷新预设列表
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 md:flex-row">
                      <input
                        value={customPath}
                        onChange={(event) => setCustomPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddCustomProjectPath();
                          }
                        }}
                        disabled={!canCreateCustomProject}
                        placeholder="添加自定义路径，例如 foundation/multimedia/media_library"
                        className="min-w-0 flex-1 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-theme-elevated disabled:text-theme-text-muted"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomProjectPath}
                        disabled={!canCreateCustomProject || !customPath.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-theme-elevated px-3 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus size={15} />
                        添加路径
                      </button>
                    </div>
                    {!canCreateCustomProject ? (
                      <div className="mt-2 text-xs font-semibold text-amber-400">当前工作区不允许添加自定义路径。</div>
                    ) : null}

                    {refreshJob ? (
                      <div className="mt-3 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-semibold text-theme-text-secondary">
                        目录刷新任务：{refreshJob.status}
                        {refreshJob.discovered_count != null ?` · 发现 ${refreshJob.discovered_count} 个项目` : ''}
                        {refreshJob.error_message ?` · ${refreshJob.error_message}` : ''}
                      </div>
                    ) : null}

                    <div className="mt-3 max-h-[410px] space-y-2 overflow-auto pr-1">
                      {projectListLoading ? (
                        <div className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                          <Loader2 size={16} className="animate-spin" />
                          正在加载项目列表...
                        </div>
                      ) : !serviceReady ? (
                        <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm font-semibold text-theme-text-muted">
                          等待服务就绪后加载项目路径列表。
                        </div>
                      ) : projectInputItems.length > 0 && filteredProjectInputItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm font-semibold text-theme-text-muted">
                          当前筛选条件下没有匹配路径。清空搜索关键字后可查看全部 {projectInputItems.length} 个可选路径。
                        </div>
                      ) : filteredProjectInputItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm font-semibold text-theme-text-muted">
                          当前没有可选路径，可刷新预设列表或添加自定义路径。
                        </div>
                      ) : (
                        filteredProjectInputItems.map((item) => {
                          const active = selectedProjectPaths.includes(item.path);
                          return (
                            <div
                              key={`${item.source}:${item.path}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleToggleProjectPath(item.path)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleToggleProjectPath(item.path);
                                }
                              }}
 className={`block w-full rounded-lg border px-4 py-3 text-left transition ${active ? 'border-sky-500 bg-sky-500/15 ring-2 ring-sky-100' : 'border-theme-border bg-theme-elevated hover:border-theme-border hover:bg-theme-elevated'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-theme-text-primary">{item.displayName}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${item.source === 'preset' ? 'border-blue-500/20 bg-blue-500/15 text-blue-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary'}`}>
                                      {item.source === 'preset' ? '预设' : '自定义'}
                                    </span>
                                  </div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.path}</div>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-sky-500/20 bg-theme-elevated text-sky-400' : 'border-theme-border bg-theme-elevated text-theme-text-muted'}`}>
                                  {active ? <CheckCircle2 size={13} /> : null}
                                  {active ? '已选择' : '未选择'}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.preset?.has_idl ? <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">IDL</span> : null}
                                {item.preset?.has_on_remote_request_cpp ? <span className="rounded-full border border-blue-500/20 bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-400">OnRemoteRequest</span> : null}
                                {item.source === 'custom' ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveCustomProjectPath(item.path);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleRemoveCustomProjectPath(item.path);
                                      }
                                    }}
                                    className="rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400"
                                  >
                                    移除
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">任务标题 / 批量标题前缀</div>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={selectedProjectItems.length === 1 ? buildDefaultTitle(selectedProjectItems[0].path, selectedProjectItems[0].displayName) : '留空则每个路径自动生成标题'}
                      className="form-input w-full"
                    />
                    <div className="mt-2 text-xs font-medium text-theme-text-muted">单选时作为任务标题；多选时作为标题前缀并自动追加项目名。</div>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Model</div>
                    <input
                      value={modelName}
                      onChange={(event) => setModelName(event.target.value)}
                      placeholder="留空则使用 CLI / Provider 默认模型"
                      className="form-input w-full"
                    />
                  </label>
                  <div className="text-xs font-medium text-theme-text-muted">{modelHintForExecutor(executorMode, providerFallbackModel || null)}</div>

                  <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <button
                        type="button"
                        onClick={() => setCustomGraphExpanded((current) => !current)}
                        aria-expanded={customGraphExpanded}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-elevated text-theme-text-secondary">
                          {customGraphExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">自定义 AgentFlow 图</span>
                          <span className="mt-1 block text-xs font-medium leading-6 text-theme-text-muted">
                            默认使用内置图配置创建任务；需要调整 Graph、模板或报告输出时点击展开。
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-secondary">
                          {graphSourceType === 'inline_json' ? 'Inline JSON' :`Python · ${builderSourceMode === 'entry' ? 'Entry' : 'Code'}`}
                        </span>
                        <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-secondary">
                          {customGraphNodeIds.length} Nodes
                        </span>
                        <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-secondary">
                          {reportOutputDrafts.length} Outputs
                        </span>
                      </div>
                    </div>
                  </div>

                  {customGraphExpanded ? (
                    <>
                  <div ref={graphDefinitionCardRef} className="rounded-lg border border-sky-500/20 bg-sky-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">图定义 / AgentFlow Graph</div>
                        <div className="mt-1 text-xs font-medium leading-6 text-sky-400">
                          这里就是实际输入区。可以直接粘贴 AgentFlow JSON，或者切到`python_builder` 输入 Python 代码 / 入口路径。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-sky-500/20 bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">
                          {customGraphNodeIds.length} Nodes
                        </span>
                        <span className="rounded-full border border-sky-500/20 bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">
                          {reportOutputDrafts.length} Outputs
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-400">Graph Source</div>
                        <select
                          value={graphSourceType}
                          onChange={(event) => {
                            const nextType = event.target.value as GraphSourceType;
                            setGraphSourceType(nextType);
                            if (nextType === 'python_builder' && builderSourceMode !== 'code' && !pythonBuilderEntry.trim()) {
                              setBuilderSourceMode('code');
                            }
                          }}
className="form-input w-full"
                        >
                          <option value="inline_json">inline_json</option>
                          <option value="python_builder">python_builder</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 rounded-lg border border-sky-500/20 bg-theme-elevated px-3 py-2 text-xs font-medium leading-6 text-theme-text-secondary">
                      <div>这里填写的是原始 AgentFlow 图定义。chimera 只会预渲染`[[ ... ]]`，然后把剩余内容原样交给 AgentFlow。</div>
                      <div className="mt-2">提交前由 chimera 渲染：`[[ task.repo_root ]]`、`[[ task.project_path ]]`、`[[ task.attempt_root ]]`、`[[ task.report_outputs["audit_report"].absolute_path ]]`、`[[ task.poc_runtime.hdc_bin ]]`、`[[ task.poc_runtime.helper_bin ]]`。</div>
                      <div className="mt-2">
                        运行时由 AgentFlow 自己渲染：
                        <code className="mx-1 rounded bg-theme-elevated px-1.5 py-0.5 text-[11px] text-theme-text-secondary">{'{{ nodes.audit.output }}'}</code>
                        <code className="mr-1 rounded bg-theme-elevated px-1.5 py-0.5 text-[11px] text-theme-text-secondary">{'{{ item.output }}'}</code>
                        <code className="rounded bg-theme-elevated px-1.5 py-0.5 text-[11px] text-theme-text-secondary">{'{{ fanouts.audit.nodes }}'}</code>
                      </div>
                      <div className="mt-2 text-amber-400">如果图里还残留未渲染的`[[ ... ]]`，校验和实际执行都会直接拦截，不会把它传给 AgentFlow。</div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {graphSourceType === 'inline_json' ? (
                        <button
                          type="button"
                          onClick={() => void handleValidateInlineGraph()}
                          disabled={validatingGraph}
                          className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {validatingGraph ? '校验中...' : '校验 JSON'}
                        </button>
                      ) : null}
                      {graphSourceType === 'python_builder' && builderSourceMode === 'code' ? (
                        <button
                          type="button"
                          onClick={handleValidatePythonBuilderCode}
                          disabled={validatingGraph}
                          className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {validatingGraph ? '校验中...' : '校验 Python'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => focusGraphEditor('inline_json')}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${graphSourceType === 'inline_json' ? 'border-sky-300 bg-sky-500/15 text-sky-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'}`}
                      >
                        编辑 Graph JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => focusGraphEditor('python_code')}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${graphSourceType === 'python_builder' && builderSourceMode === 'code' ? 'border-sky-300 bg-sky-500/15 text-sky-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'}`}
                      >
                        编辑 Python Code
                      </button>
                    </div>

                    {graphSourceType === 'inline_json' ? (
                      <label className="mt-3 block">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-400">AgentFlow Pipeline JSON</div>
                        <textarea
                          ref={inlineJsonInputRef}
                          value={inlineJsonText}
                          onChange={(event) => setInlineJsonText(event.target.value)}
                          rows={16}
                          className="w-full rounded-lg border border-sky-500/20 bg-theme-elevated px-3 py-2.5 font-mono text-xs text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        />
                      </label>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {builderSourceMode === 'entry' ? (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-3 text-xs font-medium leading-6 text-amber-400">
                            当前模板仍在使用遗留的 Python Entry 模式：`{pythonBuilderEntry || '(empty)'}`。创建时会优先使用可见的 Python Code；只有没有代码时才会退回到这个入口脚本。
                          </div>
                        ) : (
                          <label className="block">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-400">Builder Code</div>
                            <textarea
                              ref={pythonBuilderCodeInputRef}
                              value={pythonBuilderCode}
                              onChange={(event) => setPythonBuilderCode(event.target.value)}
                              rows={16}
                              className="w-full rounded-lg border border-sky-500/20 bg-theme-elevated px-3 py-2.5 font-mono text-xs text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                      <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Template Storage</div>
                            <div className="mt-1 text-xs font-medium text-theme-text-muted">
                              这里只保存模板名称和描述。AgentFlow JSON / Python 图定义请在上方“图定义 / AgentFlow Graph”区域填写，然后再保存当前模板。
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-theme-text-muted">
                            {templatesLoading ? '模板同步中...' :`${graphTemplates.length} 个服务端模板`}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <input
                            value={templateName}
                            onChange={(event) => setTemplateName(event.target.value)}
                            placeholder="模板名称，例如 4-stage-ipc-audit"
                            className="form-select"
                          />
                          <select
                            value={selectedTemplateId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              setSelectedTemplateId(nextId);
                              const target = graphTemplates.find((item) => item.templateId === nextId) || null;
                              if (target) {
                                setTemplateName(target.name);
                                setTemplateDescription(target.description || '');
                              }
                            }}
                            className="form-select"
                          >
                            <option value="">选择已保存模板...</option>
                            {graphTemplates.map((item) => (
                              <option key={item.templateId} value={item.templateId}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          value={templateDescription}
                          onChange={(event) => setTemplateDescription(event.target.value)}
                          placeholder="模板描述，可选，仅作为备注"
                          className="mt-3 w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleSaveTemplate}
                            disabled={templatesLoading}
                            className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            保存当前模板
                          </button>
                          <button
                            type="button"
                            onClick={handleLoadTemplate}
                            disabled={!selectedTemplateId || templatesLoading}
                            className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            加载模板
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTemplate()}
                            disabled={!selectedTemplateId || templatesLoading}
                            className="rounded-lg border border-rose-500/20 bg-theme-elevated px-3 py-2 text-xs font-bold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            删除模板
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Report Outputs</div>
                            <div className="mt-1 text-xs font-medium text-theme-text-muted">
                              这里定义任务结束后需要回收和渲染的报告文件。4 节点可以定义 4 份，5 节点可以定义 5 份。
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleResetReportOutputs}
                              className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                            >
                              恢复默认
                            </button>
                            <span className="inline-flex items-center rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-semibold text-theme-text-muted">
                              节点从图 JSON 或输出配置自动推导
                            </span>
                            <button
                              type="button"
                              onClick={handleAddReportOutput}
                              className="rounded-lg bg-theme-elevated px-3 py-1.5 text-xs font-bold text-white transition hover:bg-theme-elevated"
                            >
                              新增输出
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-3">
                          {reportOutputDrafts.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-4 text-sm font-semibold text-theme-text-muted">
                              当前没有自定义输出。提交时会按当前图节点生成默认输出。
                            </div>
                          ) : (
                            reportOutputDrafts.map((item, index) => (
                              <div key={item.key} className="rounded-lg border border-theme-border bg-theme-elevated p-3">
                                <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Output ID</div>
                                    <input value={item.outputId} onChange={(event) => handleUpdateReportOutput(item.key, 'outputId', event.target.value)} className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                  </label>
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Node ID</div>
                                    <input value={item.nodeId} onChange={(event) => handleUpdateReportOutput(item.key, 'nodeId', event.target.value)} className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                  </label>
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Title</div>
                                    <input value={item.title} onChange={(event) => handleUpdateReportOutput(item.key, 'title', event.target.value)} className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                  </label>
                                </div>
                                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_140px_120px_auto]">
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Path</div>
                                    <input value={item.path} onChange={(event) => handleUpdateReportOutput(item.key, 'path', event.target.value)} placeholder="exports/audit-report.md" className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                  </label>
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Format</div>
                                    <select value={item.format} onChange={(event) => handleUpdateReportOutput(item.key, 'format', event.target.value)} className="form-select w-full">
                                      <option value="markdown">Markdown</option>
                                      <option value="text">Text</option>
                                      <option value="json">JSON</option>
                                    </select>
                                  </label>
                                  <label className="block">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Order</div>
                                    <input value={item.order} onChange={(event) => handleUpdateReportOutput(item.key, 'order', event.target.value)} className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                  </label>
                                  <div className="flex items-end justify-between gap-3">
                                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
                                      <input type="checkbox" checked={item.required} onChange={(event) => handleUpdateReportOutput(item.key, 'required', event.target.checked)} className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-theme-border" />
                                      required
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveReportOutput(item.key)}
                                      className="rounded-lg border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-400 transition hover:bg-rose-500/15"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 text-[11px] font-medium text-theme-text-muted">
                                  输出 #{index + 1} 会在任务结束时按该路径回收，并直接映射到前端报告卡片。
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">LLM Provider</div>
                        <div className="mt-1 text-xs font-medium text-theme-text-muted">
                          每个任务最多绑定一个 Provider；不选时 chimera 不会注入任何 Provider 环境变量、配置文件或模型。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshProviders}
                        disabled={providerPanelLoading || !serviceReady}
                        className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {providerPanelLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        刷新 Provider
                      </button>
                    </div>

                    <div className="mt-3">
                      <select
                        value={selectedProviderKey}
                        onChange={(event) => setSelectedProviderKey(event.target.value)}
                        disabled={providerPanelLoading || providerOptions.length === 0}
                        className="form-select w-full disabled:cursor-not-allowed disabled:bg-theme-elevated disabled:text-theme-text-muted"
                      >
                        <option value="">{providerPanelLoading ? '正在加载 Provider...' : '选择 Provider...'}</option>
                        {providerOptions.map((provider) => (
                          <option key={provider.provider_key} value={provider.provider_key} disabled={!provider.enabled}>
                            {provider.display_name || provider.provider_key} · {provider.provider_type} · {provider.model || 'no-model'}{provider.is_default ? ' · 默认' : ''}{!provider.enabled ? ' · 已禁用' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-2 text-xs font-medium text-theme-text-muted">
                      这里不会自动回填默认 Provider。只有显式选中后才会注入 Provider；Model 留空时，仅在已选 Provider 的情况下才回退到该 Provider 的模型。
                    </div>
                    {providerLoadError ? (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-400">
                        Provider 列表加载失败：{providerLoadError}
                      </div>
                    ) : null}
                    {providerPanelLoading ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-semibold text-theme-text-muted">
                        <Loader2 size={14} className="animate-spin" />
                        正在同步 Provider 列表...
                      </div>
                    ) : null}

                    <div className="mt-3 max-h-[260px] space-y-2 overflow-auto pr-1">
                      {!serviceReady ? (
                        <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-4 text-sm font-semibold text-theme-text-muted">
                          等待服务就绪后加载 Provider。
                        </div>
                      ) : !selectedProvider ? (
                        <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-4 text-sm font-semibold text-theme-text-muted">
                          当前未选择 Provider。chimera 不会注入任何 provider env/file/model，AgentFlow 或 OpenCode 将按自身默认行为执行。
                        </div>
                      ) : (
                        <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold text-theme-text-primary">{selectedProvider.display_name || selectedProvider.provider_key}</span>
                                {selectedProvider.is_default ? (
                                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                                    默认
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{selectedProvider.provider_key}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
                                <span>{selectedProvider.provider_type || '-'}</span>
                                <span>{selectedProvider.model || 'no-model'}</span>
                                <span>{selectedProvider.mapped_env_keys?.length || 0} env</span>
                                <span>{selectedProvider.mapped_file_paths?.length || 0} file</span>
                              </div>
                            </div>
                          </div>
                          {(selectedProvider.mapped_env_keys?.length || 0) > 0 || (selectedProvider.mapped_file_paths?.length || 0) > 0 ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <div className="rounded-lg bg-theme-elevated px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Mapped Env Keys</div>
                                <div className="mt-1 break-all text-xs font-semibold text-theme-text-secondary">
                                  {selectedProvider.mapped_env_keys?.join(', ') || '-'}
                                </div>
                              </div>
                              <div className="rounded-lg bg-theme-elevated px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Mapped File Paths</div>
                                <div className="mt-1 break-all text-xs font-semibold text-theme-text-secondary">
                                  {selectedProvider.mapped_file_paths?.join(', ') || '-'}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-theme-border bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Create Summary</div>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950">当前输入配置</h3>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">已选路径</div>
                        <div className="mt-2 font-semibold text-theme-text-primary">{selectedProjectItems.length} 个任务</div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">目标路径</div>
                        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
                          {selectedProjectItems.length === 0 ? (
                            <div className="text-xs font-semibold text-theme-text-muted">尚未选择路径</div>
                          ) : (
                            selectedProjectItems.map((item) => (
                              <div key={item.path} className="rounded-lg bg-theme-elevated px-3 py-2">
                                <div className="font-mono text-xs text-theme-text-secondary break-all">{item.path}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
                                  {item.source === 'preset' ? '预设项目' : '自定义路径'}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Model</div>
                        <div className="mt-2 break-all font-mono text-xs text-theme-text-secondary">{modelName.trim() || providerFallbackModel || '(default)'}</div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Provider</div>
                        <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                          {!selectedProvider ? (
                            <div className="text-xs font-semibold text-theme-text-muted">尚未选择 Provider</div>
                          ) : (
                            <div className="rounded-lg bg-theme-elevated px-3 py-2">
                              <div className="text-xs font-semibold text-theme-text-primary">{selectedProvider.display_name || selectedProvider.provider_key}</div>
                              <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{selectedProvider.provider_key}</div>
                              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
                                {selectedProvider.provider_type} · {selectedProvider.model || 'no-model'} · {selectedProvider.mapped_env_keys.length} env · {selectedProvider.mapped_file_paths.length} file
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">报告输出</div>
                        <div className="mt-2 font-semibold text-theme-text-primary">{reportOutputDrafts.length} 个</div>
                        <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                          {reportOutputDrafts.length === 0 ? (
                            <div className="text-xs font-semibold text-theme-text-muted">未自定义，提交后按当前图节点生成默认输出。</div>
                          ) : (
                            reportOutputDrafts.map((item) => (
                              <div key={item.key} className="rounded-lg bg-theme-elevated px-3 py-2">
                                <div className="text-xs font-semibold text-theme-text-primary">{item.title || item.outputId || '(untitled)'}</div>
                                <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{item.path || '-'}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-theme-text-muted">
                                  {item.nodeId || '-'} · {formatReportFormat(item.format)} · {item.required ? 'required' : 'optional'}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Graph Source</div>
                        <div className="mt-2 font-semibold text-theme-text-primary">{graphSourceType === 'inline_json' ? 'Inline JSON' :`Python Builder · ${builderSourceMode === 'entry' ? 'Entry' : 'Code'}`}</div>
                        <div className="mt-2 max-h-32 space-y-2 overflow-auto">
                          {customGraphNodeIds.length === 0 ? (
                            <div className="text-xs font-semibold text-theme-text-muted">当前没有可推导的节点；可直接在图 JSON 中写`nodes[].id`，或在`report_outputs` 里填写`node_id`。</div>
                          ) : (
                            customGraphNodeIds.map((nodeId) => (
                              <div key={nodeId} className="rounded-lg bg-theme-elevated px-3 py-2 text-[11px] font-bold text-theme-text-secondary">
                                {nodeId}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">说明</div>
                        <div className="mt-2 text-sm font-medium leading-6 text-theme-text-secondary">
                          批量创建时每个路径对应一个独立任务。输入路径保持固定，执行图和输出报告都由本页配置驱动；前端只按`report_outputs` 回收和展示文件。
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-theme-border bg-slate-50/90 px-5 py-4">
              <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateTask}
                disabled={creating || !workspaceId || selectedProjectItems.length === 0 || !supportsAgentflowExecutor}
                className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                创建{selectedProjectItems.length > 0 ?` ${selectedProjectItems.length}` : ''}个任务
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {previewArtifact ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
 <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
            <div className="shrink-0 border-b border-theme-border bg-theme-elevated px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-400">
                      {previewArtifact.artifact_kind}
                    </span>
                    <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-theme-text-muted">
                      {formatStageLabel(previewArtifact.stage_name)}
                    </span>
                    {previewArtifactContent?.truncated ? (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">
                        已截断
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 truncate text-lg font-semibold text-slate-950">{previewArtifact.display_name}</h3>
                  <div className="mt-1 break-all font-mono text-xs text-theme-text-muted">{previewArtifact.relative_path}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-theme-text-muted">
                    <span>{formatSize(previewArtifact.size)}</span>
                    <span>{previewArtifactContent?.content_type || previewArtifact.content_type}</span>
                    <span>{formatDateTime(previewArtifact.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={previewArtifact.preview_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                  >
                    打开原始
                  </a>
                  <a
                    href={previewArtifact.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
                  >
                    下载
                  </a>
                  <button
                    type="button"
                    onClick={handleCloseArtifactPreview}
                    className="inline-flex items-center gap-1 rounded-lg bg-theme-elevated px-3 py-2 text-xs font-bold text-white transition hover:bg-theme-elevated"
                  >
                    <XCircle size={14} />
                    关闭
                  </button>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {previewArtifactLoading ? (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-theme-border bg-theme-surface text-sm font-semibold text-theme-text-muted">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  正在加载产物预览...
                </div>
              ) : previewArtifactError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
                  {previewArtifactError}
                </div>
              ) : previewArtifactContent ? (
                <ArtifactPreviewBody artifact={previewArtifact} content={previewArtifactContent} />
              ) : (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm font-semibold text-theme-text-muted">
                  当前产物没有可预览内容。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {feedbackNodes}
    </div>
  );
};
