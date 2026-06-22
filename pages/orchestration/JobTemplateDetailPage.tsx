import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Settings,
  Loader2,
  Zap,
  Container,
  X,
  Plus,
  Hash
} from 'lucide-react';
import { JobTemplate, TemplateScope, TemplateTag } from '../../types/types';
import { api } from '../../clients/api';
import { PageHeader } from '../../design-system';

export const JobTemplateDetailPage: React.FC<{ templateId: string, onBack: () => void }> = ({ templateId, onBack }) => {
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
  const [template, setTemplate] = useState<JobTemplate | null>(null);
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
    privileged: false,
    image_pull_policy: 'IfNotPresent',
    resources: { requests: { cpu: '', memory: '' }, limits: { cpu: '', memory: '' } }
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scope: 'project' as TemplateScope,
    backoff_limit: 3,
    ttl_seconds_after_finished: 3600,
    tags: [] as TemplateTag[],
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
      const data = await orchestrationApi.workflow.getJobTemplate(templateId);
      setTemplate(data);

      // Transform data for form
      setFormData({
        name: data.name || '',
        description: data.description || '',
        scope: data.scope || 'project',
        backoff_limit: data.backoff_limit ?? 3,
        ttl_seconds_after_finished: data.ttl_seconds_after_finished ?? 3600,
        tags: data.tags || [],
        containers: (data.containers || []).map((c: any) => ({
          ...c,
          command: c.command ? c.command.join(', ') : '',
          args: c.args ? c.args.join(', ') : '',
          env_vars: c.env_vars && c.env_vars.length > 0 ? c.env_vars : [{ name: '', value: '' }],
          volume_mounts: c.volume_mounts && c.volume_mounts.length > 0 ? c.volume_mounts : [{ pvc_name: '', mount_path: '', sub_path: '', read_only: false }],
          input_env_vars: c.input_env_vars && c.input_env_vars.length > 0 ? c.input_env_vars : [{ name: '', default_value: '' }],
          input_volume_mounts: c.input_volume_mounts && c.input_volume_mounts.length > 0 ? c.input_volume_mounts : [{ mount_path: '', sub_path: '', read_only: true }],
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
      containers: formData.containers.map((c: any) => {
        return {
          ...c,
          command: c.command ? c.command.split(',').map((s: string) => s.trim()) : undefined,
          args: c.args ? c.args.split(',').map((s: string) => s.trim()) : undefined,
          env_vars: c.env_vars.filter((e: any) => e.name && e.value),
          volume_mounts: c.volume_mounts.filter((v: any) => v.pvc_name && v.mount_path),
          input_env_vars: c.input_env_vars.filter((e: any) => e.name),
          input_volume_mounts: c.input_volume_mounts.filter((v: any) => v.mount_path),
          resources: (c.resources?.requests?.cpu || c.resources?.limits?.cpu) ? c.resources : undefined
        };
      })
    };

    setIsSubmitting(true);
    try {
      await orchestrationApi.workflow.updateJobTemplate(templateId, payload);
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
        description={<p className="text-xs font-mono text-theme-text-muted mt-1">ID: {template?.id}</p>}
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
                  required placeholder="e.g. nmap-scanner"
                  className="form-input w-full disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">发布范围</label>
                <select
                  disabled={!isEditMode}
                  className="w-full px-4 py-3 bg-theme-elevated rounded-xl border-none outline-none focus:ring-4 ring-blue-500/10 text-sm font-semibold text-theme-text-primary disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.scope} onChange={e => setFormData({...formData, scope: e.target.value as any})}
                >
                  <option value="project">仅限当前项目 (Project-only)</option>
                  <option value="global">公共资源库 (Global)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">重试次数 (Backoff Limit)</label>
                <input
                  disabled={!isEditMode}
                  type="number" min="0" max="10"
                  className="form-input w-full disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.backoff_limit} onChange={e => setFormData({...formData, backoff_limit: parseInt(e.target.value)})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">完成后保留时间 (TTL Seconds)</label>
                <input
                  disabled={!isEditMode}
                  type="number" min="0"
                  className="form-input w-full disabled:opacity-70 disabled:bg-theme-elevated"
                  value={formData.ttl_seconds_after_finished} onChange={e => setFormData({...formData, ttl_seconds_after_finished: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">组件描述</label>
              <textarea
                disabled={!isEditMode}
                placeholder="描述该任务组件的功能、输入输出要求..." rows={2}
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
                      placeholder="输入标签名后回车，例如 port-scan / weak-password"
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
                <Container size={18} className="text-amber-500" /> 容器编排栈
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
                        required placeholder="e.g. main-task"
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
                        required placeholder="e.g. nmap:latest"
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
                        placeholder="e.g. -p, 80 (逗号分隔)"
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
className="w-full px-4 py-2 bg-theme-elevated rounded-xl border border-theme-border outline-none text-xs font-medium disabled:opacity-70 disabled:bg-theme-elevated"
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
                              n[idx].input_volume_mounts.push({ mount_path: '', sub_path: '', read_only: true });
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

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">资源限制 (Resources)</label>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <input
                        disabled={!isEditMode}
                        placeholder="Req CPU (100m)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.resources?.requests?.cpu || ''}
                        onChange={e => {
                          const n = [...formData.containers];
                          if (!n[idx].resources) n[idx].resources = { requests: {}, limits: {} };
                          if (!n[idx].resources.requests) n[idx].resources.requests = {};
                          n[idx].resources.requests.cpu = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                      <input
                        disabled={!isEditMode}
                        placeholder="Req Mem (128Mi)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.resources?.requests?.memory || ''}
                        onChange={e => {
                          const n = [...formData.containers];
                          if (!n[idx].resources) n[idx].resources = { requests: {}, limits: {} };
                          if (!n[idx].resources.requests) n[idx].resources.requests = {};
                          n[idx].resources.requests.memory = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                      <input
                        disabled={!isEditMode}
                        placeholder="Lim CPU (500m)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.resources?.limits?.cpu || ''}
                        onChange={e => {
                          const n = [...formData.containers];
                          if (!n[idx].resources) n[idx].resources = { requests: {}, limits: {} };
                          if (!n[idx].resources.limits) n[idx].resources.limits = {};
                          n[idx].resources.limits.cpu = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
                      <input
                        disabled={!isEditMode}
                        placeholder="Lim Mem (512Mi)"
                        className="form-input w-full text-xs font-mono disabled:opacity-70 disabled:bg-theme-elevated"
                        value={container.resources?.limits?.memory || ''}
                        onChange={e => {
                          const n = [...formData.containers];
                          if (!n[idx].resources) n[idx].resources = { requests: {}, limits: {} };
                          if (!n[idx].resources.limits) n[idx].resources.limits = {};
                          n[idx].resources.limits.memory = e.target.value;
                          setFormData({...formData, containers: n});
                        }}
                      />
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