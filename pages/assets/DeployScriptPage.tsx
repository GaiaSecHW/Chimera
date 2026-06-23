
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
import { DataTable, DataTableColumn, Modal, PageHeader } from '../../design-system';

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
      const path = currentPath === '/' ?`/${newName}` :`${currentPath}/${newName}`;
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
      const path = currentPath === '/' ?`/${newName}` :`${currentPath}/${newName}`;
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
    <div className="min-h-full bg-theme-bg-app px-4 py-5 md:px-6 2xl:px-8 flex flex-col animate-in fade-in duration-500">
      <div className="w-full space-y-4 flex flex-col flex-1 min-h-0">
      <PageHeader
        title="部署脚本管理"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchItems}
              className="btn btn-secondary"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
            </button>
            <button
              type="button"
              onClick={() => { setNewName(''); setIsCreateFileOpen(true); }}
              className="btn btn-secondary"
            >
              <FilePlus size={16} /> 新建文件
            </button>
            <button
              type="button"
              onClick={() => { setNewName(''); setIsMkdirOpen(true); }}
              className="btn btn-secondary"
            >
              <FolderPlus size={16} /> 新建目录
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-primary"
            >
              <Upload size={16} /> 上传文件
            </button>
            <input type="file" multiple hidden ref={fileInputRef} onChange={handleUpload} />
          </div>
        }
      />

      {/* Main Browser Window */}
 <div className="flex-1 min-h-0 bg-theme-surface overflow-hidden rounded-xl border border-theme-border flex flex-col relative">
        {/* Browser Navbar */}
        <div className="border-b border-theme-border bg-theme-elevated px-4 py-4 md:px-5 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4 flex-1 min-w-0">
              <button
                onClick={goBack}
                disabled={currentPath === '/'}
                className="p-2 text-theme-text-muted hover:text-theme-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft size={20} />
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                 <button onClick={() => navigateTo('/')} className="text-sm font-semibold text-theme-text-muted hover:text-blue-400 transition-colors">ROOT</button>
                 {pathParts.map((part, idx) => (
                   <React.Fragment key={idx}>
                      <ChevronRight size={14} className="text-theme-text-faint shrink-0" />
                      <button
                        onClick={() => navigateTo('/' + pathParts.slice(0, idx + 1).join('/'))}
                        className={`text-sm font-semibold transition-colors whitespace-nowrap ${idx === pathParts.length - 1 ? 'text-blue-400' : 'text-theme-text-muted hover:text-theme-text-secondary'}`}
                      >
                        {part.toUpperCase()}
                      </button>
                   </React.Fragment>
                 ))}
              </div>
           </div>

           <div className="relative w-64 ml-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
              <input
                placeholder="搜索当前目录..."
                className="w-full pl-10 pr-4 py-2 bg-theme-elevated border border-theme-border rounded-xl text-xs outline-none focus:ring-2 ring-blue-500/10 transition-all font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        {/* Browser List Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
           {loading && items.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-theme-text-muted gap-4">
                <Loader2 className="animate-spin text-blue-400" size={48} />
                <p className="text-[10px] font-medium uppercase tracking-[0.2em]">Synchronizing Repository...</p>
             </div>
           ) : (
             (() => {
               const columns: DataTableColumn<DeployScriptItem>[] = [
                 {
                   key: 'name',
                   header: '名称',
                   width: '50%',
                   render: (item) => (
                     <div
                       className="flex items-center gap-4 cursor-pointer"
                       onClick={() => item.is_dir ? navigateTo(item.path) : openEditor(item)}
                     >
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.is_dir ? 'bg-amber-500/15 text-amber-500' : 'bg-blue-500/15 text-blue-500'}`}>
                         {item.is_dir ? <Folder size={18} fill="currentColor" className="opacity-40" /> : <FileCode size={18} />}
                       </div>
                       <div className="min-w-0">
                         <p className="text-sm font-semibold text-theme-text-secondary truncate group-hover:text-blue-400 transition-colors">{item.name}</p>
                         {item.is_dir && <p className="text-[9px] text-theme-text-muted font-medium uppercase tracking-tighter">Directory</p>}
                       </div>
                     </div>
                   ),
                 },
                 {
                   key: 'size',
                   header: '大小',
                   width: '15%',
                   render: (item) => (
                     <span className="text-xs font-medium text-theme-text-muted">{item.is_dir ? '-' : formatSize(item.size)}</span>
                   ),
                 },
                 {
                   key: 'modified_at',
                   header: '修改日期',
                   width: '20%',
                   render: (item) => (
                     <div className="flex items-center gap-2 text-[10px] font-medium text-theme-text-muted uppercase">
                       <Clock size={12} /> {new Date(item.modified_at * 1000).toLocaleString().split(' ')[0]}
                     </div>
                   ),
                 },
                 {
                   key: 'path',
                   header: '操作',
                   width: '15%',
                   align: 'right',
                   render: (item) => (
                     <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       {!item.is_dir && (
                         <>
                           <button
                             onClick={() => openEditor(item)}
                             className="p-2 text-theme-text-muted hover:text-blue-400 rounded-lg" title="编辑脚本"
                           >
                             <Edit3 size={16} />
                           </button>
                           <a
                             href={assetApi.deployScript.downloadUrl(item.path)}
                             className="p-2 text-theme-text-muted hover:text-green-400 rounded-lg" title="下载"
                           >
                             <Download size={16} />
                           </a>
                         </>
                       )}
                       <button
                         onClick={() => { setTargetItem(item); setNewName(item.name); setIsRenameOpen(true); }}
                         className="p-2 text-theme-text-muted hover:text-amber-400 rounded-lg" title="重命名"
                       >
                         <Type size={16} />
                       </button>
                       <button
                         onClick={() => { setTargetItem(item); setIsDeleteOpen(true); }}
                         className="p-2 text-theme-text-muted hover:text-red-500 rounded-lg" title="删除"
                       >
                         <Trash2 size={16} />
                       </button>
                     </div>
                   ),
                 },
               ];
               return (
                 <DataTable
                   columns={columns}
                   data={filteredItems}
                   rowKey={(item) => item.path}
                   empty={
                     !loading && (
                       <div className="py-32 text-center">
                         <div className="w-16 h-16 bg-theme-surface rounded-full flex items-center justify-center mx-auto mb-4 text-theme-text-secondary">
                           <HardDrive size={32} />
                         </div>
                         <p className="text-xs font-medium text-theme-text-muted uppercase tracking-widest">Directory is currently empty</p>
                       </div>
                     )
                   }
                 />
               );
             })()
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
      <Modal
        open={isEditorOpen && !!editingFile}
        onClose={() => setIsEditorOpen(false)}
        className="max-w-6xl"
      >
        {editingFile && (
          <>
            <div className="px-5 py-4 border-b border-slate-200/5 flex items-center justify-between bg-slate-100/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-theme-elevated rounded-lg flex items-center justify-center text-white">
                  <FileCode size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">在线编辑: {editingFile.path.split('/').pop()}</h3>
                  <p className="text-xs font-mono text-theme-text-muted mt-0.5">{editingFile.path}</p>
                </div>
              </div>
              <button onClick={() => setIsEditorOpen(false)} className="rounded-xl p-2 bg-slate-100/10 text-theme-text-muted hover:text-white hover:bg-theme-elevated transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 bg-black/40 relative overflow-hidden">
              <textarea
                className="w-full h-full p-6 bg-transparent border-none outline-none font-mono text-sm text-blue-100/90 leading-relaxed resize-none custom-scrollbar"
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="px-5 py-4 bg-slate-100/10 border-t border-slate-200/5 flex justify-end gap-2 shrink-0">
              <button onClick={() => setIsEditorOpen(false)} className="rounded-xl border border-theme-border bg-slate-100/10 px-3 py-2 text-sm font-medium text-theme-text-faint hover:bg-theme-elevated transition-all">放弃更改</button>
              <button
                onClick={saveFile}
                disabled={isActionLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-primary hover:bg-theme-surface transition-all disabled:opacity-50"
              >
                {isActionLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                保存至服务器
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* RENAME MODAL */}
      <Modal
        open={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        className="max-w-md"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-theme-text-primary">重命名资产</h3>
          <p className="text-sm text-theme-text-muted mt-1">请输入新的名称，确保不包含非法字符</p>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <input
            autoFocus
            className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-medium text-theme-text-primary outline-none focus:ring-2 ring-slate-900/10"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsRenameOpen(false)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated">取消</button>
            <button onClick={handleRename} disabled={isActionLoading} className="rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white hover:bg-theme-elevated disabled:opacity-50">确认更改</button>
          </div>
        </div>
      </Modal>

      {/* MKDIR MODAL */}
      <Modal
        open={isMkdirOpen}
        onClose={() => { setIsMkdirOpen(false); setNewName(''); }}
        className="max-w-md"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-theme-text-primary">创建新目录</h3>
          <p className="text-sm text-theme-text-muted mt-1">将在当前路径下创建一个新的子文件夹</p>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <input
            autoFocus placeholder="请输入目录名"
            className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-medium text-theme-text-primary outline-none focus:ring-2 ring-slate-900/10"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateDir()}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setIsMkdirOpen(false); setNewName(''); }} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated">取消</button>
            <button onClick={handleCreateDir} disabled={isActionLoading} className="rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white hover:bg-theme-elevated disabled:opacity-50">创建目录</button>
          </div>
        </div>
      </Modal>

      {/* CREATE FILE MODAL */}
      <Modal
        open={isCreateFileOpen}
        onClose={() => { setIsCreateFileOpen(false); setNewName(''); }}
        className="max-w-md"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-theme-text-primary">新建脚本文件</h3>
          <p className="text-sm text-theme-text-muted mt-1">请输入文件名（建议包含后缀，如 .sh, .yaml）</p>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <input
            autoFocus placeholder="e.g. exploit.sh"
            className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-medium text-theme-text-primary outline-none focus:ring-2 ring-slate-900/10"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setIsCreateFileOpen(false); setNewName(''); }} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated">取消</button>
            <button onClick={handleCreateFile} disabled={isActionLoading} className="rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white hover:bg-theme-elevated disabled:opacity-50">立即创建</button>
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION */}
      <Modal
        open={isDeleteOpen && !!targetItem}
        onClose={() => setIsDeleteOpen(false)}
        className="max-w-md"
      >
        {targetItem && (
          <>
            <div className="px-5 pt-5 pb-2 text-center">
              <div className="w-14 h-14 bg-red-500/15 text-red-400 rounded-lg flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={28} />
              </div>
              <h3 className="text-lg font-semibold text-theme-text-primary">确认删除？</h3>
              <p className="text-sm text-theme-text-muted mt-2 leading-relaxed">
                您确定要永久删除 <span className="font-semibold text-red-400">"{targetItem.name}"</span> 吗？<br/>
                如果这是一个目录，其包含的所有子项将被<span className="font-medium underline">递归删除</span>。
              </p>
            </div>
            <div className="px-5 pb-5 pt-3 flex justify-end gap-2">
              <button onClick={() => setIsDeleteOpen(false)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated">取消</button>
              <button onClick={handleDelete} disabled={isActionLoading} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">立即删除</button>
            </div>
          </>
        )}
      </Modal>

      <style>{`
        @keyframes loading-slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(300%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      </div>
    </div>
  );
};