import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { DEFAULT_MODELS_CONFIG } from '../../clients/appSystemAnalyse';
import {
  SystemAnalysisModelEntry,
  SystemAnalysisModelsConfig,
  SystemAnalysisProviderConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageSection, FormField } from '../../design-system';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
} as const;

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const API_TYPES = ['openai-completions', 'anthropic', 'google-gemini', 'azure-openai'];

const emptyProvider = (): SystemAnalysisProviderConfig => ({
  baseUrl: '',
  api: 'openai-completions',
  apiKey: '',
  models: [],
});

const emptyModel = (): SystemAnalysisModelEntry => ({ id: '', reasoning: false });

const emptyConfig = (): SystemAnalysisModelsConfig => ({ providers: {} });

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <PageSection title={title} description={subtitle}>{children}</PageSection>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <FormField label={label} hint={hint}>{children}</FormField>
);

interface ApiKeyInputProps {
  value: string;
  onChange: (v: string) => void;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ value, onChange }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-..."
        className="w-full rounded-lg px-3 py-2 pr-10 text-sm font-mono"
        style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.ink }}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-80"
        style={{ color: LK.muted }}
        title={revealed ? '隐藏 API Key' : '显示 API Key'}
      >
        {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
};

// ─── 模型列表编辑器 ────────────────────────────────────────────────────────────

