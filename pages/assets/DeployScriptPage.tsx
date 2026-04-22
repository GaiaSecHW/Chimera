
import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  File, 
  FileCode, 
  ChevronRight, 
  RefreshCw, 
  Plus, 
  Upload, 
  Trash2, 
  Edit3, 
  Download, 
  MoreVertical, 
  ChevronLeft, 
  Terminal, 
  Save, 
  X, 
  Loader2, 
  AlertTriangle,
  FolderPlus,
  FilePlus,
  Type,
  ArrowLeft,
  FileText,
  Search,
  Check,
  Copy,
  Clock,
  HardDrive,
  ExternalLink
} from 'lucide-react';
import { api } from '../../clients/api';
import { DeployScriptItem } from '../../types/types';

export const DeployScriptPage: React.FC = () => {
  const assetApi = api.domains.assets;
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [items, setItems] = useState<DeployScriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string, content: string } | null>(null);
  const [isMkdirOpen, setIsMkdirOpen] = useState(false);
  const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [targetItem, setTargetItem] = useState<DeployScriptItem | null>(null);
  const [newName, setNewName] = useState('');
  
  const [isActionLoading, setIsActionLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
  }, [currentPath]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await assetApi.deployScript.listFiles(currentPath);
      setItems(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
  };

  const goBack = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath('/' + parts.join('/'));
  };

  const handleCreateDir = async () => {
    if (!newName.trim()) return;
    setIsActionLoading(true);
    try {
      const path = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;
      await assetApi.deployScript.createDirectory(path);
      setIsMkdirOpen(false);
      setNewName('');
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newName.trim()) return;
    setIsActionLoading(true);
    try {
      const path = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;
      // 通过 PUT 接口创建一个空文件
      await assetApi.deployScript.editFile(path, '');
      setIsCreateFileOpen(false);
      setNewName('');
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRename = async () => {
    if (!targetItem || !newName.trim()) return;
    setIsActionLoading(true);
    try {
      await assetApi.deployScript.rename(targetItem.path, newName);
      setIsRenameOpen(false);
      setTargetItem(null);
      setNewName('');
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!targetItem) return;
    setIsActionLoading(true);
    try {
      await assetApi.deployScript.deletePath(targetItem.path);
      setIsDeleteOpen(false);
      setTargetItem(null);
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsActionLoading(true);
    try {
      if (files.length === 1) {
        await assetApi.deployScript.uploadFile(currentPath, files[0]);
      } else {
        await assetApi.deployScript.batchUpload(currentPath, Array.from(files));
      }
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const openEditor = async (item: DeployScriptItem) => {
    setLoading(true);
    try {
      const content = await assetApi.deployScript.getContent(item.path);
      setEditingFile({ path: item.path, content });
      setIsEditorOpen(true);
    } catch (err: any) {
      alert("仅支持编辑文本文件");
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    setIsActionLoading(true);
    try {
      await assetApi.deployScript.editFile(editingFile.path, editingFile.content);
      setIsEditorOpen(false);
      setEditingFile(null);
      fetchItems();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="p-10 h-full flex flex-col space-y-8 animate-in fade-in duration-500 pb-24 overflow-hidden">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-slate-900 text-white rounded-[1.25rem] shadow-xl shadow-slate-900/10">
               <Terminal size={32} />
             </div>
             <div>
               <h2 className="text-3xl font-black text-slate-800 tracking-tight">部署脚本管理</h2>
               <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Script Repository</span>
               </div>
             </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchItems} className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
          </button>
          <div className="flex bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
            <button 
              onClick={() => { setNewName(''); setIsCreateFileOpen(true); }} 
              className="px-5 py-2.5 text-slate-700 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 transition-all"
            >
              <FilePlus size={16} /> 新建文件
            </button>
            <div className="w-[1px] bg-slate-100 mx-1" />
            <button 
              onClick={() => { setNewName(''); setIsMkdirOpen(true); }} 
              className="px-5 py-2.5 text-slate-700 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-amber-50 hover:text-amber-600 transition-all"
            >
              <FolderPlus size={16} /> 新建目录
            </button>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95">
            <Upload size={18} /> 上传文件
          </button>
          <input type="file" multiple hidden ref={fileInputRef} onChange={handleUpload} />
        </div>
      </div>

      {/* Main Browser Window */}
      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
        {/* Browser Navbar */}
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4 flex-1 min-w-0">
              <button 
                onClick={goBack} 
                disabled={currentPath === '/'}
                className="p-2 text-slate-400 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                 <button onClick={() => navigateTo('/')} className="text-sm font-black text-slate-400 hover:text-blue-600 transition-colors">ROOT</button>
                 {pathParts.map((part, idx) => (
                   <React.Fragment key={idx}>
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                      <button 
                        onClick={() => navigateTo('/' + pathParts.slice(0, idx + 1).join('/'))}
                        className={`text-sm font-black transition-colors whitespace-nowrap ${idx === pathParts.length - 1 ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {part.toUpperCase()}
                      </button>
                   </React.Fragment>
                 ))}
              </div>
           </div>

           <div className="relative w-64 ml-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input 
                placeholder="搜索当前目录..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 ring-blue-500/10 transition-all font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        {/* Browser List Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
           {loading && items.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                <Loader2 className="animate-spin text-blue-600" size={48} />
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing Repository...</p>
             </div>
           ) : (
             <table className="w-full text-left table-fixed">
                <thead className="bg-white border-b border-slate-50 sticky top-0 z-10">
                   <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-8 py-4 w-[50%]">名称</th>
                      <th className="px-6 py-4 w-[15%]">大小</th>
                      <th className="px-6 py-4 w-[20%]">修改日期</th>
                      <th className="px-8 py-4 w-[15%] text-right">操作</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {filteredItems.map((item) => (
                      <tr key={item.path} className="hover:bg-blue-50/20 transition-all group">
                         <td className="px-8 py-4">
                            <div 
                              className="flex items-center gap-4 cursor-pointer"
                              onClick={() => item.is_dir ? navigateTo(item.path) : openEditor(item)}
                            >
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.is_dir ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
                                  {item.is_dir ? <Folder size={18} fill="currentColor" className="opacity-40" /> : <FileCode size={18} />}
                               </div>
                               <div className="min-w-0">
                                  <p className="text-sm font-black text-slate-700 truncate group-hover:text-blue-600 transition-colors">{item.name}</p>
                                  {item.is_dir && <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Directory</p>}
                               </div>
                            </div>
                         </td>
                         <td className="px-6 py-4 text-xs font-bold text-slate-400">{item.is_dir ? '-' : formatSize(item.size)}</td>
                         <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                               <Clock size={12} /> {new Date(item.modified_at * 1000).toLocaleString().split(' ')[0]}
                            </div>
                         </td>
                         <td className="px-8 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               {!item.is_dir && (
                                 <>
                                   <button 
                                     onClick={() => openEditor(item)}
                                     className="p-2 text-slate-400 hover:text-blue-600 rounded-lg" title="编辑脚本"
                                   >
                                     <Edit3 size={16} />
                                   </button>
                                   <a 
                                     href={assetApi.deployScript.downloadUrl(item.path)} 
                                     className="p-2 text-slate-400 hover:text-green-600 rounded-lg" title="下载"
                                   >
                                     <Download size={16} />
                                   </a>
                                 </>
                               )}
                               <button 
                                 onClick={() => { setTargetItem(item); setNewName(item.name); setIsRenameOpen(true); }}
                                 className="p-2 text-slate-400 hover:text-amber-600 rounded-lg" title="重命名"
                               >
                                 <Type size={16} />
                               </button>
                               <button 
                                 onClick={() => { setTargetItem(item); setIsDeleteOpen(true); }}
                                 className="p-2 text-slate-400 hover:text-red-500 rounded-lg" title="删除"
                               >
                                 <Trash2 size={16} />
                               </button>
                            </div>
                         </td>
                      </tr>
                   ))}
                   {filteredItems.length === 0 && !loading && (
                      <tr>
                        <td colSpan={4} className="py-32 text-center">
                           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                             <HardDrive size={32} />
                           </div>
                           <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Directory is currently empty</p>
                        </td>
                      </tr>
                   )}
                </tbody>
             </table>
           )}
        </div>

        {/* Action Loading Bar */}
        {isActionLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-600/10 overflow-hidden z-20">
             <div className="h-full bg-blue-600 w-1/3 animate-[loading-slide_2s_infinite_ease-in-out]" />
          </div>
        )}
      </div>

      {/* ONLINE EDITOR OVERLAY */}
      {isEditorOpen && editingFile && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
           <div className="bg-[#0f172a] w-full max-w-6xl h-[90vh] rounded-[3.5rem] shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95">
              <div className="px-12 py-8 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                 <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                       <FileCode size={24} />
                    </div>
                    <div>
                       <h3 className="text-lg font-black text-white tracking-wide">在线编辑: {editingFile.path.split('/').pop()}</h3>
                       <p className="text-[10px] font-mono text-slate-500 uppercase mt-1">Full Path: {editingFile.path}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsEditorOpen(false)} className="p-4 bg-white/5 text-slate-400 hover:text-white rounded-2xl transition-all">
                    <X size={24} />
                 </button>
              </div>
              <div className="flex-1 bg-black/40 relative overflow-hidden">
                 <textarea 
                    className="w-full h-full p-12 bg-transparent border-none outline-none font-mono text-sm text-blue-100/90 leading-relaxed resize-none custom-scrollbar" 
                    value={editingFile.content} 
                    onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                    spellCheck={false}
                    autoFocus
                 />
              </div>
              <div className="px-12 py-8 bg-white/5 border-t border-white/5 flex justify-end gap-6 shrink-0">
                 <button onClick={() => setIsEditorOpen(false)} className="px-10 py-4 bg-white/5 text-slate-400 rounded-2xl text-xs font-black uppercase hover:bg-white/10 transition-all">放弃更改</button>
                 <button 
                   onClick={saveFile} 
                   disabled={isActionLoading}
                   className="px-12 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 flex items-center gap-3 disabled:opacity-50"
                 >
                    {isActionLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    保存至服务器
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {isRenameOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 pb-4">
                 <h3 className="text-xl font-black text-slate-800">重命名资产</h3>
                 <p className="text-sm text-slate-400 mt-1">请输入新的名称，确保不包含非法字符</p>
              </div>
              <div className="p-8 pt-0 space-y-6">
                 <input 
                   autoFocus
                   className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-4 ring-blue-500/10 font-bold" 
                   value={newName} onChange={e => setNewName(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleRename()}
                 />
                 <div className="flex gap-3">
                    <button onClick={() => setIsRenameOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">取消</button>
                    <button onClick={handleRename} disabled={isActionLoading} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 disabled:opacity-50">确认更改</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MKDIR MODAL */}
      {isMkdirOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 pb-4">
                 <h3 className="text-xl font-black text-slate-800">创建新目录</h3>
                 <p className="text-sm text-slate-400 mt-1">将在当前路径下创建一个新的子文件夹</p>
              </div>
              <div className="p-8 pt-0 space-y-6">
                 <input 
                   autoFocus placeholder="请输入目录名"
                   className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-4 ring-blue-500/10 font-bold" 
                   value={newName} onChange={e => setNewName(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleCreateDir()}
                 />
                 <div className="flex gap-3">
                    <button onClick={() => { setIsMkdirOpen(false); setNewName(''); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">取消</button>
                    <button onClick={handleCreateDir} disabled={isActionLoading} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 disabled:opacity-50">创建目录</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CREATE FILE MODAL */}
      {isCreateFileOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 pb-4">
                 <h3 className="text-xl font-black text-slate-800">新建脚本文件</h3>
                 <p className="text-sm text-slate-400 mt-1">请输入文件名（建议包含后缀，如 .sh, .yaml）</p>
              </div>
              <div className="p-8 pt-0 space-y-6">
                 <input 
                   autoFocus placeholder="e.g. exploit.sh"
                   className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-4 ring-blue-500/10 font-bold" 
                   value={newName} onChange={e => setNewName(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
                 />
                 <div className="flex gap-3">
                    <button onClick={() => { setIsCreateFileOpen(false); setNewName(''); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">取消</button>
                    <button onClick={handleCreateFile} disabled={isActionLoading} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 disabled:opacity-50">立即创建</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {isDeleteOpen && targetItem && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-10 text-center">
                 <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle size={40} />
                 </div>
                 <h3 className="text-2xl font-black text-slate-800">确认删除？</h3>
                 <p className="text-slate-500 mt-3 leading-relaxed">
                   您确定要永久删除 <span className="font-black text-red-600">"{targetItem.name}"</span> 吗？<br/>
                   如果这是一个目录，其包含的所有子项将被<span className="font-bold underline uppercase">递归删除</span>。
                 </p>
              </div>
              <div className="px-10 pb-10 flex gap-4">
                 <button onClick={() => setIsDeleteOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all">取消</button>
                 <button onClick={handleDelete} disabled={isActionLoading} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 disabled:opacity-50">立即删除</button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        @keyframes loading-slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(300%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
