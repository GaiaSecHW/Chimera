import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Box, CheckCircle, ChevronLeft, ChevronRight, Loader2, Play, Plus, RefreshCw, RotateCcw, Search, StopCircle, Trash2, XCircle } from 'lucide-react';
import { api } from '../../clients/api';
import { AppTemplate, AppWorkflow, AppWorkflowStatus } from '../../types/types';

type CreateStep = 'select-template' | 'fill-form';

export const AppInstancePage: React.FC<{
  projectId: string;
  onNavigateToDetail: (id: string) => void;
}> = ({ projectId, onNavigateToDetail }) => {
  const [instances, setInstances] = useState<AppWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('select-template');
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AppTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template_id: '',
    service_name: '',
    service_ports: [{ name: 'http', port: 80, target_port: 80, protocol: 'TCP' }],
    service_type: 'ClusterIP' as 'ClusterIP' | 'LoadBalancer' | 'NodePort',
    replicas: 1
  });
  const [inputEnvVarValues, setInputEnvVarValues] = useState<Record<string, string>>({});
  const [inputVolumeMountConfigs, setInputVolumeMountConfigs] = useState<Record<string, { pvc_name: string; sub_path: string; read_only: boolean }>>({});
  const [pvcList, setPvcList] = useState<Array<{ pvc_name: string; resource_name?: string }>>([]);
  const [enableIngress, setEnableIngress] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUninitModalOpen, setIsUninitModalOpen] = useState(false);
  const [uninitializingId, setUninitializingId] = useState<string | null>(null);
  const [isUninitializing, setIsUninitializing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!projectId) return;
    loadInstances();
  }, [projectId, statusFilter]);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const res = await api.workflow.listAppWorkflows({ project_id: projectId, status: statusFilter || undefined });
      setInstances(res.items || []);
    } catch (error) {
      console.error('Failed to load app workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInstances = useMemo(() => {
    const keyword = searchTerm.toLowerCase();
    return instances.filter((instance) =>
      instance.name.toLowerCase().includes(keyword) ||
      instance.id.toLowerCase().includes(keyword) ||
      instance.template_name?.toLowerCase().includes(keyword)
    );
  }, [instances, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredInstances.length / pageSize));
  const paginatedInstances = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInstances.slice(start, start + pageSize);
  }, [filteredInstances, currentPage, pageSize]);

  const resetForm = () => {
    setCreateStep('select-template');
    setSelectedTemplate(null);
    setFormData({
      name: '',
      description: '',
      template_id: '',
      service_name: '',
      service_ports: [{ name: 'http', port: 80, target_port: 80, protocol: 'TCP' }],
      service_type: 'ClusterIP',
      replicas: 1
    });
    setInputEnvVarValues({});
    setInputVolumeMountConfigs({});
    setEnableIngress(false);
    setPvcList([]);
  };

  const openCreateModal = async () => {
    setIsModalOpen(true);
    setLoadingTemplates(true);
    resetForm();
    try {
      const res = await api.workflow.listAppTemplates({ project_id: projectId });
      setTemplates(res.items || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      alert('加载模板列表失败');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    try {
      const template = await api.workflow.getAppTemplate(templateId);
      setSelectedTemplate(template);
      const envVars: Record<string, string> = {};
      const volumeConfigs: Record<string, { pvc_name: string; sub_path: string; read_only: boolean }> = {};
      template.containers.forEach((container) => {
        container.input_env_vars?.forEach((envVar) => {
          envVars[`${container.name}.${envVar.name}`] = envVar.default_value || '';
        });
        container.input_volume_mounts?.forEach((mount) => {
          volumeConfigs[`${container.name}.${mount.mount_path}`] = { pvc_name: '', sub_path: '', read_only: mount.read_only ?? true };
        });
      });
      setInputEnvVarValues(envVars);
      setInputVolumeMountConfigs(volumeConfigs);
      setFormData((current) => ({
        ...current,
        template_id: templateId,
        service_ports: template.service_ports && template.service_ports.length > 0 ? template.service_ports : current.service_ports,
        service_type: template.service_type || current.service_type,
        replicas: template.replicas || current.replicas,
        service_name: current.service_name || template.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
      }));
      const pvcRes = await api.resources.getPVCs(projectId);
      setPvcList(pvcRes.pvcs || []);
      setCreateStep('fill-form');
    } catch (error) {
      console.error('Failed to load template details:', error);
      alert('加载模板详情失败');
    }
  };

  const handleInitialize = async (id: string, force = false) => {
    try {
      await api.workflow.initializeAppWorkflow(id, force);
      showToast(force ? '强制初始化成功' : '初始化成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`初始化失败: ${error.message}`, 'error');
    }
  };

  const handleUninitialize = async () => {
    if (!uninitializingId) return;
    setIsUninitializing(true);
    try {
      await api.workflow.uninitializeAppWorkflow(uninitializingId);
      setIsUninitModalOpen(false);
      setUninitializingId(null);
      showToast('反初始化成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`反初始化失败: ${error.message}`, 'error');
    } finally {
      setIsUninitializing(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.workflow.startAppWorkflow(id);
      showToast('启动成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`启动失败: ${error.message}`, 'error');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.workflow.stopAppWorkflow(id);
      showToast('停止成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`停止失败: ${error.message}`, 'error');
    }
  };

  const handleSyncStatus = async (id: string) => {
    try {
      await api.workflow.syncAppWorkflowStatus(id);
      showToast('同步成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`同步失败: ${error.message}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.workflow.deleteAppWorkflow(deletingId);
      setIsDeleteModalOpen(false);
      setDeletingId(null);
      showToast('删除成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`删除失败: ${error.message}`, 'error');
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.template_id || !formData.service_name.trim()) {
      alert('请填写实例名称、模板和 Service 名称');
      return;
    }
    if (selectedTemplate) {
      for (const container of selectedTemplate.containers) {
        for (const envVar of container.input_env_vars || []) {
          const key = `${container.name}.${envVar.name}`;
          if (!envVar.default_value && !inputEnvVarValues[key]?.trim()) {
            alert(`请填写环境变量：${envVar.name}`);
            return;
          }
        }
        for (const mount of container.input_volume_mounts || []) {
          const key = `${container.name}.${mount.mount_path}`;
          if (!inputVolumeMountConfigs[key]?.pvc_name) {
            alert(`请选择挂载 PVC：${mount.mount_path}`);
            return;
          }
        }
      }
    }
    setIsSubmitting(true);
    try {
      const envVars: Array<{ name: string; value: string }> = [];
      const volumeMounts: Array<{ pvc_name: string; mount_path: string; sub_path: string; read_only: boolean }> = [];
      selectedTemplate?.containers.forEach((container) => {
        container.input_env_vars?.forEach((envVar) => {
          const value = inputEnvVarValues[`${container.name}.${envVar.name}`];
          if (value) envVars.push({ name: envVar.name, value });
        });
        container.input_volume_mounts?.forEach((mount) => {
          const config = inputVolumeMountConfigs[`${container.name}.${mount.mount_path}`];
          if (config?.pvc_name) {
            volumeMounts.push({ pvc_name: config.pvc_name, mount_path: mount.mount_path, sub_path: config.sub_path || '', read_only: config.read_only });
          }
        });
      });
      const created = await api.workflow.createAppWorkflow({
        ...formData,
        project_id: projectId,
        env_vars: envVars.length > 0 ? envVars : undefined,
        volume_mounts: volumeMounts.length > 0 ? volumeMounts : undefined,
        create_ingress: enableIngress,
        ingress_type: enableIngress ? 'nginx' : undefined
      });
      if (enableIngress) {
        await api.workflow.initializeAppWorkflow(created.id, false);
        await api.workflow.startAppWorkflow(created.id);
      }
      setIsModalOpen(false);
      resetForm();
      showToast(enableIngress ? '创建、初始化并启动成功，Ingress 已自动绑定' : '创建成功', 'success');
      await loadInstances();
    } catch (error: any) {
      showToast(`创建失败: ${error.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: AppWorkflowStatus) => ({
    pending: 'bg-gray-100 text-gray-700',
    unready: 'bg-orange-100 text-orange-700',
    ready: 'bg-green-100 text-green-700'
  }[status] || 'bg-gray-100 text-gray-700');

  const getStatusText = (status: AppWorkflowStatus) => ({
    pending: '待初始化',
    unready: '未就绪',
    ready: '已就绪'
  }[status] || status);

  const getAvailableActions = (status: AppWorkflowStatus) => {
    if (status === 'pending') return ['initialize', 'sync'];
    if (status === 'unready' || status === 'ready') return ['start', 'stop', 'sync', 'uninitialize'];
    return [];
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">应用实例</h1>
          <p className="mt-1 text-sm text-slate-500">管理单应用工作流实例</p>
        </div>
        <button onClick={openCreateModal} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500">
          <Plus size={18} />
          创建实例
        </button>
      </div>
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索实例名称、ID 或模板名称" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm outline-none focus:border-blue-500" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm outline-none focus:border-blue-500">
          <option value="">全部状态</option>
          <option value="pending">待初始化</option>
          <option value="unready">未就绪</option>
          <option value="ready">已就绪</option>
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : filteredInstances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Box className="mb-4 text-slate-300" size={64} />
          <p className="font-medium text-slate-400">暂无应用实例</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-slate-500">实例名称</th>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-slate-500">模板</th>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-slate-500">状态</th>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-slate-500">Service</th>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-slate-500">创建时间</th>
                <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedInstances.map((instance) => {
                const actions = getAvailableActions(instance.status);
                return (
                  <tr key={instance.id} className="group hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <button onClick={() => onNavigateToDetail(instance.id)} className="text-left text-sm font-bold text-blue-600 hover:text-blue-700">{instance.name}</button>
                      <p className="mt-1 text-xs text-slate-400">{instance.id}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{instance.template_name || '-'}</td>
                    <td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(instance.status)}`}>{getStatusText(instance.status)}</span></td>
                    <td className="px-6 py-4 text-sm text-slate-600">{instance.service_name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(instance.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-all group-hover:opacity-100">
                        <button onClick={() => onNavigateToDetail(instance.id)} className="rounded-xl bg-indigo-50 p-3 text-indigo-600 transition-all hover:bg-indigo-600 hover:text-white" title="查看详情"><Search size={16} /></button>
                        {actions.includes('sync') && <button onClick={() => handleSyncStatus(instance.id)} className="rounded-xl bg-blue-50 p-3 text-blue-600 transition-all hover:bg-blue-600 hover:text-white" title="同步状态"><RefreshCw size={16} /></button>}
                        {actions.includes('initialize') && <button onClick={() => handleInitialize(instance.id)} className="rounded-xl bg-purple-50 p-3 text-purple-600 transition-all hover:bg-purple-600 hover:text-white" title="初始化"><Activity size={16} /></button>}
                        {actions.includes('uninitialize') && <button onClick={() => { setUninitializingId(instance.id); setIsUninitModalOpen(true); }} className="rounded-xl bg-orange-50 p-3 text-orange-600 transition-all hover:bg-orange-600 hover:text-white" title="反初始化"><RotateCcw size={16} /></button>}
                        {actions.includes('start') && <button onClick={() => handleStart(instance.id)} className="rounded-xl bg-green-50 p-3 text-green-600 transition-all hover:bg-green-600 hover:text-white" title="启动"><Play size={16} /></button>}
                        {actions.includes('stop') && <button onClick={() => handleStop(instance.id)} className="rounded-xl bg-amber-50 p-3 text-amber-600 transition-all hover:bg-amber-600 hover:text-white" title="停止"><StopCircle size={16} /></button>}
                        <button onClick={() => { setDeletingId(instance.id); setIsDeleteModalOpen(true); }} className="rounded-xl bg-red-50 p-3 text-red-600 transition-all hover:bg-red-600 hover:text-white" title="删除"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-8 py-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">每页</span>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-500">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">共 {filteredInstances.length} 条</span>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)} className="p-2 text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronLeft size={20} /></button>
              <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-800">{currentPage} / {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="p-2 text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronRight size={20} /></button>
            </div>
          </div>
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white shadow-2xl">
            {createStep === 'select-template' ? (
              <>
                <div className="border-b border-slate-100 p-8">
                  <h2 className="text-2xl font-black text-slate-900">选择应用模板</h2>
                  <p className="mt-1 text-sm text-slate-500">从现有模板创建单应用工作流实例。</p>
                </div>
                <div className="p-8">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                  ) : templates.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">暂无可用模板</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {templates.map((template) => (
                        <button key={template.id} onClick={() => handleTemplateSelect(template.id)} className="rounded-2xl border border-slate-200 p-5 text-left transition-all hover:border-blue-300 hover:bg-blue-50">
                          <div className="text-lg font-black text-slate-900">{template.name}</div>
                          <div className="mt-2 text-sm text-slate-500">{template.description || '暂无描述'}</div>
                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-slate-100 px-3 py-1">容器 {template.containers.length}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1">副本 {template.replicas}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1">{template.scope}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 p-8 text-right">
                  <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 font-medium text-slate-600 hover:text-slate-700">取消</button>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-slate-100 p-8">
                  <h2 className="text-2xl font-black text-slate-900">配置应用实例</h2>
                  <p className="mt-1 text-sm text-slate-500">补充实例、Service 和域名访问参数。</p>
                </div>
                <div className="space-y-6 p-8">
                  {selectedTemplate && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                        <div><div className="text-xs text-slate-400">模板</div><div className="font-bold text-slate-800">{selectedTemplate.name}</div></div>
                        <div><div className="text-xs text-slate-400">范围</div><div className="font-bold text-slate-800">{selectedTemplate.scope}</div></div>
                        <div><div className="text-xs text-slate-400">容器数</div><div className="font-bold text-slate-800">{selectedTemplate.containers.length}</div></div>
                        <div><div className="text-xs text-slate-400">副本</div><div className="font-bold text-slate-800">{selectedTemplate.replicas}</div></div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">实例名称 *</label>
                      <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="例如：demo-nginx" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">Service 名称 *</label>
                      <input value={formData.service_name} onChange={(event) => setFormData({ ...formData, service_name: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="例如：nginx-svc" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">描述</label>
                      <textarea value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows={3} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">Service 绫诲瀷</label>
                      <select value={formData.service_type} onChange={(event) => setFormData({ ...formData, service_type: event.target.value as any })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500">
                        <option value="ClusterIP">ClusterIP</option>
                        <option value="NodePort">NodePort</option>
                        <option value="LoadBalancer">LoadBalancer</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">副本数</label>
                      <input type="number" min="1" value={formData.replicas} onChange={(event) => setFormData({ ...formData, replicas: parseInt(event.target.value, 10) || 1 })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  {selectedTemplate?.containers.some((container) => (container.input_env_vars || []).length > 0) && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                      <div className="mb-4 text-sm font-black text-blue-700">环境变量依赖</div>
                      <div className="space-y-4">
                        {selectedTemplate.containers.map((container) => (container.input_env_vars || []).map((envVar) => {
                          const key = `${container.name}.${envVar.name}`;
                          return (
                            <div key={key}>
                              <label className="mb-1 block text-xs font-bold text-slate-600">{envVar.name}<span className="ml-2 text-slate-400">容器：{container.name}</span></label>
                              <input value={inputEnvVarValues[key] || ''} onChange={(event) => setInputEnvVarValues({ ...inputEnvVarValues, [key]: event.target.value })} placeholder={envVar.default_value || '请输入变量值'} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                          );
                        }))}
                      </div>
                    </div>
                  )}
                  {selectedTemplate?.containers.some((container) => (container.input_volume_mounts || []).length > 0) && (
                    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
                      <div className="mb-4 text-sm font-black text-purple-700">PVC 挂载依赖</div>
                      <div className="space-y-4">
                        {selectedTemplate.containers.map((container) => (container.input_volume_mounts || []).map((mount) => {
                          const key = `${container.name}.${mount.mount_path}`;
                          const config = inputVolumeMountConfigs[key] || { pvc_name: '', sub_path: '', read_only: mount.read_only ?? true };
                          return (
                            <div key={key} className="rounded-xl border border-purple-200 bg-white p-4">
                              <div className="mb-3 text-sm font-bold text-slate-700">挂载路径：{mount.mount_path}<span className="ml-2 text-xs text-slate-400">容器：{container.name}</span></div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <select value={config.pvc_name} onChange={(event) => setInputVolumeMountConfigs({ ...inputVolumeMountConfigs, [key]: { ...config, pvc_name: event.target.value } })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-500">
                                  <option value="">选择 PVC</option>
                                  {pvcList.map((pvc) => <option key={pvc.pvc_name} value={pvc.pvc_name}>{pvc.pvc_name} {pvc.resource_name ? `(${pvc.resource_name})` : ''}</option>)}
                                </select>
                                <input value={config.sub_path} onChange={(event) => setInputVolumeMountConfigs({ ...inputVolumeMountConfigs, [key]: { ...config, sub_path: event.target.value } })} placeholder="子路径，可留空" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-500" />
                              </div>
                            </div>
                          );
                        }))}
                      </div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div><div className="text-sm font-black text-green-700">绑定 Ingress</div><div className="text-xs text-green-600">勾选后系统会基于当前 Service 自动生成域名，并在创建后自动初始化、启动实例。</div></div>
                      <label className="inline-flex cursor-pointer items-center">
                        <input type="checkbox" checked={enableIngress} onChange={(event) => setEnableIngress(event.target.checked)} className="sr-only peer" />
                        <div className="relative h-6 w-11 rounded-full bg-gray-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
                      </label>
                    </div>
                    {enableIngress && (
                      <div className="rounded-xl border border-dashed border-green-300 bg-white/80 px-4 py-3 text-sm text-green-700">
                        默认使用 `nginx` Ingress，域名规则会按当前 Service 自动生成。创建完成后可直接在实例详情的“访问”页点击“访问服务”按钮。
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 p-8">
                  <button onClick={() => setCreateStep('select-template')} className="px-6 py-3 font-medium text-slate-600 hover:text-slate-700">返回模板列表</button>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 font-medium text-slate-600 hover:text-slate-700">取消</button>
                    <button onClick={handleCreate} disabled={isSubmitting} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 disabled:opacity-50">
                      {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                      {enableIngress ? '创建并启动实例' : '创建实例'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {isUninitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-orange-50 text-orange-600">
                <RotateCcw size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800">确认反初始化？</h3>
              <p className="mt-4 font-medium text-slate-500">
                您确定要反初始化这个应用实例吗？这将删除所有关联的 K8S 资源并重置状态。</p>
              <p className="mt-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-500">
                警告：所有的非持久化数据将全部丢失！
              </p>
            </div>
            <div className="flex gap-4 bg-slate-50 p-8">
              <button
                onClick={() => {
                  setIsUninitModalOpen(false);
                  setUninitializingId(null);
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 font-bold text-slate-600 transition-all hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleUninitialize}
                disabled={isUninitializing}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-600 py-4 font-bold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 disabled:opacity-50"
              >
                {isUninitializing && <Loader2 size={18} className="animate-spin" />}
                确认反初始化
              </button>
            </div>
          </div>
        </div>
      )}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="p-8">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100"><AlertCircle className="text-red-600" size={24} /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">确认删除</h3>
                  <p className="mt-1 text-sm text-slate-500">此操作不可撤销。</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">删除应用实例时，会一并清理关联的 K8s 资源与域名绑定记录。</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-8">
              <button onClick={() => { setIsDeleteModalOpen(false); setDeletingId(null); }} className="px-6 py-3 font-medium text-slate-600 hover:text-slate-700">取消</button>
              <button onClick={handleDelete} className="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-500">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed left-1/2 top-4 z-[99999]"
          style={{
            transform: 'translateX(-50%)',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translate(-50%, -20px);
              }
              to {
                opacity: 1;
                transform: translate(-50%, 0);
              }
            }
          `}</style>
          <div className={`flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-bold shadow-2xl ${
            toast.type === 'success' ? 'border-green-500 bg-green-600 text-white' :
            toast.type === 'error' ? 'border-red-500 bg-red-600 text-white' :
            toast.type === 'warning' ? 'border-yellow-400 bg-yellow-500 text-yellow-900' :
            'border-slate-700 bg-slate-800 text-white'
          }`}>
            {toast.type === 'success' && <CheckCircle size={18} />}
            {toast.type === 'error' && <XCircle size={18} />}
            {toast.type === 'warning' && <AlertCircle size={18} />}
            {toast.type === 'info' && <Activity size={18} />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};
