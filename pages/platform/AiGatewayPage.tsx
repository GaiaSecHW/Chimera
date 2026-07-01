import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Eye, FileText, KeyRound, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { AigwLogDetailsDialog } from '../../components/platform/AigwLogDetailsDialog';
import { useUiFeedback } from '../../components/UiFeedback';
import { DataTable, DataTableColumn, Modal, PageHeader } from '../../design-system';
import { AiGatewayTokenStatsPage } from './AiGatewayTokenStatsPage';
import {
  AiGatewayBackendUnit,
  AiGatewayCapacityPool,
  AiGatewayConnectionTestResult,
  AiGatewayLlmKey,
  AiGatewayLlmKeyCreateResponse,
  AiGatewayLogDetail,
  AiGatewayLogListResponse,
  AiGatewayLogSummary,
  AiGatewayModelAlias,
  AiGatewayModelAliasBinding,
  AiGatewayProviderStat,
  AiGatewayReplayResponse,
} from '../../types/types';

type AiGatewayBackendUnitWithPool = AiGatewayBackendUnit & {
  capacity_pool_id?: number | null;
  unit_code?: string | null;
  provider_type?: string | null;
};
type AiGatewayBackendUnitForm = Omit<AiGatewayBackendUnitWithPool, 'id'> & {
  capacity_pool_id: number;
};
type AiGatewayLlmKeyForm = {
  key_name: string;
  key_type: 'task' | 'work' | 'app';
  app_id: string;
  app_name: string;
  parent_key_id?: number | null;
  max_concurrency: number;
  task_id: string;
  sub_task_id: string;
  enabled: boolean;
  expires_at?: string | null;
  description: string;
  capacity_pool_ids: number[];
};
type LogDrawerPreset = {
  title: string;
  model?: string;
  aliasId?: string;
  backendUnitId?: string;
  llmKeyId?: string;
  taskKeyId?: string;
  appId?: string;
  capacityPoolId?: string;
  taskId?: string;
  subTaskId?: string;
};

interface AiGatewayPageProps {
  entryView?: string;
  onNavigate?: (view: string) => void;
}

const emptyAlias = (): Omit<AiGatewayModelAlias, 'id'> => ({
  alias_name: '',
  max_tokens_default: 8192,
  temperature_default: 0.7,
  enabled: true,
});

const emptyBackendUnit = (): AiGatewayBackendUnitForm => ({
  capacity_pool_id: 0,
  unit_code: '',
  provider_type: '',
  api_base_url: '',
  model_name: '',
  api_key_ciphertext: '',
  api_key_fingerprint: '',
  total_max_concurrency: 0,
  priority_default: 0,
  supports_chat_completions: true,
  supports_responses: true,
  supports_messages: true,
  enabled: true,
  description: '',
});

const emptyBinding = (): Omit<AiGatewayModelAliasBinding, 'id'> => ({
  model_alias_id: 0,
  backend_unit_id: 0,
  priority: 0,
  weight: 100,
  enabled: true,
});

const emptyLlmKeyForm = (): AiGatewayLlmKeyForm => ({
  key_name: '',
  key_type: 'task',
  app_id: '',
  app_name: '',
  parent_key_id: null,
  max_concurrency: 0,
  task_id: '',
  sub_task_id: '',
  enabled: true,
  expires_at: null,
  description: '',
  capacity_pool_ids: [],
});

const emptyCapacityPool = (): Omit<AiGatewayCapacityPool, 'id'> => ({
  pool_name: '',
  enabled: true,
  description: '',
  created_at: '',
  updated_at: '',
});

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';
const formatDateTimeInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const getLlmKeyTypeLabel = (keyType?: string) => keyType === 'task' ? '任务密钥' : keyType === 'work' ? '工作密钥' : keyType === 'app' ? '应用密钥' : (keyType || '-');
const getLlmKeyScopeLabel = (item: Pick<AiGatewayLlmKey, 'key_type' | 'app_id' | 'app_name' | 'task_id' | 'sub_task_id'>) => {
  if (item.key_type === 'app') {
    if (item.app_name && item.app_id) return `${item.app_name} / ${item.app_id}`;
    return item.app_id || item.app_name || '-';
  }
  if (!item.task_id) return '-';
  if (item.key_type === 'work' && item.sub_task_id) return `${item.task_id} / ${item.sub_task_id}`;
  return item.task_id;
};
const formatJsonBlock = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const formatLatencyMs = (ms?: number) => {
  const value = Number(ms || 0);
  if (!value) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
};
const formatScore = (score?: number) => {
  const value = Number(score || 0);
  if (!value) return '-';
  return value >= 1000 ? value.toFixed(0) : value.toFixed(1);
};
const formatPercent = (rate?: number, hasData = true) => {
  if (!hasData) return '-';
  const value = Number(rate || 0);
  return `${(value * 100).toFixed(1)}%`;
};
const formatCount = (n?: number) => {
  const value = Number(n || 0);
  if (!value) return '-';
  return value.toLocaleString('en-US');
};

