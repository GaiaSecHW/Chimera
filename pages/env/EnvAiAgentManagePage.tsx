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
  SquareTerminal,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';

import { showConfirm } from '../../components/DialogService';
import { api } from '../../clients/api';
import {
  AiAgentLlmBatchApplyResult,
  AiAgentLlmProviderDetail,
  AiAgentLlmProviderSummary,
  AiHelperService,
  ProjectAiAgentItem,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  EmptyState,
  JsonBlock,
  navigateToAppView,
  prettyJson,
  uniqueValues,
  useAiHelpers,
  useProjectAiAgents,
} from './ai-agent/shared';

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

const buildAgentKey = (item: Pick<ProjectAiAgentItem, 'agent_key' | 'service_name' | 'agent_id'>) =>
  `${item.agent_key}::${item.service_name}::${item.agent_id}`;

const formatProviderText = (provider?: { display_name?: string | null; provider_key?: string | null } | null) =>
  provider?.display_name || provider?.provider_key || '未绑定';

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
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : status === 'bound_fresh'
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : status === 'bound_stale'
          ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-zinc-100 text-zinc-600 border-zinc-200';

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

const createEnvEntry = (key = '', value = ''): EnvEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value,
});

const createArgEntry = (value = ''): ArgEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  value,
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
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const prev = index > 0 ? input[index - 1] : '';

    if ((char === '"' || char === "'") && prev !== '\\') {
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

const getBatchPreviewBackendType = (agents: ProjectAiAgentItem[]) => {
  const backendTypes = uniqueValues(agents.map((item) => item.backend_type || '').filter(Boolean));
  return backendTypes.length === 1 ? backendTypes[0] : agents[0]?.backend_type;
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
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
};

const backendTypeIcon = (backendType?: string) => {
  const text = String(backendType || '').toLowerCase();
  if (text.includes('codex')) return <Settings2 size={14} className="text-violet-600" />;
  if (text.includes('open')) return <WandSparkles size={14} className="text-amber-600" />;
  return <Bot size={14} className="text-cyan-700" />;
};

const healthDotTone = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text.includes('healthy') || text.includes('ok') || text.includes('pass')) return 'bg-emerald-500';
  if (text.includes('warn') || text.includes('degrad')) return 'bg-amber-500';
  if (text.includes('err') || text.includes('fail') || text.includes('down')) return 'bg-rose-500';
  return 'bg-slate-300';
};

const llmDotTone = (status: LlmBindingStatus) =>
  status === 'bound_fresh'
    ? 'bg-emerald-500'
    : status === 'bound_stale'
      ? 'bg-amber-500'
      : status === 'bound_unknown'
        ? 'bg-zinc-400'
        : 'bg-slate-300';

