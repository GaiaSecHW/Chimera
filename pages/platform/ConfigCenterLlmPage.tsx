import React, { useEffect, useMemo, useRef, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Bot, BookOpenText, Braces, CheckCircle2, Copy, Eye, EyeOff, FileCode2, LayoutPanelTop, Loader2, MessageSquare, Plus, RefreshCw, Save, ShieldAlert, Sparkles, Trash2, Wifi, X } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { LlmProviderDetail, LlmProviderFileBinding, LlmProviderSummary, LlmProviderTestResult, LlmProviderUpsertRequest } from '../../types/types';

interface ConfigCenterLlmPageProps {
  onOpenChat: () => void;
}

const normalizeEnvBindings = (envBindings: Record<string, any> | undefined) => {
  return { ...(envBindings || {}) };
};

const fileFormatOptions: Array<LlmProviderFileBinding['format']> = ['json', 'yaml', 'yml', 'toml', 'env', 'conf', 'txt', 'md', 'xml', 'ini', 'other'];

const normalizeFileBindings = (fileBindings: unknown): LlmProviderFileBinding[] => {
  if (!Array.isArray(fileBindings)) return [];
  return fileBindings
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      const record = item as Record<string, any>;
      const format = String(record.format || 'other').toLowerCase() as LlmProviderFileBinding['format'];
      return {
        name: String(record.name ||`config-${index + 1}.txt`),
        path: String(record.path ||`/etc/llm/config-${index + 1}.txt`),
        content: typeof record.content === 'string' ? record.content : String(record.content ?? ''),
        format: fileFormatOptions.includes(format) ? format : 'other',
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      };
    });
};

const toMonacoLanguage = (format: LlmProviderFileBinding['format']) => {
  switch (format) {
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'toml':
      return 'ini';
    case 'env':
    case 'conf':
    case 'ini':
      return 'shell';
    case 'md':
      return 'markdown';
    case 'xml':
      return 'xml';
    default:
      return 'plaintext';
  }
};

const normalizeDraft = (draft: Partial<LlmProviderUpsertRequest> | null | undefined): LlmProviderUpsertRequest => ({
  provider_key: String(draft?.provider_key || ''),
  display_name: String(draft?.display_name || ''),
  provider_type: String(draft?.provider_type || 'openai-compatible'),
  enabled: typeof draft?.enabled === 'boolean' ? draft.enabled : true,
  is_default: typeof draft?.is_default === 'boolean' ? draft.is_default : false,
  api_base: String(draft?.api_base || ''),
  model: String(draft?.model || ''),
  model_context_window: typeof draft?.model_context_window === 'number' && Number.isFinite(draft.model_context_window) ? Math.trunc(draft.model_context_window) : 128000,
  api_key: String(draft?.api_key || ''),
  organization: draft?.organization ? String(draft.organization) : '',
  api_version: draft?.api_version ? String(draft.api_version) : '',
  timeout_seconds: typeof draft?.timeout_seconds === 'number' && Number.isFinite(draft.timeout_seconds) ? draft.timeout_seconds : 60,
  max_tokens: typeof draft?.max_tokens === 'number' && Number.isFinite(draft.max_tokens) ? draft.max_tokens : null,
  temperature: typeof draft?.temperature === 'number' && Number.isFinite(draft.temperature) ? draft.temperature : null,
  env_bindings: normalizeEnvBindings(draft?.env_bindings as Record<string, any> | undefined),
  file_bindings: normalizeFileBindings(draft?.file_bindings),
  extra_config: draft?.extra_config && typeof draft.extra_config === 'object' && !Array.isArray(draft.extra_config) ? draft.extra_config : {},
  description: draft?.description ? String(draft.description) : '',
});

const stringifyDraft = (draft: LlmProviderUpsertRequest) => JSON.stringify({
  ...draft,
  env_bindings: normalizeEnvBindings(draft.env_bindings),
}, null, 2);

const createEmptyForm = (): LlmProviderUpsertRequest => ({
  provider_key: '',
  display_name: '',
  provider_type: 'openai-compatible',
  enabled: true,
  is_default: false,
  api_base: '',
  model: '',
  model_context_window: 128000,
  api_key: '',
  organization: '',
  api_version: '',
  timeout_seconds: 60,
  max_tokens: null,
  temperature: null,
  env_bindings: {},
  file_bindings: [],
  extra_config: {},
  description: '',
});

const providerTypeOptions = [
  'openai-compatible',
  'azure-openai',
  'anthropic',
  'deepseek',
  'qwen',
  'ollama',
  'moonshot',
  'custom',
];

const providerTypeRecommendedEnvKeys: Record<string, string[]> = {
  'openai-compatible': ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'],
  'azure-openai': ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'AZURE_OPENAI_DEPLOYMENT'],
  'anthropic': ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL'],
  'deepseek': ['DEEPSEEK_BASE_URL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'],
  'qwen': ['QWEN_BASE_URL', 'QWEN_API_KEY', 'QWEN_MODEL'],
  'ollama': ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'],
  'moonshot': ['MOONSHOT_BASE_URL', 'MOONSHOT_API_KEY', 'MOONSHOT_MODEL'],
  'custom': ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'],
};

