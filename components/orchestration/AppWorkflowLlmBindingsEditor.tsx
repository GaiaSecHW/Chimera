import React, { useEffect, useMemo, useState } from 'react';
import { Braces, FileCode2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../clients/api';
import { AppWorkflowLlmBinding, AppWorkflowLlmBindingRequest, LlmProviderDetail, LlmProviderFileBinding, LlmProviderSummary } from '../../types/types';

const fileFormatOptions: Array<LlmProviderFileBinding['format']> = ['json', 'yaml', 'yml', 'toml', 'env', 'conf', 'txt', 'md', 'xml', 'ini', 'other'];

const normalizeFileBindings = (fileBindings: unknown): LlmProviderFileBinding[] => {
  if (!Array.isArray(fileBindings)) return [];
  return fileBindings
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      const record = item as Record<string, any>;
      const format = String(record.format || 'other').toLowerCase() as LlmProviderFileBinding['format'];
      return {
        name: String(record.name || `config-${index + 1}.txt`),
        path: String(record.path || `/etc/llm/config-${index + 1}.txt`),
        content: typeof record.content === 'string' ? record.content : String(record.content ?? ''),
        format: fileFormatOptions.includes(format) ? format : 'other',
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      };
    });
};

export const createDefaultCustomLlmConfig = (): LlmProviderDetail => ({
  provider_key: '',
  display_name: '',
  provider_type: '',
  enabled: true,
  is_default: false,
  api_base: '',
  model: '',
  model_context_window: 128000,
  api_key: '',
  organization: null,
  api_version: null,
  timeout_seconds: 60,
  max_tokens: null,
  temperature: null,
  env_bindings: {},
  file_bindings: [],
  extra_config: {},
  description: '',
  created_at: null,
  updated_at: null,
});

const normalizeLlmProviderDetail = (draft: Partial<LlmProviderDetail> | null | undefined): LlmProviderDetail => ({
  provider_key: String(draft?.provider_key || ''),
  display_name: String(draft?.display_name || ''),
  provider_type: String(draft?.provider_type || ''),
  enabled: typeof draft?.enabled === 'boolean' ? draft.enabled : true,
  is_default: typeof draft?.is_default === 'boolean' ? draft.is_default : false,
  api_base: String(draft?.api_base || ''),
  model: String(draft?.model || ''),
  model_context_window: typeof draft?.model_context_window === 'number' && Number.isFinite(draft.model_context_window) ? Math.trunc(draft.model_context_window) : 128000,
  api_key: String(draft?.api_key || ''),
  organization: draft?.organization ? String(draft.organization) : null,
  api_version: draft?.api_version ? String(draft.api_version) : null,
  timeout_seconds: typeof draft?.timeout_seconds === 'number' && Number.isFinite(draft.timeout_seconds) ? draft.timeout_seconds : 60,
  max_tokens: typeof draft?.max_tokens === 'number' && Number.isFinite(draft.max_tokens) ? draft.max_tokens : null,
  temperature: typeof draft?.temperature === 'number' && Number.isFinite(draft.temperature) ? draft.temperature : null,
  env_bindings: draft?.env_bindings && typeof draft.env_bindings === 'object' && !Array.isArray(draft.env_bindings) ? draft.env_bindings : {},
  file_bindings: normalizeFileBindings(draft?.file_bindings),
  extra_config: draft?.extra_config && typeof draft.extra_config === 'object' && !Array.isArray(draft.extra_config) ? draft.extra_config : {},
  description: draft?.description ? String(draft.description) : '',
  created_at: draft?.created_at || null,
  updated_at: draft?.updated_at || null,
});

const normalizeBindingRequest = (binding: AppWorkflowLlmBindingRequest | AppWorkflowLlmBinding | null | undefined): AppWorkflowLlmBindingRequest | null => {
  if (!binding || typeof binding !== 'object') return null;
  const source = binding.source === 'custom' ? 'custom' : 'config_center';
  if (source === 'custom') {
    return {
      source,
      config: normalizeLlmProviderDetail(binding.config),
    };
  }
  return {
    source,
    provider_key: String(binding.provider_key || ''),
  };
};

const countEnabledFiles = (detail?: LlmProviderDetail | null) => (detail?.file_bindings || []).filter((item) => item?.enabled).length;

const createDefaultFileBinding = (index: number): LlmProviderFileBinding => ({
  name: `config-${index + 1}.yaml`,
  path: `/etc/llm/config-${index + 1}.yaml`,
  content: '',
  format: 'yaml',
  enabled: true,
});

interface AppWorkflowLlmBindingsEditorProps {
  value: Array<AppWorkflowLlmBindingRequest | AppWorkflowLlmBinding>;
  onChange: (next: AppWorkflowLlmBindingRequest[]) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  showWrapper?: boolean;
}

