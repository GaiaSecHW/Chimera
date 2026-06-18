import React, { useEffect, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen, Loader2, X } from 'lucide-react';

import { api } from '../../clients/api';
import { ProjectFilesystemEntry } from '../../types/types';

type PickerNode = ProjectFilesystemEntry & {
  id: string;
  children: PickerNode[];
};

export interface ProjectFilesystemSelection {
  path: string;
  name: string;
  node_type: 'subproject' | 'directory' | 'file';
}

const sortNodes = (nodes: PickerNode[]) => (
  [...nodes].sort((a, b) => {
    const order = (node: PickerNode) => {
      if (node.node_type === 'subproject') return 0;
      if (node.node_type === 'directory') return 1;
      return 2;
    };
    return order(a) - order(b) || a.name.localeCompare(b.name, 'zh-CN');
  })
);

const toNode = (entry: ProjectFilesystemEntry): PickerNode => ({
  ...entry,
  id: entry.path,
  children: [],
});

const replaceNodeChildren = (nodes: PickerNode[], targetId: string, children: PickerNode[]): PickerNode[] => (
  nodes.map((node) => {
    if (node.id === targetId) {
      return { ...node, children: sortNodes(children), has_children: children.length > 0 || node.has_children };
    }
    if (node.children.length > 0) {
      return { ...node, children: replaceNodeChildren(node.children, targetId, children) };
    }
    return node;
  })
);

