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

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
  <section style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div>
      <h2 style={{ fontSize: '16px', fontWeight: 600, color: LK.ink }}>{title}</h2>
      {subtitle && <p style={{ marginTop: '2px', fontSize: '12px', color: LK.body }}>{subtitle}</p>}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label style={{ fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>
      {label}
      {hint && <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: LK.muted }}>{hint}</span>}
    </label>
    {children}
  </div>
);

const ApiKeyInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-..."
        style={{ width: '100%', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '14px', fontFamily: MONO, backgroundColor: LK.surfaceRaised, color: LK.ink }}
      />
      <button type="button" onClick={() => setRevealed((r) => !r)}
        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: LK.muted, cursor: 'pointer', backgroundColor: 'transparent', border: 'none', padding: '0' }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color: LK.body, textTransform: 'uppercase', letterSpacing: '0.1em' }}>模型列表</p>
      {models.map((model, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}>
          <input type="text" value={model.id} onChange={(e) => update(i, { id: e.target.value })}
            placeholder="model-id"
            style={{ flex: 1, borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px', fontSize: '14px', fontFamily: MONO, backgroundColor: LK.surface, color: LK.ink }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: LK.body, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={model.reasoning} onChange={(e) => update(i, { reasoning: e.target.checked })} />
            推理模型
          </label>
          {model.id && (
            <span style={{ display: 'none', fontSize: '12px', color: LK.muted, fontFamily: MONO, whiteSpace: 'nowrap' }} className="sm:inline">→ {providerName}/{model.id}</span>
          )}
          <button onClick={() => remove(i)} style={{ borderRadius: '8px', border: `1px solid ${LK.error}`, padding: '6px', color: LK.error, cursor: 'pointer', backgroundColor: 'transparent' }}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '12px', border: `1px dashed ${LK.borderSoft}`, paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '14px', color: LK.body, cursor: 'pointer', backgroundColor: 'transparent' }}>
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
    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', borderBottom:`1px solid ${LK.borderSoft}` }}>
        <button onClick={() => setExpanded((e) => !e)} style={{ color: LK.muted, cursor: 'pointer', backgroundColor: 'transparent', border: 'none', padding: '0' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {editingName ? (
          <input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(name); setEditingName(false); } }}
            style={{ flex: 1, borderRadius: '8px', border: `1px solid ${LK.primary}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px', fontSize: '14px', fontFamily: MONO, fontWeight: 600, backgroundColor: LK.surfaceRaised, color: LK.ink }} />
        ) : (
          <button onClick={() => setEditingName(true)}
            style={{ flex: 1, textAlign: 'left', fontSize: '14px', fontFamily: MONO, fontWeight: 600, color: LK.inkSoft, cursor: 'pointer', backgroundColor: 'transparent', border: 'none', padding: '0' }}
            title="点击编辑 provider 名称">{name}</button>
        )}
        <span style={{ fontSize: '12px', color: LK.muted }}>{config.models.length} 个模型</span>
        <button onClick={onRemove} style={{ borderRadius: '8px', border: `1px solid ${LK.error}`, padding: '6px', color: LK.error, cursor: 'pointer', backgroundColor: 'transparent' }} title="删除 Provider"><Trash2 size={14} /></button>
      </div>

      {expanded && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            <FieldRow label="baseUrl">
              <input type="text" value={config.baseUrl} onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                style={{ width: '100%', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }} />
            </FieldRow>
            <FieldRow label="API 类型">
              <select value={config.api} onChange={(e) => onChange({ ...config, api: e.target.value })}
                style={{ width: '100%', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }}>
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
    while (config.providers[name]) { name =`${baseName}_${idx++}`; }
    setProviders({ ...config.providers, [name]: emptyProvider() });
  };

  const removeProvider = (name: string) => {
    const next = { ...config.providers };
    delete next[name];
    setProviders(next);
  };

  const renameProvider = (oldName: string, newName: string) => {
    if (config.providers[newName]) { notify(`Provider"${newName}" 已存在`, 'error'); return; }
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
    pCfg.models.filter((m) => m.id).map((m) =>`${pName}/${m.id}`)
  );

  return (
    <div style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '32px', paddingBottom: '40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {feedbackNodes}

 <section style={{ borderRadius: '32px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '24px' }}>
        <h1 style={{ marginTop: '12px', fontSize: '30px', fontWeight: 600, letterSpacing: '-0.025em', color: LK.ink }}>模型配置</h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: LK.body }}>
          管理入口分析引擎使用的 LLM 提供商及模型列表。引用格式：
          <code style={{ marginLeft: '4px', marginRight: '4px', borderRadius: '8px', backgroundColor: LK.surfaceRaised, paddingLeft: '6px', paddingRight: '6px', paddingTop: '2px', paddingBottom: '2px', fontFamily: MONO, fontSize: '12px', color: LK.inkSoft }}>
            {'{'}provider_name{'}'}/{'{'}model_id{'}'}
          </code>
        </p>
        {config.updated_at && (
          <p style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>上次保存：{new Date(config.updated_at).toLocaleString()}</p>
        )}
      </section>

      {loading ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', color: LK.body }}>
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {allModelRefs.length > 0 && (
            <SectionCard title="可用模型引用" subtitle="在分析配置中 agents[].model 中使用这些值">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {allModelRefs.map((ref) => (
                  <button key={ref}
                    onClick={() => { navigator.clipboard.writeText(ref).catch(() => {}); notify(`已复制 ${ref}`, 'success'); }}
                    style={{ borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', fontFamily: MONO, color: LK.inkSoft, cursor: 'pointer', transition: 'all 0.2s' }}
                    title="点击复制">
                    {ref}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.entries(config.providers).map(([name, provCfg]) => (
              <ProviderCard key={name} name={name} config={provCfg}
                onRename={(newName) => renameProvider(name, newName)}
                onChange={(updated) => updateProvider(name, updated)}
                onRemove={() => removeProvider(name)} />
            ))}
            {Object.keys(config.providers).length === 0 && (
              <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, paddingTop: '40px', paddingBottom: '40px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>
                暂无 Provider，点击「添加 Provider」开始配置
              </div>
            )}
          </div>

          <button onClick={addProvider}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', border: `1px dashed ${LK.border}`, paddingLeft: '20px', paddingRight: '20px', paddingTop: '10px', paddingBottom: '10px', fontSize: '14px', color: LK.body, cursor: 'pointer', backgroundColor: 'transparent' }}>
            <Plus size={15} /> 添加 Provider
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
            <button onClick={() => void handleSave()} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', backgroundColor: LK.surface, paddingLeft: '20px', paddingRight: '20px', paddingTop: '10px', paddingBottom: '10px', fontSize: '14px', fontWeight: 600, color: LK.ink, cursor: 'pointer', border: `1px solid ${LK.border}`, opacity: saving ? 0.5 : 1 }}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              保存配置
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
