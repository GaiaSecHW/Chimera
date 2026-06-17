import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Loader2,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';

import { showConfirm } from '../../components/DialogService';
import { api } from '../../clients/api';
import {
  AiAgentBatchConfigureResult,
  AiAgentLlmConfigDraft,
  AiAgentLlmFileBinding,
  AiAgentLlmProviderDetail,
  AiAgentLlmProviderSummary,
  AiHelperService,
  AiHelperRuntimeEnv,
  ProjectAiAgentItem,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  buildHelperKey,
  EmptyState,
  JsonBlock,
  prettyJson,
  uniqueValues,
  useAiHelpers,
  useProjectAiAgents,
} from './ai-agent/shared';

const environmentApi = api.domains.environment;

const defaultCreateForm = {
  agent_id: '',
  backend_type: 'claude',
  command: '',
  args: '[]',
  cwd: '',
  env: '{}',
  enabled: true,
  description: '',
};

const buildAgentKey = (item: Pick<ProjectAiAgentItem, 'agent_key' | 'service_name' | 'agent_id'>) =>`${item.agent_key}::${item.service_name}::${item.agent_id}`;

const formatProviderText = (provider?: { display_name?: string | null; provider_key?: string | null } | null) =>
  provider?.display_name || provider?.provider_key || '未绑定';

const getBoundProviderLabels = (
  agent: Pick<ProjectAiAgentItem, 'llm_provider_key' | 'llm_provider_keys' | 'llm_provider_snapshot' | 'llm_provider_snapshots'>,
) => {
  const labels: string[] = [];
  const seen = new Set<string>();
  const append = (value?: string | null) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    labels.push(text);
  };

  const snapshots = Array.isArray(agent.llm_provider_snapshots) ? agent.llm_provider_snapshots : [];
  snapshots.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    append(String((item as any).display_name || (item as any).provider_key || ''));
  });

  const keys = Array.isArray(agent.llm_provider_keys) ? agent.llm_provider_keys : [];
  keys.forEach((key) => append(key));

  if (labels.length === 0) {
    append(formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key }));
  }
  return labels.filter((item) => item !== '未绑定');
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

type LlmBindingStatus = 'unbound' | 'bound_fresh' | 'bound_stale' | 'bound_unknown';

const getLlmBindingStatus = (
  agent: Pick<ProjectAiAgentItem, 'llm_provider_key' | 'llm_provider_snapshot'>,
  providerUpdatedAtMap: Map<string, string>,
): LlmBindingStatus => {
  const providerKey = String(agent.llm_provider_key || '').trim();
  if (!providerKey) return 'unbound';

  try {
    const summaryUpdatedAt = providerUpdatedAtMap.get(providerKey) || '';
    const snapshotUpdatedAt = String(agent.llm_provider_snapshot?.updated_at || '').trim();
    if (!summaryUpdatedAt || !snapshotUpdatedAt) return 'bound_fresh';
    return summaryUpdatedAt === snapshotUpdatedAt ? 'bound_fresh' : 'bound_stale';
  } catch {
    return 'bound_unknown';
  }
};

const LlmStatusBadge: React.FC<{ status: LlmBindingStatus }> = ({ status }) => {
  const text =
    status === 'unbound'
      ? '未绑定'
      : status === 'bound_fresh'
        ? '已绑定(最新)'
        : status === 'bound_stale'
          ? '已绑定(可能过期)'
          : '状态未知';
  const cls =
    status === 'unbound'
      ? 'bg-theme-elevated text-theme-text-secondary border-theme-border'
      : status === 'bound_fresh'
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
        : status === 'bound_stale'
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
          : 'bg-theme-elevated text-theme-text-secondary border-theme-border';

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[0.12em] ${cls}`}>{text}</span>;
};

type EnvEntry = {
  id: string;
  key: string;
  value: string;
};

type ArgEntry = {
  id: string;
  value: string;
};

type FileEntry = {
  id: string;
  name: string;
  path: string;
  content: string;
  format: string;
  enabled: boolean;
  provider_key?: string;
};

const createEnvEntry = (key = '', value = ''): EnvEntry => ({
  id:`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value,
});

const createArgEntry = (value = ''): ArgEntry => ({
  id:`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  value,
});

const createFileEntry = (value?: Partial<FileEntry>): FileEntry => ({
  id:`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: value?.name || '',
  path: value?.path || '',
  content: value?.content || '',
  format: value?.format || 'other',
  enabled: value?.enabled ?? true,
  provider_key: value?.provider_key || '',
});

const envObjectToEntries = (env?: Record<string, string>) =>
  Object.entries(env || {}).map(([key, value]) => createEnvEntry(key, String(value ?? '')));

const argsArrayToEntries = (args?: any[]) =>
  Array.isArray(args) ? args.map((item) => createArgEntry(String(item ?? ''))) : [];

const envEntriesToObject = (entries: EnvEntry[]) =>
  entries.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    if (!key) return acc;
    acc[key] = item.value ?? '';
    return acc;
  }, {});

const argEntriesToArray = (entries: ArgEntry[]) =>
  entries
    .map((item) => String(item.value ?? '').trim())
    .filter((item) => item.length > 0);

const splitByNewlineOrSemicolon = (input: string) => {
  const parts: string[] = [];
  let current = '';
  let quote: '"' |"'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const prev = index > 0 ? input[index - 1] : '';

    if ((char === '"' || char ==="'") && prev !== '\\') {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      current += char;
      continue;
    }

    if (!quote && (char === '\n' || char === ';')) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

const parseEnvImportText = (input: string) => {
  const parts = splitByNewlineOrSemicolon(input);
  const entries: EnvEntry[] = [];
  const errors: string[] = [];

  parts.forEach((part, index) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      errors.push(`第 ${index + 1} 项缺少合法的 key=value`);
      return;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1);
    if (!key) {
      errors.push(`第 ${index + 1} 项的 key 不能为空`);
      return;
    }
    entries.push(createEnvEntry(key, value));
  });

  return { entries, errors };
};

const unwrapQuotedValue = (value: string) => {
  const text = value.trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
};

const parseArgImportText = (input: string) => {
  const parts = splitByNewlineOrSemicolon(input);
  const entries = parts
    .map((part) => unwrapQuotedValue(part))
    .filter((item) => item.length > 0)
    .map((item) => createArgEntry(item));
  return { entries };
};

const StatsStrip: React.FC<{ agents: ProjectAiAgentItem[]; selectedCount: number }> = ({ agents, selectedCount }) => {
  const stats = useMemo(() => ({
    total: agents.length,
    installed: agents.filter((item) => item.installed).length,
    running: agents.filter((item) => item.running).length,
    active: agents.filter((item) => item.active).length,
  }), [agents]);

  const items = [
    { label: '总数', value: stats.total },
    { label: 'Installed', value: stats.installed },
    { label: 'Running', value: stats.running },
    { label: 'Active', value: stats.active },
    { label: '已勾选', value: selectedCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {items.map((item) => (
 <div key={item.label} className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">{item.label}</div>
          <div className="mt-2 text-2xl font-black text-theme-text-primary">{item.value}</div>
        </div>
      ))}
    </div>
  );
};

const backendTypeIcon = (backendType?: string) => {
  const text = String(backendType || '').toLowerCase();
  if (text.includes('codex')) return <Settings2 size={14} className="text-violet-400" />;
  if (text.includes('open')) return <WandSparkles size={14} className="text-amber-400" />;
  return <Bot size={14} className="text-cyan-400" />;
};

const healthDotTone = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text.includes('healthy') || text.includes('ok') || text.includes('pass')) return 'bg-emerald-500';
  if (text.includes('warn') || text.includes('degrad')) return 'bg-amber-500';
  if (text.includes('err') || text.includes('fail') || text.includes('down')) return 'bg-rose-500';
  return 'bg-slate-300';
};

