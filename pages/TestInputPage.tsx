import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Code2,
  Eye,
  FileBox,
  FileText,
  HardDrive,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../clients/api';
import { StatusBadge } from '../components/StatusBadge';
import type { ProjectInputOverview, ProjectInputUploadDetail, ProjectInputUploadRecord, ProjectInputUploadStats, SecurityProject, UserInfo } from '../types/types';
import { formatUploadBytes, getLatestBatchSummary, getUploadModeLabel, getUploadRecordDisplayName, isAllowedArchiveFileName } from './assets/baseResourcePageModel';
import { CreateTaskDialog } from './task/CreateTaskDialog';

type InputType = 'document' | 'code' | 'software' | 'other';

interface TestInputPageProps {
  currentView: string;
  selectedProjectId?: string;
  user?: UserInfo | null;
  projects?: SecurityProject[];
}

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  speedBytesPerSec?: number;
  error?: string;
}

interface UploadDetailDialogState {
  uploadId: string;
  record: ProjectInputUploadRecord;
}

const INPUT_TYPE_META: Record<InputType, { label: string; icon: React.ReactNode; tone: string }> = {
  document: { label: '文档', icon: <FileText size={18} />, tone: 'text-sky-700 bg-sky-50 border-sky-200' },
  code: { label: '代码', icon: <Code2 size={18} />, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  software: { label: '软件包', icon: <Package size={18} />, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  other: { label: '其他', icon: <FileBox size={18} />, tone: 'text-slate-700 bg-slate-100 border-slate-200' },
};

const INPUT_TYPE_ORDER: InputType[] = ['document', 'code', 'software', 'other'];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatSpeed = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let next = bytes;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return`${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const normalizeType = (value: string): InputType => {
  if (value === 'document' || value === 'code' || value === 'software' || value === 'other') return value;
  return 'other';
};

const emptyStats = (projectId: string, inputType: InputType): ProjectInputUploadStats => ({
  project_id: projectId,
  input_type: inputType,
  total_uploads: 0,
  processing_uploads: 0,
  succeeded_uploads: 0,
  partial_failed_uploads: 0,
  failed_uploads: 0,
  stored_file_count: 0,
  stored_total_size_bytes: 0,
});

export const TestInputPage: React.FC<TestInputPageProps> = ({ selectedProjectId, user = null, projects = [] }) => {
  const navigate = useNavigate();
  const fileserverApi = api.domains.assets.fileserver;
  const projectId = selectedProjectId || localStorage.getItem('last_project_id') || localStorage.getItem('selectedProjectId') || '';
  const [overview, setOverview] = useState<ProjectInputOverview | null>(null);
  const [records, setRecords] = useState<ProjectInputUploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<InputType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAppendMode, setIsAppendMode] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeInputType, setActiveInputType] = useState<InputType>('document');
  const [uploadDisplayName, setUploadDisplayName] = useState('');
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectInputUploadRecord | null>(null);
  const [expandedUploadIds, setExpandedUploadIds] = useState<string[]>([]);
  const [uploadDetailCache, setUploadDetailCache] = useState<Record<string, ProjectInputUploadDetail | undefined>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<string[]>([]);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailDialogTarget, setDetailDialogTarget] = useState<UploadDetailDialogState | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedRecordForTask, setSelectedRecordForTask] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    setPage(1);
    void loadOverview();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadRecords();
  }, [projectId, selectedType, selectedStatus, page, pageSize]);

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      setOverview(await fileserverApi.getProjectInputOverview(projectId));
    } catch (error: any) {
      setOverview(null);
      setErrorMessage(error?.message || '加载统计失败');
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await fileserverApi.listProjectInputUploads(projectId, {
        inputType: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        page,
        pageSize,
      });
      setRecords(Array.isArray(response.items) ? response.items : []);
      setTotal(Number(response.total || 0));
      setPage(Number(response.page || page));
    } catch (error: any) {
      setRecords([]);
      setTotal(0);
      setErrorMessage(error?.message || '加载记录失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUploadDetail = async (uploadId: string, force = false) => {
    if (!force && uploadDetailCache[uploadId]) return uploadDetailCache[uploadId];
    setDetailLoadingIds((current) => (current.includes(uploadId) ? current : [...current, uploadId]));
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[uploadId];
      return next;
    });
    try {
      const detail = await fileserverApi.getProjectInputUploadDetail(uploadId);
      setUploadDetailCache((current) => ({ ...current, [uploadId]: detail }));
      return detail;
    } catch (error: any) {
      const message = error?.message || '加载批次历史失败';
      setDetailErrors((current) => ({ ...current, [uploadId]: message }));
      return undefined;
    } finally {
      setDetailLoadingIds((current) => current.filter((item) => item !== uploadId));
    }
  };

  const toggleUploadDetail = async (uploadId: string) => {
    const isExpanded = expandedUploadIds.includes(uploadId);
    if (isExpanded) {
      setExpandedUploadIds((current) => current.filter((item) => item !== uploadId));
      return;
    }
    setExpandedUploadIds((current) => [...current, uploadId]);
    if (!uploadDetailCache[uploadId]) {
      await loadUploadDetail(uploadId);
    }
  };

  const openUploadDetailDialog = async (record: ProjectInputUploadRecord) => {
    setDetailDialogTarget({ uploadId: record.upload_id, record });
    await loadUploadDetail(record.upload_id);
  };

  const statsMap = useMemo(() => {
    const map = new Map<InputType, ProjectInputUploadStats>();
    INPUT_TYPE_ORDER.forEach((type) => map.set(type, emptyStats(projectId, type)));
    (overview?.categories || []).forEach((item) => {
      map.set(normalizeType(item.input_type), item);
    });
    return map;
  }, [overview, projectId]);

  const filteredRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record) => {
      const typeLabel = INPUT_TYPE_META[normalizeType(record.input_type)].label.toLowerCase();
      return (
        getUploadRecordDisplayName(record).toLowerCase().includes(keyword) ||
        record.upload_id.toLowerCase().includes(keyword) ||
        record.target_path.toLowerCase().includes(keyword) ||
        typeLabel.includes(keyword) ||
        String(record.created_by || '').toLowerCase().includes(keyword) ||
        String(record.last_error || record.latest_batch?.error_summary || '').toLowerCase().includes(keyword)
      );
    });
  }, [records, searchTerm]);

  const addFilesToQueue = (files: FileList | null) => {
    if (!files) return;
    const next: UploadQueueItem[] = Array.from(files).map((file) => {
      const allowed = keepOriginal || isAllowedArchiveFileName(file.name || '');
      return {
        id:`${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: allowed ? 'pending' : 'failed',
        progress: 0,
        speedBytesPerSec: 0,
        error: allowed ? undefined : '仅支持压缩包上传',
      };
    });
    setUploadQueue((current) => [...current, ...next]);
  };

  const uploadDialogError = errorMessage;

  const openCreateModal = (type: InputType) => {
    setIsAppendMode(false);
    setActiveUploadId(null);
    setActiveInputType(type);
    setUploadDisplayName('');
    setKeepOriginal(false);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
    setErrorMessage(null);
  };

  const openAppendModal = (record: ProjectInputUploadRecord) => {
    setIsAppendMode(true);
    setActiveUploadId(record.upload_id);
    setActiveInputType(normalizeType(record.input_type));
    setUploadDisplayName('');
    setKeepOriginal(record.keep_original);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
    setErrorMessage(null);
  };

  const submitUpload = async (options?: { runInBackground?: boolean }) => {
    const readyFiles = uploadQueue.filter((item) => item.status !== 'failed').map((item) => item.file);
    if (!projectId || readyFiles.length === 0) return;
    const normalizedDisplayName = uploadDisplayName.trim();
    if (!isAppendMode && !normalizedDisplayName) {
      setErrorMessage('请填写上传记录名称');
      return;
    }
    setIsUploading(true);
    if (options?.runInBackground) {
      setIsUploadModalOpen(false);
    }
    setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'uploading', progress: 40, speedBytesPerSec: 0 }));
    try {
      let result: { upload_id: string } | undefined;
      if (isAppendMode && activeUploadId) {
        result = await fileserverApi.appendProjectInputUpload({
          upload_id: activeUploadId,
          keep_original: keepOriginal,
          upload_mode: keepOriginal ? 'raw' : 'archive',
          files: readyFiles,
        }, {
          onProgress: (progress) => {
            setUploadQueue((current) => current.map((item) => (
              item.status === 'failed'
                ? item
                : {
                    ...item,
                    progress: Math.max(item.progress, progress.total_bytes > 0 ? Math.round((progress.loaded_bytes / progress.total_bytes) * 100) : item.progress),
                    speedBytesPerSec: progress.speed_bytes_per_sec || 0,
                  }
            )));
          },
        });
      } else {
        result = await fileserverApi.createProjectInputUpload({
          project_id: projectId,
          input_type: activeInputType,
          keep_original: keepOriginal,
          upload_mode: keepOriginal ? 'raw' : 'archive',
          files: readyFiles,
        }, {
          onProgress: (progress) => {
            setUploadQueue((current) => current.map((item) => (
              item.status === 'failed'
                ? item
                : {
                    ...item,
                    progress: Math.max(item.progress, progress.total_bytes > 0 ? Math.round((progress.loaded_bytes / progress.total_bytes) * 100) : item.progress),
                    speedBytesPerSec: progress.speed_bytes_per_sec || 0,
                  }
            )));
          },
        });
        if (result?.upload_id) {
          try {
            await fileserverApi.updateProjectInputUploadDisplayName({
              upload_id: result.upload_id,
              project_id: projectId,
              display_name: normalizedDisplayName,
            });
          } catch (renameError: any) {
            throw new Error(renameError?.message || '文件已上传，但上传记录名称保存失败');
          }
        }
      }
      setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'completed', progress: 100, speedBytesPerSec: 0 }));
      setIsUploadModalOpen(false);
      setUploadQueue([]);
      setUploadDisplayName('');
      if (result?.upload_id) {
        setUploadDetailCache((current) => {
          const next = { ...current };
          delete next[result.upload_id];
          return next;
        });
      }
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error: any) {
      const message = error?.message || '上传失败';
      setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'failed', progress: 0, speedBytesPerSec: 0, error: message }));
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget || !projectId) return;
    try {
      await fileserverApi.deleteProjectInputUploads({
        project_id: projectId,
        input_type: deleteTarget.input_type,
        upload_ids: [deleteTarget.upload_id],
      });
      setExpandedUploadIds((current) => current.filter((item) => item !== deleteTarget.upload_id));
      setUploadDetailCache((current) => {
        const next = { ...current };
        delete next[deleteTarget.upload_id];
        return next;
      });
      setDetailErrors((current) => {
        const next = { ...current };
        delete next[deleteTarget.upload_id];
        return next;
      });
      setDeleteTarget(null);
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error: any) {
      setErrorMessage(error?.message || '删除失败');
    }
  };

  const canOpenDirectory = useMemo(() => {
    const platformRole = String(user?.platform_role || '').trim().toLowerCase();
    return platformRole === 'developer' || platformRole === 'ordinary_admin' || platformRole === 'super_admin';
  }, [user]);

  const openProjectPath = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path :`/${path}`;
    const targetHash =`#/project-file-explorer?path=${encodeURIComponent(normalizedPath)}`;
    window.open(targetHash, '_blank', 'noopener,noreferrer');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!projectId) {
    return (
      <div className="flex h-full min-h-[calc(100vh-5rem)] items-center justify-center p-10">
        <section className="w-full max-w-3xl rounded-[2rem] border border-theme-border bg-theme-surface px-10 py-14 text-center shadow-brand">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-elevated text-theme-text-primary">
            <FileBox size={28} />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-theme-text-primary">测试对象</h1>
          <p className="mt-3 text-base font-medium text-theme-text-faint">请先选择项目，再查看测试对象统计和上传记录。</p>
        </section>
      </div>
    );
  }

  return (
 <div className="min-h-[calc(100vh-5rem)] bg-[#070d18] p-4 md:p-6 xl:p-8">
      <div className="flex min-h-[calc(100vh-7rem)] w-full flex-col gap-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {INPUT_TYPE_ORDER.map((inputType) => {
            const stats = statsMap.get(inputType) || emptyStats(projectId, inputType);
            const meta = INPUT_TYPE_META[inputType];
            return (
              <button
                key={inputType}
                type="button"
                onClick={() => {
                  setSelectedType(inputType);
                  setPage(1);
                }}
 className={`rounded-[2rem] border p-5 text-left transition ${selectedType === inputType ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-200'}`}
              >
 <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${selectedType === inputType ? 'border-slate-200 bg-slate-100 text-white' : meta.tone}`}>
                  {meta.icon}
                  {meta.label}
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">上传记录</div>
                  <div className="flex items-baseline gap-3 text-right">
                    <div className="text-3xl font-black">{stats.total_uploads}</div>
                    <div className="text-xs font-semibold opacity-80">{formatUploadBytes(stats.stored_total_size_bytes)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

 <section className="flex min-h-[calc(100vh-22rem)] flex-1 flex-col rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">上传记录</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">查看各类测试对象上传批次、容量、状态和落盘路径。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    void Promise.all([loadOverview(), loadRecords()]);
                  }}
 className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <RefreshCw size={16} className={(loading || overviewLoading) ? 'animate-spin' : ''} />
                  刷新
                </button>
                <button
                  onClick={() => openCreateModal(selectedType === 'all' ? 'document' : selectedType)}
 className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                >
                  <Plus size={16} />
                  新建上传
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:max-w-sm lg:flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索记录、路径或错误信息"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
                />
              </div>
              <select
                value={selectedType}
                onChange={(event) => {
                  setSelectedType(event.target.value as InputType | 'all');
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none sm:w-auto"
              >
                <option value="all">全部类型</option>
                {INPUT_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>{INPUT_TYPE_META[type].label}</option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => {
                  setSelectedStatus(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none sm:w-auto"
              >
                <option value="all">全部状态</option>
                <option value="pending">pending</option>
                <option value="processing">processing</option>
                <option value="succeeded">succeeded</option>
                <option value="partial_failed">partial_failed</option>
                <option value="failed">failed</option>
              </select>
            </div>
          </div>

          {!isUploadModalOpen && errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 flex-1 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50">
            <div className="h-full overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-4">类型</th>
                    <th className="px-4 py-4">上传记录</th>
                    <th className="px-4 py-4">批次 / 模式</th>
                    <th className="px-4 py-4">文件 / 容量</th>
                    <th className="px-4 py-4">创建信息</th>
                    <th className="px-4 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-slate-50 text-sm">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-20 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" size={32} /></td></tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-400">暂无上传记录</td></tr>
                  ) : filteredRecords.map((record) => {
                    const inputType = normalizeType(record.input_type);
                    const isExpanded = expandedUploadIds.includes(record.upload_id);
                    const detail = uploadDetailCache[record.upload_id];
                    const isDetailLoading = detailLoadingIds.includes(record.upload_id);
                    const detailError = detailErrors[record.upload_id];
                    const batches = detail?.batches || [];
                    return (
                      <React.Fragment key={record.upload_id}>
                        <tr className="cursor-pointer align-top hover:bg-slate-100/80" onClick={() => { void openUploadDetailDialog(record); }}>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${INPUT_TYPE_META[inputType].tone}`}>
                              {INPUT_TYPE_META[inputType].icon}
                              {INPUT_TYPE_META[inputType].label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); void toggleUploadDetail(record.upload_id); }}
                                className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? '收起批次历史' : '展开批次历史'}
                              >
                                <ChevronDown size={16} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                              </button>
                              <div className="min-w-0">
                                <div className="font-black text-slate-900">{getUploadRecordDisplayName(record)}</div>
                                <div className="mt-1 text-xs font-mono text-slate-500">{record.upload_id}</div>
                                <div className="mt-1 text-xs text-slate-500">{record.source_archive_count} 个源压缩包</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-800">{record.batch_count || (record.latest_batch ? 1 : 0)} 批次</div>
                            <div className="mt-1 text-xs text-slate-500">{getUploadModeLabel(record.keep_original)}</div>
                            <div className="mt-1 text-xs text-slate-400">{getLatestBatchSummary(record)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-800">{record.stored_file_count} 个文件</div>
                            <div className="mt-1 text-xs text-slate-500">{formatUploadBytes(record.stored_total_size_bytes)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-800">{record.created_by || '-'}</div>
                            <div className="mt-1 text-xs text-slate-500">创建 {formatDateTime(record.created_at)}</div>
                            <div className="mt-1 text-xs text-slate-400">完成 {formatDateTime(record.finished_at)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                              <button onClick={() => { void openUploadDetailDialog(record); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">
                                <Eye size={14} className="mr-1 inline-block" />
                                详情
                              </button>
                              {canOpenDirectory ? (
                                <button onClick={() => openProjectPath(record.target_path)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">
                                  <HardDrive size={14} className="mr-1 inline-block" />
                                  打开目录
                                </button>
                              ) : null}
                              <button onClick={() => openAppendModal(record)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">
                                <Plus size={14} className="mr-1 inline-block" />
                                追加
                              </button>
                              <button onClick={() => {
                                setSelectedRecordForTask(record.upload_id);
                                setCreateTaskOpen(true);
                              }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">
                                <Plus size={14} className="mr-1 inline-block" />
                                创建任务
                              </button>
                              <button onClick={() => setDeleteTarget(record)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50">
                                <Trash2 size={14} className="mr-1 inline-block" />
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="bg-slate-50/70">
                            <td colSpan={6} className="px-6 py-5">
                              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <div className="text-sm font-black text-slate-900">批次历史</div>
                                    <div className="mt-1 text-xs text-slate-500">{record.upload_id} · {batches.length > 0 ?`${batches.length} 个批次` : '暂无批次明细'}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                                    <span className="rounded-full bg-slate-100 px-3 py-1">模式：{getUploadModeLabel(record.keep_original)}</span>
                                  </div>
                                </div>

                                {isDetailLoading ? (
                                  <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                    <Loader2 className="mx-auto mb-3 animate-spin text-slate-400" size={24} />
                                    正在加载批次历史...
                                  </div>
                                ) : detailError ? (
                                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                                    {detailError}
                                  </div>
                                ) : batches.length === 0 ? (
                                  <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                    该上传记录暂无批次历史。
                                  </div>
                                ) : (
                                  <div className="mt-5 space-y-3">
                                    {batches.map((batch, index) => (
                                      <div key={batch.batch_id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-black text-slate-900">批次 #{index + 1}</span>
                                              <StatusBadge status={batch.status} />
                                              <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{batch.mode}</span>
                                            </div>
                                            <div className="mt-2 text-xs text-slate-500">batch_id: <span className="font-mono text-slate-700">{batch.batch_id}</span></div>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                                            <span className="rounded-full bg-slate-50 px-3 py-1">提交 {batch.submitted_file_count} 个</span>
                                            <span className="rounded-full bg-slate-50 px-3 py-1">处理 {batch.processed_file_count} 个</span>
                                            <span className="rounded-full bg-slate-50 px-3 py-1">{formatUploadBytes(batch.processed_size_bytes)}</span>
                                            <span className="rounded-full bg-slate-50 px-3 py-1">保留原包：{batch.keep_original ? '是' : '否'}</span>
                                          </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                          <div>
                                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                                            <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(batch.created_at)}</div>
                                          </div>
                                          <div>
                                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">完成时间</div>
                                            <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(batch.finished_at)}</div>
                                          </div>
                                          <div className="md:col-span-2">
                                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">错误摘要</div>
                                            <div className="mt-1 text-sm font-semibold text-slate-700">{batch.error_summary || '-'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <div>共 {total} 条记录</div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                上一页
              </button>
              <span>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </div>

      {detailDialogTarget ? (() => {
        const { uploadId, record } = detailDialogTarget;
        const detail = uploadDetailCache[uploadId];
        const isDetailLoading = detailLoadingIds.includes(uploadId);
        const detailError = detailErrors[uploadId];
        const batches = detail?.batches || [];
        const latestBatch = detail?.latest_batch || record.latest_batch || null;
        return (
          <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-slate-50">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">上传记录详情</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{getUploadRecordDisplayName(record)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-slate-600">{record.upload_id}</span>
                    <StatusBadge status={record.status} />
                    {latestBatch ? <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">最新批次：{latestBatch.status}</span> : null}
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">类型：{INPUT_TYPE_META[normalizeType(record.input_type)].label}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailDialogTarget(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto px-6 py-6">
                <div className="space-y-5">
                  <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-sm font-black text-slate-900">基础信息</div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">目标路径</div>
                        <div className="mt-1 break-all text-sm font-mono text-slate-700">{record.target_path}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">上传模式</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{getUploadModeLabel(record.keep_original)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建人</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{record.created_by || '-'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(record.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">完成时间</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(record.finished_at)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">源压缩包</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{record.source_archive_count}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">落盘文件</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{record.stored_file_count}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">落盘容量</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatUploadBytes(record.stored_total_size_bytes)}</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-sm font-black text-slate-900">批次历史</div>
                    {isDetailLoading ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        <Loader2 className="mx-auto mb-3 animate-spin text-slate-400" size={24} />
                        正在加载批次历史...
                      </div>
                    ) : detailError ? (
                      <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                        {detailError}
                      </div>
                    ) : batches.length === 0 ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        该上传记录暂无批次历史。
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {batches.map((batch, index) => (
                          <div key={batch.batch_id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-slate-900">批次 #{index + 1}</span>
                              <StatusBadge status={batch.status} />
                              <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{batch.mode}</span>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">batch_id: <span className="font-mono text-slate-700">{batch.batch_id}</span></div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">提交 / 处理</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700">{batch.submitted_file_count} / {batch.processed_file_count}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">容量</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700">{formatUploadBytes(batch.processed_size_bytes)}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(batch.created_at)}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">完成时间</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(batch.finished_at)}</div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">错误摘要</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700">{batch.error_summary || '-'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-5">
                <button type="button" onClick={() => setDetailDialogTarget(null)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600">
                  关闭
                </button>
                {canOpenDirectory ? (
                  <button type="button" onClick={() => openProjectPath(record.target_path)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                    打开目录
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <form onSubmit={(event) => {
            event.preventDefault();
            void submitUpload();
 }} className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-slate-50">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">{isAppendMode ? '追加上传' : '新建上传'}</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{INPUT_TYPE_META[activeInputType].label}测试对象</div>
            </div>
            <div className="space-y-5 px-6 py-6">
              {uploadDialogError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {uploadDialogError}
                </div>
              ) : null}
              {!isAppendMode ? (
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">上传记录名称</label>
                    <input
                      value={uploadDisplayName}
                      onChange={(event) => setUploadDisplayName(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
                      placeholder="请输入上传记录名称"
                    />
                  </div>
                  <label className="mb-2 block text-sm font-black text-slate-700">输入类型</label>
                  <select
                    value={activeInputType}
                    onChange={(event) => setActiveInputType(event.target.value as InputType)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
                  >
                    {INPUT_TYPE_ORDER.map((type) => (
                      <option key={type} value={type}>{INPUT_TYPE_META[type].label}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={keepOriginal}
                  onChange={(event) => setKeepOriginal(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                保留原始文件，不自动解压
              </label>

              <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
 <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">
                  <Upload size={22} />
                </div>
                <div className="mt-3 text-sm font-black text-slate-900">{keepOriginal ? '上传原始文件' : '上传压缩包'}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {keepOriginal
                    ? '当前保留原始文件模式下，支持上传任意文件，一次可选择多个文件。'
                    : '支持`zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz`，一次可选择多个文件。'}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    选择文件
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
                    className="hidden"
                    onChange={(event) => addFilesToQueue(event.target.files)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {uploadQueue.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">还没有选择上传文件。</div>
                ) : uploadQueue.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{item.file.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatUploadBytes(item.file.size)} · {formatSpeed(item.speedBytesPerSec)}</div>
                      </div>
                      <div className="text-xs font-semibold text-slate-500">{item.error || item.status}</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${item.status === 'failed' ? 'bg-rose-400' : 'bg-slate-900'}`} style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button type="button" onClick={() => setIsUploadModalOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600">
                取消
              </button>
              <button
                type="button"
                onClick={() => { void submitUpload({ runInBackground: true }); }}
                disabled={isUploading || uploadQueue.length === 0 || (!isAppendMode && !uploadDisplayName.trim())}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                后台运行
              </button>
              <button type="submit" disabled={isUploading || uploadQueue.length === 0 || (!isAppendMode && !uploadDisplayName.trim())} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {isUploading ? <Loader2 size={16} className="mr-2 inline-block animate-spin" /> : null}
                {isAppendMode ? '提交追加上传' : '创建上传记录'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="w-full max-w-md rounded-[2rem] bg-slate-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <AlertCircle size={22} />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">删除上传记录</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">将删除记录`{deleteTarget.upload_id}` 以及`{deleteTarget.target_path}` 下的内容，此操作不可恢复。</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600">取消</button>
              <button onClick={() => { void executeDelete(); }} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white">确认删除</button>
            </div>
          </div>
        </div>
      ) : null}
      <CreateTaskDialog
        open={createTaskOpen}
        onClose={() => { setCreateTaskOpen(false); setSelectedRecordForTask(undefined); }}
        projectId={projectId}
        projectName={projects.find(p => p.id === projectId)?.name || ''}
        preSelectedInputId={selectedRecordForTask}
        onCreated={() => { setCreateTaskOpen(false); setSelectedRecordForTask(undefined); }}
      />
    </div>
  );
};
