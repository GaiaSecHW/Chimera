import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Play, Power, RefreshCw, RotateCcw, Square, AlertCircle, FileText } from 'lucide-react';
import { api } from '../../clients/api';
import { AppWorkflow, AppWorkflowLlmBindingRequest, AppWorkflowStatus, ServiceAccessInfo } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { AppWorkflowLlmBindingsEditor } from '../../components/orchestration/AppWorkflowLlmBindingsEditor';
import { PageHeader } from '../../design-system';

type DetailTab = 'overview' | 'config' | 'access' | 'logs';

export const AppInstanceDetailPage: React.FC<{
  instanceId: string;
  onBack: () => void;
}> = ({ instanceId, onBack }) => {
  const orchestrationApi = api.domains.orchestration;
  const [instance, setInstance] = useState<AppWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [logs, setLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [accessInfo, setAccessInfo] = useState<ServiceAccessInfo | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [operation, setOperation] = useState('');
  const [isEditingLlmBindings, setIsEditingLlmBindings] = useState(false);
  const [llmBindingsDraft, setLlmBindingsDraft] = useState<AppWorkflowLlmBindingRequest[]>([]);
  const [savingLlmBindings, setSavingLlmBindings] = useState(false);
  const [llmBindingsNotice, setLlmBindingsNotice] = useState<string | null>(null);
  const [refreshingData, setRefreshingData] = useState(false);

  useEffect(() => {
    loadInstance();
  }, [instanceId]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
    if (activeTab === 'access') {
      loadAccessData();
    }
  }, [activeTab, instanceId]);

  const loadInstance = async () => {
    setLoading(true);
    if (!instanceId) {
      setInstance(null);
      setLoading(false);
      return;
    }
    try {
      const data = await orchestrationApi.workflow.getAppWorkflow(instanceId);
      setInstance(data);
    } catch (error) {
      console.error('Failed to load app workflow:', error);
      setInstance(null);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await orchestrationApi.workflow.getAppWorkflowLogs(instanceId);
      setLogs(data.logs || '暂无日志');
    } catch (error: any) {
      setLogs(`日志加载失败: ${error.message}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadAccessData = async () => {
    setLoadingAccess(true);
    try {
      const access = await orchestrationApi.workflow.getAppWorkflowAccessInfo(instanceId);
      setAccessInfo(access);
    } catch (error) {
      console.error('Failed to load access info:', error);
      setAccessInfo(null);
    } finally {
      setLoadingAccess(false);
    }
  };

  const runOperation = async (label: string, action: () => Promise<any>) => {
    setOperation(label);
    try {
      await action();
      await loadInstance();
      if (activeTab === 'access') {
        await loadAccessData();
      }
    } catch (error: any) {
      alert(`${label}失败: ${error.message}`);
    } finally {
      setOperation('');
    }
  };

  const getAvailableActions = (status?: AppWorkflowStatus) => {
    if (!status) return [];
    if (status === 'pending') return ['initialize'];
    if (status === 'unready' || status === 'ready') return ['start', 'stop', 'sync', 'rebuild'];
    return [];
  };

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: '概览' },
    { id: 'config', label: '配置' },
    { id: 'access', label: '访问' },
    { id: 'logs', label: '日志' }
  ];

  const accessCards = useMemo(() => {
    if (!instance) return [];
    const displayHost = accessInfo?.ingress_accesses?.[0]?.host || accessInfo?.configured_ingress?.ingress_host || instance.ingress_host || '-';
    return [
      { label: 'Service', value: accessInfo?.name || instance.service_name || '-' },
      { label: '类型', value: accessInfo?.type || instance.service_type || '-' },
      { label: '命名空间', value: accessInfo?.namespace ||`chimera-${instance.project_id}` },
      { label: '域名', value: displayHost }
    ];
  }, [accessInfo, instance]);

  const primaryIngressAccess = useMemo(() => {
    const ingressItem = accessInfo?.ingress_accesses?.find((item) => !!item.url);
    if (ingressItem) return ingressItem;
    const fallbackItem = accessInfo?.access_urls?.find((item) => item.type === 'Ingress' && item.url);
    if (!fallbackItem) return null;
    return {
      host: fallbackItem.host,
      url: fallbackItem.url,
      ingress_name: fallbackItem.ingress_name,
      selected_ip: fallbackItem.selected_ip,
    };
  }, [accessInfo]);

  const hasIngressAccess = Boolean(primaryIngressAccess?.url);
  const llmBindings = useMemo(() => {
    if (!instance) return [];
    if (Array.isArray(instance.llm_bindings) && instance.llm_bindings.length > 0) {
      return instance.llm_bindings;
    }
    return instance.llm_binding ? [instance.llm_binding] : [];
  }, [instance]);

  useEffect(() => {
    if (!isEditingLlmBindings) {
      setLlmBindingsDraft(
        llmBindings.map((binding) => (
          binding.source === 'custom'
            ? { source: 'custom', config: binding.config }
            : { source: 'config_center', provider_key: binding.provider_key }
        ))
      );
    }
  }, [llmBindings, isEditingLlmBindings]);

  const handleSaveLlmBindings = async () => {
    for (const binding of llmBindingsDraft) {
      if (binding.source === 'config_center') {
        if (!String(binding.provider_key || '').trim()) {
          alert('请为配置中心绑定选择一个 LLM Provider');
          return;
        }
        continue;
      }
      const config = binding.config;
      if (!config?.provider_key || !config?.api_base || !config?.api_key || !config?.display_name || !config?.provider_type) {
        alert('自定义 LLM 配置缺少必要字段，请补全 provider_key、display_name、provider_type、api_base、api_key');
        return;
      }
    }

    setSavingLlmBindings(true);
    setLlmBindingsNotice(null);
    try {
      const updated = await orchestrationApi.workflow.updateAppWorkflow(instanceId, {
        llm_bindings: llmBindingsDraft,
      });
      setInstance(updated);
      setIsEditingLlmBindings(false);
      setLlmBindingsNotice('LLM 绑定已更新');
    } catch (error: any) {
      alert(`更新 LLM 绑定失败: ${error.message}`);
    } finally {
      setSavingLlmBindings(false);
    }
  };

  const handleRefreshDetail = async () => {
    if (refreshingData) return;
    setRefreshingData(true);
    try {
      try {
        await orchestrationApi.workflow.syncAppWorkflowStatus(instanceId);
      } catch (error) {
        console.warn('Failed to sync app workflow status before refresh:', error);
      }
      await loadInstance();
      if (activeTab === 'logs') {
        await loadLogs();
      }
      if (activeTab === 'access') {
        await loadAccessData();
      }
    } finally {
      setRefreshingData(false);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-400" size={32} /></div>;
  }

  if (!instance) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <AlertCircle className="mb-4 text-red-400" size={64} />
        <p className="font-medium text-theme-text-secondary">{instanceId ? '应用实例不存在' : '未获取到应用实例 ID，请返回列表重试'}</p>
        <button onClick={onBack} className="mt-4 px-6 py-3 font-medium text-blue-400 hover:text-blue-400">返回列表</button>
      </div>
    );
  }

  const actions = getAvailableActions(instance.status);
  const node = instance.node || {
    status: 'pending' as AppWorkflowStatus,
    name: '-',
    k8s_resource_type: '-',
    k8s_resource_name: '-',
    message: '',
    init_logs: '',
  };

  return (
    <div className="p-8">
      <PageHeader
        title={instance.name}
        description={instance.description || '暂无描述'}
        back={{ label: '返回实例列表', onClick: onBack }}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshDetail}
              disabled={!!operation || refreshingData}
              className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-4 py-2.5 font-bold text-theme-text-secondary hover:border-blue-500/20 hover:bg-blue-500/15 hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              title="刷新"
              aria-label="刷新"
            >
              <RefreshCw size={16} className={refreshingData ? 'animate-spin' : ''} />
            </button>
            {actions.includes('initialize') && <button onClick={() => runOperation('初始化', () => orchestrationApi.workflow.initializeAppWorkflow(instanceId, false))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-500 disabled:opacity-50">{operation === '初始化' ? <Loader2 className="animate-spin" size={16} /> : <Power size={16} />}初始化</button>}
            {actions.includes('start') && <button onClick={() => runOperation('启动', () => orchestrationApi.workflow.startAppWorkflow(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-500 disabled:opacity-50">{operation === '启动' ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}启动</button>}
            {actions.includes('stop') && <button onClick={() => runOperation('停止', () => orchestrationApi.workflow.stopAppWorkflow(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-500 disabled:opacity-50">{operation === '停止' ? <Loader2 className="animate-spin" size={16} /> : <Square size={16} />}停止</button>}
            {actions.includes('sync') && <button onClick={() => runOperation('同步状态', () => orchestrationApi.workflow.syncAppWorkflowStatus(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 font-bold text-white hover:bg-purple-500 disabled:opacity-50">{operation === '同步状态' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}同步状态</button>}
            {actions.includes('rebuild') && <button onClick={() => runOperation('强制重建', () => orchestrationApi.workflow.initializeAppWorkflow(instanceId, true))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white hover:bg-amber-500 disabled:opacity-50">{operation === '强制重建' ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}强制重建</button>}
          </div>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-6">
          <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">实例状态</div>
          <StatusBadge status={instance.status} />
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-6">
          <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">节点状态</div>
          <StatusBadge status={node.status} />
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-6">
          <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">应用模板</div>
          <div className="font-bold text-theme-text-primary">{instance.template_name || '-'}</div>
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-6">
          <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">Service名称</div>
          <div className="font-bold text-theme-text-primary">{instance.service_name || '-'}</div>
        </div>
      </div>

      <div className="mb-6 border-b border-theme-border">
        <div className="flex items-center gap-8">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`border-b-2 pb-4 text-sm font-bold transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-400' : 'border-transparent text-theme-text-muted hover:text-theme-text-secondary'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

 <div className="rounded-3xl border border-theme-border bg-theme-bg-app p-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">实例 ID</div>
                <div className="font-mono text-sm text-theme-text-primary">{instance.id}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">创建时间</div>
                <div className="text-sm text-theme-text-primary">{new Date(instance.created_at).toLocaleString('zh-CN')}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">项目 ID</div>
                <div className="font-mono text-sm text-theme-text-primary">{instance.project_id}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">工作流类型</div>
                <div className="text-sm text-theme-text-primary">{instance.workflow_type}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-theme-bg-app p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-black text-theme-text-primary">节点信息</h3>
                <StatusBadge status={node.status} />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div><div className="mb-1 text-xs text-theme-text-muted">节点名称</div><div className="font-bold text-theme-text-primary">{node.name}</div></div>
                <div><div className="mb-1 text-xs text-theme-text-muted">资源类型</div><div className="font-bold text-theme-text-primary">{node.k8s_resource_type || '-'}</div></div>
                <div><div className="mb-1 text-xs text-theme-text-muted">资源名称</div><div className="font-mono text-sm text-theme-text-primary">{node.k8s_resource_name || '-'}</div></div>
              </div>
              {node.message && <div className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-400">{node.message}</div>}
              {node.init_logs && <div className="mt-4"><div className="mb-2 text-xs font-black uppercase text-theme-text-muted">初始化日志摘要</div><pre className="max-h-64 overflow-auto rounded-2xl border border-theme-border bg-theme-bg-app p-4 text-xs text-theme-text-primary whitespace-pre-wrap">{node.init_logs}</pre></div>}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-8">
            <div>
              <h3 className="mb-4 text-lg font-black text-theme-text-primary">Service 端口</h3>
              <div className="rounded-2xl bg-theme-bg-app p-6">
                {instance.service_ports?.length ? instance.service_ports.map((port, index) => (
                  <div key={`${port.name}-${index}`} className="grid grid-cols-4 gap-4 border-t border-theme-border py-2 first:border-t-0">
                    <div className="text-sm text-theme-text-primary">{port.name}</div>
                    <div className="text-sm text-theme-text-primary">{port.port}</div>
                    <div className="text-sm text-theme-text-primary">{port.target_port}</div>
                    <div className="text-sm text-theme-text-primary">{port.protocol || 'TCP'}</div>
                  </div>
                )) : <div className="text-sm text-theme-text-muted">暂无端口配置</div>}
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-black text-theme-text-primary">环境变量</h3>
              <div className="rounded-2xl bg-theme-bg-app p-6">
                {instance.env_vars?.length ? instance.env_vars.map((env, index) => (
                  <div key={`${env.name}-${index}`} className="flex items-center justify-between border-t border-theme-border py-2 first:border-t-0">
                    <div className="font-mono text-sm text-theme-text-primary">{env.name}</div>
                    <div className="text-sm text-theme-text-secondary">{env.value}</div>
                  </div>
                )) : <div className="text-sm text-theme-text-muted">暂无环境变量</div>}
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-black text-theme-text-primary">LLM 配置绑定</h3>
              <div className="rounded-2xl bg-theme-bg-app p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-sm text-theme-text-muted">支持在实例详情里直接调整多个 LLM 绑定及配置文件注入。</div>
                  <div className="flex items-center gap-3">
                    {isEditingLlmBindings ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingLlmBindings(false);
                            setLlmBindingsDraft(
                              llmBindings.map((binding) => (
                                binding.source === 'custom'
                                  ? { source: 'custom', config: binding.config }
                                  : { source: 'config_center', provider_key: binding.provider_key }
                              ))
                            );
                            setLlmBindingsNotice(null);
                          }}
                          disabled={savingLlmBindings}
                          className="rounded-xl border border-theme-border bg-theme-bg-app px-4 py-2 text-sm font-bold text-theme-text-secondary hover:border-theme-border disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveLlmBindings}
                          disabled={savingLlmBindings}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {savingLlmBindings ? <Loader2 size={14} className="animate-spin" /> : null}
                          保存绑定
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingLlmBindings(true);
                          setLlmBindingsNotice(null);
                        }}
                        className="rounded-xl bg-theme-bg-app px-4 py-2 text-sm font-bold text-blue-400 hover:bg-blue-500/15"
                      >
                        编辑绑定
                      </button>
                    )}
                  </div>
                </div>

                {llmBindingsNotice && (
                  <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-400">
                    {llmBindingsNotice}
                  </div>
                )}

                {isEditingLlmBindings ? (
                  <AppWorkflowLlmBindingsEditor
                    value={llmBindingsDraft}
                    onChange={setLlmBindingsDraft}
                    disabled={savingLlmBindings}
                    showWrapper={false}
                    description="按顺序覆盖同名环境变量和同路径文件，支持在详情页直接修改并保存。"
                  />
                ) : llmBindings.length > 0 ? (
                  <div className="space-y-4">
                    {llmBindings.map((binding, index) => (
                      <div key={`${binding.provider_key}-${index}`} className="rounded-2xl border border-theme-border bg-theme-bg-app p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-black text-blue-400">#{index + 1}</span>
                            <span className="text-sm font-bold text-theme-text-primary">{binding.source === 'config_center' ? '配置中心选择' : '自定义配置'}</span>
                          </div>
                          <div className="text-xs text-theme-text-muted">
                            绑定时间：{binding.bound_at ? new Date(binding.bound_at).toLocaleString('zh-CN') : '-'}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div><div className="mb-1 text-xs text-theme-text-muted">Provider Key</div><div className="font-mono text-sm text-theme-text-primary">{binding.provider_key}</div></div>
                          <div><div className="mb-1 text-xs text-theme-text-muted">显示名</div><div className="text-sm text-theme-text-primary">{binding.config.display_name || '-'}</div></div>
                          <div><div className="mb-1 text-xs text-theme-text-muted">渠道类型</div><div className="text-sm text-theme-text-primary">{binding.config.provider_type || '-'}</div></div>
                          <div><div className="mb-1 text-xs text-theme-text-muted">模型</div><div className="text-sm text-theme-text-primary">{binding.config.model || '-'}</div></div>
                          <div><div className="mb-1 text-xs text-theme-text-muted">API Base</div><div className="break-all text-sm text-theme-text-primary">{binding.config.api_base || '-'}</div></div>
                          <div><div className="mb-1 text-xs text-theme-text-muted">文件注入</div><div className="text-sm text-theme-text-primary">{(binding.config.file_bindings || []).filter((item) => item.enabled).length} 个启用文件</div></div>
                        </div>
                        <div className="mt-4">
                          <div className="mb-2 text-xs font-black uppercase text-theme-text-muted">完整配置 JSON</div>
                          <pre className="max-h-[320px] overflow-auto rounded-2xl border border-theme-border bg-theme-bg-app p-4 text-xs text-theme-text-primary whitespace-pre-wrap">
                            {JSON.stringify(binding.config, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-theme-text-muted">当前实例未绑定 LLM 配置</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-black text-theme-text-primary">卷挂载</h3>
              <div className="rounded-2xl bg-theme-bg-app p-6">
                {instance.volume_mounts?.length ? instance.volume_mounts.map((mount, index) => (
                  <div key={`${mount.pvc_name}-${index}`} className="border-t border-theme-border py-3 first:border-t-0">
                    <div className="font-bold text-theme-text-primary">{mount.pvc_name}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">挂载路径：{mount.mount_path}</div>
                  </div>
                )) : <div className="text-sm text-theme-text-muted">暂无卷挂载</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'access' && (
          <div className="space-y-8">
            {loadingAccess ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={32} /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  {accessCards.map((card) => (
                    <div key={card.label} className="rounded-xl bg-theme-bg-app p-4">
                      <div className="text-[10px] font-black uppercase text-theme-text-muted">{card.label}</div>
                      <div className="mt-1 break-all text-sm font-bold text-theme-text-primary">{card.value}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-black text-theme-text-primary">访问方式</h3>
                  <button
                    disabled={!hasIngressAccess}
                    onClick={() => hasIngressAccess && window.open(primaryIngressAccess?.url || '', '_blank', 'noopener,noreferrer')}
                    className={`mb-4 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-colors ${
                      hasIngressAccess ? 'bg-emerald-600 hover:bg-emerald-500' : 'cursor-not-allowed bg-slate-300'
                    }`}
                  >
                    <ExternalLink size={16} />
                    访问服务
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-theme-text-primary">运行日志</h3>
              <button onClick={loadLogs} className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-400"><FileText size={16} />刷新日志</button>
            </div>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={32} /></div>
            ) : (
              <div className="max-h-[600px] overflow-auto rounded-2xl bg-theme-surface p-6">
                <pre className="whitespace-pre-wrap text-sm text-green-400">{logs || '暂无日志'}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
