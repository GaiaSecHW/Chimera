import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, 
  Database, 
  Trash2, 
  Loader2, 
  Search, 
  Plus, 
  FileBox, 
  Workflow, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle, 
  Archive, 
  Eraser, 
  Clock,
  HardDrive,
  X,
  ChevronRight,
  Info,
  Download,
  FileArchive,
  Layers,
  FileText,
  CheckSquare,
  Square,
  AlertCircle,
  ShieldCheck,
  // 从 lucide-react 引入 RefreshCw 替代受损的本地组件
  RefreshCw
} from 'lucide-react';
import { ProjectResource, ProjectTask, ProjectPVC } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';

interface BaseResourcePageProps {
  type: 'document' | 'software' | 'code' | 'other';
  title: string;
  subtitle: string;
  projectId: string;
}

interface UploadQueueItem {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export const BaseResourcePage: React.FC<BaseResourcePageProps> = ({ type, title, subtitle, projectId }) => {
  const assetApi = api.domains.assets;
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [pvcs, setPvcs] = useState<ProjectPVC[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Deletion State
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; ids: number[]; error: string | null }>({ 
    show: false, ids: [], error: null 
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [globalPvcSize, setGlobalPvcSize] = useState(10);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Log Modal States
  const [logModal, setLogModal] = useState<{ show: boolean; taskId: string; logs: string[] }>({ show: false, taskId: '', logs: [] });
  const [logLoading, setLogLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const prevActiveTaskIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (projectId) {
      loadData();
      const interval = setInterval(loadTasks, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [projectId, type]);

  useEffect(() => {
    const currentTasks = Array.isArray(tasks) ? tasks : [];
    const currentActiveTasks = currentTasks.filter(t => t && (t.status === 'pending' || t.status === 'running'));
    const currentActiveIds = new Set(currentActiveTasks.map(t => t.task_id));

    let someTaskFinished = false;
    prevActiveTaskIds.current.forEach(id => {
      if (!currentActiveIds.has(id)) {
        someTaskFinished = true;
      }
    });

    if (someTaskFinished) {
      const timer = setTimeout(() => {
        loadData(false);
      }, 1000);
      return () => clearTimeout(timer);
    }

    prevActiveTaskIds.current = currentActiveIds;
  }, [tasks]);

  const loadData = async (showSpinner = true) => {
    if (!projectId) return;
    if (showSpinner) setLoading(true);
    try {
      const [resData, pvcData] = await Promise.all([
        assetApi.resources.list(projectId, type),
        assetApi.resources.getPVCs(projectId)
      ]);
      setResources(Array.isArray(resData) ? resData : []);
      const pvcList = pvcData && Array.isArray(pvcData.pvcs) ? pvcData.pvcs : [];
      setPvcs(pvcList.filter((p: ProjectPVC) => p && p.resource_type === type));
      await loadTasks();
    } catch (err) {
      console.error("Failed to load input data", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadTasks = async () => {
    if (!projectId) return;
    try {
      const taskData = await assetApi.resources.getTasks(projectId);
      setTasks(Array.isArray(taskData) ? taskData : []);
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  };

  const addFilesToQueue = (files: FileList | null) => {
    if (!files) return;
    const newItems: UploadQueueItem[] = Array.from(files).map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      status: 'pending',
      progress: 0
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
  };

  const removeFileFromQueue = (id: string) => {
    if (isUploadingBatch) return;
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || uploadQueue.length === 0) return;
    
    setIsUploadingBatch(true);
    let anyFailed = false;
    const currentQueue = [...uploadQueue];
    
    for (let i = 0; i < currentQueue.length; i++) {
      const item = currentQueue[i];
      if (item.status === 'completed') continue;

      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 30 } : q));

      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('name', item.file.name.split('.')[0]);
        formData.append('resource_type', type);
        formData.append('project_ids', projectId);
        formData.append('pvc_size', globalPvcSize.toString());

        await assetApi.resources.upload(formData);
        
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'completed', progress: 100 } : q));
      } catch (err: any) {
        anyFailed = true;
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', progress: 0, error: err.message } : q));
      }
    }

    setIsUploadingBatch(false);
    await loadTasks();

    if (!anyFailed) {
      setIsUploadModalOpen(false);
      setUploadQueue([]);
    }
  };