export const AppWorkflowLlmBindingsEditor: React.FC<AppWorkflowLlmBindingsEditorProps> = ({
  value,
  onChange,
  disabled = false,
  title = 'LLM 配置绑定',
  description = '支持绑定多个 LLM 配置，后面的同名环境变量和同路径文件会覆盖前面的配置。',
  showWrapper = true,
}) => {
  const orchestrationApi = api.domains.orchestration;
  const [providers, setProviders] = useState<LlmProviderSummary[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerDetails, setProviderDetails] = useState<Record<string, LlmProviderDetail>>({});
  const [customEditorIndex, setCustomEditorIndex] = useState<number | null>(null);
  const [customJsonText, setCustomJsonText] = useState('');
  const [customJsonError, setCustomJsonError] = useState('');

  const bindings = useMemo(
    () => (value || []).map((item) => normalizeBindingRequest(item)).filter((item): item is AppWorkflowLlmBindingRequest => !!item),
    [value],
  );

  const loadProviders = async () => {
    setLoadingProviders(true);
    try {
      const data = await orchestrationApi.workflow.listAppWorkflowLlmProviders();
      setProviders(data.items || []);
    } catch (error) {
      console.error('Failed to load app workflow llm providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    const missingKeys = bindings
      .filter((binding) => binding.source === 'config_center' && binding.provider_key)
      .map((binding) => String(binding.provider_key || '').trim())
      .filter((providerKey, index, arr) => providerKey && arr.indexOf(providerKey) === index && !providerDetails[providerKey]);

    if (missingKeys.length === 0) return;
    let cancelled = false;
    const run = async () => {
      for (const providerKey of missingKeys) {
        try {
          const detail = await orchestrationApi.workflow.getAppWorkflowLlmProvider(providerKey);
          if (cancelled) return;
          setProviderDetails((prev) => ({ ...prev, [providerKey]: normalizeLlmProviderDetail(detail) }));
        } catch (error) {
          console.error('Failed to load llm provider detail:', error);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [bindings, providerDetails]);

  const updateBindings = (next: AppWorkflowLlmBindingRequest[]) => {
    onChange(next);
  };

  const addConfigCenterBinding = () => {
    const fallbackProviderKey = providers[0]?.provider_key || '';
    updateBindings([...bindings, { source: 'config_center', provider_key: fallbackProviderKey }]);
  };

  const addCustomBinding = () => {
    updateBindings([...bindings, { source: 'custom', config: createDefaultCustomLlmConfig() }]);
  };

  const updateBinding = (index: number, patch: Partial<AppWorkflowLlmBindingRequest>) => {
    updateBindings(bindings.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const replaceBinding = (index: number, nextBinding: AppWorkflowLlmBindingRequest) => {
    updateBindings(bindings.map((item, itemIndex) => (itemIndex === index ? nextBinding : item)));
  };

  const removeBinding = (index: number) => {
    updateBindings(bindings.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateCustomConfig = (index: number, patch: Partial<LlmProviderDetail>) => {
    const binding = bindings[index];
    const nextConfig = normalizeLlmProviderDetail({
      ...(binding?.config || createDefaultCustomLlmConfig()),
      ...patch,
    });
    replaceBinding(index, { source: 'custom', config: nextConfig });
  };

  const addCustomFileBinding = (index: number) => {
    const currentConfig = normalizeLlmProviderDetail(bindings[index]?.config);
    updateCustomConfig(index, {
      file_bindings: [...(currentConfig.file_bindings || []), createDefaultFileBinding(currentConfig.file_bindings.length)],
    });
  };

  const updateCustomFileBinding = (bindingIndex: number, fileIndex: number, patch: Partial<LlmProviderFileBinding>) => {
    const currentConfig = normalizeLlmProviderDetail(bindings[bindingIndex]?.config);
    const nextFiles = (currentConfig.file_bindings || []).map((item, itemIndex) => (
      itemIndex === fileIndex ? { ...item, ...patch } : item
    ));
    updateCustomConfig(bindingIndex, { file_bindings: nextFiles });
  };

  const removeCustomFileBinding = (bindingIndex: number, fileIndex: number) => {
    const currentConfig = normalizeLlmProviderDetail(bindings[bindingIndex]?.config);
    updateCustomConfig(bindingIndex, {
      file_bindings: (currentConfig.file_bindings || []).filter((_, itemIndex) => itemIndex !== fileIndex),
    });
  };

  const openCustomEditor = (index: number) => {
    const binding = bindings[index];
    const draft = normalizeLlmProviderDetail(binding?.config);
    setCustomEditorIndex(index);
    setCustomJsonError('');
    setCustomJsonText(JSON.stringify(draft, null, 2));
  };

  const saveCustomEditor = () => {
    if (customEditorIndex === null) return;
    try {
      const parsed = JSON.parse(customJsonText);
      replaceBinding(customEditorIndex, { source: 'custom', config: normalizeLlmProviderDetail(parsed) });
      setCustomEditorIndex(null);
      setCustomJsonError('');
    } catch (error: any) {
      setCustomJsonError(error?.message || 'JSON 解析失败');
    }
  };

  const content = (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-black text-sky-400">{title}</div>
          <div className="mt-1 text-xs text-sky-700/80">{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadProviders()}
            disabled={disabled || loadingProviders}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-primary hover:border-sky-300 disabled:opacity-50"
          >
            {loadingProviders ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </button>
          <button
            type="button"
            onClick={addConfigCenterBinding}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            <Plus size={14} />
            配置中心
          </button>
          <button
            type="button"
            onClick={addCustomBinding}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-theme-elevated px-3 py-2 text-xs font-bold text-sky-400 hover:border-sky-300 disabled:opacity-50"
          >
            <Braces size={14} />
            自定义
          </button>
        </div>
      </div>

      {bindings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-500/20 bg-theme-elevated/80 px-4 py-4 text-sm text-sky-400">
          当前未绑定 LLM 配置。可以添加多个配置中心 Provider，或新增自定义 JSON 配置。
        </div>
      ) : (
        <div className="space-y-4">
          {bindings.map((binding, index) => {
            const providerKey = String(binding.provider_key || '').trim();
            const configDetail = binding.source === 'custom'
              ? normalizeLlmProviderDetail(binding.config)
              : (providerDetails[providerKey] || null);
            return (
              <div key={`${binding.source}-${providerKey || 'custom'}-${index}`} className="rounded-xl border border-sky-500/20 bg-theme-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-sky-100/10 px-2.5 py-1 text-[11px] font-black text-sky-400">#{index + 1}</span>
                    <select
                      value={binding.source}
                      disabled={disabled}
                      onChange={(event) => {
                        const nextSource = event.target.value === 'custom' ? 'custom' : 'config_center';
                        if (nextSource === 'custom') {
                          replaceBinding(index, { source: 'custom', config: createDefaultCustomLlmConfig() });
                        } else {
                          replaceBinding(index, { source: 'config_center', provider_key: providers[0]?.provider_key || '' });
                        }
                      }}
                      className="rounded-lg border border-theme-border px-3 py-2 text-sm outline-none focus:border-sky-500"
                    >
                      <option value="config_center">配置中心</option>
                      <option value="custom">自定义 JSON</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBinding(index)}
                    disabled={disabled}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-500/15 disabled:opacity-50"
                    title="删除绑定"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {binding.source === 'config_center' ? (
                  <div className="space-y-3">
                    <select
                      value={providerKey}
                      disabled={disabled || loadingProviders}
                      onChange={(event) => updateBinding(index, { provider_key: event.target.value, config: undefined })}
                      className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm outline-none focus:border-sky-500"
                    >
                      <option value="">选择 LLM Provider</option>
                      {providers.map((provider) => (
                        <option key={provider.provider_key} value={provider.provider_key}>
                          {provider.display_name || provider.provider_key} · {provider.provider_type}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-xl bg-theme-elevated p-4 text-sm text-theme-text-primary">
                      {configDetail ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div><span className="font-bold">Provider Key：</span>{configDetail.provider_key || '-'}</div>
                          <div><span className="font-bold">显示名：</span>{configDetail.display_name || '-'}</div>
                          <div><span className="font-bold">模型：</span>{configDetail.model || '-'}</div>
                          <div><span className="font-bold">渠道类型：</span>{configDetail.provider_type || '-'}</div>
                          <div className="break-all"><span className="font-bold">API Base：</span>{configDetail.api_base || '-'}</div>
                          <div><span className="font-bold">文件注入：</span>{countEnabledFiles(configDetail)} 个启用文件</div>
                        </div>
                      ) : (
                        <div className="text-theme-text-faint">选择 Provider 后会展示环境变量与文件注入摘要。</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="text-sm text-theme-text-secondary">自定义绑定会按配置中心一致的数据结构进行保存，支持 `env_bindings` 和 `file_bindings`。</div>
                      <button
                        type="button"
                        onClick={() => openCustomEditor(index)}
                        disabled={disabled}
                        className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                      >
                        编辑 JSON
                      </button>
                    </div>
                    <div className="rounded-xl bg-theme-elevated p-4 text-sm text-theme-text-primary">
                      <div><span className="font-bold">Provider Key：</span>{configDetail?.provider_key || '-'}</div>
                      <div className="mt-1"><span className="font-bold">显示名：</span>{configDetail?.display_name || '-'}</div>
                      <div className="mt-1"><span className="font-bold">模型：</span>{configDetail?.model || '-'}</div>
                      <div className="mt-1"><span className="font-bold">文件注入：</span>{countEnabledFiles(configDetail)} 个启用文件</div>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-elevated/80 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black text-theme-text-primary">
                            <FileCode2 size={15} className="text-sky-400" />
                            配置文件注入
                          </div>
                          <div className="mt-1 text-xs text-theme-text-faint">可直接为当前绑定增加多个配置文件，实例创建时会一并写入 `file_bindings`。</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addCustomFileBinding(index)}
                          disabled={disabled}
                          className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-theme-elevated px-3 py-2 text-xs font-bold text-sky-400 hover:border-sky-300 disabled:opacity-50"
                        >
                          <Plus size={14} />
                          新增文件
                        </button>
                      </div>

                      {(configDetail?.file_bindings || []).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-4 text-xs text-theme-text-faint">
                          当前没有配置文件注入项，可以直接新增并填写文件路径、格式和内容。
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(configDetail?.file_bindings || []).map((fileBinding, fileIndex) => (
                            <div key={`${fileBinding.path}-${fileIndex}`} className="rounded-xl border border-theme-border bg-theme-elevated p-4">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="text-xs font-bold text-theme-text-faint">文件 #{fileIndex + 1}</div>
                                <button
                                  type="button"
                                  onClick={() => removeCustomFileBinding(index, fileIndex)}
                                  disabled={disabled}
                                  className="rounded-lg p-2 text-red-500 hover:bg-red-50/10 disabled:opacity-50"
                                  title="删除文件"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <input
                                  value={fileBinding.name}
                                  disabled={disabled}
                                  onChange={(event) => updateCustomFileBinding(index, fileIndex, { name: event.target.value })}
                                  placeholder="provider-config.yaml"
                                  className="rounded-xl border border-theme-border px-3 py-2 text-sm outline-none focus:border-sky-500"
                                />
                                <input
                                  value={fileBinding.path}
                                  disabled={disabled}
                                  onChange={(event) => updateCustomFileBinding(index, fileIndex, { path: event.target.value })}
                                  placeholder="/etc/llm/provider-config.yaml"
                                  className="rounded-xl border border-theme-border px-3 py-2 text-sm outline-none focus:border-sky-500"
                                />
                                <select
                                  value={fileBinding.format}
                                  disabled={disabled}
                                  onChange={(event) => updateCustomFileBinding(index, fileIndex, { format: event.target.value as LlmProviderFileBinding['format'] })}
                                  className="rounded-xl border border-theme-border px-3 py-2 text-sm outline-none focus:border-sky-500"
                                >
                                  {fileFormatOptions.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </select>
                                <label className="flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm text-theme-text-primary">
                                  <input
                                    type="checkbox"
                                    checked={fileBinding.enabled}
                                    disabled={disabled}
                                    onChange={(event) => updateCustomFileBinding(index, fileIndex, { enabled: event.target.checked })}
                                    className="h-4 w-4 rounded border-theme-border"
                                  />
                                  启用该文件
                                </label>
                              </div>
                              <textarea
                                value={fileBinding.content}
                                disabled={disabled}
                                onChange={(event) => updateCustomFileBinding(index, fileIndex, { content: event.target.value })}
                                placeholder="填写注入到容器内的文件内容"
                                className="mt-3 min-h-[140px] w-full rounded-xl border border-theme-border bg-theme-bg-app p-3 font-mono text-sm text-emerald-300 outline-none focus:border-sky-500"
                                spellCheck={false}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <>
      {showWrapper ? (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/15 p-5">{content}</div>
      ) : content}

      {customEditorIndex !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-theme-surface shadow-2xl">
            <div className="border-b border-theme-border p-6">
              <h3 className="text-2xl font-black text-theme-text-primary">自定义 LLM JSON 配置</h3>
              <p className="mt-1 text-sm text-theme-text-secondary">支持配置 `env_bindings` 与 `file_bindings`，保存后会作为当前实例的绑定快照。</p>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <textarea
                value={customJsonText}
                onChange={(event) => {
                  setCustomJsonText(event.target.value);
                  if (customJsonError) setCustomJsonError('');
                }}
                className="min-h-[420px] w-full rounded-2xl border border-theme-border bg-theme-bg-app p-4 font-mono text-sm text-emerald-300 outline-none focus:border-sky-500"
                spellCheck={false}
              />
              {customJsonError && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/15 px-4 py-3 text-sm text-red-400">
                  {customJsonError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-theme-border p-6">
              <div className="text-xs text-theme-text-secondary">建议至少填写 `provider_key`、`display_name`、`provider_type`、`api_base`、`model`、`api_key`，如需文件注入可补充 `file_bindings`。</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCustomEditorIndex(null);
                    setCustomJsonError('');
                  }}
                  className="px-5 py-3 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveCustomEditor}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-bold text-white hover:bg-sky-500"
                >
                  保存当前 JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