const ModelsList: React.FC<{
  models: SystemAnalysisModelEntry[];
  providerName: string;
  onChange: (models: SystemAnalysisModelEntry[]) => void;
}> = ({ models, providerName, onChange }) => {
  const add = () => onChange([...models, emptyModel()]);
  const remove = (i: number) => onChange(models.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<SystemAnalysisModelEntry>) =>
    onChange(models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-theme-text-muted uppercase tracking-wider">模型列表</p>
      {models.map((model, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2">
          <input
            type="text"
            value={model.id}
            onChange={(e) => update(i, { id: e.target.value })}
            placeholder="model-id"
            className="flex-1 rounded-lg border border-theme-border px-2 py-1.5 text-sm font-mono"
          />
          <label className="inline-flex items-center gap-1.5 text-sm text-theme-text-secondary cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={model.reasoning}
              onChange={(e) => update(i, { reasoning: e.target.checked })}
            />
            推理模型
          </label>
          {model.id && (
            <span className="hidden sm:inline text-xs text-theme-text-muted font-mono whitespace-nowrap">
              → {providerName}/{model.id}
            </span>
          )}
          <button
            onClick={() => remove(i)}
            className="rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/15"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-theme-border px-3 py-1.5 text-sm text-theme-text-muted hover:bg-theme-elevated"
      >
        <Plus size={13} /> 添加模型
      </button>
    </div>
  );
};

// ─── 单个 Provider 编辑器 ──────────────────────────────────────────────────────

const ProviderCard: React.FC<{
  name: string;
  config: SystemAnalysisProviderConfig;
  onRename: (newName: string) => void;
  onChange: (config: SystemAnalysisProviderConfig) => void;
  onRemove: () => void;
}> = ({ name, config, onRename, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(name);

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setNameValue(name);
    setEditingName(false);
  };

  return (
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-theme-border">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-theme-text-muted hover:text-theme-text-secondary"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(name); setEditingName(false); } }}
            className="flex-1 rounded-lg border border-cyan-300 px-2 py-1 text-sm font-mono font-bold"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex-1 text-left text-sm font-mono font-bold text-theme-text-primary hover:text-cyan-400"
            title="点击编辑 provider 名称"
          >
            {name}
          </button>
        )}
        <span className="text-xs text-theme-text-muted">{config.models.length} 个模型</span>
        <button
          onClick={onRemove}
          className="rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/15"
          title="删除 Provider"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="baseUrl">
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm"
              />
            </FieldRow>
            <FieldRow label="API 类型">
              <select
                value={config.api}
                onChange={(e) => onChange({ ...config, api: e.target.value })}
                className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm bg-theme-bg-app"
              >
                {API_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FieldRow>
          </div>
          <FieldRow label="API Key" hint="保存后加密存储">
            <ApiKeyInput value={config.apiKey} onChange={(v) => onChange({ ...config, apiKey: v })} />
          </FieldRow>
          <ModelsList
            models={config.models}
            providerName={name}
            onChange={(models) => onChange({ ...config, models })}
          />
        </div>
      )}
    </div>
  );
};

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const SystemAnalysisModelsPage: React.FC = () => {
  const { notify, feedbackNodes } = useUiFeedback();
  const systemAnalysis = api.domains.execution.appSystemAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SystemAnalysisModelsConfig>(emptyConfig);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    systemAnalysis.getModels()
      .then((data) => {
        if (!cancelled) setConfig(data ?? emptyConfig());
      })
      .catch((err) => {
        if (!cancelled) {
          // Any remaining error (network down, 503, etc.) — show warning but fall back to built-in defaults
          notify(`加载模型配置失败: ${err?.message ?? err}`, 'error');
          setConfig(DEFAULT_MODELS_CONFIG);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setProviders = (providers: Record<string, SystemAnalysisProviderConfig>) =>
    setConfig((prev) => ({ ...prev, providers }));

  const addProvider = () => {
    const baseName = 'new_provider';
    let name = baseName;
    let idx = 1;
    while (config.providers[name]) {
      name =`${baseName}_${idx++}`;
    }
    setProviders({ ...config.providers, [name]: emptyProvider() });
  };

  const removeProvider = (name: string) => {
    const next = { ...config.providers };
    delete next[name];
    setProviders(next);
  };

  const renameProvider = (oldName: string, newName: string) => {
    if (config.providers[newName]) {
      notify(`Provider"${newName}" 已存在`, 'error');
      return;
    }
    const next: Record<string, SystemAnalysisProviderConfig> = {};
    for (const [k, v] of Object.entries(config.providers)) {
      next[k === oldName ? newName : k] = v;
    }
    setProviders(next);
  };

  const updateProvider = (name: string, updated: SystemAnalysisProviderConfig) =>
    setProviders({ ...config.providers, [name]: updated });

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await systemAnalysis.saveModels(config);
      setConfig(saved ?? config);
      notify('模型配置已保存', 'success');
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Build flat list of all model refs for display
  const allModelRefs = Object.entries(config.providers).flatMap(([pName, pCfg]) =>
    pCfg.models.filter((m) => m.id).map((m) =>`${pName}/${m.id}`)
  );

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      {/* 页头 */}
 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app p-6">
        <h1 className="mt-3 text-3xl font-black tracking-tight text-theme-text-primary">模型配置</h1>
        <p className="mt-2 text-sm text-theme-text-muted">
          管理分析引擎使用的 LLM 提供商及模型列表。模型引用格式：
          <code className="mx-1 rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-xs text-theme-text-secondary">
            {'{'}provider_name{'}'}/{'{'}model_id{'}'}
          </code>
        </p>
        {config.updated_at && (
          <p className="mt-1 text-xs text-theme-text-muted">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
        )}
      </section>

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm text-theme-text-secondary">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 可用模型引用一览 */}
          {allModelRefs.length > 0 && (
            <SectionCard title="可用模型引用" subtitle="在分析配置中 agents[].model 或 stage_models 中使用这些值">
              <div className="flex flex-wrap gap-2">
                {allModelRefs.map((ref) => (
                  <button
                    key={ref}
                    onClick={() => { navigator.clipboard.writeText(ref).catch(() => {}); notify(`已复制 ${ref}`, 'success'); }}
                    className="rounded-lg border border-theme-border bg-theme-bg-app px-3 py-1.5 text-xs font-mono text-theme-text-secondary hover:border-cyan-300 hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors"
                    title="点击复制"
                  >
                    {ref}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Providers */}
          <div className="space-y-4">
            {Object.entries(config.providers).map(([name, provCfg]) => (
              <ProviderCard
                key={name}
                name={name}
                config={provCfg}
                onRename={(newName) => renameProvider(name, newName)}
                onChange={(updated) => updateProvider(name, updated)}
                onRemove={() => removeProvider(name)}
              />
            ))}
            {Object.keys(config.providers).length === 0 && (
              <div className="rounded-2xl border border-dashed border-theme-border py-10 text-center text-sm text-theme-text-muted">
                暂无 Provider，点击「添加 Provider」开始配置
              </div>
            )}
          </div>

          <button
            onClick={addProvider}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-400 px-5 py-2.5 text-sm text-theme-text-secondary hover:bg-theme-elevated"
          >
            <Plus size={15} /> 添加 Provider
          </button>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              保存配置
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
