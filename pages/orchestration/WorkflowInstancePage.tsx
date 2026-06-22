
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Play, StopCircle, Trash2, RefreshCw, Search, Loader2, Clock, Terminal, Plus, Power, PowerOff, Zap, ChevronLeft, ChevronRight, RotateCcw, FileText, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { WorkflowInstance } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../design-system';

export const WorkflowInstancePage: React.FC<{
  projectId: string;
  onNavigateToDetail: (id: string) => void;
  onNavigateToLogs: (id: string) => void;
}> = ({ projectId, onNavigateToDetail, onNavigateToLogs }) => {
  const orchestrationApi = api.domains.orchestration;
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUninitModalOpen, setIsUninitModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null); // null means batch delete
  const [uninitId, setUninitId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    run_mode: 'once',
    trigger_type: 'manual',
    trigger_enabled: false
  });
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (projectId) {
      loadInstances();
      const interval = setInterval(() => loadInstances(), 10000);
      return () => clearInterval(interval);
    }
  }, [projectId, statusFilter]);

  const loadInstances = async () => {
    try {
      setLoading(true);
      const res = await orchestrationApi.workflow.listInstances({
        project_id: projectId,
        status: statusFilter || undefined
      });
      setInstances((res as any).item || (res as any).items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 搜索过滤
  const filteredInstances = useMemo(() => {
    return instances.filter(i =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [instances, searchTerm]);

  // 分页计算
  const totalPages = Math.ceil(filteredInstances.length / pageSize) || 1;
  const paginatedInstances = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredInstances.slice(start, start + pageSize);
  }, [filteredInstances, page, pageSize]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await orchestrationApi.workflow.createInstance({
        ...formData,
        project_id: projectId,
        nodes: [],
        edges: []
      });
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '', run_mode: 'once', trigger_type: 'manual', trigger_enabled: false });
      showToast("创建成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("创建失败:" + e.message,"error");
    }
  };

  const handleStart = async (id: string) => {
    try {
      await orchestrationApi.workflow.startInstance(id);
      showToast("启动成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("启动失败:" + e.message,"error");
    }
  };

  const handleStop = async (id: string) => {
    try {
      await orchestrationApi.workflow.stopInstance(id);
      showToast("停止成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("停止失败:" + e.message,"error");
    }
  };

  const handleSync = async (id: string) => {
    try {
      await orchestrationApi.workflow.syncInstanceStatus(id);
      showToast("同步成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("同步失败:" + e.message,"error");
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await orchestrationApi.workflow.activateInstance(id);
      showToast("启用成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("启用失败:" + e.message,"error");
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await orchestrationApi.workflow.deactivateInstance(id);
      showToast("停用成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("停用失败:" + e.message,"error");
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      if (deletingId) {
        // Single delete
        await orchestrationApi.workflow.deleteInstance(deletingId);
      } else {
        // Batch delete
        await Promise.all(selectedIds.map(id => orchestrationApi.workflow.deleteInstance(id)));
        setSelectedIds([]);
      }
      setIsDeleteModalOpen(false);
      setDeletingId(null);
      showToast(deletingId ?"删除成功" :"批量删除成功","success");
      loadInstances();
    } catch (e: any) {
      showToast("删除失败:" + e.message,"error");
    } finally {
      setLoading(false);
    }
  };

  const handleUninitialize = async () => {
    if (!uninitId) return;
    try {
      setLoading(true);
      await orchestrationApi.workflow.uninitializeInstance(uninitId);
      setIsUninitModalOpen(false);
      setUninitId(null);
      loadInstances();
      showToast("反初始化成功","success");
    } catch (e: any) {
      showToast("反初始化失败:" + e.message,"error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === instances.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(instances.map(i => i.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500">
      <PageHeader
        title="工作流实例"
        description="实时监控安全评估流水线的执行进度与底层容器负载"
        actions={
          <div className="flex gap-4">
            {selectedIds.length > 0 && (
              <button
                onClick={() => {
                  setDeletingId(null);
                  setIsDeleteModalOpen(true);
                }}
                className="flex items-center gap-2 px-6 py-4 bg-red-500/15 text-red-400 rounded-xl hover:bg-red-500/15 transition-all font-medium border border-red-500/20"
              >
                <Trash2 size={20} />
                批量删除 ({selectedIds.length})
              </button>
            )}
            <button onClick={() => loadInstances()} className="p-4 bg-theme-elevated border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 px-6 py-4 bg-theme-surface text-white rounded-lg hover:bg-theme-elevated transition-all font-medium">
              <Plus size={20} />
              创建实例
            </button>
          </div>
        }
      />

      <div className="flex gap-4">
        <div className="relative flex-1">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint" size={20} />
        <input
          type="text" placeholder="搜索实例名称或 ID..."
 className="form-input w-full pl-16 pr-8"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        />
        </div>
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
 className="form-select"
        >
          <option value="">全部状态</option>
          <option value="pending">待初始化</option>
          <option value="unready">未就绪</option>
          <option value="ready">已就绪</option>
        </select>
      </div>

 <div className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden min-h-[500px]">
        <table className="w-full text-left">
          <thead className="bg-slate-100/50 border-b border-theme-border font-semibold text-[10px] text-theme-text-muted uppercase tracking-widest">
            <tr>
              <th className="px-8 py-6 w-10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500"
                  checked={instances.length > 0 && selectedIds.length === instances.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-6 py-6">实例信息</th>
              <th className="px-6 py-6">运行模式</th>
              <th className="px-6 py-6">节点数</th>
              <th className="px-6 py-6">最后运行时间</th>
              <th className="px-6 py-6 text-center">当前状态</th>
              <th className="px-8 py-6 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && instances.length === 0 ? (
              <tr><td colSpan={7} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" size={40} /></td></tr>
            ) : paginatedInstances.map(instance => (
              <tr key={instance.id} className={`hover:bg-theme-elevated transition-all group ${selectedIds.includes(instance.id) ? 'bg-blue-50/30' : ''}`}>
                <td className="px-8 py-6">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500"
                    checked={selectedIds.includes(instance.id)}
                    onChange={() => toggleSelect(instance.id)}
                  />
                </td>
                <td className="px-6 py-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-semibold shadow-inner transition-all ${(instance.status || '').toLowerCase() === 'running' ? 'bg-blue-600 text-white animate-pulse' : 'bg-theme-elevated text-theme-text-muted'}`}>
                      <Activity size={22} />
                    </div>
                    <div>
                      <p
                        className="text-sm font-semibold text-theme-text-primary cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => onNavigateToDetail(instance.id)}
                      >
                        {instance.name}
                      </p>
                      <p className="text-[10px] font-mono text-theme-text-muted uppercase mt-0.5">ID: {instance.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-theme-text-secondary uppercase bg-theme-elevated px-2 py-1 rounded-md w-fit">
                      {instance.run_mode === 'persistent' ? '持久化' : '一次性'}
                    </span>
                    {instance.run_mode === 'persistent' && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md w-fit ${instance.is_active ? 'bg-green-500/15 text-green-400' : 'bg-theme-elevated text-theme-text-muted'}`}>
                        {instance.is_active ? '已激活' : '未激活'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex items-center gap-2 text-xs font-medium text-theme-text-secondary">
                    <Terminal size={14} className="text-blue-500" />
                    <span>{instance.nodes?.length || 0} 节点</span>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex items-center gap-2 text-[10px] font-medium text-theme-text-muted uppercase">
                    <Clock size={12} /> {instance.last_run_at ? instance.last_run_at.replace('T', ' ').split('.')[0] : '尚未运行'}
                  </div>
                </td>
                <td className="px-6 py-6 text-center">
                  <StatusBadge status={instance.status} />
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => onNavigateToLogs(instance.id)} title="查看日志" className="p-3 bg-sky-500/15 text-sky-400 rounded-xl hover:bg-sky-600 hover:text-white transition-all">
                      <FileText size={16} />
                    </button>
                    <button onClick={() => onNavigateToDetail(instance.id)} title="查看详情" className="p-3 bg-indigo-500/15 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                      <Search size={16} />
                    </button>
                    <button onClick={() => handleSync(instance.id)} title="同步状态" className="p-3 bg-blue-500/15 text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                      <RefreshCw size={16} />
                    </button>

                    {(instance.status || '').toLowerCase() === 'pending' && (
                      <button onClick={async () => {
                        try {
                          await orchestrationApi.workflow.initializeInstance(instance.id);
                          showToast("初始化成功","success");
                          loadInstances();
                        } catch (e: any) {
                          showToast("初始化失败:" + e.message,"error");
                        }
                      }} title="初始化" className="p-3 bg-purple-500/15 text-purple-400 rounded-xl hover:bg-purple-600 hover:text-white transition-all">
                        <Activity size={16} />
                      </button>
                    )}

                    {['unready', 'ready'].includes((instance.status || '').toLowerCase()) && (
                      <button onClick={() => {
                        setUninitId(instance.id);
                        setIsUninitModalOpen(true);
                      }} title="反初始化" className="p-3 bg-orange-500/15 text-orange-400 rounded-xl hover:bg-orange-600 hover:text-white transition-all">
                        <RotateCcw size={16} />
                      </button>
                    )}

                    {(instance.status || '').toLowerCase() === 'pending' && (
                      <button onClick={() => handleStart(instance.id)} title="启动" className="p-3 bg-green-500/15 text-green-400 rounded-xl hover:bg-green-600 hover:text-white transition-all">
                        <Play size={16} />
                      </button>
                    )}

                    {['unready', 'ready'].includes((instance.status || '').toLowerCase()) && (
                      <button onClick={() => handleStop(instance.id)} title="停止" className="p-3 bg-amber-500/15 text-amber-400 rounded-xl hover:bg-amber-600 hover:text-white transition-all">
                        <StopCircle size={16} />
                      </button>
                    )}

                    {['unready', 'ready'].includes((instance.status || '').toLowerCase()) && (instance.run_mode === 'once' || instance.is_active) && (
                      <button onClick={async () => {
                        try {
                          await orchestrationApi.workflow.triggerInstance(instance.id);
                          showToast("触发执行成功","success");
                          loadInstances();
                        } catch (e: any) {
                          showToast("触发执行失败:" + e.message,"error");
                        }
                      }} title="触发执行" className="p-3 bg-cyan-500/15 text-cyan-400 rounded-xl hover:bg-cyan-600 hover:text-white transition-all">
                        <Zap size={16} />
                      </button>
                    )}

                    {instance.run_mode === 'persistent' && !instance.is_active && (
                      <button onClick={() => handleActivate(instance.id)} title="激活" className="p-3 bg-emerald-500/15 text-emerald-400 rounded-xl hover:bg-emerald-600 hover:text-white transition-all">
                        <Power size={16} />
                      </button>
                    )}

                    {instance.run_mode === 'persistent' && instance.is_active && (
                      <button onClick={() => handleDeactivate(instance.id)} title="停用" className="p-3 bg-theme-elevated text-theme-text-secondary rounded-xl hover:bg-slate-600 hover:text-white transition-all">
                        <PowerOff size={16} />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setDeletingId(instance.id);
                        setIsDeleteModalOpen(true);
                      }}
                      title="删除"
                      className="p-3 bg-red-500/15 text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {instances.length === 0 && !loading && (
              <tr><td colSpan={7} className="py-40 text-center text-theme-text-muted font-semibold uppercase text-xs tracking-widest italic">暂无工作流实例</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredInstances.length > 0 && (
 <div className="flex items-center justify-between px-8 py-4 bg-theme-surface border border-theme-border rounded-xl">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">每页</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="form-select text-[10px]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
              条 | 共 {filteredInstances.length} 条
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="p-2 text-theme-text-muted hover:text-theme-text-primary disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 py-2 bg-theme-elevated rounded-xl text-sm font-semibold text-theme-text-primary">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 text-theme-text-muted hover:text-theme-text-primary disabled:opacity-30 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <div className="bg-theme-surface rounded-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-theme-border">
              <h3 className="text-2xl font-bold text-theme-text-primary">创建空白实例</h3>
              <p className="text-sm text-theme-text-muted mt-2 font-medium">创建一个不包含任何节点的空白工作流实例，稍后可添加节点。</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-theme-text-secondary mb-2">实例名称</label>
                <input required type="text" className="form-input w-full" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="例如: prod-security-scan" />
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text-secondary mb-2">描述</label>
                <textarea className="form-textarea w-full" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="实例描述信息..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-text-secondary mb-2">运行模式</label>
                  <select className="form-select w-full" value={formData.run_mode} onChange={e => setFormData({...formData, run_mode: e.target.value})}>
                    <option value="once">一次性 (Once)</option>
                    <option value="persistent">持久化 (Persistent)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-text-secondary mb-2">触发类型</label>
                  <select className="form-select w-full" value={formData.trigger_type} onChange={e => setFormData({...formData, trigger_type: e.target.value})}>
                    <option value="manual">手动 (Manual)</option>
                    <option value="http">HTTP触发 (HTTP)</option>
                  </select>
                </div>
              </div>
              {formData.run_mode === 'persistent' && formData.trigger_type === 'http' && (
                <div className="flex items-center gap-3 p-4 bg-blue-500/15 rounded-xl border border-blue-500/20">
                  <input type="checkbox" id="trigger_enabled" className="w-4 h-4 text-blue-400 rounded border-theme-border focus:ring-blue-500" checked={formData.trigger_enabled} onChange={e => setFormData({...formData, trigger_enabled: e.target.checked})} />
                  <label htmlFor="trigger_enabled" className="text-sm font-medium text-blue-300 cursor-pointer">启用触发器</label>
                </div>
              )}
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-theme-elevated text-theme-text-secondary rounded-xl font-medium hover:bg-theme-elevated transition-all">取消</button>
 <button type="submit" className="flex-1 py-4 bg-theme-surface text-white rounded-xl font-medium hover:bg-theme-elevated transition-all">创建</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uninitialize Confirmation Modal */}
      {isUninitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <div className="bg-theme-surface rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-orange-500/15 text-orange-400 rounded-lg flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={40} />
              </div>
              <h3 className="text-2xl font-bold text-theme-text-primary">确认反初始化？</h3>
              <p className="text-theme-text-muted mt-4 font-medium">
                您确定要反初始化这个工作流实例吗？这将删除所有关联的 K8S 资源并重置状态。
              </p>
              <p className="text-red-500 mt-2 font-semibold text-sm bg-red-500/15 p-3 rounded-xl border border-red-500/20">
                警告：所有的非持久化数据将全部丢失！
              </p>
            </div>
            <div className="p-8 bg-theme-elevated flex gap-4">
              <button
                onClick={() => {
                  setIsUninitModalOpen(false);
                  setUninitId(null);
                }}
                className="flex-1 py-4 bg-theme-surface border border-theme-border text-theme-text-secondary rounded-xl font-medium hover:bg-theme-elevated transition-all"
              >
                取消
              </button>
              <button
                onClick={handleUninitialize}
                disabled={loading}
 className="flex-1 py-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-all shadow-orange-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                确认反初始化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <div className="bg-theme-surface rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-500/15 text-red-400 rounded-lg flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-bold text-theme-text-primary">确认删除？</h3>
              <p className="text-theme-text-muted mt-4 font-medium">
                {deletingId
                  ?"您确定要删除这个工作流实例吗？此操作不可撤销，且会清理关联的 K8S 资源。"
                  :`您确定要删除选中的 ${selectedIds.length} 个工作流实例吗？此操作将批量清理所有关联资源。`}
              </p>
            </div>
            <div className="p-8 bg-theme-elevated flex gap-4">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingId(null);
                }}
                className="flex-1 py-4 bg-theme-surface border border-theme-border text-theme-text-secondary rounded-xl font-medium hover:bg-theme-elevated transition-all"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
 className="flex-1 py-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed top-4 left-1/2 z-[99999]"
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
            }`}</style>
 <div className={`px-6 py-3 rounded-xl border font-semibold text-sm flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-600 text-white border-green-500' :
            toast.type === 'error' ? 'bg-red-600 text-white border-red-500' :
            toast.type === 'warning' ? 'bg-yellow-500 text-yellow-300 border-yellow-400' :
            'bg-theme-elevated text-white border-theme-border'
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