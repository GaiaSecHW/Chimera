import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Globe, Loader2, Play, Power, RefreshCw, RotateCcw, Square, AlertCircle, FileText } from 'lucide-react';
import { api } from '../../clients/api';
import { AppWorkflow, AppWorkflowStatus, DomainBindingRecord, ServiceAccessInfo } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';

type DetailTab = 'overview' | 'config' | 'access' | 'logs';

export const AppInstanceDetailPage: React.FC<{
  instanceId: string;
  onBack: () => void;
}> = ({ instanceId, onBack }) => {
  const [instance, setInstance] = useState<AppWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [logs, setLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [accessInfo, setAccessInfo] = useState<ServiceAccessInfo | null>(null);
  const [domainBindings, setDomainBindings] = useState<DomainBindingRecord[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [operation, setOperation] = useState('');

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
    try {
      const data = await api.workflow.getAppWorkflow(instanceId);
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
      const data = await api.workflow.getAppWorkflowLogs(instanceId);
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
      const [access, bindings] = await Promise.all([
        api.workflow.getAppWorkflowAccessInfo(instanceId),
        api.workflow.listAppWorkflowDomainBindings(instanceId)
      ]);
      setAccessInfo(access);
      setDomainBindings(bindings);
    } catch (error) {
      console.error('Failed to load access info:', error);
      setAccessInfo(null);
      setDomainBindings([]);
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
      { label: '命名空间', value: accessInfo?.namespace || `secflow-${instance.project_id}` },
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

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
  }

  if (!instance) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <AlertCircle className="mb-4 text-red-400" size={64} />
        <p className="font-medium text-slate-600">应用实例不存在</p>
        <button onClick={onBack} className="mt-4 px-6 py-3 font-medium text-blue-600 hover:text-blue-700">返回列表</button>
      </div>
    );
  }

  const actions = getAvailableActions(instance.status);
  const primaryPort = instance.service_ports?.[0]?.port;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl p-2 transition-colors hover:bg-slate-100"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-3xl font-black text-slate-900">{instance.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{instance.description || '暂无描述'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {actions.includes('initialize') && <button onClick={() => runOperation('初始化', () => api.workflow.initializeAppWorkflow(instanceId, false))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-500 disabled:opacity-50">{operation === '初始化' ? <Loader2 className="animate-spin" size={16} /> : <Power size={16} />}初始化</button>}
          {actions.includes('start') && <button onClick={() => runOperation('启动', () => api.workflow.startAppWorkflow(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-500 disabled:opacity-50">{operation === '启动' ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}启动</button>}
          {actions.includes('stop') && <button onClick={() => runOperation('停止', () => api.workflow.stopAppWorkflow(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-500 disabled:opacity-50">{operation === '停止' ? <Loader2 className="animate-spin" size={16} /> : <Square size={16} />}停止</button>}
          {actions.includes('sync') && <button onClick={() => runOperation('同步状态', () => api.workflow.syncAppWorkflowStatus(instanceId))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 font-bold text-white hover:bg-purple-500 disabled:opacity-50">{operation === '同步状态' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}同步状态</button>}
          {actions.includes('rebuild') && <button onClick={() => runOperation('强制重建', () => api.workflow.initializeAppWorkflow(instanceId, true))} disabled={!!operation} className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white hover:bg-amber-500 disabled:opacity-50">{operation === '强制重建' ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}强制重建</button>}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase text-slate-500">实例状态</div>
          <StatusBadge status={instance.status} />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase text-slate-500">节点状态</div>
          <StatusBadge status={instance.node.status} />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase text-slate-500">应用模板</div>
          <div className="font-bold text-slate-900">{instance.template_name || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase text-slate-500">Service</div>
          <div className="font-bold text-slate-900">{instance.service_name || '-'}</div>
        </div>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <div className="flex items-center gap-8">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`border-b-2 pb-4 text-sm font-bold transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-500">实例 ID</div>
                <div className="font-mono text-sm text-slate-900">{instance.id}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-500">创建时间</div>
                <div className="text-sm text-slate-900">{new Date(instance.created_at).toLocaleString('zh-CN')}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-500">项目 ID</div>
                <div className="font-mono text-sm text-slate-900">{instance.project_id}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-500">工作流类型</div>
                <div className="text-sm text-slate-900">{instance.workflow_type}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">节点信息</h3>
                <StatusBadge status={instance.node.status} />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div><div className="mb-1 text-xs text-slate-400">节点名称</div><div className="font-bold text-slate-800">{instance.node.name}</div></div>
                <div><div className="mb-1 text-xs text-slate-400">资源类型</div><div className="font-bold text-slate-800">{instance.node.k8s_resource_type || '-'}</div></div>
                <div><div className="mb-1 text-xs text-slate-400">资源名称</div><div className="font-mono text-sm text-slate-800">{instance.node.k8s_resource_name || '-'}</div></div>
              </div>
              {instance.node.message && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{instance.node.message}</div>}
              {instance.node.init_logs && <div className="mt-4"><div className="mb-2 text-xs font-black uppercase text-slate-500">初始化日志摘要</div><pre className="max-h-64 overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-green-400 whitespace-pre-wrap">{instance.node.init_logs}</pre></div>}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-8">
            <div>
              <h3 className="mb-4 text-lg font-black text-slate-900">Service 端口</h3>
              <div className="rounded-2xl bg-slate-50 p-6">
                {instance.service_ports?.length ? instance.service_ports.map((port, index) => (
                  <div key={`${port.name}-${index}`} className="grid grid-cols-4 gap-4 border-t border-slate-200 py-2 first:border-t-0">
                    <div className="text-sm text-slate-900">{port.name}</div>
                    <div className="text-sm text-slate-900">{port.port}</div>
                    <div className="text-sm text-slate-900">{port.target_port}</div>
                    <div className="text-sm text-slate-900">{port.protocol || 'TCP'}</div>
                  </div>
                )) : <div className="text-sm text-slate-400">暂无端口配置</div>}
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-black text-slate-900">环境变量</h3>
              <div className="rounded-2xl bg-slate-50 p-6">
                {instance.env_vars?.length ? instance.env_vars.map((env, index) => (
                  <div key={`${env.name}-${index}`} className="flex items-center justify-between border-t border-slate-200 py-2 first:border-t-0">
                    <div className="font-mono text-sm text-slate-900">{env.name}</div>
                    <div className="text-sm text-slate-600">{env.value}</div>
                  </div>
                )) : <div className="text-sm text-slate-400">暂无环境变量</div>}
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-black text-slate-900">卷挂载</h3>
              <div className="rounded-2xl bg-slate-50 p-6">
                {instance.volume_mounts?.length ? instance.volume_mounts.map((mount, index) => (
                  <div key={`${mount.pvc_name}-${index}`} className="border-t border-slate-200 py-3 first:border-t-0">
                    <div className="font-bold text-slate-900">{mount.pvc_name}</div>
                    <div className="mt-1 text-xs text-slate-500">挂载路径：{mount.mount_path}</div>
                  </div>
                )) : <div className="text-sm text-slate-400">暂无卷挂载</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'access' && (
          <div className="space-y-8">
            {loadingAccess ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  {accessCards.map((card) => (
                    <div key={card.label} className="rounded-xl bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase text-slate-400">{card.label}</div>
                      <div className="mt-1 break-all text-sm font-bold text-slate-800">{card.value}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-black text-slate-900">访问方式</h3>
                  {primaryIngressAccess?.url && (
                    <button
                      onClick={() => window.open(primaryIngressAccess.url || '', '_blank', 'noopener,noreferrer')}
                      className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      <ExternalLink size={16} />
                      访问服务
                    </button>
                  )}
                  {!primaryIngressAccess?.url && instance.create_ingress && (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Ingress 已启用，正在等待初始化完成或访问地址同步。
                    </div>
                  )}
                  <div className="space-y-3">
                    {(accessInfo?.ingress_accesses || []).map((item, index) => (
                      <div key={`ingress-${index}`} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-bold text-slate-800">{item.host || '-'}</div>
                          <Globe size={16} className="text-emerald-600" />
                        </div>
                        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800">{item.url}<ExternalLink size={14} /></a>}
                      </div>
                    ))}
                    {(accessInfo?.access_urls || []).map((item, index) => (
                      <div key={`access-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-bold text-slate-800">{item.type}</div>
                          {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">{item.url}<ExternalLink size={14} /></a>}
                        </div>
                        {primaryPort && item.type === 'ClusterIP' && instance.service_name && (
                          <button onClick={() => window.open(api.k8s.proxyServiceUrl(instance.project_id, instance.service_name, item.port || primaryPort, item.path || '/'), '_blank')} className="mt-3 flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700">
                            <ExternalLink size={14} />
                            通过代理访问
                          </button>
                        )}
                      </div>
                    ))}
                    {!(accessInfo?.ingress_accesses?.length || accessInfo?.access_urls?.length) && <div className="text-sm text-slate-400">当前没有可用的访问入口。</div>}
                  </div>
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-black text-slate-900">Ingress 记录</h3>
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    应用实例勾选绑定 Ingress 后，会按当前 Service 自动生成域名并在初始化时创建，无需手动输入域名。
                  </div>
                  <div className="mt-4 space-y-3">
                    {domainBindings.map((binding) => (
                      <div key={binding.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-800">{binding.domain}</div>
                          <StatusBadge status={binding.binding_status} />
                        </div>
                        <div className="mt-2 text-xs text-slate-500">Ingress: {binding.ingress_name || '-'} | IP: {binding.ingress_ip || '-'}</div>
                        {binding.message && <div className="mt-2 text-xs text-slate-500">{binding.message}</div>}
                      </div>
                    ))}
                    {domainBindings.length === 0 && <div className="text-sm text-slate-400">暂无域名绑定记录。</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">运行日志</h3>
              <button onClick={loadLogs} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"><FileText size={16} />刷新日志</button>
            </div>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
            ) : (
              <div className="max-h-[600px] overflow-auto rounded-2xl bg-slate-900 p-6">
                <pre className="whitespace-pre-wrap text-sm text-green-400">{logs || '暂无日志'}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
