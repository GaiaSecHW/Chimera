import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderTree,
  FileText,
  File,
  Image as ImageIcon,
  Music,
  Video,
  FileCode,
  RefreshCw,
  Upload,
  FolderPlus,
  Download,
  Pencil,
  Trash2,
  HardDrive,
  Search,
  X,
  Database,
  Crosshair,
  FolderUp,
} from 'lucide-react';
import {
  PvcBrowserChildrenResponse,
  PvcBrowserNode,
  ProjectFilesystemChildrenResponse,
  ProjectFilesystemEntry,
  ProjectFilesystemRootResponse,
  ProjectResource,
  SecurityProject,
} from '../../types/types';
import { api } from '../../clients/api';
import { showConfirm, showPrompt } from '../../components/DialogService';

type NodeSource = 'virtual' | 'fileserver' | 'pvc';
type UnifiedNodeType =
  | 'workspace'
  | 'fileserver-root'
  | 'pvc-root'
  | 'subproject'
  | 'directory'
  | 'file'
  | 'pvc'
  | 'pvc-directory'
  | 'pvc-file';

interface UnifiedExplorerNode {
  id: string;
  source: NodeSource;
  nodeType: UnifiedNodeType;
  name: string;
  hasChildren: boolean;
  children: UnifiedExplorerNode[];
  specialBadge?: string | null;
  contentType?: string | null;
  size?: number | null;
  updatedAt?: string | null;

  projectId?: string;

  resourceId?: number;
  resourceType?: ProjectResource['resource_type'];
  pvcName?: string;
  path?: string;
}

interface ListingState {
  title: string;
  directories: UnifiedExplorerNode[];
  files: UnifiedExplorerNode[];
  breadcrumbs: Array<{ id: string; name: string; node: UnifiedExplorerNode | null }>;
}

interface PreviewState {
  mode: 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'empty';
  contentType?: string;
  text?: string;
  url?: string;
  size?: number;
  truncated?: boolean;
  displayedBytes?: number;
  view?: string;
}

interface PreviewFileState {
  node: UnifiedExplorerNode;
  filename: string;
  contentType?: string | null;
  size: number;
  updatedAt?: string | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: UnifiedExplorerNode | null;
}

interface RootLoadResult {
  rootNode: UnifiedExplorerNode;
  fileserverRoot: UnifiedExplorerNode;
  pvcRoot: UnifiedExplorerNode;
}

interface UploadDirectoryFileEntry {
  relativePath: string;
  file: File;
}

interface UploadDirectoryTree {
  directories: string[];
  files: UploadDirectoryFileEntry[];
}

interface WebkitFileEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}

interface WebkitDirectoryEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  createReader: () => {
    readEntries: (
      success: (entries: Array<WebkitFileEntryLike | WebkitDirectoryEntryLike>) => void,
      error?: (error: DOMException) => void
    ) => void;
  };
}

type WebkitEntryLike = WebkitFileEntryLike | WebkitDirectoryEntryLike;

type DataTransferItemWithWebkitEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitEntryLike | null;
};

interface DirectoryPickerFileHandleLike {
  kind: 'file';
  getFile: () => Promise<File>;
}

interface DirectoryPickerDirectoryHandleLike {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterableIterator<[string, DirectoryPickerHandleLike]>;
}

type DirectoryPickerHandleLike = DirectoryPickerFileHandleLike | DirectoryPickerDirectoryHandleLike;

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: () => Promise<DirectoryPickerDirectoryHandleLike>;
  };

const TEXT_EXTENSIONS = new Set(['txt', 'json', 'yaml', 'yml', 'md', 'log', 'xml', 'csv', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'sh', 'sql']);
const BINARY_PREVIEW_MAX_BYTES = 1024 * 1024;

const toBytes = (base64: string) => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const toHexAsciiView = (bytes: Uint8Array) => {
  const rows: string[] = [];
  const rowSize = 16;
  for (let offset = 0; offset < bytes.length; offset += rowSize) {
    const slice = bytes.slice(offset, offset + rowSize);
    const hexChunks: string[] = [];
    const asciiChars: string[] = [];
    for (let idx = 0; idx < rowSize; idx += 1) {
      if (idx < slice.length) {
        const value = slice[idx];
        hexChunks.push(value.toString(16).padStart(2, '0'));
        asciiChars.push(value >= 32 && value <= 126 ? String.fromCharCode(value) : '.');
      } else {
        hexChunks.push('  ');
        asciiChars.push(' ');
      }
    }
    const left = hexChunks.slice(0, 8).join(' ');
    const right = hexChunks.slice(8).join(' ');
    rows.push(`${offset.toString(16).padStart(8, '0')}  ${left}  ${right}  |${asciiChars.join('')}|`);
  }
  return rows.join('\n');
};

const RESOURCE_TYPE_LABEL: Record<'document' | 'software' | 'code' | 'other' | 'output_pvc', string> = {
  document: '文档',
  software: '软件包',
  code: '源码',
  other: '其他',
  output_pvc: '输出',
};

const normalizePvcPath = (value: string) => {
  const raw = (value || '/').trim();
  if (!raw || raw === '/') return '/';
  const parts = raw.split('/').filter(Boolean);
  return `/${parts.join('/')}`;
};

const parentPvcPath = (path: string) => {
  const normalized = normalizePvcPath(path);
  if (normalized === '/') return '/';
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
};

const sortNodes = (nodes: UnifiedExplorerNode[]) => {
  return [...nodes].sort((a, b) => {
    const order = (node: UnifiedExplorerNode) => {
      if (node.nodeType === 'subproject' || node.nodeType === 'pvc' || node.nodeType === 'directory' || node.nodeType === 'pvc-directory') return 0;
      return 1;
    };
    return order(a) - order(b) || a.name.localeCompare(b.name, 'zh-CN');
  });
};

const flattenNode = (node: UnifiedExplorerNode, map: Record<string, UnifiedExplorerNode>) => {
  map[node.id] = node;
  node.children.forEach((child) => flattenNode(child, map));
};

const collectNodeMap = (root: UnifiedExplorerNode) => {
  const map: Record<string, UnifiedExplorerNode> = {};
  flattenNode(root, map);
  return map;
};

const replaceNodeChildren = (node: UnifiedExplorerNode, targetId: string, children: UnifiedExplorerNode[]): UnifiedExplorerNode => {
  if (node.id === targetId) {
    return { ...node, children: sortNodes(children), hasChildren: children.length > 0 || node.hasChildren };
  }
  if (!node.children.length) return node;
  return { ...node, children: node.children.map((child) => replaceNodeChildren(child, targetId, children)) };
};

const inferPreviewModeByName = (filename: string, contentType?: string | null): PreviewState['mode'] => {
  const ct = contentType || '';
  if (ct.startsWith('text/') || ct === 'application/json' || ct === 'application/xml' || ct === 'application/javascript') {
    return 'text';
  }
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'application/pdf') return 'pdf';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('video/')) return 'video';
  const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'binary';
};

const buildFsPathNodeId = (path: string) => `fs:path:${encodeURIComponent(path)}`;
const parentFsPath = (path: string) => {
  const raw = (path || '/').trim() || '/';
  if (raw === '/') return '/';
  const parts = raw.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
};

const buildFsChildPath = (parentPath: string, name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return parentPath;
  return parentPath === '/' ? `/${trimmed}` : `${parentPath.replace(/\/+$/, '')}/${trimmed}`;
};

const toFsPathNode = (projectId: string, entry: ProjectFilesystemEntry): UnifiedExplorerNode => ({
  id: buildFsPathNodeId(entry.path),
  source: 'fileserver',
  nodeType: entry.node_type,
  name: entry.name,
  hasChildren: entry.has_children,
  children: [],
  projectId,
  path: entry.path,
  contentType: entry.content_type,
  size: entry.size ?? null,
  updatedAt: entry.updated_at || null,
  specialBadge: entry.special_badge || null,
});

