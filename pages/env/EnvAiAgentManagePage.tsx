import React, { useEffect, useMemo, useState } from 'react';
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
  AiAgentLlmBatchApplyResult,
  AiAgentLlmProviderDetail,
  AiAgentLlmProviderSummary,
  AiHelperService,
  ProjectAiAgentItem,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  AgentStateBadges,
  EmptyState,
  HealthBadge,
  JsonBlock,
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

const AgentCard: React.FC<{
  agent: ProjectAiAgentItem;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
}> = ({ agent, selected, checked, onSelect, onCheck }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50/80 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label className="inline-flex items-center gap-2 text-xs text-slate-500" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={checked} onChange={(event) => onCheck(event.target.checked)} />
          批量选择
        </label>
        <div className="mt-2 flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900">{agent.agent_id}</div>
            <div className="truncate text-xs text-slate-500">{agent.agent_hostname || agent.agent_key} · {agent.service_name}</div>
          </div>
        </div>
      </div>
      <HealthBadge status={agent.health_status} />
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{agent.backend_type}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">LLM: {formatProviderText(agent.llm_provider_snapshot || { provider_key: agent.llm_provider_key })}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">参数: {Array.isArray(agent.args) ? agent.args.length : 0}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">环境变量: {agent.env ? Object.keys(agent.env).length : 0}</span>
    </div>

    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
      <div className="truncate"><span className="font-black text-slate-700">命令:</span> {agent.command || '-'}</div>
      <div className="mt-1 truncate"><span className="font-black text-slate-700">工作目录:</span> {agent.cwd || '-'}</div>
    </div>

    <div className="mt-3">
      <AgentStateBadges agent={agent} />
    </div>
  </button>
);

