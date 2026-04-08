import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Box, CheckCircle, ChevronLeft, ChevronRight, Loader2, Play, Plus, RefreshCw, RotateCcw, Search, StopCircle, Trash2, XCircle } from 'lucide-react';
import { api } from '../../clients/api';
import { AppTemplate, AppWorkflow, AppWorkflowLlmBindingRequest, AppWorkflowStatus, ServicePort } from '../../types/types';
import { AppWorkflowLlmBindingsEditor } from '../../components/workflow/AppWorkflowLlmBindingsEditor';
type CreateStep = 'select-template' | 'fill-form';

type InputVolumeMountConfig = {
  pvc_name: string;
  sub_path: string;
  read_only: boolean;
};

type AdditionalPvcMountDraft = {
  pvc_name: string;
  mount_path: string;
  sub_path: string;
  read_only: boolean;
};

type HelpSectionKey = 'ingress-binding';
type TemplateScopeFilter = 'global' | 'project';

const createMountConfig = (readOnly = true): InputVolumeMountConfig => ({
  pvc_name: '',
  sub_path: '',
  read_only: readOnly,
});

const createAdditionalPvcMountDraft = (): AdditionalPvcMountDraft => ({
  pvc_name: '',
  mount_path: '',
  sub_path: '',
  read_only: true,
});

