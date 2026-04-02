import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Database,
  Download,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm, showPrompt } from '../../components/DialogService';
import { StatusBadge } from '../../components/StatusBadge';
import {
  OutputPvcDetail,
  ProjectResource,
  PvcBrowserChildrenResponse,
  PvcBrowserNode,
} from '../../types/types';


type PreviewState =
  | { mode: 'empty' }
  | { mode: 'text'; text: string; truncated: boolean; contentType?: string | null }
  | { mode: 'image' | 'pdf' | 'audio' | 'video'; url: string; contentType?: string | null }
  | { mode: 'binary'; size?: number | null; contentType?: string | null };

const TEXT_EXTENSIONS = new Set(['txt', 'json', 'yaml', 'yml', 'md', 'log', 'xml', 'csv', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'sh', 'sql']);

const formatBytes = (value?: number | null) => {
  if (value == null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const toText = (base64: string) => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const sortNodes = (nodes: PvcBrowserNode[]) =>
  [...nodes].sort((a, b) => (a.node_type === b.node_type ? a.name.localeCompare(b.name, 'zh-CN') : a.node_type === 'directory' ? -1 : 1));

const flattenNodes = (nodes: PvcBrowserNode[], map: Record<string, PvcBrowserNode>) => {
  nodes.forEach((node) => {
    map[node.path] = node;
    flattenNodes(node.children || [], map);
  });
};

const inferPreviewMode = (node: PvcBrowserNode, contentType?: string | null): PreviewState['mode'] => {
  const type = contentType || node.content_type || '';
  if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml' || type === 'application/javascript') return 'text';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  const extension = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : '';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'binary';
};

const getParentPath = (path: string) => {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  return `/${parts.slice(0, -1).join('/')}`;
};

const joinPath = (parent: string, name: string) => (parent === '/' ? `/${name}` : `${parent}/${name}`);
const getRecentPvcStorageKey = (projectId: string) => `secflow:pvc-management:recent:${projectId}`;
const RESOURCE_TYPE_LABEL: Record<'document' | 'software' | 'code' | 'other' | 'output_pvc', string> = {
  document: '文档',
  software: '软件包',
  code: '源码',
  other: '其他',
  output_pvc: '输出',
};
const RESOURCE_TYPE_ORDER: Array<'document' | 'software' | 'code' | 'other' | 'output_pvc'> = [
  'document',
  'software',
  'code',
  'other',
  'output_pvc',
];

export const PvcManagementPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [loading, setLoading] = useState(true);
  const [pvcs, setPvcs] = useState<OutputPvcDetail[]>([]);
  const [selectedPvcId, setSelectedPvcId] = useState<number | null>(null);
  const [selectedPvcDetail, setSelectedPvcDetail] = useState<OutputPvcDetail | null>(null);
  const [browserTree, setBrowserTree] = useState<PvcBrowserNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));
  const [currentDirectory, setCurrentDirectory] = useState<PvcBrowserChildrenResponse | null>(null);
  const [selectedNodePath, setSelectedNodePath] = useState<string>('/');
  const [previewNode, setPreviewNode] = useState<PvcBrowserNode | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ mode: 'empty' });
  const [searchTerm, setSearchTerm] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    description: string;
    pvc_size: number;
    resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
  }>({ name: '', description: '', pvc_size: 10, resource_type: 'other' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showArchiveUploadModal, setShowArchiveUploadModal] = useState(false);
  const [archiveUploadLoading, setArchiveUploadLoading] = useState(false);
  const [archiveUploadError, setArchiveUploadError] = useState('');
  const [archiveFiles, setArchiveFiles] = useState<File[]>([]);
  const [archiveUploadForm, setArchiveUploadForm] = useState<{
    resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
    pvc_size: number;
  }>({ resource_type: 'other', pvc_size: 10 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cancelFolderUploadRef = useRef(false);
  const [folderUploadState, setFolderUploadState] = useState<{
    visible: boolean;
    phase: 'creating_directories' | 'uploading_files';
    processed: number;
    total: number;
    current?: string;
    errors: Array<{ path: string; error: string }>;
    canceled?: boolean;
    completed?: boolean;
  }>({
    visible: false,
    phase: 'creating_directories',
    processed: 0,
    total: 0,
    errors: [],
  });

  const selectedPvc = useMemo(
    () => pvcs.find((item) => item.id === selectedPvcId) || null,
    [pvcs, selectedPvcId]
  );

  const nodeMap = useMemo(() => {
    const map: Record<string, PvcBrowserNode> = { '/': { path: '/', name: '/', node_type: 'directory', has_children: true, children: browserTree } };
    flattenNodes(browserTree, map);
    return map;
  }, [browserTree]);

  const filteredPvcs = useMemo(
    () =>
      pvcs.filter((item) =>
        [item.name, item.pvc_name, item.description || ''].some((value) => value.toLowerCase().includes(searchTerm.toLowerCase()))
      ),
    [pvcs, searchTerm]
  );

  const resourceTypeStats = useMemo(() => {
    const counts: Record<'document' | 'software' | 'code' | 'other' | 'output_pvc', number> = {
      document: 0,
      software: 0,
      code: 0,
      other: 0,
      output_pvc: 0,
    };
    pvcs.forEach((item) => {
      counts[item.resource_type] += 1;
    });
    return counts;
  }, [pvcs]);

  useEffect(() => {
    void loadPvcList();
  }, [projectId]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const loadPvcList = async (preferredId?: number | null) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resources = await api.resources.list(projectId);
      const pvcResources = resources.filter((item: ProjectResource) => !!item.pvc_name);
      const details = await Promise.all(pvcResources.map((item: ProjectResource) => api.resources.getPvcResourceDetail(item.id)));
      setPvcs(details);
      const rememberedIdRaw = localStorage.getItem(getRecentPvcStorageKey(projectId));
      const rememberedId = rememberedIdRaw ? Number.parseInt(rememberedIdRaw, 10) : null;
      const candidateId = preferredId ?? selectedPvcId ?? rememberedId ?? details[0]?.id ?? null;
      const nextId = candidateId && details.some((item) => item.id === candidateId) ? candidateId : details[0]?.id ?? null;
      if (nextId) {
        await selectPvc(nextId, details);
      } else {
        localStorage.removeItem(getRecentPvcStorageKey(projectId));
        setSelectedPvcId(null);
        setSelectedPvcDetail(null);
        setBrowserTree([]);
        setCurrentDirectory(null);
        setPreviewNode(null);
        setPreview({ mode: 'empty' });
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshBrowser = async (resourceId: number, keepDirectoryPath?: string, keepPreviewPath?: string) => {
    const [detail, tree, directory] = await Promise.all([
      api.resources.getPvcResourceDetail(resourceId),
      api.resources.getPvcBrowserTree(resourceId),
      api.resources.getPvcBrowserChildren(resourceId, keepDirectoryPath || currentDirectory?.current_path || '/'),
    ]);
    setSelectedPvcDetail(detail);
    setBrowserTree(sortNodes(tree.items));
    setCurrentDirectory({
      ...directory,
      directories: sortNodes(directory.directories),
      files: sortNodes(directory.files),
    });
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      directory.breadcrumbs.forEach((item) => next.add(item.path));
      return next;
    });
    if (keepPreviewPath) {
      const refreshedNode = [...directory.directories, ...directory.files].find((item) => item.path === keepPreviewPath) || nodeMap[keepPreviewPath];
      if (refreshedNode) {
        await openFile(resourceId, refreshedNode, directory.current_path);
      } else {
        setPreviewNode(null);
        setPreview({ mode: 'empty' });
      }
    }
  };

  const selectPvc = async (resourceId: number, currentList?: OutputPvcDetail[]) => {
    setSelectedPvcId(resourceId);
    localStorage.setItem(getRecentPvcStorageKey(projectId), String(resourceId));
    setPreviewNode(null);
    setPreview({ mode: 'empty' });
    const detail = (currentList || pvcs).find((item) => item.id === resourceId) || (await api.resources.getPvcResourceDetail(resourceId));
    setSelectedPvcDetail(detail);
    const [tree, children] = await Promise.all([
      api.resources.getPvcBrowserTree(resourceId),
      api.resources.getPvcBrowserChildren(resourceId, '/'),
    ]);
    setBrowserTree(sortNodes(tree.items));
    setCurrentDirectory({
      ...children,
      directories: sortNodes(children.directories),
      files: sortNodes(children.files),
    });
    setExpandedPaths(new Set(['/', ...children.breadcrumbs.map((item) => item.path)]));
    setSelectedNodePath('/');
  };

  const openDirectory = async (path: string) => {
    if (!selectedPvcId) return;
    setBusy(`dir:${path}`);
    try {
      const children = await api.resources.getPvcBrowserChildren(selectedPvcId, path);
      setCurrentDirectory({
        ...children,
        directories: sortNodes(children.directories),
        files: sortNodes(children.files),
      });
      setSelectedNodePath(path);
      setExpandedPaths((prev) => new Set(prev).add(path));
    } finally {
      setBusy('');
    }
  };

  const openFile = async (resourceId: number, node: PvcBrowserNode, parentPath = getParentPath(node.path)) => {
    setBusy(`file:${node.path}`);
    setPreviewNode(node);
    revokePreviewUrl();
    try {
      const mode = inferPreviewMode(node, node.content_type);
      if (mode === 'text') {
        const payload = await api.resources.getPvcBrowserFile(resourceId, node.path);
        setPreview({
          mode: 'text',
          text: toText(payload.base64),
          truncated: payload.truncated,
          contentType: payload.content_type,
        });
      } else if (mode === 'binary') {
        const payload = await api.resources.getPvcBrowserFile(resourceId, node.path, 1);
        setPreview({ mode: 'binary', size: payload.size, contentType: payload.content_type });
      } else {
        const blob = await api.resources.fetchPvcBrowserPreviewBlob(resourceId, node.path);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview({ mode, url, contentType: blob.type || node.content_type });
      }
      if (currentDirectory?.current_path !== parentPath) {
        await openDirectory(parentPath);
      }
      setSelectedNodePath(node.path);
    } finally {
      setBusy('');
    }
  };

  const onTreeClick = async (node: PvcBrowserNode) => {
    if (!selectedPvcId) return;
    if (node.node_type === 'directory') {
      if (expandedPaths.has(node.path) && currentDirectory?.current_path !== node.path) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      } else {
        await openDirectory(node.path);
      }
      return;
    }
    await openFile(selectedPvcId, node);
  };

  const handleCreatePvc = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateLoading(true);
    try {
      await api.resources.createManualPvc({ ...createForm, project_id: projectId });
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', pvc_size: 10, resource_type: 'other' });
      await loadPvcList();
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeletePvc = async (resource: OutputPvcDetail) => {
    const confirmed = await showConfirm({
      title: '删除 PVC',
      message: `确认删除 PVC "${resource.name}" 吗？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setBusy(`delete-pvc:${resource.id}`);
    try {
      await api.resources.delete(resource.id);
      await loadPvcList(selectedPvcId === resource.id ? null : selectedPvcId);
    } finally {
      setBusy('');
    }
  };

  const askCurrentDirectoryName = async (title: string, currentValue = '') => {
    const value = await showPrompt({
      title,
      message: '请输入名称后继续操作。',
      defaultValue: currentValue,
      placeholder: '请输入名称',
      confirmText: '确认',
      cancelText: '取消',
    });
    return (value || '').trim();
  };

  const requireSelectedPvc = () => {
    if (!selectedPvcId || !selectedPvc) {
      throw new Error('请先选择一个 PVC');
    }
    return selectedPvc;
  };

  const handleCreateDirectory = async () => {
    const pvc = requireSelectedPvc();
    const name = await askCurrentDirectoryName('新建目录');
    if (!name) return;
    setBusy('mkdir');
    try {
      await api.resources.createPvcBrowserDirectory(pvc.id, currentDirectory?.current_path || '/', name);
      await refreshBrowser(pvc.id, currentDirectory?.current_path || '/');
    } finally {
      setBusy('');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadFolderClick = () => {
    folderInputRef.current?.click();
  };

  const openArchiveUploadModal = () => {
    setArchiveUploadError('');
    setArchiveFiles([]);
    setShowArchiveUploadModal(true);
  };

  const handleArchiveFileSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setArchiveFiles(Array.from(files));
  };

  const submitArchiveUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || archiveFiles.length === 0) return;
    setArchiveUploadLoading(true);
    setArchiveUploadError('');
    try {
      for (const file of archiveFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name.replace(/\.(tar\.gz|tgz|zip|tar|gz)$/i, ''));
        formData.append('resource_type', archiveUploadForm.resource_type);
        formData.append('project_ids', projectId);
        formData.append('pvc_size', String(archiveUploadForm.pvc_size));
        await api.resources.upload(formData);
      }
      setShowArchiveUploadModal(false);
      setArchiveFiles([]);
      await loadPvcList();
    } catch (error: any) {
      setArchiveUploadError(error?.message || '上传失败，请稍后重试');
    } finally {
      setArchiveUploadLoading(false);
    }
  };

  const handleUploadFiles = async (files: FileList | null) => {
    const pvc = requireSelectedPvc();
    if (!files || files.length === 0) return;
    setBusy('upload');
    try {
      for (const file of Array.from(files)) {
        await api.resources.uploadPvcBrowserFile(pvc.id, currentDirectory?.current_path || '/', file);
      }
      await refreshBrowser(pvc.id, currentDirectory?.current_path || '/');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy('');
    }
  };

  const cancelFolderUpload = () => {
    cancelFolderUploadRef.current = true;
    setFolderUploadState((prev) => ({ ...prev, canceled: true }));
  };

  const handleUploadFolder = async (files: FileList | null) => {
    const pvc = requireSelectedPvc();
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    cancelFolderUploadRef.current = false;
    setBusy('upload-folder');
    setFolderUploadState({
      visible: true,
      phase: 'creating_directories',
      processed: 0,
      total: fileArray.length,
      errors: [],
      canceled: false,
      completed: false,
    });
    try {
      const result = await api.resources.uploadPvcBrowserFolder({
        resourceId: pvc.id,
        basePath: currentDirectory?.current_path || '/',
        files: fileArray,
        shouldCancel: () => cancelFolderUploadRef.current,
        onProgress: (progress) => {
          setFolderUploadState((prev) => ({
            ...prev,
            phase: progress.phase,
            processed: progress.processed,
            total: progress.total,
            current: progress.current,
          }));
        },
      });
      setFolderUploadState((prev) => ({
        ...prev,
        completed: true,
        canceled: result.canceled,
        processed: result.processed_files,
        total: result.total_files,
        errors: result.failures,
      }));
      await refreshBrowser(pvc.id, currentDirectory?.current_path || '/');
    } finally {
      if (folderInputRef.current) folderInputRef.current.value = '';
      setBusy('');
    }
  };

  const handleRenameNode = async (node: PvcBrowserNode) => {
    const pvc = requireSelectedPvc();
    const targetName = await askCurrentDirectoryName('重命名', node.name);
    if (!targetName || targetName === node.name) return;
    setBusy(`rename:${node.path}`);
    try {
      await api.resources.renamePvcBrowserNode(pvc.id, node.path, targetName);
      await refreshBrowser(
        pvc.id,
        currentDirectory?.current_path || '/',
        previewNode?.path === node.path ? joinPath(getParentPath(node.path), targetName) : previewNode?.path
      );
    } finally {
      setBusy('');
    }
  };

  const handleMoveNode = async (node: PvcBrowserNode) => {
    const pvc = requireSelectedPvc();
    const targetPath = await showPrompt({
      title: '移动节点',
      message: '请输入目标目录路径，例如 `/reports/2026`。',
      defaultValue: currentDirectory?.current_path || '/',
      placeholder: '/target/path',
      confirmText: '确认移动',
      cancelText: '取消',
    });
    const normalized = (targetPath || '').trim();
    if (!normalized) return;
    setBusy(`move:${node.path}`);
    try {
      await api.resources.movePvcBrowserNode(pvc.id, node.path, normalized);
      await refreshBrowser(pvc.id, currentDirectory?.current_path || '/');
      if (previewNode?.path === node.path) {
        setPreviewNode(null);
        setPreview({ mode: 'empty' });
      }
    } finally {
      setBusy('');
    }
  };

  const handleDeleteNode = async (node: PvcBrowserNode) => {
    const pvc = requireSelectedPvc();
    const confirmed = await showConfirm({
      title: '删除节点',
      message: `确认删除 ${node.node_type === 'directory' ? '目录' : '文件'} "${node.name}" 吗？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setBusy(`delete:${node.path}`);
    try {
      await api.resources.deletePvcBrowserNode(pvc.id, node.path);
      await refreshBrowser(pvc.id, currentDirectory?.current_path || '/');
      if (previewNode?.path === node.path) {
        setPreviewNode(null);
        setPreview({ mode: 'empty' });
      }
    } finally {
      setBusy('');
    }
  };

  const handleDownloadNode = async (node: PvcBrowserNode) => {
    const pvc = requireSelectedPvc();
    setBusy(`download:${node.path}`);
    try {
      const blob = await api.resources.fetchPvcBrowserDownloadBlob(pvc.id, node.path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = node.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy('');
    }
  };

  const renderTreeNode = (node: PvcBrowserNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedNodePath === node.path;
    const isDirectory = node.node_type === 'directory';
    return (
      <div key={node.path}>
        <button
          onClick={() => void onTreeClick(node)}
          className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition-all ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <ChevronRight size={14} className={`transition-transform ${isDirectory && isExpanded ? 'rotate-90' : ''} ${!isDirectory ? 'opacity-0' : ''}`} />
          {isDirectory ? (isExpanded ? <FolderOpen size={16} className="text-amber-500" /> : <Folder size={16} className="text-amber-500" />) : <File size={16} className="text-slate-400" />}
          <span className="truncate text-sm font-semibold">{node.name}</span>
        </button>
        {isDirectory && isExpanded && node.children && node.children.length > 0 && (
          <div className="space-y-1">{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const renderNodeIcon = (node: PvcBrowserNode) => {
    if (node.node_type === 'directory') return <Folder size={18} className="text-amber-500" />;
    const mode = inferPreviewMode(node, node.content_type);
    if (mode === 'image') return <FileImage size={18} className="text-pink-500" />;
    if (mode === 'audio') return <Music size={18} className="text-emerald-500" />;
    if (mode === 'video') return <Video size={18} className="text-violet-500" />;
    if (mode === 'text') return <FileCode size={18} className="text-sky-500" />;
    return <FileText size={18} className="text-slate-400" />;
  };

  const openPvcDetail = async (resourceId: number) => {
    await selectPvc(resourceId);
    setViewMode('detail');
  };

  return (
    <div className="h-full overflow-y-auto p-2.5 custom-scrollbar lg:p-3">
      <div className="space-y-3">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUploadFiles(event.target.files)} />
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUploadFolder(event.target.files)} />

        {viewMode === 'list' ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl bg-slate-900 p-4 text-white shadow-lg">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">总 PVC</div>
                <div className="mt-2 text-3xl font-black leading-none">{pvcs.length}</div>
              </div>
              {RESOURCE_TYPE_ORDER.map((type) => (
                <div key={type} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{RESOURCE_TYPE_LABEL[type]}</div>
                  <div className="mt-2 text-3xl font-black leading-none text-slate-900">{resourceTypeStats[type]}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black text-slate-800">
                  PVC 列表
                  <span className="ml-2 text-xs text-slate-400">
                    {selectedPvc ? `当前选择：${selectedPvc.name}` : '未选择 PVC'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => void loadPvcList()} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-500/20">
                    <Plus size={14} />
                    创建空白PVC
                  </button>
                  <button onClick={openArchiveUploadModal} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white shadow-lg shadow-slate-900/10">
                    <Upload size={14} />
                    上传PVC压缩包
                  </button>
                  <button onClick={() => selectedPvc && void handleDeletePvc(selectedPvc)} disabled={!selectedPvc} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                    删除 PVC
                  </button>
                </div>
              </div>

              {folderUploadState.visible && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-slate-900">{folderUploadState.completed ? '文件夹上传完成' : '文件夹上传中'}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        阶段：{folderUploadState.phase === 'creating_directories' ? '创建目录' : '上传文件'} · {Math.min(folderUploadState.processed, folderUploadState.total)} / {folderUploadState.total}
                      </div>
                    </div>
                    {!folderUploadState.completed && !folderUploadState.canceled && (
                      <button type="button" onClick={cancelFolderUpload} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-600">
                        取消
                      </button>
                    )}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${folderUploadState.total > 0 ? (Math.min(folderUploadState.processed, folderUploadState.total) / folderUploadState.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="按名称、PVC名、描述筛选"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold outline-none transition-all focus:border-blue-300"
                />
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">选择</th>
                      <th className="px-3 py-3">名称</th>
                      <th className="px-3 py-3">PVC 名称</th>
                      <th className="px-3 py-3">类型</th>
                      <th className="px-3 py-3">容量</th>
                      <th className="px-3 py-3">状态</th>
                      <th className="px-3 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {loading ? (
                      <tr><td colSpan={7} className="px-3 py-10 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" size={26} /></td></tr>
                    ) : filteredPvcs.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-10 text-center font-semibold text-slate-400">当前项目暂无 PVC</td></tr>
                    ) : (
                      filteredPvcs.map((item) => (
                        <tr key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => void openPvcDetail(item.id)}>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input type="radio" checked={selectedPvcId === item.id} onChange={() => setSelectedPvcId(item.id)} />
                          </td>
                          <td className="px-3 py-2.5 font-black text-slate-900">{item.name}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{item.pvc_name}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-600">{RESOURCE_TYPE_LABEL[item.resource_type] || item.resource_type}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-600">{item.pvc_size}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={item.pvc_k8s_status?.status || 'Unknown'} /></td>
                          <td className="px-3 py-2.5 text-right">
                            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50">进入详情</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewMode('list')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                    返回列表
                  </button>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">PVC 详情</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{selectedPvcDetail?.name || '-'}</div>
                  </div>
                </div>
                {selectedPvc && (
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => void refreshBrowser(selectedPvc.id)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm">
                      <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => void handleCreateDirectory()} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700 shadow-sm">新建目录</button>
                    <button onClick={handleUploadClick} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-2 text-xs font-black text-white shadow-lg shadow-slate-900/10">
                      <Upload size={14} />
                      上传文件到目录
                    </button>
                    <button onClick={handleUploadFolderClick} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                      <FolderOpen size={14} />
                      上传文件夹到目录
                    </button>
                    {selectedPvcDetail && (
                      <button onClick={() => void handleDeletePvc(selectedPvcDetail)} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 shadow-sm">
                        删除 PVC
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {folderUploadState.visible && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-slate-900">{folderUploadState.completed ? '文件夹上传完成' : '文件夹上传中'}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      阶段：{folderUploadState.phase === 'creating_directories' ? '创建目录' : '上传文件'} · {Math.min(folderUploadState.processed, folderUploadState.total)} / {folderUploadState.total}
                    </div>
                  </div>
                  {!folderUploadState.completed && !folderUploadState.canceled && (
                    <button type="button" onClick={cancelFolderUpload} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-600">
                      取消
                    </button>
                  )}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${folderUploadState.total > 0 ? (Math.min(folderUploadState.processed, folderUploadState.total) / folderUploadState.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[220px_minmax(300px,1fr)_320px]">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">目录树</div>
                <div className="max-h-[62vh] space-y-1 overflow-y-auto p-2 custom-scrollbar">
                  <button
                    onClick={() => void openDirectory('/')}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${selectedNodePath === '/' ? 'bg-blue-50 text-blue-700' : 'hover:bg-white text-slate-700'}`}
                  >
                    <Database size={14} className="text-blue-600" />
                    <span className="text-xs font-semibold">/</span>
                  </button>
                  {browserTree.map((node) => renderTreeNode(node))}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                    {(currentDirectory?.breadcrumbs || [{ path: '/', name: '/' }]).map((item) => (
                      <button key={item.path} onClick={() => void openDirectory(item.path)} className="rounded-full bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[62vh] overflow-y-auto custom-scrollbar">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">名称</th>
                        <th className="px-4 py-3">大小</th>
                        <th className="px-4 py-3">更新时间</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...(currentDirectory?.directories || []), ...(currentDirectory?.files || [])].map((node) => (
                        <tr key={node.path} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <button onClick={() => void onTreeClick(node)} className="flex items-center gap-3 text-left">
                              {renderNodeIcon(node)}
                              <div>
                                <div className="text-xs font-black text-slate-900">{node.name}</div>
                                <div className="font-mono text-[11px] text-slate-400">{node.path}</div>
                              </div>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-[11px] font-bold text-slate-500">{node.node_type === 'directory' ? '-' : formatBytes(node.size)}</td>
                          <td className="px-3 py-2 text-[11px] font-bold text-slate-500">{node.updated_at ? new Date(node.updated_at * 1000).toLocaleString() : '-'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-2">
                              {node.node_type === 'file' && (
                                <button onClick={() => void handleDownloadNode(node)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-900">
                                  <Download size={13} />
                                </button>
                              )}
                              <button onClick={() => void handleRenameNode(node)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-900">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => void handleMoveNode(node)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-900">
                                <ChevronRight size={13} />
                              </button>
                              <button onClick={() => void handleDeleteNode(node)} className="rounded-xl border border-rose-100 bg-rose-50 p-2 text-rose-500 hover:text-rose-700">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!currentDirectory || ((currentDirectory.directories.length + currentDirectory.files.length) === 0)) && (
                        <tr>
                          <td colSpan={4} className="px-4 py-7 text-center text-xs font-semibold text-slate-400">当前目录为空。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                {!selectedPvcDetail ? (
                  <div className="flex min-h-[230px] items-center justify-center text-center text-xs font-semibold text-slate-400">右侧会显示 PVC 元信息与文件预览。</div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">PVC 元信息</div>
                      <div className="mt-1.5 text-lg font-black text-slate-900">{selectedPvcDetail.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500">{selectedPvcDetail.pvc_name}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2.5 text-[11px]">
                        <div><div className="text-slate-400">容量</div><div className="mt-1 font-black text-slate-900">{selectedPvcDetail.pvc_size}</div></div>
                        <div><div className="text-slate-400">资源类型</div><div className="mt-1 font-black text-slate-900">{RESOURCE_TYPE_LABEL[selectedPvcDetail.resource_type] || selectedPvcDetail.resource_type}</div></div>
                        <div><div className="text-slate-400">挂载状态</div><div className="mt-1 font-black text-slate-900">{selectedPvcDetail.in_use ? '使用中' : '空闲'}</div></div>
                        <div><div className="text-slate-400">StorageClass</div><div className="mt-1 font-black text-slate-900">{selectedPvcDetail.pvc_k8s_status?.storage_class || '-'}</div></div>
                      </div>
                      <div className="mt-2"><StatusBadge status={selectedPvcDetail.pvc_k8s_status?.status || 'Unknown'} /></div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 px-3 py-2.5">
                        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">文件预览</div>
                        <div className="mt-1.5 text-xs font-black text-slate-900">{previewNode?.name || '未选择文件'}</div>
                      </div>
                      <div className="min-h-[180px] p-3">
                        {preview.mode === 'empty' ? (
                          <div className="flex min-h-[130px] items-center justify-center text-center text-xs font-semibold text-slate-400">选择一个文件即可在这里预览内容。</div>
                        ) : preview.mode === 'text' ? (
                          <pre className="max-h-[34vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-2.5 text-[11px] leading-5 text-slate-100 custom-scrollbar">{preview.text}</pre>
                        ) : preview.mode === 'image' ? (
                          <img src={preview.url} alt={previewNode?.name} className="max-h-[34vh] w-full rounded-lg object-contain bg-slate-50" />
                        ) : preview.mode === 'pdf' ? (
                          <iframe src={preview.url} title={previewNode?.name} className="h-[34vh] w-full rounded-lg border border-slate-200" />
                        ) : preview.mode === 'audio' ? (
                          <audio controls src={preview.url} className="w-full" />
                        ) : preview.mode === 'video' ? (
                          <video controls src={preview.url} className="max-h-[34vh] w-full rounded-lg bg-slate-950" />
                        ) : (
                          <div className="flex min-h-[130px] flex-col items-center justify-center gap-3 text-center">
                            <FileAudio size={42} className="text-slate-300" />
                            <div className="text-xs font-semibold text-slate-500">当前文件不支持在线预览，请直接下载查看。</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="text-2xl font-black text-slate-900">创建 PVC</div>
            <p className="mt-2 text-sm font-medium text-slate-500">为当前项目创建任意资源类型的持久化存储。</p>
            <form onSubmit={handleCreatePvc} className="mt-6 space-y-5">
              <input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="PVC 名称" required className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
              <textarea value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="用途说明" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
              <select
                value={createForm.resource_type}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, resource_type: e.target.value as any }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none"
              >
                <option value="document">文档资源 PVC</option>
                <option value="software">软件包资源 PVC</option>
                <option value="code">源码资源 PVC</option>
                <option value="other">其他资源 PVC</option>
                <option value="output_pvc">输出资源 PVC</option>
              </select>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                  <span>容量</span>
                  <span>{createForm.pvc_size} Gi</span>
                </div>
                <input type="range" min="1" max="100" value={createForm.pvc_size} onChange={(e) => setCreateForm((prev) => ({ ...prev, pvc_size: Number.parseInt(e.target.value, 10) }))} className="w-full accent-blue-600" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">取消</button>
                <button type="submit" disabled={createLoading} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
                  {createLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  创建空白PVC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showArchiveUploadModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="text-2xl font-black text-slate-900">上传 PVC 压缩包</div>
            <p className="mt-2 text-sm font-medium text-slate-500">沿用历史流程：上传压缩包后由任务自动下载并解压到新创建的 PVC 根目录。</p>
            <form onSubmit={submitArchiveUpload} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={archiveUploadForm.resource_type}
                  onChange={(e) => setArchiveUploadForm((prev) => ({ ...prev, resource_type: e.target.value as any }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none"
                >
                  <option value="document">文档资源 PVC</option>
                  <option value="software">软件包资源 PVC</option>
                  <option value="code">源码资源 PVC</option>
                  <option value="other">其他资源 PVC</option>
                  <option value="output_pvc">输出资源 PVC</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={archiveUploadForm.pvc_size}
                  onChange={(e) => setArchiveUploadForm((prev) => ({ ...prev, pvc_size: Number.parseInt(e.target.value, 10) || 10 }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none"
                  placeholder="PVC大小 Gi"
                />
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">
                  <Upload size={14} />
                  选择压缩包
                  <input
                    type="file"
                    multiple
                    accept=".zip,.tar,.tar.gz,.tgz,.gz"
                    className="hidden"
                    onChange={(e) => handleArchiveFileSelection(e.target.files)}
                  />
                </label>
                <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {archiveFiles.length === 0 ? (
                    <div className="text-xs font-semibold text-slate-400">未选择文件（支持 zip/tar/tar.gz/tgz/gz）</div>
                  ) : (
                    archiveFiles.map((file) => (
                      <div key={`${file.name}:${file.size}`} className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 last:border-b-0">
                        <span className="truncate text-xs font-semibold text-slate-700">{file.name}</span>
                        <span className="text-[11px] font-bold text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {archiveUploadError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{archiveUploadError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" disabled={archiveUploadLoading} onClick={() => setShowArchiveUploadModal(false)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                  取消
                </button>
                <button type="submit" disabled={archiveUploadLoading || archiveFiles.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                  {archiveUploadLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  上传并解压
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {busy && (
        <div className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/20">
          <Loader2 size={16} className="animate-spin" />
          正在处理请求
        </div>
      )}
    </div>
  );
};
