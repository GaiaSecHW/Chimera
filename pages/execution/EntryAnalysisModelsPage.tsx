import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { DEFAULT_MODELS_CONFIG } from '../../clients/appEntryAnalyse';
import {
  EntryAnalysisModelEntry,
  EntryAnalysisModelsConfig,
  EntryAnalysisProviderConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

const API_TYPES = ['openai-completions', 'anthropic', 'google-gemini', 'azure-openai'];

const emptyProvider = (): EntryAnalysisProviderConfig => ({
  baseUrl: '',
  api: 'openai-completions',
  apiKey: '',
  models: [],
});

const emptyModel = (): EntryAnalysisModelEntry => ({ id: '', reasoning: false });

const emptyConfig = (): EntryAnalysisModelsConfig => ({ providers: {} });

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
    <div>
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
    </label>
    {children}
  </div>
);

const ApiKeyInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-..."
        className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm font-mono"
      />
      <button type="button" onClick={() => setRevealed((r) => !r)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        title={revealed ? '隐藏 API Key' : '显示 API Key'}>
        {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
};

const ModelsList: React.FC<{
  models: EntryAnalysisModelEntry[];
  providerName: string;
  onChange: (models: EntryAnalysisModelEntry[]) => void;
}> = ({ models, providerName, onChange }) => {
  const add = () => onChange([...models, emptyModel()]);
  const remove = (i: number) => onChange(models.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<EntryAnalysisModelEntry>) =>
    onChange(models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">模型列表</p>
      {models.map((model, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <input type="text" value={model.id} onChange={(e) => update(i, { id: e.target.value })}
            placeholder="model-id"
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono" />
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={model.reasoning} onChange={(e) => update(i, { reasoning: e.target.checked })} />
            推理模型
          </label>
          {model.id && (
            <span className="hidden sm:inline text-xs text-slate-400 font-mono whitespace-nowrap">→ {providerName}/{model.id}</span>
          )}
          <button onClick={() => remove(i)} className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
        <Plus size={13} /> 添加模型
      </button>
    </div>
  );
};

const ProviderCard: React.FC<{
  name: string;
  config: EntryAnalysisProviderConfig;
  onRename: (newName: string) => void;
  onChange: (config: EntryAnalysisProviderConfig) => void;
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
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button onClick={() => setExpanded((e) => !e)} className="text-slate-400 hover:text-slate-600">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {editingName ? (
          <input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(name); setEditingName(false); } }}
            className="flex-1 rounded-lg border border-violet-300 px-2 py-1 text-sm font-mono font-bold" />
        ) : (
          <button onClick={() => setEditingName(true)}
            className="flex-1 text-left text-sm font-mono font-bold text-slate-800 hover:text-violet-700"
            title="点击编辑 provider 名称">{name}</button>
        )}
        <span className="text-xs text-slate-400">{config.models.length} 个模型</span>
        <button onClick={onRemove} className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50" title="删除 Provider"><Trash2 size={14} /></button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="baseUrl">
              <input type="text" value={config.baseUrl} onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </FieldRow>
            <FieldRow label="API 类型">
              <select value={config.api} onChange={(e) => onChange({ ...config, api: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                {API_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FieldRow>
          </div>
          <FieldRow label="API Key" hint="保存后加密存储">
            <ApiKeyInput value={config.apiKey} onChange={(v) => onChange({ ...config, apiKey: v })} />
          </FieldRow>
          <ModelsList models={config.models} providerName={name} onChange={(models) => onChange({ ...config, models })} />
        </div>
      )}
    </div>
  );
};

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const EntryAnalysisModelsPage: React.FC = () => {
  const { notify, feedbackNodes } = useUiFeedback();
  const entryAnalysis = api.domains.execution.appEntryAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EntryAnalysisModelsConfig>(emptyConfig);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    entryAnalysis.getModels()
      .then((data) => { if (!cancelled) setConfig(data ?? emptyConfig()); })
      .catch((err) => {
        if (!cancelled) {
          notify(`加载模型配置失败: ${err?.message ?? err}`, 'error');
          setConfig(DEFAULT_MODELS_CONFIG);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setProviders = (providers: Record<string, EntryAnalysisProviderConfig>) =>
    setConfig((prev) => ({ ...prev, providers }));

  const addProvider = () => {
    const baseName = 'new_provider';
    let name = baseName;
    let idx = 1;
    while (config.providers[name]) { name = `${baseName}_${idx++}`; }
    setProviders({ ...config.providers, [name]: emptyProvider() });
  };

  const removeProvider = (name: string) => {
    const next = { ...config.providers };
    delete next[name];
    setProviders(next);
  };

  const renameProvider = (oldName: string, newName: string) => {
    if (config.providers[newName]) { notify(`Provider "${newName}" 已存在`, 'error'); return; }
    const next: Record<string, EntryAnalysisProviderConfig> = {};
    for (const [k, v] of Object.entries(config.providers)) {
      next[k === oldName ? newName : k] = v;
    }
    setProviders(next);
  };

  const updateProvider = (name: string, updated: EntryAnalysisProviderConfig) =>
    setProviders({ ...config.providers, [name]: updated });

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await entryAnalysis.saveModels(config);
      setConfig(saved ?? config);
      notify('模型配置已保存', 'success');
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const allModelRefs = Object.entries(config.providers).flatMap(([pName, pCfg]) =>
    pCfg.models.filter((m) => m.id).map((m) => `${pName}/${m.id}`)
  );

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">模型配置</h1>
        <p className="mt-2 text-sm text-slate-500">
          管理入口分析引擎使用的 LLM 提供商及模型列表。引用格式：
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
            {'{'}provider_name{'}'}/{'{'}model_id{'}'}
          </code>
        </p>
        {config.updated_at && (
          <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
        )}
      </section>

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          {allModelRefs.length > 0 && (
            <SectionCard title="可用模型引用" subtitle="在分析配置中 agents[].model 中使用这些值">
              <div className="flex flex-wrap gap-2">
                {allModelRefs.map((ref) => (
                  <button key={ref}
                    onClick={() => { navigator.clipboard.writeText(ref).catch(() => {}); notify(`已复制 ${ref}`, 'success'); }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                    title="点击复制">
                    {ref}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          <div className="space-y-4">
            {Object.entries(config.providers).map(([name, provCfg]) => (
              <ProviderCard key={name} name={name} config={provCfg}
                onRename={(newName) => renameProvider(name, newName)}
                onChange={(updated) => updateProvider(name, updated)}
                onRemove={() => removeProvider(name)} />
            ))}
            {Object.keys(config.providers).length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
                暂无 Provider，点击「添加 Provider」开始配置
              </div>
            )}
          </div>

          <button onClick={addProvider}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-400 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
            <Plus size={15} /> 添加 Provider
          </button>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => void handleSave()} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              保存配置
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
