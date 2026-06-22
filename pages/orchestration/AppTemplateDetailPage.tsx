import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Settings,
  Loader2,
  Layers,
  Container,
  X,
  Plus,
  Clock,
  Monitor,
  Hash
} from 'lucide-react';
import { AppTemplate, ServicePort, TemplateScope, TemplateTag } from '../../types/types';
import { api } from '../../clients/api';
import { PageHeader } from '../../design-system';

export const AppTemplateDetailPage: React.FC<{ templateId: string, onBack: () => void }> = ({ templateId, onBack }) => {
  const orchestrationApi = api.domains.orchestration;
  const normalizeTagKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const getTagClasses = (color?: string) => {
    const colorMap: Record<string, string> = {
      slate: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
      blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
      emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
      rose: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
      violet: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    };
    return colorMap[color || 'slate'] || colorMap.slate;
  };
  type AppTemplateFormData = {
    name: string;
    description: string;
    scope: TemplateScope;
    replicas: number;
    tags: TemplateTag[];
    service_ports: ServicePort[];
    service_name: string;
    create_service: boolean;
    service_type: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
    containers: any[];
  };
  const [template, setTemplate] = useState<AppTemplate | null>(null);
  const [availableTags, setAvailableTags] = useState<TemplateTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');

  const defaultContainer = {
    name: 'main',
    image: '',
    command: '',
    args: '',
    env_vars: [{ name: '', value: '' }],
    volume_mounts: [{ pvc_name: '', mount_path: '', sub_path: '', read_only: false }],
    input_env_vars: [{ name: '', default_value: '' }],
    input_volume_mounts: [{ mount_path: '', sub_path: '', read_only: true }],
    output_env_vars: [],
    output_volume_mounts: [],
    privileged: false,
    image_pull_policy: 'IfNotPresent',
    resources: { requests: { cpu: '', memory: '' }, limits: { cpu: '', memory: '' } },
    liveness_probe: { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 },
    readiness_probe: { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 }
  };

  const [formData, setFormData] = useState<AppTemplateFormData>({
    name: '',
    description: '',
    scope: 'project' as TemplateScope,
    replicas: 1,
    tags: [],
    service_ports: [{ name: 'http', port: 80, target_port: 80, protocol: 'TCP' }],
    service_name: '',
    create_service: true,
    service_type: 'ClusterIP' as 'ClusterIP' | 'LoadBalancer' | 'NodePort',
    containers: [ JSON.parse(JSON.stringify(defaultContainer)) ]
  });

  const loadAvailableTags = async () => {
    try {
      const res = await orchestrationApi.workflow.listTemplateTags({ enabled: true });
      setAvailableTags(res.items || []);
    } catch (error) {
      console.error('Failed to load template tags', error);
    }
  };

  const addTagToForm = (rawValue: string) => {
    const trimmedValue = rawValue.trim();
    const tagKey = normalizeTagKey(trimmedValue);
    if (!tagKey) return;
    if (formData.tags.some((tag) => tag.tag_key === tagKey)) {
      setTagInputValue('');
      return;
    }
    const existingTag = availableTags.find((tag) => tag.tag_key === tagKey);
    setFormData((current) => ({
      ...current,
      tags: [
        ...current.tags,
        existingTag || { tag_key: tagKey, tag_label: trimmedValue || tagKey, category: 'capability', color: 'slate' }
      ]
    }));
    setTagInputValue('');
  };

  const removeTagFromForm = (tagKey: string) => {
    setFormData((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag.tag_key !== tagKey)
    }));
  };

  const loadTemplate = async () => {
    try {
      const data = await orchestrationApi.workflow.getAppTemplate(templateId);
      setTemplate(data);

      // Transform data for form
      setFormData({
        name: data.name || '',
        description: data.description || '',
        scope: data.scope || 'project',
        replicas: data.replicas || 1,
        tags: data.tags || [],
        service_ports: data.service_ports && data.service_ports.length > 0 ? data.service_ports : [{ name: 'http', port: 80, target_port: 80, protocol: 'TCP' }],
        service_name: data.service_name || '',
        create_service: data.create_service ?? true,
        service_type: data.service_type || 'ClusterIP',
        containers: (data.containers || []).map((c: any) => ({
          ...c,
          command: c.command ? c.command.join(', ') : '',
          args: c.args ? c.args.join(', ') : '',
          env_vars: c.env_vars && c.env_vars.length > 0 ? c.env_vars : [{ name: '', value: '' }],
          volume_mounts: c.volume_mounts && c.volume_mounts.length > 0 ? c.volume_mounts : [{ pvc_name: '', mount_path: '', sub_path: '', read_only: false }],
          input_env_vars: c.input_env_vars && c.input_env_vars.length > 0 ? c.input_env_vars : [{ name: '', default_value: '' }],
          input_volume_mounts: c.input_volume_mounts && c.input_volume_mounts.length > 0 ? c.input_volume_mounts : [{ mount_path: '', sub_path: '', read_only: true }],
          liveness_probe: c.liveness_probe || { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 },
          readiness_probe: c.readiness_probe || { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 }
        }))
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplate();
    void loadAvailableTags();
  }, [templateId]);

  const handleSave = async () => {
    if (formData.containers.some(c => !c.image)) {
      alert("请确保所有容器都已指定镜像");
      return;
    }

    const payload = {
      ...formData,
      tags: formData.tags,
      service_ports: formData.service_ports.filter(p => p.port > 0),
      containers: formData.containers.map((c: any) => {
        const formatProbe = (p: any) => {
          if (!p || (!p.port && p.type !== 'exec')) return undefined;
          return {
            ...p,
            port: p.port ? parseInt(p.port) : undefined,
            initial_delay_seconds: parseInt(p.initial_delay_seconds || 0),
            period_seconds: parseInt(p.period_seconds || 10),
            timeout_seconds: p.timeout_seconds ? parseInt(p.timeout_seconds) : undefined,
            failure_threshold: p.failure_threshold ? parseInt(p.failure_threshold) : undefined,
            success_threshold: p.success_threshold ? parseInt(p.success_threshold) : undefined,
            command: p.type === 'exec' && typeof p.command === 'string' ? p.command.split(',').map((s: string) => s.trim()) : p.command
          };
        };

        return {
          ...c,
          command: c.command ? c.command.split(',').map((s: string) => s.trim()) : undefined,
          args: c.args ? c.args.split(',').map((s: string) => s.trim()) : undefined,
          env_vars: c.env_vars.filter((e: any) => e.name && e.value),
          volume_mounts: c.volume_mounts.filter((v: any) => v.pvc_name && v.mount_path),
          input_env_vars: c.input_env_vars.filter((e: any) => e.name),
          input_volume_mounts: c.input_volume_mounts.filter((v: any) => v.mount_path),
          output_env_vars: undefined,
          output_volume_mounts: undefined,
          resources: (c.resources?.requests?.cpu || c.resources?.limits?.cpu) ? c.resources : undefined,
          liveness_probe: formatProbe(c.liveness_probe),
          readiness_probe: formatProbe(c.readiness_probe)
        };
      })
    };

    setIsSubmitting(true);
    try {
      await orchestrationApi.workflow.updateAppTemplate(templateId, payload);
      setIsEditMode(false);
      loadTemplate();
      alert("保存成功");
    } catch (err: any) {
      alert("保存失败:" + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && !template) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-400" size={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg-app animate-in fade-in duration-500">
      {/* Header */}
      <PageHeader
        title={template?.name}
        description={
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs font-mono text-theme-text-muted">ID: {template?.id}</p>
            {template && (
              <div className="flex items-center gap-3 border-l border-theme-border pl-3">
                <span className="text-[10px] font-medium text-theme-text-muted uppercase flex items-center gap-1">
                  <Monitor size={12} className="text-blue-500" /> {template.created_by || 'system'}
                </span>
                <span className="text-[10px] font-medium text-theme-text-muted uppercase flex items-center gap-1">
                  <Clock size={12} /> {template.updated_at ? new Date(template.updated_at).toLocaleString() : new Date(template.created_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        }
        back={{ label: '返回模板列表', onClick: onBack }}
        actions={
          <div className="flex items-center gap-3">
            {isEditMode ? (
              <>
                <button onClick={() => { setIsEditMode(false); loadTemplate(); }} className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary bg-theme-elevated hover:bg-theme-elevated rounded-xl transition-all">
                  取消
                </button>
                <button disabled={isSubmitting} onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 保存
                </button>
              </>
            ) : (
              <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-theme-text-secondary bg-theme-surface border border-theme-border hover:bg-theme-elevated rounded-xl transition-all">
                <Settings size={16} /> 编辑模式
              </button>
            )}
          </div>
        }
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Basic Info */}
 <div className="bg-theme-surface rounded-xl p-8 border border-theme-border space-y-6">
            <h3 className="text-lg font-semibold text-theme-text-primary flex items-center gap-2">
              <Settings size={18} className="text-blue-500" /> 基本信息
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">模板名称 *</label>
                <input
                  disabled={!isEditMode}
                   required placeholder="e.g. security-waf-proxy"
                   className="form-input w-full disabled:opacity-70 disabled:bg-theme-elevated"
                   value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">发布范围</label>
                <select
                  disabled={!isEditMode}
                  className="w-full px-4 py-3 bg-theme-bg-app rounded-xl border-none outline-none focus:ring-4 ring-blue-500/10 text-sm font-semibold text-theme-text-primary disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.scope} onChange={e => setFormData({...formData, scope: e.target.value as any})}
                >
                  <option value="project">仅限当前项目 (Project-only)</option>
                  <option value="global">公共资源库 (Global)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">运行副本数 (Replicas)</label>
                  <span className="text-xs font-medium text-blue-400">{formData.replicas} Pods</span>
              </div>
              <input
                disabled={!isEditMode}
                type="range" min="1" max="10" step="1"
                className="w-full h-2 bg-theme-elevated rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                value={formData.replicas} onChange={(e) => setFormData({...formData, replicas: parseInt(e.target.value)})}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">服务端口 (Service Ports)</label>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, service_ports: [...formData.service_ports, { name: 'http-' + formData.service_ports.length, port: 80, target_port: 80, protocol: 'TCP' }]})}
                    className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                  >
                    + 添加端口
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {formData.service_ports.map((p, pIdx) => (
                  <div key={pIdx} className="flex gap-2 items-center">
                    <input
                      disabled={!isEditMode}
                      placeholder="Name"
className="form-input w-24 text-xs disabled:opacity-70 disabled:bg-theme-elevated"
                       value={p.name} onChange={e => {
                        const n = [...formData.service_ports];
                        n[pIdx].name = e.target.value;
                        setFormData({...formData, service_ports: n});
                      }}
                    />
                    <input
                      disabled={!isEditMode}
                      type="number" placeholder="Port"
className="form-input w-20 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                       value={p.port} onChange={e => {
                        const n = [...formData.service_ports];
                        n[pIdx].port = parseInt(e.target.value);
                        setFormData({...formData, service_ports: n});
                      }}
                    />
                    <input
                      disabled={!isEditMode}
                      type="number" placeholder="Target"
className="form-input w-20 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                       value={p.target_port} onChange={e => {
                        const n = [...formData.service_ports];
                        n[pIdx].target_port = parseInt(e.target.value);
                        setFormData({...formData, service_ports: n});
                      }}
                    />
                    <select
                      disabled={!isEditMode}
                      className="w-24 px-4 py-2 bg-theme-bg-app rounded-xl border-none outline-none text-xs font-medium disabled:opacity-70 disabled:bg-theme-elevated"
                      value={p.protocol} onChange={e => {
                        const n = [...formData.service_ports];
                        n[pIdx].protocol = e.target.value;
                        setFormData({...formData, service_ports: n});
                      }}
                    >
                      <option value="TCP">TCP</option>
                      <option value="UDP">UDP</option>
                    </select>
                    {isEditMode && formData.service_ports.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, service_ports: formData.service_ports.filter((_, i) => i !== pIdx)})}
                        className="p-2 text-theme-text-muted hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 col-span-1 md:col-span-1">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">Service 名称</label>
                <input
                  disabled={!isEditMode}
                  placeholder="自动生成"
                   className="form-input w-full disabled:opacity-70 disabled:bg-theme-elevated"
                   value={formData.service_name} onChange={e => setFormData({...formData, service_name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">Service 类型</label>
                <select
                  disabled={!isEditMode}
                  className="w-full px-4 py-3 bg-theme-bg-app rounded-xl border-none outline-none focus:ring-4 ring-blue-500/10 text-sm font-semibold text-theme-text-primary disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.service_type} onChange={e => setFormData({...formData, service_type: e.target.value as any})}
                >
                  <option value="ClusterIP">ClusterIP</option>
                  <option value="LoadBalancer">LoadBalancer</option>
                  <option value="NodePort">NodePort</option>
                </select>
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    disabled={!isEditMode}
                    type="checkbox"
                    className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500 disabled:opacity-50"
                    checked={formData.create_service}
                    onChange={e => setFormData({...formData, create_service: e.target.checked})}
                  />
                  <span className="text-xs font-medium text-theme-text-secondary uppercase">创建 Service</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">组件描述</label>
              <textarea
                disabled={!isEditMode}
                placeholder="描述该应用组件的功能、挂载需求及预期的服务类型..." rows={2}
                className="form-textarea w-full resize-none disabled:opacity-70 disabled:bg-theme-elevated"
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">模板标签</label>
                {isEditMode && <span className="text-[10px] font-medium text-theme-text-muted">回车或点击标签即可添加/移除</span>}
              </div>
              {isEditMode && (
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <input
                      placeholder="输入标签名后回车，例如 web-scan / ai-agent"
                      className="form-input flex-1"
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToForm(tagInputValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => addTagToForm(tagInputValue)}
                      className="px-4 py-3 rounded-xl bg-theme-surface text-white text-sm font-semibold hover:bg-theme-elevated transition-all"
                    >
                      添加标签
                    </button>
                  </div>
                  {availableTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {availableTags
                        .filter((tag) => !formData.tags.some((selected) => selected.tag_key === tag.tag_key))
                        .slice(0, 12)
                        .map((tag) => (
                          <button
                            key={tag.tag_key}
                            type="button"
                            onClick={() => addTagToForm(tag.tag_label || tag.tag_key)}
                            className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all hover:-translate-y-0.5 ${getTagClasses(tag.color)}`}
                          >
                            #{tag.tag_label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {formData.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <button
                      key={tag.tag_key}
                      type="button"
                      disabled={!isEditMode}
                      onClick={() => isEditMode && removeTagFromForm(tag.tag_key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all disabled:cursor-default ${getTagClasses(tag.color)}`}
                    >
                      <Hash size={12} />
                      <span>{tag.tag_label}</span>
                      {isEditMode && <X size={12} />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-theme-text-muted font-medium">暂未配置标签</div>
              )}
            </div>
          </div>

          {/* Container Stack */}
 <div className="bg-theme-surface rounded-xl p-8 border border-theme-border space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-theme-text-primary flex items-center gap-2">
                <Container size={18} className="text-blue-500" /> 容器编排栈
              </h3>
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setFormData({...formData, containers: [...formData.containers, JSON.parse(JSON.stringify(defaultContainer))]})}
                  className="text-[10px] font-medium text-blue-400 hover:underline uppercase tracking-widest"
                >
                  + 添加容器
                </button>
              )}
            </div>

            <div className="space-y-6">
              {formData.containers.map((container: any, idx) => (
                <div key={idx} className="p-6 bg-theme-surface rounded-xl border border-theme-border relative group/c space-y-6">
                  {isEditMode && formData.containers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, containers: formData.containers.filter((_, i) => i !== idx)})}
                      className="absolute top-4 right-4 p-2 text-theme-text-muted hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">容器名称</label>
                      <input
                        disabled={!isEditMode}
                        required placeholder="e.g. main-service"
                        className="form-input w-full text-xs disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.name}
                        onChange={e => {
                          const n = [...formData.containers];
                          n[idx].name = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">镜像 (Image) *</label>
                      <input
                        disabled={!isEditMode}
                        required placeholder="e.g. nginx:latest"
                        className="form-input w-full text-xs font-mono text-blue-400 disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.image}
                        onChange={e => {
                          const n = [...formData.containers];
                          n[idx].image = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">启动命令 (Command)</label>
                      <input
                        disabled={!isEditMode}
                        placeholder="e.g. /bin/sh, -c (逗号分隔)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.command}
                        onChange={e => {
                          const n = [...formData.containers];
                          n[idx].command = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">命令参数 (Args)</label>
                      <input
                        disabled={!isEditMode}
                        placeholder="e.g. start, --prod (逗号分隔)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.args}
                        onChange={e => {
                          const n = [...formData.containers];
                          n[idx].args = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">拉取策略 (Image Pull Policy)</label>
                      <select
                        disabled={!isEditMode}
                        className="form-input w-full text-xs disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.image_pull_policy}
                        onChange={e => {
                          const n = [...formData.containers];
                          n[idx].image_pull_policy = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      >
                        <option value="IfNotPresent">IfNotPresent</option>
                        <option value="Always">Always</option>
                        <option value="Never">Never</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          disabled={!isEditMode}
                          type="checkbox"
                          className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500 disabled:opacity-50"
                          checked={container.privileged}
                          onChange={e => {
                            const n = [...formData.containers];
                            n[idx].privileged = e.target.checked;
                            setFormData({...formData, containers: n});
                          }}
                        />
                        <span className="text-xs font-medium text-theme-text-secondary uppercase">特权模式 (Privileged)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">环境变量 (Env Vars)</label>
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            const n = [...formData.containers];
                            n[idx].env_vars.push({ name: '', value: '' });
                            setFormData({...formData, containers: n});
                          }}
                          className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                        >
                          + 添加变量
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {container.env_vars.map((env: any, envIdx: number) => (
                        <div key={envIdx} className="flex gap-2 items-center">
                          <input
                            disabled={!isEditMode}
                            placeholder="Name (e.g. ENV_KEY)"
                            className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={env.name}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].env_vars[envIdx].name = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                          <input
                            disabled={!isEditMode}
                            placeholder="Value (e.g. ENV_VALUE)"
                            className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={env.value}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].env_vars[envIdx].value = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => {
                                const n = [...formData.containers];
                                n[idx].env_vars = n[idx].env_vars.filter((_: any, i: number) => i !== envIdx);
                                setFormData({...formData, containers: n});
                              }}
                              className="p-2 text-theme-text-muted hover:text-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">固定挂载 (Volume Mounts)</label>
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            const n = [...formData.containers];
                            n[idx].volume_mounts.push({ pvc_name: '', mount_path: '' });
                            setFormData({...formData, containers: n});
                          }}
                          className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                        >
                          + 添加挂载
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {container.volume_mounts.map((vol: any, volIdx: number) => (
                        <div key={volIdx} className="flex gap-2 items-center">
                          <input
                            disabled={!isEditMode}
                            placeholder="PVC Name"
                            className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={vol.pvc_name}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].volume_mounts[volIdx].pvc_name = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                          <input
                            disabled={!isEditMode}
                            placeholder="Mount Path"
                            className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={vol.mount_path}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].volume_mounts[volIdx].mount_path = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                          <input
                            disabled={!isEditMode}
                            placeholder="Sub Path"
                            className="form-input w-24 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={vol.sub_path}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].volume_mounts[volIdx].sub_path = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                          <label className="flex items-center gap-1 cursor-pointer shrink-0">
                            <input
                              disabled={!isEditMode}
                              type="checkbox"
                              className="w-3 h-3 rounded border-theme-border text-blue-400 disabled:opacity-50"
                              checked={vol.read_only}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].volume_mounts[volIdx].read_only = e.target.checked;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <span className="text-[9px] font-medium text-theme-text-muted uppercase">RO</span>
                          </label>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => {
                                const n = [...formData.containers];
                                n[idx].volume_mounts = n[idx].volume_mounts.filter((_: any, i: number) => i !== volIdx);
                                setFormData({...formData, containers: n});
                              }}
                              className="p-2 text-theme-text-muted hover:text-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2 p-3 bg-theme-surface rounded-xl border border-theme-border">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">存活探针 (Liveness Probe)</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          disabled={!isEditMode}
                          className="px-3 py-1.5 bg-theme-bg-app rounded-lg outline-none text-[10px] font-medium disabled:opacity-70 disabled:bg-theme-elevated"
                          value={container.liveness_probe.type}
                          onChange={e => {
                            const n = [...formData.containers];
                            n[idx].liveness_probe.type = e.target.value;
                            setFormData({...formData, containers: n});
                          }}
                        >
                          <option value="http">HTTP</option>
                          <option value="tcp">TCP</option>
                          <option value="exec">Exec</option>
                        </select>
                        {container.liveness_probe.type !== 'exec' ? (
                          <>
                            <input
                              disabled={!isEditMode}
                              placeholder="Port" type="number"
                              className="form-input text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={container.liveness_probe.port}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].liveness_probe.port = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            {container.liveness_probe.type === 'http' && (
                              <input
                                disabled={!isEditMode}
                                placeholder="Path"
                                className="form-input text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                                value={container.liveness_probe.path}
                                onChange={e => {
                                  const n = [...formData.containers];
                                  n[idx].liveness_probe.path = e.target.value;
                                  setFormData({...formData, containers: n});
                                }}
                              />
                            )}
                          </>
                        ) : (
                          <input
                            disabled={!isEditMode}
                            placeholder="Command (comma separated)"
                            className="form-input col-span-2 text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={container.liveness_probe.command}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].liveness_probe.command = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-2">
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Delay</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.liveness_probe.initial_delay_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].liveness_probe.initial_delay_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Period</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.liveness_probe.period_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].liveness_probe.period_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Timeout</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.liveness_probe.timeout_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].liveness_probe.timeout_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Fail</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.liveness_probe.failure_threshold}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].liveness_probe.failure_threshold = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Succ</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.liveness_probe.success_threshold}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].liveness_probe.success_threshold = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-3 bg-theme-surface rounded-xl border border-theme-border">
                      <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">就绪探针 (Readiness Probe)</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          disabled={!isEditMode}
                          className="px-3 py-1.5 bg-theme-bg-app rounded-lg outline-none text-[10px] font-medium disabled:opacity-70 disabled:bg-theme-elevated"
                          value={container.readiness_probe.type}
                          onChange={e => {
                            const n = [...formData.containers];
                            n[idx].readiness_probe.type = e.target.value;
                            setFormData({...formData, containers: n});
                          }}
                        >
                          <option value="http">HTTP</option>
                          <option value="tcp">TCP</option>
                          <option value="exec">Exec</option>
                        </select>
                        {container.readiness_probe.type !== 'exec' ? (
                          <>
                            <input
                              disabled={!isEditMode}
                              placeholder="Port" type="number"
                              className="form-input text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={container.readiness_probe.port}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].readiness_probe.port = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            {container.readiness_probe.type === 'http' && (
                              <input
                                disabled={!isEditMode}
                                placeholder="Path"
                                className="form-input text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                                value={container.readiness_probe.path}
                                onChange={e => {
                                  const n = [...formData.containers];
                                  n[idx].readiness_probe.path = e.target.value;
                                  setFormData({...formData, containers: n});
                                }}
                              />
                            )}
                          </>
                        ) : (
                          <input
                            disabled={!isEditMode}
                            placeholder="Command (comma separated)"
                            className="form-input col-span-2 text-[10px] font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                            value={container.readiness_probe.command}
                            onChange={e => {
                              const n = [...formData.containers];
                              n[idx].readiness_probe.command = e.target.value;
                              setFormData({...formData, containers: n});
                            }}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-2">
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Delay</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.readiness_probe.initial_delay_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].readiness_probe.initial_delay_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Period</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.readiness_probe.period_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].readiness_probe.period_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Timeout</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.readiness_probe.timeout_seconds}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].readiness_probe.timeout_seconds = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Fail</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.readiness_probe.failure_threshold}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].readiness_probe.failure_threshold = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                         <div className="flex items-center justify-between px-2 py-1 bg-theme-bg-app rounded-lg">
                           <span className="text-[8px] font-medium text-theme-text-muted uppercase">Succ</span>
                           <input
                             disabled={!isEditMode}
                             type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono disabled:opacity-50"
                             value={container.readiness_probe.success_threshold}
                             onChange={e => {
                               const n = [...formData.containers];
                               n[idx].readiness_probe.success_threshold = e.target.value;
                               setFormData({...formData, containers: n});
                             }}
                           />
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">输入环境变量依赖 (Input Env Vars)</label>
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              const n = [...formData.containers];
                              n[idx].input_env_vars.push({ name: '', default_value: '' });
                              setFormData({...formData, containers: n});
                            }}
                            className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                          >
                            + 添加依赖
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {container.input_env_vars.map((env: any, envIdx: number) => (
                          <div key={envIdx} className="flex gap-2 items-center">
                            <input
                              disabled={!isEditMode}
                              placeholder="Name"
                              className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={env.name}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].input_env_vars[envIdx].name = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <input
                              disabled={!isEditMode}
                              placeholder="Default Value"
                              className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={env.default_value}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].input_env_vars[envIdx].default_value = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            {isEditMode && (
                              <button
                                type="button"
                                onClick={() => {
                                  const n = [...formData.containers];
                                  n[idx].input_env_vars = n[idx].input_env_vars.filter((_: any, i: number) => i !== envIdx);
                                  setFormData({...formData, containers: n});
                                }}
                                className="p-2 text-theme-text-muted hover:text-red-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">输入挂载依赖 (Input Mounts)</label>
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              const n = [...formData.containers];
                              n[idx].input_volume_mounts.push({ mount_path: '' });
                              setFormData({...formData, containers: n});
                            }}
                            className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                          >
                            + 添加依赖
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {container.input_volume_mounts.map((vol: any, volIdx: number) => (
                          <div key={volIdx} className="flex gap-2 items-center">
                            <input
                              disabled={!isEditMode}
                              placeholder="Mount Path"
                              className="form-input flex-1 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={vol.mount_path}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].input_volume_mounts[volIdx].mount_path = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <input
                              disabled={!isEditMode}
                              placeholder="Sub Path"
                              className="form-input w-24 text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                              value={vol.sub_path}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].input_volume_mounts[volIdx].sub_path = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <label className="flex items-center gap-1 cursor-pointer shrink-0">
                              <input
                                disabled={!isEditMode}
                                type="checkbox"
                                className="w-3 h-3 rounded border-theme-border text-blue-400 disabled:opacity-50"
                                checked={vol.read_only}
                                onChange={e => {
                                  const n = [...formData.containers];
                                  n[idx].input_volume_mounts[volIdx].read_only = e.target.checked;
                                  setFormData({...formData, containers: n});
                                }}
                              />
                              <span className="text-[9px] font-medium text-theme-text-muted uppercase">RO</span>
                            </label>
                            {isEditMode && (
                              <button
                                type="button"
                                onClick={() => {
                                  const n = [...formData.containers];
                                  n[idx].input_volume_mounts = n[idx].input_volume_mounts.filter((_: any, i: number) => i !== volIdx);
                                  setFormData({...formData, containers: n});
                                }}
                                className="p-2 text-theme-text-muted hover:text-red-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};