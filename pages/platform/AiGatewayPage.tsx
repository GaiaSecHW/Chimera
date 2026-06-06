import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, Pencil, Plus, RefreshCw, Save, TestTube2, Trash2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  AiGatewayBackendUnit,
  AiGatewayCapacityPool,
  AiGatewayCapacityPoolModelBinding,
  AiGatewayConnectionTestResult,
  AiGatewayLlmKey,
  AiGatewayLlmKeyCreatePayload,
  AiGatewayLlmKeyCreateResponse,
  AiGatewayLogDetail,
  AiGatewayLogListResponse,
  AiGatewayLogSummary,
  AiGatewayModelAlias,
  AiGatewayModelAliasBinding,
  AiGatewayProviderStat,
  AiGatewayReplayResponse,
} from '../../types/types';

type PageView = 'config' | 'keys';
type LogDrawerPreset = {
  title: string;
  model?: string;
  aliasId?: string;
  backendUnitId?: string;
};

const emptyAlias = (): Omit<AiGatewayModelAlias, 'id'> => ({
  alias_name: '',
  max_tokens_default: 8192,
  temperature_default: 0.7,
  enabled: true,
});

const emptyBackendUnit = (): Omit<AiGatewayBackendUnit, 'id'> => ({
  unit_code: '',
  provider_type: 'openai',
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

const emptyLlmKeyForm = (): AiGatewayLlmKeyCreatePayload => ({
  key_name: '',
  key_type: 'task',
  parent_key_id: null,
  max_concurrency: 0,
  task_id: '',
  sub_task_id: '',
  enabled: true,
  expires_at: null,
  description: '',
  model_alias_ids: [],
  task_bindings: [],
});

const emptyCapacityPool = (): Omit<AiGatewayCapacityPool, 'id'> => ({
  pool_name: '',
  enabled: true,
  description: '',
  created_at: '',
  updated_at: '',
});

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';
const formatJsonBlock = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

export const AiGatewayPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const { notify, feedbackNodes } = useUiFeedback();
  const loadDataRequestIdRef = useRef(0);
  const loadLogsRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageView, setPageView] = useState<PageView>('config');
  const [providerStats, setProviderStats] = useState<AiGatewayProviderStat[]>([]);
  const [modelAliases, setModelAliases] = useState<AiGatewayModelAlias[]>([]);
  const [backendUnits, setBackendUnits] = useState<AiGatewayBackendUnit[]>([]);
  const [bindings, setBindings] = useState<AiGatewayModelAliasBinding[]>([]);
  const [capacityPools, setCapacityPools] = useState<AiGatewayCapacityPool[]>([]);
  const [capacityPoolBindings, setCapacityPoolBindings] = useState<AiGatewayCapacityPoolModelBinding[]>([]);
  const [llmKeys, setLlmKeys] = useState<AiGatewayLlmKey[]>([]);
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [editingBackendUnitId, setEditingBackendUnitId] = useState<number | null>(null);
  const [editingBindingId, setEditingBindingId] = useState<number | null>(null);
  const [aliasForm, setAliasForm] = useState<Omit<AiGatewayModelAlias, 'id'>>(emptyAlias());
  const [backendUnitForm, setBackendUnitForm] = useState<Omit<AiGatewayBackendUnit, 'id'>>(emptyBackendUnit());
  const [bindingForm, setBindingForm] = useState<Omit<AiGatewayModelAliasBinding, 'id'>>(emptyBinding());
  const [capacityPoolForm, setCapacityPoolForm] = useState<Omit<AiGatewayCapacityPool, 'id'>>(emptyCapacityPool());
  const [llmKeyForm, setLlmKeyForm] = useState<AiGatewayLlmKeyCreatePayload>(emptyLlmKeyForm());
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
  const [logEndpoint, setLogEndpoint] = useState('');
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
  const [llmKeyModalOpen, setLlmKeyModalOpen] = useState(false);
  const [llmKeyResultOpen, setLlmKeyResultOpen] = useState(false);
  const [createdLlmKeySecret, setCreatedLlmKeySecret] = useState('');
  const [createdLlmKeyMeta, setCreatedLlmKeyMeta] = useState<AiGatewayLlmKey | null>(null);
  const [selectedLlmKey, setSelectedLlmKey] = useState<AiGatewayLlmKey | null>(null);
  const [llmKeyDetailOpen, setLlmKeyDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const aliasNameById = useMemo(() => new Map(modelAliases.map((item) => [item.id, item.alias_name])), [modelAliases]);
  const backendNameById = useMemo(() => new Map(backendUnits.map((item) => [item.id, `${item.model_name} · ${item.provider_type}`])), [backendUnits]);
  const providerStatByBackendId = useMemo(() => new Map(providerStats.map((item) => [Number(item.backend_unit_id || item.backend_config_id || 0), item])), [providerStats]);
  const logEndpoints = useMemo(() => Array.from(new Set(logs.map((item) => item.endpoint).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [logs]);
  const backendModels = useMemo(() => Array.from(new Set(backendUnits.map((item) => item.model_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [backendUnits]);
  const aliasOptions = useMemo(() => modelAliases.map((item) => ({ value: String(item.id), label: `${item.alias_name} (#${item.id})` })), [modelAliases]);
  const backendUnitOptions = useMemo(() => backendUnits.map((item) => ({ value: String(item.id), label: `${item.model_name} · ${item.provider_type} (#${item.id})` })), [backendUnits]);
  const aliasGroups = useMemo(() => modelAliases.map((alias) => {
    const groupBindings = bindings.filter((binding) => binding.model_alias_id === alias.id);
    const groupBackendUnits = groupBindings
      .map((binding) => backendUnits.find((unit) => unit.id === binding.backend_unit_id))
      .filter((item): item is AiGatewayBackendUnit => Boolean(item));
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
  const selectedAliasPoolBindings = useMemo(() => capacityPoolBindings.filter((item) => item.model_alias_id === selectedAliasId), [capacityPoolBindings, selectedAliasId]);
  const selectedAliasPools = useMemo(() => selectedAliasPoolBindings.map((binding) => ({
    binding,
    pool: capacityPools.find((pool) => pool.id === binding.capacity_pool_id) || null,
  })).filter((item) => item.pool), [capacityPools, selectedAliasPoolBindings]);
  const selectedAlias = useMemo(() => modelAliases.find((item) => item.id === selectedAliasId) || null, [modelAliases, selectedAliasId]);
  const selectedAliasBindings = useMemo(() => bindings.filter((item) => item.model_alias_id === selectedAliasId), [bindings, selectedAliasId]);

  useEffect(() => {
    if (!selectedAliasId && modelAliases[0]?.id) setSelectedAliasId(modelAliases[0].id);
    if (selectedAliasId && !modelAliases.some((item) => item.id === selectedAliasId)) {
      setSelectedAliasId(modelAliases[0]?.id || null);
    }
  }, [modelAliases, selectedAliasId]);

  const loadData = async () => {
    const requestId = ++loadDataRequestIdRef.current;
    setError('');
    try {
      const [providerItems, aliases, units, bindingItems, poolItems, poolBindingItems, llmKeyItems] = await Promise.all([
        platformApi.aigw.listProviderStats(),
        platformApi.aigw.listModelAliases(),
        platformApi.aigw.listBackendUnits(),
        platformApi.aigw.listBindings(),
        platformApi.aigw.listCapacityPools(),
        platformApi.aigw.listCapacityPoolBindings(),
        platformApi.aigw.listLlmKeys(),
      ]);
      if (requestId !== loadDataRequestIdRef.current) return;
      setProviderStats(Array.isArray(providerItems) ? providerItems : []);
      setModelAliases(Array.isArray(aliases) ? aliases : []);
      setBackendUnits(Array.isArray(units) ? units : []);
      setBindings(Array.isArray(bindingItems) ? bindingItems : []);
      setCapacityPools(Array.isArray(poolItems) ? poolItems : []);
      setCapacityPoolBindings(Array.isArray(poolBindingItems) ? poolBindingItems : []);
      setLlmKeys(Array.isArray(llmKeyItems) ? llmKeyItems : []);
    } catch (err: any) {
      if (requestId !== loadDataRequestIdRef.current) return;
      setError(err.message || '加载 AI 网关数据失败');
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
        ...(logEndpoint ? { endpoint: logEndpoint } : {}),
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
    logEndpoint,
    logTaskId,
    logSubTaskId,
    logStartDate,
    logEndDate,
  ]);

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

  const openBackendModal = (item?: AiGatewayBackendUnit) => {
    if (item) {
      setEditingBackendUnitId(item.id);
      setBackendUnitForm({
        unit_code: item.unit_code,
        provider_type: item.provider_type,
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
      setLogPage(1);
      setLogDrawerPreset(preset);
    } else {
      setLogDrawerPreset({ title: '全部请求日志' });
    }
    setLogDrawerOpen(true);
  };

  const resetAliasForm = () => {
    setEditingAliasId(null);
    setAliasForm(emptyAlias());
    setAliasModalOpen(false);
  };

  const resetBackendUnitForm = () => {
    setEditingBackendUnitId(null);
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
    setLlmKeyForm(emptyLlmKeyForm());
    setLlmKeyModalOpen(false);
  };

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
      if (editingBackendUnitId) {
        await platformApi.aigw.updateBackendUnit(editingBackendUnitId, backendUnitForm);
        notify('模型已更新', 'success');
      } else {
        await platformApi.aigw.createBackendUnit(backendUnitForm);
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

  const createPoolBindingForAlias = async (aliasId: number, capacityPoolId: number) => {
    setSaving(true);
    setError('');
    try {
      const existed = capacityPoolBindings.find((item) => item.model_alias_id === aliasId && item.capacity_pool_id === capacityPoolId);
      if (existed) {
        notify('该算力池已绑定到当前模型别名', 'info');
        return;
      }
      await platformApi.aigw.createCapacityPoolBinding({
        capacity_pool_id: capacityPoolId,
        model_alias_id: aliasId,
        priority: 0,
        enabled: true,
      });
      notify('绑定关系已创建', 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '创建绑定关系失败');
    } finally {
      setSaving(false);
      setDraggingBackendUnitId(null);
    }
  };

  const saveWorkspaceBinding = async (binding: AiGatewayCapacityPoolModelBinding) => {
    setSaving(true);
    setError('');
    try {
      await platformApi.aigw.updateCapacityPoolBinding(binding.id, {
        capacity_pool_id: binding.capacity_pool_id,
        model_alias_id: binding.model_alias_id,
        priority: binding.priority,
        enabled: binding.enabled,
      });
      notify('绑定关系已更新', 'success');
      setEditingWorkspaceBindingId(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || '更新绑定关系失败');
    } finally {
      setSaving(false);
    }
  };

  const removeWorkspaceBinding = async (binding: AiGatewayCapacityPoolModelBinding) => {
    const confirmed = await showConfirm({
      title: '解绑算力池',
      message: `确认解绑算力池绑定关系 #${binding.id} 吗？`,
      confirmText: '解绑',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.aigw.deleteCapacityPoolBinding(binding.id);
      notify('绑定关系已删除', 'success');
      await loadData();
    } catch (err: any) {
      setError(err.message || '删除绑定关系失败');
    }
  };

  const submitLlmKey = async () => {
    setSaving(true);
    setError('');
    try {
      if (!llmKeyForm.key_name.trim()) throw new Error('密钥名称不能为空');
      const payload: AiGatewayLlmKeyCreatePayload = {
        ...llmKeyForm,
        key_name: llmKeyForm.key_name.trim(),
        task_id: llmKeyForm.task_id.trim(),
        sub_task_id: llmKeyForm.sub_task_id.trim(),
        description: llmKeyForm.description.trim(),
        parent_key_id: llmKeyForm.parent_key_id || null,
        expires_at: llmKeyForm.expires_at || null,
      };
      const response = await platformApi.aigw.createLlmKey(payload) as AiGatewayLlmKeyCreateResponse;
      setCreatedLlmKeyMeta(response?.key || null);
      setCreatedLlmKeySecret(String(response?.secret || ''));
      setLlmKeyResultOpen(true);
      notify('调用密钥已创建', 'success');
      resetLlmKeyForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || '创建调用密钥失败');
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
      message: `确认删除调用密钥 ${item.key_name} 吗？`,
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
      message: `确认删除算力池 ${pool.pool_name} 吗？`,
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
      message: `确认删除 ${label} 吗？`,
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
      const result = await platformApi.aigw.testBackendUnit(id);
      setTestResult(result || null);
      if (result?.success || result?.reachable) {
        notify('连通性测试成功', 'success');
      } else {
        setError(result?.error_message || result?.error || '连通性测试失败');
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
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">日志工作区</div>
          <h2 className="mt-2 text-xl font-black text-slate-900">请求日志</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={logAutoRefresh} onChange={(e) => setLogAutoRefresh(e.target.checked)} />
            自动刷新
          </label>
          <button onClick={() => { setLogPage(1); void loadLogs(); }} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">刷新日志</button>
        </div>
      </div>

      <div className="mb-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">筛选条件</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input value={logModel} onChange={(e) => setLogModel(e.target.value)} placeholder="公开模型" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
        <select value={logBackendModel} onChange={(e) => setLogBackendModel(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
          <option value="">后端模型</option>
          {backendModels.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={logAliasId} onChange={(e) => setLogAliasId(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
          <option value="">模型别名</option>
          {aliasOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={logBackendUnitId} onChange={(e) => setLogBackendUnitId(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
          <option value="">模型</option>
          {backendUnitOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={logEndpoint} onChange={(e) => setLogEndpoint(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
          <option value="">Endpoint</option>
          {logEndpoints.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input value={logTaskId} onChange={(e) => setLogTaskId(e.target.value)} placeholder="任务 ID" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
        <input value={logSubTaskId} onChange={(e) => setLogSubTaskId(e.target.value)} placeholder="子任务 ID" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
        <input type="datetime-local" value={logStartDate} onChange={(e) => setLogStartDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
        <input type="datetime-local" value={logEndDate} onChange={(e) => setLogEndDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { setLogPage(1); void loadLogs(); }} disabled={logsLoading} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">查询</button>
          <button onClick={() => { setLogModel(''); setLogBackendModel(''); setLogAliasId(''); setLogBackendUnitId(''); setLogEndpoint(''); setLogTaskId(''); setLogSubTaskId(''); setLogStartDate(''); setLogEndDate(''); setLogPage(1); void loadLogs(); }} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">重置</button>
        </div>
        <div className="text-xs font-bold text-slate-400">
          {logsLoading ? '日志加载中...' : `当前第 ${logPage} 页，共 ${logsTotal} 条`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-3 font-bold">时间</th>
              <th className="px-3 py-3 font-bold">模型</th>
              <th className="px-3 py-3 font-bold">任务</th>
              <th className="px-3 py-3 font-bold">别名 / 单元</th>
              <th className="px-3 py-3 font-bold">状态</th>
              <th className="px-3 py-3 font-bold">延迟</th>
              <th className="px-3 py-3 font-bold">请求预览</th>
              <th className="px-3 py-3 font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100">
                <td className="px-3 py-3 text-slate-700">{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-3">
                  <div className="font-bold text-slate-900">{log.model_name || '-'}</div>
                  <div className="text-xs text-slate-500">{log.backend_model_name || '-'}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <div className="font-mono text-xs">{log.task_id || '-'}</div>
                  <div className="font-mono text-[11px] text-slate-400">{log.sub_task_id || '-'}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">A{log.model_alias_id || '-'} / U{log.backend_unit_id || '-'}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${log.status_code >= 200 && log.status_code < 300 ? 'bg-emerald-100 text-emerald-700' : log.status_code >= 400 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{log.status_code || '-'}</span>
                    <span className="text-xs text-slate-500">{log.is_stream ? 'stream' : 'json'}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-700">{log.response_time || 0} ms / 首 Token {log.first_token_latency || 0} ms</td>
                <td className="max-w-[360px] px-3 py-3 text-slate-700"><div className="truncate" title={log.request_preview}>{log.request_preview || '-'}</div></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openLogDetail(log.id)} disabled={detailLoading} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"><Eye className="h-3.5 w-3.5" /></button>
                    <button onClick={() => replayLog(log.id)} disabled={replayingLogId === log.id} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${replayingLogId === log.id ? 'animate-spin' : ''}`} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!logs.length && !logsLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">暂无日志</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-sm text-slate-500">共 {logsTotal} 条</div>
        <div className="flex items-center gap-2">
          <button onClick={clearLogs} className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-200">清空日志</button>
          <select value={logPageSize} onChange={(e) => { setLogPageSize(Number(e.target.value)); setLogPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
          </select>
          <button disabled={logPage <= 1} onClick={() => setLogPage((v) => Math.max(1, v - 1))} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">上一页</button>
          <span className="text-sm font-bold text-slate-700">{logPage}</span>
          <button disabled={logPage * logPageSize >= logsTotal} onClick={() => setLogPage((v) => v + 1)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-6 p-8">
      {feedbackNodes}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">AI 网关</h1>
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}
      {testResult ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          测试结果：{testResult.message || testResult.error_message || testResult.error || (testResult.success || testResult.reachable ? 'success' : 'failed')}
          {typeof testResult.latency_ms === 'number' ? ` · ${testResult.latency_ms} ms` : ''}
          {typeof testResult.status_code === 'number' ? ` · HTTP ${testResult.status_code}` : ''}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-sm">
        {[
          { id: 'config', label: '模型配置' },
          { id: 'keys', label: '调用密钥' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPageView(tab.id as PageView)}
            className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition ${pageView === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {pageView === 'config' ? (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">模型配置工作台</h2>
            <p className="mt-1 text-sm text-slate-500">左侧选别名，中间配绑定，右侧维护算力池和池内模型。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => openAliasModal()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
              <Plus className="h-4 w-4" />
              新建模型别名
            </button>
            <button onClick={() => openCapacityPoolModal()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
              <Plus className="h-4 w-4" />
              新建算力池
            </button>
            <button onClick={() => openLogsDrawer()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
              <FileText className="h-4 w-4" />
              查看日志
            </button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[240px,1fr,360px]">
          <aside className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">别名列</div>
              <h3 className="mt-1 text-lg font-black text-slate-900">模型别名</h3>
            </div>
            <div className="mt-4 space-y-2">
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
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="font-black">{group.alias.alias_name}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{group.bindings.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAliasModal(group.alias);
                          }}
                          className={`rounded-xl p-1.5 ${active ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                          aria-label={`编辑模型别名 ${group.alias.alias_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteItem('alias', group.alias.id, `模型别名 ${group.alias.alias_name}`);
                          }}
                          className="rounded-xl bg-rose-100 p-1.5 text-rose-700 hover:bg-rose-200"
                          aria-label={`删除模型别名 ${group.alias.alias_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!aliasGroups.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">暂无模型别名</div> : null}
            </div>
          </aside>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">绑定区</div>
                <h3 className="mt-1 text-lg font-black text-slate-900">{selectedAlias ? `${selectedAlias.alias_name} 的绑定算力池` : '请选择模型别名'}</h3>
              </div>
            </div>
            <div
              onDragOver={(e) => {
                if (!selectedAliasId) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!selectedAliasId) return;
                const capacityPoolId = Number(e.dataTransfer.getData('text/capacity-pool-id') || 0);
                if (!capacityPoolId) return;
                void createPoolBindingForAlias(selectedAliasId, capacityPoolId);
              }}
              className={`mt-4 min-h-[420px] rounded-[1.5rem] border-2 border-dashed p-4 ${selectedAliasId ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-slate-50/60'}`}
            >
              {selectedAliasId ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedAliasPools.map(({ binding, pool }) => {
                    if (!pool) return null;
                    const poolUnits = backendUnits.filter((unit) => unit.description?.includes(`所属算力池：${pool.pool_name}`));
                    const poolStats = poolUnits
                      .map((unit) => providerStatByBackendId.get(unit.id))
                      .filter(Boolean);
                    const editing = editingWorkspaceBindingId === binding.id;
                    return (
                      <div key={binding.id} className="rounded-[1.25rem] border border-slate-200 bg-white p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-slate-900">{pool.pool_name}</div>
                            <div className="mt-1 text-xs text-slate-500">{pool.enabled ? '启用中' : '已禁用'}</div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${binding.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{binding.enabled ? 'on' : 'off'}</span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                          {editing ? (
                            <label className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              优先级
                              <input
                                type="number"
                                value={binding.priority}
                                onChange={(e) => setCapacityPoolBindings((items) => items.map((item) => item.id === binding.id ? { ...item, priority: Number(e.target.value) || 0 } : item))}
                                className="ml-2 w-16 bg-transparent outline-none"
                              />
                            </label>
                          ) : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">优先级 {binding.priority}</span>}
                          <label className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            <input
                              type="checkbox"
                              checked={binding.enabled}
                              onChange={(e) => setCapacityPoolBindings((items) => items.map((item) => item.id === binding.id ? { ...item, enabled: e.target.checked } : item))}
                              className="mr-1"
                            />
                            启用
                          </label>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold text-slate-400">池内模型</div><div className="mt-0.5 font-black text-slate-900">{poolUnits.length}</div></div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold text-slate-400">活跃统计</div><div className="mt-0.5 font-black text-slate-900">{poolStats.length}</div></div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {editing ? (
                            <button onClick={() => void saveWorkspaceBinding(binding)} className="rounded-xl bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white">保存绑定</button>
                          ) : (
                            <button onClick={() => setEditingWorkspaceBindingId(binding.id)} className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">编辑</button>
                          )}
                          <button onClick={() => void removeWorkspaceBinding(binding)} className="rounded-xl bg-rose-100 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">解绑</button>
                          <button onClick={() => openLogsDrawer({ title: `${pool.pool_name} 的请求日志`, aliasId: String(binding.model_alias_id) })} className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">日志</button>
                        </div>
                      </div>
                    );
                  })}
                  {!selectedAliasPools.length ? (
                    <div className="col-span-full rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-500">
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-slate-500">请先从左侧选择一个模型别名</div>
              )}
            </div>
          </section>

          <aside className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">模型库</div>
              <h3 className="mt-1 text-lg font-black text-slate-900">真实算力池</h3>
            </div>
            <div className="mt-4 space-y-4">
              {capacityPools.map((pool) => (
                <div
                  key={pool.id}
                  className="rounded-[1.25rem] border border-slate-200 bg-white p-3"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-900">{pool.pool_name}</div>
                      <div className="text-xs font-bold text-slate-400">{pool.enabled ? '启用中' : '已禁用'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBackendUnitForm((current) => ({
                            ...current,
                            provider_type: current.provider_type || 'openai',
                            description: current.description || `所属算力池：${pool.pool_name}`,
                          }));
                          setEditingBackendUnitId(null);
                          setBackendModalOpen(true);
                        }}
                        className="rounded-xl bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                        aria-label={`向算力池 ${pool.pool_name} 添加模型`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openCapacityPoolModal(pool)}
                        className="rounded-xl bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                        aria-label={`编辑算力池 ${pool.pool_name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCapacityPool(pool)}
                        className="rounded-xl bg-rose-100 p-1.5 text-rose-700 hover:bg-rose-200"
                        aria-label={`删除算力池 ${pool.pool_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {backendUnits.filter((unit) => unit.description?.includes(`所属算力池：${pool.pool_name}`)).map((unit) => (
                      <div
                        key={unit.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingBackendUnitId(unit.id);
                          e.dataTransfer.setData('text/capacity-pool-id', String(pool.id));
                          e.dataTransfer.setData('text/backend-unit-id', String(unit.id));
                        }}
                        onDragEnd={() => setDraggingBackendUnitId(null)}
                        className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 ${draggingBackendUnitId === unit.id ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">{unit.model_name}</div>
                            <div className="mt-1 text-xs text-slate-500">{unit.provider_type}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openBackendModal(unit);
                              }}
                              className="rounded-xl bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                              aria-label={`编辑模型 ${unit.model_name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteItem('backend', unit.id, `模型 ${unit.model_name}`);
                              }}
                              className="rounded-xl bg-rose-100 p-1.5 text-rose-700 hover:bg-rose-200"
                              aria-label={`删除模型 ${unit.model_name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {unit.supports_chat_completions || unit.supports_responses || unit.supports_messages ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {unit.supports_chat_completions ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Chat</span> : null}
                            {unit.supports_responses ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">Responses</span> : null}
                            {unit.supports_messages ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Messages</span> : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
      ) : null}

      {aliasModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{editingAliasId ? '编辑模型别名' : '新增模型别名'}</h3>
                <p className="mt-1 text-sm text-slate-500">管理模型别名的默认参数与启停状态。</p>
                {editingAliasId ? <div className="mt-2 text-xs font-bold text-slate-400">当前编辑对象：模型别名 #{editingAliasId}</div> : null}
              </div>
              <button onClick={resetAliasForm} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">模型别名默认参数</div>
              <label className="block text-sm font-bold text-slate-600">模型别名<input value={aliasForm.alias_name} onChange={(e) => setAliasForm((v) => ({ ...v, alias_name: e.target.value }))} placeholder="例如 gpt-4o-mini / deepseek-chat" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">Max Tokens<input type="number" value={aliasForm.max_tokens_default} onChange={(e) => setAliasForm((v) => ({ ...v, max_tokens_default: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">Temperature<input type="number" step="0.1" value={aliasForm.temperature_default} onChange={(e) => setAliasForm((v) => ({ ...v, temperature_default: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              </div>
              <p className="-mt-1 text-xs text-slate-400">这里配置的是公开模型别名的默认推理参数，供上游请求未显式传值时回退使用。</p>
              <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={aliasForm.enabled} onChange={(e) => setAliasForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={resetAliasForm} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">取消</button>
              <button onClick={submitAlias} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {backendModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{editingBackendUnitId ? '编辑模型' : '新增模型'}</h3>
                <p className="mt-1 text-sm text-slate-500">配置模型、Provider、地址和容量上限。</p>
                {editingBackendUnitId ? <div className="mt-2 text-xs font-bold text-slate-400">当前编辑对象：模型 #{editingBackendUnitId}{backendUnitForm.api_key_fingerprint ? ` · 指纹 ${backendUnitForm.api_key_fingerprint}` : ''}</div> : null}
              </div>
              <button onClick={resetBackendUnitForm} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">模型</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">提供方类型<input value={backendUnitForm.provider_type} onChange={(e) => setBackendUnitForm((v) => ({ ...v, provider_type: e.target.value }))} placeholder="默认 openai" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">模型名称<input value={backendUnitForm.model_name} onChange={(e) => setBackendUnitForm((v) => ({ ...v, model_name: e.target.value }))} placeholder="实际下游模型名" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">API 地址<input value={backendUnitForm.api_base_url} onChange={(e) => setBackendUnitForm((v) => ({ ...v, api_base_url: e.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              </div>
              <p className="-mt-1 text-xs text-slate-400">一个模型对应一个真实的接入点，容量、优先级和密钥都在这里维护。</p>
              <label className="block text-sm font-bold text-slate-600">API 密钥<input type="password" value={backendUnitForm.api_key_ciphertext || ''} onChange={(e) => setBackendUnitForm((v) => ({ ...v, api_key_ciphertext: e.target.value }))} placeholder={editingBackendUnitId ? '留空则保持现有 API 密钥' : ''} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">最大并发<input type="number" value={backendUnitForm.total_max_concurrency} onChange={(e) => setBackendUnitForm((v) => ({ ...v, total_max_concurrency: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">默认优先级<input type="number" value={backendUnitForm.priority_default} onChange={(e) => setBackendUnitForm((v) => ({ ...v, priority_default: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={backendUnitForm.supports_chat_completions} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_chat_completions: e.target.checked }))} />
                  支持 Chat
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={backendUnitForm.supports_responses} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_responses: e.target.checked }))} />
                  支持 Responses
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={backendUnitForm.supports_messages} onChange={(e) => setBackendUnitForm((v) => ({ ...v, supports_messages: e.target.checked }))} />
                  支持 Messages
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-600">描述<textarea value={backendUnitForm.description || ''} onChange={(e) => setBackendUnitForm((v) => ({ ...v, description: e.target.value }))} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={backendUnitForm.enabled} onChange={(e) => setBackendUnitForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={resetBackendUnitForm} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">取消</button>
              <button onClick={submitBackendUnit} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {bindingModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{editingBindingId ? '编辑绑定关系' : '新增绑定关系'}</h3>
                <p className="mt-1 text-sm text-slate-500">管理模型别名到模型的调度关系。</p>
                {editingBindingId ? <div className="mt-2 text-xs font-bold text-slate-400">当前编辑对象：绑定关系 #{editingBindingId}</div> : null}
              </div>
              <button onClick={resetBindingForm} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">绑定调度</div>
              <label className="block text-sm font-bold text-slate-600">模型别名
                <select value={bindingForm.model_alias_id} onChange={(e) => setBindingForm((v) => ({ ...v, model_alias_id: Number(e.target.value) }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none">
                  {modelAliases.map((item) => <option key={item.id} value={item.id}>{item.alias_name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-600">模型
                <select value={bindingForm.backend_unit_id} onChange={(e) => setBindingForm((v) => ({ ...v, backend_unit_id: Number(e.target.value) }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none">
                  {backendUnits.map((item) => <option key={item.id} value={item.id}>{item.model_name} · {item.provider_type}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">优先级<input type="number" value={bindingForm.priority} onChange={(e) => setBindingForm((v) => ({ ...v, priority: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">权重<input type="number" value={bindingForm.weight} onChange={(e) => setBindingForm((v) => ({ ...v, weight: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label>
              </div>
              <p className="-mt-1 text-xs text-slate-400">优先级决定优先调度顺序，权重用于同层级的流量分配。</p>
              <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={bindingForm.enabled} onChange={(e) => setBindingForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={resetBindingForm} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">取消</button>
              <button onClick={submitBinding} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {capacityPoolModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{editingCapacityPoolId ? '编辑算力池' : '新增算力池'}</h3>
                <p className="mt-1 text-sm text-slate-500">算力池是面向模型别名暴露的容量抽象层，一个池可承接多个模型。</p>
                {editingCapacityPoolId ? <div className="mt-2 text-xs font-bold text-slate-400">当前编辑对象：算力池 #{editingCapacityPoolId}</div> : null}
              </div>
              <button onClick={resetCapacityPoolForm} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block text-sm font-bold text-slate-600">池名称<input value={capacityPoolForm.pool_name} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, pool_name: e.target.value }))} placeholder="例如 GPT-4o 生产池" className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
              <label className="block text-sm font-bold text-slate-600">描述<textarea value={capacityPoolForm.description} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, description: e.target.value }))} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
              <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={capacityPoolForm.enabled} onChange={(e) => setCapacityPoolForm((v) => ({ ...v, enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={resetCapacityPoolForm} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">取消</button>
              <button onClick={submitCapacityPool} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />保存算力池</button>
            </div>
          </div>
        </div>
      ) : null}

      {pageView === 'keys' ? (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">调用凭证</div>
            <h2 className="mt-2 text-xl font-black text-slate-900">调用密钥管理</h2>
          </div>
          <button onClick={() => setLlmKeyModalOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            新建调用密钥
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-bold">名称</th>
                <th className="px-3 py-3 font-bold">前缀</th>
                <th className="px-3 py-3 font-bold">类型</th>
                <th className="px-3 py-3 font-bold">最大并发</th>
                <th className="px-3 py-3 font-bold">任务范围</th>
                <th className="px-3 py-3 font-bold">状态</th>
                <th className="px-3 py-3 font-bold">更新时间</th>
                <th className="px-3 py-3 font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {llmKeys.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-3">
                    <div className="font-bold text-slate-900">{item.key_name || `密钥 #${item.id}`}</div>
                    <div className="text-xs text-slate-500">{item.description || '无备注'}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-slate-700">{item.key_prefix || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{item.key_type === 'task' ? '任务密钥' : item.key_type === 'work' ? '工作密钥' : item.key_type}</td>
                  <td className="px-3 py-3 text-slate-700">{item.max_concurrency || 0}</td>
                  <td className="px-3 py-3 text-slate-700">{item.task_id ? `${item.task_id}${item.sub_task_id ? ` / ${item.sub_task_id}` : ''}` : '-'}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.enabled ? '启用' : '禁用'}</span></td>
                  <td className="px-3 py-3 text-slate-700">{item.updated_at ? new Date(item.updated_at).toLocaleString('zh-CN') : '-'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openLlmKeyDetail(item.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">查看</button>
                      <button onClick={() => deleteLlmKey(item)} className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-200"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!llmKeys.length && !loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">暂无调用密钥</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {logDrawerOpen ? (
        <div className="fixed inset-0 z-[260]">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setLogDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[min(100vw,1180px)] overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">日志抽屉</div>
                  <h2 className="mt-2 text-xl font-black text-slate-900">{logDrawerPreset?.title || '请求日志'}</h2>
                </div>
                <button onClick={() => setLogDrawerOpen(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">{renderLogsSection()}</div>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen && selectedLog ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">日志详情 #{selectedLog.id}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedLog.model_name} · {selectedLog.backend_model_name || '-'}</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">关闭</button>
            </div>
            <div className="grid max-h-[calc(90vh-88px)] gap-0 overflow-auto lg:grid-cols-2">
              <div className="border-r border-slate-200 p-6">
                <div className="grid gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">时间: {formatDateTime(selectedLog.created_at)}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">状态: {selectedLog.status_code}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Endpoint: {selectedLog.endpoint || '-'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">任务: <span className="font-mono">{selectedLog.task_id || '-'}</span> / <span className="font-mono">{selectedLog.sub_task_id || '-'}</span></div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">别名 / 单元: A{selectedLog.model_alias_id || '-'} / U{selectedLog.backend_unit_id || '-'} / B{selectedLog.backend_config_id || '-'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">LLM Key: {selectedLog.llm_key_prefix || '-'} · Task Key: {selectedLog.task_key_prefix || '-'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">延迟: {selectedLog.response_time || 0} ms / 首 Token {selectedLog.first_token_latency || 0} ms / 平均 Token {Math.round(selectedLog.avg_token_latency || 0)} ms</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">流量: request {selectedLog.request_bytes || 0} B / response {selectedLog.response_bytes || 0} B / stream {selectedLog.stream_bytes || 0} B</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Tokens: prompt {selectedLog.prompt_tokens || 0}, completion {selectedLog.completion_tokens || 0}, total {selectedLog.total_tokens || 0}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Provider Cache: cached {selectedLog.provider_cached_tokens || 0} / hit {selectedLog.provider_cache_hit_tokens || 0} / miss {selectedLog.provider_cache_miss_tokens || 0}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Gateway Cache: {selectedLog.gateway_cache_hit ? 'hit' : 'miss'} {selectedLog.gateway_cache_key ? `· ${selectedLog.gateway_cache_key}` : ''}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">计费: {selectedLog.usage_source || '-'} / {selectedLog.pricing_version || '-'} / {typeof selectedLog.estimated_cost === 'number' ? selectedLog.estimated_cost : '-'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">上游: {selectedLog.backend_api_base_url || '-'}</div>
                </div>
              </div>
              <div className="grid gap-4 p-6">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-slate-800">
                    <span>Request</span>
                    <button onClick={() => void copyText(selectedLog.request || '', '请求内容已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">复制</button>
                  </div>
                  <pre className="max-h-[260px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(selectedLog.request)}</pre>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-slate-800">
                    <span>Response</span>
                    <button onClick={() => void copyText(selectedLog.response || selectedLog.stream_response || '', '响应内容已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">复制</button>
                  </div>
                  <pre className="max-h-[260px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(selectedLog.response || selectedLog.stream_response)}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {replayOpen && replayResult ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">日志重放结果</h3>
                <p className="mt-1 text-sm text-slate-500">{replayResult.model_name} {'->'} {replayResult.actual_model_name || '-'}</p>
              </div>
              <button onClick={() => setReplayOpen(false)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">关闭</button>
            </div>
            <div className="grid max-h-[calc(90vh-88px)] gap-4 overflow-auto p-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-slate-800">
                  <span>Modified Request</span>
                  <button onClick={() => void copyText(replayResult.modified_request || '', '重放请求已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">复制</button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(replayResult.modified_request)}</pre>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-slate-800">
                  <span>New Response</span>
                  <button onClick={() => void copyText(replayResult.error || replayResult.new_response || '', '重放响应已复制')} className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">复制</button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(replayResult.error || replayResult.new_response)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyModalOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">新建调用密钥</h3>
                <p className="mt-1 text-sm text-slate-500">为调用方创建一个虚拟访问密钥，并配置允许访问的模型别名。</p>
              </div>
              <button onClick={resetLlmKeyForm} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">密钥名称<input value={llmKeyForm.key_name} onChange={(e) => setLlmKeyForm((v) => ({ ...v, key_name: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">密钥类型
                  <select value={llmKeyForm.key_type} onChange={(e) => setLlmKeyForm((v) => ({ ...v, key_type: e.target.value as 'task' | 'work' }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none">
                    <option value="task">任务密钥</option>
                    <option value="work">工作密钥</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">最大并发<input type="number" value={llmKeyForm.max_concurrency} onChange={(e) => setLlmKeyForm((v) => ({ ...v, max_concurrency: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
                <label className="flex items-center gap-3 pt-8 text-sm font-bold text-slate-700"><input type="checkbox" checked={llmKeyForm.enabled} onChange={(e) => setLlmKeyForm((v) => ({ ...v, enabled: e.target.checked }))} />创建后立即启用</label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-600">任务 ID<input value={llmKeyForm.task_id} onChange={(e) => setLlmKeyForm((v) => ({ ...v, task_id: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
                <label className="block text-sm font-bold text-slate-600">子任务 ID<input value={llmKeyForm.sub_task_id} onChange={(e) => setLlmKeyForm((v) => ({ ...v, sub_task_id: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
              </div>
              <label className="block text-sm font-bold text-slate-600">允许访问的模型别名
                <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-slate-200 p-3">
                  {modelAliases.map((item) => {
                    const checked = llmKeyForm.model_alias_ids.includes(item.id);
                    return (
                      <label key={item.id} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={(e) => setLlmKeyForm((current) => ({
                            ...current,
                            model_alias_ids: e.target.checked
                              ? [...current.model_alias_ids, item.id]
                              : current.model_alias_ids.filter((id) => id !== item.id),
                          }))}
                        />
                        {item.alias_name}
                      </label>
                    );
                  })}
                </div>
              </label>
              <label className="block text-sm font-bold text-slate-600">备注<textarea value={llmKeyForm.description} onChange={(e) => setLlmKeyForm((v) => ({ ...v, description: e.target.value }))} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={resetLlmKeyForm} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">取消</button>
              <button onClick={submitLlmKey} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />创建密钥</button>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyResultOpen && createdLlmKeyMeta ? (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-xl font-black text-slate-900">调用密钥创建成功</h3>
              <p className="mt-1 text-sm text-slate-500">完整密钥只会展示这一次，请立即保存。</p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">名称：<span className="font-black text-slate-900">{createdLlmKeyMeta.key_name}</span></div>
              <div className="rounded-2xl bg-slate-950 px-4 py-4 font-mono text-sm text-slate-100 break-all">{createdLlmKeySecret || '-'}</div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button onClick={() => { navigator.clipboard?.writeText(createdLlmKeySecret || ''); }} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">复制密钥</button>
              <button onClick={() => { setLlmKeyResultOpen(false); setCreatedLlmKeyMeta(null); setCreatedLlmKeySecret(''); }} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">我已保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {llmKeyDetailOpen && selectedLlmKey ? (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{selectedLlmKey.key_name || `调用密钥 #${selectedLlmKey.id}`}</h3>
                <p className="mt-1 text-sm text-slate-500">完整密钥不会再次回显，如需替换请重新创建或轮换。</p>
              </div>
              <button onClick={() => setLlmKeyDetailOpen(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 p-6 text-sm">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">前缀：<span className="font-mono font-bold text-slate-900">{selectedLlmKey.key_prefix || '-'}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">类型：<span className="font-bold text-slate-900">{selectedLlmKey.key_type === 'task' ? '任务密钥' : selectedLlmKey.key_type === 'work' ? '工作密钥' : selectedLlmKey.key_type}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">最大并发：<span className="font-bold text-slate-900">{selectedLlmKey.max_concurrency || 0}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">任务范围：<span className="font-bold text-slate-900">{selectedLlmKey.task_id ? `${selectedLlmKey.task_id}${selectedLlmKey.sub_task_id ? ` / ${selectedLlmKey.sub_task_id}` : ''}` : '-'}</span></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">备注：<span className="font-bold text-slate-900">{selectedLlmKey.description || '-'}</span></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
