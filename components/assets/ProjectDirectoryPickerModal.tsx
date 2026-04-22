import React, { useEffect, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen, Loader2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { FileExplorerNode } from '../../types/types';

export interface ProjectDirectorySelection {
  subproject_id: number;
  directory_id?: number | null;
  display_path: string;
  subproject_name: string;
  directory_name?: string | null;
}

const sortNodes = (nodes: FileExplorerNode[]) => {
  return [...nodes].sort((a, b) => {
    const order = (node: FileExplorerNode) => {
      if (node.node_type === 'subproject') return 0;
      if (node.node_type === 'directory') return 1;
      return 2;
    };
    return order(a) - order(b) || a.name.localeCompare(b.name, 'zh-CN');
  });
};

const replaceNodeChildren = (nodes: FileExplorerNode[], targetId: string, children: FileExplorerNode[]): FileExplorerNode[] => {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return { ...node, children: sortNodes(children), has_children: children.length > 0 || node.has_children };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: replaceNodeChildren(node.children, targetId, children) };
    }
    return node;
  });
};

const findNode = (nodes: FileExplorerNode[], targetId: string): FileExplorerNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children && node.children.length > 0) {
      const found = findNode(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
};

const findSubprojectName = (nodes: FileExplorerNode[], subprojectId?: number | null): string => {
  if (!subprojectId) return '';
  for (const node of nodes) {
    if (node.node_type === 'subproject' && node.subproject_id === subprojectId) {
      return node.name;
    }
    if (node.children && node.children.length > 0) {
      const found = findSubprojectName(node.children, subprojectId);
      if (found) return found;
    }
  }
  return '';
};

const toDirectoryNode = (directory: any): FileExplorerNode => ({
  node_type: 'directory',
  id: `directory:${directory.id}`,
  name: directory.name,
  project_id: directory.project_id,
  subproject_id: directory.subproject_id,
  directory_id: directory.id,
  parent_directory_id: directory.parent_id ?? null,
  path_key: directory.path_key,
  updated_at: directory.updated_at,
  has_children: true,
  children: [],
});

const toFileNode = (file: any): FileExplorerNode => ({
  node_type: 'file',
  id: `file:${file.id}`,
  name: file.filename,
  project_id: file.project_id,
  subproject_id: file.subproject_id,
  directory_id: file.directory_id ?? null,
  file_id: file.id,
  parent_directory_id: file.directory_id ?? null,
  path_key: file.storage_key,
  content_type: file.content_type,
  size: file.size,
  updated_at: file.updated_at,
  has_children: false,
  children: [],
});

const buildSelection = (nodes: FileExplorerNode[], node: FileExplorerNode): ProjectDirectorySelection | null => {
  if (node.node_type === 'subproject' && node.subproject_id) {
    return {
      subproject_id: node.subproject_id,
      directory_id: null,
      display_path: '/',
      subproject_name: node.name,
      directory_name: null,
    };
  }
  if (node.node_type === 'directory' && node.subproject_id) {
    return {
      subproject_id: node.subproject_id,
      directory_id: node.directory_id ?? null,
      display_path: `/${(node.path_key || node.name).replace(/^\/+/, '')}`,
      subproject_name: findSubprojectName(nodes, node.subproject_id) || '',
      directory_name: node.name,
    };
  }
  return null;
};

export const ProjectDirectoryPickerModal: React.FC<{
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSelect: (selection: ProjectDirectorySelection) => void;
}> = ({ isOpen, projectId, onClose, onSelect }) => {
  const assetApi = api.domains.assets;
  const [treeNodes, setTreeNodes] = useState<FileExplorerNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !projectId) return;
    void loadRoot();
  }, [isOpen, projectId]);

  const loadRoot = async () => {
    setLoading(true);
    try {
      const root = await assetApi.fileserver.getRoot(projectId);
      const sorted = sortNodes(root.items || []);
      setTreeNodes(sorted);
      setExpandedNodes(new Set());
      setSelectedId('');
    } catch (error: any) {
      alert(error?.message || '加载项目文件目录失败');
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async (node: FileExplorerNode) => {
    if (node.node_type !== 'subproject' && node.node_type !== 'directory') return;
    setLoadingNodeId(node.id);
    try {
      const payload = node.node_type === 'subproject'
        ? await assetApi.fileserver.getSubprojectChildren(projectId, node.subproject_id || 0)
        : await assetApi.fileserver.getDirectoryChildren(projectId, node.directory_id || 0);
      const children = payload.directories.map(toDirectoryNode).concat(payload.files.map(toFileNode));
      setTreeNodes((prev) => replaceNodeChildren(prev, node.id, children));
    } catch (error: any) {
      alert(error?.message || '加载目录内容失败');
    } finally {
      setLoadingNodeId('');
    }
  };

  const toggleExpand = async (node: FileExplorerNode) => {
    if (node.node_type !== 'subproject' && node.node_type !== 'directory') return;
    const next = new Set(expandedNodes);
    if (next.has(node.id)) {
      next.delete(node.id);
      setExpandedNodes(next);
      return;
    }
    next.add(node.id);
    setExpandedNodes(next);
    if (!node.children || node.children.length === 0) {
      await loadChildren(node);
    }
  };

  const selectedNode = selectedId ? findNode(treeNodes, selectedId) : null;
  const selectedFolder = selectedNode ? buildSelection(treeNodes, selectedNode) : null;

  const renderTree = (nodes: FileExplorerNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const expandable = (node.node_type === 'subproject' || node.node_type === 'directory') && node.has_children;
      const expanded = expandedNodes.has(node.id);
      const selected = selectedId === node.id;
      const disabled = node.node_type === 'file';
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              selected ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'
            } ${disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700'}`}
            style={{ paddingLeft: `${depth * 20 + 12}px` }}
            onClick={() => {
              if (disabled) return;
              setSelectedId(node.id);
            }}
          >
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200"
              onClick={(event) => {
                event.stopPropagation();
                void toggleExpand(node);
              }}
              disabled={!expandable}
            >
              {expandable ? (
                loadingNodeId === node.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronRight size={14} className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
                )
              ) : null}
            </button>
            {node.node_type === 'file' ? (
              <File size={16} className="text-slate-400" />
            ) : expanded ? (
              <FolderOpen size={16} className="text-amber-500" />
            ) : (
              <Folder size={16} className="text-amber-500" />
            )}
            <span className="truncate">{node.name}</span>
            {node.node_type === 'subproject' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">子项目根目录</span>
            )}
          </div>
          {expanded && node.children && node.children.length > 0 ? renderTree(node.children, depth + 1) : null}
        </div>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="text-xl font-black text-slate-900">选择项目文件夹</h3>
            <p className="mt-1 text-sm text-slate-500">可以选择子项目根目录，或者任意层级的文件夹作为挂载来源。</p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-3 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.4fr_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-100 p-6 md:border-b-0 md:border-r">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-blue-600" size={28} />
              </div>
            ) : treeNodes.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">当前项目下还没有可选文件夹</div>
            ) : (
              <div className="space-y-1">{renderTree(treeNodes)}</div>
            )}
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">已选目录</div>
              {selectedFolder ? (
                <div className="mt-4 space-y-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-blue-500">子项目</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{selectedFolder.subproject_name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-blue-500">目录路径</div>
                    <div className="mt-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm text-slate-700">
                      {selectedFolder.display_path}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">提交后会由 workflow 后端自动解析成 fileserver 共享 PVC 的 `subPath` 挂载。</div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
                  从左侧树中选择一个子项目根目录或任意文件夹。
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={onClose} className="px-5 py-3 text-sm font-bold text-slate-500 hover:text-slate-700">
                取消
              </button>
              <button
                onClick={() => {
                  if (selectedFolder) onSelect(selectedFolder);
                }}
                disabled={!selectedFolder}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                选择该文件夹
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
