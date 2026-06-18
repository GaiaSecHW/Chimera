import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckSquare,
  Clock,
  Database,
  FileArchive,
  FileBox,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal, PageHeader } from '../../design-system';
import { ProjectInputUploadRecord, ProjectInputUploadStats } from '../../types/types';
import {
  filterUploadRecords,
  formatUploadBytes,
  getLatestBatchSummary,
  getUploadModeLabel,
  getUploadRecordDisplayName,
  isAllowedArchiveFileName,
} from './baseResourcePageModel';

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

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const isAllowedArchiveFile = (file: File) => isAllowedArchiveFileName(file.name || '');

export const BaseResourcePage: React.FC<BaseResourcePageProps> = ({ type, title, subtitle, projectId }) => {
  const fileserverApi = api.domains.assets.fileserver;
  const [records, setRecords] = useState<ProjectInputUploadRecord[]>([]);
  const [stats, setStats] = useState<ProjectInputUploadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; ids: string[]; error: string | null }>({
    show: false,
    ids: [],
    error: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAppendMode, setIsAppendMode] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState('');
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [projectId, type]);

  const loadData = async (showSpinner = true) => {
    if (!projectId) return;
    if (showSpinner) setLoading(true);
    try {
      const [listResp, statsResp] = await Promise.all([
        fileserverApi.listProjectInputUploads(projectId, { inputType: type }),
        fileserverApi.getProjectInputUploadStats(projectId, type),
      ]);
      setRecords(Array.isArray(listResp?.items) ? listResp.items : []);
      setStats(statsResp || null);
    } catch (error) {
      console.error('Failed to load project input uploads', error);
      setRecords([]);
      setStats(null);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const openCreateModal = () => {
    setActiveUploadId(null);
    setIsAppendMode(false);
    setUploadDisplayName('');
    setUploadErrorMessage(null);
    setKeepOriginal(false);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
  };

  const openAppendModal = (uploadId: string, recordKeepOriginal: boolean) => {
    setActiveUploadId(uploadId);
    setIsAppendMode(true);
    setUploadDisplayName('');
    setUploadErrorMessage(null);
    setKeepOriginal(recordKeepOriginal);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
  };

  const addFilesToQueue = (files: FileList | null) => {
    if (!files) return;
    const accepted: UploadQueueItem[] = [];
    Array.from(files).forEach((file) => {
      if (keepOriginal || isAllowedArchiveFile(file)) {
        accepted.push({
          file,
          id: Math.random().toString(36).slice(2),
          status: 'pending',
          progress: 0,
        });
      } else {
        accepted.push({
          file,
          id: Math.random().toString(36).slice(2),
          status: 'failed',
          progress: 0,
          error: '仅支持常见压缩包格式',
        });
      }
    });
    setUploadQueue((prev) => [...prev, ...accepted]);
  };

  const removeFileFromQueue = (id: string) => {
    if (isUploadingBatch) return;
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUploadSubmit = async (options?: { runInBackground?: boolean }) => {
    const readyItems = uploadQueue.filter((item) => item.status !== 'failed');
    if (!projectId || readyItems.length === 0) return;
    const normalizedDisplayName = uploadDisplayName.trim();
    if (!isAppendMode && !normalizedDisplayName) {
      setUploadErrorMessage('请填写上传记录名称');
      return;
    }
    setIsUploadingBatch(true);
    if (options?.runInBackground) {
      setIsUploadModalOpen(false);
    }
    setUploadErrorMessage(null);
    setUploadQueue((prev) => prev.map((item) => (item.status === 'failed' ? item : { ...item, status: 'uploading', progress: 35 })));
    try {
      if (isAppendMode && activeUploadId) {
        await fileserverApi.appendProjectInputUpload({
          upload_id: activeUploadId,
          keep_original: keepOriginal,
          upload_mode: keepOriginal ? 'raw' : 'archive',
          files: readyItems.map((item) => item.file),
        });
      } else {
        const created = await fileserverApi.createProjectInputUpload({
          project_id: projectId,
          input_type: type,
          keep_original: keepOriginal,
          upload_mode: keepOriginal ? 'raw' : 'archive',
          files: readyItems.map((item) => item.file),
        });
        try {
          await fileserverApi.updateProjectInputUploadDisplayName({
            upload_id: created.upload_id,
            project_id: projectId,
            display_name: normalizedDisplayName,
          });
        } catch (renameError: any) {
          throw new Error(renameError?.message || '文件已上传，但上传记录名称保存失败');
        }
      }
      setUploadQueue((prev) => prev.map((item) => (item.status === 'failed' ? item : { ...item, status: 'completed', progress: 100 })));
      setIsUploadModalOpen(false);
      setUploadQueue([]);
      setUploadDisplayName('');
      await loadData(false);
    } catch (error: any) {
      const message = error?.message || '上传失败';
      setUploadQueue((prev) => prev.map((item) => (item.status === 'failed' ? item : { ...item, status: 'failed', progress: 0, error: message })));
      setUploadErrorMessage(message);
    } finally {
      setIsUploadingBatch(false);
    }
  };

  const executeDelete = async () => {
    if (deleteConfirm.ids.length === 0 || !projectId) return;
    setIsDeleting(true);
    setDeleteConfirm((prev) => ({ ...prev, error: null }));
    try {
      const result = await fileserverApi.deleteProjectInputUploads({
        project_id: projectId,
        input_type: type,
        upload_ids: deleteConfirm.ids,
      });
      if (result.failed_items?.length) {
        const summary = result.failed_items.map((item) =>`${item.upload_id}: ${item.message}`).join('；');
        setDeleteConfirm((prev) => ({ ...prev, error: summary }));
      } else {
        setDeleteConfirm({ show: false, ids: [], error: null });
      }
      setSelectedIds(new Set());
      await loadData(false);
    } catch (error: any) {
      setDeleteConfirm((prev) => ({ ...prev, error: error?.message || '删除失败' }));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredRecords = useMemo(() => {
    return filterUploadRecords(records, searchTerm);
  }, [records, searchTerm]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredRecords.map((record) => record.upload_id)));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFilesToQueue(e.dataTransfer.files);
  };

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto relative">
      <PageHeader
        title={title}
        description={subtitle}
        actions={
          <div className="flex gap-4">
            <button
              onClick={() => loadData()}
              className="p-4 bg-theme-bg-app border border-theme-border text-theme-text-muted rounded-2xl hover:bg-theme-elevated transition-all active:scale-95"
              title="手动刷新数据"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={openCreateModal}
              disabled={!projectId}
              className="flex items-center gap-2 bg-theme-surface text-white px-8 py-4 rounded-2xl font-black hover:bg-theme-elevated transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus size={20} /> 新建上传记录
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
 <div className="bg-theme-bg-app border border-theme-border rounded-[2rem] p-5">
          <div className="flex items-center gap-3 text-theme-text-muted text-xs font-black uppercase tracking-widest">
            <Database size={16} />
            <span>上传记录</span>
          </div>
          <p className="text-3xl font-black text-theme-text-primary mt-4">{stats?.total_uploads ?? 0}</p>
        </div>
 <div className="bg-theme-bg-app border border-theme-border rounded-[2rem] p-5">
          <div className="flex items-center gap-3 text-amber-400 text-xs font-black uppercase tracking-widest">
            <Clock size={16} />
            <span>处理中</span>
          </div>
          <p className="text-3xl font-black text-theme-text-primary mt-4">{stats?.processing_uploads ?? 0}</p>
        </div>
 <div className="bg-theme-bg-app border border-theme-border rounded-[2rem] p-5">
          <div className="flex items-center gap-3 text-green-400 text-xs font-black uppercase tracking-widest">
            <Archive size={16} />
            <span>成功 / 部分成功 / 失败</span>
          </div>
          <p className="text-lg font-black text-theme-text-primary mt-4">
            {(stats?.succeeded_uploads ?? 0)} / {(stats?.partial_failed_uploads ?? 0)} / {(stats?.failed_uploads ?? 0)}
          </p>
        </div>
 <div className="bg-theme-bg-app border border-theme-border rounded-[2rem] p-5">
          <div className="flex items-center gap-3 text-theme-text-muted text-xs font-black uppercase tracking-widest">
            <FileBox size={16} />
            <span>文件总数</span>
          </div>
          <p className="text-3xl font-black text-theme-text-primary mt-4">{stats?.stored_file_count ?? 0}</p>
        </div>
 <div className="bg-theme-bg-app border border-theme-border rounded-[2rem] p-5">
          <div className="flex items-center gap-3 text-theme-text-muted text-xs font-black uppercase tracking-widest">
            <HardDrive size={16} />
            <span>总大小</span>
          </div>
          <p className="text-3xl font-black text-theme-text-primary mt-4">{formatUploadBytes(stats?.stored_total_size_bytes)}</p>
        </div>
      </div>

      {selectedIds.size > 0 && (
 <div className="sticky top-0 z-40 bg-theme-surface px-8 py-4 rounded-3xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <CheckSquare size={20} />
            </div>
            <span className="text-sm font-black text-white uppercase tracking-widest">已选中 {selectedIds.size} 条上传记录</span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setDeleteConfirm({ show: true, ids: Array.from(selectedIds), error: null })}
              className="px-6 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500/20 transition-all"
            >
              <Trash2 size={16} /> 批量删除
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-6 py-2.5 bg-slate-100/10 text-theme-text-muted rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition-all"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint" size={20} />
          <input
            type="text"
            placeholder="搜索上传记录 ID、目录路径或失败信息..."
 className="w-full pl-16 pr-8 py-5 bg-theme-bg-app border border-theme-border rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

 <div className="bg-theme-bg-app border border-theme-border rounded-[2.5rem] overflow-hidden min-h-[400px]">
          <table className="w-full text-left">
            <thead className="bg-slate-100/50 border-b border-theme-border font-black text-[10px] text-theme-text-muted uppercase tracking-widest">
              <tr>
                <th className="px-6 py-5 w-12 text-center">
                  <button onClick={toggleSelectAll} className="p-2 hover:bg-theme-elevated rounded-lg transition-colors">
                    {selectedIds.size === filteredRecords.length && filteredRecords.length > 0 ? (
                      <CheckSquare size={18} className="text-blue-400" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-5">上传记录 / 创建时间</th>
                <th className="px-4 py-5">状态</th>
                <th className="px-4 py-5">上传模式 / 最近批次</th>
                <th className="px-4 py-5">文件数 / 大小</th>
                <th className="px-4 py-5">错误摘要</th>
                <th className="px-8 py-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-32 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-400" size={40} />
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-theme-text-muted font-semibold">
                    暂无上传记录
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr
                    key={record.upload_id}
                    className={`hover:bg-theme-elevated transition-all group cursor-pointer ${selectedIds.has(record.upload_id) ? 'bg-blue-50/30' : ''}`}
                    onClick={(e) => toggleSelect(record.upload_id, e)}
                  >
                    <td className="px-6 py-6 text-center">
                      <button className="p-2">
                        {selectedIds.has(record.upload_id) ? (
                          <CheckSquare size={18} className="text-blue-400" />
                        ) : (
                          <Square size={18} className="text-theme-text-faint hover:text-theme-text-muted" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-6">
                      <div className="flex items-center gap-4">
 <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black transition-all ${selectedIds.has(record.upload_id) ? 'bg-blue-600 text-white' : 'bg-theme-bg-app text-theme-text-muted group-hover:bg-blue-600 group-hover:text-white'}`}>
                          <FileArchive size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-theme-text-primary truncate">{getUploadRecordDisplayName(record)}</p>
                          <p className="text-[10px] font-mono text-theme-text-muted truncate mt-0.5">{record.upload_id}</p>
                          <p className="text-[10px] font-mono text-theme-text-muted uppercase truncate mt-0.5">{formatDateTime(record.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-6">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-6">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-theme-text-secondary">{getUploadModeLabel(record.keep_original)}</p>
                        <p className="text-[10px] text-theme-text-muted font-medium">{getLatestBatchSummary(record)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-6">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-theme-text-secondary">{record.stored_file_count} 个文件</p>
                        <p className="text-[10px] text-theme-text-muted font-medium">{formatUploadBytes(record.stored_total_size_bytes)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-6">
                      <div className="max-w-[240px]">
                        <p className="text-xs text-theme-text-muted line-clamp-2">{record.last_error || record.latest_batch?.error_summary || '-'}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAppendModal(record.upload_id, record.keep_original);
                          }}
                          className="p-2.5 text-theme-text-muted hover:text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all"
                          title="追加上传"
                        >
                          <Upload size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ show: true, ids: [record.upload_id], error: null });
                          }}
                          className="p-2.5 text-theme-text-muted hover:text-red-500 hover:bg-red-500/15 rounded-xl transition-all"
                          title="删除上传记录"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={deleteConfirm.show} onClose={() => setDeleteConfirm({ show: false, ids: [], error: null })} className="max-w-md">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-500/15 text-red-400 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <AlertCircle size={48} />
              </div>
              <h3 className="text-2xl font-black text-theme-text-primary tracking-tight">确认删除上传记录？</h3>
              <p className="text-theme-text-muted mt-4 font-medium leading-relaxed">
                您正准备删除 <span className="text-red-400 font-black">{deleteConfirm.ids.length}</span> 条上传记录。
                对应目录内容也会一并移除，该操作不可逆。
              </p>
              {deleteConfirm.error && (
                <div className="mt-6 p-4 bg-red-500/15 border border-red-500/20 rounded-2xl text-left">
                  <div className="flex gap-3 text-red-400 font-black text-xs items-start">
                    <AlertCircle size={18} className="shrink-0" />
                    <div className="space-y-1">
                      <p className="uppercase tracking-widest">删除结果提示</p>
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
                className="flex-1 py-4 bg-theme-elevated text-theme-text-secondary rounded-2xl font-black hover:bg-theme-elevated transition-all active:scale-95 disabled:opacity-50"
              >
                {deleteConfirm.error ? '关闭' : '取消'}
              </button>
              {!deleteConfirm.error && (
                <button
                  onClick={executeDelete}
                  disabled={isDeleting}
 className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  确认删除
                </button>
              )}
            </div>
      </Modal>

      {isUploadModalOpen && (
        <Modal open={isUploadModalOpen} onClose={() => !isUploadingBatch && setIsUploadModalOpen(false)} className="max-w-2xl">
 <div className="p-8 border-b border-theme-border bg-theme-bg-app flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
 <div className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center">
                  <Upload size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-theme-text-primary tracking-tight">{isAppendMode ? '追加上传压缩包' : '新建上传记录'}</h3>
                  <p className="text-theme-text-muted text-xs font-bold uppercase tracking-widest mt-1">后台线程处理解压/落盘，不阻塞前端页面</p>
                </div>
              </div>
              <button onClick={() => !isUploadingBatch && setIsUploadModalOpen(false)} className="p-4 text-theme-text-muted hover:text-theme-text-secondary">
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
              {!isAppendMode ? (
 <div className="bg-theme-elevated p-6 rounded-[2rem] border border-theme-border space-y-3">
                  <label className="block">
                    <p className="text-sm font-black text-theme-text-secondary">上传记录名称</p>
                    <input
                      value={uploadDisplayName}
                      onChange={(e) => setUploadDisplayName(e.target.value)}
 className="mt-3 w-full rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm font-semibold text-theme-text-primary outline-none focus:border-blue-400"
                      placeholder="请输入上传记录名称"
                    />
                  </label>
                </div>
              ) : null}

 <div className="bg-theme-elevated p-6 rounded-[2rem] border border-theme-border space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepOriginal}
                    onChange={(e) => setKeepOriginal(e.target.checked)}
                    className="w-4 h-4 rounded border-theme-border text-blue-400 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-black text-theme-text-secondary">保留原始文件，不自动解压</p>
                    <p className="text-xs text-theme-text-muted">勾选后不解压，直接将用户上传的原始文件写入记录目录</p>
                  </div>
                </label>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-4 border-dashed rounded-[3rem] p-12 text-center transition-all cursor-pointer group ${
 isDragging ? 'border-blue-600 bg-blue-50/50 scale-[0.98]' : 'border-theme-border hover:border-blue-300 hover:bg-theme-elevated'
                }`}
              >
                <input
                  type="file"
                  multiple
                  accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => addFilesToQueue(e.target.files)}
                />
                <div className="w-20 h-20 bg-blue-500/15 text-blue-400 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <Plus size={40} />
                </div>
                <h4 className="text-lg font-black text-theme-text-primary">{keepOriginal ? '点击或拖拽原始文件至此' : '点击或拖拽压缩包至此'}</h4>
                <p className="text-sm text-theme-text-muted mt-2 font-medium">
                  {keepOriginal ? '当前保留原始文件模式下，支持任意文件格式。' : '支持 zip / tar / tar.gz / tgz / tar.bz2 / tar.xz'}
                </p>
              </div>

              {uploadQueue.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">待上传队列 ({uploadQueue.length})</h5>
                  <div className="space-y-2">
                    {uploadQueue.map((item) => (
 <div key={item.id} className="p-4 bg-theme-bg-app border border-theme-border rounded-2xl flex items-center justify-between group">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            item.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                            item.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-theme-bg-app text-theme-text-muted'
                          }`}>
                            {item.status === 'completed' ? <Archive size={18} /> : <FileBox size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-theme-text-primary truncate">{item.file.name}</p>
                            <p className="text-[10px] text-theme-text-muted">{formatUploadBytes(item.file.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          {item.status === 'uploading' && <span className="text-[10px] font-black text-blue-400">上传中</span>}
                          {item.status === 'failed' && <span className="text-[10px] font-black text-red-500 uppercase">失败</span>}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFileFromQueue(item.id);
                            }}
                            disabled={isUploadingBatch}
                            className="p-2 text-theme-text-faint hover:text-red-500 transition-colors disabled:opacity-30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {item.error && (
                          <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-red-500/15 border border-red-500/20 rounded-xl text-[9px] text-red-400 font-bold z-10">
                            {item.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadErrorMessage ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
                  {uploadErrorMessage}
                </div>
              ) : null}
            </div>

 <div className="p-10 border-t border-theme-border bg-theme-bg-app flex gap-4 shrink-0">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                disabled={isUploadingBatch}
 className="flex-1 py-4 bg-theme-elevated border border-theme-border text-theme-text-secondary rounded-2xl font-black hover:bg-theme-elevated transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleUploadSubmit({ runInBackground: true }); }}
                disabled={isUploadingBatch || uploadQueue.filter((item) => item.status !== 'failed').length === 0 || (!isAppendMode && !uploadDisplayName.trim())}
 className="flex-1 py-4 bg-theme-elevated border border-theme-border text-theme-text-secondary rounded-2xl font-black hover:bg-theme-elevated transition-all disabled:opacity-50"
              >
                后台运行
              </button>
              <button
                type="button"
                onClick={() => { void handleUploadSubmit(); }}
                disabled={isUploadingBatch || uploadQueue.filter((item) => item.status !== 'failed').length === 0 || (!isAppendMode && !uploadDisplayName.trim())}
 className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isUploadingBatch ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                {isAppendMode ? '提交追加上传' : '创建上传记录'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
};