const toPvcResourceNode = (resource: ProjectResource): UnifiedExplorerNode => ({
  id: `pvc:resource:${resource.id}`,
  source: 'pvc',
  nodeType: 'pvc',
  name: resource.name,
  hasChildren: true,
  children: [],
  resourceId: resource.id,
  resourceType: resource.resource_type,
  pvcName: resource.pvc_name,
  updatedAt: resource.updated_at,
  specialBadge: RESOURCE_TYPE_LABEL[resource.resource_type] || resource.resource_type,
});

const toPvcDirectoryNode = (resourceId: number, node: PvcBrowserNode): UnifiedExplorerNode => ({
  id: `pvc:dir:${resourceId}:${encodeURIComponent(node.path)}`,
  source: 'pvc',
  nodeType: 'pvc-directory',
  name: node.name,
  hasChildren: node.has_children,
  children: [],
  resourceId,
  path: normalizePvcPath(node.path),
  updatedAt: node.updated_at ? new Date(node.updated_at * 1000).toISOString() : null,
});

const toPvcFileNode = (resourceId: number, node: PvcBrowserNode): UnifiedExplorerNode => ({
  id: `pvc:file:${resourceId}:${encodeURIComponent(node.path)}`,
  source: 'pvc',
  nodeType: 'pvc-file',
  name: node.name,
  hasChildren: false,
  children: [],
  resourceId,
  path: normalizePvcPath(node.path),
  contentType: node.content_type,
  size: node.size ?? 0,
  updatedAt: node.updated_at ? new Date(node.updated_at * 1000).toISOString() : null,
});

const isFileserverDirectoryLike = (node: UnifiedExplorerNode | null | undefined) =>
  Boolean(node && (node.nodeType === 'fileserver-root' || node.nodeType === 'subproject' || node.nodeType === 'directory'));

const getFileserverDirectoryPath = (node: UnifiedExplorerNode | null | undefined) => {
  if (!node) return null;
  if (node.nodeType === 'fileserver-root') return '/';
  if ((node.nodeType === 'subproject' || node.nodeType === 'directory') && node.path) return node.path;
  return null;
};

const normalizeUploadRelativePath = (value: string) =>
  value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');

const uniqueSortedDirectories = (directories: Iterable<string>) =>
  Array.from(new Set(Array.from(directories).map(normalizeUploadRelativePath).filter(Boolean))).sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length;
    return depthDiff || a.localeCompare(b, 'zh-CN');
  });

const isDirectoryUploadSupported = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const hasDataTransferItemEntryGetter = (item: DataTransferItem): item is DataTransferItemWithWebkitEntry =>
  typeof (item as unknown as DataTransferItemWithWebkitEntry).webkitGetAsEntry === 'function';

const isWebkitDirectoryEntry = (entry: unknown): entry is WebkitDirectoryEntryLike =>
  Boolean(
    entry &&
      typeof entry === 'object' &&
      'isDirectory' in entry &&
      'createReader' in entry &&
      typeof (entry as { createReader?: unknown }).createReader === 'function'
  );

const isWebkitFileEntry = (entry: unknown): entry is WebkitFileEntryLike =>
  Boolean(
    entry &&
      typeof entry === 'object' &&
      'isFile' in entry &&
      'file' in entry &&
      typeof (entry as { file?: unknown }).file === 'function'
  );

const isWebkitEntry = (entry: unknown): entry is WebkitEntryLike => isWebkitFileEntry(entry) || isWebkitDirectoryEntry(entry);

const getDataTransferItemEntry = (item: DataTransferItem) => {
  if (!hasDataTransferItemEntryGetter(item)) {
    return null;
  }
  const entry = (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.() ?? null;
  return isWebkitEntry(entry) ? entry : null;
};

const isDragDirectoryUploadSupported = (items: DataTransferItemList | null | undefined) =>
  Boolean(items && Array.from(items).some(hasDataTransferItemEntryGetter));

const hasDraggedDirectoryItems = (items: DataTransferItemList | null | undefined) =>
  Boolean(
    items &&
      Array.from(items).some((item) => {
        const entry = getDataTransferItemEntry(item);
        return Boolean(entry?.isDirectory);
      })
  );

const readAllWebkitEntries = async (directory: WebkitDirectoryEntryLike): Promise<WebkitEntryLike[]> => {
  const reader = directory.createReader();
  const entries: WebkitEntryLike[] = [];

  while (true) {
    const batch = await new Promise<WebkitEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    entries.push(...batch);
  }

  return entries;
};

const readWebkitFile = (entry: WebkitFileEntryLike): Promise<File> =>
  new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });

const collectTreeFromWebkitEntry = async (
  entry: WebkitEntryLike,
  parentPath = ''
): Promise<UploadDirectoryTree> => {
  const currentPath = normalizeUploadRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name);

  if (isWebkitFileEntry(entry)) {
    const file = await readWebkitFile(entry);
    return {
      directories: [],
      files: [{ relativePath: currentPath, file }],
    };
  }

  const directories = [currentPath];
  const files: UploadDirectoryFileEntry[] = [];
  const childEntries = await readAllWebkitEntries(entry as WebkitDirectoryEntryLike);
  for (const child of childEntries) {
    const childTree = await collectTreeFromWebkitEntry(child, currentPath);
    directories.push(...childTree.directories);
    files.push(...childTree.files);
  }

  return {
    directories: uniqueSortedDirectories(directories),
    files,
  };
};

const collectTreeFromDirectoryHandle = async (
  directoryHandle: DirectoryPickerDirectoryHandleLike,
  parentPath = ''
): Promise<UploadDirectoryTree> => {
  const currentPath = normalizeUploadRelativePath(parentPath ? `${parentPath}/${directoryHandle.name}` : directoryHandle.name);
  const directories = [currentPath];
  const files: UploadDirectoryFileEntry[] = [];

  for await (const [, handle] of directoryHandle.entries()) {
    if (handle.kind === 'directory') {
      const childTree = await collectTreeFromDirectoryHandle(handle, currentPath);
      directories.push(...childTree.directories);
      files.push(...childTree.files);
      continue;
    }
    const file = await handle.getFile();
    files.push({
      relativePath: normalizeUploadRelativePath(`${currentPath}/${file.name}`),
      file,
    });
  }

  return {
    directories: uniqueSortedDirectories(directories),
    files,
  };
};

