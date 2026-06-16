import { AppSaSessionEvent, AppSaSessionMeta, AppSaSessionSnapshot } from '../../types/types';

const SESSION_THINKING_LEVEL_MAP: Record<string, string> = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  'x-high': 'xhigh',
  xhigh: 'xhigh',
};

export interface FirmwareSessionIndexItem {
  role: string;
  name: string;
  session_file: string;
  provider_role: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  round: number | null;
  skill_name: string | null;
  phase: string | null;
}

export interface FirmwareSessionIndex {
  version: number;
  items: FirmwareSessionIndexItem[];
}

export type SessionDeltaParseResult = {
  sessionMeta: Record<string, any> | null;
  events: AppSaSessionEvent[];
  warnings: string[];
  lineCount: number;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const asNullableString = (value: unknown): string | null =>
  value == null ? null : String(value);

const asNullableNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nestedRecord = (value: Record<string, any>, key: string): Record<string, any> => asRecord(value[key]);

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (value != null && typeof value !== 'object') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
};

const nestedSdkSpecific = (...records: Record<string, any>[]): Record<string, any> => {
  for (const record of records) {
    const sdk = nestedRecord(record, 'sdk_specific');
    if (Object.keys(sdk).length) return sdk;
    const runtime = nestedRecord(record, 'runtime_config');
    const runtimeSdk = nestedRecord(runtime, 'sdk_specific');
    if (Object.keys(runtimeSdk).length) return runtimeSdk;
  }
  return {};
};

export function parseSessionMessageParts(content: unknown): Array<Record<string, any>> {
  const parts: Array<Record<string, any>> = [];
  if (typeof content === 'string') {
    parts.push({ type: 'text', text: content });
    return parts;
  }
  if (!Array.isArray(content)) return parts;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const part = item as Record<string, any>;
    const contentType = String(part.type || '');
    if (contentType === 'text') {
      parts.push({ type: 'text', text: part.text || '' });
    } else if (contentType === 'thinking') {
      parts.push({ type: 'thinking', text: part.thinking || part.text || '' });
    } else if (contentType === 'toolCall') {
      parts.push({
        type: 'toolCall',
        name: part.name || '',
        id: part.id || '',
        arguments: part.arguments || {},
      });
    } else if (contentType === 'toolResult') {
      parts.push({ type: 'toolResult', text: part.text || '' });
    } else {
      parts.push({ type: 'unknown', detail: JSON.stringify(part).slice(0, 200) });
    }
  }
  return parts;
}

export function parseSessionJsonlObject(obj: Record<string, any>, rawLine: string, lineNo: number): {
  sessionMeta?: Record<string, any>;
  event?: AppSaSessionEvent;
} {
  const eventType = String(obj.type || '');
  const payload = nestedRecord(obj, 'payload');
  const data = nestedRecord(obj, 'data');
  const config = nestedRecord(obj, 'config');
  const metadata = nestedRecord(obj, 'metadata');
  const options = nestedRecord(obj, 'options');
  const settings = nestedRecord(obj, 'settings');
  const message = obj.message && typeof obj.message === 'object' ? obj.message as Record<string, any> : {};
  const sdk = nestedSdkSpecific(obj, payload, data, config, metadata, options, settings);
  const modelProvider = firstString(
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
    sdk.provider
  );
  const modelId = firstString(
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
    sdk.model
  );
  const thinkingLevel = firstString(
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
    sdk.level
  );
  if (eventType === 'session') {
    return {
      sessionMeta: {
        id: obj.id || '',
        version: obj.version || '',
        timestamp: obj.timestamp || '',
        cwd: obj.cwd || '',
        provider: modelProvider,
        model: modelId,
        thinking: thinkingLevel,
      },
    };
  }
  if (['model_change', 'model', 'model_changed', 'set_model'].includes(eventType) || (modelId && !eventType.startsWith('message'))) {
    return {
      event: {
        type: 'model_change',
        line: lineNo,
        event_index: lineNo,
        timestamp: obj.timestamp || '',
        display_timestamp: obj.timestamp || '',
        provider: modelProvider,
        modelId,
        raw_line: rawLine,
      },
    };
  }
  if (['thinking_level_change', 'thinking_level', 'thinking', 'reasoning_effort_change', 'reasoning_effort'].includes(eventType) || (thinkingLevel && !eventType.startsWith('message'))) {
    const level = thinkingLevel;
    return {
      event: {
        type: 'thinking_level_change',
        line: lineNo,
        event_index: lineNo,
        timestamp: obj.timestamp || '',
        display_timestamp: obj.timestamp || '',
        thinkingLevel: level,
        thinkingLevelClass:`thinking-${SESSION_THINKING_LEVEL_MAP[level.toLowerCase()] || 'off'}`,
        raw_line: rawLine,
      },
    };
  }
  if (eventType === 'message' || eventType === 'message_end') {
    const msg = message;
    const role = String(msg.role || '');
    const event: AppSaSessionEvent = {
      type: 'message',
      line: lineNo,
      event_index: lineNo,
      timestamp: obj.timestamp || '',
      display_timestamp: obj.timestamp || '',
      role,
      render_role: role,
      parts: parseSessionMessageParts(msg.content),
      raw_line: rawLine,
    };
    if (role === 'toolResult') {
      event.toolCallId = msg.toolCallId || msg.tool_call_id || '';
      event.toolName = msg.toolName || msg.tool_name || '';
      event.isError = Boolean(msg.isError ?? msg.is_error ?? false);
    }
    return { event };
  }
  return {
    event: {
      type: eventType || 'unknown_event',
      line: lineNo,
      event_index: lineNo,
      display_timestamp: obj.timestamp || '',
      summary: JSON.stringify(obj).slice(0, 200),
      raw_line: rawLine.slice(0, 200),
    },
  };
}

