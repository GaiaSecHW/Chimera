import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, FileText, Link2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../../clients/api';
import { TemplateLlmBindingPreview, TemplateLlmProviderBinding, TemplateLlmProviderSummary } from '../../../types/types';

export const normalizeTemplateLlmBinding = (raw: any): TemplateLlmProviderBinding | null => {
  if (!raw || typeof raw !== 'object') return null;
  const providerKeys = Array.isArray(raw.provider_keys)
    ? raw.provider_keys
        .map((item) => String(item || '').trim())
        .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index)
    : [];
  if (providerKeys.length === 0) return null;

  const targetRaw = raw.target_services;
  const targetServices: '*' | string[] = targetRaw === '*' || !Array.isArray(targetRaw)
    ? '*'
    : targetRaw
        .map((item) => String(item || '').trim())
        .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

  return {
    provider_keys: providerKeys,
    target_services: targetServices,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  };
};

interface TemplateLlmBindingEditorProps {
  projectId: string;
  value: TemplateLlmProviderBinding | null;
  onChange: (next: TemplateLlmProviderBinding | null) => void;
  serviceOptions?: string[];
  disabled?: boolean;
  title?: string;
  description?: string;
}

export const TemplateLlmBindingEditor: React.FC<TemplateLlmBindingEditorProps> = ({
  projectId,
  value,
  onChange,
  serviceOptions = [],
  disabled = false,
  title = 'LLM Provider 绑定',
  description = '可按顺序选择多个 Provider，后者覆盖前者。',
}) => {
  const [providers, setProviders] = useState<TemplateLlmProviderSummary[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerToAdd, setProviderToAdd] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<TemplateLlmBindingPreview | null>(null);
  const [previewError, setPreviewError] = useState('');

  const normalizedValue = value ? normalizeTemplateLlmBinding(value) : null;
  const selectedProviderKeys = normalizedValue?.provider_keys || [];
  const targetServices = normalizedValue?.target_services || '*';
  const canSelectSpecificServices = serviceOptions.length > 0;

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      setProvidersLoading(true);
      try {
        const data = await api.environment.listTemplateLlmProviders(projectId || '');
        if (!cancelled) {
          const items = data?.items || [];
          setProviders(items);
          if (!providerToAdd) {
            setProviderToAdd(items[0]?.provider_key || '');
          }
        }
      } catch (err) {
        console.error('Failed to load template llm providers', err);
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (selectedProviderKeys.length === 0) {
        setPreview(null);
        setPreviewError('');
        return;
      }
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const data = await api.environment.previewTemplateLlmBinding(projectId || '', selectedProviderKeys, targetServices);
        if (!cancelled) setPreview(data);
      } catch (err: any) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(String(err?.message || err || '预览失败'));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [projectId, JSON.stringify(selectedProviderKeys), JSON.stringify(targetServices)]);

  const providerMap = useMemo(() => {
    const map = new Map<string, TemplateLlmProviderSummary>();
    providers.forEach((provider) => map.set(provider.provider_key, provider));
    return map;
  }, [providers]);

  const updateProviderKeys = (nextKeys: string[]) => {
    const normalized = nextKeys
      .map((item) => String(item || '').trim())
      .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);
    if (normalized.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      provider_keys: normalized,
      target_services: targetServices,
    });
  };

  const updateTargetServices = (nextTargets: '*' | string[]) => {
    if (selectedProviderKeys.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      provider_keys: selectedProviderKeys,
      target_services: nextTargets,
    });
  };

  const addProvider = () => {
    const key = String(providerToAdd || '').trim();
    if (!key || selectedProviderKeys.includes(key)) return;
    updateProviderKeys([...selectedProviderKeys, key]);
  };

  const removeProvider = (key: string) => {
    updateProviderKeys(selectedProviderKeys.filter((item) => item !== key));
  };

  const moveProvider = (index: number, direction: -1 | 1) => {
    const next = [...selectedProviderKeys];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    updateProviderKeys(next);
  };

  const toggleTargetService = (serviceName: string) => {
    if (targetServices === '*') {
      updateTargetServices([serviceName]);
      return;
    }
    const next = targetServices.includes(serviceName)
      ? targetServices.filter((item) => item !== serviceName)
      : [...targetServices, serviceName];
    updateTargetServices(next.length > 0 ? next : '*');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-800">{title}</h4>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        {providersLoading && <Loader2 size={16} className="animate-spin text-slate-400 shrink-0" />}
      </div>

      <>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <select
              value={providerToAdd}
              disabled={disabled || providers.length === 0}
              onChange={(e) => setProviderToAdd(e.target.value)}
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500/10"
            >
              {providers.length === 0 && <option value="">暂无可用 Provider</option>}
              {providers.map((provider) => (
                <option key={provider.provider_key} value={provider.provider_key}>
                  {provider.display_name || provider.provider_key} · {provider.provider_type}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={disabled || !providerToAdd}
              onClick={addProvider}
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Plus size={14} /> 添加 Provider
            </button>
          </div>

          <div className="space-y-2">
            {selectedProviderKeys.length === 0 ? (
              <div className="text-xs text-slate-400">当前未选择 Provider，重新生成时不会额外注入 LLM 环境变量或配置文件。</div>
            ) : (
              selectedProviderKeys.map((providerKey, index) => {
                const provider = providerMap.get(providerKey);
                return (
                  <div key={providerKey} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-800 truncate">{provider?.display_name || providerKey}</div>
                      <div className="text-[11px] text-slate-500 truncate">{providerKey} · {provider?.provider_type || 'unknown'}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" disabled={disabled || index === 0} onClick={() => moveProvider(index, -1)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ArrowUp size={14} /></button>
                      <button type="button" disabled={disabled || index === selectedProviderKeys.length - 1} onClick={() => moveProvider(index, 1)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ArrowDown size={14} /></button>
                      <button type="button" disabled={disabled} onClick={() => removeProvider(providerKey)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="text-xs font-black text-slate-700">注入目标</div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="radio"
                checked={targetServices === '*'}
                disabled={disabled}
                onChange={() => updateTargetServices('*')}
                className="w-4 h-4 accent-blue-600"
              />
              全部 service
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="radio"
                checked={targetServices !== '*'}
                disabled={disabled || !canSelectSpecificServices}
                onChange={() => updateTargetServices(canSelectSpecificServices ? [serviceOptions[0]] : '*')}
                className="w-4 h-4 accent-blue-600"
              />
              指定 service
            </label>
            {targetServices !== '*' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {canSelectSpecificServices ? serviceOptions.map((serviceName) => (
                  <label key={serviceName} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={Array.isArray(targetServices) && targetServices.includes(serviceName)}
                      disabled={disabled}
                      onChange={() => toggleTargetService(serviceName)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    {serviceName}
                  </label>
                )) : (
                  <div className="text-xs text-amber-600 flex items-center gap-2"><AlertCircle size={14} /> 当前模板未解析出可选 service，部署时仅支持全部 service</div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-slate-700">最终环境变量预览</div>
                <div className="text-[11px] text-slate-500 mt-1">按当前 Provider 顺序合并，后者覆盖前者。</div>
              </div>
              {previewLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            {previewError && <div className="text-xs text-red-600">{previewError}</div>}
            {!previewError && !previewLoading && (!preview || Object.keys(preview.merged_env || {}).length === 0) && (
              <div className="text-xs text-slate-400">暂无预览内容</div>
            )}
            {!previewError && preview && Object.keys(preview.merged_env || {}).length > 0 && (
              <div className="space-y-2 max-h-56 overflow-auto">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Link2 size={13} /> 注入键数量: {preview.mapped_env_keys.length}
                </div>
                {Object.entries(preview.merged_env).map(([key, val]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,180px)_1fr] gap-3 text-[11px] font-mono bg-slate-50 rounded-lg px-3 py-2">
                    <div className="text-slate-700 truncate">{key}</div>
                    <div className="text-slate-500 break-all">{String(val)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-slate-700">最终文件注入预览</div>
                <div className="text-[11px] text-slate-500 mt-1">按当前 Provider 顺序合并，同路径后者覆盖前者。</div>
              </div>
              {previewLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            {previewError && <div className="text-xs text-red-600">{previewError}</div>}
            {!previewError && !previewLoading && (!preview?.mapped_file_paths || preview.mapped_file_paths.length === 0) && (
              <div className="text-xs text-slate-400">暂无文件注入内容</div>
            )}
            {!previewError && preview && Array.isArray(preview.mapped_file_paths) && preview.mapped_file_paths.length > 0 && (
              <div className="space-y-2 max-h-56 overflow-auto">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <FileText size={13} /> 注入文件数量: {preview.mapped_file_paths.length}
                </div>
                {preview.mapped_file_paths.map((filePath) => {
                  const from = (preview.merged_files || []).find((item) => item.path === filePath)?.provider_key;
                  return (
                    <div key={filePath} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[11px] font-mono bg-slate-50 rounded-lg px-3 py-2">
                      <div className="text-slate-700 truncate">{filePath}</div>
                      <div className="text-slate-500">{from ? `from ${from}` : '-'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </>
    </div>
  );
};
