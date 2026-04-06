import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, ChevronRight, FolderTree, Loader2, RefreshCw, Server, Square, UploadCloud } from 'lucide-react';
import { api } from '../../clients/api';
import { ProcessItem, ProcessMonitorNode, ProcessSyncCandidateTreeNode } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

type ProcessTreeNode = ProcessItem & { children: ProcessTreeNode[] };
type FileTreeNode = ProcessSyncCandidateTreeNode & { loaded?: boolean };
type ContextMenuState =
  | { type: 'process'; x: number; y: number; pid: number }
  | { type: 'path'; x: number; y: number; path: string; nodeType: 'dir' | 'file' }
  | null;

const buildProcessTree = (items: ProcessItem[]): ProcessTreeNode[] => {
  const map = new Map<number, ProcessTreeNode>();
  for (const item of items) {
    map.set(item.pid, { ...item, children: [] });
  }
  const roots: ProcessTreeNode[] = [];
  for (const node of map.values()) {
    const ppid = Number(node.ppid || 0);
    const parent = map.get(ppid);
    if (parent && parent.pid !== node.pid) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: ProcessTreeNode[]) => {
    nodes.sort((a, b) => a.pid - b.pid);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
};

const ProcessTreeView: React.FC<{
  nodes: ProcessTreeNode[];
  selectedPids: Set<number>;
  onTogglePid: (pid: number) => void;
  onFocusPid: (pid: number) => void;
  onContext: (event: React.MouseEvent, pid: number) => void;
}> = ({ nodes, selectedPids, onTogglePid, onFocusPid, onContext }) => {
  const renderNode = (node: ProcessTreeNode, depth = 0): React.ReactNode => (
    <div key={node.pid}>
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onFocusPid(node.pid)}
        onContextMenu={(event) => onContext(event, node.pid)}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onTogglePid(node.pid);
          }}
          className="text-slate-500 hover:text-blue-600"
          title="选择进程"
        >
          {selectedPids.has(node.pid) ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
        <span className="text-xs font-mono text-slate-500">{node.pid}</span>
        <span className="text-sm font-semibold text-slate-800">{node.name || 'unknown'}</span>
        <span className="text-[11px] text-slate-400">{node.status || 'unknown'}</span>
      </div>
      {node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );
  return <div className="space-y-0.5">{nodes.map((node) => renderNode(node))}</div>;
};