  const handleDeleteClick = (ids: number[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteConfirm({ show: true, ids, error: null });
  };

  const executeDelete = async () => {
    if (deleteConfirm.ids.length === 0) return;
    setIsDeleting(true);
    setDeleteConfirm(prev => ({ ...prev, error: null }));
    try {
      for (const id of deleteConfirm.ids) {
        await assetApi.resources.delete(id);
      }
      setDeleteConfirm({ show: false, ids: [], error: null });
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      setDeleteConfirm(prev => ({ ...prev, error: err.message }));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredResources = useMemo(() => {
    const safeResources = Array.isArray(resources) ? resources : [];
    return safeResources.filter(r => 
      r && (r.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [resources, searchTerm]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResources.length && filteredResources.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResources.map(r => r.id)));
    }
  };

  const showTaskLogs = async (taskId: string) => {
    setLogModal({ show: true, taskId, logs: [] });
    setLogLoading(true);
    try {
      const res = await assetApi.resources.getTaskLogs(taskId);
      setLogModal(prev => ({ ...prev, logs: res.logs || [] }));
    } catch (err: any) {
      alert("获取日志失败");
    } finally {
      setLogLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    addFilesToQueue(e.dataTransfer.files);
  };

  return (
    <div className="p-10 space-y-10 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto relative">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/20">
               <Layers size={24} />
             </div>
             <h2 className="text-3xl font-black text-slate-800 tracking-tight">{title}</h2>
          </div>
          <p className="text-slate-500 font-medium">{subtitle}</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => loadData()}
            className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            title="手动刷新数据"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => {
              setUploadQueue([]);
              setIsUploadModalOpen(true);
            }}
            disabled={!projectId}
            className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-slate-800 shadow-xl shadow-slate-900/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <Plus size={20} /> 批量上传资产
          </button>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-40 bg-slate-900 px-8 py-4 rounded-3xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                 <CheckCircle2 size={20} />
              </div>
              <span className="text-sm font-black text-white uppercase tracking-widest">已选中 {selectedIds.size} 项资产</span>
           </div>
           <div className="flex gap-4">
              <button 
                onClick={(e) => handleDeleteClick(Array.from(selectedIds), e)}
                className="px-6 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500/20 transition-all"
              >
                 <Trash2 size={16} /> 批量销毁
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="px-6 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition-all"
              >
                 取消选择
              </button>
           </div>
        </div>
      )}

      {/* List Table */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input 
            type="text" 
            placeholder="搜索资产名称、原始文件名或 UUID..." 
            className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[400px]">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-5 w-12 text-center">
                  <button onClick={toggleSelectAll} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                    {selectedIds.size === filteredResources.length && filteredResources.length > 0 ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-5">资源名称 / 原始文件</th>
                <th className="px-6 py-5">PVC 存储实例</th>
                <th className="px-6 py-5">大小 / 配额</th>
                <th className="px-6 py-5">入库状态</th>
                <th className="px-8 py-5 text-right">操作管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></td></tr>
              ) : filteredResources.map(res => (
                <tr 
                  key={res.id} 
                  className={`hover:bg-slate-50 transition-all group cursor-pointer ${selectedIds.has(res.id) ? 'bg-blue-50/30' : ''}`}
                  onClick={(e) => toggleSelect(res.id, e)}
                >
                  <td className="px-6 py-6 text-center">
                    <button className="p-2">
                      {selectedIds.has(res.id) ? (
                        <CheckSquare size={18} className="text-blue-600" />
                      ) : (
                        <Square size={18} className="text-slate-300 hover:text-slate-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black transition-all shadow-sm ${selectedIds.has(res.id) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>
                        {(res.name || 'R')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{res.name}</p>
                        <p className="text-[10px] font-mono text-slate-400 uppercase truncate mt-0.5">{res.original_file_name || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <HardDrive size={14} className="text-slate-300" />
                        <span>{res.pvc_name || 'Allocating...'}</span>
                      </div>
                      <p className="text-[9px] font-mono text-slate-400 uppercase">NS: {res.pvc_namespace || '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg w-fit">
                        {(res.original_file_size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Quota: {res.pvc_size}Gi</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <StatusBadge status={res.upload_status} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a 
                        href={assetApi.resources.downloadFile(res.resource_uuid)}
                        className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        onClick={e => e.stopPropagation()}
                        title="下载原始压缩包"
                      >
                        <Download size={16} />
                      </a>
                      <button 
                        onClick={(e) => handleDeleteClick([res.id], e)}
                        className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="删除并清理 PVC"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <AlertTriangle size={48} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">确认销毁资产？</h3>
              <p className="text-slate-500 mt-4 font-medium leading-relaxed">
                您正准备永久删除 <span className="text-red-600 font-black">{deleteConfirm.ids.length}</span> 项测试资产。
                此操作将同步销毁关联的 <span className="text-red-600 font-black">K8S PVC 存储卷</span>。该过程<span className="font-black">不可逆</span>。
              </p>
              {deleteConfirm.error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-left animate-in slide-in-from-top-2">
                   <div className="flex gap-3 text-red-700 font-black text-xs items-start">
                      <AlertCircle size={18} className="shrink-0" />
                      <div className="space-y-1">
                         <p className="uppercase tracking-widest">操作失败</p>
                         <p className="font-medium text-[11px] leading-relaxed text-red-600/80">{deleteConfirm.error}</p>
                      </div>
                   </div>
                </div>
              )}
            </div>
            <div className="px-10 pb-10 flex gap-4">
              <button 
                onClick={() => setDeleteConfirm({ show: false, ids: [], error: null })}
                disabled={isDeleting}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
              >
                {deleteConfirm.error ? '关闭' : '保留资产'}
              </button>
              {!deleteConfirm.error && (
                <button 
                  onClick={executeDelete}
                  disabled={isDeleting}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  确认销毁
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-4">
                 <div className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-blue-500/20">
                   <Upload size={28} />
                 </div>
                 <div>
                   <h3 className="text-2xl font-black text-slate-800 tracking-tight">批量上传资产</h3>
                   <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">自动配置隔离存储并解压资源</p>
                 </div>
               </div>
               <button onClick={() => !isUploadingBatch && setIsUploadModalOpen(false)} className="p-4 text-slate-400 hover:text-slate-600">
                 <X size={28} />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
               {/* Config Row */}
               <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">K8S 存储配额 (GiB)</label>
                     <span className="text-xs font-black text-blue-600">{globalPvcSize} Gi</span>
                  </div>
                  <input 
                    type="range" min="1" max="100" step="1"
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    value={globalPvcSize}
                    onChange={(e) => setGlobalPvcSize(parseInt(e.target.value))}
                  />
                  <p className="text-[9px] text-slate-400 font-medium italic">注：配额将应用到本次上传的所有独立资源 PVC 实例中</p>
               </div>

               {/* Drop Zone */}
               <div 
                 onDragOver={handleDragOver}
                 onDrop={handleDrop}
                 onClick={() => fileInputRef.current?.click()}
                 className={`border-4 border-dashed rounded-[3rem] p-12 text-center transition-all cursor-pointer group ${
                   isDragging ? 'border-blue-600 bg-blue-50/50 scale-[0.98]' : 'border-slate-100 hover:border-blue-300 hover:bg-slate-50'
                 }`}
               >
                  <input 
                    type="file" multiple className="hidden" ref={fileInputRef}
                    onChange={(e) => addFilesToQueue(e.target.files)}
                  />
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Plus size={40} />
                  </div>
                  <h4 className="text-lg font-black text-slate-800">点击或拖拽文件至此</h4>
                  <p className="text-sm text-slate-400 mt-2 font-medium">支持 .zip, .tar, .gz 等压缩格式，将自动解压至安全沙箱</p>
               </div>

               {/* Upload Queue */}
               {uploadQueue.length > 0 && (
                 <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">待上传队列 ({uploadQueue.length})</h5>
                    <div className="space-y-2">
                       {uploadQueue.map(item => (
                         <div key={item.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group">
                            <div className="flex items-center gap-4 min-w-0">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                 item.status === 'completed' ? 'bg-green-50 text-green-600' :
                                 item.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
                               }`}>
                                  {item.status === 'completed' ? <CheckCircle2 size={18} /> : <FileBox size={18} />}
                               </div>
                               <div className="min-w-0">
                                  <p className="text-xs font-black text-slate-800 truncate">{item.file.name}</p>
                                  <p className="text-[10px] text-slate-400">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                               {item.status === 'uploading' && (
                                 <div className="flex items-center gap-3">
                                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                       <div className="h-full bg-blue-600 animate-pulse" style={{ width: `${item.progress}%` }} />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-600">{item.progress}%</span>
                                 </div>
                               )}
                               {item.status === 'failed' && (
                                 <span className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1">
                                    <AlertCircle size={12} /> 上传失败
                                 </span>
                               )}
                               <button 
                                 onClick={(e) => { e.stopPropagation(); removeFileFromQueue(item.id); }}
                                 disabled={isUploadingBatch}
                                 className="p-2 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                               >
                                  <Trash2 size={16} />
                               </button>
                            </div>
                            {item.error && (
                              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-red-50 border border-red-100 rounded-xl text-[9px] text-red-600 font-bold z-10 animate-in fade-in">
                                {item.error}
                              </div>
                            )}
                         </div>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            <div className="p-10 border-t border-slate-50 bg-slate-50/50 flex gap-4 shrink-0">
               <button 
                 type="button" onClick={() => setIsUploadModalOpen(false)} disabled={isUploadingBatch}
                 className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all"
               >
                 取消
               </button>
               <button 
                 onClick={handleUploadSubmit} disabled={isUploadingBatch || uploadQueue.length === 0}
                 className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
               >
                  {isUploadingBatch ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                  开始上传
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Modal */}
      {logModal.show && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-[#0f172a] w-full max-w-4xl h-[75vh] rounded-[3.5rem] shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95">
             <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/5">
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 bg-blue-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><Terminal size={24} /></div>
                 <div>
                   <h3 className="text-lg font-black text-white uppercase tracking-widest">任务执行详细审计日志</h3>
                   <p className="text-[10px] font-mono text-slate-500 uppercase mt-1">Resource Context Task ID: {logModal.taskId}</p>
                 </div>
               </div>
               <button onClick={() => setLogModal({ ...logModal, show: false })} className="p-4 bg-white/5 text-slate-400 hover:text-white rounded-2xl transition-all">
                 <X size={24} />
               </button>
             </div>
             <div className="flex-1 overflow-y-auto p-12 font-mono text-[11px] text-blue-300/80 space-y-1.5 bg-black/40 custom-scrollbar">
               {logLoading ? (
                 <div className="flex items-center gap-3 text-blue-500 font-black py-20 justify-center">
                   <Loader2 className="animate-spin" size={20} /> 正在同步后端任务缓冲区...
                 </div>
               ) : logModal.logs.length > 0 ? (
                  logModal.logs.map((line, i) => (
                    <div key={i} className="flex gap-6 group hover:bg-white/5 px-2 -mx-2 rounded transition-colors">
                      <span className="text-slate-700 w-8 text-right select-none opacity-50 font-bold">{i+1}</span>
                      <span className="whitespace-pre-wrap leading-relaxed flex-1">{line}</span>
                    </div>
                  ))
               ) : (
                 <div className="py-20 flex flex-col items-center justify-center text-slate-600 space-y-4 opacity-30">
                    <ShieldCheck size={64} />
                    <p className="text-sm uppercase font-black tracking-widest">暂无实时日志输出记录</p>
                 </div>
               )}
             </div>
             <div className="px-12 py-6 bg-white/5 border-t border-white/5 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-[10px] font-black text-green-500 uppercase tracking-widest">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" /> Tunnel Established
                 </div>
                 <div className="h-4 w-[1px] bg-white/10" />
                 <p className="text-[10px] font-black text-slate-500 uppercase">Buffer Size: {logModal.logs.length} Lines</p>
               </div>
               <button 
                onClick={() => showTaskLogs(logModal.taskId)}
                className="px-6 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-500 transition-all flex items-center gap-2"
               >
                 <RefreshCw size={14} /> 刷新缓冲区
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