export const ProjectFileExplorerPage: React.FC<{ projectId: string; projects: SecurityProject[] }> = ({ projectId, projects }) => {
  const assetApi = api.domains.assets;
  const projectName = projects.find((item) => item.id === projectId)?.name || projectId;

  const [rootNode, setRootNode] = useState<UnifiedExplorerNode>({
    id: `workspace:${projectId}`,
    source: 'virtual',
    nodeType: 'workspace',
    name: projectName,
    hasChildren: true,
    children: [],
    projectId,
  });
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingState>({ title: '项目文件资源', directories: [], files: [], breadcrumbs: [] });
  const [previewFile, setPreviewFile] = useState<PreviewFileState | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ mode: 'empty' });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragHoverNodeId, setDragHoverNodeId] = useState<string | null>(null);
  const [gatewayLoadingNodeIds, setGatewayLoadingNodeIds] = useState<Set<string>>(new Set());

  // Pending navigation path from task output button (secflow:fileExplorerNavigatePath)
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(() => {
    const p = sessionStorage.getItem('secflow:fileExplorerNavigatePath');
    if (p) sessionStorage.removeItem('secflow:fileExplorerNavigatePath');
    return p;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<UnifiedExplorerNode | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const nodeMap = useMemo(() => collectNodeMap(rootNode), [rootNode]);
  const selectedNode = selectedNodeId ? nodeMap[selectedNodeId] || null : null;

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setRootNode({
        id: 'workspace:unselected',
        source: 'virtual',
        nodeType: 'workspace',
        name: '未选择项目',
        hasChildren: true,
        children: [],
        projectId: '',
      });
      setExpandedNodes(new Set());
      setSelectedNodeId(null);
      setListing({ title: '项目文件资源', directories: [], files: [], breadcrumbs: [] });
      clearPreview();
      return;
    }
    void initialize();
  }, [projectId, projectName]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Listen for navigate-to-path requests from other views (e.g. task output button)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      if (detail?.view !== 'project-file-explorer') return;
      const p = sessionStorage.getItem('secflow:fileExplorerNavigatePath');
      if (p) {
        sessionStorage.removeItem('secflow:fileExplorerNavigatePath');
        setPendingNavPath(p);
      }
    };
    window.addEventListener('secflow-navigate-view', handler as EventListener);
    return () => window.removeEventListener('secflow-navigate-view', handler as EventListener);
  }, []);

  // When a pending nav path is ready and the explorer has finished loading, navigate to it
  useEffect(() => {
    if (!pendingNavPath || loading || !projectId) return;
    const path = pendingNavPath;
    setPendingNavPath(null);
    const node: UnifiedExplorerNode = {
      id: buildFsPathNodeId(path),
      source: 'fileserver',
      nodeType: 'directory',
      name: path.split('/').filter(Boolean).pop() || path,
      hasChildren: true,
      children: [],
      projectId,
      path,
    };
    void openNode(node);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNavPath, loading]);

  const clearPreview = () => {
    setPreviewFile(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview({ mode: 'empty' });
  };

  const withGatewayLoading = async <T,>(nodeId: string, runner: () => Promise<T>): Promise<T> => {
    setGatewayLoadingNodeIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
    try {
      return await runner();
    } finally {
      setGatewayLoadingNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const loadRoots = async (): Promise<RootLoadResult> => {
    if (!projectId) {
      throw new Error('请先选择项目');
    }
    const [fsRoot, resources] = await Promise.all([
      assetApi.fileserver.getProjectFilesystemRoot(projectId),
      assetApi.resources.list(projectId),
    ]);

    const fileserverRoot: UnifiedExplorerNode = {
      id: `fs:root:${projectId}`,
      source: 'virtual',
      nodeType: 'fileserver-root',
      name: '项目文件（Fileserver）',
      hasChildren: true,
      children: sortNodes((fsRoot.items || []).map((item: ProjectFilesystemRootResponse['items'][number]) => toFsPathNode(projectId, item))),
      projectId,
    };

    const pvcResources = resources
      .filter((item: ProjectResource) => Boolean(item.pvc_name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    const pvcRoot: UnifiedExplorerNode = {
      id: `pvc:root:${projectId}`,
      source: 'virtual',
      nodeType: 'pvc-root',
      name: 'PVC资源',
      hasChildren: true,
      children: pvcResources.map((item) => toPvcResourceNode(item)),
      projectId,
    };

    const workspaceRoot: UnifiedExplorerNode = {
      id: `workspace:${projectId}`,
      source: 'virtual',
      nodeType: 'workspace',
      name: projectName,
      hasChildren: true,
      children: [fileserverRoot, pvcRoot],
      projectId,
    };

    return { rootNode: workspaceRoot, fileserverRoot, pvcRoot };
  };

  const initialize = async (preferred?: { source: 'fileserver' } | { source: 'pvc'; resourceId: number }) => {
    if (!projectId) {
      return;
    }
    setLoading(true);
    try {
      const { rootNode: loadedRoot, fileserverRoot, pvcRoot } = await loadRoots();
      setRootNode(loadedRoot);
      setExpandedNodes(new Set([loadedRoot.id, fileserverRoot.id, pvcRoot.id]));

      const preferSource = preferred?.source || 'fileserver';
      if (preferSource === 'pvc' && preferred?.source === 'pvc' && preferred.resourceId) {
        const pvcNode = pvcRoot.children.find((item) => item.resourceId === preferred.resourceId);
        if (pvcNode) {
          await openNode(pvcNode, loadedRoot);
          return;
        }
      }

      await openNode(fileserverRoot, loadedRoot);
    } catch (error: any) {
      alert(error?.message || '加载项目文件资源失败');
      setListing({ title: '项目文件资源', directories: [], files: [], breadcrumbs: [] });
      clearPreview();
    } finally {
      setLoading(false);
    }
  };

  const updateNodeChildren = (targetId: string, children: UnifiedExplorerNode[]) => {
    setRootNode((prev) => replaceNodeChildren(prev, targetId, children));
  };

  const setListingForRootNode = (node: UnifiedExplorerNode, maybeRoot?: UnifiedExplorerNode) => {
    const rootRef = maybeRoot || rootNode;
    const map = collectNodeMap(rootRef);
    setSelectedNodeId(node.id);
    clearPreview();

    setListing({
      title: node.name,
      directories: sortNodes(node.children.filter((item) => item.nodeType !== 'file' && item.nodeType !== 'pvc-file')),
      files: sortNodes(node.children.filter((item) => item.nodeType === 'file' || item.nodeType === 'pvc-file')),
      breadcrumbs: [
        { id: rootRef.id, name: rootRef.name, node: map[rootRef.id] || rootRef },
        node.id !== rootRef.id ? { id: node.id, name: node.name, node } : null,
      ].filter(Boolean) as Array<{ id: string; name: string; node: UnifiedExplorerNode | null }>,
    });
  };

  const buildFsListing = (node: UnifiedExplorerNode, payload: ProjectFilesystemChildrenResponse) => {
    const directories = payload.directories.map((item) => toFsPathNode(projectId, item));
    const files = payload.files.map((item) => toFsPathNode(projectId, item));
    const merged = sortNodes(directories.concat(files));
    updateNodeChildren(node.id, merged);

    const breadcrumbs = payload.breadcrumbs.map((item) => ({
      id: item.path === '/' ? `fs:root:${projectId}` : buildFsPathNodeId(item.path),
      name: item.path === '/' ? '项目文件（Fileserver）' : item.name,
      node: item.path === '/' ? null : nodeMap[buildFsPathNodeId(item.path)] || null,
    }));

    setListing({
      title: payload.current_name,
      directories: sortNodes(directories),
      files: sortNodes(files),
      breadcrumbs,
    });
  };

  const buildPvcListing = (node: UnifiedExplorerNode, payload: PvcBrowserChildrenResponse) => {
    const resourceId = node.resourceId || 0;
    const directories = payload.directories.map((item) => toPvcDirectoryNode(resourceId, item));
    const files = payload.files.map((item) => toPvcFileNode(resourceId, item));
    const merged = sortNodes(directories.concat(files));
    updateNodeChildren(node.id, merged);

    const pvcRootId = `pvc:root:${projectId}`;
    const pvcNodeId = `pvc:resource:${resourceId}`;
    const pvcName = node.name;
    const breadcrumbs = [
      { id: pvcRootId, name: 'PVC资源', node: null },
      { id: pvcNodeId, name: pvcName, node: null },
      ...payload.breadcrumbs
        .filter((item) => item.path !== '/')
        .map((item) => ({
          id: `pvc:dir:${resourceId}:${encodeURIComponent(normalizePvcPath(item.path))}`,
          name: item.name,
          node: null,
        })),
    ];

    setListing({
      title: payload.current_path === '/' ? pvcName : payload.current_path,
      directories: sortNodes(directories),
      files: sortNodes(files),
      breadcrumbs,
    });
  };

  const openFileNode = async (node: UnifiedExplorerNode) => {
    setSelectedNodeId(node.id);
    setContextMenu(null);

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const fileState: PreviewFileState = {
      node,
      filename: node.name,
      contentType: node.contentType,
      size: node.size || 0,
      updatedAt: node.updatedAt,
    };

    setPreviewFile(fileState);
    setBusyAction(`preview:${node.id}`);

    try {
      let blob: Blob;
      if (node.source === 'fileserver' && node.path) {
        const parentPath = parentFsPath(node.path);
        const parentPayload = await assetApi.fileserver.getProjectFilesystemChildren(projectId, parentPath);
        const actualFile = parentPayload.files.find((item) => item.path === node.path);
        const directories = sortNodes(parentPayload.directories.map((item) => toFsPathNode(projectId, item)));
        const files = sortNodes(parentPayload.files.map((item) => toFsPathNode(projectId, item)));
        const parentNodeId = parentPath === '/' ? `fs:root:${projectId}` : buildFsPathNodeId(parentPath);
        updateNodeChildren(parentNodeId, sortNodes(directories.concat(files)));
        if (actualFile) {
          fileState.filename = actualFile.name;
          fileState.contentType = actualFile.content_type || null;
          fileState.size = actualFile.size || 0;
          fileState.updatedAt = actualFile.updated_at;
          setPreviewFile({ ...fileState });
          setListing((prev) => ({
            ...prev,
            directories,
            files,
          }));
        }
        blob = await assetApi.fileserver.fetchProjectFilesystemPreviewBlob(projectId, node.path);
      } else if (node.source === 'pvc' && node.resourceId && node.path) {
        blob = await assetApi.resources.fetchPvcBrowserPreviewBlob(node.resourceId, node.path);
      } else {
        throw new Error('不支持的文件节点');
      }

      const contentType = blob.type || fileState.contentType || '';
      const mode = inferPreviewModeByName(fileState.filename, contentType);
      if (mode === 'text') {
        const text = await blob.text();
        setPreview({ mode, text, contentType, size: fileState.size });
      } else if (mode === 'binary') {
        if (node.source === 'pvc' && node.resourceId && node.path) {
          const payload = await assetApi.resources.getPvcBrowserFile(node.resourceId, node.path, BINARY_PREVIEW_MAX_BYTES);
          const bytes = toBytes(payload.base64 || '');
          setPreview({
            mode: 'binary',
            contentType: payload.content_type || contentType,
            size: payload.size,
            truncated: payload.truncated,
            displayedBytes: bytes.length,
            view: toHexAsciiView(bytes),
          });
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer()).slice(0, BINARY_PREVIEW_MAX_BYTES);
          setPreview({
            mode: 'binary',
            contentType,
            size: fileState.size,
            truncated: (fileState.size || 0) > bytes.length || blob.size > bytes.length,
            displayedBytes: bytes.length,
            view: toHexAsciiView(bytes),
          });
        }
      } else {
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview({ mode, contentType, size: fileState.size, url });
      }
    } catch (error: any) {
      alert(error?.message || '加载文件预览失败');
      setPreview({
        mode: 'binary',
        contentType: fileState.contentType || '',
        size: fileState.size,
        truncated: false,
        displayedBytes: 0,
        view: '',
      });
    } finally {
      setBusyAction('');
    }
  };

  const openNode = async (node: UnifiedExplorerNode, maybeRoot?: UnifiedExplorerNode) => {
    setContextMenu(null);

    if (node.nodeType === 'workspace' || node.nodeType === 'pvc-root') {
      setListingForRootNode(node, maybeRoot);
      return;
    }

    if (node.nodeType === 'fileserver-root') {
      setSelectedNodeId(node.id);
      clearPreview();
      const payload = await assetApi.fileserver.getProjectFilesystemChildren(projectId, '/');
      const directories = payload.directories.map((item) => toFsPathNode(projectId, item));
      const files = payload.files.map((item) => toFsPathNode(projectId, item));
      updateNodeChildren(node.id, sortNodes(directories.concat(files)));
      setExpandedNodes((prev) => new Set(prev).add(node.id));
      setListing({
        title: node.name,
        directories: sortNodes(directories),
        files: sortNodes(files),
        breadcrumbs: [
          {
            id: `workspace:${projectId}`,
            name: projectName,
            node: (maybeRoot || rootNode).id === `workspace:${projectId}` ? (maybeRoot || rootNode) : nodeMap[`workspace:${projectId}`] || null,
          },
          { id: node.id, name: node.name, node },
        ],
      });
      return;
    }

    if ((node.nodeType === 'subproject' || node.nodeType === 'directory') && node.path) {
      setSelectedNodeId(node.id);
      clearPreview();
      const payload = await assetApi.fileserver.getProjectFilesystemChildren(projectId, node.path);
      setExpandedNodes((prev) => new Set(prev).add(node.id));
      buildFsListing(node, payload);
      return;
    }

    if (node.nodeType === 'pvc' && node.resourceId) {
      setSelectedNodeId(node.id);
      clearPreview();
      const payload = await withGatewayLoading(node.id, () => assetApi.resources.getPvcBrowserChildren(node.resourceId!, '/'));
      setExpandedNodes((prev) => new Set(prev).add(node.id));
      buildPvcListing(node, payload);
      return;
    }

    if (node.nodeType === 'pvc-directory' && node.resourceId && node.path) {
      setSelectedNodeId(node.id);
      clearPreview();
      const payload = await withGatewayLoading(node.id, () => assetApi.resources.getPvcBrowserChildren(node.resourceId!, node.path!));
      setExpandedNodes((prev) => new Set(prev).add(node.id));
      buildPvcListing(node, payload);
      return;
    }

    if (node.nodeType === 'file' || node.nodeType === 'pvc-file') {
      await openFileNode(node);
    }
  };

  const toggleNode = async (node: UnifiedExplorerNode) => {
    if (node.nodeType === 'file' || node.nodeType === 'pvc-file') {
      await openNode(node);
      return;
    }
    if (expandedNodes.has(node.id)) {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      return;
    }
    await openNode(node);
  };

  const refreshCurrentView = async () => {
    if (selectedNode?.source === 'pvc' && selectedNode.resourceId) {
      await initialize({ source: 'pvc', resourceId: selectedNode.resourceId });
      return;
    }
    await initialize({ source: 'fileserver' });
  };

  const askName = (title: string, currentValue = '') =>
    showPrompt({
      title,
      message: '请输入名称后继续操作。',
      defaultValue: currentValue,
      placeholder: '请输入名称',
      confirmText: '确认',
      cancelText: '取消',
    });

  const resolveUploadTarget = (node: UnifiedExplorerNode | null): UnifiedExplorerNode | null => {
    if (!node) return null;
    if (isFileserverDirectoryLike(node) || node.nodeType === 'pvc' || node.nodeType === 'pvc-directory') {
      return node;
    }
    if (node.nodeType === 'file' || node.nodeType === 'pvc-file') {
      if (node.source === 'fileserver') {
        if (!node.path) return null;
        const parent = parentFsPath(node.path);
        if (parent === '/') {
          return nodeMap[`fs:root:${projectId}`] || {
            id: `fs:root:${projectId}`,
            source: 'virtual',
            nodeType: 'fileserver-root',
            name: '项目文件（Fileserver）',
            hasChildren: true,
            children: [],
            projectId,
          };
        }
        const parentNodeType = parent.split('/').filter(Boolean).length === 1 ? 'subproject' : 'directory';
        return nodeMap[buildFsPathNodeId(parent)] || {
          id: buildFsPathNodeId(parent),
          source: 'fileserver',
          nodeType: parentNodeType,
          name: parent.split('/').pop() || '/',
          hasChildren: true,
          children: [],
          projectId,
          path: parent,
        };
      }
      if (node.source === 'pvc' && node.resourceId && node.path) {
        const parent = parentPvcPath(node.path);
        if (parent === '/') return nodeMap[`pvc:resource:${node.resourceId}`] || null;
        return nodeMap[`pvc:dir:${node.resourceId}:${encodeURIComponent(parent)}`] || {
          id: `pvc:dir:${node.resourceId}:${encodeURIComponent(parent)}`,
          source: 'pvc',
          nodeType: 'pvc-directory',
          name: parent.split('/').pop() || '/',
          hasChildren: true,
          children: [],
          resourceId: node.resourceId,
          path: parent,
        };
      }
    }
    return null;
  };

const ensureFileserverDirectoryUploadSupport = () => {
  if (!isDirectoryUploadSupported()) {
    throw new Error('当前浏览器不支持文件夹上传，仅支持 Chromium/WebKit 浏览器。');
  }
};

const getPvcDirectoryPath = (target: UnifiedExplorerNode) => {
  if (target.nodeType === 'pvc-directory') {
    return normalizePvcPath(target.path || '/');
  }
  if (target.nodeType === 'pvc') {
    return '/';
  }
  return null;
};

  const buildTargetPath = (basePath: string, relativePath: string) => buildFsChildPath(basePath, normalizeUploadRelativePath(relativePath));

  const uploadDirectoryTree = async (tree: UploadDirectoryTree, target: UnifiedExplorerNode) => {
    if (!isFileserverDirectoryLike(target)) {
      throw new Error('文件夹上传仅支持项目 Fileserver 目录。');
    }

    const targetPath = getFileserverDirectoryPath(target);
    if (!targetPath) {
      throw new Error('无效的目标目录');
    }

    for (const directory of uniqueSortedDirectories(tree.directories)) {
      try {
        await assetApi.fileserver.createProjectFilesystemDirectory({
          project_id: projectId,
          path: buildTargetPath(targetPath, directory),
        });
      } catch (error: any) {
        if (String(error?.message || '').includes('目录已存在')) {
          continue;
        }
        throw new Error(`目录创建失败: ${directory}，${error?.message || '未知错误'}`);
      }
    }

    for (const entry of tree.files) {
      const normalizedFilePath = normalizeUploadRelativePath(entry.relativePath);
      const parentPath = parentFsPath(`/${normalizedFilePath}`);
      const uploadPath = buildTargetPath(targetPath, parentPath === '/' ? '' : parentPath.slice(1));
      try {
        await assetApi.fileserver.uploadProjectFilesystemFile({
          project_id: projectId,
          path: uploadPath,
          file: entry.file,
          overwrite: true,
        });
      } catch (error: any) {
        throw new Error(`文件上传失败: ${normalizedFilePath}，${error?.message || '未知错误'}`);
      }
    }
  };

  const uploadPvcDirectoryTree = async (tree: UploadDirectoryTree, target: UnifiedExplorerNode) => {
    if (!target.resourceId) {
      throw new Error('无效的PVC资源');
    }

    const basePath = getPvcDirectoryPath(target);
    if (!basePath) {
      throw new Error('无效的PVC目标目录');
    }

    const result = await assetApi.resources.uploadPvcBrowserFolder({
      resourceId: target.resourceId,
      basePath,
      files: [],
      directories: tree.directories,
      entries: tree.files.map((entry) => ({
        relativePath: normalizeUploadRelativePath(entry.relativePath),
        file: entry.file,
      })),
    });

    if (result.failed_files > 0) {
      const failure = result.failures[0];
      if (failure?.operation === 'create_directory') {
        throw new Error(`PVC目录创建失败: ${failure.path}，${failure.error || '未知错误'}`);
      }
      throw new Error(`PVC文件上传失败: ${failure?.path || '未知文件'}，${failure?.error || '未知错误'}`);
    }
  };

  const refreshUploadTarget = async (target: UnifiedExplorerNode) => {
    if (isFileserverDirectoryLike(target)) {
      await initialize({ source: 'fileserver' });
      return;
    }
    if (target.resourceId) {
      await initialize({ source: 'pvc', resourceId: target.resourceId });
    }
  };

  const handleCreateSubproject = async () => {
    const name = (await askName('请输入子项目名称'))?.trim() || '';
    if (!name) return;
    setBusyAction('create-subproject');
    try {
      await assetApi.fileserver.createProjectFilesystemDirectory({
        project_id: projectId,
        path: buildFsChildPath('/', name),
      });
      await initialize({ source: 'fileserver' });
    } catch (error: any) {
      alert(error?.message || '创建子项目失败');
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateDirectory = async (node?: UnifiedExplorerNode | null) => {
    const targetNode = node || resolveUploadTarget(selectedNode || null);
    if (!targetNode) {
      alert('请先选择可写入的目录节点');
      return;
    }

    const name = (await askName('请输入文件夹名称'))?.trim() || '';
    if (!name) return;

    setBusyAction('create-directory');
    try {
      if (isFileserverDirectoryLike(targetNode)) {
        const targetPath = getFileserverDirectoryPath(targetNode);
        if (!targetPath) throw new Error('无效的目标目录');
        await assetApi.fileserver.createProjectFilesystemDirectory({
          project_id: projectId,
          path: buildFsChildPath(targetPath, name),
        });
        await initialize({ source: 'fileserver' });
      } else {
        if (!targetNode.resourceId) throw new Error('无效的PVC资源');
        const basePath = targetNode.nodeType === 'pvc-directory' ? normalizePvcPath(targetNode.path || '/') : '/';
        await assetApi.resources.createPvcBrowserDirectory(targetNode.resourceId, basePath, name);
        await initialize({ source: 'pvc', resourceId: targetNode.resourceId });
      }
    } catch (error: any) {
      alert(error?.message || '创建目录失败');
    } finally {
      setBusyAction('');
    }
  };

  const handleRename = async (node: UnifiedExplorerNode) => {
    const name = (await askName('请输入新的名称', node.name))?.trim() || '';
    if (!name || name === node.name) return;

    setBusyAction(`rename:${node.id}`);
    try {
      if (node.source === 'fileserver' && node.path) {
        await assetApi.fileserver.renameProjectFilesystemNode({
          project_id: projectId,
          path: node.path,
          name,
        });
        await initialize({ source: 'fileserver' });
      } else if (node.source === 'pvc' && node.resourceId && node.path) {
        await assetApi.resources.renamePvcBrowserNode(node.resourceId, node.path, name);
        await initialize({ source: 'pvc', resourceId: node.resourceId });
      }
    } catch (error: any) {
      alert(error?.message || '重命名失败');
    } finally {
      setBusyAction('');
    }
  };

  const handleDelete = async (node: UnifiedExplorerNode) => {
    const confirmed = await showConfirm({
      title: '永久删除资源',
      message: `确认永久删除 ${node.name} 吗？该操作不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setBusyAction(`delete:${node.id}`);
    try {
      if (node.source === 'fileserver' && node.path) {
        await assetApi.fileserver.deleteProjectFilesystemNode(projectId, node.path, true);
        await initialize({ source: 'fileserver' });
      } else if (node.source === 'pvc' && node.resourceId && node.path) {
        await assetApi.resources.deletePvcBrowserNode(node.resourceId, node.path);
        await initialize({ source: 'pvc', resourceId: node.resourceId });
      }
    } catch (error: any) {
      alert(error?.message || '删除失败');
    } finally {
      setBusyAction('');
    }
  };

  const triggerUpload = (targetNode: UnifiedExplorerNode | null) => {
    const target = resolveUploadTarget(targetNode);
    if (!target) {
      alert('请先选择可上传的目录节点');
      return;
    }
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  };

  const triggerDirectoryUpload = async (targetNode: UnifiedExplorerNode | null) => {
    const target = resolveUploadTarget(targetNode);
    if (!target) {
      alert('请先选择可上传的目录节点');
      return;
    }

    setBusyAction('upload-directory');
    try {
      ensureFileserverDirectoryUploadSupport();
      const directoryHandle = await (window as WindowWithDirectoryPicker).showDirectoryPicker?.();
      if (!directoryHandle) {
        throw new Error('当前浏览器不支持文件夹选择。');
      }
      const tree = await collectTreeFromDirectoryHandle(directoryHandle);
      if (isFileserverDirectoryLike(target)) {
        await uploadDirectoryTree(tree, target);
      } else {
        await uploadPvcDirectoryTree(tree, target);
      }
      await refreshUploadTarget(target);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      alert(error?.message || '文件夹上传失败');
    } finally {
      setBusyAction('');
    }
  };

  const uploadFiles = async (files: FileList | File[], target: UnifiedExplorerNode) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setBusyAction('upload');
    try {
      if (isFileserverDirectoryLike(target)) {
        const targetPath = getFileserverDirectoryPath(target);
        if (!targetPath) throw new Error('无效的目标目录');
        for (const file of list) {
          await assetApi.fileserver.uploadProjectFilesystemFile({
            project_id: projectId,
            path: targetPath,
            file,
          });
        }
        await initialize({ source: 'fileserver' });
      } else {
        if (!target.resourceId) throw new Error('无效的PVC资源');
        const basePath = target.nodeType === 'pvc-directory' ? normalizePvcPath(target.path || '/') : '/';
        for (const file of list) {
          await assetApi.resources.uploadPvcBrowserFile(target.resourceId, basePath, file);
        }
        await initialize({ source: 'pvc', resourceId: target.resourceId });
      }
    } catch (error: any) {
      alert(error?.message || '上传失败');
    } finally {
      setBusyAction('');
    }
  };

  const uploadDroppedDirectories = async (items: DataTransferItemList, target: UnifiedExplorerNode) => {
    if (!isDragDirectoryUploadSupported(items)) {
      throw new Error('当前浏览器不支持拖拽文件夹上传，仅支持 Chromium/WebKit 浏览器。');
    }

    const directories: string[] = [];
    const files: UploadDirectoryFileEntry[] = [];
    let sawDirectory = false;

    for (const item of Array.from(items)) {
      const entry = getDataTransferItemEntry(item);
      if (!entry) {
        continue;
      }
      if (entry.isDirectory) {
        sawDirectory = true;
      }
      const tree = await collectTreeFromWebkitEntry(entry);
      directories.push(...tree.directories);
      files.push(...tree.files);
    }

    if (!sawDirectory) {
      throw new Error('未检测到可上传的文件夹。');
    }

    const tree = {
      directories: uniqueSortedDirectories(directories),
      files,
    };

    if (isFileserverDirectoryLike(target)) {
      await uploadDirectoryTree(tree, target);
      return;
    }
    await uploadPvcDirectoryTree(tree, target);
  };

  const handleDownload = async (node: UnifiedExplorerNode | PreviewFileState) => {
    const sourceNode = 'node' in node ? node.node : node;
    setBusyAction(`download:${sourceNode.id}`);
    try {
      let blob: Blob;
      let filename: string;
      if (sourceNode.source === 'fileserver' && sourceNode.path) {
        blob = await assetApi.fileserver.fetchProjectFilesystemDownloadBlob(projectId, sourceNode.path);
        filename = sourceNode.name;
      } else if (sourceNode.source === 'pvc' && sourceNode.resourceId && sourceNode.path) {
        blob = await assetApi.resources.fetchPvcBrowserDownloadBlob(sourceNode.resourceId, sourceNode.path);
        filename = sourceNode.name;
      } else {
        throw new Error('当前节点不支持下载');
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error?.message || '下载失败');
    } finally {
      setBusyAction('');
    }
  };

  const handleNodeDrop = async (dragNodeId: string, targetNode: UnifiedExplorerNode) => {
    const dragNode = nodeMap[dragNodeId];
    if (!dragNode || dragNode.id === targetNode.id) return;

    if (dragNode.source !== targetNode.source) {
      alert('不支持跨根移动（Fileserver 与 PVC 之间不可拖拽迁移）');
      return;
    }

    setBusyAction(`move:${dragNode.id}`);
    try {
      if (dragNode.source === 'fileserver') {
        if (dragNode.nodeType === 'subproject') {
          throw new Error('子项目不支持拖拽移动');
        }
        const targetDirectoryPath = getFileserverDirectoryPath(targetNode);
        if (!dragNode.path || !targetDirectoryPath) throw new Error('无效的拖拽目标');
        if (dragNode.nodeType !== 'file' && dragNode.nodeType !== 'directory') {
          throw new Error('仅文件/目录支持拖拽移动');
        }
        await assetApi.fileserver.moveProjectFilesystemNode({
          project_id: projectId,
          source_path: dragNode.path,
          target_directory_path: targetDirectoryPath,
        });
        await initialize({ source: 'fileserver' });
      } else if (dragNode.source === 'pvc') {
        if (!dragNode.resourceId || !dragNode.path) throw new Error('无效PVC节点');
        if (dragNode.resourceId !== targetNode.resourceId) throw new Error('暂不支持跨PVC移动');
        if (dragNode.nodeType !== 'pvc-file' && dragNode.nodeType !== 'pvc-directory') {
          throw new Error('仅文件/目录支持拖拽移动');
        }

        let targetPath = '/';
        if (targetNode.nodeType === 'pvc-directory') {
          targetPath = normalizePvcPath(targetNode.path || '/');
        } else if (targetNode.nodeType === 'pvc') {
          targetPath = '/';
        } else {
          throw new Error('目标必须是PVC或目录');
        }

        await assetApi.resources.movePvcBrowserNode(dragNode.resourceId, dragNode.path, targetPath);
        await initialize({ source: 'pvc', resourceId: dragNode.resourceId });
      }
    } catch (error: any) {
      alert(error?.message || '移动失败');
    } finally {
      setBusyAction('');
      setDragHoverNodeId(null);
    }
  };

  const currentItems = useMemo(() => sortNodes(listing.directories.concat(listing.files)), [listing]);

  const filteredItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return currentItems;
    return currentItems.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [currentItems, searchTerm]);

  const renderNodeIcon = (node: UnifiedExplorerNode, expanded: boolean) => {
    if (node.nodeType === 'workspace') return <FolderTree size={14} className="text-slate-500" />;
    if (node.nodeType === 'fileserver-root') return <HardDrive size={14} className="text-sky-600" />;
    if (node.nodeType === 'pvc-root') return <Database size={14} className="text-emerald-600" />;
    if (node.nodeType === 'subproject') return <HardDrive size={14} className="text-sky-500" />;
    if (node.nodeType === 'pvc') return <Database size={14} className="text-emerald-500" />;
    if (node.nodeType === 'directory' || node.nodeType === 'pvc-directory') {
      return expanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />;
    }
    const type = node.contentType || '';
    if (type.startsWith('image/')) return <ImageIcon size={14} className="text-emerald-500" />;
    if (type.startsWith('audio/')) return <Music size={14} className="text-pink-500" />;
    if (type.startsWith('video/')) return <Video size={14} className="text-violet-500" />;
    const extension = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : '';
    if (TEXT_EXTENSIONS.has(extension)) return <FileCode size={14} className="text-blue-500" />;
    return <File size={14} className="text-slate-400" />;
  };

  const renderTree = (node: UnifiedExplorerNode, depth = 0): React.ReactNode => {
    const expanded = expandedNodes.has(node.id);
    const active = selectedNodeId === node.id;
    const gatewayLoading = gatewayLoadingNodeIds.has(node.id);

    return (
      <div key={node.id}>
        <div
          data-tree-node="true"
          className={`group flex items-center gap-1 rounded-md px-2 py-1 text-[12px] leading-5 cursor-pointer ${
            active ? 'bg-sky-100 text-sky-900' : dragHoverNodeId === node.id ? 'bg-amber-100' : 'text-slate-700 hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          draggable={node.nodeType !== 'workspace' && node.nodeType !== 'fileserver-root' && node.nodeType !== 'pvc-root' && node.nodeType !== 'pvc' && node.nodeType !== 'subproject'}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/secflow-node', node.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => {
            if (isFileserverDirectoryLike(node) || node.nodeType === 'pvc' || node.nodeType === 'pvc-directory') {
              event.preventDefault();
              setDragHoverNodeId(node.id);
            }
          }}
          onDragLeave={() => setDragHoverNodeId((prev) => (prev === node.id ? null : prev))}
          onDrop={async (event) => {
            event.preventDefault();
            const nodeId = event.dataTransfer.getData('application/secflow-node');
            setDragHoverNodeId(null);
            if (nodeId) {
              await handleNodeDrop(nodeId, node);
              return;
            }
            const files = event.dataTransfer.files;
            const target = resolveUploadTarget(node);
            if (target && files && files.length > 0) {
              await uploadFiles(files, target);
            }
          }}
          onClick={() => void openNode(node)}
          onDoubleClick={() => void toggleNode(node)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, node });
          }}
        >
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded hover:bg-white/70"
            onClick={(event) => {
              event.stopPropagation();
              void toggleNode(node);
            }}
          >
            {node.hasChildren ? (
              <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
            ) : <span className="w-3" />}
          </button>
          {gatewayLoading ? <RefreshCw size={14} className="text-sky-500 animate-spin" /> : renderNodeIcon(node, expanded)}
          <span className="truncate flex-1">{node.name}</span>
          {node.specialBadge && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-black text-sky-700">{node.specialBadge}</span>}
        </div>
        {expanded && node.children.length > 0 && (
          <div>{node.children.map((child) => renderTree(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const renderPreview = () => {
    if (!previewFile) {
      return (
        <div className="flex h-full items-center justify-center text-slate-400">
          选择一个文件以预览内容
        </div>
      );
    }
    if (busyAction.startsWith('preview:')) {
      return <div className="flex h-full items-center justify-center text-slate-500">正在加载预览...</div>;
    }
    if (preview.mode === 'text') {
      const isMd = previewFile.filename.endsWith('.md') || previewFile.filename.endsWith('.markdown');
      if (isMd && preview.text) {
        return (
          <div className="h-full overflow-auto rounded-2xl bg-white p-6">
            <div className="prose prose-sm max-w-none text-slate-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-relaxed">{children}</p>,
                  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2">{children}</a>,
                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0 text-sm">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0 text-sm">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  h1: ({ children }) => <h1 className="mb-3 text-xl font-black text-slate-900 border-b border-slate-200 pb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-2 text-base font-bold text-slate-800 mt-4">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-1 text-sm font-bold text-slate-700 mt-3">{children}</h3>,
                  blockquote: ({ children }) => <blockquote className="mb-2 border-l-4 border-cyan-300 bg-cyan-50 px-3 py-1.5 italic text-sm last:mb-0">{children}</blockquote>,
                  table: ({ children }) => <div className="mb-2 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-sm">{children}</table></div>,
                  thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                  th: ({ children }) => <th className="border border-slate-300 px-3 py-1.5 font-bold text-slate-700">{children}</th>,
                  td: ({ children }) => <td className="border border-slate-300 px-3 py-1.5 align-top text-sm">{children}</td>,
                  code: ({ children, className }) => className
                    ? <code className="block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] text-slate-100">{children}</code>
                    : <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{children}</code>,
                  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
                }}
              >
                {preview.text}
              </ReactMarkdown>
            </div>
          </div>
        );
      }
      return <pre className="h-full overflow-auto rounded-2xl bg-slate-950 p-5 text-[12px] text-slate-100 whitespace-pre-wrap">{preview.text || ''}</pre>;
    }
    if (preview.mode === 'image' && preview.url) {
      return <div className="flex h-full items-center justify-center"><img src={preview.url} alt={previewFile.filename} className="max-h-full max-w-full rounded-xl shadow-xl" /></div>;
    }
    if (preview.mode === 'pdf' && preview.url) {
      return <iframe src={preview.url} title={previewFile.filename} className="h-full w-full rounded-2xl border border-slate-200 bg-white" />;
    }
    if (preview.mode === 'audio' && preview.url) {
      return <div className="flex h-full items-center justify-center"><audio controls src={preview.url} className="w-full max-w-xl" /></div>;
    }
    if (preview.mode === 'video' && preview.url) {
      return <div className="flex h-full items-center justify-center"><video controls src={preview.url} className="max-h-full max-w-full rounded-xl shadow-xl" /></div>;
    }
    if (preview.mode === 'binary') {
      return (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="text-xs font-semibold text-slate-500">
            已展示前 {preview.displayedBytes || 0} bytes
            {preview.truncated && typeof preview.size === 'number' ? `（总大小 ${preview.size} bytes）` : ''}
          </div>
          <pre className="min-h-0 flex-1 overflow-auto rounded-2xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
            {preview.view || ''}
          </pre>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <FileText size={36} className="text-slate-300" />
        <div className="text-sm font-bold">该文件类型暂不支持内嵌预览</div>
        <div className="text-xs text-slate-400">文件类型：{preview.contentType || previewFile.contentType || 'unknown'}</div>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
          onClick={() => void handleDownload(previewFile)}
        >
          下载文件
        </button>
      </div>
    );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const node = contextMenu.node;
    const actions: Array<{ label: string; icon: React.ReactNode; onClick: () => void }> = [];

    if (!node || node.nodeType === 'workspace') {
      actions.push({ label: '刷新', icon: <RefreshCw size={14} />, onClick: () => void refreshCurrentView() });
      actions.push({ label: '新建子项目', icon: <HardDrive size={14} />, onClick: () => void handleCreateSubproject() });
    } else if (node.nodeType === 'fileserver-root') {
      actions.push({ label: '刷新', icon: <RefreshCw size={14} />, onClick: () => void refreshCurrentView() });
      actions.push({ label: '新建子项目', icon: <HardDrive size={14} />, onClick: () => void handleCreateSubproject() });
      actions.push({ label: '上传文件', icon: <Upload size={14} />, onClick: () => triggerUpload(node) });
      actions.push({
        label: '用作分析路径',
        icon: <Crosshair size={14} />,
        onClick: () => {
          const dirPath = getFileserverDirectoryPath(node);
          if (dirPath !== null) {
            const containerPath = `/data/files/${projectId}${dirPath === '/' ? '' : dirPath}`;
            sessionStorage.setItem('secflow:systemAnalysisInputPath', containerPath);
            window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'system-analysis-task' } }));
          }
        },
      });
    } else if (node.nodeType === 'pvc-root') {
      actions.push({ label: '刷新', icon: <RefreshCw size={14} />, onClick: () => void refreshCurrentView() });
    } else if (node.nodeType === 'subproject' || node.nodeType === 'directory' || node.nodeType === 'pvc' || node.nodeType === 'pvc-directory') {
      actions.push({ label: '打开', icon: <FolderOpen size={14} />, onClick: () => void openNode(node) });
      actions.push({ label: '新建文件夹', icon: <FolderPlus size={14} />, onClick: () => void handleCreateDirectory(node) });
      actions.push({ label: '上传文件', icon: <Upload size={14} />, onClick: () => triggerUpload(node) });
      if (node.nodeType !== 'pvc') {
        actions.push({ label: '重命名', icon: <Pencil size={14} />, onClick: () => void handleRename(node) });
        actions.push({ label: '删除', icon: <Trash2 size={14} />, onClick: () => void handleDelete(node) });
      }
      if (node.nodeType === 'subproject' || node.nodeType === 'directory') {
        actions.push({
          label: '用作分析路径',
          icon: <Crosshair size={14} />,
          onClick: () => {
            const dirPath = getFileserverDirectoryPath(node);
            if (dirPath !== null) {
              const containerPath = `/data/files/${projectId}${dirPath === '/' ? '' : dirPath}`;
              sessionStorage.setItem('secflow:systemAnalysisInputPath', containerPath);
              window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'system-analysis-task' } }));
            }
          },
        });
      }
    } else if (node.nodeType === 'file' || node.nodeType === 'pvc-file') {
      actions.push({ label: '打开预览', icon: <FileText size={14} />, onClick: () => void openNode(node) });
      actions.push({ label: '下载', icon: <Download size={14} />, onClick: () => void handleDownload(node) });
      actions.push({ label: '重命名', icon: <Pencil size={14} />, onClick: () => void handleRename(node) });
      actions.push({ label: '删除', icon: <Trash2 size={14} />, onClick: () => void handleDelete(node) });
    }

    return (
      <div
        className="fixed z-50 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"
            onClick={() => {
              setContextMenu(null);
              action.onClick();
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_26%),linear-gradient(180deg,#f8fbff_0%,#f1f5f9_100%)] p-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={async (event) => {
          if (event.target.files && uploadTargetRef.current) {
            await uploadFiles(event.target.files, uploadTargetRef.current);
            event.target.value = '';
          }
        }}
      />

      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 px-6 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-600">Project File Explorer</div>
              <h2 className="mt-2 text-3xl font-black text-slate-900">项目文件资源管理</h2>
              <p className="mt-1 text-sm text-slate-500">{projectName}</p>
              <p className="mt-1 text-xs text-slate-400">文件夹上传仅支持 Chromium/WebKit 浏览器，支持递归子目录与空文件夹。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索当前目录"
                  className="w-44 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-700">
                    <X size={12} />
                  </button>
                )}
              </div>
              <button type="button" onClick={() => void refreshCurrentView()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">
                <span className="inline-flex items-center gap-2"><RefreshCw size={14} /> 刷新</span>
              </button>
              <button type="button" onClick={() => void handleCreateSubproject()} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700">
                <span className="inline-flex items-center gap-2"><HardDrive size={14} /> 新建子项目</span>
              </button>
              <button type="button" onClick={() => void handleCreateDirectory()} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700">
                <span className="inline-flex items-center gap-2"><FolderPlus size={14} /> 新建文件夹</span>
              </button>
              <button type="button" onClick={() => triggerUpload(selectedNode || null)} className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white">
                <span className="inline-flex items-center gap-2"><Upload size={14} /> 上传文件</span>
              </button>
              <button type="button" onClick={() => void triggerDirectoryUpload(selectedNode || null)} className="rounded-2xl bg-sky-600 px-4 py-2 text-xs font-black text-white">
                <span className="inline-flex items-center gap-2"><FolderUp size={14} /> 上传文件夹</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {(listing.breadcrumbs.length > 0 ? listing.breadcrumbs : [{ id: `workspace:${projectId}`, name: projectName, node: nodeMap[`workspace:${projectId}`] || null }]).map((item, index, array) => (
              <React.Fragment key={`${item.id}-${index}`}>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 hover:bg-slate-100"
                  onClick={() => {
                    if (item.node) {
                      void openNode(item.node);
                    } else {
                      const node = nodeMap[item.id];
                      if (node) void openNode(node);
                    }
                  }}
                >
                  {item.name}
                </button>
                {index < array.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-4">
          <div
            className="min-h-0 overflow-auto rounded-[2rem] border border-white/70 bg-white/90 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
            onContextMenu={(event) => {
              if ((event.target as HTMLElement).closest('[data-tree-node]')) return;
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY, node: null });
            }}
          >
            <div className="mb-3 flex items-center gap-2 px-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
              <FolderTree size={14} />
              文件树
            </div>
            {loading ? (
              <div className="px-3 py-6 text-sm text-slate-400">正在加载目录结构...</div>
            ) : (
              <div data-tree-node>{renderTree(rootNode)}</div>
            )}
          </div>

          <div
            className="min-h-0 rounded-[2rem] border border-white/70 bg-white/92 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
            onDragOver={(event) => {
              const target = resolveUploadTarget(selectedNode || null);
              if (target) event.preventDefault();
            }}
            onDrop={async (event) => {
              const target = resolveUploadTarget(selectedNode || null);
              if (!target) return;
              if (hasDraggedDirectoryItems(event.dataTransfer.items)) {
                event.preventDefault();
                setBusyAction('upload-directory');
                try {
                  await uploadDroppedDirectories(event.dataTransfer.items, target);
                  await refreshUploadTarget(target);
                } catch (error: any) {
                  alert(error?.message || '文件夹上传失败');
                } finally {
                  setBusyAction('');
                }
                return;
              }
              if (event.dataTransfer.files.length > 0) {
                event.preventDefault();
                await uploadFiles(event.dataTransfer.files, target);
              }
            }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <div className="text-sm font-black text-slate-900">{selectedNode?.name || '项目文件资源'}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{busyAction ? `执行中: ${busyAction}` : '双击目录进入，单击文件预览'}</div>
                </div>
              </div>

              {selectedNode && (selectedNode.nodeType === 'file' || selectedNode.nodeType === 'pvc-file') ? (
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-0">
                  <div className="min-h-0 p-4">{renderPreview()}</div>
                  <div className="border-l border-slate-100 p-5 text-sm text-slate-600">
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">文件信息</div>
                    <div className="mt-4 space-y-3">
                      <div><div className="text-xs text-slate-400">文件名</div><div className="font-bold text-slate-900 break-all">{previewFile?.filename}</div></div>
                      <div><div className="text-xs text-slate-400">内容类型</div><div className="font-semibold">{previewFile?.contentType || preview.contentType || 'unknown'}</div></div>
                      <div><div className="text-xs text-slate-400">大小</div><div className="font-semibold">{previewFile?.size || 0} bytes</div></div>
                      <div><div className="text-xs text-slate-400">更新时间</div><div className="font-semibold">{previewFile?.updatedAt || '--'}</div></div>
                    </div>
                    {previewFile && (
                      <button
                        type="button"
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                        onClick={() => void handleDownload(previewFile)}
                      >
                        <Download size={14} />
                        下载文件
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_190px] gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    <div>名称</div>
                    <div>大小</div>
                    <div>更新时间</div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {filteredItems.map((item) => (
                      <div
                        key={item.id}
                        className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_120px_190px] gap-3 rounded-2xl px-4 py-3 text-sm ${
                          selectedNodeId === item.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                        } ${dragHoverNodeId === item.id ? 'ring-1 ring-amber-300' : ''}`}
                        draggable={item.nodeType !== 'pvc' && item.nodeType !== 'subproject'}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/secflow-node', item.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(event) => {
                          if (item.nodeType === 'directory' || item.nodeType === 'subproject' || item.nodeType === 'pvc' || item.nodeType === 'pvc-directory') {
                            event.preventDefault();
                            setDragHoverNodeId(item.id);
                          }
                        }}
                        onDragLeave={() => setDragHoverNodeId((prev) => (prev === item.id ? null : prev))}
                        onDrop={async (event) => {
                          event.preventDefault();
                          const nodeId = event.dataTransfer.getData('application/secflow-node');
                          setDragHoverNodeId(null);
                          if (nodeId) {
                            await handleNodeDrop(nodeId, item);
                            return;
                          }
                          if ((isFileserverDirectoryLike(item) || item.nodeType === 'pvc' || item.nodeType === 'pvc-directory') && hasDraggedDirectoryItems(event.dataTransfer.items)) {
                            setBusyAction('upload-directory');
                            try {
                              await uploadDroppedDirectories(event.dataTransfer.items, item);
                              await refreshUploadTarget(item);
                            } catch (error: any) {
                              alert(error?.message || '文件夹上传失败');
                            } finally {
                              setBusyAction('');
                            }
                            return;
                          }
                          if (event.dataTransfer.files.length > 0) {
                            const target = resolveUploadTarget(item);
                            if (target) await uploadFiles(event.dataTransfer.files, target);
                          }
                        }}
                        onClick={() => void openNode(item)}
                        onDoubleClick={() => void toggleNode(item)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({ x: event.clientX, y: event.clientY, node: item });
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {renderNodeIcon(item, expandedNodes.has(item.id))}
                          <span className="truncate font-semibold text-slate-700">{item.name}</span>
                          {item.specialBadge && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-black text-sky-700">{item.specialBadge}</span>}
                        </div>
                        <div className="text-xs text-slate-500">{item.nodeType === 'file' || item.nodeType === 'pvc-file' ? `${item.size || 0} bytes` : '--'}</div>
                        <div className="truncate text-xs text-slate-500">{item.updatedAt || '--'}</div>
                      </div>
                    ))}
                    {filteredItems.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400">
                        当前目录没有匹配的文件或文件夹
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {renderContextMenu()}
    </div>
  );
};