export const AppInstancePage: React.FC<{
  projectId: string;
  onNavigateToDetail: (id: string) => void;
}> = ({ projectId, onNavigateToDetail }) => {
  type CreateFormData = {
    name: string;
    description: string;
    template_id: string;
    service_name: string;
    service_ports: ServicePort[];
    service_type: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
    replicas: number;
  };
  const [instances, setInstances] = useState<AppWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('select-template');
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [templateScopeFilter, setTemplateScopeFilter] = useState<TemplateScopeFilter>('project');
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(10);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AppTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateFormData>({
    name: '',
    description: '',
    template_id: '',
    service_name: '',
    service_ports: [{ name: 'http', port: 80, target_port: 80, protocol: 'TCP' }],
    service_type: 'ClusterIP' as 'ClusterIP' | 'LoadBalancer' | 'NodePort',
    replicas: 1
  });
  const [inputEnvVarValues, setInputEnvVarValues] = useState<Record<string, string>>({});
  const [inputVolumeMountConfigs, setInputVolumeMountConfigs] = useState<Record<string, InputVolumeMountConfig>>({});
  const [additionalPvcMounts, setAdditionalPvcMounts] = useState<AdditionalPvcMountDraft[]>([]);
  const [pvcList, setPvcList] = useState<Array<{ pvc_name: string; resource_name?: string }>>([]);
  const [enableIngress, setEnableIngress] = useState(false);
  const [llmBindings, setLlmBindings] = useState<AppWorkflowLlmBindingRequest[]>([]);
  const [openHelpSection, setOpenHelpSection] = useState<HelpSectionKey | null>(null);
  const helpSectionRefs = useRef<Partial<Record<HelpSectionKey, HTMLDivElement | null>>>({});

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUninitModalOpen, setIsUninitModalOpen] = useState(false);
  const [uninitializingId, setUninitializingId] = useState<string | null>(null);
  const [isUninitializing, setIsUninitializing] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
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

  useEffect(() => {
    if (!openHelpSection) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      const activeSection = helpSectionRefs.current[openHelpSection];
      if (activeSection && targetNode && !activeSection.contains(targetNode)) {
        setOpenHelpSection(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenHelpSection(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openHelpSection]);

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

  const filteredTemplates = useMemo(() => {
    const keyword = templateSearchTerm.trim().toLowerCase();
    const scopeFilteredTemplates = templates.filter((template) => template.scope === templateScopeFilter);

    if (!keyword) return scopeFilteredTemplates;

    return scopeFilteredTemplates.filter((template) => {
      const tagText = (template.tags || [])
        .map((tag) => `${tag.tag_label} ${tag.tag_key}`)
        .join(' ')
        .toLowerCase();

      return [
        template.name,
        template.description || '',
        template.scope,
        template.created_by || '',
        tagText,
      ].some((field) => field.toLowerCase().includes(keyword));
    });
  }, [templates, templateSearchTerm, templateScopeFilter]);

  const templateTotalPages = Math.max(1, Math.ceil(filteredTemplates.length / templatePageSize));
  const paginatedTemplates = useMemo(() => {
    const start = (templatePage - 1) * templatePageSize;
    return filteredTemplates.slice(start, start + templatePageSize);
  }, [filteredTemplates, templatePage, templatePageSize]);

  const resetForm = () => {
    setCreateStep('select-template');
    setTemplateSearchTerm('');
    setTemplateScopeFilter('project');
    setTemplatePage(1);
    setTemplatePageSize(10);
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
    setAdditionalPvcMounts([]);
    setEnableIngress(false);
    setPvcList([]);
    setLlmBindings([]);
    setOpenHelpSection(null);
  };

  const renderHelpToggle = (
    section: HelpSectionKey,
    message: React.ReactNode,
    tone: {
      button: string;
      panel: string;
      text: string;
    },
    className = ''
  ) => {
    const isOpen = openHelpSection === section;
    const panelId = `${section}-help-panel`;
    const buttonId = `${section}-help-button`;

    return (
      <div
        ref={(node) => {
          helpSectionRefs.current[section] = node;
        }}
        className={`relative flex items-start justify-end ${className}`}
      >
        <button
          id={buttonId}
          type="button"
          aria-label="查看说明"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setOpenHelpSection((current) => (current === section ? null : section))}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-black leading-none transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${tone.button} ${isOpen ? 'scale-105 shadow-sm' : 'hover:scale-105'}`}
        >
          ?
        </button>
        <div
          id={panelId}
          role="status"
          aria-live="polite"
          aria-labelledby={buttonId}
          className={`absolute right-0 top-7 z-10 w-[min(20rem,calc(100vw-5rem))] overflow-hidden transition-all duration-200 ease-out ${isOpen ? 'max-h-40 opacity-100 translate-y-0' : 'pointer-events-none max-h-0 opacity-0 -translate-y-1'}`}
        >
          <div className={`rounded-xl border px-4 py-3 text-xs leading-6 shadow-sm ${tone.panel} ${tone.text}`}>
            {message}
          </div>
        </div>
      </div>
    );
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

  useEffect(() => {
    setTemplatePage(1);
  }, [templateSearchTerm, templateScopeFilter]);

  useEffect(() => {
    setTemplatePage((current) => Math.min(current, templateTotalPages));
  }, [templateTotalPages]);

  const handleTemplateSelect = async (templateId: string) => {
    try {
      const template = await api.workflow.getAppTemplate(templateId, projectId);
      setSelectedTemplate(template);
      const envVars: Record<string, string> = {};
      const volumeConfigs: Record<string, InputVolumeMountConfig> = {};
      template.containers.forEach((container) => {
        container.input_env_vars?.forEach((envVar) => {
          envVars[`${container.name}.${envVar.name}`] = envVar.default_value || '';
        });
        container.input_volume_mounts?.forEach((mount) => {
          volumeConfigs[`${container.name}.${mount.mount_path}`] = createMountConfig(mount.read_only ?? true);
        });
      });
      setInputEnvVarValues(envVars);
      setInputVolumeMountConfigs(volumeConfigs);
      setFormData((current) => ({
        ...current,
        template_id: templateId,
        service_ports: template.service_ports && template.service_ports.length > 0
          ? template.service_ports.map((port) => ({
              name: port.name,
              port: port.port,
              target_port: port.target_port,
              protocol: port.protocol || 'TCP',
            }))
          : current.service_ports,
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

  const handleRefreshInstances = async () => {
    if (isRefreshingList) return;
    setIsRefreshingList(true);
    try {
      const syncTargets = instances.map((item) => item.id);
      if (syncTargets.length > 0) {
        const results = await Promise.allSettled(syncTargets.map((id) => api.workflow.syncAppWorkflowStatus(id)));
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          showToast(`状态同步完成，成功 ${syncTargets.length - failedCount}，失败 ${failedCount}`, 'warning');
        } else {
          showToast(`状态同步完成，共 ${syncTargets.length} 个实例`, 'success');
        }
      }
      await loadInstances();
      if (syncTargets.length === 0) {
        showToast('列表已刷新', 'success');
      }
    } catch (error: any) {
      showToast(`刷新失败: ${error?.message || '未知错误'}`, 'error');
    } finally {
      setIsRefreshingList(false);
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
    for (const pvcMount of additionalPvcMounts) {
      if (!pvcMount.pvc_name) {
        alert('请选择要绑定的 PVC');
        return;
      }
      if (!pvcMount.mount_path.trim()) {
        alert('请填写 PVC 挂载路径');
        return;
      }
    }
    for (const binding of llmBindings) {
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
      additionalPvcMounts.forEach((mount) => {
        volumeMounts.push({
          pvc_name: mount.pvc_name,
          mount_path: mount.mount_path.trim(),
          sub_path: mount.sub_path.trim(),
          read_only: mount.read_only,
        });
      });
      const created = await api.workflow.createAppWorkflow({
        ...formData,
        project_id: projectId,
        env_vars: envVars.length > 0 ? envVars : undefined,
        volume_mounts: volumeMounts.length > 0 ? volumeMounts : undefined,
        create_ingress: enableIngress,
        ingress_type: enableIngress ? 'nginx' : undefined,
        llm_bindings: llmBindings,
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
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshInstances}
            disabled={loading || isRefreshingList}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={isRefreshingList ? 'animate-spin' : ''} />
            刷新
          </button>
          <button onClick={openCreateModal} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500">
            <Plus size={18} />
            创建实例
          </button>
        </div>
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
          <div className="max-h-[94vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white shadow-2xl">
            {createStep === 'select-template' ? (
              <>
                <div className="border-b border-slate-100 p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">选择应用模板</h2>
                    </div>
                    <div className="w-full max-w-xs">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          value={templateSearchTerm}
                          onChange={(event) => setTemplateSearchTerm(event.target.value)}
                          placeholder="搜索模板名称、描述、标签或创建人"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-[13px] text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      { key: 'project', label: '项目模板' },
                      { key: 'global', label: '公共模板' },
                    ].map((option) => {
                      const isActive = templateScopeFilter === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setTemplateScopeFilter(option.key as TemplateScopeFilter)}
                          className={`rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-6">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                  ) : templates.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">暂无可用模板</div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                        <Search size={22} />
                      </div>
                      <div className="text-base font-bold text-slate-700">没有找到匹配的模板</div>
                      <p className="mt-2 text-sm text-slate-500">可以尝试更短的关键词，或按模板名称、标签重新检索。</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="max-h-[68vh] overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white shadow-inner shadow-slate-100/70">
                        <div className="divide-y divide-slate-100">
                          {paginatedTemplates.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => handleTemplateSelect(template.id)}
                              className="group flex w-full flex-col gap-2.5 px-4 py-3 text-left transition-all hover:bg-slate-50 md:px-5"
                            >
                              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-all group-hover:bg-blue-600 group-hover:text-white">
                                      <Box size={16} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-[15px] font-black text-slate-900 md:text-base">{template.name}</div>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                        <span>{template.scope === 'global' ? '全局模板' : '项目模板'}</span>
                                        {template.created_by && (
                                          <>
                                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                                            <span>{template.created_by}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-600">
                                    {template.description || '暂无描述，点击后可继续补充实例配置。'}
                                  </p>

                                  {!!template.tags?.length && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {template.tags.slice(0, 4).map((tag) => (
                                        <span
                                          key={`${template.id}-${tag.tag_key}`}
                                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600"
                                        >
                                          {tag.tag_label}
                                        </span>
                                      ))}
                                      {template.tags.length > 4 && (
                                        <span className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                                          +{template.tags.length - 4}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="flex shrink-0 flex-wrap gap-1.5 xl:max-w-[15rem] xl:justify-end">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    容器 {template.containers.length}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                    副本 {template.replicas}
                                  </span>
                                  {template.service_ports && template.service_ports.length > 0 && (
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                      端口 {template.service_ports.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">分页浏览</div>
                          <div className="mt-1 text-sm text-slate-600">共 <span className="font-black text-slate-900">{filteredTemplates.length}</span> 个模板</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">每页</span>
                            <select
                              value={templatePageSize}
                              onChange={(event) => {
                                setTemplatePageSize(Number(event.target.value));
                                setTemplatePage(1);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                            >
                              <option value={5}>5</option>
                              <option value={10}>10</option>
                              <option value={15}>15</option>
                              <option value={20}>20</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={templatePage === 1}
                              onClick={() => setTemplatePage((page) => page - 1)}
                              className="p-2 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <span className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-800 ring-1 ring-slate-200">
                              {templatePage} / {templateTotalPages}
                            </span>
                            <button
                              disabled={templatePage >= templateTotalPages}
                              onClick={() => setTemplatePage((page) => page + 1)}
                              className="p-2 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 p-6 text-right">
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
                      <label className="mb-2 block text-xs font-black uppercase text-slate-500">Service 类型</label>
                      <select value={formData.service_type} onChange={(event) => setFormData({ ...formData, service_type: event.target.value as any })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500">
                        <option value="ClusterIP">集群内部访问</option>
                        <option value="NodePort">节点端口访问</option>
                        <option value="LoadBalancer">负载均衡访问</option>
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
                          const config = inputVolumeMountConfigs[key] || createMountConfig(mount.read_only ?? true);
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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-sm font-black text-amber-700">附加 PVC 挂载</div>
                        <div className="mt-1 text-xs text-amber-700/80">从公共资源管理的 PVC 资源中选择，并绑定到实例容器路径。</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAdditionalPvcMounts([...additionalPvcMounts, createAdditionalPvcMountDraft()])}
                        className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
                      >
                        <Plus size={16} />
                        添加 PVC
                      </button>
                    </div>
                    {additionalPvcMounts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-amber-200 bg-white/80 px-4 py-4 text-sm text-amber-700">
                        如需额外挂载 PVC，可以在这里选择公共 PVC 资源并填写容器内挂载路径。
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {additionalPvcMounts.map((mount, index) => (
                          <div key={index} className="rounded-xl border border-amber-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-slate-700">附加 PVC 挂载 #{index + 1}</div>
                              <button
                                type="button"
                                onClick={() => setAdditionalPvcMounts(additionalPvcMounts.filter((_, itemIndex) => itemIndex !== index))}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                title="删除挂载"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <select
                                value={mount.pvc_name}
                                onChange={(event) => setAdditionalPvcMounts(additionalPvcMounts.map((item, itemIndex) => itemIndex === index ? { ...item, pvc_name: event.target.value } : item))}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500"
                              >
                                <option value="">选择 PVC 资源</option>
                                {pvcList.map((pvc) => (
                                  <option key={pvc.pvc_name} value={pvc.pvc_name}>
                                    {pvc.pvc_name} {pvc.resource_name ? `(${pvc.resource_name})` : ''}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={mount.mount_path}
                                onChange={(event) => setAdditionalPvcMounts(additionalPvcMounts.map((item, itemIndex) => itemIndex === index ? { ...item, mount_path: event.target.value } : item))}
                                placeholder="容器内挂载路径，例如 /workspace/shared"
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500"
                              />
                              <input
                                value={mount.sub_path}
                                onChange={(event) => setAdditionalPvcMounts(additionalPvcMounts.map((item, itemIndex) => itemIndex === index ? { ...item, sub_path: event.target.value } : item))}
                                placeholder="PVC 子路径，可留空"
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500"
                              />
                              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={mount.read_only}
                                  onChange={(event) => setAdditionalPvcMounts(additionalPvcMounts.map((item, itemIndex) => itemIndex === index ? { ...item, read_only: event.target.checked } : item))}
                                />
                                只读挂载
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <AppWorkflowLlmBindingsEditor
                    value={llmBindings}
                    onChange={setLlmBindings}
                  />
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-black text-green-700">绑定 Ingress</div>
                      </div>
                      {renderHelpToggle(
                        'ingress-binding',
                        '勾选后系统会基于当前 Service 自动生成域名，并在创建后自动初始化、启动实例。',
                        {
                          button: 'border-green-300 bg-white/90 text-green-700 hover:border-green-400 hover:bg-white focus:ring-green-300',
                          panel: 'border-green-200 bg-white/95',
                          text: 'text-green-700',
                        },
                        'mr-2 md:mr-3'
                      )}
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
