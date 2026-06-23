import React, { useEffect, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen, FolderPlus, Loader2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { ProjectFilesystemEntry } from '../../types/types';
import { showPrompt } from '../DialogService';

interface TreeNode {
  entry: ProjectFilesystemEntry;
  children: TreeNode[] | null; // null = not yet loaded
  isLoading: boolean;
}

const buildContainerPath = (projectId: string, apiPath: string, containerRoot: string): string => {
  const rel = apiPath === '/' ? '' : apiPath;
  return `${containerRoot.replace(/\/+$/, '')}/${projectId}${rel}`;
};

interface FileServerPickerModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (containerPath: string) => void;
  mode?: 'directory' | 'file';
  title?: string;
  description?: string;
  confirmText?: string;
  containerRoot?: string;
}

export const FileServerPickerModal: React.FC<FileServerPickerModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onSelect,
  mode = 'directory',
  title,
  description,
  confirmText,
  containerRoot = '/data/files',
}) => {
  const fileserverApi = api.domains.assets.fileserver;

  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<ProjectFilesystemEntry | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const loadRoots = async () => {
    setLoadingRoots(true);
    try {
      const resp = await fileserverApi.getProjectFilesystemRoot(projectId);
      setRoots(
        resp.items
          .filter((e) => e.node_type === 'subproject')
          .map((e) => ({ entry: e, children: null, isLoading: false }))
      );
    } catch {
      setRoots([]);
    } finally {
      setLoadingRoots(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      setSelectedEntry(null);
      setExpandedPaths(new Set());
      void loadRoots();
    }
  }, [isOpen, projectId]);

  const toggleExpand = async (node: TreeNode, updateFn: (updater: (prev: TreeNode[]) => TreeNode[]) => void) => {
    const path = node.entry.path;
    if (expandedPaths.has(path)) {
      setExpandedPaths((prev) => { const s = new Set(prev); s.delete(path); return s; });
      return;
    }
    setExpandedPaths((prev) => new Set(prev).add(path));
    if (node.children !== null) return;

    // Mark loading
    updateFn((prev) => updateNodeInTree(prev, path, (n) => ({ ...n, isLoading: true })));
    try {
      const resp = await fileserverApi.getProjectFilesystemChildren(projectId, path);
      const childNodes: TreeNode[] = [...resp.directories, ...resp.files].map((entry) => ({
        entry,
        children: null,
        isLoading: false,
      }));
      updateFn((prev) => updateNodeInTree(prev, path, (n) => ({ ...n, children: childNodes, isLoading: false })));
    } catch {
      updateFn((prev) => updateNodeInTree(prev, path, (n) => ({ ...n, children: [], isLoading: false })));
    }
  };

  const updateNodeInTree = (nodes: TreeNode[], targetPath: string, updater: (n: TreeNode) => TreeNode): TreeNode[] => {
    return nodes.map((n) => {
      if (n.entry.path === targetPath) return updater(n);
      if (n.children) return { ...n, children: updateNodeInTree(n.children, targetPath, updater) };
      return n;
    });
  };

  const handleCreateDirectory = async (parentPath: string) => {
    const name = await showPrompt({
      title: '新建文件夹',
      message: '请输入文件夹名称',
      placeholder: '例如：firmware-output',
    });
    if (!name?.trim()) return;
    const newPath = parentPath === '/' ? `/${name.trim()}` : `${parentPath}/${name.trim()}`;
    try {
      await fileserverApi.createProjectFilesystemDirectory({ project_id: projectId, path: newPath });
      // Refresh the parent
      setRoots((prev) => updateNodeInTree(prev, parentPath, (n) => ({ ...n, children: null })));
      // Re-expand to reload children
      setExpandedPaths((prev) => { const s = new Set(prev); s.delete(parentPath); return s; });
      setTimeout(() => {
        setExpandedPaths((prev) => new Set(prev).add(parentPath));
        setRoots((prev) => {
          const parentNode = findNodeInTree(prev, parentPath);
          if (parentNode) void toggleExpand(parentNode, setRoots);
          return prev;
        });
      }, 50);
    } catch {
      // silently ignore
    }
  };

  const findNodeInTree = (nodes: TreeNode[], targetPath: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.entry.path === targetPath) return n;
      if (n.children) {
        const found = findNodeInTree(n.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const renderTree = (nodes: TreeNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const path = node.entry.path;
      const isFile = node.entry.node_type === 'file';
      const isExpanded = expandedPaths.has(path);
      const isSelected = selectedEntry?.path === path;

      return (
        <div key={path}>
          <div
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer select-none text-sm ${
              isSelected ? 'bg-blue-100/10 text-blue-400' : 'hover:bg-theme-elevated text-theme-text-primary'
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => setSelectedEntry(node.entry)}
            onDoubleClick={() => { if (!isFile) void toggleExpand(node, setRoots); }}
          >
            {isFile ? (
              <span className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <button
                type="button"
                className="shrink-0 text-theme-text-muted hover:text-theme-text-primary p-0.5"
                onClick={(e) => { e.stopPropagation(); void toggleExpand(node, setRoots); }}
              >
                {node.isLoading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                )}
              </button>
            )}
            {isFile ? (
              <File size={14} className="shrink-0 text-theme-text-muted" />
            ) : isExpanded ? (
              <FolderOpen size={14} className="shrink-0 text-amber-500" />
            ) : (
              <Folder size={14} className="shrink-0 text-amber-400" />
            )}
            <span className="ml-1 truncate font-medium">{node.entry.name}</span>
            {node.entry.special_badge ? (
              <span className="ml-1 shrink-0 rounded px-1 text-[10px] bg-amber-100/10 text-amber-400">{node.entry.special_badge}</span>
            ) : null}
            {!isFile && mode === 'directory' && (
              <button
                type="button"
                title="在此目录下新建文件夹"
                className="ml-auto shrink-0 text-theme-text-faint hover:text-theme-text-primary p-0.5 rounded"
                onClick={(e) => { e.stopPropagation(); void handleCreateDirectory(path); }}
              >
                <FolderPlus size={12} />
              </button>
            )}
          </div>
          {isExpanded && node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
          {isExpanded && node.children && node.children.length === 0 && (
            <div className="text-xs text-theme-text-muted py-1" style={{ paddingLeft: `${8 + (depth + 1) * 16 + 20}px` }}>
              （空目录）
            </div>
          )}
        </div>
      );
    });
  };

  if (!isOpen) return null;

  const containerPath = selectedEntry ? buildContainerPath(projectId, selectedEntry.path, containerRoot) : null;
  const isSelectionValid = mode === 'file'
    ? selectedEntry?.node_type === 'file'
    : !!selectedEntry && selectedEntry.node_type !== 'file';
  const modalTitle = title || (mode === 'file' ? '选择文件' : '选择分析目录');
  const modalDescription = description || (mode === 'file' ? '从项目文件系统中选择文件' : '选择目录');
  const modalConfirmText = confirmText || (mode === 'file' ? '选择文件' : '确认选择');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[520px] max-h-[70vh] flex flex-col rounded-2xl bg-theme-surface shadow-2xl border border-theme-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border">
          <div>
            <h3 className="text-base font-semibold text-theme-text-primary">{modalTitle}</h3>
            <p className="mt-1 text-xs text-theme-text-faint">{modalDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-elevated">
            <X size={16} />
          </button>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-auto px-3 py-3 min-h-0">
          {loadingRoots ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-muted py-6 justify-center">
              <Loader2 size={14} className="animate-spin" />加载中...
            </div>
          ) : roots.length === 0 ? (
            <div className="py-8 text-center text-sm text-theme-text-muted">暂无子项目，请先在项目文件资源管理中创建</div>
          ) : (
            <div className="space-y-0.5">{renderTree(roots)}</div>
          )}
        </div>

        {/* Selected path preview */}
        {containerPath && (
          <div className="px-5 py-3 border-t border-theme-border bg-theme-elevated/80">
            <div className="text-xs text-theme-text-muted mb-0.5">容器挂载路径</div>
            <div className="font-mono text-xs text-theme-text-primary break-all">{containerPath}</div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-theme-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-theme-border px-4 py-2 text-sm text-theme-text-secondary hover:bg-theme-elevated"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!containerPath || !isSelectionValid}
            onClick={() => containerPath && onSelect(containerPath)}
            className="rounded-xl bg-theme-surface px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-theme-elevated"
          >
            {modalConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