const ModalShell: React.FC<{
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}> = ({ title, description, onClose, children, maxWidthClassName = 'max-w-5xl' }) => (
  <div className="fixed inset-0 z-[260] bg-slate-950/55 backdrop-blur-sm p-4 md:p-8" onClick={onClose}>
    <div
      className={`mx-auto flex h-full w-full ${maxWidthClassName} flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_35px_120px_rgba(15,23,42,0.35)]`}
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
      <JsonBlock title="映射预览" value={providerDetail.mapped_env_preview || {}} className="bg-white" />
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
  onClose: () => void;
  onApply: (refresh: boolean) => Promise<void>;
}> = ({ agent, providerOptions, selectedProviderKey, onProviderChange, providerDetail, llmBusy, onClose, onApply }) => (
  <ModalShell
    title={`为 ${agent.agent_id} 选择 LLM 配置`}
    description="使用对话框选择 provider，确认映射后再写入当前 AI Agent。"
    onClose={onClose}
    maxWidthClassName="max-w-4xl"
  >
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">当前 Agent</div>
          <div className="mt-2 text-lg font-black text-slate-900">{agent.agent_id}</div>
          <div className="mt-1 text-sm text-slate-500">{agent.agent_hostname || agent.agent_key} · {agent.service_name}</div>
          <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 ring-1 ring-slate-200">
            {agent.backend_type}
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
              disabled={!selectedProviderKey}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {llmBusy === 'apply-single' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              应用到当前 Agent
            </button>
            <button
              onClick={() => void onApply(true)}
              disabled={!agent.llm_provider_key && !selectedProviderKey}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              {llmBusy === 'refresh-single' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              从配置中心刷新
            </button>
          </div>
        </div>

        <JsonBlock
          title="当前绑定状态"
          value={{
            llm_provider_key: agent.llm_provider_key,
            llm_provider_snapshot: agent.llm_provider_snapshot,
            llm_provider_applied_at: agent.llm_provider_applied_at,
            llm_provider_mapped_env_keys: agent.llm_provider_mapped_env_keys || [],
          }}
          className="bg-white"
        />
      </div>

      <LlmProviderPreview providerDetail={providerDetail} emptyText="选择一个 provider 后，可在这里看到当前 Agent 的环境变量映射预览。" />
    </div>
  </ModalShell>
);

const AgentDetailDrawer: React.FC<{
  agent: ProjectAiAgentItem | null;
  helper: AiHelperService | null;
  busyAction: string;
  editForm: { command: string; args: string; cwd: string; enabled: boolean; description: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ command: string; args: string; cwd: string; enabled: boolean; description: string }>>;
  editingEnvText: string;
  setEditingEnvText: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onAction: (action: 'activate' | 'start' | 'stop' | 'delete', agent: ProjectAiAgentItem) => Promise<void>;
  onSaveAgent: () => Promise<void>;
  onSaveEnv: () => Promise<void>;
  onOpenLlmModal: () => void;
}> = ({
  agent,
  helper,
  busyAction,
  editForm,
  setEditForm,
  editingEnvText,
  setEditingEnvText,
  onClose,
  onAction,
  onSaveAgent,
  onSaveEnv,
  onOpenLlmModal,
}) => {
  if (!agent) return null;

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
                <input value={editForm.command} onChange={(e) => setEditForm((prev) => ({ ...prev, command: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="二进制/命令路径，例如 /usr/local/bin/codex" />
                <input value={editForm.cwd} onChange={(e) => setEditForm((prev) => ({ ...prev, cwd: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="工作目录（可选），例如 /workspace/project" />
                <textarea value={editForm.args} onChange={(e) => setEditForm((prev) => ({ ...prev, args: e.target.value }))} rows={4} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono md:col-span-2" placeholder="args JSON" />
                <input value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="description" />
                <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2"><input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm((prev) => ({ ...prev, enabled: e.target.checked }))} />启用</label>
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
              <textarea value={editingEnvText} onChange={(e) => setEditingEnvText(e.target.value)} rows={16} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
            </div>

            <JsonBlock title="能力与健康" value={{ health: agent.health || {}, capabilities: agent.capabilities || {} }} />
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
    args: '[]',
    cwd: '',
    enabled: true,
    description: '',
  });
  const [editingEnvText, setEditingEnvText] = useState('{}');
  const [llmProviders, setLlmProviders] = useState<AiAgentLlmProviderSummary[]>([]);
  const [singleProviderKey, setSingleProviderKey] = useState('');
  const [singleProviderDetail, setSingleProviderDetail] = useState<AiAgentLlmProviderDetail | null>(null);
  const [batchProviderKey, setBatchProviderKey] = useState('');
  const [batchProviderDetail, setBatchProviderDetail] = useState<AiAgentLlmProviderDetail | null>(null);
  const [llmBusy, setLlmBusy] = useState('');
  const [batchApplyResult, setBatchApplyResult] = useState<AiAgentLlmBatchApplyResult | null>(null);

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

  const allFilteredSelected =
    filteredAgents.length > 0 && filteredAgents.every((item) => selectedAgentKeys.includes(buildAgentKey(item)));

  useEffect(() => {
    if (!createHelperKey && helperOptions.length > 0) {
      setCreateHelperKey(helperOptions[0].key);
    }
  }, [helperOptions, createHelperKey]);

  useEffect(() => {
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
        args: prettyJson(nextAgent.args || []),
        cwd: nextAgent.cwd || '',
        enabled: !!nextAgent.enabled,
        description: nextAgent.description || '',
      });
      setEditingEnvText(prettyJson(nextAgent.env || {}));
      setSingleProviderKey(nextAgent.llm_provider_key || '');
      void loadHelper(nextAgent.agent_key, nextAgent.service_name, nextAgent.agent_id);
    }
  }, [selectedKey, agents]);

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
    const loadSingleProviderDetail = async () => {
      if (!singleProviderKey) {
        setSingleProviderDetail(null);
        return;
      }
      try {
        const detail = await api.environment.getAiAgentLlmProvider(projectId || '', singleProviderKey, selectedAgent?.backend_type);
        setSingleProviderDetail(detail);
      } catch (error: any) {
        setSingleProviderDetail(null);
        notify(`加载 LLM Provider 详情失败: ${error?.message || error}`, 'error');
      }
    };
    void loadSingleProviderDetail();
  }, [projectId, singleProviderKey, selectedAgent?.backend_type, notify]);

  useEffect(() => {
    const loadBatchProviderDetail = async () => {
      if (!batchProviderKey) {
        setBatchProviderDetail(null);
        return;
      }
      try {
        const detail = await api.environment.getAiAgentLlmProvider(projectId || '', batchProviderKey, getBatchPreviewBackendType(selectedAgents));
        setBatchProviderDetail(detail);
      } catch (error: any) {
        setBatchProviderDetail(null);
        notify(`加载批量 LLM Provider 详情失败: ${error?.message || error}`, 'error');
      }
    };
    void loadBatchProviderDetail();
  }, [projectId, batchProviderKey, selectedAgents, notify]);

  const loadHelper = async (agentKey: string, serviceName: string, focusAgentId?: string) => {
    try {
      const detail = await api.environment.getAiHelperDetail(projectId, agentKey, serviceName);
      setSelectedHelper(detail);
      const focused = (detail.agents || []).find((item) => item.agent_id === focusAgentId);
      if (focused) {
        setEditingEnvText(prettyJson(focused.env || {}));
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
        args: JSON.parse(editForm.args || '[]'),
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

  const saveEnv = async () => {
    if (!selectedAgent) return;
    setBusyAction(`env:${selectedAgent.agent_id}`);
    try {
      await api.environment.replaceAiHelperAgentEnv(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
        JSON.parse(editingEnvText || '{}'),
      );
      notify('环境变量已保存', 'success');
      await refreshAll();
    } catch (error: any) {
      notify(`保存环境变量失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyAction('');
    }
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
    try {
      await api.environment.applyAiAgentLlmProvider(
        projectId,
        selectedAgent.agent_key,
        selectedAgent.service_name,
        selectedAgent.agent_id,
        providerKey,
        refresh,
      );
      notify(refresh ? '已从配置中心刷新 LLM 配置' : '已将 LLM 配置应用到当前 AI Agent', 'success');
      await refreshAll();
      setShowSingleLlmModal(false);
    } catch (error: any) {
      notify(`应用 LLM 配置失败: ${error?.message || error}`, 'error');
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

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {loading ? (
                <div className="col-span-full flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载中...</div>
              ) : filteredAgents.length === 0 ? (
                <div className="col-span-full"><EmptyState text="当前筛选条件下没有 AI Agent。" /></div>
              ) : filteredAgents.map((agent) => {
                const key = buildAgentKey(agent);
                return (
                  <AgentCard
                    key={key}
                    agent={agent}
                    selected={key === selectedKey}
                    checked={selectedAgentKeys.includes(key)}
                    onSelect={() => setSelectedKey(key)}
                    onCheck={(checked) => toggleAgentSelection(agent, checked)}
                  />
                );
              })}
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
            editingEnvText={editingEnvText}
            setEditingEnvText={setEditingEnvText}
            onClose={() => setSelectedKey('')}
            onAction={runAgentAction}
            onSaveAgent={saveAgent}
            onSaveEnv={saveEnv}
            onOpenLlmModal={() => setShowSingleLlmModal(true)}
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
          onClose={() => setShowSingleLlmModal(false)}
          onApply={applyProviderToSelectedAgent}
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
        />
      ) : null}
    </>
  );
};