const PathTreeView: React.FC<{
  nodes: FileTreeNode[];
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onContext: (event: React.MouseEvent, path: string, nodeType: 'dir' | 'file') => void;
}> = ({ nodes, expandedPaths, loadingPaths, onToggleDir, onContext }) => {
  const renderNode = (node: FileTreeNode, depth = 0): React.ReactNode => (
    <div key={node.path}>
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-default"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.type === 'dir') onToggleDir(node.path);
        }}
        onContextMenu={(event) => onContext(event, node.path, node.type)}
      >
        {node.type === 'dir' ? (
          <button
            type="button"
            className="text-slate-500 hover:text-blue-600"
            onClick={(event) => {
              event.stopPropagation();
              onToggleDir(node.path);
            }}
          >
            <ChevronRight
              size={14}
              className={`transition-transform ${expandedPaths.has(node.path) ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="inline-block w-[14px]" />
        )}
        <span className="text-[11px] uppercase text-slate-400">{node.type}</span>
        <span className="text-sm text-slate-700">{node.name}</span>
        {loadingPaths.has(node.path) ? <Loader2 size={12} className="animate-spin text-blue-600" /> : null}
      </div>
      {node.type === 'dir' && expandedPaths.has(node.path) ? (node.children || []).map((child) => renderNode(child, depth + 1)) : null}
    </div>
  );
  return <div className="space-y-0.5">{nodes.map((node) => renderNode(node))}</div>;
};

const attachChildren = (nodes: FileTreeNode[], targetPath: string, children: FileTreeNode[]): FileTreeNode[] =>
  nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children, loaded: true, has_children: children.length > 0 };
    }
    if (!node.children || node.children.length === 0) return node;
    return { ...node, children: attachChildren(node.children as FileTreeNode[], targetPath, children) };
  });

export const EnvProcessMonitorDetailPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [nodes, setNodes] = useState<ProcessMonitorNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [selectedServiceKey, setSelectedServiceKey] = useState('');
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [subprojectId, setSubprojectId] = useState(1);
  const [leftPaneWidth, setLeftPaneWidth] = useState(40);
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [syncing, setSyncing] = useState(false);
  const draggingRef = useRef(false);

  const selectedService = useMemo(() => {
    return nodes.find((item) => `${item.agent_key}:${item.service_name}` === selectedServiceKey) || null;
  }, [nodes, selectedServiceKey]);

  const treeNodes = useMemo(() => buildProcessTree(processes), [processes]);

  const loadNodes = async () => {
    if (!projectId) {
      setNodes([]);
      return;
    }
    setLoadingNodes(true);
    try {
      const data = await api.environment.listProcessMonitorNodes(projectId);
      const items = Array.isArray(data?.items) ? data.items : [];
      setNodes(items);
      if (items.length > 0 && !selectedServiceKey) {
        setSelectedServiceKey(`${items[0].agent_key}:${items[0].service_name}`);
      }
    } catch (error) {
      console.error(error);
      notify('加载节点失败', 'error');
    } finally {
      setLoadingNodes(false);
    }
  };

  const loadProcesses = async () => {
    if (!projectId || !selectedService) {
      setProcesses([]);
      return;
    }
    setLoadingProcesses(true);
    try {
      const data = await api.environment.getNodeProcesses(
        projectId,
        selectedService.agent_key,
        selectedService.service_name,
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      setProcesses(items);
    } catch (error) {
      console.error(error);
      notify('加载进程列表失败', 'error');
    } finally {
      setLoadingProcesses(false);
    }
  };

  const loadDirectory = async (path: string, force = false) => {
    if (!projectId || !selectedService) return;
    if (path === '/') setLoadingFiles(true);
    setLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const data = await api.environment.getNodeFilesystemTree(
        projectId,
        selectedService.agent_key,
        selectedService.service_name,
        { path, limit: 600 },
      );
      const children = (Array.isArray(data?.items) ? data.items : []).map((item: ProcessSyncCandidateTreeNode) => ({
        ...item,
        children: [],
        loaded: false,
      })) as FileTreeNode[];
      if (path === '/' || force) {
        setFileTree((prev) => {
          if (!prev.length || force) {
            return [{ name: '/', path: '/', type: 'dir', has_children: true, loaded: true, children }];
          }
          return attachChildren(prev, path, children);
        });
      } else {
        setFileTree((prev) => attachChildren(prev, path, children));
      }
    } catch (error) {
      console.error(error);
      notify(`加载目录失败: ${path}`, 'error');
    } finally {
      if (path === '/') setLoadingFiles(false);
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  };

  useEffect(() => {
    void loadNodes();
  }, [projectId]);

  useEffect(() => {
    setSelectedPids(new Set());
    setExpandedPaths(new Set(['/']));
    setFileTree([]);
    if (selectedService) {
      void loadProcesses();
      void loadDirectory('/', true);
    }
  }, [selectedServiceKey, projectId]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const width = window.innerWidth;
      const ratio = Math.min(75, Math.max(20, (event.clientX / width) * 100));
      setLeftPaneWidth(ratio);
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const togglePid = (pid: number) => {
    setSelectedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const runSync = async (payload: { mode: 'pid_files' | 'path_files'; pids?: number[]; paths?: string[] }) => {
    if (!projectId || !selectedService) return;
    setSyncing(true);
    try {
      await api.environment.createProcessMonitorSyncTask({
        project_id: projectId,
        agent_key: selectedService.agent_key,
        service_name: selectedService.service_name,
        mode: payload.mode,
        pids: payload.pids,
        paths: payload.paths,
        subproject_id: subprojectId,
      });
      notify('同步任务已创建', 'success');
    } catch (error) {
      console.error(error);
      notify('创建同步任务失败', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="p-10 space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">节点进程监控 - 进程详情</h2>
            <p className="text-slate-500 mt-1 font-medium">左侧文件树，右侧进程树；支持右键同步与批量同步</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadNodes()}
              disabled={!projectId || loadingNodes}
              className="px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              {loadingNodes ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              刷新节点
            </button>
            <button
              onClick={() => void loadProcesses()}
              disabled={!projectId || !selectedService || loadingProcesses}
              className="px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              {loadingProcesses ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              刷新进程
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
          <div className="xl:col-span-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">节点服务</label>
            <select
              value={selectedServiceKey}
              onChange={(event) => setSelectedServiceKey(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3"
            >
              {nodes.map((item) => (
                <option key={`${item.agent_key}:${item.service_name}`} value={`${item.agent_key}:${item.service_name}`}>
                  {item.agent_key} / {item.service_name} ({item.agent_ip || '-'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">目标子项目ID</label>
            <input
              type="number"
              value={subprojectId}
              min={1}
              onChange={(event) => setSubprojectId(Math.max(1, Number(event.target.value || 1)))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Server size={14} />
              {selectedService ? `${selectedService.agent_key} / ${selectedService.service_name}` : '未选择节点'}
            </div>
            <button
              onClick={() => void runSync({ mode: 'pid_files', pids: Array.from(selectedPids) })}
              disabled={syncing || !selectedService || selectedPids.size === 0}
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              同步选中进程 ({selectedPids.size})
            </button>
          </div>

          <div className="relative" style={{ height: '68vh' }}>
            <div className="absolute inset-0 flex">
              <div style={{ width: `${leftPaneWidth}%` }} className="h-full border-r border-slate-100 overflow-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <FolderTree size={14} />
                  全局文件系统树
                </div>
                <div className="p-2">
                  {loadingFiles ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>
                  ) : fileTree.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">暂无文件系统数据</div>
                  ) : (
                    <PathTreeView
                      nodes={fileTree}
                      expandedPaths={expandedPaths}
                      loadingPaths={loadingPaths}
                      onToggleDir={(path) => {
                        setExpandedPaths((prev) => {
                          const next = new Set(prev);
                          if (next.has(path)) next.delete(path);
                          else next.add(path);
                          return next;
                        });
                        const scan = (items: FileTreeNode[]): FileTreeNode | null => {
                          for (const item of items) {
                            if (item.path === path) return item;
                            if (item.children && item.children.length) {
                              const hit = scan(item.children as FileTreeNode[]);
                              if (hit) return hit;
                            }
                          }
                          return null;
                        };
                        const current = scan(fileTree);
                        if (current?.type === 'dir' && !current.loaded) void loadDirectory(path);
                      }}
                      onContext={(event, path, nodeType) => {
                        event.preventDefault();
                        setMenu({ type: 'path', x: event.clientX, y: event.clientY, path, nodeType });
                      }}
                    />
                  )}
                </div>
              </div>

              <div
                className="w-1.5 bg-slate-100 hover:bg-blue-300 cursor-col-resize"
                onMouseDown={() => {
                  draggingRef.current = true;
                }}
              />

              <div style={{ width: `${100 - leftPaneWidth}%` }} className="h-full overflow-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500">进程树（右键可同步）</div>
                <div className="p-2">
                  {loadingProcesses ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>
                  ) : treeNodes.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">暂无进程数据</div>
                  ) : (
                    <ProcessTreeView
                      nodes={treeNodes}
                      selectedPids={selectedPids}
                      onTogglePid={togglePid}
                      onFocusPid={(_pid) => undefined}
                      onContext={(event, pid) => {
                        event.preventDefault();
                        setMenu({ type: 'process', x: event.clientX, y: event.clientY, pid });
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {menu && (
          <div
            className="fixed z-50 rounded-xl border border-slate-200 bg-white shadow-xl p-1 min-w-[180px]"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.type === 'process' ? (
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm"
                onClick={() => {
                  void runSync({ mode: 'pid_files', pids: [menu.pid] });
                  setMenu(null);
                }}
              >
                同步 PID {menu.pid} 相关文件
              </button>
            ) : (
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm"
                onClick={() => {
                  void runSync({ mode: 'path_files', paths: [menu.path] });
                  setMenu(null);
                }}
              >
                {menu.nodeType === 'dir' ? '同步目录' : '同步文件'}: {menu.path}
              </button>
            )}
          </div>
        )}
      </div>
      {feedbackNodes}
    </>
  );
};