const NodeCompactRow: React.FC<{
  node: string;
  items: ProjectAiAgentItem[];
  selectedKey: string;
  selectedAgentKeys: string[];
  providerUpdatedAtMap: Map<string, string>;
  onSelect: (agent: ProjectAiAgentItem) => void;
  onCheck: (agent: ProjectAiAgentItem, checked: boolean) => void;
}> = ({ node, items, selectedKey, selectedAgentKeys, providerUpdatedAtMap, onSelect, onCheck }) => {
  const runningCount = items.filter((item) => item.running).length;
  const activeCount = items.filter((item) => item.active).length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="xl:w-64 xl:shrink-0">
          <div className="truncate text-sm font-black text-slate-900">{node}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{items.length} Agents</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>Running {runningCount}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>Active {activeCount}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="inline-flex min-w-full flex-nowrap gap-2">
            {items.map((agent) => {
              const key = buildAgentKey(agent);
              const isSelected = key === selectedKey;
              const isChecked = selectedAgentKeys.includes(key);
              const llmStatus = getLlmBindingStatus(agent, providerUpdatedAtMap);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(agent)}
                  className={`inline-flex min-w-[220px] max-w-[320px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                    isSelected ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <label className="inline-flex items-center" onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={isChecked} onChange={(event) => onCheck(agent, event.target.checked)} />
                  </label>
                  <div className="rounded-lg bg-white p-1 ring-1 ring-slate-200">{backendTypeIcon(agent.backend_type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-black text-slate-900">{agent.agent_id}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">{agent.service_name} · {agent.backend_type}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Play size={12} className={agent.running ? 'text-emerald-600' : 'text-slate-300'} />
                    <Power size={12} className={agent.active ? 'text-cyan-600' : 'text-slate-300'} />
                    <span className={`h-2 w-2 rounded-full ${healthDotTone(agent.health_status)}`} title={`health: ${agent.health_status || 'unknown'}`} />
                    <span className={`h-2 w-2 rounded-full ${llmDotTone(llmStatus)}`} title={`llm: ${llmStatus}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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
      className={`mx-auto flex w-full ${maxWidthClassName} flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_35px_120px_rgba(15,23,42,0.35)] ${compactHeight ? 'max-h-[85vh]' : 'h-full'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 md:px-8">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-600">AI Agent Workspace</div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{title}</h3>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <button onClick={onClose} className="rounded-2xl bg-slate-100 p-3 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800">
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6 md:px-8">{children}</div>
    </div>
  </div>
);

const LlmProviderPreview: React.FC<{
  providerDetail: AiAgentLlmProviderDetail | null;
  emptyText: string;
}> = ({ providerDetail, emptyText }) => {
  if (!providerDetail) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">{emptyText}</div>;
  }

  const envBindings = Object.entries(providerDetail.env_bindings || {});
  const fileBindings = Array.isArray(providerDetail.file_bindings) ? providerDetail.file_bindings : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Provider</div>
          <div className="mt-2 text-sm font-black text-slate-900">{providerDetail.display_name}</div>
          <div className="mt-1 text-xs text-slate-500">{providerDetail.provider_key} · {providerDetail.provider_type}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Model</div>
          <div className="mt-2 text-sm font-black text-slate-900">{providerDetail.model || '-'}</div>
          <div className="mt-1 text-xs text-slate-500">{providerDetail.api_base || '-'}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-slate-900">环境变量注入</div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-slate-700">{envBindings.length}</span>
        </div>
        {envBindings.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">该 Provider 暂无环境变量注入。</div>
        ) : (
          <div className="mt-3 space-y-2">
            {envBindings.map(([key, value]) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{key}</div>
                <div className="mt-1 text-xs text-slate-700 break-all">
                  {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                    ? String(value)
                    : prettyJson(value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-slate-900">文件注入</div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-slate-700">{fileBindings.length}</span>
        </div>
        {fileBindings.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">该 Provider 暂无文件注入配置。</div>
        ) : (
          <div className="mt-3 space-y-3">
            {fileBindings.map((file, index) => (
              <div key={`${file.path || file.name || 'file'}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-sm font-semibold text-slate-900">{file.path || file.name || `文件 ${index + 1}`}</div>
                <div className="mt-1 text-xs text-slate-500">
                  名称: {file.name || '-'} · 格式: {file.format || '-'} · 启用: {file.enabled ? '是' : '否'}
                </div>
                {file.content ? (
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700">{file.content}</pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-black text-slate-900">映射预览</div>
        <JsonBlock title="Env 映射" value={providerDetail.mapped_env_preview || {}} className="mt-3 bg-slate-50" />
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
  >
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <select value={createHelperKey} onChange={(e) => setCreateHelperKey(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm xl:col-span-3">
        {helperOptions.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      <input value={createForm.agent_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, agent_id: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="agent_id" />
      <select value={createForm.backend_type} onChange={(e) => setCreateForm((prev) => ({ ...prev, backend_type: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="claude">claude</option>
        <option value="codex">codex</option>
        <option value="opencode">opencode</option>
      </select>
      <input value={createForm.command} onChange={(e) => setCreateForm((prev) => ({ ...prev, command: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="二进制/命令路径，例如 /usr/local/bin/codex" />
      <input value={createForm.cwd} onChange={(e) => setCreateForm((prev) => ({ ...prev, cwd: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2 xl:col-span-2" placeholder="工作目录（可选），例如 /workspace/project" />
      <input value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2 xl:col-span-3" placeholder="description" />
      <textarea value={createForm.args} onChange={(e) => setCreateForm((prev) => ({ ...prev, args: e.target.value }))} rows={5} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono md:col-span-1 xl:col-span-1" placeholder='args JSON，例如 ["serve"]' />
      <textarea value={createForm.env} onChange={(e) => setCreateForm((prev) => ({ ...prev, env: e.target.value }))} rows={5} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono md:col-span-1 xl:col-span-2" placeholder='env JSON，例如 {"OPENAI_API_KEY":"..."}' />
      <label className="flex items-center gap-2 text-sm text-slate-700 xl:col-span-3">
        <input type="checkbox" checked={createForm.enabled} onChange={(e) => setCreateForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
        默认启用
      </label>
      <div className="flex justify-end gap-3 xl:col-span-3">
        <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
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
  selectedAgents: ProjectAiAgentItem[];
  providerOptions: AiAgentLlmProviderSummary[];
  selectedProviderKey: string;
  onProviderChange: (value: string) => void;
  providerDetail: AiAgentLlmProviderDetail | null;
  llmBusy: string;
  result: AiAgentLlmBatchApplyResult | null;
  onClose: () => void;
  onApply: (refresh: boolean) => Promise<void>;
  onClear: () => Promise<void>;
}> = ({
  selectedAgents,
  providerOptions,
  selectedProviderKey,
  onProviderChange,
  providerDetail,
  llmBusy,
  result,
  onClose,
  onApply,
  onClear,
}) => {
  const backendTypes = uniqueValues(selectedAgents.map((item) => item.backend_type || '').filter(Boolean));

  return (
    <ModalShell
      title="批量应用 LLM 配置"
      description="对当前勾选的 AI Agent 批量写入或刷新配置中心中的 LLM 映射。"
      onClose={onClose}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">目标范围</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{selectedAgents.length}</div>
              <div className="mt-1 text-sm text-slate-500">个 AI Agent</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {backendTypes.map((item) => (
                  <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 ring-1 ring-slate-200">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="text-sm font-black text-slate-900">选择 Provider</div>
              <select value={selectedProviderKey} onChange={(event) => onProviderChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">选择 LLM Provider</option>
                {providerOptions.map((provider) => (
                  <option key={provider.provider_key} value={provider.provider_key}>
                    {provider.display_name} · {provider.provider_type}
                    {provider.is_default ? ' · 默认' : ''}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => void onApply(false)}
                  disabled={!selectedProviderKey || selectedAgents.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {llmBusy === 'apply-batch' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  批量应用
                </button>
                <button
                  onClick={() => void onApply(true)}
                  disabled={!selectedProviderKey || selectedAgents.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {llmBusy === 'refresh-batch' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  批量刷新
                </button>
              </div>
              <button
                onClick={() => void onClear()}
                disabled={selectedAgents.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                {llmBusy === 'clear-batch' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                批量清除映射
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-black text-slate-900">目标 Agent 摘要</div>
              <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
                {selectedAgents.map((agent) => (
                  <div key={buildAgentKey(agent)} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="text-sm font-bold text-slate-900">{agent.agent_id}</div>
                    <div className="mt-1 text-xs text-slate-500">{agent.agent_hostname || agent.agent_key} · {agent.service_name} · {agent.backend_type}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <LlmProviderPreview providerDetail={providerDetail} emptyText="选择一个 LLM Provider 后，可在这里预览即将写入的映射。" />
            {result ? <JsonBlock title="最近一次批量应用结果" value={result} className="bg-white" /> : null}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

const SingleAgentLlmModal: React.FC<{
  agent: ProjectAiAgentItem;
  providerOptions: AiAgentLlmProviderSummary[];
  selectedProviderKey: string;
  onProviderChange: (value: string) => void;
  providerDetail: AiAgentLlmProviderDetail | null;
  llmBusy: string;
  notice: { type: 'success' | 'error'; text: string } | null;
  onClose: () => void;
  onApply: (refresh: boolean) => Promise<void>;
  onClear: () => Promise<void>;
}> = ({ agent, providerOptions, selectedProviderKey, onProviderChange, providerDetail, llmBusy, notice, onClose, onApply, onClear }) => {
  const chosen = providerOptions.find((item) => item.provider_key === selectedProviderKey) || null;
  const currentBindingName = formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key });

  return (
    <ModalShell
      title={`为 ${agent.agent_id} 选择 LLM 配置`}
      description="左侧选择并执行应用动作，右侧查看当前绑定与目标 Provider 预览。"
      onClose={onClose}
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(165deg,#f8fafc_0%,#ecfeff_100%)] p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">Target Agent</div>
            <div className="mt-2 text-xl font-black text-slate-900">{agent.agent_id}</div>
            <div className="mt-1 text-sm text-slate-600">{agent.agent_hostname || agent.agent_key} · {agent.service_name}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 ring-1 ring-slate-200">{agent.backend_type}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">当前: {currentBindingName}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">1. 选择 Provider</div>
            <select value={selectedProviderKey} onChange={(event) => onProviderChange(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">选择 LLM Provider</option>
              {providerOptions.map((provider) => (
                <option key={provider.provider_key} value={provider.provider_key}>
                  {provider.display_name} · {provider.provider_type}
                  {provider.is_default ? ' · 默认' : ''}
                </option>
              ))}
            </select>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {!chosen ? '未选择 Provider' : `${chosen.display_name} · ${chosen.provider_type} · ${chosen.model || '-'}`}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">2. 执行动作</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={() => void onApply(false)}
                disabled={!selectedProviderKey}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {llmBusy === 'apply-single' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                应用到当前 Agent
              </button>
              <button
                onClick={() => void onApply(true)}
                disabled={!agent.llm_provider_key && !selectedProviderKey}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                {llmBusy === 'refresh-single' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                从配置中心刷新
              </button>
              <button
                onClick={() => void onClear()}
                disabled={!agent.llm_provider_key && (agent.llm_provider_mapped_env_keys || []).length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                {llmBusy === 'clear-single' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                清除当前映射
              </button>
            </div>
            {notice ? (
              <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {notice.text}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-300 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">当前已生效绑定</div>
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-slate-700">
                LIVE
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Provider Key</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{agent.llm_provider_key || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Provider Name</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{agent.llm_provider_snapshot?.display_name || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Applied At</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(agent.llm_provider_applied_at)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Provider Type</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{agent.llm_provider_snapshot?.provider_type || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Model</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{agent.llm_provider_snapshot?.model || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">映射环境变量</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{(agent.llm_provider_mapped_env_keys || []).length}</div>
              </div>
            </div>
            {(agent.llm_provider_mapped_env_keys || []).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(agent.llm_provider_mapped_env_keys || []).map((key) => (
                  <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {key}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border-2 border-cyan-200 bg-[linear-gradient(160deg,#ecfeff_0%,#ffffff_65%)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-black text-cyan-800">待应用 Provider 预览</div>
              <span className="rounded-full border border-cyan-300 bg-cyan-100 px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-cyan-800">
                PREVIEW
              </span>
            </div>
            <LlmProviderPreview providerDetail={providerDetail} emptyText="选择一个 Provider 后，这里会显示即将写入 Agent 的环境变量与文件注入内容。" />
          </div>
        </div>
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
  onOpenLlmModal,
  providerUpdatedAtMap,
}) => {
  if (!agent) return null;
  const llmStatus = getLlmBindingStatus(agent, providerUpdatedAtMap);
  const summaryUpdatedAt = providerUpdatedAtMap.get(String(agent.llm_provider_key || '').trim()) || '';
  const [showEnvImportModal, setShowEnvImportModal] = useState(false);
  const [showArgImportModal, setShowArgImportModal] = useState(false);

  return (
    <div className="fixed inset-y-0 right-0 z-[210] w-full max-w-[840px] border-l border-slate-200 bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.16)]">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#ecfeff_100%)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-600">AI Agent Detail</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{agent.agent_id}</h2>
              <div className="mt-2 text-sm text-slate-600">{agent.agent_hostname || agent.agent_key} · {agent.service_name} · {agent.backend_type}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">当前 LLM: {formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key })}</span>
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">最近应用: {formatTimestamp(agent.llm_provider_applied_at)}</span>
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">命令: {agent.command || '-'}</span>
              </div>
            </div>
            <button onClick={onClose} className="rounded-2xl bg-white p-3 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-800">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void onAction('activate', agent)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Play size={14} />激活</button>
            <button onClick={() => void onAction('start', agent)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Play size={14} />启动</button>
            <button onClick={() => void onAction('stop', agent)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Power size={14} />停止</button>
            <button onClick={onOpenLlmModal} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white"><WandSparkles size={14} />选择 LLM 配置</button>
            <button onClick={() => void onAction('delete', agent)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"><Trash2 size={14} />删除</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-black text-slate-900">基础配置</div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700 md:col-span-2">
                  <div className="mb-1.5 font-semibold text-slate-800">二进制/命令路径</div>
                  <input value={editForm.command} onChange={(e) => setEditForm((prev) => ({ ...prev, command: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="例如 /usr/local/bin/codex" />
                </label>
                <label className="text-sm text-slate-700 md:col-span-2">
                  <div className="mb-1.5 font-semibold text-slate-800">工作目录</div>
                  <input value={editForm.cwd} onChange={(e) => setEditForm((prev) => ({ ...prev, cwd: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="可选，例如 /workspace/project" />
                </label>
                <label className="text-sm text-slate-700 md:col-span-2">
                  <div className="mb-1.5 font-semibold text-slate-800">命令行参数</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">按行管理参数；每一行代表一个独立参数。</div>
                      <button onClick={() => setShowArgImportModal(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        批量导入参数
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {argEntries.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有参数，点击下方按钮添加或批量导入。</div>
                      ) : (
                        argEntries.map((entry, index) => (
                          <div key={entry.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                            <span className="w-8 shrink-0 text-center text-xs font-black text-slate-400">{index + 1}</span>
                            <input
                              value={entry.value}
                              onChange={(e) => setArgEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, value: e.target.value } : item)))}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                              placeholder="例如 --port 或 8080"
                            />
                            <button
                              onClick={() => setArgEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                              className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
                            >
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => setArgEntries((prev) => [...prev, createArgEntry('')])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        <Plus size={14} />
                        添加参数
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-sm text-slate-700 md:col-span-2">
                  <div className="mb-1.5 font-semibold text-slate-800">描述</div>
                  <input value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="描述这个 AI Agent 的用途" />
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2"><input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm((prev) => ({ ...prev, enabled: e.target.checked }))} />启用该 AI Agent</label>
                <button onClick={() => void onSaveAgent()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
                  {busyAction === `update:${agent.agent_id}` ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  保存配置
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-900">环境变量</div>
                <button onClick={() => void onSaveEnv()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                  {busyAction === `env:${agent.agent_id}` ? <Loader2 size={15} className="animate-spin" /> : <Settings2 size={15} />}
                  保存环境变量
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">支持批量导入 `key=value`（换行或分号分隔，且兼容引号中的分号）</div>
                <button onClick={() => setShowEnvImportModal(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  批量导入
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {envEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有环境变量，点击下方按钮添加，或通过“批量导入”快速写入。</div>
                ) : (
                  envEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 p-3">
                      <input
                        value={entry.key}
                        onChange={(e) => setEnvEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, key: e.target.value } : item)))}
                        className="w-56 shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                        placeholder="KEY"
                      />
                      <span className="shrink-0 text-slate-400">=</span>
                      <input
                        value={entry.value}
                        onChange={(e) => setEnvEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, value: e.target.value } : item)))}
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                        placeholder="value"
                      />
                      <button
                        onClick={() => setEnvEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                        className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setEnvEntries((prev) => [...prev, createEnvEntry('', '')])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                  <Plus size={14} />
                  添加环境变量
                </button>
              </div>
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                    placeholder={'例如 OPENAI_API_KEY=xxx\\nHTTP_PROXY=\"http://a;b@proxy:8080\";DEBUG=true'}
                  />
                  {envImportError ? <div className="text-sm font-semibold text-red-600">{envImportError}</div> : null}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowEnvImportModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                    placeholder={'例如 --serve\\n--port\\n8080\\n或 --flag-a;--flag-b;\"--note=a;b\"'}
                  />
                  {argImportError ? <div className="text-sm font-semibold text-red-600">{argImportError}</div> : null}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowArgImportModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-900">LLM 应用状态</div>
                <LlmStatusBadge status={llmStatus} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">当前 Provider</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key })}</div>
                  <div className="mt-1 text-xs text-slate-500">{agent.llm_provider_key || '-'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">应用时间</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(agent.llm_provider_applied_at)}</div>
                  <div className="mt-1 text-xs text-slate-500">配置中心版本：{summaryUpdatedAt || '-'}</div>
                </div>
              </div>
              <JsonBlock
                title="LLM 快照与映射"
                value={{
                  llm_provider_snapshot: agent.llm_provider_snapshot || null,
                  llm_provider_mapped_env_keys: agent.llm_provider_mapped_env_keys || [],
                }}
                className="bg-slate-50"
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
  const { notify, feedbackNodes } = useUiFeedback();
  const { helpers, reload: reloadHelpers } = useAiHelpers(projectId, notify);
  const { loading, agents, reload } = useProjectAiAgents(projectId, notify);
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
  const [llmProviders, setLlmProviders] = useState<AiAgentLlmProviderSummary[]>([]);
  const [singleProviderKey, setSingleProviderKey] = useState('');
  const [singleProviderDetail, setSingleProviderDetail] = useState<AiAgentLlmProviderDetail | null>(null);
  const [singleLlmNotice, setSingleLlmNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [batchProviderKey, setBatchProviderKey] = useState('');
  const [batchProviderDetail, setBatchProviderDetail] = useState<AiAgentLlmProviderDetail | null>(null);
  const [llmBusy, setLlmBusy] = useState('');
  const [batchApplyResult, setBatchApplyResult] = useState<AiAgentLlmBatchApplyResult | null>(null);
  const lastSelectedKeyRef = useRef('');

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
        key: `${item.agent_key}::${item.service_name}`,
        label: `${item.agent_hostname || item.agent_key} · ${item.service_name}`,
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

  const groupedFilteredAgents = useMemo(() => {
    const map = new Map<string, ProjectAiAgentItem[]>();
    filteredAgents.forEach((item) => {
      const nodeKey = item.agent_hostname || item.agent_key || 'unknown-node';
      const list = map.get(nodeKey) || [];
      list.push(item);
      map.set(nodeKey, list);
    });
    return Array.from(map.entries())
      .map(([node, items]) => ({
        node,
        items: items.sort((a, b) => String(a.agent_id || '').localeCompare(String(b.agent_id || ''))),
      }))
      .sort((a, b) => a.node.localeCompare(b.node));
  }, [filteredAgents]);

  const batchPreviewBackendType = useMemo(() => getBatchPreviewBackendType(selectedAgents), [selectedAgents]);

  const allFilteredSelected =
    filteredAgents.length > 0 && filteredAgents.every((item) => selectedAgentKeys.includes(buildAgentKey(item)));

  useEffect(() => {
    if (!createHelperKey && helperOptions.length > 0) {
      setCreateHelperKey(helperOptions[0].key);
    }
  }, [helperOptions, createHelperKey]);

  useEffect(() => {
    const selectedChanged = lastSelectedKeyRef.current !== selectedKey;
    lastSelectedKeyRef.current = selectedKey;

    if (!selectedKey) {
      setSelectedAgent(null);
      setSelectedHelper(null);
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
      if (selectedChanged || !showSingleLlmModal) {
        setSingleProviderKey(nextAgent.llm_provider_key || '');
      }
      void loadHelper(nextAgent.agent_key, nextAgent.service_name, nextAgent.agent_id);
    }
  }, [selectedKey, agents, showSingleLlmModal]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const data = await api.environment.listAiAgentLlmProviders(projectId || '');
        const items = data.items || [];
        const fallbackProvider = data.default_provider_key || items[0]?.provider_key || '';
        setLlmProviders(items);
        setBatchProviderKey((current) => current || fallbackProvider);
        setSingleProviderKey((current) => current || fallbackProvider);
      } catch (error: any) {
        notify(`加载 LLM Provider 列表失败: ${error?.message || error}`, 'error');
      }
    };
    void loadProviders();
  }, [projectId, notify]);

  useEffect(() => {
    let cancelled = false;

    const loadSingleProviderDetail = async () => {
      if (!showSingleLlmModal || !singleProviderKey) {
        setSingleProviderDetail(null);
        return;
      }
      try {
        const detail = await api.environment.getAiAgentLlmProvider(projectId || '', singleProviderKey, selectedAgent?.backend_type);
        if (!cancelled) {
          setSingleProviderDetail(detail);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSingleProviderDetail(null);
          notify(`加载 LLM Provider 详情失败: ${error?.message || error}`, 'error');
        }
      }
    };
    void loadSingleProviderDetail();
    return () => {
      cancelled = true;
    };
  }, [projectId, singleProviderKey, selectedAgent?.backend_type, showSingleLlmModal, notify]);

  useEffect(() => {
    let cancelled = false;

    const loadBatchProviderDetail = async () => {
      if (!showBatchLlmModal || !batchProviderKey || selectedAgents.length === 0) {
        setBatchProviderDetail(null);
        return;
      }
      try {
        const detail = await api.environment.getAiAgentLlmProvider(projectId || '', batchProviderKey, batchPreviewBackendType);
        if (!cancelled) {
          setBatchProviderDetail(detail);
        }
      } catch (error: any) {
        if (!cancelled) {
          setBatchProviderDetail(null);
          notify(`加载批量 LLM Provider 详情失败: ${error?.message || error}`, 'error');
        }
      }
    };
    void loadBatchProviderDetail();
    return () => {
      cancelled = true;
    };
  }, [projectId, batchProviderKey, batchPreviewBackendType, selectedAgents.length, showBatchLlmModal, notify]);

  const loadHelper = async (agentKey: string, serviceName: string, focusAgentId?: string) => {
    try {
      const detail = await api.environment.getAiHelperDetail(projectId, agentKey, serviceName);
      setSelectedHelper(detail);
      const focused = (detail.agents || []).find((item) => item.agent_id === focusAgentId);
      if (focused) {
        setEnvEntries(envObjectToEntries(focused.env));
      }
    } catch (error: any) {
      notify(`加载 Agent 所属 helper 详情失败: ${error?.message || error}`, 'error');
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

  const runAgentAction = async (action: 'activate' | 'start' | 'stop' | 'delete', agent: ProjectAiAgentItem) => {
    if (action === 'delete') {
      const confirmed = await showConfirm({
        title: '删除 AI Agent',
        message: `确认删除 AI Agent ${agent.agent_id}？该操作会直接在 helper 上移除对应 backend。`,
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }

    setBusyAction(`${action}:${agent.agent_id}`);
    try {
      if (action === 'delete') {
        await api.environment.deleteAiHelperAgent(projectId, agent.agent_key, agent.service_name, agent.agent_id);
        if (selectedKey === buildAgentKey(agent)) {
          setSelectedKey('');
          setSelectedAgent(null);
          setSelectedHelper(null);
          setShowSingleLlmModal(false);
        }
      } else {
        await api.environment.runAiHelperAgentAction(projectId, agent.agent_key, agent.service_name, agent.agent_id, action);
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
      await api.environment.updateAiHelperAgent(projectId, selectedAgent.agent_key, selectedAgent.service_name, selectedAgent.agent_id, {
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
      await api.environment.replaceAiHelperAgentEnv(
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
      await api.environment.createAiHelperAgent(projectId, helper.agent_key, helper.service_name, {
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

  const applyProviderToSelectedAgent = async (refresh = false) => {
    if (!selectedAgent) return;
    const providerKey = singleProviderKey || selectedAgent.llm_provider_key || '';
    if (!providerKey) {
      notify('请先选择一个 LLM Provider', 'error');
      return;
    }
    setLlmBusy(refresh ? 'refresh-single' : 'apply-single');
    setSingleLlmNotice(null);
    try {
      await api.environment.applyAiAgentLlmProvider(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
        providerKey,
        refresh,
      );
      if (refresh) {
        setSingleLlmNotice({ type: 'success', text: '已从配置中心刷新 LLM 配置。' });
      } else {
        notify('已将 LLM 配置应用到当前 AI Agent', 'success');
      }
      await refreshAll();
      if (!refresh) {
        setShowSingleLlmModal(false);
      }
    } catch (error: any) {
      if (refresh) {
        setSingleLlmNotice({ type: 'error', text: `刷新失败：${error?.message || error}` });
      } else {
        notify(`应用 LLM 配置失败: ${error?.message || error}`, 'error');
      }
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
      message: `确认清除 ${selectedAgent.agent_id} 当前 LLM 映射？将移除已注入环境变量并清空绑定信息。`,
      confirmText: '确认清除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setLlmBusy('clear-single');
    setSingleLlmNotice(null);
    try {
      const envPayload = await api.environment.getAiHelperAgentEnv(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
      );
      const currentEnv = { ...(envPayload?.env || {}) };
      mappedKeys.forEach((key) => delete currentEnv[String(key)]);

      await api.environment.updateAiHelperAgent(projectId, selectedAgent.agent_key, selectedAgent.service_name, selectedAgent.agent_id, {
        backend_type: selectedAgent.backend_type,
        command: selectedAgent.command || selectedAgent.backend_type,
        args: Array.isArray(selectedAgent.args) ? selectedAgent.args : [],
        cwd: selectedAgent.cwd || undefined,
        env: currentEnv,
        enabled: !!selectedAgent.enabled,
        description: selectedAgent.description || '',
        llm_provider_key: null,
        llm_provider_snapshot: null,
        llm_provider_applied_at: null,
        llm_provider_mapped_env_keys: [],
      });

      setSingleProviderKey('');
      setSingleProviderDetail(null);
      setSingleLlmNotice({ type: 'success', text: `已清除映射（移除 ${mappedKeys.length} 个映射环境变量键）。` });
      notify('已清除当前 Agent 的 LLM 映射', 'success');
      await refreshAll();
    } catch (error: any) {
      setSingleLlmNotice({ type: 'error', text: `清除失败：${error?.message || error}` });
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

  const batchApplyProvider = async (refresh = false) => {
    if (!batchProviderKey) {
      notify('请先选择一个 LLM Provider', 'error');
      return;
    }
    if (selectedAgents.length === 0) {
      notify('请先选择至少一个 AI Agent', 'error');
      return;
    }
    setLlmBusy(refresh ? 'refresh-batch' : 'apply-batch');
    try {
      const result = await api.environment.batchApplyAiAgentLlmProvider(
        projectId,
        batchProviderKey,
        selectedAgents.map((item) => ({
          agent_key: item.agent_key,
          service_name: item.service_name,
          agent_id: item.agent_id,
        })),
        refresh,
      );
      setBatchApplyResult(result);
      notify(refresh ? '批量刷新已完成' : '批量应用已完成', result.status === 'failed' ? 'error' : 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`批量应用 LLM 配置失败: ${error?.message || error}`, 'error');
    } finally {
      setLlmBusy('');
    }
  };

  const batchClearProvider = async () => {
    if (selectedAgents.length === 0) {
      notify('请先选择至少一个 AI Agent', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量清除 LLM 映射',
      message: `确认清除已选 ${selectedAgents.length} 个 AI Agent 的 LLM 映射？将移除每个 Agent 已注入环境变量并清空绑定信息。`,
      confirmText: '确认清除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setLlmBusy('clear-batch');
    try {
      const results = await Promise.all(
        selectedAgents.map(async (agent) => {
          const mappedKeys = Array.isArray(agent.llm_provider_mapped_env_keys) ? agent.llm_provider_mapped_env_keys : [];
          try {
            const envPayload = await api.environment.getAiHelperAgentEnv(projectId, agent.agent_key, agent.service_name, agent.agent_id);
            const currentEnv = { ...(envPayload?.env || {}) };
            mappedKeys.forEach((key) => delete currentEnv[String(key)]);

            await api.environment.updateAiHelperAgent(projectId, agent.agent_key, agent.service_name, agent.agent_id, {
              backend_type: agent.backend_type,
              command: agent.command || agent.backend_type,
              args: Array.isArray(agent.args) ? agent.args : [],
              cwd: agent.cwd || undefined,
              env: currentEnv,
              enabled: !!agent.enabled,
              description: agent.description || '',
              llm_provider_key: null,
              llm_provider_snapshot: null,
              llm_provider_applied_at: null,
              llm_provider_mapped_env_keys: [],
            });
            return {
              agent_key: agent.agent_key,
              service_name: agent.service_name,
              agent_id: agent.agent_id,
              success: true,
            };
          } catch (error: any) {
            return {
              agent_key: agent.agent_key,
              service_name: agent.service_name,
              agent_id: agent.agent_id,
              success: false,
              error: error?.message || String(error),
            };
          }
        }),
      );

      const successCount = results.filter((item) => item.success).length;
      const batchResult: AiAgentLlmBatchApplyResult = {
        project_id: projectId,
        provider_key: '',
        refresh: false,
        status: successCount === results.length ? 'completed' : successCount === 0 ? 'failed' : 'partial',
        total: results.length,
        success_count: successCount,
        results,
      };
      setBatchApplyResult(batchResult);
      notify(
        successCount === results.length
          ? `批量清除完成（${successCount}/${results.length}）`
          : `批量清除部分完成（${successCount}/${results.length}）`,
        successCount === results.length ? 'success' : 'warning',
      );
      await refreshAll();
    } catch (error: any) {
      notify(`批量清除 LLM 映射失败: ${error?.message || error}`, 'error');
    } finally {
      setLlmBusy('');
    }
  };

  return (
    <>
      <div className="px-8 pt-8 pb-10">
        <div className="space-y-6">
          {feedbackNodes}

          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">AI Agent Workspace</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">AI Agent 管理</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">
                  先从列表查看当前项目下的全部 AI Agent，再按需进入右侧详情抽屉管理；LLM 快速应用已改为单个与批量两个对话框流程。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateToAppView('env-ai-agent-session-manage')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  <SquareTerminal size={15} />
                  会话管理
                </button>
                <button onClick={() => setShowCreateAgent((v) => !v)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700"
                >
                  <WandSparkles size={15} />
                  批量 LLM 应用
                </button>
                <button onClick={() => void refreshAll()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  <RefreshCw size={16} />
                  刷新
                </button>
              </div>
            </div>
          </section>

          <StatsStrip agents={agents} selectedCount={selectedAgentKeys.length} />

          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6 flex-1">
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm xl:col-span-2" placeholder="搜索节点、helper、agent_id、backend、provider" />
                <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部节点</option>{nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}</select>
                <select value={backendFilter} onChange={(e) => setBackendFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部后端</option>{backendOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <select value={installedFilter} onChange={(e) => setInstalledFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Installed 全部</option><option value="true">已安装</option><option value="false">未安装</option></select>
                <select value={runningFilter} onChange={(e) => setRunningFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Running 全部</option><option value="true">运行中</option><option value="false">已停止</option></select>
                <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Active 全部</option><option value="true">已激活</option><option value="false">未激活</option></select>
              </div>
              <div className="flex items-center justify-between gap-3 xl:justify-end">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={allFilteredSelected} onChange={(e) => toggleAllFiltered(e.target.checked)} />
                  全选当前筛选结果
                </label>
                <span className="text-xs text-slate-500">已勾选 {selectedAgentKeys.length} 个</span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="col-span-full flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载中...</div>
              ) : filteredAgents.length === 0 ? (
                <div className="col-span-full"><EmptyState text="当前筛选条件下没有 AI Agent。" /></div>
              ) : groupedFilteredAgents.map((group) => (
                <NodeCompactRow
                  key={group.node}
                  node={group.node}
                  items={group.items}
                  selectedKey={selectedKey}
                  selectedAgentKeys={selectedAgentKeys}
                  providerUpdatedAtMap={providerUpdatedAtMap}
                  onSelect={(agent) => setSelectedKey(buildAgentKey(agent))}
                  onCheck={(agent, checked) => toggleAgentSelection(agent, checked)}
                />
              ))}
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
            onOpenLlmModal={() => setShowSingleLlmModal(true)}
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
          agent={selectedAgent}
          providerOptions={llmProviders}
          selectedProviderKey={singleProviderKey}
          onProviderChange={setSingleProviderKey}
          providerDetail={singleProviderDetail}
          llmBusy={llmBusy}
          notice={singleLlmNotice}
          onClose={() => {
            setShowSingleLlmModal(false);
            setSingleLlmNotice(null);
          }}
          onApply={applyProviderToSelectedAgent}
          onClear={clearProviderMappingForSelectedAgent}
        />
      ) : null}

      {showBatchLlmModal ? (
        <BatchLlmApplyModal
          selectedAgents={selectedAgents}
          providerOptions={llmProviders}
          selectedProviderKey={batchProviderKey}
          onProviderChange={setBatchProviderKey}
          providerDetail={batchProviderDetail}
          llmBusy={llmBusy}
          result={batchApplyResult}
          onClose={() => setShowBatchLlmModal(false)}
          onApply={batchApplyProvider}
          onClear={batchClearProvider}
        />
      ) : null}
    </>
  );
};
