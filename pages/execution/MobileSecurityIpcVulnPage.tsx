import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Loader2, Plus, RefreshCw, RotateCcw, Search, Server, SquareTerminal, Trash2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import {
  IpcAuditArtifact,
  IpcAuditArtifactContent,
  IpcAuditAttemptDetail,
  IpcAuditCapability,
  IpcAuditCatalogRefreshJob,
  IpcAuditEvent,
  IpcAuditPresetProject,
  IpcAuditProviderSummary,
  IpcAuditRuntimeConfig,
  IpcAuditStageLog,
  IpcAuditStageSessionFile,
  IpcAuditStageSessionSummary,
  IpcAuditTaskDetail,
  IpcAuditTaskSummary,
  IpcAuditWorkspaceSummary,
} from '../../clients/ipcAudit';
import { AppSaSessionEvent, AppSaSessionMeta, AppSaSessionSnapshot } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { AgentSessionViewer } from './AgentSessionViewer';

type StageName = 'audit' | 'poc';
type ExecutorMode = 'mock' | 'codex_cli' | 'opencode_cli';
type ProjectInputKind = 'preset_project' | 'custom_project';

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

type SessionDeltaParseResult = {
  sessionMeta: Record<string, any> | null;
  events: AppSaSessionEvent[];
  warnings: string[];
  lineCount: number;
};

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancel_requested']);
const CANCELLABLE_TASK_STATUSES = new Set(['queued', 'running']);
const STAGE_NAMES: StageName[] = ['audit', 'poc'];
const HIDDEN_READY_CHECK_KEYS = new Set(['executor_config:opencode_cli']);
const SESSION_THINKING_LEVEL_MAP: Record<string, string> = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  'x-high': 'xhigh',
};

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
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'partial_success':
    case 'needs_attention':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'cancelled':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    case 'cancel_requested':
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'queued':
    case 'pending':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'skipped':
      return 'border-slate-200 bg-slate-50 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

const formatTaskStatus = (status?: string | null) => TASK_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');
const formatStageStatus = (status?: string | null) => STAGE_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');
const isActiveTaskStatus = (status?: string | null) => ACTIVE_TASK_STATUSES.has(String(status || '').toLowerCase());
const isCancellableTaskStatus = (status?: string | null) => CANCELLABLE_TASK_STATUSES.has(String(status || '').toLowerCase());
const isCompletedTaskStatus = (status?: string | null) => ['succeeded', 'partial_success'].includes(String(status || '').toLowerCase());
const formatStageLabel = (stage?: string | null) => {
  if (!stage) return '-';
  return stage === 'poc' ? 'PoC' : 'Audit';
};
const formatInputKind = (kind?: string | null) => {
  if (kind === 'preset_project') return '预设项目';
  if (kind === 'custom_project') return '自定义路径';
  if (kind === 'existing_audit_report') return '已有审计报告';
  return kind || '-';
};
const formatExecutorMode = (mode?: string | null) => {
  if (mode === 'codex_cli') return 'Codex';
  if (mode === 'opencode_cli') return 'OpenCode';
  if (mode === 'mock') return 'Mock';
  return mode || '-';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatSize = (value?: number | null) => {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
};

const fileNameOf = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized;
};

const isJsonlPath = (path?: string | null) => fileNameOf(path).toLowerCase().endsWith('.jsonl');

const isMarkdownArtifact = (artifact?: IpcAuditArtifact | null, contentType?: string | null) => {
  const name = `${artifact?.display_name || ''} ${artifact?.relative_path || ''}`.toLowerCase();
  return String(contentType || artifact?.content_type || '').toLowerCase().includes('markdown')
    || name.endsWith('.md')
    || name.endsWith('.markdown');
};