const BindingMetricCell: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}> = ({ label, value, hint, tone = 'default' }) => {
  const toneClass = tone === 'good' ? 'text-emerald-400'
    : tone === 'warn' ? 'text-amber-400'
    : tone === 'bad' ? 'text-rose-400'
    : 'text-theme-text-primary';
  return (
    <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-2" title={hint || label}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
};

export const AiGatewayPage: React.FC<AiGatewayPageProps> = ({ entryView = 'aigw-config', onNavigate }) => {
  const platformApi = api.domains.platform;
  const { notify, feedbackNodes } = useUiFeedback();
  const loadDataRequestIdRef = useRef(0);
  const loadLogsRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [providerStats, setProviderStats] = useState<AiGatewayProviderStat[]>([]);
  const [modelAliases, setModelAliases] = useState<AiGatewayModelAlias[]>([]);
  const [backendUnits, setBackendUnits] = useState<AiGatewayBackendUnitWithPool[]>([]);
  const [bindings, setBindings] = useState<AiGatewayModelAliasBinding[]>([]);
  const [capacityPools, setCapacityPools] = useState<AiGatewayCapacityPool[]>([]);
  const [llmKeys, setLlmKeys] = useState<AiGatewayLlmKey[]>([]);
  const [llmKeysTotal, setLlmKeysTotal] = useState(0);
  const [llmKeysLoading, setLlmKeysLoading] = useState(false);
  const [keySearch, setKeySearch] = useState('');
  const [keyKeyType, setKeyKeyType] = useState('');
  const [keyEnabled, setKeyEnabled] = useState('');
  const [keyPage, setKeyPage] = useState(1);
  const [keyPageSize, setKeyPageSize] = useState(20);
  const [editingLlmKeyId, setEditingLlmKeyId] = useState<number | null>(null);
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [editingBackendUnitId, setEditingBackendUnitId] = useState<number | null>(null);
  const [pendingBackendPoolId, setPendingBackendPoolId] = useState<number | null>(null);
  const [editingBindingId, setEditingBindingId] = useState<number | null>(null);
  const [aliasForm, setAliasForm] = useState<Omit<AiGatewayModelAlias, 'id'>>(emptyAlias());
  const [backendUnitForm, setBackendUnitForm] = useState<AiGatewayBackendUnitForm>(emptyBackendUnit());
  const [bindingForm, setBindingForm] = useState<Omit<AiGatewayModelAliasBinding, 'id'>>(emptyBinding());
  const [capacityPoolForm, setCapacityPoolForm] = useState<Omit<AiGatewayCapacityPool, 'id'>>(emptyCapacityPool());
  const [llmKeyForm, setLlmKeyForm] = useState<AiGatewayLlmKeyForm>(emptyLlmKeyForm());
  const [testingBackendId, setTestingBackendId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<AiGatewayConnectionTestResult | null>(null);
  const [logs, setLogs] = useState<AiGatewayLogSummary[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(20);
  const [logModel, setLogModel] = useState('');
  const [logBackendModel, setLogBackendModel] = useState('');
  const [logAliasId, setLogAliasId] = useState('');
  const [logBackendUnitId, setLogBackendUnitId] = useState('');
  const [logLlmKeyId, setLogLlmKeyId] = useState('');
  const [logTaskKeyId, setLogTaskKeyId] = useState('');
  const [logAppId, setLogAppId] = useState('');
  const [logCapacityPoolId, setLogCapacityPoolId] = useState('');
  const [logTaskId, setLogTaskId] = useState('');
  const [logSubTaskId, setLogSubTaskId] = useState('');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const [logAutoRefresh, setLogAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AiGatewayLogDetail | null>(null);
  const [replayResult, setReplayResult] = useState<AiGatewayReplayResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayingLogId, setReplayingLogId] = useState<number | null>(null);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [backendModalOpen, setBackendModalOpen] = useState(false);
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logDrawerPreset, setLogDrawerPreset] = useState<LogDrawerPreset | null>(null);
  const [selectedAliasId, setSelectedAliasId] = useState<number | null>(null);
  const [draggingBackendUnitId, setDraggingBackendUnitId] = useState<number | null>(null);
  const [editingWorkspaceBindingId, setEditingWorkspaceBindingId] = useState<number | null>(null);
  const [capacityPoolModalOpen, setCapacityPoolModalOpen] = useState(false);
  const [editingCapacityPoolId, setEditingCapacityPoolId] = useState<number | null>(null);
  const [keyManagementOpen, setKeyManagementOpen] = useState(false);
  const [llmKeyModalOpen, setLlmKeyModalOpen] = useState(false);
  const [llmKeyResultOpen, setLlmKeyResultOpen] = useState(false);
  const [createdLlmKeySecret, setCreatedLlmKeySecret] = useState('');
  const [createdLlmKeyMeta, setCreatedLlmKeyMeta] = useState<AiGatewayLlmKey | null>(null);
  const [selectedLlmKey, setSelectedLlmKey] = useState<AiGatewayLlmKey | null>(null);
  const [llmKeyDetailOpen, setLlmKeyDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [keyFiltersExpanded, setKeyFiltersExpanded] = useState(false);
  const [logFiltersExpanded, setLogFiltersExpanded] = useState(false);

  const aliasNameById = useMemo(() => new Map(modelAliases.map((item) => [item.id, item.alias_name])), [modelAliases]);
  const backendNameById = useMemo(() => new Map(backendUnits.map((item) => [item.id,`${item.model_name} (#${item.id})`])), [backendUnits]);
  const providerStatByBackendId = useMemo(() => new Map(providerStats.map((item) => [Number(item.backend_unit_id || item.backend_config_id || 0), item])), [providerStats]);
  const taskKeys = useMemo(() => llmKeys.filter((item) => item.key_type === 'task'), [llmKeys]);
  const backendModels = useMemo(() => Array.from(new Set(backendUnits.map((item) => item.model_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [backendUnits]);
  const aliasOptions = useMemo(() => modelAliases.map((item) => ({ value: String(item.id), label:`${item.alias_name} (#${item.id})` })), [modelAliases]);
  const backendUnitOptions = useMemo(() => backendUnits.map((item) => ({ value: String(item.id), label:`${item.model_name} (#${item.id})` })), [backendUnits]);
  const aliasGroups = useMemo(() => modelAliases.map((alias) => {
    const groupBindings = bindings.filter((binding) => binding.model_alias_id === alias.id);
    const groupBackendUnits = groupBindings
      .map((binding) => backendUnits.find((unit) => unit.id === binding.backend_unit_id))
      .filter((item): item is AiGatewayBackendUnitWithPool => Boolean(item));
    const groupStats = groupBackendUnits
      .map((unit) => providerStatByBackendId.get(unit.id))
      .filter((item): item is AiGatewayProviderStat => Boolean(item));
    return {
      alias,
      bindings: groupBindings,
      backendUnits: groupBackendUnits,
      totalActiveRequests: groupStats.reduce((sum, stat) => sum + Number(stat.active_requests || 0), 0),
      totalWaitingRequests: groupStats.reduce((sum, stat) => sum + Number(stat.waiting_requests || 0), 0),
      avgSuccessRate: groupStats.length ? groupStats.reduce((sum, stat) => sum + Number(stat.success_rate || 0), 0) / groupStats.length : 0,
    };
  }), [backendUnits, bindings, modelAliases, providerStatByBackendId]);
  const poolUnitsByPoolId = useMemo(() => {
    const map = new Map<number, AiGatewayBackendUnitWithPool[]>();
    capacityPools.forEach((pool) => {
      map.set(pool.id, backendUnits.filter((unit) => unit.capacity_pool_id === pool.id));
    });
    return map;
  }, [backendUnits, capacityPools]);
  const selectedAlias = useMemo(() => modelAliases.find((item) => item.id === selectedAliasId) || null, [modelAliases, selectedAliasId]);
  const selectedAliasBindings = useMemo(() => bindings.filter((item) => item.model_alias_id === selectedAliasId), [bindings, selectedAliasId]);
  const selectedAliasBindingCards = useMemo(() => selectedAliasBindings.map((binding) => ({
    binding,
    unit: backendUnits.find((unit) => unit.id === binding.backend_unit_id) || null,
  })), [backendUnits, selectedAliasBindings]);

  useEffect(() => {
    if (!selectedAliasId && modelAliases[0]?.id) setSelectedAliasId(modelAliases[0].id);
    if (selectedAliasId && !modelAliases.some((item) => item.id === selectedAliasId)) {
      setSelectedAliasId(modelAliases[0]?.id || null);
    }
  }, [modelAliases, selectedAliasId]);

  const loadKeys = async () => {
    setLlmKeysLoading(true);
    try {
      const response = await platformApi.aigw.listLlmKeys({
        page: keyPage,
        page_size: keyPageSize,
        ...(keySearch ? { search: keySearch } : {}),
        ...(keyKeyType ? { key_type: keyKeyType } : {}),
        ...(keyEnabled ? { enabled: keyEnabled } : {}),
      }) as { total: number; keys: AiGatewayLlmKey[] };
      setLlmKeys(Array.isArray(response?.keys) ? response.keys : []);
      setLlmKeysTotal(Number(response?.total || 0));
    } catch (err: any) {
      setError(err.message || '加载密钥列表失败');
    } finally {
      setLlmKeysLoading(false);
    }
  };

  const loadData = async () => {
    const requestId = ++loadDataRequestIdRef.current;
    setError('');
    try {
      const [providerItems, aliases, units, bindingItems, poolItems] = await Promise.all([
        platformApi.aigw.listProviderStats(),
        platformApi.aigw.listModelAliases(),
        platformApi.aigw.listBackendUnits(),
        platformApi.aigw.listBindings(),
        platformApi.aigw.listCapacityPools(),
      ]);
      if (requestId !== loadDataRequestIdRef.current) return;
      setProviderStats(Array.isArray(providerItems) ? providerItems : []);
      setModelAliases(Array.isArray(aliases) ? aliases : []);
      setBackendUnits(Array.isArray(units) ? units : []);
      setBindings(Array.isArray(bindingItems) ? bindingItems : []);
      setCapacityPools(Array.isArray(poolItems) ? poolItems : []);
      await loadKeys();
    } catch (err: any) {
      if (requestId !== loadDataRequestIdRef.current) return;
      setError(err.message || '加载 AI 网关数据失败');
    }
  };

  const refreshProviderStats = async () => {
    try {
      const items = await platformApi.aigw.listProviderStats();
      setProviderStats(Array.isArray(items) ? items : []);
    } catch {
      // 静默失败，避免打断用户操作
    }
  };

  const loadLogs = async () => {
    const requestId = ++loadLogsRequestIdRef.current;
    setLogsLoading(true);
    try {
      const response = await platformApi.aigw.listRequestLogs({
        page: logPage,
        page_size: logPageSize,
        ...(logModel ? { model: logModel } : {}),
        ...(logBackendModel ? { backend_model: logBackendModel } : {}),
        ...(logAliasId ? { model_alias_id: logAliasId } : {}),
        ...(logBackendUnitId ? { backend_unit_id: logBackendUnitId } : {}),
        ...(logLlmKeyId ? { llm_key_id: logLlmKeyId } : {}),
        ...(logTaskKeyId ? { task_key_id: logTaskKeyId } : {}),
        ...(logAppId ? { app_id: logAppId } : {}),
        ...(logCapacityPoolId ? { capacity_pool_id: logCapacityPoolId } : {}),
        ...(logTaskId ? { task_id: logTaskId } : {}),
        ...(logSubTaskId ? { sub_task_id: logSubTaskId } : {}),
        ...(logStartDate ? { start_date: new Date(logStartDate).toISOString() } : {}),
        ...(logEndDate ? { end_date: new Date(logEndDate).toISOString() } : {}),
      }) as AiGatewayLogListResponse;
      if (requestId !== loadLogsRequestIdRef.current) return;
      setLogs(Array.isArray(response?.logs) ? response.logs : []);
      setLogsTotal(Number(response?.total || 0));
    } catch (err: any) {
      if (requestId !== loadLogsRequestIdRef.current) return;
      setError(err.message || '加载日志失败');
    } finally {
      if (requestId === loadLogsRequestIdRef.current) {
        setLogsLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadData();
      await loadLogs();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadLogs();
  }, [logPage, logPageSize]);

  useEffect(() => {
    if (loading || llmKeysLoading) return;
    void loadKeys();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyPage, keyPageSize, keySearch, keyKeyType, keyEnabled]);

  useEffect(() => {
    if (!logAutoRefresh || loading) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void loadLogs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [
    logAutoRefresh,
    loading,
    logPage,
    logPageSize,
    logModel,
    logBackendModel,
    logAliasId,
    logBackendUnitId,
    logLlmKeyId,
    logTaskKeyId,
    logAppId,
    logCapacityPoolId,
    logTaskId,
    logSubTaskId,
    logStartDate,
    logEndDate,
  ]);

  useEffect(() => {
    if (loading || entryView !== 'aigw-config') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshProviderStats();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loading, entryView]);

  useEffect(() => {
    if (!logDrawerOpen || detailOpen || replayOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setLogDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailOpen, logDrawerOpen, replayOpen]);

  useEffect(() => {
    if (!keyManagementOpen || llmKeyModalOpen || llmKeyResultOpen || llmKeyDetailOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setKeyManagementOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyManagementOpen, llmKeyDetailOpen, llmKeyModalOpen, llmKeyResultOpen]);

  const copyText = async (value: string, successMessage = '内容已复制') => {
    try {
      await navigator.clipboard.writeText(value);
      notify(successMessage, 'success');
    } catch (err: any) {
      setError(err?.message || '复制失败');
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    await loadLogs();
    setRefreshing(false);
  };

  const openAliasModal = (item?: AiGatewayModelAlias) => {
    if (item) {
      setEditingAliasId(item.id);
      setAliasForm({
        alias_name: item.alias_name,
        max_tokens_default: item.max_tokens_default,
        temperature_default: item.temperature_default,
        enabled: item.enabled,
      });
    } else {
      setEditingAliasId(null);
      setAliasForm(emptyAlias());
    }
    setAliasModalOpen(true);
  };

  const openBackendModal = (item?: AiGatewayBackendUnitWithPool) => {
    if (item) {
      setPendingBackendPoolId(null);
      setEditingBackendUnitId(item.id);
      setBackendUnitForm({
        capacity_pool_id: item.capacity_pool_id || 0,
        unit_code: item.unit_code || '',
        provider_type: item.provider_type || '',
        api_base_url: item.api_base_url,
        model_name: item.model_name,
        api_key_ciphertext: '',
        api_key_fingerprint: item.api_key_fingerprint || '',
        total_max_concurrency: item.total_max_concurrency,
        priority_default: item.priority_default,
        supports_chat_completions: item.supports_chat_completions ?? true,
        supports_responses: item.supports_responses ?? true,
        supports_messages: item.supports_messages ?? true,
        enabled: item.enabled,
        description: item.description || '',
      });
    } else {
      setEditingBackendUnitId(null);
      setPendingBackendPoolId(null);
      setBackendUnitForm(emptyBackendUnit());
    }
    setBackendModalOpen(true);
  };

  const openBindingModal = (item?: AiGatewayModelAliasBinding, preset?: { modelAliasId?: number; backendUnitId?: number }) => {
    if (item) {
      setEditingBindingId(item.id);
      setBindingForm({
        model_alias_id: item.model_alias_id,
        backend_unit_id: item.backend_unit_id,
        priority: item.priority,
        weight: item.weight,
        enabled: item.enabled,
      });
    } else {
      setEditingBindingId(null);
      setBindingForm({
        ...emptyBinding(),
        model_alias_id: preset?.modelAliasId || modelAliases[0]?.id || 0,
        backend_unit_id: preset?.backendUnitId || backendUnits[0]?.id || 0,
      });
    }
    setBindingModalOpen(true);
  };

  const openLogsDrawer = (preset?: LogDrawerPreset) => {
    if (preset) {
      setLogModel(preset.model || '');
      setLogAliasId(preset.aliasId || '');
      setLogBackendUnitId(preset.backendUnitId || '');
      setLogLlmKeyId(preset.llmKeyId || '');
      setLogTaskKeyId(preset.taskKeyId || '');
      setLogAppId(preset.appId || '');
      setLogCapacityPoolId(preset.capacityPoolId || '');
      setLogTaskId(preset.taskId || '');
      setLogSubTaskId(preset.subTaskId || '');
      setLogPage(1);
      setLogDrawerPreset(preset);
    } else {
      setLogDrawerPreset({ title: '全部请求日志' });
    }
    setLogDrawerOpen(true);
  };

  const createBindingFromDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const backendUnitId = Number(event.dataTransfer.getData('text/backend-unit-id') || draggingBackendUnitId || 0);
    setDraggingBackendUnitId(null);
    if (!selectedAliasId) {
      setError('请先选择模型别名');
      return;
    }
    if (!backendUnitId) {
      setError('未识别拖入的模型');
      return;
    }
    if (bindings.some((item) => item.model_alias_id === selectedAliasId && item.backend_unit_id === backendUnitId)) {
      notify('该模型已在当前真实路由中', 'warning');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await platformApi.aigw.createBinding({
        ...emptyBinding(),
        model_alias_id: selectedAliasId,
        backend_unit_id: backendUnitId,
      });
      notify('真实路由已添加', 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '添加真实路由失败');
    } finally {
      setSaving(false);
    }
  };

  const resetAliasForm = () => {
    setEditingAliasId(null);
    setAliasForm(emptyAlias());
    setAliasModalOpen(false);
  };

  const resetBackendUnitForm = () => {
    setEditingBackendUnitId(null);
    setPendingBackendPoolId(null);
    setBackendUnitForm(emptyBackendUnit());
    setBackendModalOpen(false);
  };

  const resetBindingForm = () => {
    setEditingBindingId(null);
    setBindingForm({
      ...emptyBinding(),
      model_alias_id: modelAliases[0]?.id || 0,
      backend_unit_id: backendUnits[0]?.id || 0,
    });
    setBindingModalOpen(false);
  };

  const resetLlmKeyForm = () => {
    setEditingLlmKeyId(null);
    setLlmKeyForm(emptyLlmKeyForm());
    setLlmKeyModalOpen(false);
  };

  const openLlmKeyModal = (item?: AiGatewayLlmKey) => {
    if (item) {
      setEditingLlmKeyId(item.id);
      setLlmKeyForm({
        key_name: item.key_name || '',
        key_type: item.key_type === 'work' ? 'work' : item.key_type === 'app' ? 'app' : 'task',
        app_id: item.app_id || '',
        app_name: item.app_name || '',
        parent_key_id: item.parent_key_id || null,
        max_concurrency: item.max_concurrency || 0,
        task_id: item.task_id || '',
        sub_task_id: item.sub_task_id || '',
        enabled: item.enabled,
        expires_at: formatDateTimeInput(item.expires_at),
        description: item.description || '',
        capacity_pool_ids: Array.isArray(item.capacity_pool_ids) ? item.capacity_pool_ids : [],
      });
    } else {
      setEditingLlmKeyId(null);
      setLlmKeyForm(emptyLlmKeyForm());
    }
    setLlmKeyModalOpen(true);
  };

  useEffect(() => {
    if (llmKeyForm.key_type === 'app') {
      if (llmKeyForm.parent_key_id !== null || llmKeyForm.task_id !== '' || llmKeyForm.sub_task_id !== '') {
        setLlmKeyForm((current) => ({
          ...current,
          parent_key_id: null,
          task_id: '',
          sub_task_id: '',
        }));
      }
      return;
    }

    if (llmKeyForm.key_type !== 'work') {
      if (llmKeyForm.parent_key_id !== null || llmKeyForm.sub_task_id !== '' || llmKeyForm.app_id !== '' || llmKeyForm.app_name !== '') {
        setLlmKeyForm((current) => ({
          ...current,
          app_id: '',
          app_name: '',
          parent_key_id: null,
          sub_task_id: '',
        }));
      }
      return;
    }

    const parent = taskKeys.find((item) => item.id === llmKeyForm.parent_key_id) || null;
    if (!parent && taskKeys[0]) {
      setLlmKeyForm((current) => ({
        ...current,
        app_id: '',
        app_name: '',
        parent_key_id: taskKeys[0].id,
        task_id: taskKeys[0].task_id || '',
        capacity_pool_ids: [],
      }));
      return;
    }
    if (parent && (llmKeyForm.task_id !== parent.task_id || llmKeyForm.capacity_pool_ids.length > 0)) {
      setLlmKeyForm((current) => ({
        ...current,
        app_id: '',
        app_name: '',
        task_id: parent.task_id || '',
        capacity_pool_ids: [],
      }));
    }
  }, [llmKeyForm.app_id, llmKeyForm.app_name, llmKeyForm.capacity_pool_ids.length, llmKeyForm.key_type, llmKeyForm.parent_key_id, llmKeyForm.sub_task_id, llmKeyForm.task_id, taskKeys]);

  const resetCapacityPoolForm = () => {
    setEditingCapacityPoolId(null);
    setCapacityPoolForm(emptyCapacityPool());
    setCapacityPoolModalOpen(false);
  };

  useEffect(() => {
    if (!bindingForm.model_alias_id && modelAliases[0]?.id) {
      setBindingForm((current) => ({ ...current, model_alias_id: modelAliases[0].id }));
    }
    if (!bindingForm.backend_unit_id && backendUnits[0]?.id) {
      setBindingForm((current) => ({ ...current, backend_unit_id: backendUnits[0].id }));
    }
  }, [backendUnits, bindingForm.backend_unit_id, bindingForm.model_alias_id, modelAliases]);

  const submitAlias = async () => {
    setSaving(true);
    setError('');
    try {
      if (!aliasForm.alias_name.trim()) throw new Error('Alias 名称不能为空');
      if (editingAliasId) {
        await platformApi.aigw.updateModelAlias(editingAliasId, aliasForm);
        notify('Alias 已更新', 'success');
      } else {
        await platformApi.aigw.createModelAlias(aliasForm);
        notify('Alias 已创建', 'success');
      }
      resetAliasForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || '保存 Alias 失败');
    } finally {
      setSaving(false);
    }
  };

  const submitBackendUnit = async () => {
    setSaving(true);
    setError('');
    try {
      if (!backendUnitForm.model_name.trim()) throw new Error('模型名称不能为空');
      if (!backendUnitForm.api_base_url.trim()) throw new Error('API 地址不能为空');
      if (!backendUnitForm.supports_chat_completions && !backendUnitForm.supports_responses && !backendUnitForm.supports_messages) {
        throw new Error('至少选择一种支持接口');
      }
      const payload = {
        capacity_pool_id: pendingBackendPoolId || backendUnitForm.capacity_pool_id || 0,
        api_base_url: backendUnitForm.api_base_url,
        model_name: backendUnitForm.model_name,
        api_key_ciphertext: backendUnitForm.api_key_ciphertext,
        api_key_fingerprint: backendUnitForm.api_key_fingerprint,
        total_max_concurrency: backendUnitForm.total_max_concurrency,
        priority_default: backendUnitForm.priority_default,
        supports_chat_completions: backendUnitForm.supports_chat_completions,
        supports_responses: backendUnitForm.supports_responses,
        supports_messages: backendUnitForm.supports_messages,
        enabled: backendUnitForm.enabled,
        description: backendUnitForm.description,
      };
      if (editingBackendUnitId) {
        await platformApi.aigw.updateBackendUnit(editingBackendUnitId, payload);
        notify('模型已更新', 'success');
      } else {
        const created = await platformApi.aigw.createBackendUnit(payload) as AiGatewayBackendUnit;
        notify('模型已创建', 'success');
      }
      resetBackendUnitForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || '保存模型失败');
    } finally {
      setSaving(false);
    }
  };

  const submitBinding = async () => {
    setSaving(true);
    setError('');
    try {
      if (!bindingForm.model_alias_id) throw new Error('请选择模型别名');
      if (!bindingForm.backend_unit_id) throw new Error('请选择模型');
      if (editingBindingId) {
        await platformApi.aigw.updateBinding(editingBindingId, bindingForm);
        notify('绑定关系已更新', 'success');
      } else {
        await platformApi.aigw.createBinding(bindingForm);
        notify('绑定关系已创建', 'success');
      }
      resetBindingForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || '保存绑定关系失败');
    } finally {
      setSaving(false);
    }
  };

  const submitLlmKey = async () => {
    setSaving(true);
    setError('');
    try {
      if (!llmKeyForm.key_name.trim()) throw new Error('密钥名称不能为空');
      if (llmKeyForm.key_type === 'task' && !llmKeyForm.task_id.trim()) throw new Error('任务密钥必须填写任务 ID');
      if (llmKeyForm.key_type === 'task' && llmKeyForm.capacity_pool_ids.length === 0) throw new Error('任务密钥必须至少选择一个算力池');
      if (llmKeyForm.key_type === 'work' && !llmKeyForm.parent_key_id) throw new Error('工作密钥必须选择父任务密钥');
      if (llmKeyForm.key_type === 'work' && !llmKeyForm.sub_task_id.trim()) throw new Error('工作密钥必须填写子任务 ID');
      if (llmKeyForm.key_type === 'app' && !llmKeyForm.app_id.trim()) throw new Error('应用密钥必须填写应用 ID');
      if (llmKeyForm.key_type === 'app' && llmKeyForm.capacity_pool_ids.length === 0) throw new Error('应用密钥必须至少选择一个算力池');
      const payload = {
        key_name: llmKeyForm.key_name.trim(),
        key_type: llmKeyForm.key_type,
        app_id: llmKeyForm.key_type === 'app' ? llmKeyForm.app_id.trim() : '',
        app_name: llmKeyForm.key_type === 'app' ? llmKeyForm.app_name.trim() : '',
        max_concurrency: llmKeyForm.max_concurrency,
        task_id: llmKeyForm.key_type === 'app' ? '' : llmKeyForm.task_id.trim(),
        sub_task_id: llmKeyForm.key_type === 'work' ? llmKeyForm.sub_task_id.trim() : '',
        enabled: llmKeyForm.enabled,
        description: llmKeyForm.description.trim(),
        parent_key_id: llmKeyForm.key_type === 'work' ? (llmKeyForm.parent_key_id || null) : null,
        expires_at: llmKeyForm.expires_at || null,
        capacity_pool_ids: llmKeyForm.key_type === 'work' ? [] : llmKeyForm.capacity_pool_ids,
      };
      if (editingLlmKeyId) {
        await platformApi.aigw.updateLlmKey(editingLlmKeyId, {
          key_name: payload.key_name,
          max_concurrency: payload.max_concurrency,
          enabled: payload.enabled,
          expires_at: payload.expires_at || null,
          description: payload.description,
          capacity_pool_ids: payload.key_type === 'work' ? [] : payload.capacity_pool_ids,
        });
        notify('调用密钥已更新', 'success');
      } else {
        const response = await platformApi.aigw.createLlmKey(payload) as AiGatewayLlmKeyCreateResponse;
        setCreatedLlmKeyMeta(response?.key || null);
        setCreatedLlmKeySecret(String(response?.secret || ''));
        setLlmKeyResultOpen(true);
        notify('调用密钥已创建', 'success');
      }
      resetLlmKeyForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || (editingLlmKeyId ? '更新调用密钥失败' : '创建调用密钥失败'));
    } finally {
      setSaving(false);
    }
  };

  const openCapacityPoolModal = (pool?: AiGatewayCapacityPool) => {
    if (pool) {
      setEditingCapacityPoolId(pool.id);
      setCapacityPoolForm({
        pool_name: pool.pool_name,
        enabled: pool.enabled,
        description: pool.description || '',
        created_at: pool.created_at || '',
        updated_at: pool.updated_at || '',
      });
    } else {
      setEditingCapacityPoolId(null);
      setCapacityPoolForm(emptyCapacityPool());
    }
    setCapacityPoolModalOpen(true);
  };

  const submitCapacityPool = async () => {
    setSaving(true);
    setError('');
    try {
      if (!capacityPoolForm.pool_name.trim()) throw new Error('池名称不能为空');
      const payload = {
        pool_name: capacityPoolForm.pool_name.trim(),
        enabled: capacityPoolForm.enabled,
        description: capacityPoolForm.description.trim(),
      };
      if (editingCapacityPoolId) {
        await platformApi.aigw.updateCapacityPool(editingCapacityPoolId, payload);
        notify('算力池已更新', 'success');
      } else {
        await platformApi.aigw.createCapacityPool(payload);
        notify('算力池已创建', 'success');
      }
      resetCapacityPoolForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || '保存算力池失败');
    } finally {
      setSaving(false);
    }
  };

  const openLlmKeyDetail = async (id: number) => {
    try {
      const detail = await platformApi.aigw.getLlmKey(id) as AiGatewayLlmKey;
      setSelectedLlmKey(detail);
      setLlmKeyDetailOpen(true);
    } catch (err: any) {
      setError(err.message || '加载调用密钥详情失败');
    }
  };

  const deleteLlmKey = async (item: AiGatewayLlmKey) => {
    const confirmed = await showConfirm({
      title: '删除调用密钥',
      message:`确认删除调用密钥 ${item.key_name} 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.aigw.deleteLlmKey(item.id);
      notify('调用密钥已删除', 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '删除调用密钥失败');
    }
  };

  const deleteCapacityPool = async (pool: AiGatewayCapacityPool) => {
    const confirmed = await showConfirm({
      title: '删除算力池',
      message:`确认删除算力池 ${pool.pool_name} 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.aigw.deleteCapacityPool(pool.id);
      notify('算力池已删除', 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '删除算力池失败');
    }
  };

  const deleteItem = async (kind: 'alias' | 'backend' | 'binding', id: number, label: string) => {
    const confirmed = await showConfirm({
      title: '确认删除',
      message:`确认删除 ${label} 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setError('');
    try {
      if (kind === 'alias') await platformApi.aigw.deleteModelAlias(id);
      if (kind === 'backend') await platformApi.aigw.deleteBackendUnit(id);
      if (kind === 'binding') await platformApi.aigw.deleteBinding(id);
      notify(`${label} 已删除`, 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  };

  const runBackendTest = async (id: number) => {
    setTestingBackendId(id);
    setError('');
    setTestResult(null);
    try {
      const rawResult = await platformApi.aigw.testBackendUnit(id) as any;
      const nested = rawResult?.data || rawResult;
      const normalized: AiGatewayConnectionTestResult = {
        success: Boolean(nested?.success),
        reachable: Boolean(nested?.success),
        message: nested?.message || rawResult?.message,
        error: nested?.output?.error || rawResult?.error,
        status_code: typeof nested?.output?.status_code === 'number' ? nested.output.status_code : undefined,
        latency_ms: typeof nested?.output?.duration_ms === 'number' ? nested.output.duration_ms : undefined,
      };
      setTestResult(normalized);
      if (normalized.success || normalized.reachable) {
        notify('连通性测试成功', 'success');
      } else {
        setError(normalized.message || normalized.error || '连通性测试失败');
      }
    } catch (err: any) {
      setError(err.message || '连通性测试失败');
    } finally {
      setTestingBackendId(null);
    }
  };

  const openLogDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detail = await platformApi.aigw.getRequestLogDetail(id) as AiGatewayLogDetail;
      setSelectedLog(detail);
      setDetailOpen(true);
    } catch (err: any) {
      setError(err.message || '加载日志详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const replayLog = async (id: number) => {
    setReplayingLogId(id);
    setReplayResult(null);
    try {
      const response = await platformApi.aigw.replayRequestLog(id, { override: {} }) as AiGatewayReplayResponse;
      setReplayResult(response);
      setReplayOpen(true);
    } catch (err: any) {
      setError(err.message || '重放日志失败');
    } finally {
      setReplayingLogId(null);
    }
  };

  const clearLogs = async () => {
    const confirmed = await showConfirm({
      title: '确认清空',
      message: '确认清空全部 AI 网关请求日志吗？',
      confirmText: '清空',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.aigw.clearRequestLogs();
      notify('日志已清空', 'success');
      await loadLogs();
    } catch (err: any) {
      setError(err.message || '清空日志失败');
    }
  };

  const renderLogsSection = () => (
 <section className="flex h-full min-h-0 flex-col rounded-xl border border-theme-border bg-theme-surface p-6">
      <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">日志工作区</div>
          <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">请求日志</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary">
            <input type="checkbox" checked={logAutoRefresh} onChange={(e) => setLogAutoRefresh(e.target.checked)} />
            自动刷新
          </label>
          <button onClick={() => { setLogPage(1); void loadLogs(); }} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">刷新日志</button>
        </div>
      </div>

      <div className="mb-3 shrink-0 rounded-xl border border-theme-border bg-theme-surface">
        <button onClick={() => setLogFiltersExpanded(!logFiltersExpanded)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">筛选条件</div>
            {logModel || logBackendModel || logAliasId || logBackendUnitId || logLlmKeyId || logTaskKeyId || logAppId || logCapacityPoolId || logTaskId || logSubTaskId || logStartDate || logEndDate ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-400">已筛选</span> : null}
          </div>
          {logFiltersExpanded ? <ChevronUp className="h-4 w-4 text-theme-text-muted" /> : <ChevronDown className="h-4 w-4 text-theme-text-muted" />}
        </button>
        {logFiltersExpanded ? (
          <>
            <div className="grid gap-3 p-3 pt-0 md:grid-cols-2 xl:grid-cols-5">
              <input value={logModel} onChange={(e) => setLogModel(e.target.value)} placeholder="公开模型" className="form-input" />
              <select value={logBackendModel} onChange={(e) => setLogBackendModel(e.target.value)} className="form-select">
                <option value="">后端模型</option>
                {backendModels.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={logAliasId} onChange={(e) => setLogAliasId(e.target.value)} className="form-select">
                <option value="">模型别名</option>
                {aliasOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={logBackendUnitId} onChange={(e) => setLogBackendUnitId(e.target.value)} className="form-select">
                <option value="">模型</option>
                {backendUnitOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={logLlmKeyId} onChange={(e) => setLogLlmKeyId(e.target.value)} className="form-select">
                <option value="">调用密钥</option>
                {llmKeys.map((item) => <option key={item.id} value={item.id}>{item.key_name ||`#${item.id}`}</option>)}
              </select>
              <select value={logCapacityPoolId} onChange={(e) => setLogCapacityPoolId(e.target.value)} className="form-select">
                <option value="">算力池</option>
                {capacityPools.map((item) => <option key={item.id} value={item.id}>{item.pool_name}</option>)}
              </select>
              <input value={logTaskKeyId} onChange={(e) => setLogTaskKeyId(e.target.value)} placeholder="任务密钥 ID" className="form-input" />
              <input value={logAppId} onChange={(e) => setLogAppId(e.target.value)} placeholder="应用 ID" className="form-input" />
              <input value={logTaskId} onChange={(e) => setLogTaskId(e.target.value)} placeholder="任务 ID" className="form-input" />
              <input value={logSubTaskId} onChange={(e) => setLogSubTaskId(e.target.value)} placeholder="子任务 ID" className="form-input" />
              <input type="datetime-local" value={logStartDate} onChange={(e) => setLogStartDate(e.target.value)} className="form-input" />
              <input type="datetime-local" value={logEndDate} onChange={(e) => setLogEndDate(e.target.value)} className="form-input" />
            </div>
            <div className="flex items-center gap-2 p-3 pt-0">
              <button onClick={() => { setLogPage(1); void loadLogs(); }} disabled={logsLoading} className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-bold text-white disabled:opacity-50">查询</button>
              <button onClick={() => { setLogModel(''); setLogBackendModel(''); setLogAliasId(''); setLogBackendUnitId(''); setLogLlmKeyId(''); setLogTaskKeyId(''); setLogAppId(''); setLogCapacityPoolId(''); setLogTaskId(''); setLogSubTaskId(''); setLogStartDate(''); setLogEndDate(''); setLogPage(1); void loadLogs(); }} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary">重置</button>
            </div>
          </>
        ) : null}
      </div>
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-3">
        <div className="text-xs font-bold text-theme-text-muted">
          {logsLoading ? '日志加载中...' :`当前第 ${logPage} 页，共 ${logsTotal} 条`}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {(() => {
          const columns: DataTableColumn<typeof logs[number]>[] = [
            {
              key: 'created_at',
              header: '时间',
              render: (log) => <span className="text-theme-text-secondary">{new Date(log.created_at).toLocaleString('zh-CN')}</span>,
            },
            {
              key: 'model_name',
              header: '模型',
              render: (log) => <div className="truncate font-bold text-theme-text-primary" title={`后端: ${log.backend_model_name || '-'}`}>{log.model_name || '-'}</div>,
            },
            {
              key: 'attribution',
              header: '归因',
              render: (log) => (
                <>
                  <div className="truncate font-mono text-xs text-theme-text-secondary" title={log.app_id ? (log.app_name ? `${log.app_name} / ${log.app_id}` : log.app_id) : (log.sub_task_id || log.task_id || '-')}>
                    {log.app_id ? (log.app_name ? `${log.app_name} / ${log.app_id}` : log.app_id) : (log.task_id || '-')}
                  </div>
                  {!log.app_id && log.sub_task_id ? <div className="mt-0.5 truncate text-[11px] text-theme-text-muted">{log.sub_task_id}</div> : null}
                </>
              ),
            },
            {
              key: 'alias_unit',
              header: '别名 / 单元',
              render: (log) => <span className="text-theme-text-secondary text-xs">A{log.model_alias_id || '-'} / U{log.backend_unit_id || '-'}</span>,
            },
            {
              key: 'status_code',
              header: '状态',
              render: (log) => (
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${log.status_code >= 200 && log.status_code < 300 ? 'bg-emerald-500/15 text-emerald-400' : log.status_code >= 400 ? 'bg-rose-500/15 text-rose-400' : 'bg-theme-elevated text-theme-text-secondary'}`}>{log.status_code || '-'}</span>
                  <span className="text-xs text-theme-text-muted">{log.is_stream ? 'stream' : 'json'}</span>
                </div>
              ),
            },
            {
              key: 'response_time',
              header: '延迟',
              render: (log) => <span className="text-theme-text-secondary text-xs">{log.response_time || 0} ms / 首 Token {log.first_token_latency || 0} ms</span>,
            },
            {
              key: 'request_preview',
              header: '请求预览',
              render: (log) => <div className="max-w-[300px]"><div className="truncate text-xs text-theme-text-secondary" title={log.request_preview}>{log.request_preview || '-'}</div></div>,
            },
            {
              key: 'actions',
              header: '操作',
              render: (log) => (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openLogDetail(log.id)} disabled={detailLoading} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"><Eye className="h-3 w-3" /></button>
                  <button onClick={() => replayLog(log.id)} disabled={replayingLogId === log.id} className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-400 hover:bg-amber-200 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${replayingLogId === log.id ? 'animate-spin' : ''}`} /></button>
                </div>
              ),
            },
          ];
          return (
            <DataTable
              columns={columns}
              data={logs}
              rowKey={(log) => String(log.id)}
              loading={logsLoading}
              empty="暂无日志"
              minWidth={1000}
            />
          );
        })()}
      </div>

      <div className="mt-5 flex shrink-0 items-center justify-between">
        <div className="text-sm text-theme-text-muted">共 {logsTotal} 条</div>
        <div className="flex items-center gap-2">
          <button onClick={clearLogs} className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-400 hover:bg-rose-200">清空日志</button>
          <select value={logPageSize} onChange={(e) => { setLogPageSize(Number(e.target.value)); setLogPage(1); }} className="form-select">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
          </select>
          <button disabled={logPage <= 1} onClick={() => setLogPage((v) => Math.max(1, v - 1))} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">上一页</button>
          <span className="text-sm font-bold text-theme-text-secondary">{logPage}</span>
          <button disabled={logPage * logPageSize >= logsTotal} onClick={() => setLogPage((v) => v + 1)} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">下一页</button>
        </div>
      </div>
    </section>
  );

  const renderKeyManagementSection = (options?: { onClose?: () => void }) => (
 <section className="flex h-full min-h-0 flex-col rounded-xl border border-theme-border bg-theme-surface p-6">
      <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">调用凭证</div>
          <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">调用密钥管理</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openLlmKeyModal()} className="btn btn-primary inline-flex items-center gap-1">
            <Plus className="h-4 w-4" />
            新建调用密钥
          </button>
          <button onClick={() => { setKeyPage(1); void loadKeys(); }} className="btn-secondary">刷新</button>
          {options?.onClose ? (
            <button onClick={options.onClose} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated">
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 shrink-0 rounded-xl border border-theme-border bg-theme-surface">
        <button onClick={() => setKeyFiltersExpanded(!keyFiltersExpanded)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">筛选条件</div>
            {keySearch || keyKeyType || keyEnabled ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-400">已筛选</span> : null}
          </div>
          {keyFiltersExpanded ? <ChevronUp className="h-4 w-4 text-theme-text-muted" /> : <ChevronDown className="h-4 w-4 text-theme-text-muted" />}
        </button>
        {keyFiltersExpanded ? (
          <div className="grid gap-3 p-3 pt-0 md:grid-cols-2 xl:grid-cols-4">
            <input value={keySearch} onChange={(e) => setKeySearch(e.target.value)} placeholder="搜索名称、任务 ID、备注..." className="form-input" />
            <select value={keyKeyType} onChange={(e) => setKeyKeyType(e.target.value)} className="form-select">
              <option value="">全部类型</option>
              <option value="task">任务密钥</option>
              <option value="work">工作密钥</option>
              <option value="app">应用密钥</option>
            </select>
            <select value={keyEnabled} onChange={(e) => setKeyEnabled(e.target.value)} className="form-select">
              <option value="">全部状态</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <button onClick={() => { setKeySearch(''); setKeyKeyType(''); setKeyEnabled(''); setKeyPage(1); }} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">重置</button>
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-bold text-theme-text-muted">
          {llmKeysLoading ? '加载中...' :`当前第 ${keyPage} 页，共 ${llmKeysTotal} 条`}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {(() => {
          const columns: DataTableColumn<typeof llmKeys[number]>[] = [
            {
              key: 'key_name',
              header: '名称',
              width: '25%',
              render: (item) => <div className="font-bold text-theme-text-primary" title={item.description || '无备注'}>{item.key_name || `密钥 #${item.id}`}</div>,
            },
            {
              key: 'key_type',
              header: '类型',
              width: '10%',
              render: (item) => <span className="text-theme-text-secondary">{getLlmKeyTypeLabel(item.key_type)}</span>,
            },
            {
              key: 'max_concurrency',
              header: '最大并发',
              width: '10%',
              render: (item) => <span className="text-theme-text-secondary">{item.max_concurrency || 0}</span>,
            },
            {
              key: 'scope',
              header: '身份范围',
              width: '25%',
              render: (item) => <span className="text-theme-text-secondary">{getLlmKeyScopeLabel(item)}</span>,
            },
            {
              key: 'enabled',
              header: '状态',
              width: '10%',
              render: (item) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-theme-elevated text-theme-text-muted'}`}>{item.enabled ? '启用' : '禁用'}</span>,
            },
            {
              key: 'updated_at',
              header: '更新时间',
              width: '15%',
              render: (item) => <span className="text-theme-text-secondary">{item.updated_at ? new Date(item.updated_at).toLocaleString('zh-CN') : '-'}</span>,
            },
            {
              key: 'actions',
              header: '操作',
              render: (item) => (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openLlmKeyModal(item)} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"><Pencil className="h-3 w-3" /></button>
                  <button onClick={() => openLogsDrawer({ title: `${item.key_name || `密钥 #${item.id}`} 日志`, llmKeyId: String(item.id), appId: item.key_type === 'app' ? (item.app_id || '') : undefined, taskId: item.key_type !== 'app' ? (item.task_id || '') : undefined, subTaskId: item.key_type === 'work' ? (item.sub_task_id || '') : undefined })} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"><FileText className="h-3 w-3" /></button>
                  <button onClick={() => openLlmKeyDetail(item.id)} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"><Eye className="h-3 w-3" /></button>
                  <button onClick={() => deleteLlmKey(item)} className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-200"><Trash2 className="h-3 w-3" /></button>
                </div>
              ),
            },
          ];
          return (
            <DataTable
              columns={columns}
              data={llmKeys}
              rowKey={(item) => String(item.id)}
              loading={llmKeysLoading}
              empty="暂无调用密钥"
              minWidth={900}
            />
          );
        })()}
      </div>

      <div className="mt-5 flex shrink-0 items-center justify-between">
        <div className="text-sm text-theme-text-muted">共 {llmKeysTotal} 条</div>
        <div className="flex items-center gap-2">
          <select value={keyPageSize} onChange={(e) => { setKeyPageSize(Number(e.target.value)); setKeyPage(1); }} className="form-select">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
          </select>
          <button disabled={keyPage <= 1} onClick={() => setKeyPage((v) => Math.max(1, v - 1))} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">上一页</button>
          <span className="text-sm font-bold text-theme-text-secondary">{keyPage}</span>
          <button disabled={keyPage * keyPageSize >= llmKeysTotal} onClick={() => setKeyPage((v) => v + 1)} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">下一页</button>
        </div>
      </div>
    </section>
  );

  const pageTitle = entryView === 'aigw-keys' ? '密钥管理' : entryView === 'aigw-logs' ? '请求日志' : entryView === 'aigw-token-stats' ? 'Token 统计' : '网关配置';

  return (
    <div className="flex min-h-full flex-col gap-6 p-8">
      {feedbackNodes}
      <PageHeader
        title={pageTitle}
        actions={<button
          onClick={refreshData}
          disabled={refreshing || loading}
          className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>}
      />

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">{error}</div> : null}
      {testResult ? (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/15 px-4 py-3 text-sm text-sky-400">
          测试结果：{testResult.message || testResult.error_message || testResult.error || (testResult.success || testResult.reachable ? 'success' : 'failed')}
          {typeof testResult.latency_ms === 'number' ?` · ${testResult.latency_ms} ms` : ''}
          {typeof testResult.status_code === 'number' ?` · HTTP ${testResult.status_code}` : ''}
        </div>
      ) : null}

      {entryView === 'aigw-keys' ? (
        <div className="min-h-[680px] flex-1">
          {renderKeyManagementSection()}
        </div>
      ) : entryView === 'aigw-logs' ? (
        <div className="min-h-[680px] flex-1">
          {renderLogsSection()}
        </div>
      ) : entryView === 'aigw-token-stats' ? (
        <AiGatewayTokenStatsPage onNavigate={onNavigate} />
      ) : (
 <section className="flex min-h-[680px] flex-1 flex-col rounded-xl border border-theme-border bg-theme-surface p-6">
        <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">模型配置工作台</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onNavigate ? onNavigate('aigw-keys') : setKeyManagementOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <KeyRound className="h-4 w-4" />
              密钥管理
            </button>
            <button onClick={() => onNavigate ? onNavigate('aigw-logs') : openLogsDrawer()} className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <FileText className="h-4 w-4" />
              查看日志
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[240px,1fr,360px]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-theme-border bg-theme-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">别名列</div>
                <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">模型别名</h3>
              </div>
              <button
                type="button"
                onClick={() => openAliasModal()}
                className="rounded-xl bg-theme-surface p-2 text-white hover:bg-theme-elevated"
                aria-label="新建模型别名"
                title="新建模型别名"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto">
              {aliasGroups.map((group) => {
                const active = selectedAliasId === group.alias.id;
                return (
                  <div
                    key={group.alias.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAliasId(group.alias.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedAliasId(group.alias.id);
                      }
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-theme-border bg-theme-bg-elevated text-theme-text-primary' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{group.alias.alias_name}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-theme-elevated text-theme-text-primary' : 'bg-theme-elevated text-theme-text-muted'}`}>{group.bindings.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAliasModal(group.alias);
                          }}
 className={`rounded-xl p-1.5 ${active ? 'bg-theme-elevated text-theme-text-primary hover:bg-theme-elevated' : 'bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'}`}
                          aria-label={`编辑模型别名 ${group.alias.alias_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteItem('alias', group.alias.id,`模型别名 ${group.alias.alias_name}`);
                          }}
                          className="rounded-xl bg-rose-500/15 p-1.5 text-rose-400 hover:bg-rose-200"
                          aria-label={`删除模型别名 ${group.alias.alias_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!aliasGroups.length ? <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">暂无模型别名</div> : null}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-xl border border-theme-border bg-theme-surface p-4">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">绑定区</div>
                <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">{selectedAlias ?`${selectedAlias.alias_name} 的真实路由绑定` : '请选择模型别名'}</h3>
              </div>
              {selectedAlias ? (
                <button
                  onClick={() => openBindingModal(undefined, { modelAliasId: selectedAlias.id })}
                  className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-2 text-sm font-bold text-white"
                >
                  <Plus className="h-4 w-4" />
                  新增真实路由
                </button>
              ) : null}
            </div>
            <div
              onDragOver={(event) => {
                if (selectedAliasId && draggingBackendUnitId) event.preventDefault();
              }}
              onDrop={createBindingFromDrop}
              className={`mt-4 min-h-[420px] flex-1 overflow-auto rounded-xl border p-4 transition ${selectedAliasId && draggingBackendUnitId ? 'border-sky-300 bg-blue-500/10' : selectedAliasId ? 'border-theme-border bg-theme-surface' : 'border-theme-border bg-theme-elevated'}`}
            >
              {selectedAliasId ? (
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">真实路由</div>
                      <div className="text-xs font-bold text-theme-text-muted">{selectedAliasBindingCards.length} 个 backend unit</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedAliasBindingCards.map(({ binding, unit }) => {
                        const stat = unit ? providerStatByBackendId.get(unit.id) : undefined;
                        const maxConcurrency = Number(unit?.total_max_concurrency || 0);
                        const activeRequests = Number(stat?.active_requests || 0);
                        const waitingRequests = Number(stat?.waiting_requests || 0);
                        const firstTokenLatency = Number(stat?.avg_first_token_latency || 0);
                        const avgTokenLatency = Number(stat?.avg_token_latency || 0);
                        const successRate = Number(stat?.success_rate || 0);
                        const routingScore = Number(stat?.adaptive_routing_score || 0);
                        const requestCount = Number(stat?.request_count || 0);
                        const hasTelemetry = requestCount > 0 || activeRequests > 0;
                        const concurrencyRatio = maxConcurrency > 0 ? Math.min(1, activeRequests / maxConcurrency) : 0;
                        const concurrencyTone = concurrencyRatio >= 0.9 ? 'bad' : concurrencyRatio >= 0.7 ? 'warn' : 'good';
                        const successTone = !hasTelemetry ? 'default' : successRate >= 0.95 ? 'good' : successRate >= 0.8 ? 'warn' : 'bad';
                        const concurrencyBarColor = concurrencyTone === 'bad' ? 'bg-rose-500' : concurrencyTone === 'warn' ? 'bg-amber-500' : 'bg-sky-500';
                        const concurrencyTextColor = concurrencyTone === 'bad' ? 'text-rose-400' : concurrencyTone === 'warn' ? 'text-amber-400' : 'text-theme-text-secondary';
                        return (
                          <div key={binding.id} className={`rounded-2xl border border-theme-border bg-theme-surface p-4 transition hover:bg-theme-elevated ${binding.enabled ? '' : 'opacity-60'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="truncate text-base font-semibold text-theme-text-primary">{unit?.model_name || `模型 #${binding.backend_unit_id}`}</div>
                                  {unit?.provider_type ? <span className="shrink-0 rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-bold text-theme-text-secondary">{unit.provider_type}</span> : null}
                                  {binding.enabled ? <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">启用</span> : <span className="shrink-0 rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-bold text-theme-text-muted">已停用</span>}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-theme-text-muted">
                                  <span>单元 #{binding.backend_unit_id}</span>
                                  <span>优先级 {binding.priority}</span>
                                  <span>权重 {binding.weight}</span>
                                  {unit?.api_base_url ? <span className="max-w-[220px] truncate" title={unit.api_base_url}>{unit.api_base_url}</span> : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button onClick={() => openBindingModal(binding)} className="rounded-xl bg-theme-elevated p-1.5 text-theme-text-secondary hover:bg-theme-elevated" aria-label={`编辑真实路由 #${binding.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                                {unit ? <button onClick={() => openLogsDrawer({ title:`${unit.model_name} 的请求日志`, aliasId: String(binding.model_alias_id), backendUnitId: String(binding.backend_unit_id) })} className="rounded-xl bg-theme-elevated p-1.5 text-theme-text-secondary hover:bg-theme-elevated" aria-label={`查看 ${unit.model_name} 的请求日志`}><FileText className="h-3.5 w-3.5" /></button> : null}
                                <button onClick={() => void deleteItem('binding', binding.id,`真实路由绑定 #${binding.id}`)} className="rounded-xl bg-rose-500/15 p-1.5 text-rose-400 hover:bg-rose-200" aria-label={`删除真实路由 #${binding.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <BindingMetricCell label="首 Token 延迟" value={formatLatencyMs(firstTokenLatency)} hint="最近 1 小时平均首 Token 延迟" />
                              <BindingMetricCell label="平均 Token 延迟" value={formatLatencyMs(avgTokenLatency)} hint="最近 1 小时平均生成 Token 延迟" />
                              <BindingMetricCell label="成功率" value={formatPercent(successRate, hasTelemetry)} tone={successTone} hint="成功请求数 / 总请求数" />
                              <BindingMetricCell label="路由评分" value={formatScore(routingScore)} hint="自适应路由评分，数值越低越优先被选中" />
                              <BindingMetricCell label="请求数" value={formatCount(requestCount)} hint="最近 1 小时请求总数" />
                              <BindingMetricCell label="等待请求" value={waitingRequests ? String(waitingRequests) : '-'} hint="当前排队等待的请求数" />
                            </div>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[11px] font-bold text-theme-text-muted">
                                <span>占用连接 / 最大并发</span>
                                <span className={concurrencyTextColor}>{activeRequests} / {maxConcurrency || '∞'}</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-theme-elevated">
                                <div className={`h-full rounded-full ${concurrencyBarColor} transition-all`} style={{ width: `${concurrencyRatio * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!selectedAliasBindingCards.length ? (
                        <div className="col-span-full rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-16 text-center text-sm text-theme-text-muted">
                          当前公开模型还没有真实路由绑定。可拖动右侧模型到这里添加真实路由。
                        </div>
                      ) : null}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-theme-text-muted">请先从左侧选择一个模型别名</div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-xl border border-theme-border bg-theme-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">模型库</div>
                <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">真实算力池</h3>
              </div>
              <button
                type="button"
                onClick={() => openCapacityPoolModal()}
                className="rounded-xl bg-theme-surface p-2 text-white hover:bg-theme-elevated"
                aria-label="新建算力池"
                title="新建算力池"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-auto">
              {capacityPools.map((pool) => (
                <div
                  key={pool.id}
                  className="rounded-lg border border-theme-border bg-theme-surface p-3"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-theme-text-primary">{pool.pool_name}</div>
                      <div className="text-xs font-bold text-theme-text-muted">{pool.enabled ? '启用中' : '已禁用'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBackendUnitForm(emptyBackendUnit());
                          setPendingBackendPoolId(pool.id);
                          setEditingBackendUnitId(null);
                          setBackendModalOpen(true);
                        }}
                        className="rounded-xl bg-theme-elevated p-1.5 text-theme-text-secondary hover:bg-theme-elevated"
                        aria-label={`向算力池 ${pool.pool_name} 添加模型`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openCapacityPoolModal(pool)}
                        className="rounded-xl bg-theme-elevated p-1.5 text-theme-text-secondary hover:bg-theme-elevated"
                        aria-label={`编辑算力池 ${pool.pool_name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCapacityPool(pool)}
                        className="rounded-xl bg-rose-500/15 p-1.5 text-rose-400 hover:bg-rose-200"
                        aria-label={`删除算力池 ${pool.pool_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(poolUnitsByPoolId.get(pool.id) || []).map((unit) => (
                      <div
                        key={unit.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingBackendUnitId(unit.id);
                          e.dataTransfer.setData('text/capacity-pool-id', String(pool.id));
                          e.dataTransfer.setData('text/backend-unit-id', String(unit.id));
                        }}
                        onDragEnd={() => setDraggingBackendUnitId(null)}
                        className={`rounded-2xl border px-4 py-3 transition ${draggingBackendUnitId === unit.id ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'} border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 font-semibold text-theme-text-primary">
                            <div className="truncate">{unit.model_name ||`模型 #${unit.id}`}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openBackendModal(unit);
                              }}
                              className="rounded-xl bg-theme-elevated p-1.5 text-theme-text-secondary hover:bg-theme-elevated"
                              aria-label={`编辑模型 ${unit.model_name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteItem('backend', unit.id,`模型 ${unit.model_name}`);
                              }}
                              className="rounded-xl bg-rose-500/15 p-1.5 text-rose-400 hover:bg-rose-200"
                              aria-label={`删除模型 ${unit.model_name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
      )}

      <Modal open={aliasModalOpen} onClose={resetAliasForm} className="max-w-2xl">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{editingAliasId ? '编辑模型别名' : '新增模型别名'}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">管理模型别名的默认参数与启停状态。</p>
                {editingAliasId ? <div className="mt-2 text-xs font-bold text-theme-text-muted">当前编辑对象：模型别名 #{editingAliasId}</div> : null}
              </div>
              <button onClick={resetAliasForm} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">模型别名默认参数</div>
              <label className="block text-sm font-bold text-theme-text-secondary">模型别名<input value={aliasForm.alias_name} onChange={(e) => setAliasForm((v) => ({ ...v, alias_name: e.target.value }))} placeholder="例如 gpt-4o-mini / deepseek-chat" className="form-input mt-1 w-full" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">Max Tokens<input type="number" value={aliasForm.max_tokens_default} onChange={(e) => setAliasForm((v) => ({ ...v, max_tokens_default: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">Temperature<input type="number" step="0.1" value={aliasForm.temperature_default} onChange={(e) => setAliasForm((v) => ({ ...v, temperature_default: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
              </div>
              <p className="-mt-1 text-xs text-theme-text-muted">这里配置的是公开模型别名的默认推理参数，供上游请求未显式传值时回退使用。</p>
              <label className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary"><input type="checkbox" checked={aliasForm.enabled} onChange={(e) => setAliasForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={resetAliasForm} className="btn-secondary">取消</button>
              <button onClick={submitAlias} disabled={saving} className="btn btn-primary inline-flex disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
      </Modal>
      <Modal open={backendModalOpen} onClose={resetBackendUnitForm} className="max-w-3xl">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{editingBackendUnitId ? '编辑模型' : '新增模型'}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">配置模型、Provider、地址和容量上限。</p>
                {editingBackendUnitId ? <div className="mt-2 text-xs font-bold text-theme-text-muted">当前编辑对象：模型 #{editingBackendUnitId}{backendUnitForm.api_key_fingerprint ?` · 指纹 ${backendUnitForm.api_key_fingerprint}` : ''}</div> : null}
              </div>
              <button onClick={resetBackendUnitForm} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">模型</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">模型名称<input value={backendUnitForm.model_name} onChange={(e) => setBackendUnitForm((v) => ({ ...v, model_name: e.target.value }))} placeholder="实际下游模型名" className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">API 地址<input value={backendUnitForm.api_base_url} onChange={(e) => setBackendUnitForm((v) => ({ ...v, api_base_url: e.target.value }))} placeholder="https://..." className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">最大并发<input type="number" value={backendUnitForm.total_max_concurrency} onChange={(e) => setBackendUnitForm((v) => ({ ...v, total_max_concurrency: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">默认优先级<input type="number" value={backendUnitForm.priority_default} onChange={(e) => setBackendUnitForm((v) => ({ ...v, priority_default: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
              </div>
              <p className="-mt-1 text-xs text-theme-text-muted">一个模型对应一个真实的接入点，下面的 Chat / Responses / Messages 开关会直接写入`gaiasec-llm-gateway` 的真实后端能力字段。</p>
              <label className="block text-sm font-bold text-theme-text-secondary">API 密钥<input type="password" value={backendUnitForm.api_key_ciphertext || ''} onChange={(e) => setBackendUnitForm((v) => ({ ...v, api_key_ciphertext: e.target.value }))} placeholder={editingBackendUnitId ? '留空则保持现有 API 密钥' : ''} className="form-input mt-1 w-full" /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-bold text-theme-text-secondary">
                  <input type="checkbox" checked={backendUnitForm.supports_chat_completions} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_chat_completions: e.target.checked }))} />
                  支持 Chat
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-bold text-theme-text-secondary">
                  <input type="checkbox" checked={backendUnitForm.supports_responses} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_responses: e.target.checked }))} />
                  支持 Responses
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-bold text-theme-text-secondary">
                  <input type="checkbox" checked={backendUnitForm.supports_messages} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_messages: e.target.checked }))} />
                  支持 Messages
                </label>
              </div>
              <label className="block text-sm font-bold text-theme-text-secondary">描述<textarea value={backendUnitForm.description || ''} onChange={(e) => setBackendUnitForm((v) => ({ ...v, description: e.target.value }))} className="form-textarea mt-1 min-h-24 w-full" /></label>
              <label className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary"><input type="checkbox" checked={backendUnitForm.enabled} onChange={(e) => setBackendUnitForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={resetBackendUnitForm} className="btn-secondary">取消</button>
              <button onClick={submitBackendUnit} disabled={saving} className="btn btn-primary inline-flex disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
      </Modal>

      <Modal open={bindingModalOpen} onClose={resetBindingForm} className="max-w-2xl">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{editingBindingId ? '编辑绑定关系' : '新增绑定关系'}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">管理模型别名到模型的调度关系。</p>
                {editingBindingId ? <div className="mt-2 text-xs font-bold text-theme-text-muted">当前编辑对象：绑定关系 #{editingBindingId}</div> : null}
              </div>
              <button onClick={resetBindingForm} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">绑定调度</div>
              <label className="block text-sm font-bold text-theme-text-secondary">模型别名
                <select value={bindingForm.model_alias_id} onChange={(e) => setBindingForm((v) => ({ ...v, model_alias_id: Number(e.target.value) }))} className="form-input mt-1 w-full">
                  {modelAliases.map((item) => <option key={item.id} value={item.id}>{item.alias_name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-theme-text-secondary">模型
                <select value={bindingForm.backend_unit_id} onChange={(e) => setBindingForm((v) => ({ ...v, backend_unit_id: Number(e.target.value) }))} className="form-input mt-1 w-full">
                  {backendUnits.map((item) => <option key={item.id} value={item.id}>{item.model_name} (#${item.id})</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">优先级<input type="number" value={bindingForm.priority} onChange={(e) => setBindingForm((v) => ({ ...v, priority: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">权重<input type="number" value={bindingForm.weight} onChange={(e) => setBindingForm((v) => ({ ...v, weight: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
              </div>
              <p className="-mt-1 text-xs text-theme-text-muted">优先级决定优先调度顺序，权重用于同层级的流量分配。</p>
              <label className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary"><input type="checkbox" checked={bindingForm.enabled} onChange={(e) => setBindingForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={resetBindingForm} className="rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary">取消</button>
              <button onClick={submitBinding} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-theme-surface px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
      </Modal>

      <Modal open={capacityPoolModalOpen} onClose={resetCapacityPoolForm} className="max-w-2xl">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{editingCapacityPoolId ? '编辑算力池' : '新增算力池'}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">算力池是面向模型别名暴露的容量抽象层，一个池可承接多个模型。</p>
                {editingCapacityPoolId ? <div className="mt-2 text-xs font-bold text-theme-text-muted">当前编辑对象：算力池 #{editingCapacityPoolId}</div> : null}
              </div>
              <button onClick={resetCapacityPoolForm} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block text-sm font-bold text-theme-text-secondary">池名称<input value={capacityPoolForm.pool_name} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, pool_name: e.target.value }))} placeholder="例如 GPT-4o 生产池" className="form-input mt-1 w-full" /></label>
              <label className="block text-sm font-bold text-theme-text-secondary">描述<textarea value={capacityPoolForm.description} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, description: e.target.value }))} className="form-textarea mt-1 min-h-24 w-full" /></label>
              <label className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary"><input type="checkbox" checked={capacityPoolForm.enabled} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={resetCapacityPoolForm} className="rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary">取消</button>
              <button onClick={submitCapacityPool} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-theme-surface px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存算力池</button>
            </div>
      </Modal>

      {keyManagementOpen ? createPortal((
        <div className="fixed inset-0 z-[260]">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setKeyManagementOpen(false)} />
 <section className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-theme-elevated p-6">
        <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">调用凭证</div>
            <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">调用密钥管理</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setKeyPage(1); void loadKeys(); }} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">刷新</button>
            <button onClick={() => openLlmKeyModal()} className="inline-flex items-center gap-2 rounded-lg bg-theme-surface px-4 py-2.5 text-sm font-bold text-white">
              <Plus className="h-4 w-4" />
              新建调用密钥
            </button>
            <button onClick={() => setKeyManagementOpen(false)} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mb-3 shrink-0 rounded-xl border border-theme-border bg-theme-surface">
          <button onClick={() => setKeyFiltersExpanded(!keyFiltersExpanded)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">筛选条件</div>
              {keySearch || keyKeyType || keyEnabled ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-400">已筛选</span> : null}
            </div>
            {keyFiltersExpanded ? <ChevronUp className="h-4 w-4 text-theme-text-muted" /> : <ChevronDown className="h-4 w-4 text-theme-text-muted" />}
          </button>
          {keyFiltersExpanded ? (
            <div className="grid gap-3 p-3 pt-0 md:grid-cols-2 xl:grid-cols-4">
              <input value={keySearch} onChange={(e) => setKeySearch(e.target.value)} placeholder="搜索名称、任务 ID、备注..." className="form-input" />
              <select value={keyKeyType} onChange={(e) => setKeyKeyType(e.target.value)} className="form-select">
                <option value="">全部类型</option>
                <option value="task">任务密钥</option>
                <option value="work">工作密钥</option>
                <option value="app">应用密钥</option>
              </select>
              <select value={keyEnabled} onChange={(e) => setKeyEnabled(e.target.value)} className="form-select">
                <option value="">全部状态</option>
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
              <button onClick={() => { setKeySearch(''); setKeyKeyType(''); setKeyEnabled(''); setKeyPage(1); }} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">重置</button>
            </div>
          ) : null}
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold text-theme-text-muted">
            {llmKeysLoading ? '加载中...' :`当前第 ${keyPage} 页，共 ${llmKeysTotal} 条`}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {(() => {
            const columns: DataTableColumn<typeof llmKeys[number]>[] = [
              {
                key: 'key_name',
                header: '名称',
                render: (item) => <div className="truncate font-bold text-theme-text-primary" title={item.description || '无备注'}>{item.key_name || `密钥 #${item.id}`}</div>,
              },
              {
                key: 'key_prefix',
                header: '前缀',
                render: (item) => <span className="font-mono text-xs text-theme-text-secondary">{item.key_prefix || '-'}</span>,
              },
              {
                key: 'key_type',
                header: '类型',
                render: (item) => <span className="text-theme-text-secondary">{getLlmKeyTypeLabel(item.key_type)}</span>,
              },
              {
                key: 'max_concurrency',
                header: '最大并发',
                render: (item) => <span className="text-theme-text-secondary">{item.max_concurrency || 0}</span>,
              },
              {
                key: 'scope',
                header: '身份范围',
                render: (item) => <span className="text-theme-text-secondary">{getLlmKeyScopeLabel(item)}</span>,
              },
              {
                key: 'enabled',
                header: '状态',
                render: (item) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-theme-elevated text-theme-text-muted'}`}>{item.enabled ? '启用' : '禁用'}</span>,
              },
              {
                key: 'updated_at',
                header: '更新时间',
                render: (item) => <span className="text-theme-text-secondary">{item.updated_at ? new Date(item.updated_at).toLocaleString('zh-CN') : '-'}</span>,
              },
              {
                key: 'actions',
                header: '操作',
                render: (item) => (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openLlmKeyModal(item)} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated">编辑</button>
                    <button onClick={() => openLlmKeyDetail(item.id)} className="rounded-lg bg-theme-elevated px-2 py-1 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated">查看</button>
                    <button onClick={() => deleteLlmKey(item)} className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-200"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ),
              },
            ];
            return (
              <DataTable
                columns={columns}
                data={llmKeys}
                rowKey={(item) => String(item.id)}
                loading={llmKeysLoading}
                empty="暂无调用密钥"
                minWidth={1000}
              />
            );
          })()}
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-between">
          <div className="text-sm text-theme-text-muted">共 {llmKeysTotal} 条</div>
          <div className="flex items-center gap-2">
            <select value={keyPageSize} onChange={(e) => { setKeyPageSize(Number(e.target.value)); setKeyPage(1); }} className="form-select">
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
            </select>
            <button disabled={keyPage <= 1} onClick={() => setKeyPage((v) => Math.max(1, v - 1))} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">上一页</button>
            <span className="text-sm font-bold text-theme-text-secondary">{keyPage}</span>
            <button disabled={keyPage * keyPageSize >= llmKeysTotal} onClick={() => setKeyPage((v) => v + 1)} className="rounded-xl bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">下一页</button>
          </div>
        </div>
          </section>
        </div>
      ), document.body) : null}

      {logDrawerOpen ? createPortal((
        <div className="fixed inset-0 z-[260]">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setLogDrawerOpen(false)} />
 <div className="absolute inset-0 h-full w-full overflow-hidden bg-theme-elevated">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-theme-border bg-theme-elevated px-6 py-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">日志抽屉</div>
                  <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">{logDrawerPreset?.title || '请求日志'}</h2>
                </div>
                <button onClick={() => setLogDrawerOpen(false)} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-6">{renderLogsSection()}</div>
            </div>
          </div>
        </div>
      ), document.body) : null}

      <AigwLogDetailsDialog
        open={detailOpen}
        log={selectedLog}
        onClose={() => setDetailOpen(false)}
        onCopy={copyText}
      />

      {replayOpen && replayResult ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-6">
 <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">日志重放结果</h3>
                <p className="mt-1 text-sm text-theme-text-muted">{replayResult.model_name} {'->'} {replayResult.actual_model_name || '-'}</p>
              </div>
              <button onClick={() => setReplayOpen(false)} className="rounded-lg bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary">关闭</button>
            </div>
            <div className="grid max-h-[calc(90vh-88px)] gap-4 overflow-auto p-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-theme-text-primary">
                  <span>Modified Request</span>
                  <button onClick={() => void copyText(replayResult.modified_request || '', '重放请求已复制')} className="rounded-xl bg-theme-elevated px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary">复制</button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface p-4 text-xs text-theme-text-primary">{formatJsonBlock(replayResult.modified_request)}</pre>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-theme-text-primary">
                  <span>New Response</span>
                  <button onClick={() => void copyText(replayResult.error || replayResult.new_response || '', '重放响应已复制')} className="rounded-xl bg-theme-elevated px-3 py-1.5 text-[11px] font-bold text-theme-text-secondary">复制</button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface p-4 text-xs text-theme-text-primary">{formatJsonBlock(replayResult.error || replayResult.new_response)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{editingLlmKeyId ? '编辑调用密钥' : '新建调用密钥'}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">{editingLlmKeyId ? '更新可变字段，任务边界与 key 类型保持后端约束。' : '为调用方创建一个虚拟访问密钥，并配置允许访问的算力池。'}</p>
              </div>
              <button onClick={resetLlmKeyForm} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">密钥名称<input value={llmKeyForm.key_name} onChange={(e) => setLlmKeyForm((v) => ({ ...v, key_name: e.target.value }))} className="form-input mt-1 w-full" /></label>
                <label className="block text-sm font-bold text-theme-text-secondary">密钥类型
                  <select value={llmKeyForm.key_type} disabled={Boolean(editingLlmKeyId)} onChange={(e) => setLlmKeyForm((v) => ({ ...v, key_type: e.target.value as 'task' | 'work' | 'app' }))} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted">
                    <option value="task">任务密钥</option>
                    <option value="work">工作密钥</option>
                    <option value="app">应用密钥</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">最大并发<input type="number" value={llmKeyForm.max_concurrency} onChange={(e) => setLlmKeyForm((v) => ({ ...v, max_concurrency: Number(e.target.value) || 0 }))} className="form-input mt-1 w-full" /></label>
                <label className="flex items-center gap-3 pt-8 text-sm font-bold text-theme-text-secondary"><input type="checkbox" checked={llmKeyForm.enabled} onChange={(e) => setLlmKeyForm((v) => ({ ...v, enabled: e.target.checked }))} />创建后立即启用</label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-theme-text-secondary">过期时间<input type="datetime-local" value={String(llmKeyForm.expires_at || '')} onChange={(e) => setLlmKeyForm((v) => ({ ...v, expires_at: e.target.value || null }))} className="form-input mt-1 w-full" /></label>
                {llmKeyForm.key_type === 'work' ? (
                  <label className="block text-sm font-bold text-theme-text-secondary">父任务密钥
                    <select value={String(llmKeyForm.parent_key_id || '')} disabled={Boolean(editingLlmKeyId)} onChange={(e) => {
                      const parentId = Number(e.target.value) || null;
                      const parent = taskKeys.find((item) => item.id === parentId) || null;
                      setLlmKeyForm((current) => ({
                        ...current,
                        parent_key_id: parentId,
                        task_id: parent?.task_id || '',
                      }));
                    }} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted">
                      <option value="">选择父任务密钥</option>
                      {taskKeys.map((item) => <option key={item.id} value={item.id}>{item.key_name} · {item.task_id}</option>)}
                    </select>
                  </label>
                ) : llmKeyForm.key_type === 'app' ? <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-muted">应用密钥直接绑定应用标识和授权算力池，不参与任务树继承。</div> : <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-muted">任务密钥可直接配置授权算力池；工作密钥会继承父任务密钥的任务边界。</div>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {llmKeyForm.key_type === 'app' ? (
                  <label className="block text-sm font-bold text-theme-text-secondary">应用 ID<input value={llmKeyForm.app_id} disabled={Boolean(editingLlmKeyId)} onChange={(e) => setLlmKeyForm((v) => ({ ...v, app_id: e.target.value }))} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted" /></label>
                ) : (
                  <label className="block text-sm font-bold text-theme-text-secondary">任务 ID<input value={llmKeyForm.task_id} disabled={llmKeyForm.key_type === 'work' || Boolean(editingLlmKeyId)} onChange={(e) => setLlmKeyForm((v) => ({ ...v, task_id: e.target.value }))} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted" /></label>
                )}
                {llmKeyForm.key_type === 'work' ? (
                  <label className="block text-sm font-bold text-theme-text-secondary">子任务 ID<input value={llmKeyForm.sub_task_id} disabled={Boolean(editingLlmKeyId)} onChange={(e) => setLlmKeyForm((v) => ({ ...v, sub_task_id: e.target.value }))} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted" /></label>
                ) : llmKeyForm.key_type === 'app' ? (
                  <label className="block text-sm font-bold text-theme-text-secondary">应用名称<input value={llmKeyForm.app_name} disabled={Boolean(editingLlmKeyId)} onChange={(e) => setLlmKeyForm((v) => ({ ...v, app_name: e.target.value }))} className="form-input mt-1 w-full disabled:bg-theme-elevated disabled:text-theme-text-muted" /></label>
                ) : (
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-muted">任务密钥不需要填写子任务 ID；如需限定到子任务，请创建工作密钥。</div>
                )}
              </div>
              <label className="block text-sm font-bold text-theme-text-secondary">允许访问的算力池
                <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-theme-border bg-theme-surface p-3">
                  {capacityPools.map((item) => {
                    const checked = llmKeyForm.capacity_pool_ids.includes(item.id);
                    return (
                      <label key={item.id} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${checked ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-elevated text-theme-text-secondary'} ${llmKeyForm.key_type === 'work' ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          disabled={llmKeyForm.key_type === 'work'}
                          onChange={(e) => setLlmKeyForm((current) => ({
                            ...current,
                            capacity_pool_ids: e.target.checked
                              ? [...current.capacity_pool_ids, item.id]
                              : current.capacity_pool_ids.filter((id) => id !== item.id),
                          }))}
                        />
                        {item.pool_name}
                      </label>
                    );
                  })}
                </div>
                {llmKeyForm.key_type === 'work' ? <div className="mt-2 text-xs text-theme-text-muted">工作密钥不能单独定义算力池范围，会继承父任务密钥授权。</div> : llmKeyForm.key_type === 'app' ? <div className="mt-2 text-xs text-theme-text-muted">应用密钥必须显式选择可访问的算力池。</div> : null}
              </label>
              <label className="block text-sm font-bold text-theme-text-secondary">备注<textarea value={llmKeyForm.description} onChange={(e) => setLlmKeyForm((v) => ({ ...v, description: e.target.value }))} className="form-textarea mt-1 min-h-24 w-full" /></label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={resetLlmKeyForm} className="btn-secondary">取消</button>
              <button onClick={submitLlmKey} disabled={saving} className="btn btn-primary disabled:opacity-50"><Save className="h-4 w-4" />{editingLlmKeyId ? '保存修改' : '创建密钥'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyResultOpen && createdLlmKeyMeta ? (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-theme-surface">
            <div className="border-b border-theme-border px-6 py-5">
              <h3 className="text-xl font-semibold text-theme-text-primary">调用密钥创建成功</h3>
              <p className="mt-1 text-sm text-theme-text-muted">完整密钥只会展示这一次，请立即保存。</p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-2xl bg-theme-surface px-4 py-3 text-sm">名称：<span className="font-semibold text-theme-text-primary">{createdLlmKeyMeta.key_name}</span></div>
              <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 font-mono text-sm text-theme-text-primary break-all">{createdLlmKeySecret || '-'}</div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-theme-border px-6 py-4">
              <button onClick={() => { navigator.clipboard?.writeText(createdLlmKeySecret || ''); }} className="rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary">复制密钥</button>
              <button onClick={() => { setLlmKeyResultOpen(false); setCreatedLlmKeyMeta(null); setCreatedLlmKeySecret(''); }} className="rounded-lg bg-theme-surface px-4 py-2.5 text-sm font-bold text-white">我已保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyDetailOpen && selectedLlmKey ? (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{selectedLlmKey.key_name ||`调用密钥 #${selectedLlmKey.id}`}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">完整密钥不会再次回显，如需替换请重新创建或轮换。</p>
              </div>
              <button onClick={() => setLlmKeyDetailOpen(false)} className="rounded-lg bg-theme-elevated p-2 text-theme-text-secondary hover:bg-theme-elevated"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 p-6 text-sm">
              <div className="rounded-2xl bg-theme-surface px-4 py-3">前缀：<span className="font-mono font-bold text-theme-text-primary">{selectedLlmKey.key_prefix || '-'}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">类型：<span className="font-bold text-theme-text-primary">{getLlmKeyTypeLabel(selectedLlmKey.key_type)}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">父任务密钥：<span className="font-bold text-theme-text-primary">{selectedLlmKey.parent_key_id ?`#${selectedLlmKey.parent_key_id}` : '-'}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">最大并发：<span className="font-bold text-theme-text-primary">{selectedLlmKey.max_concurrency || 0}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">身份范围：<span className="font-bold text-theme-text-primary">{getLlmKeyScopeLabel(selectedLlmKey)}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">应用标识：<span className="font-bold text-theme-text-primary">{selectedLlmKey.app_id ? (selectedLlmKey.app_name ? `${selectedLlmKey.app_name} / ${selectedLlmKey.app_id}` : selectedLlmKey.app_id) : '-'}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">过期时间：<span className="font-bold text-theme-text-primary">{formatDateTime(selectedLlmKey.expires_at)}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">授权算力池：<span className="font-bold text-theme-text-primary">{selectedLlmKey.capacity_pool_ids?.length ? selectedLlmKey.capacity_pool_ids.map((id) => capacityPools.find((pool) => pool.id === id)?.pool_name ||`#${id}`).join(' / ') : '-'}</span></div>
              <div className="rounded-2xl bg-theme-surface px-4 py-3">备注：<span className="font-bold text-theme-text-primary">{selectedLlmKey.description || '-'}</span></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
