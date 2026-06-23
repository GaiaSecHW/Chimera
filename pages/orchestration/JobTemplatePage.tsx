
import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Search,
  Loader2,
  RefreshCw,
  Box,
  Terminal,
  Database,
  ShieldAlert,
  X,
  Container,
  Settings,
  Clock,
  Hash,
  ExternalLink,
  Layers,
  ChevronLeft,
  ChevronRight,
  FileText,
  HardDrive
} from 'lucide-react';
import { JobTemplate, TemplateScope, TemplateTag } from '../../types/types';
import { api } from '../../clients/api';
import { PageHeader } from '../../design-system';

export const JobTemplatePage: React.FC<{ projectId: string, onNavigateToDetail: (id: string) => void }> = ({ projectId, onNavigateToDetail }) => {
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
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [availableTags, setAvailableTags] = useState<TemplateTag[]>([]);
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<TemplateScope>('project');
  const [searchTerm, setSearchTerm] = useState('');

  // Registration Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const defaultContainer = {
    name: 'main',
    image: '',
    command: '',
    args: '',
    env_vars: [{ name: '', value: '' }],
    volume_mounts: [{ pvc_name: '', mount_path: '', sub_path: '', read_only: false }],
    input_env_vars: [{ name: '', default_value: '' }],
    input_volume_mounts: [{ mount_path: '', read_only: true }],
    privileged: false,
    image_pull_policy: 'IfNotPresent',
    resources: { requests: { cpu: '', memory: '' }, limits: { cpu: '', memory: '' } },
    liveness_probe: { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 },
    readiness_probe: { type: 'http', port: '', path: '', initial_delay_seconds: 0, period_seconds: 10, timeout_seconds: 1, failure_threshold: 3, success_threshold: 1 }
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
  const [tagInputValue, setTagInputValue] = useState('');

  useEffect(() => {
    loadTemplates();
  }, [projectId, scope, selectedTagKeys.join(',')]);

  useEffect(() => {
    void loadAvailableTags();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await orchestrationApi.workflow.listJobTemplates({
        scope,
        project_id: scope === 'project' ? projectId : 'all',
        tag_keys: selectedTagKeys.length ? selectedTagKeys.join(',') : undefined,
      });
      setTemplates(res.items || []);
      setCurrentPage(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTags = async () => {
    try {
      const res = await orchestrationApi.workflow.listTemplateTags({ enabled: true });
      setAvailableTags(res.items || []);
    } catch (error) {
      console.error('Failed to load template tags', error);
    }
  };

  const addTagToForm = (rawValue: string) => {
    const tagKey = normalizeTagKey(rawValue);
    if (!tagKey) return;
    if (formData.tags.some((tag) => tag.tag_key === tagKey)) {
      setTagInputValue('');
      return;
    }
    const existingTag = availableTags.find((tag) => tag.tag_key === tagKey);
    setFormData({
      ...formData,
      tags: [
        ...formData.tags,
        existingTag || { tag_key: tagKey, tag_label: rawValue.trim() || tagKey, category: 'capability', color: 'slate' }
      ]
    });
    setTagInputValue('');
  };

  const removeTagFromForm = (tagKey: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((tag) => tag.tag_key !== tagKey) });
  };

  const toggleTagFilter = (tagKey: string) => {
    setSelectedTagKeys((current) =>
      current.includes(tagKey) ? current.filter((item) => item !== tagKey) : [...current, tagKey]
    );
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [templates, searchTerm]);

  const totalPages = Math.ceil(filteredTemplates.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTemplates.slice(start, start + pageSize);
  }, [filteredTemplates, currentPage, pageSize]);

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await orchestrationApi.workflow.deleteJobTemplate(deletingId);
      loadTemplates();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (e: any) {
      alert("删除失败:" + e.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.containers.some(c => !c.image)) {
      alert("请确保所有容器都已指定镜像");
      return;
    }

    const payload = {
      ...formData,
      project_id: formData.scope === 'project' ? projectId : undefined,
      tags: formData.tags,
      containers: formData.containers.map((c: any) => {
        const formatProbe = (p: any) => {
          if (!p.port && p.type !== 'exec') return undefined;
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
          resources: (c.resources?.requests?.cpu || c.resources?.limits?.cpu) ? c.resources : undefined,
          liveness_probe: formatProbe(c.liveness_probe),
          readiness_probe: formatProbe(c.readiness_probe)
        };
      })
    };

    setIsSubmitting(true);
    try {
      await orchestrationApi.workflow.createJobTemplate(payload);
      setIsModalOpen(false);
      setFormData({
        name: '', description: '', scope: 'project', backoff_limit: 3, ttl_seconds_after_finished: 3600,
        tags: [],
        containers: [ JSON.parse(JSON.stringify(defaultContainer)) ]
      });
      setTagInputValue('');
      await loadAvailableTags();
      loadTemplates();
    } catch (err: any) {
      alert("创建失败:" + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <PageHeader
        title="任务模板"
        description="管理一次性安全探测任务（扫描、爆破、Fuzzing）的容器运行规范"
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadTemplates}
              className="btn-icon group"
              aria-label="刷新"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
            </button>
            <div className="inline-flex items-center bg-theme-elevated border border-theme-border rounded-lg p-1">
              <button
                type="button"
                onClick={() => setScope('project')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase transition-all ${scope === 'project' ? 'bg-brand-primary text-white' : 'text-theme-text-muted hover:bg-theme-surface'}`}
              >
                当前项目
              </button>
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase transition-all ${scope === 'global' ? 'bg-brand-primary text-white' : 'text-theme-text-muted hover:bg-theme-surface'}`}
              >
                全局库
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
            >
              <Plus size={16} /> 注册任务组件
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint group-focus-within:text-blue-500 transition-colors" size={20} />
        <input
          type="text"
          placeholder="搜索任务模板名称或 ID..."
 className="form-input w-full pl-16 pr-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {availableTags.length > 0 && (
 <div className="bg-theme-surface border border-theme-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
              <Hash size={12} className="text-amber-500" />
              模板标签筛选
            </div>
            {selectedTagKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTagKeys([])}
                className="text-[10px] font-medium text-theme-text-muted hover:text-blue-400 uppercase tracking-widest transition-colors"
              >
                清空筛选
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const selected = selectedTagKeys.includes(tag.tag_key);
              return (
                <button
                  key={tag.tag_key}
                  type="button"
                  onClick={() => toggleTagFilter(tag.tag_key)}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all ${
 selected ? 'bg-theme-surface text-white border-theme-border ' : getTagClasses(tag.color)
                  }`}
                >
                  #{tag.tag_label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List Content - Card Grid */}
 <div className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden p-6">
        {loading ? (
          <div className="py-32 text-center">
            <Loader2 className="animate-spin mx-auto text-blue-400" size={40} />
            <p className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest mt-4">同步仓库数据中...</p>
          </div>
        ) : paginatedItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedItems.map(t => (
              <div
                key={t.id}
 className="group relative bg-theme-surface hover:bg-theme-surface border-2 border-theme-border hover:border-blue-500/20 rounded-xl p-6 transition-all cursor-pointer"
                onClick={() => onNavigateToDetail(t.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
 <div className="w-12 h-12 bg-amber-500/15 group-hover:bg-amber-500 rounded-xl flex items-center justify-center transition-all">
                      <Zap className="text-amber-400 group-hover:text-white transition-colors" size={22} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-theme-text-primary tracking-tight truncate group-hover:text-blue-400 transition-colors">
                        {t.name}
                      </h4>
                      <span className="text-[10px] font-mono text-theme-text-muted font-medium truncate block max-w-[150px]">
                        {t.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-theme-text-muted mb-4 line-clamp-2 min-h-[32px] font-medium">
                  {t.description || '暂无描述信息'}
                </p>

                {t.tags && t.tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag.tag_key}
                        className={`px-2.5 py-1 rounded-full border text-[10px] font-medium ${getTagClasses(tag.color)}`}
                      >
                        #{tag.tag_label}
                      </span>
                    ))}
                    {t.tags.length > 4 && (
                      <span className="px-2.5 py-1 rounded-full border border-theme-border bg-theme-elevated text-theme-text-muted text-[10px] font-medium">
                        +{t.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Containers */}
                <div className="mb-4">
                  <div className="text-[9px] font-medium text-theme-text-muted uppercase tracking-widest mb-2">容器编排</div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.containers?.slice(0, 3).map((c, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-lg border border-blue-500/20 text-[9px] font-medium uppercase">
                        {c.name}
                      </span>
                    ))}
                    {t.containers && t.containers.length > 3 && (
                      <span className="px-2 py-0.5 bg-theme-elevated text-theme-text-muted rounded-lg text-[9px] font-medium">
                        +{t.containers.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 bg-theme-surface rounded-xl p-3 border border-theme-border">
                    <div className="text-[8px] font-medium text-theme-text-faint uppercase tracking-widest mb-1">Retry</div>
                    <div className="text-sm font-semibold text-theme-text-secondary">{t.backoff_limit}</div>
                  </div>
                  <div className="flex-1 bg-theme-surface rounded-xl p-3 border border-theme-border">
                    <div className="text-[8px] font-medium text-theme-text-faint uppercase tracking-widest mb-1">TTL</div>
                    <div className="text-sm font-semibold text-theme-text-secondary">{t.ttl_seconds_after_finished}s</div>
                  </div>
                </div>

                {/* Dependencies */}
                <div className="flex items-center gap-3 mb-4">
                  {(() => {
                    const inputEnvCount = t.containers?.reduce((sum, c) => sum + (c.input_env_vars?.length || 0), 0) || 0;
                    const inputMountCount = t.containers?.reduce((sum, c) => sum + (c.input_volume_mounts?.length || 0), 0) || 0;
                    return (
                      <>
                        <div className="flex-1 bg-emerald-500/15 rounded-xl p-2.5 border border-emerald-500/20">
                          <div className="flex items-center gap-1.5">
                            <FileText size={12} className="text-emerald-500" />
                            <span className="text-[8px] font-medium text-emerald-400 uppercase tracking-widest">环境依赖</span>
                          </div>
                          <div className="text-sm font-semibold text-emerald-400 mt-1">{inputEnvCount}</div>
                        </div>
                        <div className="flex-1 bg-violet-500/15 rounded-xl p-2.5 border border-violet-500/20">
                          <div className="flex items-center gap-1.5">
                            <HardDrive size={12} className="text-violet-500" />
                            <span className="text-[8px] font-medium text-violet-400 uppercase tracking-widest">挂载依赖</span>
                          </div>
                          <div className="text-sm font-semibold text-violet-400 mt-1">{inputMountCount}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-theme-border">
                  <div className="flex items-center gap-2 text-[10px] text-theme-text-muted">
                    <Clock size={12} />
                    <span>{t.created_at?.split('T')[0]}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToDetail(t.id); }}
                      className="p-2 text-theme-text-muted hover:text-blue-400 hover:bg-blue-500/15 rounded-lg transition-all"
                      title="查看详情"
                    >
                      <ExternalLink size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="p-2 text-theme-text-muted hover:text-red-500 hover:bg-red-500/15 rounded-lg transition-all"
                      title="删除模板"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-40 text-center">
            <div className="w-16 h-16 bg-theme-elevated rounded-full flex items-center justify-center mx-auto mb-4 text-theme-text-faint">
              <Zap size={32} />
            </div>
            <p className="text-sm font-semibold text-theme-text-muted uppercase tracking-widest italic">暂无匹配的任务模板资产</p>
          </div>
        )}

        {/* Footer Pagination */}
        <div className="px-8 py-6 bg-slate-100/50 border-t border-theme-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">每页</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="form-select text-[10px]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
              条 | 共 {filteredTemplates.length} 条
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              disabled={currentPage === 1 || loading}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 className="p-2.5 bg-theme-surface border border-theme-border rounded-xl text-theme-text-muted hover:text-blue-400 disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
 className={`w-9 h-9 rounded-xl text-[10px] font-medium transition-all ${currentPage === i + 1 ? 'bg-blue-600 text-white ' : 'bg-theme-surface text-theme-text-muted hover:bg-theme-elevated border border-theme-border'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || loading}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 className="p-2.5 bg-theme-surface border border-theme-border rounded-xl text-theme-text-muted hover:text-blue-400 disabled:opacity-30 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-surface w-full max-w-4xl rounded-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-theme-border bg-slate-100/30 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-4">
 <div className="w-14 h-14 bg-theme-surface text-white rounded-xl flex items-center justify-center">
                   <Plus size={28} />
                 </div>
                 <div>
                   <h3 className="text-2xl font-bold text-theme-text-primary tracking-tight">注册任务组件</h3>
                 </div>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="p-4 text-theme-text-muted hover:text-theme-text-secondary transition-colors">
                 <X size={28} />
               </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
               {/* Basic Info */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">模板名称 <span className="required"> *</span></label>
                    <input
                      required placeholder="e.g. nmap-scanner"
                      className="form-input w-full"
                      value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">发布范围</label>
                    <select
                      className="form-select w-full"
                      value={formData.scope} onChange={e => setFormData({...formData, scope: e.target.value as any})}
                    >
                      <option value="project">仅限当前项目 (Project-only)</option>
                      <option value="global">公共资源库 (Global)</option>
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">重试次数 (Backoff Limit)</label>
                    <input
                      type="number" min="0" max="10"
                      className="form-input w-full"
                      value={formData.backoff_limit} onChange={e => setFormData({...formData, backoff_limit: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">完成后保留时间 (TTL Seconds)</label>
                    <input
                      type="number" min="0"
                      className="form-input w-full"
                      value={formData.ttl_seconds_after_finished} onChange={e => setFormData({...formData, ttl_seconds_after_finished: parseInt(e.target.value)})}
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">组件描述</label>
                  <textarea
                    placeholder="描述该任务组件的功能、输入输出要求..." rows={2}
                    className="form-textarea w-full resize-none"
                    value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  />
               </div>

               <div className="space-y-3 rounded-xl border border-theme-border bg-theme-elevated p-5">
                  <div className="flex items-center gap-2">
                    <Hash size={15} className="text-amber-500" />
                    <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">模板 TAG</label>
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      type="text"
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
                      className="px-5 py-3 rounded-xl bg-theme-surface text-white text-xs font-semibold uppercase tracking-widest hover:bg-theme-elevated transition-colors"
                    >
                      添加标签
                    </button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag) => (
                        <button
                          key={tag.tag_key}
                          type="button"
                          onClick={() => removeTagFromForm(tag.tag_key)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all ${getTagClasses(tag.color)}`}
                        >
                          <span>#{tag.tag_label}</span>
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                  {availableTags.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">快捷选择</div>
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
                    </div>
                  )}
               </div>

               {/* Container Stack */}
               <div className="pt-4 border-t border-theme-border space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-medium text-theme-text-secondary uppercase tracking-widest flex items-center gap-2">
                      <Container size={16} className="text-amber-500" /> 容器编排栈 (Container Stack)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, containers: [...formData.containers, JSON.parse(JSON.stringify(defaultContainer))]})}
                      className="text-[10px] font-medium text-blue-400 hover:underline uppercase tracking-widest"
                    >
                       + 添加辅助容器
                    </button>
                  </div>

                  <div className="space-y-4">
                    {formData.containers.map((container: any, idx) => (
                      <div key={idx} className="p-4 bg-theme-surface rounded-xl border border-theme-border relative group/c space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">容器名称</label>
                            <input
                              required placeholder="e.g. main-task"
                              className="form-input w-full text-xs"
                              value={container.name}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].name = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">镜像 (Image) <span className="required"> *</span></label>
                            <input
                              required placeholder="e.g. nmap:latest"
                              className="form-input w-full text-xs font-mono text-blue-400"
                              value={container.image}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].image = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">启动命令 (Command)</label>
                            <input
                              placeholder="e.g. /bin/sh, -c (逗号分隔)"
                              className="form-input w-full text-xs font-mono"
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
                              placeholder="e.g. -p, 80 (逗号分隔)"
                              className="form-input w-full text-xs font-mono"
                              value={container.args}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].args = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">拉取策略 (Image Pull Policy)</label>
                            <select
className="form-select w-full text-xs"
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
                                type="checkbox"
                                className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500"
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
                          </div>
                          <div className="space-y-2">
                            {container.env_vars.map((env: any, envIdx: number) => (
                              <div key={envIdx} className="flex gap-2 items-center">
                                <input
                                  placeholder="Name"
                                  className="form-input flex-1 text-xs font-mono"
                                  value={env.name}
                                  onChange={e => {
                                    const n = [...formData.containers];
                                    n[idx].env_vars[envIdx].name = e.target.value;
                                    setFormData({...formData, containers: n});
                                  }}
                                />
                                <input
                                  placeholder="Value"
                                  className="form-input flex-1 text-xs font-mono"
                                  value={env.value}
                                  onChange={e => {
                                    const n = [...formData.containers];
                                    n[idx].env_vars[envIdx].value = e.target.value;
                                    setFormData({...formData, containers: n});
                                  }}
                                />
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
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">固定挂载 (Volume Mounts)</label>
                            <button
                              type="button"
                              onClick={() => {
                                const n = [...formData.containers];
                                n[idx].volume_mounts.push({ pvc_name: '', mount_path: '', sub_path: '', read_only: false });
                                setFormData({...formData, containers: n});
                              }}
                              className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                            >
                              + 添加挂载
                            </button>
                          </div>
                          <div className="space-y-2">
                            {container.volume_mounts.map((vol: any, volIdx: number) => (
                              <div key={volIdx} className="flex gap-2 items-center">
                                <input
                                  placeholder="PVC Name"
                                  className="form-input flex-1 text-xs font-mono"
                                  value={vol.pvc_name}
                                  onChange={e => {
                                    const n = [...formData.containers];
                                    n[idx].volume_mounts[volIdx].pvc_name = e.target.value;
                                    setFormData({...formData, containers: n});
                                  }}
                                />
                                <input
                                  placeholder="Mount Path"
                                  className="form-input flex-1 text-xs font-mono"
                                  value={vol.mount_path}
                                  onChange={e => {
                                    const n = [...formData.containers];
                                    n[idx].volume_mounts[volIdx].mount_path = e.target.value;
                                    setFormData({...formData, containers: n});
                                  }}
                                />
                                <input
                                  placeholder="Sub Path"
                                  className="form-input w-24 text-xs font-mono"
                                  value={vol.sub_path}
                                  onChange={e => {
                                    const n = [...formData.containers];
                                    n[idx].volume_mounts[volIdx].sub_path = e.target.value;
                                    setFormData({...formData, containers: n});
                                  }}
                                />
                                <label className="flex items-center gap-1 cursor-pointer shrink-0">
                                  <input
                                    type="checkbox"
                                    className="w-3 h-3 rounded border-theme-border text-blue-400"
                                    checked={vol.read_only}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].volume_mounts[volIdx].read_only = e.target.checked;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
                                  <span className="text-[9px] font-medium text-theme-text-muted uppercase">RO</span>
                                </label>
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
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">输入环境变量依赖 (Input Env Vars)</label>
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
                            </div>
                            <div className="space-y-2">
                              {container.input_env_vars.map((env: any, envIdx: number) => (
                                <div key={envIdx} className="flex gap-2 items-center">
                                  <input
                                    placeholder="Name"
                                    className="form-input flex-1 text-xs font-mono"
                                    value={env.name}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].input_env_vars[envIdx].name = e.target.value;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
                                  <input
                                    placeholder="Default Value"
                                    className="form-input flex-1 text-xs font-mono"
                                    value={env.default_value}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].input_env_vars[envIdx].default_value = e.target.value;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
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
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">输入挂载依赖 (Input Mounts)</label>
                              <button
                                type="button"
                                onClick={() => {
                                  const n = [...formData.containers];
                                  n[idx].input_volume_mounts.push({ mount_path: '', read_only: true });
                                  setFormData({...formData, containers: n});
                                }}
                                className="text-[9px] font-medium text-blue-400 hover:underline uppercase"
                              >
                                + 添加依赖
                              </button>
                            </div>
                            <div className="space-y-2">
                              {container.input_volume_mounts.map((vol: any, volIdx: number) => (
                                <div key={volIdx} className="flex gap-2 items-center">
                                  <input
                                    placeholder="Mount Path"
                                    className="form-input flex-1 text-xs font-mono"
                                    value={vol.mount_path}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].input_volume_mounts[volIdx].mount_path = e.target.value;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
                                  <label className="flex items-center gap-1 cursor-pointer shrink-0">
                                    <input
                                      type="checkbox"
                                      className="w-3 h-3 rounded border-theme-border text-blue-400"
                                      checked={vol.read_only}
                                      onChange={e => {
                                        const n = [...formData.containers];
                                        n[idx].input_volume_mounts[volIdx].read_only = e.target.checked;
                                        setFormData({...formData, containers: n});
                                      }}
                                    />
                                    <span className="text-[9px] font-medium text-theme-text-muted uppercase">RO</span>
                                  </label>
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
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">资源限制 (Resources)</label>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            <input
                              placeholder="Req CPU (100m)"
                              className="form-input w-full text-xs font-mono"
                              value={container.resources.requests.cpu}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].resources.requests.cpu = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <input
                              placeholder="Req Mem (128Mi)"
                              className="form-input w-full text-xs font-mono"
                              value={container.resources.requests.memory}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].resources.requests.memory = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <input
                              placeholder="Lim CPU (500m)"
                              className="form-input w-full text-xs font-mono"
                              value={container.resources.limits.cpu}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].resources.limits.cpu = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                            <input
                              placeholder="Lim Mem (512Mi)"
                              className="form-input w-full text-xs font-mono"
                              value={container.resources.limits.memory}
                              onChange={e => {
                                const n = [...formData.containers];
                                n[idx].resources.limits.memory = e.target.value;
                                setFormData({...formData, containers: n});
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          <div className="space-y-2 p-3 bg-theme-surface rounded-xl border border-theme-border">
                            <label className="text-[9px] font-medium text-theme-text-muted uppercase ml-1">存活探针 (Liveness Probe)</label>
                            <div className="grid grid-cols-3 gap-2">
                              <select
                                className="form-select text-[10px]"
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
                                    placeholder="Port" type="number"
                                    className="form-input text-[10px] font-mono"
                                    value={container.liveness_probe.port}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].liveness_probe.port = e.target.value;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
                                  {container.liveness_probe.type === 'http' && (
                                    <input
                                      placeholder="Path"
                                      className="form-input text-[10px] font-mono"
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
                                  placeholder="Command (comma separated)"
                                  className="form-input col-span-2 text-[10px] font-mono"
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
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Delay</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.liveness_probe.initial_delay_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].liveness_probe.initial_delay_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Period</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.liveness_probe.period_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].liveness_probe.period_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Timeout</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.liveness_probe.timeout_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].liveness_probe.timeout_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Fail</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.liveness_probe.failure_threshold}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].liveness_probe.failure_threshold = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Succ</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
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
                                className="form-select text-[10px]"
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
                                    placeholder="Port" type="number"
                                    className="form-input text-[10px] font-mono"
                                    value={container.readiness_probe.port}
                                    onChange={e => {
                                      const n = [...formData.containers];
                                      n[idx].readiness_probe.port = e.target.value;
                                      setFormData({...formData, containers: n});
                                    }}
                                  />
                                  {container.readiness_probe.type === 'http' && (
                                    <input
                                      placeholder="Path"
                                      className="form-input text-[10px] font-mono"
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
                                  placeholder="Command (comma separated)"
                                  className="form-input col-span-2 text-[10px] font-mono"
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
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Delay</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.readiness_probe.initial_delay_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].readiness_probe.initial_delay_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Period</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.readiness_probe.period_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].readiness_probe.period_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Timeout</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.readiness_probe.timeout_seconds}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].readiness_probe.timeout_seconds = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Fail</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
                                   value={container.readiness_probe.failure_threshold}
                                   onChange={e => {
                                     const n = [...formData.containers];
                                     n[idx].readiness_probe.failure_threshold = e.target.value;
                                     setFormData({...formData, containers: n});
                                   }}
                                 />
                               </div>
                               <div className="flex items-center justify-between px-2 py-1 bg-theme-elevated rounded-lg">
                                 <span className="text-[8px] font-medium text-theme-text-muted uppercase">Succ</span>
                                 <input
                                   type="number" className="w-8 bg-transparent text-right outline-none text-[10px] font-mono"
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
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, containers: formData.containers.filter((_, i) => i !== idx)})}
 className="absolute -top-2 -right-2 w-8 h-8 bg-red-500/15 text-red-500 rounded-full flex items-center justify-center border border-red-500/20 opacity-0 group-hover/c:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
               </div>
            </form>

            <div className="p-6 border-t border-theme-border bg-slate-100/50 flex gap-4 shrink-0">
               <button
                 type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}
                 className="btn-secondary"
               >
                 取消
               </button>
               <button
                 onClick={handleCreate} disabled={isSubmitting}
 className="btn-primary disabled:opacity-50"
               >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} className="text-amber-400" />}
                  确认注册任务组件
               </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <div className="bg-theme-surface rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 bg-red-500/15 text-red-500 rounded-lg flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-bold text-theme-text-primary">确认删除？</h3>
              <p className="text-theme-text-muted mt-4 font-medium">
                您确定要删除这个任务模板吗？此操作无法撤销。
              </p>
            </div>
            <div className="p-6 bg-theme-surface flex gap-4">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingId(null);
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
 className="flex-1 py-4 btn-danger-soft"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};