const buildRecommendedEnvValues = (draft: LlmProviderUpsertRequest): Record<string, string> => {
  const providerType = String(draft.provider_type || '').trim();
  const apiBase = String(draft.api_base || '').trim();
  const apiKey = String(draft.api_key || '').trim();
  const model = String(draft.model || '').trim();
  const apiVersion = String(draft.api_version || '').trim();

  switch (providerType) {
    case 'openai-compatible':
      return { OPENAI_BASE_URL: apiBase, OPENAI_API_KEY: apiKey, OPENAI_MODEL: model };
    case 'azure-openai':
      return {
        AZURE_OPENAI_ENDPOINT: apiBase,
        AZURE_OPENAI_API_KEY: apiKey,
        AZURE_OPENAI_API_VERSION: apiVersion,
        AZURE_OPENAI_DEPLOYMENT: model,
      };
    case 'anthropic':
      return { ANTHROPIC_BASE_URL: apiBase, ANTHROPIC_AUTH_TOKEN: apiKey, ANTHROPIC_MODEL: model };
    case 'deepseek':
      return { DEEPSEEK_BASE_URL: apiBase, DEEPSEEK_API_KEY: apiKey, DEEPSEEK_MODEL: model };
    case 'qwen':
      return { QWEN_BASE_URL: apiBase, QWEN_API_KEY: apiKey, QWEN_MODEL: model };
    case 'ollama':
      return { OLLAMA_BASE_URL: apiBase, OLLAMA_MODEL: model };
    case 'moonshot':
      return { MOONSHOT_BASE_URL: apiBase, MOONSHOT_API_KEY: apiKey, MOONSHOT_MODEL: model };
    case 'custom':
      return { LLM_BASE_URL: apiBase, LLM_API_KEY: apiKey, LLM_MODEL: model };
    default:
      return {};
  }
};