const ModalShell: React.FC<{
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
  compactHeight?: boolean;
}> = ({ title, description, onClose, children, maxWidthClassName = 'max-w-5xl', compactHeight = false }) => (
  <div className="fixed inset-0 z-[260] bg-slate-950/55 backdrop-blur-sm p-4 md:p-8" onClick={onClose}>
    <div
      className={`mx-auto flex w-full ${maxWidthClassName} flex-col overflow-hidden rounded-[2rem] border border-theme-border bg-theme-bg-app ${compactHeight ? 'max-h-[85vh]' : 'h-full'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5 md:px-8">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-theme-text-primary">{title}</h3>
          <p className="mt-2 text-sm text-theme-text-muted">{description}</p>
        </div>
        <button onClick={onClose} className="rounded-2xl bg-theme-elevated p-3 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary">
          <X size={18} />
        </button>
      </div>
      <div className={`${compactHeight ? 'overflow-auto' : 'min-h-0 flex-1 overflow-auto'} px-6 py-6 md:px-8`}>{children}</div>
    </div>
  </div>
);

const LlmProviderPreview: React.FC<{
  providerDetail: AiAgentLlmProviderDetail | null;
  emptyText: string;
}> = ({ providerDetail, emptyText }) => {
  if (!providerDetail) {
    return <div className="rounded-2xl border border-dashed border-theme-border bg-theme-bg-app px-4 py-8 text-sm text-theme-text-muted">{emptyText}</div>;
  }

  const envBindings = Object.entries(providerDetail.env_bindings || {});
  const fileBindings = Array.isArray(providerDetail.file_bindings) ? providerDetail.file_bindings : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-theme-text-muted">Provider</div>
          <div className="mt-2 text-sm font-black text-theme-text-primary">{providerDetail.display_name}</div>
          <div className="mt-1 text-xs text-theme-text-muted">{providerDetail.provider_key} · {providerDetail.provider_type}</div>
        </div>
        <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-theme-text-muted">Model</div>
          <div className="mt-2 text-sm font-black text-theme-text-primary">{providerDetail.model || '-'}</div>
          <div className="mt-1 text-xs text-theme-text-muted">{providerDetail.api_base || '-'}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-theme-text-primary">环境变量注入</div>
          <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-theme-text-secondary">{envBindings.length}</span>
        </div>
        {envBindings.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-bg-app px-3 py-3 text-xs text-theme-text-muted">该 Provider 暂无环境变量注入。</div>
        ) : (
          <div className="mt-3 space-y-2">
            {envBindings.map(([key, value]) => (
              <div key={key} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-theme-text-muted">{key}</div>
                <div className="mt-1 text-xs text-theme-text-secondary break-all">
                  {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                    ? String(value)
                    : prettyJson(value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-theme-text-primary">文件注入</div>
          <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-theme-text-secondary">{fileBindings.length}</span>
        </div>
        {fileBindings.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-bg-app px-3 py-3 text-xs text-theme-text-muted">该 Provider 暂无文件注入配置。</div>
        ) : (
          <div className="mt-3 space-y-3">
            {fileBindings.map((file, index) => (
              <div key={`${file.path || file.name || 'file'}-${index}`} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-3">
                <div className="text-sm font-semibold text-theme-text-primary">{file.path || file.name ||`文件 ${index + 1}`}</div>
                <div className="mt-1 text-xs text-theme-text-muted">
                  名称: {file.name || '-'} · 格式: {file.format || '-'} · 启用: {file.enabled ? '是' : '否'}
                </div>
                {file.content ? (
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg border border-theme-border bg-theme-bg-app p-2 text-[11px] text-theme-text-secondary">{file.content}</pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
        <div className="text-sm font-black text-theme-text-primary">映射预览</div>
        <JsonBlock title="Env 映射" value={providerDetail.mapped_env_preview || {}} className="mt-3 bg-theme-bg-app" />
      </div>
    </div>
  );
};

const CreateAgentModal: React.FC<{
  helperOptions: Array<{ key: string; label: string }>;
  createHelperKey: string;
  setCreateHelperKey: (value: string) => void;
  createForm: typeof defaultCreateForm;
  setCreateForm: React.Dispatch<React.SetStateAction<typeof defaultCreateForm>>;
  busyAction: string;
  onClose: () => void;
  onCreate: () => Promise<void>;
}> = ({
  helperOptions,
  createHelperKey,
  setCreateHelperKey,
  createForm,
  setCreateForm,
  busyAction,
  onClose,
  onCreate,
}) => (
  <ModalShell
    title="新增 AI Agent"
    description="选择目标 helper 后，配置 backend、命令、参数与初始环境变量，再创建新的 AI Agent。"
    onClose={onClose}
    maxWidthClassName="max-w-4xl"
    compactHeight
  >
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <select value={createHelperKey} onChange={(e) => setCreateHelperKey(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm xl:col-span-3">
        {helperOptions.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      <input value={createForm.agent_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, agent_id: e.target.value }))} className="rounded-xl border border-theme-border px-3 py-2 text-sm" placeholder="agent_id" />
      <select value={createForm.backend_type} onChange={(e) => setCreateForm((prev) => ({ ...prev, backend_type: e.target.value }))} className="rounded-xl border border-theme-border px-3 py-2 text-sm">
        <option value="claude">claude</option>
        <option value="codex">codex</option>
        <option value="opencode">opencode</option>
      </select>
      <input value={createForm.command} onChange={(e) => setCreateForm((prev) => ({ ...prev, command: e.target.value }))} className="rounded-xl border border-theme-border px-3 py-2 text-sm" placeholder="二进制/命令路径，例如 /usr/local/bin/codex" />
      <input value={createForm.cwd} onChange={(e) => setCreateForm((prev) => ({ ...prev, cwd: e.target.value }))} className="rounded-xl border border-theme-border px-3 py-2 text-sm md:col-span-2 xl:col-span-2" placeholder="工作目录（可选），例如 /workspace/project" />
      <input value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} className="rounded-xl border border-theme-border px-3 py-2 text-sm md:col-span-2 xl:col-span-3" placeholder="description" />
      <textarea value={createForm.args} onChange={(e) => setCreateForm((prev) => ({ ...prev, args: e.target.value }))} rows={5} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-mono md:col-span-1 xl:col-span-1" placeholder='args JSON，例如 ["serve"]' />
      <textarea value={createForm.env} onChange={(e) => setCreateForm((prev) => ({ ...prev, env: e.target.value }))} rows={5} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-mono md:col-span-1 xl:col-span-2" placeholder='env JSON，例如 {"OPENAI_API_KEY":"..."}' />
      <label className="flex items-center gap-2 text-sm text-theme-text-secondary xl:col-span-3">
        <input type="checkbox" checked={createForm.enabled} onChange={(e) => setCreateForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
        默认启用
      </label>
      <div className="flex justify-end gap-3 xl:col-span-3">
        <button onClick={onClose} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">
          取消
        </button>
        <button onClick={() => void onCreate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          {busyAction === 'create-agent' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          创建 AI Agent
        </button>
      </div>
    </div>
  </ModalShell>
);

const BatchLlmApplyModal: React.FC<{
  projectId: string;
  selectedAgents: ProjectAiAgentItem[];
  providerOptions: AiAgentLlmProviderSummary[];
  llmBusy: string;
  result: AiAgentBatchConfigureResult | null;
  notify: (message: string, type?: 'success' | 'error' | 'warning') => void;
  onClose: () => void;
  onSubmit: (draft: AiAgentLlmConfigDraft) => Promise<void>;
}> = ({
  projectId,
  selectedAgents,
  providerOptions,
  llmBusy,
  result,
  notify,
  onClose,
  onSubmit,
}) => {
  const initializedDefaultProviderRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'providers' | 'env' | 'files' | 'submit'>('providers');
  const [selectedProviderKeys, setSelectedProviderKeys] = useState<string[]>([]);
  const [providerToAdd, setProviderToAdd] = useState('');
  const [providerDetailsMap, setProviderDetailsMap] = useState<Record<string, AiAgentLlmProviderDetail>>({});
  const [pendingProviderDraftApply, setPendingProviderDraftApply] = useState<string[]>([]);
  const [mergeStrategy, setMergeStrategy] = useState<'overwrite' | 'merge'>('overwrite');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const backendTypes = uniqueValues(selectedAgents.map((item) => item.backend_type || '').filter(Boolean));
  const firstBackendType = backendTypes[0] || '';

  useEffect(() => {
    const fallback = providerOptions[0]?.provider_key || '';
    if (!providerToAdd && fallback) {
      setProviderToAdd(fallback);
    }
    if (!initializedDefaultProviderRef.current) {
      initializedDefaultProviderRef.current = true;
    }
  }, [providerOptions, providerToAdd, selectedProviderKeys.length]);

  useEffect(() => {
    let cancelled = false;
    const loadMissing = async () => {
      const missing = selectedProviderKeys.filter((key) => !providerDetailsMap[key]);
      for (const key of missing) {
        try {
          const detail = await environmentApi.environment.getAiAgentLlmProvider(projectId || '', key, firstBackendType);
          if (cancelled) return;
          setProviderDetailsMap((prev) => ({ ...prev, [key]: detail }));
        } catch (error: any) {
          if (!cancelled) notify(`加载 Provider 详情失败: ${error?.message || error}`, 'error');
        }
      }
    };
    void loadMissing();
    return () => { cancelled = true; };
  }, [projectId, firstBackendType, selectedProviderKeys, providerDetailsMap, notify]);

  const applyProviderDefaultsToDraft = (providerKey: string, detail: AiAgentLlmProviderDetail) => {
    setEnvEntries((prev) => {
      const envMap = new Map<string, EnvEntry>();
      prev.forEach((entry) => {
        const key = String(entry.key || '').trim();
        if (!key) return;
        envMap.set(key, entry);
      });
      Object.entries(detail.env_bindings || {}).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        const existing = envMap.get(key);
        if (existing) {
          envMap.set(key, { ...existing, value });
        } else {
          envMap.set(key, createEnvEntry(key, value));
        }
      });
      return Array.from(envMap.values());
    });

    setFileEntries((prev) => {
      const fileMap = new Map<string, FileEntry>();
      prev.forEach((entry) => {
        const path = String(entry.path || '').trim();
        if (!path) return;
        fileMap.set(path, entry);
      });
      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        const next = createFileEntry({
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        });
        const existing = fileMap.get(path);
        if (existing) {
          fileMap.set(path, { ...existing, ...next, id: existing.id, path });
        } else {
          fileMap.set(path, next);
        }
      });
      return Array.from(fileMap.values());
    });
  };

  const buildProviderDefaultsByKeys = (providerKeys: string[]) => {
    const envMap = new Map<string, { value: string; provider_key: string }>();
    const fileMap = new Map<string, Omit<FileEntry, 'id'>>();

    providerKeys.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;

      Object.entries(detail.env_bindings || {}).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        envMap.set(key, {
          value: rawValue === undefined || rawValue === null ? '' : String(rawValue),
          provider_key: providerKey,
        });
      });

      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        fileMap.set(path, {
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        });
      });
    });

    return { envMap, fileMap };
  };

  const isFileEntryEquivalent = (entry: FileEntry, expected: Omit<FileEntry, 'id'>) => {
    return String(entry.path || '').trim() === String(expected.path || '').trim()
      && String(entry.name || '') === String(expected.name || '')
      && String(entry.content || '') === String(expected.content || '')
      && String(entry.format || '') === String(expected.format || '')
      && Boolean(entry.enabled) === Boolean(expected.enabled)
      && String(entry.provider_key || '') === String(expected.provider_key || '');
  };

  const addProvider = () => {
    const key = String(providerToAdd || '').trim();
    if (!key) return;
    const exists = selectedProviderKeys.includes(key);
    if (!exists) {
      setSelectedProviderKeys((prev) => [...prev, key]);
    }
    const detail = providerDetailsMap[key];
    if (detail) {
      applyProviderDefaultsToDraft(key, detail);
      return;
    }
    setPendingProviderDraftApply((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const removeProvider = (providerKey: string) => {
    const prevKeys = [...selectedProviderKeys];
    if (!prevKeys.includes(providerKey)) return;
    const remainKeys = prevKeys.filter((item) => item !== providerKey);

    setSelectedProviderKeys(remainKeys);
    setPendingProviderDraftApply((prev) => prev.filter((item) => item !== providerKey));

    const removedDetail = providerDetailsMap[providerKey];
    if (!removedDetail) return;

    const removedDefaults = buildProviderDefaultsByKeys([providerKey]);
    const remainDefaults = buildProviderDefaultsByKeys(remainKeys);

    setEnvEntries((prev) => {
      const envMap = new Map<string, EnvEntry>();
      prev.forEach((entry) => {
        const key = String(entry.key || '').trim();
        if (!key) return;
        envMap.set(key, entry);
      });

      removedDefaults.envMap.forEach((removedVal, key) => {
        const current = envMap.get(key);
        if (!current) return;
        const currentValue = String(current.value ?? '');
        if (currentValue !== removedVal.value) {
          return;
        }
        const remainVal = remainDefaults.envMap.get(key);
        if (remainVal) {
          envMap.set(key, { ...current, value: remainVal.value });
        } else {
          envMap.delete(key);
        }
      });

      return Array.from(envMap.values());
    });

    setFileEntries((prev) => {
      const fileMap = new Map<string, FileEntry>();
      prev.forEach((entry) => {
        const path = String(entry.path || '').trim();
        if (!path) return;
        fileMap.set(path, entry);
      });

      removedDefaults.fileMap.forEach((removedFile, path) => {
        const current = fileMap.get(path);
        if (!current) return;
        if (!isFileEntryEquivalent(current, removedFile)) {
          return;
        }
        const remainFile = remainDefaults.fileMap.get(path);
        if (remainFile) {
          fileMap.set(path, {
            ...current,
            name: remainFile.name,
            path: remainFile.path,
            content: remainFile.content,
            format: remainFile.format,
            enabled: remainFile.enabled,
            provider_key: remainFile.provider_key,
          });
        } else {
          fileMap.delete(path);
        }
      });

      return Array.from(fileMap.values());
    });
  };

  const moveProvider = (index: number, offset: number) => {
    setSelectedProviderKeys((prev) => {
      const target = index + offset;
      if (target < 0 || target >= prev.length || index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  useEffect(() => {
    if (pendingProviderDraftApply.length === 0) return;
    const resolved = pendingProviderDraftApply.filter((providerKey) => !!providerDetailsMap[providerKey]);
    if (resolved.length === 0) return;
    resolved.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;
      applyProviderDefaultsToDraft(providerKey, detail);
    });
    setPendingProviderDraftApply((prev) => prev.filter((providerKey) => !resolved.includes(providerKey)));
  }, [pendingProviderDraftApply, providerDetailsMap]);

  const providerPreview = useMemo(() => {
    const mergedEnv: Array<{ key: string; value: string; provider_key: string }> = [];
    const envMap = new Map<string, { value: string; provider_key: string }>();
    const fileMap = new Map<string, FileEntry>();
    selectedProviderKeys.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;
      Object.entries(detail.env_bindings || {}).forEach(([key, value]) => {
        envMap.set(String(key), {
          value: value === undefined || value === null ? '' : String(value),
          provider_key: providerKey,
        });
      });
      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        fileMap.set(path, createFileEntry({
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        }));
      });
    });
    envMap.forEach((val, key) => {
      mergedEnv.push({ key, value: val.value, provider_key: val.provider_key });
    });
    return {
      env: mergedEnv.sort((a, b) => a.key.localeCompare(b.key)),
      files: Array.from(fileMap.values()),
    };
  }, [selectedProviderKeys, providerDetailsMap]);

  const submitEnvPreview = useMemo(() => {
    return Object.entries(envEntriesToObject(envEntries))
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [envEntries]);

  const submitFilePreview = useMemo(() => {
    return fileEntries
      .map((item) => ({
        name: item.name,
        path: item.path,
        content: item.content,
        format: item.format,
        enabled: item.enabled,
        provider_key: item.provider_key || undefined,
      }))
      .filter((item) => String(item.path || '').trim() && typeof item.content === 'string');
  }, [fileEntries]);

  const submit = async () => {
    const draft: AiAgentLlmConfigDraft = {
      provider_keys: selectedProviderKeys,
      merge_strategy: mergeStrategy,
      env_overrides: envEntriesToObject(envEntries),
      file_overrides: fileEntries
        .map((item) => ({
          name: item.name,
          path: item.path,
          content: item.content,
          format: item.format,
          enabled: item.enabled,
          provider_key: item.provider_key || undefined,
        }))
        .filter((item) => String(item.path || '').trim() && typeof item.content === 'string') as AiAgentLlmFileBinding[],
    };
    await onSubmit(draft);
  };

  return (
    <ModalShell
      title="批量配置AI Agent"
      description="对当前勾选的 AI Agent 批量写入或刷新配置中心中的 LLM 映射。"
      onClose={onClose}
      compactHeight
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-[180px]">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-theme-text-muted">目标范围</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-2xl font-black text-theme-text-primary">{selectedAgents.length}</span>
                <span className="pb-0.5 text-sm text-theme-text-muted">个 AI Agent</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {backendTypes.map((item) => (
                <span key={item} className="rounded-full bg-theme-bg-app px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-theme-text-secondary ring-1 ring-theme-border">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-theme-border bg-theme-bg-app p-2">
          <button
            type="button"
            onClick={() => setActiveTab('providers')}
            className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'providers' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
          >
            Provider编排
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('env')}
            className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'env' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
          >
            环境变量
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'files' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
          >
            文件注入
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'submit' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
          >
            下发与结果
          </button>
        </div>

        <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
          {activeTab === 'providers' ? (
            <div className="space-y-3">
              <div className="text-sm font-black text-theme-text-primary">选择 Provider 后点击“增加”</div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <select
                  value={providerToAdd}
                  onChange={(e) => setProviderToAdd(e.target.value)}
                  className="flex-1 rounded-xl border border-theme-border px-3 py-2 text-xs"
                >
                  {providerOptions.map((provider) => (
                    <option key={provider.provider_key} value={provider.provider_key}>
                      {provider.display_name || provider.provider_key} · {provider.provider_type}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addProvider}
                  disabled={!providerToAdd}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  <Plus size={14} />
                  增加
                </button>
              </div>
              <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                {selectedProviderKeys.length === 0 ? (
                  <div className="text-xs text-theme-text-muted">尚未添加 Provider。</div>
                ) : selectedProviderKeys.map((providerKey, index) => {
                  const provider = providerOptions.find((item) => item.provider_key === providerKey);
                  return (
                    <div key={providerKey} className="rounded-xl border border-theme-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-theme-text-primary">{provider?.display_name || providerKey}</div>
                          <div className="text-xs text-theme-text-muted">{providerKey} · {provider?.provider_type || 'unknown'}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveProvider(index, -1)} disabled={index === 0} className="rounded border border-theme-border px-2 py-1 text-xs disabled:opacity-40">↑</button>
                          <button type="button" onClick={() => moveProvider(index, 1)} disabled={index === selectedProviderKeys.length - 1} className="rounded border border-theme-border px-2 py-1 text-xs disabled:opacity-40">↓</button>
                          <button type="button" onClick={() => removeProvider(providerKey)} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">本次即将添加预览</div>
                <div className="mt-2 text-xs text-theme-text-secondary">环境变量 {providerPreview.env.length} 项 · 文件注入 {providerPreview.files.length} 项</div>
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                    <div className="text-xs font-black text-theme-text-secondary">环境变量</div>
                    <div className="mt-2 max-h-[180px] space-y-1 overflow-auto pr-1">
                      {providerPreview.env.length === 0 ? <div className="text-[11px] text-theme-text-muted">暂无</div> : providerPreview.env.map((item) => (
                        <div key={item.key} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                          <div className="font-semibold text-theme-text-primary">{item.key}</div>
                          <div className="truncate text-theme-text-secondary">{item.value}</div>
                          <div className="text-theme-text-muted">来源: {item.provider_key}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                    <div className="text-xs font-black text-theme-text-secondary">文件注入</div>
                    <div className="mt-2 max-h-[180px] space-y-1 overflow-auto pr-1">
                      {providerPreview.files.length === 0 ? <div className="text-[11px] text-theme-text-muted">暂无</div> : providerPreview.files.map((item) => (
                        <div key={`${item.path}-${item.provider_key || ''}`} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                          <div className="font-semibold text-theme-text-primary">{item.path}</div>
                          <div className="text-theme-text-secondary">{item.name || '-'}</div>
                          <div className="text-theme-text-muted">来源: {item.provider_key || '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'env' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-theme-text-primary">环境变量覆盖</div>
                <button type="button" onClick={() => setEnvEntries((prev) => [...prev, createEnvEntry('', '')])} className="rounded border border-theme-border px-2 py-1 text-xs">新增</button>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                {envEntries.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)_72px]">
                    <input value={entry.key} onChange={(e) => setEnvEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, key: e.target.value } : it))} className="rounded border border-theme-border px-2 py-1 text-xs" placeholder="KEY" />
                    <input value={entry.value} onChange={(e) => setEnvEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, value: e.target.value } : it))} className="rounded border border-theme-border px-2 py-1 text-xs" placeholder="VALUE" />
                    <button type="button" onClick={() => setEnvEntries((prev) => prev.filter((it) => it.id !== entry.id))} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'files' ? (
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-theme-text-primary">文件注入覆盖</div>
                <button type="button" onClick={() => setFileEntries((prev) => [...prev, createFileEntry()])} className="rounded border border-theme-border px-2 py-1 text-xs">新增</button>
              </div>
              <div className="mt-3 max-h-[420px] space-y-3 overflow-auto pr-1">
                {fileEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-theme-border p-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="text-xs text-theme-text-secondary">
                        <div className="mb-1 font-semibold text-theme-text-secondary">名称（name）</div>
                        <input value={entry.name} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, name: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="例如: claude-config" />
                      </label>
                      <label className="text-xs text-theme-text-secondary">
                        <div className="mb-1 font-semibold text-theme-text-secondary">注入路径（path）</div>
                        <input value={entry.path} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, path: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="例如: /etc/agent/config.json" />
                      </label>
                      <label className="text-xs text-theme-text-secondary">
                        <div className="mb-1 font-semibold text-theme-text-secondary">格式（format）</div>
                        <input value={entry.format} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, format: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="json/yaml/env/other" />
                      </label>
                      <label className="text-xs text-theme-text-secondary">
                        <div className="mb-1 font-semibold text-theme-text-secondary">来源 Provider（可选）</div>
                        <input value={entry.provider_key || ''} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, provider_key: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="provider_key(optional)" />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs text-theme-text-secondary">
                      <div className="mb-1 font-semibold text-theme-text-secondary">文件内容（content）</div>
                      <textarea value={entry.content} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, content: e.target.value } : it))} rows={4} className="w-full rounded border border-theme-border px-2 py-1 text-xs font-mono" placeholder="输入将注入到文件中的完整内容" />
                    </label>
                    <div className="mt-2 flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 text-xs text-theme-text-secondary"><input type="checkbox" checked={entry.enabled} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, enabled: e.target.checked } : it))} />启用（enabled）</label>
                      <button type="button" onClick={() => setFileEntries((prev) => prev.filter((it) => it.id !== entry.id))} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'submit' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">冲突策略</div>
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2"><input type="radio" checked={mergeStrategy === 'overwrite'} onChange={() => setMergeStrategy('overwrite')} />覆盖</label>
                  <label className="inline-flex items-center gap-2"><input type="radio" checked={mergeStrategy === 'merge'} onChange={() => setMergeStrategy('merge')} />合并</label>
                </div>
              </div>
              <div className="text-xs text-theme-text-muted">Provider: {selectedProviderKeys.length}，Env: {envEntries.length}，Files: {fileEntries.length}</div>
              <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">最终配置注入预览（只读）</div>
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                    <div className="text-xs font-black text-theme-text-secondary">环境变量（{submitEnvPreview.length}）</div>
                    <div className="mt-2 max-h-[220px] space-y-1 overflow-auto pr-1">
                      {submitEnvPreview.length === 0 ? (
                        <div className="text-[11px] text-theme-text-muted">暂无</div>
                      ) : submitEnvPreview.map((item) => (
                        <div key={item.key} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                          <div className="font-semibold text-theme-text-primary">{item.key}</div>
                          <div className="break-all text-theme-text-secondary">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                    <div className="text-xs font-black text-theme-text-secondary">文件注入（{submitFilePreview.length}）</div>
                    <div className="mt-2 max-h-[220px] space-y-1 overflow-auto pr-1">
                      {submitFilePreview.length === 0 ? (
                        <div className="text-[11px] text-theme-text-muted">暂无</div>
                      ) : submitFilePreview.map((item, index) => (
                        <div key={`${item.path}-${index}`} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                          <div className="font-semibold text-theme-text-primary">{item.path}</div>
                          <div className="text-theme-text-secondary">名称: {item.name || '-'} · 格式: {item.format || '-'} · 启用: {item.enabled ? '是' : '否'}</div>
                          <div className="text-theme-text-muted">来源: {item.provider_key || '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => void submit()} disabled={llmBusy === 'configure-batch' || selectedAgents.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {llmBusy === 'configure-batch' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                确定配置并下发
              </button>
              {result ? <JsonBlock title="最近一次批量配置结果" value={result} className="bg-theme-bg-app" /> : <EmptyState text="暂无批量执行结果。" />}
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
};

const SingleAgentLlmModal: React.FC<{
  projectId: string;
  agent: ProjectAiAgentItem;
  providerOptions: AiAgentLlmProviderSummary[];
  initialDraft: AiAgentLlmConfigDraft | null;
  initialLoading: boolean;
  llmBusy: string;
  notice: { type: 'success' | 'error'; text: string } | null;
  notify: (message: string, type?: 'success' | 'error' | 'warning') => void;
  onClose: () => void;
  onApply: (draft: AiAgentLlmConfigDraft) => Promise<void>;
  onClear: () => Promise<void>;
}> = ({ projectId, agent, providerOptions, initialDraft, initialLoading, llmBusy, notice, notify, onClose, onApply, onClear }) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'env' | 'files' | 'submit'>('providers');
  const [providerToAdd, setProviderToAdd] = useState('');
  const [selectedProviderKeys, setSelectedProviderKeys] = useState<string[]>([]);
  const [providerDetailsMap, setProviderDetailsMap] = useState<Record<string, AiAgentLlmProviderDetail>>({});
  const [pendingProviderDraftApply, setPendingProviderDraftApply] = useState<string[]>([]);
  const [mergeStrategy, setMergeStrategy] = useState<'overwrite' | 'merge'>('overwrite');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const backendType = String(agent.backend_type || '').trim();
  const currentBindingName = formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key });

  useEffect(() => {
    setProviderToAdd('');
  }, [agent.agent_id]);

  useEffect(() => {
    const providerKeys = Array.isArray(initialDraft?.provider_keys) ? initialDraft.provider_keys : [];
    const envOverrides = initialDraft?.env_overrides && typeof initialDraft.env_overrides === 'object' ? initialDraft.env_overrides : {};
    const fileOverrides = Array.isArray(initialDraft?.file_overrides) ? initialDraft.file_overrides : [];
    const strategy = initialDraft?.merge_strategy === 'merge' ? 'merge' : 'overwrite';

    setSelectedProviderKeys(providerKeys.map((item) => String(item || '').trim()).filter(Boolean));
    setEnvEntries(envObjectToEntries(envOverrides));
    setFileEntries(fileOverrides.map((item) => createFileEntry({
      name: String(item?.name || ''),
      path: String(item?.path || ''),
      content: String(item?.content || ''),
      format: String(item?.format || 'other'),
      enabled: item?.enabled !== false,
      provider_key: String(item?.provider_key || ''),
    })));
    setMergeStrategy(strategy);
    setPendingProviderDraftApply([]);
    setActiveTab('providers');
    setShowSubmitConfirm(false);
  }, [initialDraft, agent.agent_id]);

  useEffect(() => {
    let cancelled = false;

    const loadMissing = async () => {
      const missing = Array.from(new Set([providerToAdd, ...selectedProviderKeys].filter(Boolean))).filter((key) => !providerDetailsMap[key]);
      for (const key of missing) {
        try {
          const detail = await environmentApi.environment.getAiAgentLlmProvider(projectId || '', key, backendType);
          if (cancelled) return;
          setProviderDetailsMap((prev) => ({ ...prev, [key]: detail }));
        } catch (error: any) {
          if (!cancelled) notify(`加载 Provider 详情失败: ${error?.message || error}`, 'error');
        }
      }
    };

    void loadMissing();
    return () => {
      cancelled = true;
    };
  }, [projectId, backendType, providerToAdd, selectedProviderKeys, providerDetailsMap, notify]);

  const applyProviderDefaultsToDraft = (providerKey: string, detail: AiAgentLlmProviderDetail) => {
    setEnvEntries((prev) => {
      const envMap = new Map<string, EnvEntry>();
      prev.forEach((entry) => {
        const key = String(entry.key || '').trim();
        if (!key) return;
        envMap.set(key, entry);
      });
      Object.entries(detail.env_bindings || {}).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        const existing = envMap.get(key);
        if (existing) {
          envMap.set(key, { ...existing, value });
        } else {
          envMap.set(key, createEnvEntry(key, value));
        }
      });
      return Array.from(envMap.values());
    });

    setFileEntries((prev) => {
      const fileMap = new Map<string, FileEntry>();
      prev.forEach((entry) => {
        const path = String(entry.path || '').trim();
        if (!path) return;
        fileMap.set(path, entry);
      });
      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        const next = createFileEntry({
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        });
        const existing = fileMap.get(path);
        if (existing) {
          fileMap.set(path, { ...existing, ...next, id: existing.id, path });
        } else {
          fileMap.set(path, next);
        }
      });
      return Array.from(fileMap.values());
    });
  };

  const buildProviderDefaultsByKeys = (providerKeys: string[]) => {
    const envMap = new Map<string, { value: string; provider_key: string }>();
    const fileMap = new Map<string, Omit<FileEntry, 'id'>>();

    providerKeys.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;

      Object.entries(detail.env_bindings || {}).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        envMap.set(key, {
          value: rawValue === undefined || rawValue === null ? '' : String(rawValue),
          provider_key: providerKey,
        });
      });

      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        fileMap.set(path, {
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        });
      });
    });

    return { envMap, fileMap };
  };

  const isFileEntryEquivalent = (entry: FileEntry, expected: Omit<FileEntry, 'id'>) => {
    return String(entry.path || '').trim() === String(expected.path || '').trim()
      && String(entry.name || '') === String(expected.name || '')
      && String(entry.content || '') === String(expected.content || '')
      && String(entry.format || '') === String(expected.format || '')
      && Boolean(entry.enabled) === Boolean(expected.enabled)
      && String(entry.provider_key || '') === String(expected.provider_key || '');
  };

  const addProvider = () => {
    const key = String(providerToAdd || '').trim();
    if (!key) return;
    const exists = selectedProviderKeys.includes(key);
    if (!exists) {
      setSelectedProviderKeys((prev) => [...prev, key]);
    }
    const detail = providerDetailsMap[key];
    if (detail) {
      applyProviderDefaultsToDraft(key, detail);
      return;
    }
    setPendingProviderDraftApply((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const removeProvider = (providerKey: string) => {
    const prevKeys = [...selectedProviderKeys];
    if (!prevKeys.includes(providerKey)) return;
    const remainKeys = prevKeys.filter((item) => item !== providerKey);

    setSelectedProviderKeys(remainKeys);
    setPendingProviderDraftApply((prev) => prev.filter((item) => item !== providerKey));

    const removedDetail = providerDetailsMap[providerKey];
    if (!removedDetail) return;

    const removedDefaults = buildProviderDefaultsByKeys([providerKey]);
    const remainDefaults = buildProviderDefaultsByKeys(remainKeys);

    setEnvEntries((prev) => {
      const envMap = new Map<string, EnvEntry>();
      prev.forEach((entry) => {
        const key = String(entry.key || '').trim();
        if (!key) return;
        envMap.set(key, entry);
      });

      removedDefaults.envMap.forEach((removedVal, key) => {
        const current = envMap.get(key);
        if (!current) return;
        const currentValue = String(current.value ?? '');
        if (currentValue !== removedVal.value) return;
        const remainVal = remainDefaults.envMap.get(key);
        if (remainVal) {
          envMap.set(key, { ...current, value: remainVal.value });
        } else {
          envMap.delete(key);
        }
      });

      return Array.from(envMap.values());
    });

    setFileEntries((prev) => {
      const fileMap = new Map<string, FileEntry>();
      prev.forEach((entry) => {
        const path = String(entry.path || '').trim();
        if (!path) return;
        fileMap.set(path, entry);
      });

      removedDefaults.fileMap.forEach((removedFile, path) => {
        const current = fileMap.get(path);
        if (!current) return;
        if (!isFileEntryEquivalent(current, removedFile)) return;
        const remainFile = remainDefaults.fileMap.get(path);
        if (remainFile) {
          fileMap.set(path, {
            ...current,
            name: remainFile.name,
            path: remainFile.path,
            content: remainFile.content,
            format: remainFile.format,
            enabled: remainFile.enabled,
            provider_key: remainFile.provider_key,
          });
        } else {
          fileMap.delete(path);
        }
      });

      return Array.from(fileMap.values());
    });
  };

  const moveProvider = (index: number, offset: number) => {
    setSelectedProviderKeys((prev) => {
      const target = index + offset;
      if (target < 0 || target >= prev.length || index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  useEffect(() => {
    if (pendingProviderDraftApply.length === 0) return;
    const resolved = pendingProviderDraftApply.filter((providerKey) => !!providerDetailsMap[providerKey]);
    if (resolved.length === 0) return;
    resolved.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;
      applyProviderDefaultsToDraft(providerKey, detail);
    });
    setPendingProviderDraftApply((prev) => prev.filter((providerKey) => !resolved.includes(providerKey)));
  }, [pendingProviderDraftApply, providerDetailsMap]);

  const providerPreview = useMemo(() => {
    const mergedEnv: Array<{ key: string; value: string; provider_key: string }> = [];
    const envMap = new Map<string, { value: string; provider_key: string }>();
    const fileMap = new Map<string, FileEntry>();
    selectedProviderKeys.forEach((providerKey) => {
      const detail = providerDetailsMap[providerKey];
      if (!detail) return;
      Object.entries(detail.env_bindings || {}).forEach(([key, value]) => {
        envMap.set(String(key), {
          value: value === undefined || value === null ? '' : String(value),
          provider_key: providerKey,
        });
      });
      (detail.file_bindings || []).forEach((item, idx) => {
        if (!item?.enabled) return;
        const path = String(item.path || '').trim();
        if (!path) return;
        fileMap.set(path, createFileEntry({
          name: String(item.name || '').trim() ||`${providerKey}-file-${idx + 1}`,
          path,
          content: String(item.content || ''),
          format: String(item.format || 'other'),
          enabled: true,
          provider_key: providerKey,
        }));
      });
    });
    envMap.forEach((val, key) => {
      mergedEnv.push({ key, value: val.value, provider_key: val.provider_key });
    });
    return {
      env: mergedEnv.sort((a, b) => a.key.localeCompare(b.key)),
      files: Array.from(fileMap.values()),
    };
  }, [selectedProviderKeys, providerDetailsMap]);

  const submitDraft = useMemo<AiAgentLlmConfigDraft>(() => ({
    provider_keys: selectedProviderKeys,
    merge_strategy: mergeStrategy,
    env_overrides: envEntriesToObject(envEntries),
    file_overrides: fileEntries
      .map((item) => ({
        name: item.name,
        path: item.path,
        content: item.content,
        format: item.format,
        enabled: item.enabled,
        provider_key: item.provider_key || undefined,
      }))
      .filter((item) => String(item.path || '').trim() && typeof item.content === 'string') as AiAgentLlmFileBinding[],
  }), [selectedProviderKeys, mergeStrategy, envEntries, fileEntries]);

  const submitEnvPreview = useMemo(() => {
    return Object.entries(submitDraft.env_overrides || {})
      .map(([key, value]) => ({ key, value: String(value ?? '') }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [submitDraft]);

  const submitFilePreview = useMemo(() => submitDraft.file_overrides || [], [submitDraft]);

  const submit = async () => {
    setConfirmBusy(true);
    try {
      await onApply(submitDraft);
      setShowSubmitConfirm(false);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <ModalShell
      title={`为 ${agent.agent_id} 选择 LLM 配置`}
      description="支持多 Provider 编排，编辑环境变量与文件注入后，进行二次确认下发。"
      onClose={onClose}
      maxWidthClassName="max-w-6xl"
      compactHeight
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-theme-border bg-theme-elevated p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">Target Agent</div>
          <div className="mt-2 text-xl font-black text-slate-200">{agent.agent_id}</div>
          <div className="mt-1 text-sm text-theme-text-muted">{agent.agent_hostname || agent.agent_key} · {agent.service_name}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-theme-text-faint ring-1 ring-theme-border">{agent.backend_type}</span>
            <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-semibold text-theme-text-faint ring-1 ring-theme-border">当前: {currentBindingName}</span>
          </div>
        </div>

        {initialLoading ? (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-6 text-sm text-theme-text-secondary">
            <div className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              正在从 helper 加载当前已生效配置...
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-theme-border bg-theme-bg-app p-2">
              <button
                type="button"
                onClick={() => setActiveTab('providers')}
                className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'providers' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                Provider编排
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('env')}
                className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'env' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                环境变量
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'files' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                文件注入
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('submit')}
                className={`rounded-xl px-3 py-2 text-xs font-black tracking-[0.08em] ${activeTab === 'submit' ? 'bg-cyan-600 text-white' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
              >
                下发与结果
              </button>
            </div>

            <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
              {activeTab === 'providers' ? (
                <div className="space-y-4">
                  <div className="text-sm font-black text-theme-text-primary">选择 Provider 后点击“新增”加入草稿</div>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={providerToAdd}
                      onChange={(e) => setProviderToAdd(e.target.value)}
                      className="flex-1 rounded-xl border border-theme-border px-3 py-2 text-xs"
                    >
                      <option value="">选择 LLM Provider</option>
                      {providerOptions.map((provider) => (
                        <option key={provider.provider_key} value={provider.provider_key}>
                          {provider.display_name || provider.provider_key} · {provider.provider_type}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addProvider}
                      disabled={!providerToAdd}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Plus size={14} />
                      新增
                    </button>
                  </div>

                  <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                    {selectedProviderKeys.length === 0 ? (
                      <div className="text-xs text-theme-text-muted">尚未添加 Provider。</div>
                    ) : selectedProviderKeys.map((providerKey, index) => {
                      const provider = providerOptions.find((item) => item.provider_key === providerKey);
                      return (
                        <div key={`${providerKey}-${index}`} className="rounded-xl border border-theme-border px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-theme-text-primary">{provider?.display_name || providerKey}</div>
                              <div className="text-xs text-theme-text-muted">{providerKey} · {provider?.provider_type || 'unknown'}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => moveProvider(index, -1)} disabled={index === 0} className="rounded border border-theme-border px-2 py-1 text-xs disabled:opacity-40">↑</button>
                              <button type="button" onClick={() => moveProvider(index, 1)} disabled={index === selectedProviderKeys.length - 1} className="rounded border border-theme-border px-2 py-1 text-xs disabled:opacity-40">↓</button>
                              <button type="button" onClick={() => removeProvider(providerKey)} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">当前 Provider 合并预览</div>
                    <div className="mt-2 text-xs text-theme-text-secondary">环境变量 {providerPreview.env.length} 项 · 文件注入 {providerPreview.files.length} 项</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                        <div className="text-xs font-black text-theme-text-secondary">环境变量</div>
                        <div className="mt-2 max-h-[180px] space-y-1 overflow-auto pr-1">
                          {providerPreview.env.length === 0 ? <div className="text-[11px] text-theme-text-muted">暂无</div> : providerPreview.env.map((item) => (
                            <div key={item.key} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                              <div className="font-semibold text-theme-text-primary">{item.key}</div>
                              <div className="truncate text-theme-text-secondary">{item.value}</div>
                              <div className="text-theme-text-muted">来源: {item.provider_key}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                        <div className="text-xs font-black text-theme-text-secondary">文件注入</div>
                        <div className="mt-2 max-h-[180px] space-y-1 overflow-auto pr-1">
                          {providerPreview.files.length === 0 ? <div className="text-[11px] text-theme-text-muted">暂无</div> : providerPreview.files.map((item) => (
                            <div key={`${item.path}-${item.provider_key || ''}`} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                              <div className="font-semibold text-theme-text-primary">{item.path}</div>
                              <div className="text-theme-text-secondary">{item.name || '-'}</div>
                              <div className="text-theme-text-muted">来源: {item.provider_key || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === 'env' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black text-theme-text-primary">环境变量覆盖（可编辑）</div>
                    <button type="button" onClick={() => setEnvEntries((prev) => [...prev, createEnvEntry('', '')])} className="rounded border border-theme-border px-2 py-1 text-xs">新增</button>
                  </div>
                  <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                    {envEntries.map((entry) => (
                      <div key={entry.id} className="grid grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)_72px]">
                        <input value={entry.key} onChange={(e) => setEnvEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, key: e.target.value } : it))} className="rounded border border-theme-border px-2 py-1 text-xs" placeholder="KEY" />
                        <input value={entry.value} onChange={(e) => setEnvEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, value: e.target.value } : it))} className="rounded border border-theme-border px-2 py-1 text-xs" placeholder="VALUE" />
                        <button type="button" onClick={() => setEnvEntries((prev) => prev.filter((it) => it.id !== entry.id))} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === 'files' ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black text-theme-text-primary">文件注入覆盖（可编辑）</div>
                    <button type="button" onClick={() => setFileEntries((prev) => [...prev, createFileEntry()])} className="rounded border border-theme-border px-2 py-1 text-xs">新增</button>
                  </div>
                  <div className="mt-3 max-h-[420px] space-y-3 overflow-auto pr-1">
                    {fileEntries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-theme-border p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <label className="text-xs text-theme-text-secondary">
                            <div className="mb-1 font-semibold text-theme-text-secondary">名称（name）</div>
                            <input value={entry.name} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, name: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="例如: claude-config" />
                          </label>
                          <label className="text-xs text-theme-text-secondary">
                            <div className="mb-1 font-semibold text-theme-text-secondary">注入路径（path）</div>
                            <input value={entry.path} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, path: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="例如: /etc/agent/config.json" />
                          </label>
                          <label className="text-xs text-theme-text-secondary">
                            <div className="mb-1 font-semibold text-theme-text-secondary">格式（format）</div>
                            <input value={entry.format} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, format: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="json/yaml/env/other" />
                          </label>
                          <label className="text-xs text-theme-text-secondary">
                            <div className="mb-1 font-semibold text-theme-text-secondary">来源 Provider（可选）</div>
                            <input value={entry.provider_key || ''} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, provider_key: e.target.value } : it))} className="w-full rounded border border-theme-border px-2 py-1 text-xs" placeholder="provider_key(optional)" />
                          </label>
                        </div>
                        <label className="mt-2 block text-xs text-theme-text-secondary">
                          <div className="mb-1 font-semibold text-theme-text-secondary">文件内容（content）</div>
                          <textarea value={entry.content} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, content: e.target.value } : it))} rows={4} className="w-full rounded border border-theme-border px-2 py-1 text-xs font-mono" placeholder="输入将注入到文件中的完整内容" />
                        </label>
                        <div className="mt-2 flex items-center justify-between">
                          <label className="inline-flex items-center gap-2 text-xs text-theme-text-secondary"><input type="checkbox" checked={entry.enabled} onChange={(e) => setFileEntries((prev) => prev.map((it) => it.id === entry.id ? { ...it, enabled: e.target.checked } : it))} />启用（enabled）</label>
                          <button type="button" onClick={() => setFileEntries((prev) => prev.filter((it) => it.id !== entry.id))} className="rounded border border-rose-500/20 px-2 py-1 text-xs text-rose-400">删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === 'submit' ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">冲突策略</div>
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <label className="inline-flex items-center gap-2"><input type="radio" checked={mergeStrategy === 'overwrite'} onChange={() => setMergeStrategy('overwrite')} />覆盖</label>
                      <label className="inline-flex items-center gap-2"><input type="radio" checked={mergeStrategy === 'merge'} onChange={() => setMergeStrategy('merge')} />合并</label>
                    </div>
                  </div>
                  <div className="text-xs text-theme-text-muted">Provider: {selectedProviderKeys.length}，Env: {submitEnvPreview.length}，Files: {submitFilePreview.length}</div>
                  <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-theme-text-muted">最终配置注入预览（只读）</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                        <div className="text-xs font-black text-theme-text-secondary">环境变量（{submitEnvPreview.length}）</div>
                        <div className="mt-2 max-h-[220px] space-y-1 overflow-auto pr-1">
                          {submitEnvPreview.length === 0 ? (
                            <div className="text-[11px] text-theme-text-muted">暂无</div>
                          ) : submitEnvPreview.map((item) => (
                            <div key={item.key} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                              <div className="font-semibold text-theme-text-primary">{item.key}</div>
                              <div className="break-all text-theme-text-secondary">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-theme-border bg-theme-bg-app p-2">
                        <div className="text-xs font-black text-theme-text-secondary">文件注入（{submitFilePreview.length}）</div>
                        <div className="mt-2 max-h-[220px] space-y-1 overflow-auto pr-1">
                          {submitFilePreview.length === 0 ? (
                            <div className="text-[11px] text-theme-text-muted">暂无</div>
                          ) : submitFilePreview.map((item, index) => (
                            <div key={`${item.path}-${index}`} className="rounded border border-theme-border px-2 py-1 text-[11px]">
                              <div className="font-semibold text-theme-text-primary">{item.path}</div>
                              <div className="text-theme-text-secondary">名称: {item.name || '-'} · 格式: {item.format || '-'} · 启用: {item.enabled ? '是' : '否'}</div>
                              <div className="text-theme-text-muted">来源: {item.provider_key || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={llmBusy === 'configure-single'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {llmBusy === 'configure-single' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    应用到当前 Agent
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
              <div className="text-sm font-black text-theme-text-primary">清除绑定</div>
              <div className="mt-2 text-xs text-theme-text-muted">保留原有清除逻辑：移除映射环境变量并清空 LLM 绑定信息。</div>
              <button
                onClick={() => void onClear()}
                disabled={!agent.llm_provider_key && (agent.llm_provider_mapped_env_keys || []).length === 0}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-400 disabled:opacity-50"
              >
                {llmBusy === 'clear-single' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                清除当前映射
              </button>
            </div>
          </>
        )}

        {notice ? (
          <div className={`rounded-xl border px-3 py-2 text-sm ${notice.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-red-500/20 bg-red-500/15 text-red-400'}`}>
            {notice.text}
          </div>
        ) : null}

        {showSubmitConfirm ? (
          <div className="fixed inset-0 z-[280] bg-slate-950/50 p-4 md:p-8" onClick={() => setShowSubmitConfirm(false)}>
            <div
              className="mx-auto w-full max-w-5xl rounded-[1.5rem] border border-theme-border bg-theme-bg-app"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-theme-border px-6 py-5">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-400">最终确认</div>
                  <div className="mt-1 text-lg font-black text-theme-text-primary">确认下发到 {agent.agent_id}</div>
                  <div className="mt-1 text-xs text-theme-text-muted">请确认最终配置内容，确认后将立即写入 helper 并生效。</div>
                </div>
                <button onClick={() => setShowSubmitConfirm(false)} className="rounded-lg bg-theme-elevated p-2 text-theme-text-muted hover:bg-theme-elevated">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-[68vh] overflow-auto px-6 py-4">
                <JsonBlock
                  title="下发 Payload 预览"
                  value={{
                    target: {
                      agent_key: agent.agent_key,
                      service_name: agent.service_name,
                      agent_id: agent.agent_id,
                    },
                    provider_keys: submitDraft.provider_keys,
                    merge_strategy: submitDraft.merge_strategy,
                    env_overrides: submitDraft.env_overrides,
                    file_overrides: submitDraft.file_overrides,
                  }}
                  className="bg-theme-bg-app"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-theme-border px-6 py-4">
                <button onClick={() => setShowSubmitConfirm(false)} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">
                  取消
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={confirmBusy || llmBusy === 'configure-single'}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {confirmBusy || llmBusy === 'configure-single' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  确认下发
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
};
const AgentDetailDrawer: React.FC<{
  agent: ProjectAiAgentItem | null;
  helper: AiHelperService | null;
  busyAction: string;
  editForm: { command: string; cwd: string; enabled: boolean; description: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ command: string; cwd: string; enabled: boolean; description: string }>>;
  argEntries: ArgEntry[];
  setArgEntries: React.Dispatch<React.SetStateAction<ArgEntry[]>>;
  argImportText: string;
  setArgImportText: React.Dispatch<React.SetStateAction<string>>;
  argImportError: string;
  onImportArgs: () => boolean;
  envEntries: EnvEntry[];
  setEnvEntries: React.Dispatch<React.SetStateAction<EnvEntry[]>>;
  envImportText: string;
  setEnvImportText: React.Dispatch<React.SetStateAction<string>>;
  envImportError: string;
  onImportEnv: () => boolean;
  onClose: () => void;
  onAction: (action: 'activate' | 'start' | 'stop' | 'delete', agent: ProjectAiAgentItem) => Promise<void>;
  onSaveAgent: () => Promise<void>;
  onSaveEnv: () => Promise<void>;
  helperRuntimeEnv: AiHelperRuntimeEnv | null;
  helperRuntimeEnvLoading: boolean;
  onRefreshHelperRuntimeEnv: () => Promise<void>;
  onOpenLlmModal: () => void;
  providerUpdatedAtMap: Map<string, string>;
}> = ({
  agent,
  helper,
  busyAction,
  editForm,
  setEditForm,
  argEntries,
  setArgEntries,
  argImportText,
  setArgImportText,
  argImportError,
  onImportArgs,
  envEntries,
  setEnvEntries,
  envImportText,
  setEnvImportText,
  envImportError,
  onImportEnv,
  onClose,
  onAction,
  onSaveAgent,
  onSaveEnv,
  helperRuntimeEnv,
  helperRuntimeEnvLoading,
  onRefreshHelperRuntimeEnv,
  onOpenLlmModal,
  providerUpdatedAtMap,
}) => {
  if (!agent) return null;
  const llmStatus = getLlmBindingStatus(agent, providerUpdatedAtMap);
  const summaryUpdatedAt = providerUpdatedAtMap.get(String(agent.llm_provider_key || '').trim()) || '';
  const [showEnvImportModal, setShowEnvImportModal] = useState(false);
  const [showArgImportModal, setShowArgImportModal] = useState(false);

  return (
    <div className="fixed inset-y-0 right-0 z-[210] w-full max-w-[840px] border-l border-theme-border bg-theme-surface shadow-panel">
      <div className="flex h-full flex-col">
        <div className="border-b border-theme-border bg-theme-elevated px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-200">{agent.agent_id}</h2>
              <div className="mt-2 text-sm text-theme-text-muted">{agent.agent_hostname || agent.agent_key} · {agent.service_name} · {agent.backend_type}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-theme-text-muted">
                <span className="rounded-full bg-theme-elevated px-2.5 py-1 font-semibold ring-1 ring-theme-border">当前 LLM: {formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key })}</span>
                <span className="rounded-full bg-theme-bg-app px-2.5 py-1 font-semibold ring-1 ring-theme-border">最近应用: {formatTimestamp(agent.llm_provider_applied_at)}</span>
                <span className="rounded-full bg-theme-bg-app px-2.5 py-1 font-semibold ring-1 ring-theme-border">命令: {agent.command || '-'}</span>
              </div>
            </div>
 <button onClick={onClose} className="rounded-2xl bg-theme-bg-app p-3 text-theme-text-muted ring-1 ring-theme-border transition hover:bg-theme-elevated hover:text-theme-text-primary">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void onAction('activate', agent)} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary"><Play size={14} />激活</button>
            <button onClick={() => void onAction('start', agent)} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary"><Play size={14} />启动</button>
            <button onClick={() => void onAction('stop', agent)} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary"><Power size={14} />停止</button>
            <button onClick={onOpenLlmModal} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white"><WandSparkles size={14} />选择 LLM 配置</button>
            <button onClick={() => void onAction('delete', agent)} className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-3 py-2 text-sm font-semibold text-red-400"><Trash2 size={14} />删除</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="space-y-5">
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
              <div className="text-sm font-black text-theme-text-primary">基础配置</div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm text-theme-text-secondary md:col-span-2">
                  <div className="mb-1.5 font-semibold text-theme-text-primary">二进制/命令路径</div>
                  <input value={editForm.command} onChange={(e) => setEditForm((prev) => ({ ...prev, command: e.target.value }))} className="w-full rounded-xl border border-theme-border px-3 py-2 text-sm" placeholder="例如 /usr/local/bin/codex" />
                </label>
                <label className="text-sm text-theme-text-secondary md:col-span-2">
                  <div className="mb-1.5 font-semibold text-theme-text-primary">工作目录</div>
                  <input value={editForm.cwd} onChange={(e) => setEditForm((prev) => ({ ...prev, cwd: e.target.value }))} className="w-full rounded-xl border border-theme-border px-3 py-2 text-sm" placeholder="可选，例如 /workspace/project" />
                </label>
                <label className="text-sm text-theme-text-secondary md:col-span-2">
                  <div className="mb-1.5 font-semibold text-theme-text-primary">命令行参数</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-theme-text-muted">按行管理参数；每一行代表一个独立参数。</div>
                      <button onClick={() => setShowArgImportModal(true)} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                        批量导入参数
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {argEntries.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-theme-border bg-theme-bg-app px-3 py-4 text-sm text-theme-text-muted">当前没有参数，点击下方按钮添加或批量导入。</div>
                      ) : (
                        argEntries.map((entry, index) => (
                          <div key={entry.id} className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app p-2.5">
                            <span className="w-8 shrink-0 text-center text-xs font-black text-theme-text-muted">{index + 1}</span>
                            <input
                              value={entry.value}
                              onChange={(e) => setArgEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, value: e.target.value } : item)))}
                              className="min-w-0 flex-1 rounded-xl border border-theme-border px-3 py-2 text-sm font-mono"
                              placeholder="例如 --port 或 8080"
                            />
                            <button
                              onClick={() => setArgEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                              className="shrink-0 rounded-xl border border-red-500/20 px-3 py-2 text-sm font-semibold text-red-400"
                            >
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => setArgEntries((prev) => [...prev, createArgEntry('')])} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                        <Plus size={14} />
                        添加参数
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-sm text-theme-text-secondary md:col-span-2">
                  <div className="mb-1.5 font-semibold text-theme-text-primary">描述</div>
                  <input value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full rounded-xl border border-theme-border px-3 py-2 text-sm" placeholder="描述这个 AI Agent 的用途" />
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-theme-text-secondary md:col-span-2"><input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm((prev) => ({ ...prev, enabled: e.target.checked }))} />启用该 AI Agent</label>
                <button onClick={() => void onSaveAgent()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
                  {busyAction ===`update:${agent.agent_id}` ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  保存配置
                </button>
              </div>
            </div>

 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-theme-text-primary">环境变量</div>
                <button onClick={() => void onSaveEnv()} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white">
                  {busyAction ===`env:${agent.agent_id}` ? <Loader2 size={15} className="animate-spin" /> : <Settings2 size={15} />}
                  保存环境变量
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3">
                <div className="text-xs text-theme-text-muted">支持批量导入`key=value`（换行或分号分隔，且兼容引号中的分号）</div>
                <button onClick={() => setShowEnvImportModal(true)} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  批量导入
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {envEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-theme-border bg-theme-bg-app px-4 py-6 text-sm text-theme-text-muted">当前没有环境变量，点击下方按钮添加，或通过“批量导入”快速写入。</div>
                ) : (
                  envEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 rounded-2xl border border-theme-border p-3">
                      <input
                        value={entry.key}
                        onChange={(e) => setEnvEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, key: e.target.value } : item)))}
                        className="w-56 shrink-0 rounded-xl border border-theme-border px-3 py-2 text-sm font-mono"
                        placeholder="KEY"
                      />
                      <span className="shrink-0 text-theme-text-muted">=</span>
                      <input
                        value={entry.value}
                        onChange={(e) => setEnvEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, value: e.target.value } : item)))}
                        className="min-w-0 flex-1 rounded-xl border border-theme-border px-3 py-2 text-sm font-mono"
                        placeholder="value"
                      />
                      <button
                        onClick={() => setEnvEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                        className="shrink-0 rounded-xl border border-red-500/20 px-3 py-2 text-sm font-semibold text-red-400"
                      >
                        删除
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setEnvEntries((prev) => [...prev, createEnvEntry('', '')])} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  <Plus size={14} />
                  添加环境变量
                </button>
              </div>
            </div>

 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-theme-text-primary">HELPER运行环境变量</div>
                <button
                  onClick={() => void onRefreshHelperRuntimeEnv()}
                  className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary"
                >
                  {helperRuntimeEnvLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  实时刷新
                </button>
              </div>
              <div className="mt-2 text-xs text-theme-text-muted">
                当前 Agent 未显式配置的变量将继承 Helper 进程环境变量；当 Agent 自身配置了同名变量时，将覆盖 Helper 变量。
              </div>
              <JsonBlock
                title="Helper 进程环境变量"
                value={{
                  pid: helperRuntimeEnv?.pid ?? null,
                  count: helperRuntimeEnv?.count ?? Object.keys(helperRuntimeEnv?.env || {}).length,
                  updated_at: helperRuntimeEnv?.updated_at || null,
                  env: helperRuntimeEnv?.env || {},
                }}
                className="mt-3 bg-theme-bg-app"
              />
            </div>

            {showEnvImportModal ? (
              <ModalShell
                title="批量导入环境变量"
                description="支持 key=value，使用换行或分号分隔；分号在引号内不会被拆分。"
                onClose={() => setShowEnvImportModal(false)}
                maxWidthClassName="max-w-3xl"
                compactHeight
              >
                <div className="space-y-4">
                  <textarea
                    value={envImportText}
                    onChange={(e) => setEnvImportText(e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-mono"
                    placeholder={'例如 OPENAI_API_KEY=xxx\\nHTTP_PROXY=\"http://a;b@proxy:8080\";DEBUG=true'}
                  />
                  {envImportError ? <div className="text-sm font-semibold text-red-400">{envImportError}</div> : null}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowEnvImportModal(false)} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">
                      取消
                    </button>
                    <button
                      onClick={() => {
                        const ok = onImportEnv();
                        if (ok) setShowEnvImportModal(false);
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      导入到列表
                    </button>
                  </div>
                </div>
              </ModalShell>
            ) : null}

            {showArgImportModal ? (
              <ModalShell
                title="批量导入命令行参数"
                description="支持每行一个参数，或使用分号分隔；引号中的分号不会被拆分。"
                onClose={() => setShowArgImportModal(false)}
                maxWidthClassName="max-w-3xl"
                compactHeight
              >
                <div className="space-y-4">
                  <textarea
                    value={argImportText}
                    onChange={(e) => setArgImportText(e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-mono"
                    placeholder={'例如 --serve\\n--port\\n8080\\n或 --flag-a;--flag-b;\"--note=a;b\"'}
                  />
                  {argImportError ? <div className="text-sm font-semibold text-red-400">{argImportError}</div> : null}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowArgImportModal(false)} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">
                      取消
                    </button>
                    <button
                      onClick={() => {
                        const ok = onImportArgs();
                        if (ok) setShowArgImportModal(false);
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      导入到参数列表
                    </button>
                  </div>
                </div>
              </ModalShell>
            ) : null}

            <JsonBlock title="能力与健康" value={{ health: agent.health || {}, capabilities: agent.capabilities || {} }} />
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-theme-text-primary">LLM 应用状态</div>
                <LlmStatusBadge status={llmStatus} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-theme-text-muted">当前 Provider</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">{formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key })}</div>
                  <div className="mt-1 text-xs text-theme-text-muted">{agent.llm_provider_key || '-'}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-theme-text-muted">应用时间</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">{formatTimestamp(agent.llm_provider_applied_at)}</div>
                  <div className="mt-1 text-xs text-theme-text-muted">配置中心版本：{summaryUpdatedAt || '-'}</div>
                </div>
              </div>
              <JsonBlock
                title="LLM 快照与映射"
                value={{
                  llm_provider_snapshot: agent.llm_provider_snapshot || null,
                  llm_provider_mapped_env_keys: agent.llm_provider_mapped_env_keys || [],
                }}
                className="bg-theme-bg-app"
              />
            </div>
            <JsonBlock
              title="启动配置摘要"
              value={{
                command: agent.command,
                cwd: agent.cwd,
                args: agent.args || [],
                env_keys: Object.keys(agent.env || {}),
                llm_provider_key: agent.llm_provider_key,
                llm_provider_mapped_env_keys: agent.llm_provider_mapped_env_keys || [],
              }}
            />
            <JsonBlock
              title="所属 Helper 信息"
              value={{
                agent_key: agent.agent_key,
                service_name: agent.service_name,
                agent_hostname: agent.agent_hostname,
                agent_ip: agent.agent_ip,
                helper_tags: agent.helper_tags,
                helper_health_status: agent.health_status,
                image: agent.image,
              }}
            />
            {helper ? (
              <JsonBlock
                title="当前 Helper 详情摘要"
                value={{
                  service_name: helper.service_name,
                  active_agent_id: helper.active_agent_id,
                  ai_agent_count: helper.ai_agent_count,
                  tags: helper.tags,
                  health: helper.health,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnvAiAgentManagePage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, feedbackNodes } = useUiFeedback();
  const { helpers, reload: reloadHelpers } = useAiHelpers(projectId, notify);
  const { loading, agents, reload, page, perPage, total, setPage, setPerPage } = useProjectAiAgents(projectId, notify);
  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [backendFilter, setBackendFilter] = useState('');
  const [installedFilter, setInstalledFilter] = useState('');
  const [runningFilter, setRunningFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ProjectAiAgentItem | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<AiHelperService | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showBatchLlmModal, setShowBatchLlmModal] = useState(false);
  const [showSingleLlmModal, setShowSingleLlmModal] = useState(false);
  const [createHelperKey, setCreateHelperKey] = useState('');
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [editForm, setEditForm] = useState({
    command: '',
    cwd: '',
    enabled: true,
    description: '',
  });
  const [argEntries, setArgEntries] = useState<ArgEntry[]>([]);
  const [argImportText, setArgImportText] = useState('');
  const [argImportError, setArgImportError] = useState('');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [envImportText, setEnvImportText] = useState('');
  const [envImportError, setEnvImportError] = useState('');
  const [helperRuntimeEnv, setHelperRuntimeEnv] = useState<AiHelperRuntimeEnv | null>(null);
  const [helperRuntimeEnvLoading, setHelperRuntimeEnvLoading] = useState(false);
  const [llmProviders, setLlmProviders] = useState<AiAgentLlmProviderSummary[]>([]);
  const [singleLlmDraft, setSingleLlmDraft] = useState<AiAgentLlmConfigDraft | null>(null);
  const [singleLlmDraftLoading, setSingleLlmDraftLoading] = useState(false);
  const [singleLlmNotice, setSingleLlmNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [llmBusy, setLlmBusy] = useState('');
  const [batchApplyResult, setBatchApplyResult] = useState<AiAgentBatchConfigureResult | null>(null);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const providerUpdatedAtMap = useMemo(() => {
    const map = new Map<string, string>();
    llmProviders.forEach((item) => {
      const key = String(item.provider_key || '').trim();
      if (!key) return;
      map.set(key, String(item.updated_at || '').trim());
    });
    return map;
  }, [llmProviders]);

  const nodeOptions = useMemo(() => uniqueValues(agents.map((item) => item.agent_hostname || '').filter(Boolean)), [agents]);
  const backendOptions = useMemo(() => uniqueValues(agents.map((item) => item.backend_type || '').filter(Boolean)), [agents]);
  const helperOptions = useMemo(
    () =>
      helpers.map((item) => ({
        key:`${item.agent_key}::${item.service_name}`,
        label:`${item.agent_hostname || item.agent_key} · ${item.service_name}`,
        agent_key: item.agent_key,
        service_name: item.service_name,
      })),
    [helpers],
  );

  const filteredAgents = useMemo(
    () =>
      agents.filter((item) => {
        const keyword = search.trim().toLowerCase();
        const byKeyword =
          !keyword ||
          [item.agent_hostname, item.service_name, item.agent_id, item.backend_type, item.llm_provider_key]
            .join(' ')
            .toLowerCase()
            .includes(keyword);
        const byNode = !nodeFilter || item.agent_hostname === nodeFilter;
        const byBackend = !backendFilter || item.backend_type === backendFilter;
        const byInstalled = !installedFilter || String(Boolean(item.installed)) === installedFilter;
        const byRunning = !runningFilter || String(Boolean(item.running)) === runningFilter;
        const byActive = !activeFilter || String(Boolean(item.active)) === activeFilter;
        return byKeyword && byNode && byBackend && byInstalled && byRunning && byActive;
      }),
    [agents, search, nodeFilter, backendFilter, installedFilter, runningFilter, activeFilter],
  );

  const selectedAgents = useMemo(() => {
    const selectedSet = new Set(selectedAgentKeys);
    return agents.filter((item) => selectedSet.has(buildAgentKey(item)));
  }, [agents, selectedAgentKeys]);

  const sortedFilteredAgents = useMemo(
    () =>
      [...filteredAgents].sort((a, b) => {
        const hostCmp = String(a.agent_hostname || '').localeCompare(String(b.agent_hostname || ''));
        if (hostCmp !== 0) return hostCmp;
        const helperCmp = String(a.service_name || '').localeCompare(String(b.service_name || ''));
        if (helperCmp !== 0) return helperCmp;
        return String(a.agent_id || '').localeCompare(String(b.agent_id || ''));
      }),
    [filteredAgents],
  );

  const allFilteredSelected =
    filteredAgents.length > 0 && filteredAgents.every((item) => selectedAgentKeys.includes(buildAgentKey(item)));
  const allAgentsSelected = agents.length > 0 && agents.every((item) => selectedAgentKeys.includes(buildAgentKey(item)));
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, perPage)));

  useEffect(() => {
    if (!createHelperKey && helperOptions.length > 0) {
      setCreateHelperKey(helperOptions[0].key);
    }
  }, [helperOptions, createHelperKey]);

  useEffect(() => {
    if (!selectedKey) {
      setSelectedAgent(null);
      setSelectedHelper(null);
      setHelperRuntimeEnv(null);
      return;
    }
    const [agentKey = '', serviceName = '', agentId = ''] = selectedKey.split('::');
    const nextAgent =
      agents.find((item) => item.agent_key === agentKey && item.service_name === serviceName && item.agent_id === agentId) ||
      null;
    setSelectedAgent(nextAgent);
    if (nextAgent) {
      setEditForm({
        command: nextAgent.command || '',
        cwd: nextAgent.cwd || '',
        enabled: !!nextAgent.enabled,
        description: nextAgent.description || '',
      });
      setArgEntries(argsArrayToEntries(nextAgent.args));
      setArgImportText('');
      setArgImportError('');
      setEnvEntries(envObjectToEntries(nextAgent.env));
      setEnvImportText('');
      setEnvImportError('');
      setSingleLlmNotice(null);
      void loadHelper(nextAgent.agent_key, nextAgent.service_name, nextAgent.agent_id);
    }
  }, [selectedKey, agents]);

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const data = await environmentApi.environment.listAiAgentLlmProviders(projectId || '');
        if (cancelled) return;
        setLlmProviders(data.items || []);
      } catch (error: any) {
        if (!cancelled) {
          notifyRef.current(`加载 LLM Provider 列表失败: ${error?.message || error}`, 'error');
        }
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const loadSingleDraft = async () => {
      if (!showSingleLlmModal || !selectedAgent) return;
      setSingleLlmDraftLoading(true);
      setSingleLlmNotice(null);
      try {
        const data = await environmentApi.environment.getAiAgentLlmConfig(
          projectId,
          selectedAgent.agent_key,
          selectedAgent.service_name,
          selectedAgent.agent_id,
        );
        if (cancelled) return;
        const providerKeys = Array.isArray(data?.provider_keys)
          ? data.provider_keys.map((item: any) => String(item || '').trim()).filter(Boolean)
          : Array.isArray(selectedAgent.llm_provider_keys)
            ? selectedAgent.llm_provider_keys.map((item: any) => String(item || '').trim()).filter(Boolean)
            : (selectedAgent.llm_provider_key ? [String(selectedAgent.llm_provider_key)] : []);
        const fileOverrides = Array.isArray(data?.file_bindings)
          ? data.file_bindings
          : (Array.isArray(selectedAgent.llm_provider_file_bindings) ? selectedAgent.llm_provider_file_bindings : []);
        setSingleLlmDraft({
          provider_keys: providerKeys,
          env_overrides: data?.env && typeof data.env === 'object' ? data.env : (selectedAgent.env || {}),
          file_overrides: fileOverrides,
          merge_strategy: data?.merge_strategy === 'merge' ? 'merge' : 'overwrite',
        });
      } catch (error: any) {
        if (cancelled) return;
        notify(`加载当前 Agent LLM 配置失败: ${error?.message || error}`, 'error');
        setSingleLlmDraft({
          provider_keys: Array.isArray(selectedAgent.llm_provider_keys)
            ? selectedAgent.llm_provider_keys.map((item: any) => String(item || '').trim()).filter(Boolean)
            : (selectedAgent.llm_provider_key ? [String(selectedAgent.llm_provider_key)] : []),
          env_overrides: selectedAgent.env || {},
          file_overrides: Array.isArray(selectedAgent.llm_provider_file_bindings) ? selectedAgent.llm_provider_file_bindings : [],
          merge_strategy: selectedAgent.llm_provider_merge_strategy === 'merge' ? 'merge' : 'overwrite',
        });
      } finally {
        if (!cancelled) setSingleLlmDraftLoading(false);
      }
    };
    void loadSingleDraft();
    return () => {
      cancelled = true;
    };
  }, [showSingleLlmModal, selectedAgent, projectId, notify]);

  const loadHelper = async (agentKey: string, serviceName: string, focusAgentId?: string) => {
    setHelperRuntimeEnvLoading(true);
    try {
      const [detail, runtimeEnv] = await Promise.all([
        environmentApi.environment.getAiHelperDetail(projectId, agentKey, serviceName),
        environmentApi.environment.getAiHelperRuntimeEnv(projectId, agentKey, serviceName).catch(() => null),
      ]);
      setSelectedHelper(detail);
      setHelperRuntimeEnv(runtimeEnv);
      const focused = (detail.agents || []).find((item) => item.agent_id === focusAgentId);
      if (focused) {
        setEnvEntries(envObjectToEntries(focused.env));
      }
    } catch (error: any) {
      notify(`加载 Agent 所属 helper 详情失败: ${error?.message || error}`, 'error');
    } finally {
      setHelperRuntimeEnvLoading(false);
    }
  };

  const refreshHelperRuntimeEnv = async () => {
    if (!selectedAgent) return;
    setHelperRuntimeEnvLoading(true);
    try {
      const runtimeEnv = await environmentApi.environment.getAiHelperRuntimeEnv(projectId, selectedAgent.agent_key, selectedAgent.service_name);
      setHelperRuntimeEnv(runtimeEnv);
    } catch (error: any) {
      notify(`加载 Helper 运行环境变量失败: ${error?.message || error}`, 'error');
    } finally {
      setHelperRuntimeEnvLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([reloadHelpers(false), reload(false)]);
    if (selectedKey) {
      const [agentKey = '', serviceName = '', agentId = ''] = selectedKey.split('::');
      if (agentKey && serviceName && agentId) {
        await loadHelper(agentKey, serviceName, agentId);
      }
    }
  };

  const toggleAgentSelection = (agent: ProjectAiAgentItem, checked?: boolean) => {
    const key = buildAgentKey(agent);
    setSelectedAgentKeys((prev) => {
      const has = prev.includes(key);
      const nextChecked = typeof checked === 'boolean' ? checked : !has;
      if (nextChecked && !has) return [...prev, key];
      if (!nextChecked && has) return prev.filter((item) => item !== key);
      return prev;
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    const keys = filteredAgents.map((item) => buildAgentKey(item));
    setSelectedAgentKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => {
        if (checked) next.add(key);
        else next.delete(key);
      });
      return Array.from(next);
    });
  };

  const toggleAllAgents = (checked: boolean) => {
    if (checked) {
      setSelectedAgentKeys(agents.map((item) => buildAgentKey(item)));
      return;
    }
    setSelectedAgentKeys([]);
  };

  const runAgentAction = async (action: 'activate' | 'start' | 'stop' | 'delete', agent: ProjectAiAgentItem) => {
    if (action === 'delete') {
      const confirmed = await showConfirm({
        title: '删除 AI Agent',
        message:`确认删除 AI Agent ${agent.agent_id}？该操作会直接在 helper 上移除对应 backend。`,
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }

    setBusyAction(`${action}:${agent.agent_id}`);
    try {
      if (action === 'delete') {
        await environmentApi.environment.deleteAiHelperAgent(projectId, agent.agent_key, agent.service_name, agent.agent_id);
        if (selectedKey === buildAgentKey(agent)) {
          setSelectedKey('');
          setSelectedAgent(null);
          setSelectedHelper(null);
          setShowSingleLlmModal(false);
        }
      } else {
        await environmentApi.environment.runAiHelperAgentAction(projectId, agent.agent_key, agent.service_name, agent.agent_id, action);
      }
      notify(`AI Agent ${action === 'delete' ? '已删除' : '操作成功'}`, 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`AI Agent 操作失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const saveAgent = async () => {
    if (!selectedAgent) return;
    setBusyAction(`update:${selectedAgent.agent_id}`);
    try {
      await environmentApi.environment.updateAiHelperAgent(projectId, selectedAgent.agent_key, selectedAgent.service_name, selectedAgent.agent_id, {
        backend_type: selectedAgent.backend_type,
        command: editForm.command,
        args: argEntriesToArray(argEntries),
        cwd: editForm.cwd || undefined,
        enabled: !!editForm.enabled,
        description: editForm.description,
      });
      notify('AI Agent 已更新', 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`更新 AI Agent 失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const importArgEntries = () => {
    const parsed = parseArgImportText(argImportText);
    if (parsed.entries.length === 0) {
      setArgImportError('没有识别到可导入的参数');
      return false;
    }
    setArgEntries((prev) => [...prev, ...parsed.entries]);
    setArgImportError('');
    setArgImportText('');
    return true;
  };

  const saveEnv = async () => {
    if (!selectedAgent) return;
    setBusyAction(`env:${selectedAgent.agent_id}`);
    try {
      await environmentApi.environment.replaceAiHelperAgentEnv(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
        envEntriesToObject(envEntries),
      );
      notify('环境变量已保存', 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`保存环境变量失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const importEnvEntries = () => {
    const parsed = parseEnvImportText(envImportText);
    if (parsed.errors.length > 0) {
      setEnvImportError(parsed.errors.join('；'));
      return false;
    }
    if (parsed.entries.length === 0) {
      setEnvImportError('没有识别到可导入的 key=value 项');
      return false;
    }

    setEnvEntries((prev) => {
      const nextMap = new Map<string, EnvEntry>();
      prev.forEach((item) => {
        const key = item.key.trim();
        if (key) nextMap.set(key, item);
      });
      parsed.entries.forEach((item) => {
        const key = item.key.trim();
        if (!key) return;
        const existing = nextMap.get(key);
        nextMap.set(key, existing ? { ...existing, value: item.value } : item);
      });
      return Array.from(nextMap.values());
    });
    setEnvImportError('');
    setEnvImportText('');
    return true;
  };

  const createAgent = async () => {
    const helper = helperOptions.find((item) => item.key === createHelperKey);
    if (!helper) {
      notify('请先选择一个 helper 服务', 'error');
      return;
    }
    setBusyAction('create-agent');
    try {
      await environmentApi.environment.createAiHelperAgent(projectId, helper.agent_key, helper.service_name, {
        agent_id: createForm.agent_id,
        backend_type: createForm.backend_type,
        command: createForm.command || createForm.backend_type,
        args: JSON.parse(createForm.args || '[]'),
        cwd: createForm.cwd || undefined,
        env: JSON.parse(createForm.env || '{}'),
        enabled: !!createForm.enabled,
        description: createForm.description,
      });
      notify('AI Agent 已创建', 'success');
      setCreateForm(defaultCreateForm);
      setShowCreateAgent(false);
      await refreshAll();
    } catch (error: any) {
      notify(`创建 AI Agent 失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const applyLlmConfigToSelectedAgent = async (draft: AiAgentLlmConfigDraft) => {
    if (!selectedAgent) return;
    setLlmBusy('configure-single');
    setSingleLlmNotice(null);
    try {
      const result = await environmentApi.environment.batchConfigureAiAgents(
        projectId,
        draft,
        [{
          agent_key: selectedAgent.agent_key,
          service_name: selectedAgent.service_name,
          agent_id: selectedAgent.agent_id,
        }],
      );
      const first = Array.isArray(result?.results) ? result.results[0] : null;
      if (first && first.success === false) {
        throw new Error(String(first.error || '下发失败'));
      }
      setSingleLlmNotice({ type: 'success', text: 'LLM 配置已成功下发。' });
      notify('已将 LLM 配置应用到当前 AI Agent', 'success');
      await refreshAll();
      setShowSingleLlmModal(false);
    } catch (error: any) {
      setSingleLlmNotice({ type: 'error', text:`应用失败：${error?.message || error}` });
      notify(`应用 LLM 配置失败: ${error?.message || error}`, 'error');
    } finally {
      setLlmBusy('');
    }
  };

  const clearProviderMappingForSelectedAgent = async () => {
    if (!selectedAgent) return;
    const mappedKeys = Array.isArray(selectedAgent.llm_provider_mapped_env_keys) ? selectedAgent.llm_provider_mapped_env_keys : [];
    const hasBinding = !!String(selectedAgent.llm_provider_key || '').trim() || mappedKeys.length > 0;
    if (!hasBinding) {
      setSingleLlmNotice({ type: 'success', text: '当前 Agent 未绑定 LLM 映射。' });
      return;
    }

    const confirmed = await showConfirm({
      title: '清除 LLM 映射',
      message:`确认清除 ${selectedAgent.agent_id} 当前 LLM 映射？将移除已注入环境变量并清空绑定信息。`,
      confirmText: '确认清除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setLlmBusy('clear-single');
    setSingleLlmNotice(null);
    try {
      const envPayload = await environmentApi.environment.getAiHelperAgentEnv(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
      );
      const currentEnv = { ...(envPayload?.env || {}) };
      mappedKeys.forEach((key) => delete currentEnv[String(key)]);

      await environmentApi.environment.updateAiHelperAgent(projectId, selectedAgent.agent_key, selectedAgent.service_name, selectedAgent.agent_id, {
        backend_type: selectedAgent.backend_type,
        command: selectedAgent.command || selectedAgent.backend_type,
        args: Array.isArray(selectedAgent.args) ? selectedAgent.args : [],
        cwd: selectedAgent.cwd || undefined,
        env: currentEnv,
        enabled: !!selectedAgent.enabled,
        description: selectedAgent.description || '',
        llm_provider_key: null,
        llm_provider_keys: [],
        llm_provider_snapshot: null,
        llm_provider_snapshots: [],
        llm_provider_applied_at: null,
        llm_provider_mapped_env_keys: [],
        llm_provider_file_bindings: [],
        llm_provider_file_backups: [],
        llm_provider_merge_strategy: 'overwrite',
      });

      setSingleLlmDraft(null);
      setSingleLlmNotice({ type: 'success', text:`已清除映射（移除 ${mappedKeys.length} 个映射环境变量键）。` });
      notify('已清除当前 Agent 的 LLM 映射', 'success');
      await refreshAll();
    } catch (error: any) {
      setSingleLlmNotice({ type: 'error', text:`清除失败：${error?.message || error}` });
      notify(`清除 LLM 映射失败: ${error?.message || error}`, 'error');
    } finally {
      setLlmBusy('');
    }
  };

  const closeCreateModal = () => {
    setShowCreateAgent(false);
    setCreateForm(defaultCreateForm);
    if (helperOptions.length > 0) {
      setCreateHelperKey(helperOptions[0].key);
    }
  };

  const batchConfigureAgents = async (draft: AiAgentLlmConfigDraft) => {
    if (selectedAgents.length === 0) {
      notify('请先选择至少一个 AI Agent', 'error');
      return;
    }
    setLlmBusy('configure-batch');
    try {
      const result = await environmentApi.environment.batchConfigureAiAgents(
        projectId,
        draft,
        selectedAgents.map((item) => ({
          agent_key: item.agent_key,
          service_name: item.service_name,
          agent_id: item.agent_id,
        })),
      );
      setBatchApplyResult(result);
      notify('批量配置已完成', result.status === 'failed' ? 'error' : 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`批量配置AI Agent失败: ${error?.message || error}`, 'error');
    } finally {
      setLlmBusy('');
    }
  };

  return (
    <>
      <div className="px-8 pt-8 pb-10">
        <div className="space-y-6">
          {feedbackNodes}

 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-theme-text-primary">AI Agent 管理</h1>
                <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">
                  先从列表查看当前项目下的全部 AI Agent，再按需进入右侧详情抽屉管理；LLM 快速应用已改为单个与批量两个对话框流程。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCreateAgent((v) => !v)} className="rounded-xl border border-theme-border px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  新增 AI Agent
                </button>
                <button
                  onClick={() => {
                    if (selectedAgents.length === 0) {
                      notify('请先在列表中勾选至少一个 AI Agent', 'error');
                      return;
                    }
                    setShowBatchLlmModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-400"
                >
                  <WandSparkles size={15} />
                  批量配置AI Agent
                </button>
                <button onClick={() => void refreshAll()} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2 text-sm font-semibold text-white">
                  <RefreshCw size={16} />
                  刷新
                </button>
              </div>
            </div>
          </section>

          <StatsStrip agents={agents} selectedCount={selectedAgentKeys.length} />

 <section className="rounded-[1.75rem] border border-theme-border bg-theme-bg-app p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6 flex-1">
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm xl:col-span-2" placeholder="搜索节点、helper、agent_id、backend、provider" />
                <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm"><option value="">全部节点</option>{nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}</select>
                <select value={backendFilter} onChange={(e) => setBackendFilter(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm"><option value="">全部后端</option>{backendOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <select value={installedFilter} onChange={(e) => setInstalledFilter(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm"><option value="">Installed 全部</option><option value="true">已安装</option><option value="false">未安装</option></select>
                <select value={runningFilter} onChange={(e) => setRunningFilter(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm"><option value="">Running 全部</option><option value="true">运行中</option><option value="false">已停止</option></select>
                <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="rounded-xl border border-theme-border px-3 py-2 text-sm"><option value="">Active 全部</option><option value="true">已激活</option><option value="false">未激活</option></select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-end">
                <button
                  type="button"
                  onClick={() => toggleAllAgents(true)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    allAgentsSelected
                      ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
                      : 'border-theme-border text-theme-text-secondary hover:bg-theme-elevated'
                  }`}
                >
                  全选全部 AI Agent
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllFiltered(!allFilteredSelected)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    allFilteredSelected
                      ? 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400'
                      : 'border-theme-border text-theme-text-secondary hover:bg-theme-elevated'
                  }`}
                >
                  全选当前筛选结果
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAgentKeys([])}
                  className="rounded-lg border border-theme-border px-2.5 py-1 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                >
                  清空选择
                </button>
                <span className="text-xs text-theme-text-muted">已勾选 {selectedAgentKeys.length} 个</span>
                <span className="mx-2 text-theme-text-faint">|</span>
                <span className="text-xs text-theme-text-muted">总计 {total} 个</span>
              </div>
            </div>

            <div className="mt-5">
              {loading ? (
                <div className="col-span-full flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={15} className="animate-spin" />加载中...</div>
              ) : filteredAgents.length === 0 ? (
                <div className="col-span-full"><EmptyState text="当前筛选条件下没有 AI Agent。" /></div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-theme-border">
                  <table className="min-w-full divide-y divide-theme-border text-sm">
                    <thead className="bg-theme-bg-app">
                      <tr className="text-left text-[11px] font-black uppercase tracking-[0.12em] text-theme-text-muted">
                        <th className="px-3 py-3 w-12">选</th>
                        <th className="px-3 py-3">Agent ID</th>
                        <th className="px-3 py-3">节点</th>
                        <th className="px-3 py-3">Helper Service</th>
                        <th className="px-3 py-3">Backend</th>
                        <th className="px-3 py-3">Installed / Running / Active</th>
                        <th className="px-3 py-3">Health</th>
                        <th className="px-3 py-3">LLM</th>
                        <th className="px-3 py-3">更新时间</th>
                        <th className="px-3 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                      {sortedFilteredAgents.map((agent) => {
                        const key = buildAgentKey(agent);
                        const isSelected = selectedKey === key;
                        const isChecked = selectedAgentKeys.includes(key);
                        const providerLabels = getBoundProviderLabels(agent);
                        const overflowCount = Math.max(0, providerLabels.length - 2);
                        return (
                          <tr
                            key={key}
                            onClick={() => setSelectedKey(key)}
                            className={`cursor-pointer transition-colors hover:bg-theme-elevated ${isSelected ? 'bg-cyan-50/60' : ''}`}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => toggleAgentSelection(agent, event.target.checked)}
                              />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="max-w-[220px] truncate font-semibold text-theme-text-primary" title={agent.agent_id}>
                                {agent.agent_id || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="max-w-[180px] truncate text-theme-text-secondary" title={agent.agent_hostname || agent.agent_key}>
                                {agent.agent_hostname || agent.agent_key || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="max-w-[240px] truncate text-theme-text-secondary" title={agent.service_name}>
                                {agent.service_name || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs font-semibold text-theme-text-secondary">
                                {backendTypeIcon(agent.backend_type)}
                                <span>{agent.backend_type || '-'}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-wrap gap-1.5">
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${agent.installed ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted'}`}>I</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${agent.running ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted'}`}>R</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${agent.active ? 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted'}`}>A</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="inline-flex items-center gap-2 text-xs text-theme-text-secondary">
                                <span className={`h-2 w-2 rounded-full ${healthDotTone(agent.health_status)}`} />
                                <span>{agent.health_status || 'unknown'}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              {providerLabels.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5" title={providerLabels.join(', ')}>
                                  {providerLabels.slice(0, 2).map((name) => (
                                    <span
                                      key={`${key}-${name}`}
                                      className="inline-flex max-w-[180px] truncate rounded-full border border-cyan-500/20 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-400"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                  {overflowCount > 0 ? (
                                    <span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-0.5 text-[11px] font-semibold text-theme-text-secondary">
                                      +{overflowCount}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-theme-text-muted">未绑定</span>
                              )}
                            </td>
                            <td className="px-3 py-3 align-top text-xs text-theme-text-secondary">
                              {formatTimestamp(agent.updated_at || '')}
                            </td>
                            <td className="px-3 py-3 align-top text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedKey(key);
                                }}
                                className="rounded-lg border border-theme-border px-2.5 py-1 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                              >
                                详情
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-xs text-theme-text-secondary">
              <div className="flex items-center gap-2">
                <span>每页</span>
                <select
                  value={perPage}
                  onChange={(event) => {
                    const next = Math.max(1, Math.min(1000, Number(event.target.value) || 100));
                    setPerPage(next);
                    setPage(1);
                  }}
                  className="rounded border border-theme-border px-2 py-1 text-xs"
                >
                  {[50, 100, 200, 500, 1000].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span>条</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded border border-theme-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <span>第 {page} / {totalPages} 页</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded border border-theme-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {selectedAgent ? (
        <>
          <div className="fixed inset-0 z-[200] bg-slate-950/25 backdrop-blur-[1px]" onClick={() => setSelectedKey('')} />
          <AgentDetailDrawer
            agent={selectedAgent}
            helper={selectedHelper}
            busyAction={busyAction}
            editForm={editForm}
            setEditForm={setEditForm}
            argEntries={argEntries}
            setArgEntries={setArgEntries}
            argImportText={argImportText}
            setArgImportText={setArgImportText}
            argImportError={argImportError}
            onImportArgs={importArgEntries}
            envEntries={envEntries}
            setEnvEntries={setEnvEntries}
            envImportText={envImportText}
            setEnvImportText={setEnvImportText}
            envImportError={envImportError}
            onImportEnv={importEnvEntries}
            onClose={() => setSelectedKey('')}
            onAction={runAgentAction}
            onSaveAgent={saveAgent}
            onSaveEnv={saveEnv}
            helperRuntimeEnv={helperRuntimeEnv}
            helperRuntimeEnvLoading={helperRuntimeEnvLoading}
            onRefreshHelperRuntimeEnv={refreshHelperRuntimeEnv}
            onOpenLlmModal={() => {
              setSingleLlmDraft(null);
              setSingleLlmDraftLoading(true);
              setShowSingleLlmModal(true);
            }}
            providerUpdatedAtMap={providerUpdatedAtMap}
          />
        </>
      ) : null}

      {showCreateAgent ? (
        <CreateAgentModal
          helperOptions={helperOptions}
          createHelperKey={createHelperKey}
          setCreateHelperKey={setCreateHelperKey}
          createForm={createForm}
          setCreateForm={setCreateForm}
          busyAction={busyAction}
          onClose={closeCreateModal}
          onCreate={createAgent}
        />
      ) : null}

      {showSingleLlmModal && selectedAgent ? (
        <SingleAgentLlmModal
          projectId={projectId}
          agent={selectedAgent}
          providerOptions={llmProviders}
          initialDraft={singleLlmDraft}
          initialLoading={singleLlmDraftLoading}
          llmBusy={llmBusy}
          notice={singleLlmNotice}
          notify={notify}
          onClose={() => {
            setShowSingleLlmModal(false);
            setSingleLlmDraft(null);
            setSingleLlmDraftLoading(false);
            setSingleLlmNotice(null);
          }}
          onApply={applyLlmConfigToSelectedAgent}
          onClear={clearProviderMappingForSelectedAgent}
        />
      ) : null}

      {showBatchLlmModal ? (
        <BatchLlmApplyModal
          projectId={projectId}
          selectedAgents={selectedAgents}
          providerOptions={llmProviders}
          llmBusy={llmBusy}
          result={batchApplyResult}
          notify={notify}
          onClose={() => setShowBatchLlmModal(false)}
          onSubmit={batchConfigureAgents}
        />
      ) : null}
    </>
  );
};