const isJsonArtifact = (artifact?: IpcAuditArtifact | null, contentType?: string | null) => {
  const name = `${artifact?.display_name || ''} ${artifact?.relative_path || ''}`.toLowerCase();
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
  const name = `${artifact.display_name || ''} ${artifact.relative_path || ''}`.toLowerCase();
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

const shortPath = (value?: string | null) => {
  if (!value) return '-';
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 4 ? `.../${parts.slice(-4).join('/')}` : value;
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

const normalizeReadyState = (value: { status?: string | null; ready?: boolean | null; checks?: Record<string, boolean> | null }): IpcAuditReadyState => ({
  status: value.status || 'unknown',
  ready: Boolean(value.ready),
  checks: value.checks && typeof value.checks === 'object' ? value.checks : {},
});

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

const parseSessionMessageParts = (content: unknown): Array<Record<string, any>> => {
  const parts: Array<Record<string, any>> = [];
  if (typeof content === 'string') {
    parts.push({ type: 'text', text: content });
    return parts;
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const item = content as Record<string, any>;
    const contentType = String(item.type || item.kind || '');
    if (contentType === 'text' || typeof item.text === 'string') {
      parts.push({ type: 'text', text: item.text || '' });
      return parts;
    }
    if (contentType === 'thinking' || typeof item.thinking === 'string') {
      parts.push({ type: 'thinking', text: item.thinking || '' });
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
  }
  if (!Array.isArray(content)) return parts;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const part = item as Record<string, any>;
    const contentType = String(part.type || part.kind || '');
    if (contentType === 'text') {
      parts.push({ type: 'text', text: part.text || '' });
    } else if (contentType === 'thinking') {
      parts.push({ type: 'thinking', text: part.thinking || part.text || '' });
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

const isSilentSessionLifecycleEvent = (obj: Record<string, any>): boolean => {
  const eventType = String(obj.type || '');
  const partType = String(asRecord(obj.part).type || '');
  return eventType === 'step_start'
    || eventType === 'step_finish'
    || partType === 'step-start'
    || partType === 'step-finish';
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

function parseSessionJsonlObject(obj: Record<string, any>, rawLine: string, lineNo: number): {
  sessionMeta?: Record<string, any>;
  events?: AppSaSessionEvent[];
} {
  const eventType = String(obj.type || '');
  const timestamp = normalizeSessionTimestamp(obj.timestamp || obj.time || '');
  if (isSilentSessionLifecycleEvent(obj)) {
    return {};
  }
  if (eventType === 'session') {
    return {
      sessionMeta: {
        id: obj.id || obj.sessionID || obj.session_id || '',
        version: obj.version || '',
        timestamp,
        cwd: obj.cwd || obj.path || '',
      },
    };
  }
  if (eventType === 'model_change') {
    return {
      events: [{
        type: 'model_change',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        provider: obj.provider || '',
        modelId: obj.modelId || obj.model || '',
        raw_line: rawLine,
      }],
    };
  }
  if (eventType === 'thinking_level_change') {
    const level = String(obj.thinkingLevel || obj.thinking_level || '');
    return {
      events: [{
        type: 'thinking_level_change',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        thinkingLevel: level,
        thinkingLevelClass: `thinking-${SESSION_THINKING_LEVEL_MAP[level.toLowerCase()] || 'off'}`,
        raw_line: rawLine,
      }],
    };
  }
  if (eventType === 'message' || eventType === 'assistant_message' || eventType === 'agent_message') {
    const msg = obj.message && typeof obj.message === 'object' ? obj.message as Record<string, any> : {};
    const content = msg.content ?? obj.content ?? obj.text ?? (typeof obj.message === 'string' ? obj.message : '');
    const parts = parseSessionMessageParts(content);
    const inferredRole = parts.length === 1 && parts[0].type === 'toolResult' ? 'toolResult' : 'assistant';
    const role = String(msg.role || obj.role || inferredRole);
    const event = buildSessionMessageEvent(lineNo, timestamp, role, parts, rawLine);
    if (role === 'toolResult') {
      const resultPart = parts.find((part) => part.type === 'toolResult') || {};
      event.toolCallId = msg.toolCallId || msg.tool_call_id || '';
      event.toolName = msg.toolName || msg.tool_name || resultPart.name || '';
      event.isError = Boolean(msg.isError ?? msg.is_error ?? resultPart.isError ?? false);
    }
    return { events: [event] };
  }
  if (eventType === 'text') {
    const part = asRecord(obj.part);
    const text = asString(part.text ?? obj.text ?? obj.content);
    if (!text) return {};
    return { events: [buildSessionMessageEvent(lineNo, timestamp, 'assistant', [{ type: 'text', text }], rawLine)] };
  }
  if (eventType === 'tool_use' || eventType === 'tool_call') {
    const part = asRecord(obj.part);
    const state = asRecord(part.state);
    const metadata = asRecord(state.metadata);
    const toolName = normalizeToolName(part.tool || state.title || obj.tool || obj.name);
    const callId = asString(part.callID || part.callId || part.id || obj.callID || obj.callId || obj.id);
    const input = state.input || part.input || obj.input || obj.arguments || {};
    const output = asString(state.output ?? metadata.output ?? part.output ?? obj.output ?? '');
    const status = asString(state.status || obj.status || '');
    const events = [
      buildSessionMessageEvent(lineNo, timestamp, 'assistant', [{
        type: 'toolCall',
        name: toolName,
        id: callId,
        arguments: input,
      }], rawLine),
    ];
    if (output) {
      events.push(buildSessionMessageEvent(lineNo, timestamp, 'toolResult', [{
        type: 'toolResult',
        name: toolName,
        text: output,
        isError: status === 'error' || status === 'failed',
      }], rawLine, {
        toolCallId: callId,
        toolName,
        isError: status === 'error' || status === 'failed',
      }));
    }
    return { events };
  }
  if (eventType === 'error') {
    const error = asRecord(obj.error);
    const data = asRecord(error.data);
    const message = asString(data.message || error.message || obj.message || 'Agent error');
    return {
      events: [{
        type: 'error',
        line: lineNo,
        event_index: lineNo,
        timestamp,
        display_timestamp: timestamp,
        summary: message,
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
}

function parseSessionJsonlDelta(lines: string[], startLine: number): SessionDeltaParseResult {
  const events: AppSaSessionEvent[] = [];
  const warnings: string[] = [];
  let sessionMeta: Record<string, any> | null = null;
  let lineCount = 0;

  lines.forEach((rawLine, index) => {
    const lineNo = startLine + index;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    lineCount += 1;
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
}

function buildSessionSnapshotFromText(path: string, content: string): AppSaSessionSnapshot {
  const lines = content.split(/\r?\n/);
  const parsed = parseSessionJsonlDelta(lines, 1);
  return {
    path,
    session_meta: parsed.sessionMeta || {},
    events: parsed.events,
    warnings: parsed.warnings,
    line_count: parsed.lineCount,
  };
}

const formatReadyFailure = (checks?: Record<string, boolean>) => {
  const failedChecks = Object.entries(checks || {})
    .filter(([key, ok]) => !ok && !HIDDEN_READY_CHECK_KEYS.has(key))
    .map(([key]) => key);
  return failedChecks.length > 0 ? `失败检查项：${failedChecks.join(', ')}` : '服务未就绪';
};

const defaultStage = (sessions: Record<StageName, IpcAuditStageSessionSummary[]>, attempt?: IpcAuditAttemptDetail | null): StageName => {
  if (sessions.audit.length > 0) return 'audit';
  if (sessions.poc.length > 0) return 'poc';
  const running = attempt?.stage_runs.find((item) => item.status === 'running');
  if (running?.stage_name === 'poc') return 'poc';
  return 'audit';
};

const preferredSession = (items: IpcAuditStageSessionSummary[]) => {
  return (
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
  return `IPC漏洞扫描 · ${subject || '新任务'}`;
};

const buildBatchTaskTitle = (titlePrefix: string, targetCount: number, inputPath: string, displayName?: string | null) => {
  const trimmed = titlePrefix.trim();
  if (!trimmed) return buildDefaultTitle(inputPath, displayName);
  if (targetCount === 1) return trimmed;
  const pathName = fileNameOf(inputPath);
  const suffix = String(displayName || '').trim() || (pathName === '-' ? inputPath : pathName);
  return `${trimmed} · ${suffix}`;
};

const resolvePipelineMode = (capabilities: IpcAuditCapability | null, workspace: IpcAuditWorkspaceSummary | null) => {
  const supported = capabilities?.pipeline_modes || [];
  const preferred = workspace?.default_pipeline_mode || capabilities?.default_pipeline_mode || supported[0] || 'audit_only';
  return supported.includes(preferred) ? preferred : (supported[0] || 'audit_only');
};

const resolveExecutorMode = (capabilities: IpcAuditCapability | null) => {
  const supported = capabilities?.executor_modes || [];
  const preferred = supported.includes('opencode_cli')
    ? 'opencode_cli'
    : capabilities?.default_executor_mode && capabilities.default_executor_mode !== 'mock'
      ? capabilities.default_executor_mode
      : supported.find((item) => item !== 'mock') || supported[0] || 'opencode_cli';
  return supported.includes(preferred) ? preferred : (supported[0] || 'codex_cli');
};

const modelHintForExecutor = (mode?: string | null, providerModel?: string | null) => {
  if (mode === 'opencode_cli') {
    return providerModel
      ? `可留空，自动使用当前 Provider 的模型 ${providerModel}；手填时建议使用 provider/model 形式。`
      : '可留空，自动使用当前 Provider 的模型；手填时建议使用 provider/model 形式。';
  }
  if (mode === 'codex_cli') {
    return providerModel
      ? `可留空，自动使用当前 Provider 的模型 ${providerModel}。`
      : '可留空，自动使用当前 Provider 的模型。';
  }
  return 'Mock 执行器不会真正调用模型，填写后仅记录到任务配置。';
};

const panelClassName = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

const MetricCard: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3">
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
    {sub ? <div className="mt-1 text-xs font-medium text-slate-500">{sub}</div> : null}
  </div>
);

const SessionTextViewer: React.FC<{ title: string; content?: string | null; truncated?: boolean }> = ({ title, content, truncated }) => (
  <div className="h-full overflow-auto rounded-2xl bg-slate-950 p-4 text-slate-100">
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
      <div className="min-w-0">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Session File</div>
        <div className="mt-1 break-all font-mono text-xs text-slate-300">{title}</div>
      </div>
      {truncated ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">已截断</span> : null}
    </div>
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">{content || ''}</pre>
  </div>
);

const ArtifactPreviewBody: React.FC<{ artifact: IpcAuditArtifact; content: IpcAuditArtifactContent }> = ({ artifact, content }) => {
  const formatted = formatPreviewContent(artifact, content);
  if (isMarkdownArtifact(artifact, content.content_type)) {
    return (
      <div className="markdown-body max-w-none break-words rounded-2xl bg-white px-6 py-5 text-sm leading-7 text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {formatted || ' '}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 px-5 py-4 font-mono text-[12px] leading-6 text-slate-100">
      {formatted || ' '}
    </pre>
  );
};

export const MobileSecurityIpcVulnPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.ipcAudit;
  const { notify, confirm, feedbackNodes } = useUiFeedback();

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
  const [defaultProviderKey, setDefaultProviderKey] = useState('');
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [selectedProviderKey, setSelectedProviderKey] = useState('');

  const [selectedProjectPaths, setSelectedProjectPaths] = useState<string[]>([]);
  const [customProjectPaths, setCustomProjectPaths] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState('');
  const [title, setTitle] = useState('');
  const [executorMode, setExecutorMode] = useState<ExecutorMode>('opencode_cli');
  const [modelName, setModelName] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
  const [stageSessions, setStageSessions] = useState<Record<StageName, IpcAuditStageSessionSummary[]>>({ audit: [], poc: [] });
  const [stageLogs, setStageLogs] = useState<Record<StageName, IpcAuditStageLog | null>>({ audit: null, poc: null });
  const [events, setEvents] = useState<IpcAuditEvent[]>([]);
  const [artifacts, setArtifacts] = useState<IpcAuditArtifact[]>([]);
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

  const [selectedStage, setSelectedStage] = useState<StageName>('audit');
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

  const [creating, setCreating] = useState(false);
  const [actingTask, setActingTask] = useState(false);
  const [batchActingTasks, setBatchActingTasks] = useState(false);

  const selectedWorkspace = workspaces.find((item) => item.workspace_id === workspaceId) || null;
  const providerOptionMap = new Map<string, IpcAuditProviderSummary>();
  providerOptions.forEach((item) => {
    providerOptionMap.set(item.provider_key, item);
  });
  const selectedProvider = providerOptionMap.get(selectedProviderKey) || null;
  const providerFallbackModel = selectedProvider?.model || '';
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
  const currentExecutorMode = String(currentAttempt?.effective_config?.executor_mode || currentAttempt?.effective_config?.execution_mode || '');
  const currentModelName = String(currentAttempt?.effective_config?.model || '').trim();
  const currentProviderKeys = normalizeProviderKeys(currentAttempt?.effective_config?.provider_keys);
  const currentProviderSnapshotMap = buildProviderSnapshotMap(currentAttempt?.effective_config?.provider_snapshots);
  const visibleArtifacts = artifacts.filter((item) => item.artifact_kind !== 'session_file');
  const auditedResultArtifact = findAuditedResultArtifact(visibleArtifacts);
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
    display_name: `${formatStageLabel(selectedStage)} · ${selectedSessionSummary.display_name || fileNameOf(selectedSessionSummary.path)}`,
    warnings: sessionWarnings,
  } : null;
  const effectiveTaskCount = tasks.length;
  const activeTaskCount = tasks.filter((item) => isActiveTaskStatus(item.status)).length;
  const filteredProjectInputItems = projectInputItems.filter((item) => {
    const keyword = toSearchText(presetKeyword);
    if (!keyword) return true;
    return `${toSearchText(item.displayName)} ${toSearchText(item.path)} ${toSearchText(item.preset?.project_key)} ${toSearchText(item.source)}`.includes(keyword);
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
    return `${toSearchText(item.title)} ${toSearchText(path)} ${toSearchText(item.task_id)} ${toSearchText(formatTaskStatus(item.status))} ${toSearchText(runtimeSummary?.executorMode)} ${toSearchText(runtimeSummary?.model)} ${toSearchText(runtimeSummary?.taskModel)} ${toSearchText(providerSearchText)}`.includes(keyword);
  });
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

  const closeSessionStream = () => {
    if (sessionStreamRef.current) {
      sessionStreamRef.current.close();
      sessionStreamRef.current = null;
    }
    setSessionLive(false);
  };

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
          setDefaultProviderKey('');
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
          setDefaultProviderKey('');
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
        setProvidersLoading(true);
        setProviderLoadError(null);
        try {
          const providerResponse = await executionApi.listProviders();
          if (cancelled) return;
          const items = Array.isArray(providerResponse.items) ? providerResponse.items : [];
          const normalizedDefaultProviderKey = String(providerResponse.default_provider_key || '').trim()
            || items.find((item) => item.is_default)?.provider_key
            || items[0]?.provider_key
            || '';
          setProviderOptions(items);
          setDefaultProviderKey(normalizedDefaultProviderKey);
          setSelectedProviderKey((current) => (
            current && items.some((item) => item.provider_key === current && item.enabled !== false)
              ? current
              : normalizedDefaultProviderKey
          ));
        } catch (error) {
          if (cancelled) return;
          setProviderOptions([]);
          setDefaultProviderKey('');
          setSelectedProviderKey('');
          setProviderLoadError(getErrorMessage(error, '加载 Provider 列表失败'));
        } finally {
          if (!cancelled) setProvidersLoading(false);
        }
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
    const fallbackKey = (
      (defaultProviderKey && availableKeys.has(defaultProviderKey) ? defaultProviderKey : '')
      || providerOptions.find((item) => item.is_default && item.enabled !== false)?.provider_key
      || providerOptions.find((item) => item.enabled !== false)?.provider_key
      || providerOptions.find((item) => item.is_default)?.provider_key
      || providerOptions[0]?.provider_key
      || ''
    );
    setSelectedProviderKey((current) => (current && availableKeys.has(current) ? current : fallbackKey));
  }, [providerOptions, defaultProviderKey]);

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
      setStageSessions({ audit: [], poc: [] });
      setStageLogs({ audit: null, poc: null });
      setEvents([]);
      setArtifacts([]);
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
      const result = await Promise.allSettled([
        executionApi.listEvents(selectedTaskId, { attemptId: selectedAttemptId, limit: 200 }),
        executionApi.listArtifacts(selectedTaskId, selectedAttemptId),
        executionApi.listStageSessions(selectedTaskId, selectedAttemptId, 'audit'),
        executionApi.listStageSessions(selectedTaskId, selectedAttemptId, 'poc'),
        executionApi.getStageLog(selectedTaskId, selectedAttemptId, 'audit', { lines: 240 }),
        executionApi.getStageLog(selectedTaskId, selectedAttemptId, 'poc', { lines: 240 }),
      ]);
      if (cancelled) return;
      const [eventsResult, artifactsResult, auditSessionsResult, pocSessionsResult, auditLogResult, pocLogResult] = result;

      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value.items || []);
      else setEvents([]);

      if (artifactsResult.status === 'fulfilled') setArtifacts(artifactsResult.value.items || []);
      else setArtifacts([]);

      const nextSessions = {
        audit: auditSessionsResult.status === 'fulfilled' ? auditSessionsResult.value : [],
        poc: pocSessionsResult.status === 'fulfilled' ? pocSessionsResult.value : [],
      };
      setStageSessions(nextSessions);
      setStageLogs({
        audit: auditLogResult.status === 'fulfilled' ? auditLogResult.value : null,
        poc: pocLogResult.status === 'fulfilled' ? pocLogResult.value : null,
      });

      const selectedAttempt = attempts.find((item) => item.attempt_id === selectedAttemptId) || null;
      const nextStage = defaultStage(nextSessions, selectedAttempt);
      setSelectedStage((current) => {
        if (nextSessions[current].length > 0) return current;
        return nextStage;
      });
      setSelectedSessionPath((current) => {
        const currentExists = Object.values(nextSessions).some((items) => items.some((item) => item.path === current));
        if (currentExists) return current;
        return preferredSession(nextSessions[nextStage])?.path || '';
      });

      const firstRejected = result.find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined;
      setDetailError(firstRejected?.reason?.message || null);
      setResourcesLoading(false);
    };
    void loadAttemptResources();
    return () => {
      cancelled = true;
    };
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, attempts]);

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
    const cacheKey = `${selectedTaskId}:${selectedAttemptId}:${selectedStage}:${selectedSessionPath}`;
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
            content: `${current.content || ''}${(current.content || '').endsWith('\n') || !current.content ? '' : '\n'}${lines.join('\n')}\n`,
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
      const result = await Promise.allSettled([
        executionApi.listEvents(selectedTaskId, { attemptId: selectedAttemptId, limit: 200 }),
        executionApi.listArtifacts(selectedTaskId, selectedAttemptId),
        executionApi.listStageSessions(selectedTaskId, selectedAttemptId, 'audit'),
        executionApi.listStageSessions(selectedTaskId, selectedAttemptId, 'poc'),
        executionApi.getStageLog(selectedTaskId, selectedAttemptId, 'audit', { lines: 240 }),
        executionApi.getStageLog(selectedTaskId, selectedAttemptId, 'poc', { lines: 240 }),
      ]);
      const [eventsResult, artifactsResult, auditSessionsResult, pocSessionsResult, auditLogResult, pocLogResult] = result;
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value.items || []);
      if (artifactsResult.status === 'fulfilled') setArtifacts(artifactsResult.value.items || []);
      const nextSessions = {
        audit: auditSessionsResult.status === 'fulfilled' ? auditSessionsResult.value : stageSessions.audit,
        poc: pocSessionsResult.status === 'fulfilled' ? pocSessionsResult.value : stageSessions.poc,
      };
      setStageSessions(nextSessions);
      setStageLogs((current) => ({
        audit: auditLogResult.status === 'fulfilled' ? auditLogResult.value : current.audit,
        poc: pocLogResult.status === 'fulfilled' ? pocLogResult.value : current.poc,
      }));
      setSelectedStage((current) => {
        if (nextSessions[current].length > 0) return current;
        return defaultStage(nextSessions, currentAttempt);
      });
      setSelectedSessionPath((current) => {
        const currentExists = Object.values(nextSessions).some((items) => items.some((item) => item.path === current));
        if (currentExists) return current;
        return preferredSession(nextSessions[defaultStage(nextSessions, currentAttempt)])?.path || current;
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [showTaskDetail, selectedTaskId, selectedAttemptId, isSelectedTaskActive, executionApi, currentAttempt, stageSessions.audit, stageSessions.poc]);

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
      const items = Array.isArray(providerResponse.items) ? providerResponse.items : [];
      const normalizedDefaultProviderKey = String(providerResponse.default_provider_key || '').trim()
        || items.find((item) => item.is_default)?.provider_key
        || items[0]?.provider_key
        || '';
      setProviderOptions(items);
      setDefaultProviderKey(normalizedDefaultProviderKey);
      setSelectedProviderKey((current) => (
        current && items.some((item) => item.provider_key === current && item.enabled !== false)
          ? current
          : normalizedDefaultProviderKey
      ));
      notify(`已同步 ${items.length} 个 Provider`, 'success');
    } catch (error) {
      setProviderOptions([]);
      setDefaultProviderKey('');
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
    if (!normalizedProviderKey) {
      notify('请选择一个 Provider', 'error');
      return;
    }
    const selectedProviderOption = providerOptionMap.get(normalizedProviderKey) || null;
    if (!selectedProviderOption || selectedProviderOption.enabled === false) {
      notify('当前 Provider 不可用，请刷新后重试', 'error');
      return;
    }

    setCreating(true);
    try {
      const createdTasks: IpcAuditTaskSummary[] = [];
      const failedItems: Array<{ path: string; message: string }> = [];
      const pipelineMode = resolvePipelineMode(capabilities, selectedWorkspace) as 'audit_then_poc' | 'audit_only' | 'poc_only';
      const resolvedExecutorMode = executorMode || resolveExecutorMode(capabilities);
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
            pipeline_mode: pipelineMode,
            input_ref: validation.normalized_input_ref,
            executor_mode: resolvedExecutorMode,
            model: modelName.trim() || undefined,
            provider_keys: [normalizedProviderKey],
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
          ? `已创建 ${createdTasks.length} 个任务，${failedItems.length} 个失败`
          : `已创建 ${createdTasks.length} 个任务`,
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
      message: `确认取消任务「${selectedTask.title}」吗？`,
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
      ? `确认从 PoC 阶段重试任务「${selectedTask.title}」吗？`
      : `确认重新执行任务「${selectedTask.title}」吗？`;
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
      message: `确认删除任务「${selectedTask.title}」以及当前产物目录吗？此操作不可撤销。`,
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
      message: `确认重新执行 ${actionableSelectedTasks.length} 个任务吗？${skippedActiveSelectedTaskCount > 0 ? ` ${skippedActiveSelectedTaskCount} 个运行中/取消中的任务会被跳过。` : ''}`,
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
          ? `已重试 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          : `已重试 ${succeededCount} 个任务`,
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
      message: `确认停止 ${cancellableSelectedTasks.length} 个排队中/执行中的任务吗？${skippedNonCancellableSelectedTaskCount > 0 ? ` ${skippedNonCancellableSelectedTaskCount} 个非运行任务会被跳过。` : ''}`,
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
          ? `已停止 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          : `已提交 ${succeededCount} 个任务的停止请求`,
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
      message: `确认删除 ${actionableSelectedTasks.length} 个任务以及对应产物目录吗？此操作不可撤销。${skippedActiveSelectedTaskCount > 0 ? ` ${skippedActiveSelectedTaskCount} 个运行中/取消中的任务会被跳过。` : ''}`,
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
          ? `已删除 ${succeededCount} 个任务，${failedTaskIds.length} 个失败`
          : `已删除 ${succeededCount} 个任务`,
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

  if (bootstrapping) {
    return (
      <div className="flex min-h-[480px] items-center justify-center px-8 pt-8 pb-10">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          <Loader2 size={18} className="animate-spin text-slate-500" />
          正在初始化 IPC 漏洞扫描页面...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-8 pt-8 pb-10">
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">
              <SquareTerminal size={14} />
              Mobile Security
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">IPC漏洞扫描</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              面向 OpenHarmony IPC 服务入口的自动化漏洞扫描，覆盖代码审计、PoC 验证、执行日志和产物追踪。
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-4">
            <MetricCard label="服务状态" value={readyState?.ready ? 'Ready' : readyState?.status || 'Unknown'} sub={capabilities?.service || 'secflow-app-ipc-audit'} />
            <MetricCard label="工作区" value={selectedWorkspace?.display_name || '-'} sub={selectedWorkspace?.workspace_id || '未选择'} />
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">并发上限</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={maxParallelDraft}
                  onChange={(event) => setMaxParallelDraft(event.target.value)}
                  disabled={!readyState?.ready || savingRuntimeConfig}
                  className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-black text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSaveMaxParallelTasks}
                  disabled={!readyState?.ready || savingRuntimeConfig || String(runtimeConfig?.max_parallel_tasks || capabilities?.max_parallel_tasks || '') === maxParallelDraft.trim()}
                  className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingRuntimeConfig ? '保存中' : '保存'}
                </button>
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                当前运行 {runtimeConfig?.active_attempts ?? activeTaskCount} 个，默认 {runtimeConfig?.default_max_parallel_tasks ?? capabilities?.max_parallel_tasks ?? 1}
              </div>
            </div>
            <MetricCard label="PoC 能力" value={selectedWorkspace?.supports_poc ? '开启' : '关闭'} sub={capabilities?.poc_runtime_available ? '运行环境可用' : '运行环境未就绪'} />
          </div>
        </div>
        {readyState ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {Object.entries(readyState.checks || {})
              .filter(([key]) => !HIDDEN_READY_CHECK_KEYS.has(key))
              .map(([key, passed]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
              >
                {passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {key}
              </span>
            ))}
          </div>
        ) : null}
        {overviewError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{overviewError}</div>
        ) : null}
      </section>

      <div className="space-y-6">
        {!showTaskDetail ? (
        <section className="space-y-6">
          <div className={panelClassName}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Queue</div>
                <h2 className="mt-2 text-xl font-black text-slate-950">任务列表</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  <Plus size={16} />
                  新建任务
                </button>
                <button
                  type="button"
                  onClick={handleRefreshTasks}
                  disabled={tasksLoading || !workspaceId}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tasksLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  刷新
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="任务总数" value={effectiveTaskCount} />
              <MetricCard label="活跃任务" value={activeTaskCount} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allFilteredTasksSelected}
                    disabled={filteredTasks.length === 0}
                    onChange={handleToggleVisibleTaskSelection}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  选择当前筛选结果
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    已选择 {selectedTaskSummaries.length} 个，当前筛选 {filteredTasks.length} 个
                    {cancellableSelectedTasks.length > 0 ? `，可停止 ${cancellableSelectedTasks.length} 个` : ''}
                    {actionableSelectedTasks.length > 0 ? `，可重试/删除 ${actionableSelectedTasks.length} 个` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleBatchCancelTasks}
                    disabled={batchActingTasks || cancellableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                    批量停止 {cancellableSelectedTasks.length > 0 ? `(${cancellableSelectedTasks.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchRetryTasks}
                    disabled={batchActingTasks || actionableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    批量重试 {actionableSelectedTasks.length > 0 ? `(${actionableSelectedTasks.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDeleteTasks}
                    disabled={batchActingTasks || actionableSelectedTasks.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchActingTasks ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    批量删除 {actionableSelectedTasks.length > 0 ? `(${actionableSelectedTasks.length})` : ''}
                  </button>
                  {selectedTaskSummaries.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearSelectedTasks}
                      disabled={batchActingTasks}
                      className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      清空选择
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <Search size={16} className="text-slate-400" />
                <input
                  value={taskKeyword}
                  onChange={(event) => setTaskKeyword(event.target.value)}
                  placeholder="筛选标题、路径、任务 ID 或状态"
                  className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="all">全部状态</option>
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={taskStageFilter}
                onChange={(event) => setTaskStageFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="all">全部阶段</option>
                <option value="audit">Audit</option>
                <option value="poc">PoC</option>
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空筛选
              </button>
            </div>

            <div className="mt-4 max-h-[840px] space-y-3 overflow-auto pr-1">
              {tasksLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  <Loader2 size={16} className="animate-spin" />
                  正在加载任务列表...
                </div>
              ) : tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  当前项目还没有 IPC 漏洞扫描任务。
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
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
                      className={`rounded-lg border transition ${checked ? 'border-sky-300 bg-sky-50 shadow-sm' : active ? 'border-sky-300 bg-sky-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start gap-3 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTaskSelection(item.task_id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                          aria-label={`选择任务 ${item.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenTaskDetail(item.task_id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-slate-900">{item.title}</div>
                              <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{path}</div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                              {formatTaskStatus(item.status)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                            <span>{formatInputKind(item.input_ref.kind)}</span>
                            <span>{item.current_stage ? `当前阶段 ${formatStageLabel(item.current_stage)}` : '等待调度'}</span>
                            <span>{formatDateTime(item.created_at)}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {rowRuntimeLoading ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                <Loader2 size={12} className="animate-spin" />
                                加载执行配置
                              </span>
                            ) : rowRuntimeSummary ? (
                              <>
                                {rowRuntimeSummary.executorMode ? (
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    执行器 {formatExecutorMode(rowRuntimeSummary.executorMode)}
                                  </span>
                                ) : null}
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                  Model {rowModel || '(default)'}
                                </span>
                                {rowProviderKeys.slice(0, 2).map((providerKey, index) => (
                                  <span key={`${item.task_id}-${providerKey}-${index}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    Provider {index + 1} · {displayProviderName(providerKey, rowProviderSnapshotMap)}
                                  </span>
                                ))}
                                {rowProviderKeys.length > 2 ? (
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                    +{rowProviderKeys.length - 2} Provider
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                          {isCompletedTaskStatus(item.status) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {rowAuditedResultLoading ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                  <Loader2 size={12} className="animate-spin" />
                                  解析 audited-result
                                </span>
                              ) : rowAuditedResult ? (
                                <>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    vulnerabilities_found {rowAuditedResult.vulnerabilitiesFound}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    pocs_developed {rowAuditedResult.pocsDeveloped}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    info_findings {rowAuditedResult.infoFindings}
                                  </span>
                                </>
                              ) : (
                                <span className="rounded-full border border-dashed border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-400">
                                  未解析到 audited-result.json
                                </span>
                              )}
                            </div>
                          ) : null}
                          <div className="mt-2 font-mono text-[11px] text-slate-400">{item.task_id}</div>
                        </button>
                        <div className="hidden shrink-0 pt-1 text-[11px] font-bold text-slate-400 md:block">
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingTask ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                        重试任务
                      </button>
                      {canRetryPoc ? (
                        <button
                          type="button"
                          onClick={() => handleRetryTask('poc')}
                          disabled={actingTask}
                          className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Bot size={16} />
                          从 PoC 重试
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDeleteTask}
                        disabled={actingTask}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        删除任务
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-6 min-w-0 border-t border-slate-100 pt-5">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Detail</div>
              <h2 className="mt-2 truncate text-2xl font-black text-slate-950">{selectedTask?.title || '任务详情'}</h2>
              {selectedTask ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(selectedTask.status)}`}>
                    {formatTaskStatus(selectedTask.status)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {formatInputKind(selectedTask.input_ref.kind)}
                  </span>
                  {selectedTask.current_stage ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                      当前阶段 {formatStageLabel(selectedTask.current_stage)}
                    </span>
                  ) : null}
                  {currentExecutorMode ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                      执行器 {formatExecutorMode(currentExecutorMode)}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    Model {currentModelName || '(default)'}
                  </span>
                  {currentProviderKeys.map((providerKey, index) => {
                    const snapshot = currentProviderSnapshotMap.get(providerKey);
                    const displayName = String(snapshot?.display_name || providerKey).trim() || providerKey;
                    return (
                      <span key={`${providerKey}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                        Provider {index + 1} · {displayName}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {detailError ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{detailError}</div>
            ) : null}

            {!selectedTask ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center text-sm font-semibold text-slate-500">
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
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Audited Result</div>
                        <h3 className="mt-1 text-sm font-black text-slate-950">audited-result.json 摘要</h3>
                      </div>
                      {auditedResultSummary ? (
                        <button
                          type="button"
                          onClick={() => handlePreviewArtifact(auditedResultSummary.artifact)}
                          className="self-start rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 sm:self-auto"
                        >
                          预览 JSON
                        </button>
                      ) : null}
                    </div>
                    {auditedResultLoading ? (
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
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
                      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
                        {auditedResultError || '当前任务没有可解析的 audited-result.json。'}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {STAGE_NAMES.map((stageName) => {
                    const stageRun = currentAttempt?.stage_runs.find((item) => item.stage_name === stageName) || null;
                    return (
                      <div key={stageName} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-slate-900">{formatStageLabel(stageName)}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">
                              {stageRun?.started_at ? `开始于 ${formatDateTime(stageRun.started_at)}` : '尚未开始'}
                            </div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(stageRun?.status)}`}>
                            {formatStageStatus(stageRun?.status)}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            返回码
                            <div className="mt-1 font-mono text-sm text-slate-900">{stageRun?.return_code ?? '-'}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            会话文件
                            <div className="mt-1 font-mono text-sm text-slate-900">{stageSessions[stageName].length}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Session Explorer</div>
                      <h3 className="mt-2 text-lg font-black text-slate-950">Audit / PoC 会话与日志</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {STAGE_NAMES.map((stageName) => (
                        <button
                          key={stageName}
                          type="button"
                          onClick={() => {
                            setSelectedStage(stageName);
                            const next = preferredSession(stageSessions[stageName]);
                            if (next) setSelectedSessionPath(next.path);
                          }}
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${selectedStage === stageName ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                        >
                          {formatStageLabel(stageName)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">尝试</div>
                        <select
                          value={selectedAttemptId}
                          onChange={(event) => setSelectedAttemptId(event.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        >
                          {attempts.map((item) => (
                            <option key={item.attempt_id} value={item.attempt_id}>
                              Attempt {item.attempt_no} · {formatTaskStatus(item.status)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">会话文件</div>
                          {resourcesLoading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
                        </div>
                        <div className="mt-3 max-h-[480px] space-y-2 overflow-auto pr-1">
                          {selectedStageSessions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs font-semibold text-slate-500">
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
                                  className={`block w-full rounded-xl border px-3 py-3 text-left transition ${active ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                                >
                                  <div className="truncate text-sm font-bold text-slate-900">{item.display_name}</div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.path}</div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
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

                    <div className="min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/95">
                      {sessionLoading || taskDetailLoading ? (
                        <div className="flex h-full min-h-[520px] items-center justify-center text-sm font-semibold text-slate-300">
                          <Loader2 size={18} className="mr-2 animate-spin" />
                          正在加载会话内容...
                        </div>
                      ) : !selectedSessionSummary || !sessionFile ? (
                        <div className="flex h-full min-h-[520px] items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
                          当前没有可展示的会话文件。
                        </div>
                      ) : isJsonlPath(selectedSessionSummary.path) ? (
                        <div className="min-h-[520px] bg-slate-50 p-4">
                          {sessionWarnings.length > 0 ? (
                            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                              会话中有 {sessionWarnings.length} 行未能按 JSONL 解析，已作为原始输出保留。
                            </div>
                          ) : null}
                          <AgentSessionViewer
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

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Server size={16} />
                      阶段日志
                    </div>
                    <div className="mt-3 rounded-2xl bg-slate-950 p-4 text-slate-100">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          {formatStageLabel(selectedStage)} stdout / log
                        </div>
                        {currentStageRun ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(currentStageRun.status)}`}>
                            {formatStageStatus(currentStageRun.status)}
                          </span>
                        ) : null}
                      </div>
                      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">
                        {selectedStageLog?.content || '当前阶段暂无日志输出。'}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Clock3 size={16} />
                      事件流
                    </div>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                      {events.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm font-semibold text-slate-500">
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
                            ? Object.entries(item.payload.event_types as Record<string, number>).map(([key, value]) => `${key}×${value}`).join(' · ')
                            : '';
                          return (
                            <article key={`${item.event_seq}-${item.event_id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-black text-slate-900">{item.message}</div>
                                  <div className="mt-1 font-mono text-[11px] text-slate-500">{item.event_type}</div>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.level)}`}>
                                  {item.stage_name ? `${formatStageLabel(item.stage_name)} · ` : ''}{item.level}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
                                <span>{formatDateTime(item.created_at)}</span>
                                {item.payload?.session_file_path ? <span className="font-mono">{shortPath(String(item.payload.session_file_path))}</span> : null}
                              </div>
                              {eventTypes ? <div className="mt-3 text-xs font-semibold text-slate-500">{eventTypes}</div> : null}
                              {preview ? (
                                <pre className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 px-3 py-3 font-mono text-[12px] leading-6 text-slate-100">
                                  {preview}
                                </pre>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Bot size={16} />
                      产物列表
                    </div>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                      {visibleArtifacts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm font-semibold text-slate-500">
                          当前尝试还没有可展示产物。
                        </div>
                      ) : (
                        visibleArtifacts.map((item) => (
                          <article key={item.artifact_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-900">{item.display_name}</div>
                                <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.relative_path}</div>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                                {item.artifact_kind}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
                              <span>{formatStageLabel(item.stage_name)}</span>
                              <span>{formatSize(item.size)}</span>
                              <span>{formatDateTime(item.created_at)}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handlePreviewArtifact(item)}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                              >
                                预览
                              </button>
                              <a
                                href={item.preview_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                              >
                                原始
                              </a>
                              <a
                                href={item.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
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
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Create Task</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">新建 IPC 扫描任务</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">工作区</div>
                    <select
                      value={workspaceId}
                      onChange={(event) => setWorkspaceId(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                    >
                      {workspaces.map((item) => (
                        <option key={item.workspace_id} value={item.workspace_id}>
                          {item.display_name} ({item.workspace_id})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">项目路径列表</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          预设项目和自定义路径统一在这里多选，提交后每个路径创建一个任务。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSelectVisibleProjectPaths}
                          disabled={filteredProjectInputItems.length === 0}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          全选当前
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSelectedProjectPaths}
                          disabled={selectedProjectItems.length === 0}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          清空选择
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 md:flex-row">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <Search size={16} className="text-slate-400" />
                        <input
                          value={presetKeyword}
                          onChange={(event) => setPresetKeyword(event.target.value)}
                          placeholder="筛选项目名称、路径或来源"
                          className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshCatalog}
                        disabled={refreshingCatalog || !workspaceId}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomProjectPath}
                        disabled={!canCreateCustomProject || !customPath.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus size={15} />
                        添加路径
                      </button>
                    </div>
                    {!canCreateCustomProject ? (
                      <div className="mt-2 text-xs font-semibold text-amber-700">当前工作区不允许添加自定义路径。</div>
                    ) : null}

                    {refreshJob ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                        目录刷新任务：{refreshJob.status}
                        {refreshJob.discovered_count != null ? ` · 发现 ${refreshJob.discovered_count} 个项目` : ''}
                        {refreshJob.error_message ? ` · ${refreshJob.error_message}` : ''}
                      </div>
                    ) : null}

                    <div className="mt-3 max-h-[410px] space-y-2 overflow-auto pr-1">
                      {presetLoading ? (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                          <Loader2 size={16} className="animate-spin" />
                          正在加载项目列表...
                        </div>
                      ) : projectInputItems.length > 0 && filteredProjectInputItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-sm font-semibold text-slate-500">
                          当前筛选条件下没有匹配路径。清空搜索关键字后可查看全部 {projectInputItems.length} 个可选路径。
                        </div>
                      ) : filteredProjectInputItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-sm font-semibold text-slate-500">
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
                              className={`block w-full rounded-lg border px-4 py-3 text-left transition ${active ? 'border-sky-500 bg-sky-50 shadow-sm ring-2 ring-sky-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-black text-slate-900">{item.displayName}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${item.source === 'preset' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                      {item.source === 'preset' ? '预设' : '自定义'}
                                    </span>
                                  </div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.path}</div>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-sky-200 bg-white text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                                  {active ? <CheckCircle2 size={13} /> : null}
                                  {active ? '已选择' : '未选择'}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.preset?.has_idl ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">IDL</span> : null}
                                {item.preset?.has_on_remote_request_cpp ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">OnRemoteRequest</span> : null}
                                {item.preset?.has_existing_audit_report ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">已有 Audit</span> : null}
                                {item.preset?.has_existing_poc_report ? <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-700">已有 PoC</span> : null}
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
                                    className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700"
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
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">任务标题 / 批量标题前缀</div>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={selectedProjectItems.length === 1 ? buildDefaultTitle(selectedProjectItems[0].path, selectedProjectItems[0].displayName) : '留空则每个路径自动生成标题'}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                    />
                    <div className="mt-2 text-xs font-medium text-slate-500">单选时作为任务标题；多选时作为标题前缀并自动追加项目名。</div>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">执行器</div>
                      <select
                        value={executorMode}
                        onChange={(event) => setExecutorMode(event.target.value as ExecutorMode)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                      >
                        {(capabilities?.executor_modes || ['codex_cli', 'opencode_cli']).filter((item) => item !== 'mock').map((item) => (
                          <option key={item} value={item}>
                            {formatExecutorMode(item)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Model</div>
                      <input
                        value={modelName}
                        onChange={(event) => setModelName(event.target.value)}
                        placeholder="留空则使用 CLI 默认模型"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                      />
                    </label>
                  </div>
                  <div className="text-xs font-medium text-slate-500">{modelHintForExecutor(executorMode, providerFallbackModel || null)}</div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">LLM Provider</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          每个任务只使用一个 Provider；运行时会按所选 Provider 注入对应的环境变量和配置文件。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshProviders}
                        disabled={providersLoading}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {providersLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        刷新 Provider
                      </button>
                    </div>

                    <div className="mt-3">
                      <select
                        value={selectedProviderKey}
                        onChange={(event) => setSelectedProviderKey(event.target.value)}
                        disabled={providersLoading || providerOptions.length === 0}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">{providersLoading ? '正在加载 Provider...' : '选择 Provider...'}</option>
                        {providerOptions.map((provider) => (
                          <option key={provider.provider_key} value={provider.provider_key} disabled={!provider.enabled}>
                            {provider.display_name || provider.provider_key} · {provider.provider_type} · {provider.model || 'no-model'}{provider.is_default ? ' · 默认' : ''}{!provider.enabled ? ' · 已禁用' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-2 text-xs font-medium text-slate-500">
                      默认会回填服务默认 Provider。Model 留空时，后端会回退到当前所选 Provider 的模型。
                    </div>
                    {providerLoadError ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        Provider 列表加载失败：{providerLoadError}
                      </div>
                    ) : null}
                    {providersLoading ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                        <Loader2 size={14} className="animate-spin" />
                        正在同步 Provider 列表...
                      </div>
                    ) : null}

                    <div className="mt-3 max-h-[260px] space-y-2 overflow-auto pr-1">
                      {!selectedProvider ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
                          当前还没有选中 Provider。执行器为 Codex / OpenCode 时，建议至少选择一个 Provider。
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-black text-slate-900">{selectedProvider.display_name || selectedProvider.provider_key}</span>
                                {selectedProvider.is_default ? (
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                    默认
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{selectedProvider.provider_key}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                <span>{selectedProvider.provider_type || '-'}</span>
                                <span>{selectedProvider.model || 'no-model'}</span>
                                <span>{selectedProvider.mapped_env_keys?.length || 0} env</span>
                                <span>{selectedProvider.mapped_file_paths?.length || 0} file</span>
                              </div>
                            </div>
                          </div>
                          {(selectedProvider.mapped_env_keys?.length || 0) > 0 || (selectedProvider.mapped_file_paths?.length || 0) > 0 ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Mapped Env Keys</div>
                                <div className="mt-1 break-all text-xs font-semibold text-slate-600">
                                  {selectedProvider.mapped_env_keys?.join(', ') || '-'}
                                </div>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Mapped File Paths</div>
                                <div className="mt-1 break-all text-xs font-semibold text-slate-600">
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
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Create Summary</div>
                        <h3 className="mt-2 text-lg font-black text-slate-950">当前输入配置</h3>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(resolvePipelineMode(capabilities, selectedWorkspace))}`}>
                        {selectedWorkspace?.supports_poc ? '默认 Audit + PoC' : '默认仅 Audit'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">已选路径</div>
                        <div className="mt-2 font-semibold text-slate-800">{selectedProjectItems.length} 个任务</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">目标路径</div>
                        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
                          {selectedProjectItems.length === 0 ? (
                            <div className="text-xs font-semibold text-slate-400">尚未选择路径</div>
                          ) : (
                            selectedProjectItems.map((item) => (
                              <div key={item.path} className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="font-mono text-xs text-slate-700 break-all">{item.path}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {item.source === 'preset' ? '预设项目' : '自定义路径'}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">执行器</div>
                        <div className="mt-2 font-semibold text-slate-800">{formatExecutorMode(executorMode)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Model</div>
                        <div className="mt-2 break-all font-mono text-xs text-slate-700">{modelName.trim() || providerFallbackModel || '(default)'}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Provider</div>
                        <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                          {!selectedProvider ? (
                            <div className="text-xs font-semibold text-slate-400">尚未选择 Provider</div>
                          ) : (
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="text-xs font-black text-slate-800">{selectedProvider.display_name || selectedProvider.provider_key}</div>
                              <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{selectedProvider.provider_key}</div>
                              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                {selectedProvider.provider_type} · {selectedProvider.model || 'no-model'} · {selectedProvider.mapped_env_keys.length} env · {selectedProvider.mapped_file_paths.length} file
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">说明</div>
                        <div className="mt-2 text-sm font-medium leading-6 text-slate-600">
                          不展示扫描范围、目标类型和扫描策略。后端按工作区默认模式决定是否在 Audit 结束后继续执行 PoC；批量创建时每个路径对应一个独立任务。Model 留空时回退到当前所选 Provider 的模型。
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-4">
              <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateTask}
                disabled={creating || !workspaceId || selectedProjectItems.length === 0 || !selectedProviderKey}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                创建{selectedProjectItems.length > 0 ? ` ${selectedProjectItems.length} ` : ''}个任务
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {previewArtifact ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
                      {previewArtifact.artifact_kind}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {formatStageLabel(previewArtifact.stage_name)}
                    </span>
                    {previewArtifactContent?.truncated ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        已截断
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 truncate text-lg font-black text-slate-950">{previewArtifact.display_name}</h3>
                  <div className="mt-1 break-all font-mono text-xs text-slate-500">{previewArtifact.relative_path}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
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
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    打开原始
                  </a>
                  <a
                    href={previewArtifact.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    下载
                  </a>
                  <button
                    type="button"
                    onClick={handleCloseArtifactPreview}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                  >
                    <XCircle size={14} />
                    关闭
                  </button>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {previewArtifactLoading ? (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  正在加载产物预览...
                </div>
              ) : previewArtifactError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {previewArtifactError}
                </div>
              ) : previewArtifactContent ? (
                <ArtifactPreviewBody artifact={previewArtifact} content={previewArtifactContent} />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-500">
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