export const ConfigCenterLlmPage: React.FC<ConfigCenterLlmPageProps> = ({ onOpenChat }) => {
  const platformApi = api.domains.platform;
  const [providers, setProviders] = useState<LlmProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [form, setForm] = useState<LlmProviderUpsertRequest>(createEmptyForm());
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showSecret, setShowSecret] = useState(false);
  const [isCreating, setIsCreating] = useState(true);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [jsonDraft, setJsonDraft] = useState<string>(stringifyDraft(createEmptyForm()));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmProviderTestResult | null>(null);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [showBulkEnvImport, setShowBulkEnvImport] = useState(false);
  const [bulkEnvInput, setBulkEnvInput] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [fileValidationErrors, setFileValidationErrors] = useState<Record<number, { name?: string; path?: string; content?: string }>>({});
  const [collapsedFileEditors, setCollapsedFileEditors] = useState<Record<number, boolean>>({});
  const testSuccessTimerRef = useRef<number | null>(null);

  const selectedSummary = useMemo(
    () => providers.find((item) => item.provider_key === selectedKey) || null,
    [providers, selectedKey]
  );

  const syncSystemEnvBindings = (draft: LlmProviderUpsertRequest) => ({
    ...draft,
    env_bindings: normalizeEnvBindings(draft.env_bindings),
  });

  const syncJsonDraft = (draft: LlmProviderUpsertRequest) => {
    setJsonDraft(stringifyDraft(draft));
  };

  const loadProviders = async (keepSelection = true): Promise<boolean> => {
    setError('');
    setRefreshing(true);
    try {
      const response = await platformApi.configCenter.listLlmProviders();
      const items = response.items || [];
      setProviders(items);
      const nextSelected = keepSelection ? selectedKey : '';
      if (items.length === 0) {
        setSelectedKey('');
        setIsCreating(true);
        const emptyForm = createEmptyForm();
        setForm(emptyForm);
        syncJsonDraft(emptyForm);
      } else if (nextSelected && items.some((item: LlmProviderSummary) => item.provider_key === nextSelected)) {
        await handleSelect(nextSelected);
      } else {
        await handleSelect((items.find((item: LlmProviderSummary) => item.is_default) || items[0]).provider_key);
      }
      return true;
    } catch (err: any) {
      setError(err.message || '加载 LLM 配置失败');
      return false;
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders(false);
  }, []);

  useEffect(() => {
    if (!refreshNotice) return;
    const timer = window.setTimeout(() => {
      setRefreshNotice('');
      setMessage((current) => (current === refreshNotice ? '' : current));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [refreshNotice]);

  useEffect(() => {
    return () => {
      if (testSuccessTimerRef.current) {
        window.clearTimeout(testSuccessTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if ((form.file_bindings || []).length === 0) {
      setActiveFileIndex(0);
      return;
    }
    if (activeFileIndex >= form.file_bindings.length) {
      setActiveFileIndex(form.file_bindings.length - 1);
    }
  }, [form.file_bindings, activeFileIndex]);

  const applyDetailToForm = (detail: LlmProviderDetail) => {
    const nextForm = normalizeDraft({
      provider_key: detail.provider_key,
      display_name: detail.display_name,
      provider_type: detail.provider_type,
      enabled: detail.enabled,
      is_default: detail.is_default,
      api_base: detail.api_base,
      model: detail.model,
      model_context_window: detail.model_context_window ?? 128000,
      api_key: detail.api_key,
      organization: detail.organization || '',
      api_version: detail.api_version || '',
      timeout_seconds: detail.timeout_seconds,
      max_tokens: detail.max_tokens ?? null,
      temperature: detail.temperature ?? null,
      env_bindings: normalizeEnvBindings(detail.env_bindings),
      file_bindings: normalizeFileBindings(detail.file_bindings),
      extra_config: detail.extra_config || {},
      description: detail.description || '',
    });
    setForm(nextForm);
    setFileValidationErrors({});
    setCollapsedFileEditors({});
    syncJsonDraft(nextForm);
  };

  const handleSelect = async (providerKey: string) => {
    setError('');
    setMessage('');
    setTestResult(null);
    try {
      const detail = await platformApi.configCenter.getLlmProvider(providerKey);
      setSelectedKey(providerKey);
      setIsCreating(false);
      applyDetailToForm(detail);
    } catch (err: any) {
      setError(err.message || '读取 Provider 详情失败');
    }
  };

  const handleCreateNew = () => {
    setSelectedKey('');
    setIsCreating(true);
    setShowSecret(true);
    setEditorMode('visual');
    setMessage('');
    setError('');
    setTestResult(null);
    setFileValidationErrors({});
    setCollapsedFileEditors({});
    const emptyForm = createEmptyForm();
    setForm(emptyForm);
    syncJsonDraft(emptyForm);
  };

  const buildUniqueProviderKey = (baseKey: string) => {
    const normalized = String(baseKey || '').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'provider-copy';
    const firstCandidate = normalized.endsWith('-copy') ? normalized :`${normalized}-copy`;
    const used = new Set(providers.map((item) => String(item.provider_key || '').trim().toLowerCase()));
    if (!used.has(firstCandidate)) return firstCandidate;
    for (let index = 2; index <= 9999; index += 1) {
      const candidate =`${firstCandidate}-${index}`;
      if (!used.has(candidate)) return candidate;
    }
    return`${firstCandidate}-${Date.now()}`;
  };

  const handleDuplicateProvider = () => {
    try {
      const sourceForm = editorMode === 'json' ? normalizeDraft(JSON.parse(jsonDraft || '{}')) : form;
      const sourceKey = String(sourceForm.provider_key || selectedKey || '').trim();
      const sourceName = String(sourceForm.display_name || '').trim();
      const nextForm = normalizeDraft({
        ...sourceForm,
        provider_key: buildUniqueProviderKey(sourceKey || 'provider'),
        display_name: sourceName ?`${sourceName} 副本` : 'LLM Provider 副本',
        is_default: false,
      });
      setSelectedKey('');
      setIsCreating(true);
      setEditorMode('visual');
      setTestResult(null);
      setError('');
      setShowSecret(true);
      setForm(nextForm);
      syncJsonDraft(nextForm);
      setMessage(`已基于 ${sourceKey || '当前配置'} 创建副本草稿，请修改后保存`);
    } catch (err: any) {
      setError(err.message || '复制配置失败，请先修正 JSON 格式');
    }
  };

  const handleRefresh = async () => {
    setMessage('');
    const ok = await loadProviders(true);
    if (!ok) return;
    const notice =`已从服务端刷新 LLM Provider 列表与当前详情（${new Date().toLocaleTimeString('zh-CN', { hour12: false })}）`;
    setRefreshNotice(notice);
    setMessage(notice);
  };

  const handleSwitchMode = (mode: 'visual' | 'json') => {
    if (mode === editorMode) return;
    if (mode === 'json') {
      syncJsonDraft(form);
      setEditorMode('json');
      return;
    }
    try {
      const parsed = normalizeDraft(JSON.parse(jsonDraft || '{}'));
      setForm(parsed);
      syncJsonDraft(parsed);
      setEditorMode('visual');
      setError('');
    } catch (err: any) {
      setError(err.message || 'JSON 解析失败，请先修正格式');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const sourceForm = editorMode === 'json' ? normalizeDraft(JSON.parse(jsonDraft || '{}')) : form;
      const validation = validateProviderForm(sourceForm);
      if (!validation.ok) {
        setFileValidationErrors(validation.fileErrors);
        setError(validation.message);
        return;
      }
      setFileValidationErrors({});
      const payload = syncSystemEnvBindings(sourceForm);
      setForm(payload);
      syncJsonDraft(payload);
      setTestResult(null);
      if (isCreating) {
        const created = await platformApi.configCenter.createLlmProvider(payload);
        setMessage(`已创建 LLM Provider: ${created.display_name}`);
        await loadProviders(false);
        await handleSelect(created.provider_key);
      } else {
        const updated = await platformApi.configCenter.updateLlmProvider(selectedKey || form.provider_key, payload);
        setMessage(`已更新 LLM Provider: ${updated.display_name}`);
        await loadProviders(false);
        await handleSelect(updated.provider_key);
      }
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError('');
    setMessage('');
    setTesting(true);
    try {
      const sourceForm = editorMode === 'json' ? normalizeDraft(JSON.parse(jsonDraft || '{}')) : form;
      const validation = validateProviderForm(sourceForm);
      if (!validation.ok) {
        setFileValidationErrors(validation.fileErrors);
        setError(validation.message);
        setTestResult(null);
        return;
      }
      setFileValidationErrors({});
      if (!String(sourceForm.model || '').trim()) {
        setError('测试前请填写模型');
        setTestResult(null);
        return;
      }
      const payload = syncSystemEnvBindings(sourceForm);
      setForm(payload);
      syncJsonDraft(payload);
      const result = await platformApi.configCenter.testLlmProvider(payload);
      setTestResult(result);
      if (result.ok) {
        const successMessage = '模型可用性测试成功';
        setMessage(successMessage);
        if (testSuccessTimerRef.current) {
          window.clearTimeout(testSuccessTimerRef.current);
        }
        testSuccessTimerRef.current = window.setTimeout(() => {
          setMessage((current) => (current === successMessage ? '' : current));
          testSuccessTimerRef.current = null;
        }, 2000);
      } else {
        setMessage('');
      }
      if (!result.ok && result.error_message) {
        setError(result.error_message);
      }
    } catch (err: any) {
      setTestResult(null);
      setError(err.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedKey) return;
    const confirmed = await showConfirm({
      title: '删除 LLM Provider',
      message:`确认删除 LLM Provider"${selectedKey}" 吗？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await platformApi.configCenter.deleteLlmProvider(selectedKey);
      setMessage(`已删除 LLM Provider: ${selectedKey}`);
      await loadProviders(false);
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!selectedKey || !selectedSummary) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (selectedSummary.enabled) {
        await platformApi.configCenter.disableLlmProvider(selectedKey);
        setMessage(`已禁用 LLM Provider: ${selectedKey}`);
      } else {
        await platformApi.configCenter.enableLlmProvider(selectedKey);
        setMessage(`已启用 LLM Provider: ${selectedKey}`);
      }
      await loadProviders(true);
    } catch (err: any) {
      setError(err.message || '切换启用状态失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedKey) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await platformApi.configCenter.setDefaultLlmProvider(selectedKey);
      setMessage(`已设置默认 LLM Provider: ${selectedKey}`);
      await loadProviders(true);
    } catch (err: any) {
      setError(err.message || '设置默认失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkEnvImport = () => {
    const lines = bulkEnvInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError('请先粘贴要导入的环境变量文本');
      return;
    }

    const imported: Record<string, string> = {};
    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        setError(`环境变量格式不正确: ${line}`);
        return;
      }
      const key = line.slice(0, separatorIndex).trim().toUpperCase();
      const value = line.slice(separatorIndex + 1);
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        setError(`环境变量名不合法: ${key}`);
        return;
      }
      imported[key] = value;
    }

    setForm({
      ...form,
      env_bindings: {
        ...form.env_bindings,
        ...imported,
      },
    });
    setMessage(`已批量导入 ${Object.keys(imported).length} 个环境变量`);
    setError('');
    setBulkEnvInput('');
    setShowBulkEnvImport(false);
  };

  const handleAddRecommendedEnvBindings = () => {
    const providerType = String(form.provider_type || '').trim();
    const recommendedKeys = providerTypeRecommendedEnvKeys[providerType] || [];
    if (recommendedKeys.length === 0) {
      setError(`当前渠道类型 ${providerType || 'unknown'} 暂无推荐环境变量`);
      return;
    }

    const nextBindings = { ...form.env_bindings };
    const recommendedValues = buildRecommendedEnvValues(form);
    let addedCount = 0;
    let filledCount = 0;
    for (const key of recommendedKeys) {
      const normalizedKey = String(key || '').trim().toUpperCase();
      if (!normalizedKey) continue;
      const recommendedValue = String(recommendedValues[normalizedKey] ?? '');
      if (!Object.prototype.hasOwnProperty.call(nextBindings, normalizedKey)) {
        nextBindings[normalizedKey] = recommendedValue;
        addedCount += 1;
        if (recommendedValue) filledCount += 1;
        continue;
      }
      const currentValue = String(nextBindings[normalizedKey] ?? '').trim();
      if (!currentValue && recommendedValue) {
        nextBindings[normalizedKey] = recommendedValue;
        filledCount += 1;
      }
    }

    if (addedCount === 0 && filledCount === 0) {
      setMessage(`推荐环境变量已存在（${providerType}）`);
      setError('');
      return;
    }

    setForm({
      ...form,
      env_bindings: nextBindings,
    });
    setMessage(`已为 ${providerType} 处理推荐变量：新增 ${addedCount} 个，自动填充值 ${filledCount} 个`);
    setError('');
  };

  const validateProviderForm = (draft: LlmProviderUpsertRequest): {
    ok: boolean;
    message: string;
    fileErrors: Record<number, { name?: string; path?: string; content?: string }>;
  } => {
    const missingTopLevel: string[] = [];
    if (!String(draft.provider_key || '').trim()) missingTopLevel.push('渠道标识');
    if (!String(draft.display_name || '').trim()) missingTopLevel.push('展示名称');
    if (!String(draft.provider_type || '').trim()) missingTopLevel.push('渠道类型');
    if (!String(draft.api_base || '').trim()) missingTopLevel.push('API Base');
    const modelContextWindow = Number(draft.model_context_window);
    if (!Number.isFinite(modelContextWindow) || modelContextWindow <= 0) missingTopLevel.push('模型上下文窗口大小');
    if (String(draft.provider_type || '').trim() !== 'ollama' && !String(draft.api_key || '').trim()) {
      missingTopLevel.push('API Key');
    }

    const fileErrors: Record<number, { name?: string; path?: string; content?: string }> = {};
    (draft.file_bindings || []).forEach((item, idx) => {
      const itemErrors: { name?: string; path?: string; content?: string } = {};
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        itemErrors.name = '配置结构异常';
      } else {
        if (!String(item.name || '').trim()) itemErrors.name = '请填写文件名';
        if (!String(item.path || '').trim()) itemErrors.path = '请填写文件路径';
        if (!String(item.content ?? '').trim()) itemErrors.content = '请填写文件内容';
      }
      if (Object.keys(itemErrors).length > 0) {
        fileErrors[idx] = itemErrors;
      }
    });

    const fileErrorSummaries = Object.entries(fileErrors).map(([index, entry]) => {
      const labels: string[] = [];
      if (entry.name) labels.push('文件名');
      if (entry.path) labels.push('文件路径');
      if (entry.content) labels.push('文件内容');
      return`第 ${Number(index) + 1} 个文件缺少: ${labels.join('、')}`;
    });

    const parts: string[] = [];
    if (missingTopLevel.length > 0) {
      parts.push(`请先填写必填项: ${missingTopLevel.join('、')}`);
    }
    if (fileErrorSummaries.length > 0) {
      parts.push(`文件绑定未填写完整: ${fileErrorSummaries.join('；')}`);
    }

    if (parts.length > 0) {
      return {
        ok: false,
        message: parts.join('。'),
        fileErrors,
      };
    }

    return { ok: true, message: '', fileErrors: {} };
  };

  const envEntries = Object.entries(form.env_bindings || {});
  const fileBindings = form.file_bindings || [];
  const activeFile = fileBindings[activeFileIndex] || null;
  const isActiveFileCollapsed = !!collapsedFileEditors[activeFileIndex];
  const incompleteFileMap = useMemo(() => {
    const map: Record<number, boolean> = {};
    fileBindings.forEach((item, index) => {
      const missingName = !String(item?.name || '').trim();
      const missingPath = !String(item?.path || '').trim();
      const missingContent = !String(item?.content ?? '').trim();
      map[index] = missingName || missingPath || missingContent;
    });
    return map;
  }, [fileBindings]);

  const addFileBinding = () => {
    const nextIndex = fileBindings.length + 1;
    setForm({
      ...form,
      file_bindings: [
        ...fileBindings,
        {
          name:`config-${nextIndex}.yaml`,
          path:`/etc/llm/config-${nextIndex}.yaml`,
          content: '',
          format: 'yaml',
          enabled: true,
        },
      ],
    });
    setCollapsedFileEditors((prev) => ({ ...prev, [fileBindings.length]: false }));
    setActiveFileIndex(fileBindings.length);
  };

  const removeFileBinding = (index: number) => {
    const next = fileBindings.filter((_, i) => i !== index);
    setForm({ ...form, file_bindings: next });
    setFileValidationErrors((prev) => {
      const nextErrors: Record<number, { name?: string; path?: string; content?: string }> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (Number.isNaN(currentIndex) || currentIndex === index) return;
        const targetIndex = currentIndex > index ? currentIndex - 1 : currentIndex;
        nextErrors[targetIndex] = value;
      });
      return nextErrors;
    });
    setCollapsedFileEditors((prev) => {
      const nextCollapsed: Record<number, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (Number.isNaN(currentIndex) || currentIndex === index) return;
        const targetIndex = currentIndex > index ? currentIndex - 1 : currentIndex;
        nextCollapsed[targetIndex] = value;
      });
      return nextCollapsed;
    });
    if (next.length === 0) {
      setActiveFileIndex(0);
      return;
    }
    if (activeFileIndex >= next.length) {
      setActiveFileIndex(next.length - 1);
    }
  };

  const updateFileBinding = (index: number, patch: Partial<LlmProviderFileBinding>) => {
    const next = fileBindings.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setForm({ ...form, file_bindings: next });
    setFileValidationErrors((prev) => {
      if (!prev[index]) return prev;
      const nextErrors = { ...prev };
      const entry = { ...(nextErrors[index] || {}) };
      if (Object.prototype.hasOwnProperty.call(patch, 'name') && String(patch.name || '').trim()) delete entry.name;
      if (Object.prototype.hasOwnProperty.call(patch, 'path') && String(patch.path || '').trim()) delete entry.path;
      if (Object.prototype.hasOwnProperty.call(patch, 'content') && String(patch.content ?? '').trim()) delete entry.content;
      if (Object.keys(entry).length === 0) {
        delete nextErrors[index];
      } else {
        nextErrors[index] = entry;
      }
      return nextErrors;
    });
  };

  const handleCollapseFileEditor = (index: number) => {
    setCollapsedFileEditors((prev) => ({ ...prev, [index]: true }));
    setMessage(`文件 ${index + 1} 已本地保存并收起编辑框（未请求服务器）`);
    setError('');
  };

  const handleExpandFileEditor = (index: number) => {
    setCollapsedFileEditors((prev) => ({ ...prev, [index]: false }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Bot className="w-8 h-8 text-blue-600" />
            LLM 对接配置
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            在配置中心统一维护全局 LLM 渠道，让其他微服务可以按需拉取当前可用的模型配置。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleRefresh()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600"
          >
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
          <button
            onClick={handleCreateNew}
 className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
          >
            <Plus size={16} />
            新建 Provider
          </button>
          <button
            onClick={onOpenChat}
 className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600"
          >
            <MessageSquare size={16} />
            在线聊天
          </button>
          <button
            onClick={() => setShowUsageGuide(true)}
 className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600"
          >
            <BookOpenText size={16} />
            使用指引
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-[2rem] border px-5 py-4 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {error || message}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[360px,minmax(0,1fr)] gap-6">
 <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">已配置渠道</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{providers.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
            ) : providers.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                <p className="text-sm font-black text-slate-600">当前还没有任何 LLM Provider</p>
                <p className="mt-2 text-xs text-slate-400">建议先新增一个默认渠道，例如 OpenAI Compatible 或 Azure OpenAI。</p>
              </div>
            ) : providers.map((item) => (
              <button
                key={item.provider_key}
                onClick={() => void handleSelect(item.provider_key)}
 className={`w-full rounded-[2rem] border p-4 text-left transition-all ${selectedKey === item.provider_key && !isCreating ? 'border-blue-500 bg-blue-50 shadow-blue-100/60' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{item.display_name}</span>
                      {item.is_default && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700">默认</span>}
                    </div>
                    <p className="mt-1 text-xs font-mono text-slate-500">{item.provider_key}</p>
                  </div>
                  <div className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${item.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.enabled ? 'enabled' : 'disabled'}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{item.provider_type}</span>
                  <span>{item.model}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

 <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">编辑区</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">
                {isCreating ? '新建 LLM Provider' : (form.display_name || form.provider_key || 'LLM Provider')}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('visual')}
 className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black ${editorMode === 'visual' ? 'bg-slate-50 text-slate-900 ' : 'text-slate-500'}`}
                >
                  <LayoutPanelTop size={14} />
                  可视化编辑
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('json')}
 className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black ${editorMode === 'json' ? 'bg-slate-50 text-slate-900 ' : 'text-slate-500'}`}
                >
                  <Braces size={14} />
                  JSON 编辑
                </button>
              </div>
              {!isCreating && (
                <>
                  <button
                    onClick={handleDuplicateProvider}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600"
                  >
                    <Copy size={14} />
                    复制配置
                  </button>
                  <button
                    onClick={() => void handleToggleEnabled()}
                    disabled={saving}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600"
                  >
                    {selectedSummary?.enabled ? '禁用渠道' : '启用渠道'}
                  </button>
                  <button
                    onClick={() => void handleSetDefault()}
                    disabled={saving || !!selectedSummary?.is_default}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 disabled:opacity-50"
                  >
                    设为默认
                  </button>
                  <button
                    onClick={() => void handleDelete()}
                    disabled={saving}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-600"
                  >
                    删除
                  </button>
                </>
              )}
              <button
                onClick={() => void handleTest()}
                disabled={saving || testing}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 disabled:opacity-50"
              >
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                测试可用性
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
 className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存配置
              </button>
            </div>
          </div>

          {editorMode === 'json' ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-black text-slate-900">JSON 配置</h3>
                <p className="mt-1 text-xs text-slate-500">这里展示并编辑当前 Provider 的完整配置对象。切回可视化编辑时会自动解析并同步字段。</p>
              </div>
              <textarea
                value={jsonDraft}
                onChange={(event) => setJsonDraft(event.target.value)}
                rows={28}
                spellCheck={false}
                className="w-full rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4 font-mono text-sm leading-6 text-slate-900 outline-none focus:border-blue-500"
              />
            </div>
          ) : (
          <>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">渠道标识</label>
              <input value={form.provider_key} onChange={(event) => setForm({ ...form, provider_key: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="openai-prod" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">展示名称</label>
              <input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="OpenAI Production" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">渠道类型</label>
              <select value={form.provider_type} onChange={(event) => setForm({ ...form, provider_type: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500">
                {providerTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">模型</label>
              <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="gpt-4.1-mini" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">模型上下文窗口大小（十进制）</label>
              <input
                type="number"
                min={1}
                required
                value={form.model_context_window}
                onChange={(event) => setForm({ ...form, model_context_window: Math.max(0, Math.trunc(Number(event.target.value || 0))) })}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500"
                placeholder="128000"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Base</label>
              <input value={form.api_base} onChange={(event) => setForm({ ...form, api_base: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="https://api.openai.com/v1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Key</label>
              <div className="mt-2 flex gap-3">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(event) => setForm({ ...form, api_key: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  placeholder="sk-..."
                />
                <button type="button" onClick={() => setShowSecret((current) => !current)} className="rounded-2xl border border-slate-200 px-4 text-slate-500">
                  {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Organization</label>
              <input value={form.organization || ''} onChange={(event) => setForm({ ...form, organization: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="可选" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Version</label>
              <input value={form.api_version || ''} onChange={(event) => setForm({ ...form, api_version: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="可选" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">超时秒数</label>
              <input type="number" value={form.timeout_seconds} onChange={(event) => setForm({ ...form, timeout_seconds: Number(event.target.value) || 60 })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Tokens</label>
              <input type="number" value={form.max_tokens ?? ''} onChange={(event) => setForm({ ...form, max_tokens: event.target.value ? Number(event.target.value) : null })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="可选" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Temperature</label>
              <input type="number" step="0.1" min="0" max="2" value={form.temperature ?? ''} onChange={(event) => setForm({ ...form, temperature: event.target.value ? Number(event.target.value) : null })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="可选" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">描述</label>
              <textarea value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="说明该渠道的用途、区域或限流策略" />
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-500" />
                  环境变量绑定
                </h3>
                <p className="mt-1 text-xs text-slate-500">可按当前渠道类型一键补充推荐环境变量键，默认留空且不会覆盖你已填写的同名变量。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddRecommendedEnvBindings}
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700"
                >
                  添加推荐变量
                </button>
                <button
                  type="button"
                  onClick={() => setForm({
                    ...form,
                    env_bindings: {
                      ...form.env_bindings,
                      [`CUSTOM_ENV_${envEntries.length + 1}`]: '',
                    },
                  })}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600"
                >
                  添加变量
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkEnvImport((current) => !current)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600"
                >
                  {showBulkEnvImport ? '收起批量导入' : '批量导入'}
                </button>
              </div>
            </div>

            {showBulkEnvImport && (
              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">批量导入</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  支持按行粘贴`KEY=value` 文本，导入时会覆盖同名变量。示例：
                  <span className="mt-2 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-[11px] leading-5 text-slate-900">
                    {`ANTHROPIC_AUTH_TOKEN=sk-12345678
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
NO_PROXY=127.0.0.1
DISABLE_TELEMETRY=true
DISABLE_COST_WARNINGS=true
API_TIMEOUT_MS=600000`}
                  </span>
                </p>
                <textarea
                  value={bulkEnvInput}
                  onChange={(event) => setBulkEnvInput(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder="在这里粘贴多行 KEY=value 文本"
                  className="mt-4 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm leading-6 outline-none focus:border-blue-500"
                />
                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkEnvInput('');
                      setShowBulkEnvImport(false);
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkEnvImport}
 className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white"
                  >
                    导入环境变量
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {envEntries.length === 0 && (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-500">
                  当前没有环境变量绑定。环境变量绑定是可选项，可按需手动添加。
                </div>
              )}
              {envEntries.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[220px,1fr,44px] gap-3">
                  <input
                    value={key}
                    onChange={(event) => {
                      const nextEntries = Object.entries(form.env_bindings).map(([entryKey, entryValue]) => (
                        entryKey === key ? [event.target.value.toUpperCase(), entryValue] : [entryKey, entryValue]
                      ));
                      setForm({ ...form, env_bindings: Object.fromEntries(nextEntries) });
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  />
                  <input
                    value={String(value ?? '')}
                    onChange={(event) => setForm({ ...form, env_bindings: { ...form.env_bindings, [key]: event.target.value } })}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...form.env_bindings };
                      delete next[key];
                      setForm({ ...form, env_bindings: next });
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={16} className="mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <FileCode2 size={16} className="text-blue-500" />
                  配置文件注入
                </h3>
                <p className="mt-1 text-xs text-slate-500">支持配置多个文本文件（JSON/YAML/TOML/ENV 等），由服务方自行决定如何消费这些文件内容。</p>
              </div>
              <button
                type="button"
                onClick={addFileBinding}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600"
              >
                新增文件
              </button>
            </div>

            {fileBindings.length === 0 ? (
              <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-500">
                当前没有配置文件注入项。可按需新增多个文件并在线编辑内容。
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {fileBindings.map((binding, index) => (
                    <button
                      key={`${binding.path}-${index}`}
                      type="button"
                      onClick={() => setActiveFileIndex(index)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${activeFileIndex === index ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {binding.name ||`file-${index + 1}`}
                        {incompleteFileMap[index] && (
                          <span
                            className="h-2 w-2 rounded-full bg-red-500"
                            title="该文件还有未填写项"
                          />
                        )}
                      </span>
                      {!binding.enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">disabled</span>}
                    </button>
                  ))}
                </div>

                {activeFile && (
                  <>
                    {fileValidationErrors[activeFileIndex] && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                        当前文件存在未填写项，请先补全红框字段后再保存。
                      </div>
                    )}
                    {isActiveFileCollapsed ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-slate-600">
                            已收起编辑框：<span className="font-mono text-slate-800">{activeFile.name ||`file-${activeFileIndex + 1}`}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleExpandFileEditor(activeFileIndex)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
                          >
                            展开继续编辑
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">该“保存”仅用于本地收起，不会请求服务器。不点击也可以直接提交。</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">文件名</label>
                            <input
                              value={activeFile.name}
                              onChange={(event) => updateFileBinding(activeFileIndex, { name: event.target.value })}
                              className={`mt-2 w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 ${fileValidationErrors[activeFileIndex]?.name ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                              placeholder="provider-config.yaml"
                            />
                            {fileValidationErrors[activeFileIndex]?.name && (
                              <p className="mt-1 text-[11px] font-bold text-red-600">{fileValidationErrors[activeFileIndex]?.name}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">文件路径</label>
                            <input
                              value={activeFile.path}
                              onChange={(event) => updateFileBinding(activeFileIndex, { path: event.target.value })}
                              className={`mt-2 w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 ${fileValidationErrors[activeFileIndex]?.path ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                              placeholder="/etc/llm/provider-config.yaml"
                            />
                            {fileValidationErrors[activeFileIndex]?.path && (
                              <p className="mt-1 text-[11px] font-bold text-red-600">{fileValidationErrors[activeFileIndex]?.path}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">格式</label>
                            <select
                              value={activeFile.format}
                              onChange={(event) => updateFileBinding(activeFileIndex, { format: event.target.value as LlmProviderFileBinding['format'] })}
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500"
                            >
                              {fileFormatOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </div>
                          <div className="flex items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                              <input
                                type="checkbox"
                                checked={activeFile.enabled}
                                onChange={(event) => updateFileBinding(activeFileIndex, { enabled: event.target.checked })}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              启用该文件
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleCollapseFileEditor(activeFileIndex)}
                                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                              >
                                保存并收起
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFileBinding(activeFileIndex)}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600"
                              >
                                <Trash2 size={14} />
                                删除
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                          <MonacoEditor
                            height="360px"
                            language={toMonacoLanguage(activeFile.format)}
                            value={activeFile.content}
                            onChange={(value) => updateFileBinding(activeFileIndex, { content: value ?? '' })}
                            theme="vs-dark"
                            options={{
                              minimap: { enabled: true },
                              fontSize: 13,
                              wordWrap: 'on',
                              automaticLayout: true,
                              scrollBeyondLastLine: false,
                              tabSize: 2,
                            }}
                          />
                        </div>
                        {fileValidationErrors[activeFileIndex]?.content && (
                          <p className="text-[11px] font-bold text-red-600">{fileValidationErrors[activeFileIndex]?.content}</p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                <CheckCircle2 size={14} className="text-green-500" />
                可选绑定
              </div>
              <p className="mt-3 text-xs text-slate-600">支持按渠道类型一键补充推荐键，也支持按需手动增删和批量导入。</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                <ShieldAlert size={14} className="text-amber-500" />
                返回策略
              </div>
              <p className="mt-3 text-xs text-slate-600">配置中心不做脱敏处理，请求成功时按原样返回保存过的配置内容。</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                <Bot size={14} className="text-blue-500" />
                服务消费
              </div>
              <p className="mt-3 text-xs text-slate-600">其他微服务通过机机 Token 调用`/api/configcenter/service/llm/providers` 获取配置。</p>
            </div>
          </div>
          </>
          )}
          {testResult && (
            <div className={`mt-8 rounded-[2rem] border p-6 ${testResult.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">测试结果</p>
                  <h3 className={`mt-2 text-xl font-black ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {testResult.ok ? '模型可用' : '模型不可用'}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600">{testResult.provider_type}</span>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600">{testResult.latency_ms} ms</span>
                  {testResult.status_code !== null && testResult.status_code !== undefined && (
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600">HTTP {testResult.status_code}</span>
                  )}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
 <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">请求目标</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-700">{testResult.request_target}</p>
                </div>
 <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {testResult.ok ? '响应片段' : '错误摘要'}
                  </p>
                  <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${testResult.ok ? 'text-slate-700' : 'text-red-700'}`}>
                    {testResult.ok
                      ? (testResult.response_preview || '测试成功，但上游返回内容为空。')
                      : (testResult.error_message || '测试失败，未返回更多错误信息。')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showUsageGuide && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-6" onClick={() => setShowUsageGuide(false)}>
          <div className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-800 shadow-panel" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-8 py-7">
              <div>
                <div className="inline-flex rounded-full border border-blue-500/30 bg-blue-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-400">
                  Guide
                </div>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-200">如何获取和使用 LLM 对接配置</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  这个弹窗面向需要消费配置中心的开发者、运维或其它微服务维护者，用来快速说明如何读取系统当前支持的 LLM Provider，以及如何拿到某个 Provider 的完整配置。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUsageGuide(false)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-400 transition-all hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-6 overflow-y-auto px-8 py-7">
              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">1. 管理员在前端维护 Provider</h4>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  在本页面可以新增、编辑、启停、设为默认、测试可用性，并通过“在线聊天”验证模型的真实响应效果。这里保存的是平台级全局配置，适合被多个微服务统一消费。
                </p>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">2. 其它微服务如何读取已启用的配置</h4>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  业务服务应使用机机 Token 调用配置中心服务接口，而不是调用管理员接口。推荐先读取“已启用 Provider 列表”，再按需要读取某个 Provider 的详细配置。
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">列表接口</p>
                    <code className="mt-3 block whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`GET /api/configcenter/service/llm/providers`}
                    </code>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">详情接口</p>
                    <code className="mt-3 block whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`GET /api/configcenter/service/llm/providers/{provider_key}`}
                    </code>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">3. 推荐的消费顺序</h4>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                  <p>先调用列表接口，确认当前有哪些启用中的 Provider，以及哪一个是默认 Provider。</p>
                  <p>如果你的服务只需要使用默认渠道，就读取`default_provider_key` 对应的详情。</p>
                  <p>如果你的服务支持多模型切换，可以缓存列表结果，让调用方按`provider_key` 选择具体模型渠道。</p>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">4. 典型返回内容里有哪些关键字段</h4>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p><span className="font-black text-slate-900">api_base</span>：上游 LLM API 地址</p>
                    <p className="mt-2"><span className="font-black text-slate-900">model</span>：默认模型名，可为空</p>
                    <p className="mt-2"><span className="font-black text-slate-900">api_key</span>：受控返回的访问密钥</p>
                    <p className="mt-2"><span className="font-black text-slate-900">provider_type</span>：渠道协议类型</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p><span className="font-black text-slate-900">timeout_seconds</span>：请求超时建议</p>
                    <p className="mt-2"><span className="font-black text-slate-900">max_tokens / temperature</span>：默认推理参数</p>
                    <p className="mt-2"><span className="font-black text-slate-900">env_bindings</span>：可选环境变量映射</p>
                    <p className="mt-2"><span className="font-black text-slate-900">extra_config</span>：扩展字段</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">5. curl 示例</h4>
                <code className="mt-4 block whitespace-pre-wrap break-all rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-6 text-slate-900">
{`curl -H"Authorization: Bearer <machine-token>" \\
  https://chimera.ai.icsl.huawei.com/api/configcenter/service/llm/providers

curl -H"Authorization: Bearer <machine-token>" \\
  https://chimera.ai.icsl.huawei.com/api/configcenter/service/llm/providers/openai-prod`}
                </code>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">6. 列表接口实际响应 Example</h4>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  下面这个 example 来自当前环境中的真实列表响应，返回了当前已启用的两个 Provider：默认的
                  <span className="mx-1 rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">local_litellm</span>
                  和
                  <span className="mx-1 rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">local_ccr</span>
                  。
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">请求</p>
                    <code className="mt-3 block whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`GET /api/configcenter/service/llm/providers
Authorization: Bearer <machine-token>`}
                    </code>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">响应</p>
                    <code className="mt-3 block max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`{"total": 2,"default_provider_key":"local_litellm","items": [
    {"provider_key":"local_litellm","display_name":"LOCAL_LITELLM","provider_type":"openai-compatible","enabled": true,"is_default": true,"api_base":"http://172.31.29.10","model":"MiniMax/MiniMax-M2.5","api_key":"sk-12345678","organization": null,"api_version": null,"timeout_seconds": 60,"max_tokens": null,"temperature": null,"env_bindings": {},"extra_config": {},"description": null
    },
    {"provider_key":"local_ccr","display_name":"LOCAL_CCR","provider_type":"anthropic","enabled": true,"is_default": false,"api_base":"http://172.31.29.10:3456/v1","model":"claude-sonnet-4-6","api_key":"sk-12345678","organization": null,"api_version": null,"timeout_seconds": 60,"max_tokens": null,"temperature": null,"env_bindings": {"NO_PROXY":"172.31.29.10","API_TIMEOUT_MS":"600000","DISABLE_TELEMETRY":"true","ANTHROPIC_BASE_URL":"http://172.31.29.10:3456","ANTHROPIC_AUTH_TOKEN":"sk-12345678","DISABLE_COST_WARNINGS":"true"
      },"extra_config": {},"description": null
    }
  ]
}`}
                    </code>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-sm font-black text-slate-900">7. LOCAL_CCR 实际响应 Example</h4>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  下面这个 example 来自当前环境中的真实 Provider：
                  <span className="mx-1 rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">display_name=LOCAL_CCR</span>
                  ，对应的
                  <span className="mx-1 rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">provider_key=local_ccr</span>
                  。
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">请求</p>
                    <code className="mt-3 block whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`GET /api/configcenter/service/llm/providers/local_ccr
Authorization: Bearer <machine-token>`}
                    </code>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">响应</p>
                    <code className="mt-3 block max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-900">
{`{"provider_key":"local_ccr","display_name":"LOCAL_CCR","provider_type":"anthropic","enabled": true,"is_default": false,"api_base":"http://172.31.29.10:3456/v1","model":"claude-sonnet-4-6","api_key":"sk-12345678","organization": null,"api_version": null,"timeout_seconds": 60,"max_tokens": null,"temperature": null,"env_bindings": {"NO_PROXY":"172.31.29.10","API_TIMEOUT_MS":"600000","DISABLE_TELEMETRY":"true","ANTHROPIC_BASE_URL":"http://172.31.29.10:3456","ANTHROPIC_AUTH_TOKEN":"sk-12345678","DISABLE_COST_WARNINGS":"true"
  },"extra_config": {},"description": null,"created_at":"2026-03-29T15:04:16","updated_at":"2026-03-29T23:12:12"
}`}
                    </code>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5">
                <h4 className="text-sm font-black text-amber-800">8. 使用建议</h4>
                <div className="mt-3 space-y-3 text-sm leading-7 text-amber-900">
                  <p>不要把管理员接口暴露给业务服务，业务服务只应走`/service/llm/providers`。</p>
                  <p>如果服务要长期使用配置，建议本地做短期缓存，并在失败时重新拉取配置。</p>
                  <p>如果需要验证某个 Provider 是否可用，可以在本页面先使用“测试可用性”或“在线聊天”。</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