export function mergeAgentSessionToolResults(events: AppSaSessionEvent[]) {
  const result: Array<AppSaSessionEvent & { _toolResults?: AppSaSessionEvent[] }> = [];
  for (const event of events) {
    if (event.type === 'message' && event.role === 'toolResult') {
      const last = result[result.length - 1];
      if (last && last.type === 'message' && last.role === 'assistant') {
        if (!last._toolResults) last._toolResults = [];
        last._toolResults.push(event);
        continue;
      }
    }
    result.push({ ...event });
  }
  return result;
}

export function parseSessionJsonlDelta(lines: string[], startLine: number): SessionDeltaParseResult {
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
      if (mapped.event) events.push(mapped.event);
    } catch {
      warnings.push(`第 ${lineNo} 行 JSON 解析失败`);
      events.push({ type: 'raw', line: lineNo, raw_line: trimmed.slice(0, 200), summary: trimmed.slice(0, 200) });
    }
  });

  return { sessionMeta, events, warnings, lineCount };
}

export async function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

export function normalizeFirmwareSessionIndex(value: unknown): FirmwareSessionIndex {
  const record = asRecord(value);
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems
    .map((item) => {
      const entry = asRecord(item);
      return {
        role: asString(entry.role),
        name: asString(entry.name),
        session_file: asString(entry.session_file),
        provider_role: asNullableString(entry.provider_role),
        status: asString(entry.status, 'unknown'),
        created_at: asNullableString(entry.created_at),
        updated_at: asNullableString(entry.updated_at),
        closed_at: asNullableString(entry.closed_at),
        round: asNullableNumber(entry.round),
        skill_name: asNullableString(entry.skill_name),
        phase: asNullableString(entry.phase),
      };
    })
    .filter((item) => item.role && item.name && item.session_file);
  return {
    version: Number(record.version) || 1,
    items,
  };
}

const ROLE_LABELS: Record<string, string> = {
  executor: '执行器',
  reviewer: '评审器',
  cleaner: '清理器',
  'skill-author': '技能生成器',
  'skill-executor': '技能执行器',
  'evolution-executor': '工具进化执行器',
  evolver: '工具进化器',
};

export function phaseGroupLabel(phase: string | null, role: string): string {
  const key = String(phase || '').trim();
  if (!key) return ROLE_LABELS[role] || role || '未分类';
  const mapping: Record<string, string> = {
    preprocess: '预处理',
    tool_match: '工具匹配',
    llm_unpack: 'LLM 解包',
    review: '评审',
    llm_review: 'LLM 评审',
    cleanup: '清理',
    llm_cleanup: 'LLM 清理',
    evolution_execute: '工具进化执行',
    tool_execute: '工具解包',
    evolve: '工具进化',
  };
  return mapping[key] || key;
}

export function buildFirmwareSessionMeta(item: FirmwareSessionIndexItem): AppSaSessionMeta {
  const roleLabel = ROLE_LABELS[item.role] || item.role || '会话';
  const displaySuffix = item.skill_name || item.name;
  const group = phaseGroupLabel(item.phase, item.role);
  const updatedAtMs = item.updated_at ? Date.parse(item.updated_at) : 0;
  return {
    session_id:`${item.role}:${item.name}`,
    session_name: item.name,
    relative_path: item.session_file,
    stage_group: group,
    role_name: item.role,
    size: 0,
    mtime: Number.isFinite(updatedAtMs) ? updatedAtMs / 1000 : 0,
    event_count: 0,
    line_count: 0,
    is_active: item.status === 'running',
    display_name:`${roleLabel} · ${displaySuffix}`,
    warnings: [],
  };
}

export function buildSessionSnapshotFromText(path: string, content: string): AppSaSessionSnapshot {
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