const findNode = (nodes: PickerNode[], targetId: string): PickerNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children.length > 0) {
      const found = findNode(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
};

const formatNodeType = (nodeType: PickerNode['node_type']) => {
  if (nodeType === 'file') return '文件';
  if (nodeType === 'directory') return '目录';
  return '子项目';
};

export const ProjectFilesystemPickerModal: React.FC<{
  isOpen: boolean;
  projectId: string;
  selectionMode: 'file' | 'directory' | 'any';
  backend?: 'fileserver' | 'dataflowVulnScanner';
  title: string;
  description: string;
  onClose: () => void;
  onSelect: (selection: ProjectFilesystemSelection) => void;
  allowMultiple?: boolean;
  onSelectMany?: (selections: ProjectFilesystemSelection[]) => void;
}> = ({
  isOpen,
  projectId,
  selectionMode,
  backend = 'fileserver',
  title,
  description,
  onClose,
  onSelect,
  allowMultiple = false,
  onSelectMany,
}) => {
  const assetApi = api.domains.assets;
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const [treeNodes, setTreeNodes] = useState<PickerNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState('');

  useEffect(() => {
    if (!isOpen || !projectId) return;
    void loadRoot();
  }, [isOpen, projectId]);

  const loadRoot = async () => {
    setLoading(true);
    try {
      const root = backend === 'dataflowVulnScanner'
        ? await executionApi.getProjectFilesystemRoot(projectId)
        : await assetApi.fileserver.getProjectFilesystemRoot(projectId);
      setTreeNodes(sortNodes((root.items || []).map(toNode)));
      setExpandedNodes(new Set());
      setSelectedId('');
      setSelectedIds(new Set());
    } catch (error: any) {
      alert(error?.message || '加载项目文件资源失败');
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async (node: PickerNode) => {
    if (node.node_type === 'file') return;
    setLoadingNodeId(node.id);
    try {
      const payload = backend === 'dataflowVulnScanner'
        ? await executionApi.getProjectFilesystemChildren(projectId, node.path)
        : await assetApi.fileserver.getProjectFilesystemChildren(projectId, node.path);
      const children = sortNodes(payload.directories.map(toNode).concat(payload.files.map(toNode)));
      setTreeNodes((prev) => replaceNodeChildren(prev, node.id, children));
    } catch (error: any) {
      alert(error?.message || '加载目录失败');
    } finally {
      setLoadingNodeId('');
    }
  };

  const toggleExpand = async (node: PickerNode) => {
    if (node.node_type === 'file' || !node.has_children) return;
    const next = new Set(expandedNodes);
    if (next.has(node.id)) {
      next.delete(node.id);
      setExpandedNodes(next);
      return;
    }
    next.add(node.id);
    setExpandedNodes(next);
    if (node.children.length === 0) {
      await loadChildren(node);
    }
  };

  const isNodeSelectable = (node: PickerNode) => {
    if (selectionMode === 'any') return true;
    return selectionMode === 'file' ? node.node_type === 'file' : node.node_type !== 'file';
  };

  const collectNodesByIds = (nodes: PickerNode[], ids: Set<string>, result: PickerNode[] = []): PickerNode[] => {
    nodes.forEach((node) => {
      if (ids.has(node.id)) result.push(node);
      if (node.children.length > 0) collectNodesByIds(node.children, ids, result);
    });
    return result;
  };

  const toSelection = (node: PickerNode): ProjectFilesystemSelection => ({
    path: node.path,
    name: node.name,
    node_type: node.node_type,
  });

  const selectedNode = selectedId ? findNode(treeNodes, selectedId) : null;
  const selectionValid = selectedNode ? isNodeSelectable(selectedNode) : false;
  const selectedNodes = allowMultiple ? collectNodesByIds(treeNodes, selectedIds) : [];
  const selectedValidNodes = selectedNodes.filter(isNodeSelectable);

  const toggleMultiSelect = (node: PickerNode) => {
    if (!isNodeSelectable(node)) return;
    setSelectedId(node.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const renderTree = (nodes: PickerNode[], depth = 0): React.ReactNode => (
    nodes.map((node) => {
      const expandable = node.node_type !== 'file' && node.has_children;
      const expanded = expandedNodes.has(node.id);
      const active = selectedId === node.id;
      const checked = selectedIds.has(node.id);
      const selectable = isNodeSelectable(node);
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              active ? 'bg-cyan-100/10 text-cyan-400' : 'text-theme-text-primary hover:bg-theme-elevated'
            }`}
            style={{ paddingLeft: `${depth * 18 + 12}px` }}
            onClick={() => allowMultiple ? toggleMultiSelect(node) : setSelectedId(node.id)}
          >
            {allowMultiple ? (
              <input
                type="checkbox"
                checked={checked}
                disabled={!selectable}
                onChange={() => toggleMultiSelect(node)}
                onClick={(event) => event.stopPropagation()}
                className="h-4 w-4 rounded border-theme-border text-cyan-400 focus:ring-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
              />
            ) : null}
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-theme-text-muted hover:bg-theme-elevated"
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
              <File size={16} className="text-theme-text-muted" />
            ) : expanded ? (
              <FolderOpen size={16} className="text-amber-500" />
            ) : (
              <Folder size={16} className="text-amber-500" />
            )}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.special_badge ? (
              <span className="rounded-full bg-slate-100/10 px-2 py-0.5 text-[10px] font-bold text-theme-text-faint">{node.special_badge}</span>
            ) : null}
          </div>
          {expanded && node.children.length > 0 ? renderTree(node.children, depth + 1) : null}
        </div>
      );
    })
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-theme-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-theme-border px-8 py-6">
          <div>
            <h3 className="text-xl font-semibold text-theme-text-primary">{title}</h3>
            <p className="mt-1 text-sm text-theme-text-secondary">{description}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-3 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.45fr_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-theme-border p-6 md:border-b-0 md:border-r">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-cyan-400" size={28} />
              </div>
            ) : treeNodes.length === 0 ? (
              <div className="py-12 text-center text-sm text-theme-text-muted">当前项目下还没有可选路径</div>
            ) : (
              <div className="space-y-1">{renderTree(treeNodes)}</div>
            )}
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-theme-text-muted">{allowMultiple ? '已选路径' : '已选路径'}</div>
              {allowMultiple ? (
                <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-50/10 p-5">
                  <div className="text-sm font-bold text-theme-text-primary">已选择 {selectedValidNodes.length} 个{selectionMode === 'file' ? '文件' : '目录'}</div>
                  <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                    {selectedValidNodes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-cyan-500/20 bg-theme-elevated/70 px-3 py-4 text-sm text-theme-text-faint">
                        从左侧树中勾选一个或多个{selectionMode === 'file' ? '文件' : '目录'}。
                      </div>
                    ) : selectedValidNodes.map((node) => (
                      <div key={node.id} className="rounded-xl bg-theme-elevated px-3 py-2">
                        <div className="truncate text-sm font-bold text-theme-text-primary">{node.name}</div>
                        <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{node.path}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedNode ? (
                <div className="mt-4 space-y-4 rounded-2xl border border-cyan-500/20 bg-cyan-50/10 p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">类型</div>
                    <div className="mt-1 text-sm font-bold text-theme-text-primary">{formatNodeType(selectedNode.node_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">路径</div>
                    <div className="mt-1 break-all rounded-xl bg-theme-elevated px-3 py-2 font-mono text-sm text-theme-text-primary">
                      {selectedNode.path}
                    </div>
                  </div>
                  {!selectionValid ? (
                    <div className="text-xs text-amber-400">
                      {selectionMode === 'file' ? '当前字段需要选择文件。' : '当前字段需要选择目录或子项目根路径。'}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm text-theme-text-faint">
                  从左侧树中选择一个{selectionMode === 'file' ? '文件' : '目录'}。
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={onClose} className="px-5 py-3 text-sm font-bold text-theme-text-faint hover:text-theme-text-primary">
                取消
              </button>
              <button
                onClick={() => {
                  if (allowMultiple) {
                    const selections = selectedValidNodes.map(toSelection);
                    if (selections.length > 0) {
                      if (onSelectMany) onSelectMany(selections);
                      else onSelect(selections[0]);
                    }
                    return;
                  }
                  if (selectedNode && selectionValid) {
                    onSelect(toSelection(selectedNode));
                  }
                }}
                disabled={allowMultiple ? selectedValidNodes.length === 0 : (!selectedNode || !selectionValid)}
                className="rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allowMultiple ? `选择 ${selectedValidNodes.length} 项` : (selectionMode === 'file' ? '选择该文件' : '选择该目录')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
