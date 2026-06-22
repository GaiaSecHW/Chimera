import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, ChevronRight, Cpu, FileText, FolderTree, Info, Loader2, Network, RefreshCw, Server, Square, UploadCloud, X } from 'lucide-react';
import { api } from '../../clients/api';
import { ProcessItem, ProcessMonitorNode, ProcessSyncCandidateTreeNode, ProcessSyncPreviewResponse } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';

type ProcessTreeNode = ProcessItem & { children: ProcessTreeNode[] };
type FileTreeNode = ProcessSyncCandidateTreeNode & { loaded?: boolean };
type ProcessDetailTab = 'overview' | 'basic' | 'resources' | 'proc' | 'files-net';
type SyncPayload = { mode: 'pid_files' | 'path_files'; pids?: number[]; paths?: string[] };
type ContextMenuState =
  | { type: 'process'; x: number; y: number; pid: number }
  | { type: 'path'; x: number; y: number; path: string; nodeType: 'dir' | 'file' }
  | null;

const HOST_ROOT_PREFIX = '/host';

const normalizeHostVisiblePath = (value: string): string => {
  const text = String(value || '');
  if (!text.startsWith('/')) return text;
  let suffix = '';
  let body = text;
  if (body.endsWith(' (deleted)')) {
    suffix = ' (deleted)';
    body = body.slice(0, -10);
  }
  if (body === HOST_ROOT_PREFIX) return`/${suffix}`;
  if (body.startsWith(`${HOST_ROOT_PREFIX}/`)) return`/${body.slice(HOST_ROOT_PREFIX.length + 1)}${suffix}`;
  return`${body}${suffix}`;
};

const normalizePathNode = (node: any, keyName = ''): any => {
  if (Array.isArray(node)) {
    if (keyName === 'paths') return node.map((item) => (typeof item === 'string' ? normalizeHostVisiblePath(item) : item));
    return node.map((item) => normalizePathNode(item, keyName));
  }
  if (node && typeof node === 'object') {
    const result: Record<string, any> = {};
    Object.entries(node).forEach(([key, value]) => {
      result[key] = normalizePathNode(value, key);
    });
    return result;
  }
  if (typeof node === 'string' && ['path', 'procfs_root', 'cwd', 'exe', 'target', 'source_path', 'relative_path', 'symlink_target'].includes(keyName)) {
    return normalizeHostVisiblePath(node);
  }
  return node;
};

const buildProcessTree = (items: ProcessItem[]): ProcessTreeNode[] => {
  const map = new Map<number, ProcessTreeNode>();
  for (const item of items) {
    map.set(item.pid, { ...item, children: [] });
  }
  const roots: ProcessTreeNode[] = [];
  for (const node of map.values()) {
    const ppid = Number(node.ppid || 0);
    const parent = map.get(ppid);
    if (parent && parent.pid !== node.pid) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (nodes: ProcessTreeNode[]) => {
    nodes.sort((a, b) => a.pid - b.pid);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
};

const formatBytes = (value?: number | null): string => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = bytes;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return`${current.toFixed(current >= 100 ? 0 : current >= 10 ? 1 : 2)} ${units[index]}`;
};

const extractProcText = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.text === 'string') return value.text;
  if (Array.isArray(value?.items)) return value.items.join('\n');
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const ProcessTreeView: React.FC<{
  nodes: ProcessTreeNode[];
  selectedPids: Set<number>;
  onTogglePid: (pid: number) => void;
  onOpenDetail: (pid: number) => void;
  onContext: (event: React.MouseEvent, pid: number) => void;
}> = ({ nodes, selectedPids, onTogglePid, onOpenDetail, onContext }) => {
  const renderNode = (node: ProcessTreeNode, depth = 0): React.ReactNode => {
    const cmdline = Array.isArray(node.cmdline) ? node.cmdline.join(' ') : '';
    return (
      <div key={node.pid}>
        <div
          className="px-2 py-1 rounded-lg hover:bg-theme-elevated cursor-pointer"
          style={{ paddingLeft:`${depth * 16 + 8}px` }}
          onClick={() => onOpenDetail(node.pid)}
          onContextMenu={(event) => onContext(event, node.pid)}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onTogglePid(node.pid);
              }}
              className="text-theme-text-muted hover:text-blue-400"
              title="选择进程"
            >
              {selectedPids.has(node.pid) ? <CheckSquare size={14} /> : <Square size={14} />}
            </button>
            <span className="text-xs font-mono text-theme-text-muted">{node.pid}</span>
            <span className="text-sm font-semibold text-theme-text-primary">{node.name || 'unknown'}</span>
            <span className="text-[11px] text-theme-text-muted">{node.status || 'unknown'}</span>
          </div>
          <div className="pl-6 text-[11px] leading-5 text-theme-text-muted font-mono whitespace-pre-wrap break-all">
            {cmdline || '(no cmdline)'}
          </div>
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };
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
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-theme-elevated cursor-default"
        style={{ paddingLeft:`${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.type === 'dir') onToggleDir(node.path);
        }}
        onContextMenu={(event) => onContext(event, node.path, node.type)}
      >
        {node.type === 'dir' ? (
          <button
            type="button"
            className="text-theme-text-muted hover:text-blue-400"
            onClick={(event) => {
              event.stopPropagation();
              onToggleDir(node.path);
            }}
          >
            <ChevronRight size={14} className={`transition-transform ${expandedPaths.has(node.path) ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="inline-block w-[14px]" />
        )}
        <span className="text-[11px] uppercase text-theme-text-muted">{node.type}</span>
        <span className="text-sm text-theme-text-secondary">{node.name}</span>
        {loadingPaths.has(node.path) ? <Loader2 size={12} className="animate-spin text-blue-400" /> : null}
      </div>
      {node.type === 'dir' && expandedPaths.has(node.path) ? (node.children || []).map((child) => renderNode(child, depth + 1)) : null}
    </div>
  );
  return <div className="space-y-0.5">{nodes.map((node) => renderNode(node))}</div>;
};

const attachChildren = (nodes: FileTreeNode[], targetPath: string, children: FileTreeNode[]): FileTreeNode[] =>
  nodes.map((node) => {
    if (node.path === targetPath) return { ...node, children, loaded: true, has_children: children.length > 0 };
    if (!node.children || node.children.length === 0) return node;
    return { ...node, children: attachChildren(node.children as FileTreeNode[], targetPath, children) };
  });

export const EnvProcessMonitorDetailPage: React.FC<{ projectId: string; initialServiceKey?: string }> = ({ projectId, initialServiceKey }) => {
  const environmentApi = api.domains.environment;
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
  const [leftPaneWidth, setLeftPaneWidth] = useState(25);
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [syncing, setSyncing] = useState(false);
  const [processDetailPid, setProcessDetailPid] = useState<number | null>(null);
  const [processDetailLoading, setProcessDetailLoading] = useState(false);
  const [processDetailData, setProcessDetailData] = useState<any>(null);
  const [processDetailTab, setProcessDetailTab] = useState<ProcessDetailTab>('overview');
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewData, setSyncPreviewData] = useState<ProcessSyncPreviewResponse | null>(null);
  const [syncPreviewError, setSyncPreviewError] = useState('');
  const [syncPreviewPayload, setSyncPreviewPayload] = useState<SyncPayload | null>(null);
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const draggingRef = useRef(false);

  const selectedService = useMemo(() => nodes.find((item) =>`${item.agent_key}:${item.service_name}` === selectedServiceKey) || null, [nodes, selectedServiceKey]);
  const treeNodes = useMemo(() => buildProcessTree(processes), [processes]);
  const allProcessPids = useMemo(() => Array.from(new Set(processes.map((item) => item.pid).filter((pid) => Number.isFinite(pid)))), [processes]);
  const isAllProcessesSelected = useMemo(
    () => allProcessPids.length > 0 && allProcessPids.every((pid) => selectedPids.has(pid)),
    [allProcessPids, selectedPids],
  );

  const loadNodes = async () => {
    if (!projectId) {
      setNodes([]);
      return;
    }
    setLoadingNodes(true);
    try {
      const data = await environmentApi.environment.listProcessMonitorNodes(projectId);
      const items = Array.isArray(data?.items) ? data.items : [];
      setNodes(items);
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
      const data = await environmentApi.environment.getNodeProcesses(projectId, selectedService.agent_key, selectedService.service_name);
      setProcesses(Array.isArray(data?.items) ? data.items : []);
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
      const data = await environmentApi.environment.getNodeFilesystemTree(projectId, selectedService.agent_key, selectedService.service_name, { path, limit: 600 });
      const normalizedItems = Array.isArray(data?.items) ? data.items.map((item: any) => normalizePathNode(item)) : [];
      const children = normalizedItems.map((item: ProcessSyncCandidateTreeNode) => ({ ...item, children: [], loaded: false })) as FileTreeNode[];
      if (path === '/' || force) {
        setFileTree((prev) => {
          if (!prev.length || force) return [{ name: '/', path: '/', type: 'dir', has_children: true, loaded: true, children }];
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

  const openProcessDetail = async (pid: number) => {
    if (!projectId || !selectedService) return;
    setProcessDetailPid(pid);
    setProcessDetailData(null);
    setProcessDetailTab('overview');
    setProcessDetailLoading(true);
    try {
      const data = await environmentApi.environment.getNodeProcessDetail(projectId, selectedService.agent_key, selectedService.service_name, pid);
      setProcessDetailData(normalizePathNode(data || null));
    } catch (error) {
      console.error(error);
      notify('加载进程详情失败', 'error');
    } finally {
      setProcessDetailLoading(false);
    }
  };

  const runSync = async (payload: SyncPayload) => {
    if (!projectId || !selectedService) return;
    setSyncing(true);
    try {
      const normalizedPaths = payload.paths?.map((item) => normalizeHostVisiblePath(item));
      await environmentApi.environment.createProcessMonitorSyncTask({
        project_id: projectId,
        agent_key: selectedService.agent_key,
        service_name: selectedService.service_name,
        mode: payload.mode,
        pids: payload.pids,
        paths: normalizedPaths,
      });
      notify('同步任务已创建', 'success');
      setSyncPreviewOpen(false);
      setSyncPreviewData(null);
      setSyncPreviewPayload(null);
    } catch (error) {
      console.error(error);
      notify('创建同步任务失败', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const openSyncPreview = async (payload: SyncPayload) => {
    if (!projectId || !selectedService) return;
    setMenu(null);
    setSyncPreviewOpen(true);
    setSyncPreviewLoading(true);
    setSyncPreviewError('');
    setSyncPreviewData(null);
    const normalizedPayload: SyncPayload = {
      ...payload,
      paths: payload.paths?.map((item) => normalizeHostVisiblePath(item)),
    };
    setSyncPreviewPayload(normalizedPayload);
    try {
      const data = await environmentApi.environment.previewProcessMonitorSync({
        project_id: projectId,
        agent_key: selectedService.agent_key,
        service_name: selectedService.service_name,
        mode: normalizedPayload.mode,
        pids: normalizedPayload.pids,
        paths: normalizedPayload.paths,
        preview_limit: 80,
      });
      setSyncPreviewData(normalizePathNode(data));
    } catch (error: any) {
      console.error(error);
      setSyncPreviewError(error?.message || '预览同步内容失败');
    } finally {
      setSyncPreviewLoading(false);
    }
  };

  useEffect(() => {
    void loadNodes();
  }, [projectId]);

  useEffect(() => {
    if (!nodes.length) {
      setSelectedServiceKey('');
      return;
    }
    const preferred = String(initialServiceKey || '').trim();
    if (preferred && nodes.some((item) =>`${item.agent_key}:${item.service_name}` === preferred)) {
      setSelectedServiceKey(preferred);
      return;
    }
    setSelectedServiceKey((prev) => {
      if (prev && nodes.some((item) =>`${item.agent_key}:${item.service_name}` === prev)) return prev;
      return`${nodes[0].agent_key}:${nodes[0].service_name}`;
    });
  }, [nodes, initialServiceKey]);

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
      const ratio = Math.min(60, Math.max(15, (event.clientX / width) * 100));
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

  const toggleSelectAllPids = () => {
    setSelectedPids((prev) => {
      if (!allProcessPids.length) return new Set();
      if (allProcessPids.every((pid) => prev.has(pid))) return new Set();
      return new Set(allProcessPids);
    });
  };

  const proc = processDetailData?.process || {};
  const procEntries = processDetailData?.proc_entries || {};
  const procTextSections = [
    { key: 'status', label: 'status' },
    { key: 'maps', label: 'maps' },
    { key: 'mounts', label: 'mounts' },
    { key: 'limits', label: 'limits' },
    { key: 'io', label: 'io' },
  ];

  return (
    <>
      <div className="p-10 space-y-5">
        <PageHeader
          title="节点进程监控 - 进程详情"
          description="左侧全局文件系统树，右侧进程树；支持进程详情与同步确认"
          actions={<div className="flex items-center gap-3">
            <button onClick={() => void loadNodes()} disabled={!projectId || loadingNodes} className="px-4 py-3 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-elevated text-theme-text-secondary text-xs font-medium uppercase tracking-wider flex items-center gap-2">{loadingNodes ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}刷新节点</button>
            <button onClick={() => void loadProcesses()} disabled={!projectId || !selectedService || loadingProcesses} className="px-4 py-3 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-elevated text-theme-text-secondary text-xs font-medium uppercase tracking-wider flex items-center gap-2">{loadingProcesses ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}刷新进程</button>
          </div>}
        />

        <div className="grid grid-cols-1 xl:grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-medium text-theme-text-muted uppercase tracking-widest">节点服务</label>
            <select
              value={selectedServiceKey}
              onChange={(event) => setSelectedServiceKey(event.target.value)}
              className="form-select mt-1 w-full"
            >
              {nodes.map((item) => (
                <option key={`${item.agent_key}:${item.service_name}`} value={`${item.agent_key}:${item.service_name}`}>
                  {(item.agent_hostname || item.agent_key)} / {item.service_name} (节点ID: {item.agent_key}, IP: {item.agent_ip || '-'})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-theme-border px-4 py-3">
            <div className="text-xs font-medium text-theme-text-muted uppercase tracking-widest flex items-center gap-2">
              <Server size={14} />
              {selectedService
                ?`${selectedService.agent_hostname || selectedService.agent_key} / ${selectedService.service_name} / 节点ID: ${selectedService.agent_key}`
                : '未选择节点'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAllPids}
                disabled={loadingProcesses || !selectedService || allProcessPids.length === 0}
                className="px-3 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text-secondary text-xs font-medium uppercase tracking-wider disabled:opacity-50 flex items-center gap-2 hover:bg-theme-elevated"
              >
                {isAllProcessesSelected ? <Square size={14} /> : <CheckSquare size={14} />}
                {isAllProcessesSelected ? '清空全部选择' :`全选全部进程 (${allProcessPids.length})`}
              </button>
              <button
                onClick={() => void openSyncPreview({ mode: 'pid_files', pids: Array.from(selectedPids) })}
                disabled={syncing || !selectedService || selectedPids.size === 0}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                同步选中进程 ({selectedPids.size})
              </button>
            </div>
          </div>

          <div className="relative" style={{ height: '68vh' }}>
            <div className="absolute inset-0 flex">
              <div style={{ width: `${leftPaneWidth}%` }} className="h-full border-r border-theme-border overflow-auto">
                <div className="sticky top-0 bg-theme-elevated border-b border-theme-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-theme-text-muted flex items-center gap-2">
                  <FolderTree size={14} />
                  全局文件系统树
                </div>
                <div className="p-2">
                  {loadingFiles ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></div>
                  ) : fileTree.length === 0 ? (
                    <div className="py-10 text-center text-sm text-theme-text-muted">暂无文件系统数据</div>
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
                className="w-1.5 bg-theme-elevated hover:bg-blue-300 cursor-col-resize"
                onMouseDown={() => {
                  draggingRef.current = true;
                }}
              />

              <div style={{ width: `${100 - leftPaneWidth}%` }} className="h-full overflow-auto">
                <div className="sticky top-0 bg-theme-elevated border-b border-theme-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-theme-text-muted">进程树（单击查看详情，右键同步）</div>
                <div className="p-2">
                  {loadingProcesses ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></div>
                  ) : treeNodes.length === 0 ? (
                    <div className="py-10 text-center text-sm text-theme-text-muted">暂无进程数据</div>
                  ) : (
                    <ProcessTreeView
                      nodes={treeNodes}
                      selectedPids={selectedPids}
                      onTogglePid={togglePid}
                      onOpenDetail={(pid) => void openProcessDetail(pid)}
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
 <div className="fixed z-50 rounded-xl border border-theme-border bg-theme-surface p-1 min-w-[180px]" style={{ left: menu.x, top: menu.y }}>
            {menu.type === 'process' ? (
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-theme-elevated text-sm"
                onClick={() => {
                  void openSyncPreview({ mode: 'pid_files', pids: [menu.pid] });
                }}
              >
                同步 PID {menu.pid} 相关文件
              </button>
            ) : (
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-theme-elevated text-sm"
                onClick={() => {
                  void openSyncPreview({ mode: 'path_files', paths: [menu.path] });
                }}
              >
                {menu.nodeType === 'dir' ? '同步目录' : '同步文件'}: {menu.path}
              </button>
            )}
          </div>
        )}

        {processDetailPid !== null && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setProcessDetailPid(null)}>
 <div className="w-[min(1200px,95vw)] h-[85vh] rounded-2xl bg-theme-elevated border border-theme-border flex flex-col" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
                <div>
                  <h3 className="text-xl font-semibold text-theme-text-primary">进程详情 / PID {processDetailPid}</h3>
                  <p className="text-xs text-theme-text-muted">/proc/{processDetailPid} 视图</p>
                </div>
                <button className="p-2 rounded-xl hover:bg-theme-elevated" onClick={() => setProcessDetailPid(null)}><X size={18} /></button>
              </div>

              <div className="px-6 pt-4 flex items-center gap-2 border-b border-theme-border">
                {[
                  { id: 'overview', label: '概览', icon: <Info size={14} /> },
                  { id: 'basic', label: '基本信息', icon: <Server size={14} /> },
                  { id: 'resources', label: '资源监控', icon: <Cpu size={14} /> },
                  { id: 'proc', label: '/proc文本', icon: <FileText size={14} /> },
                  { id: 'files-net', label: '文件与网络', icon: <Network size={14} /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`px-4 py-2 rounded-t-xl text-xs font-medium uppercase tracking-wider flex items-center gap-2 ${processDetailTab === tab.id ? 'bg-blue-500/15 text-blue-400 border border-b-0 border-blue-500/20' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
                    onClick={() => setProcessDetailTab(tab.id as ProcessDetailTab)}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-6">
                {processDetailLoading ? (
                  <div className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></div>
                ) : !processDetailData ? (
                  <div className="py-16 text-center text-theme-text-muted">暂无进程详情</div>
                ) : (
                  <>
                    {processDetailTab === 'overview' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">名称</div><div className="mt-1 font-semibold text-theme-text-primary">{proc.name || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">状态</div><div className="mt-1 font-semibold text-theme-text-primary">{proc.status || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">用户</div><div className="mt-1 font-semibold text-theme-text-primary">{proc.username || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">线程数</div><div className="mt-1 font-semibold text-theme-text-primary">{proc.num_threads ?? '-'}</div></div>
                        <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-theme-border p-4">
                          <div className="text-xs text-theme-text-muted">命令行</div>
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-all text-theme-text-secondary font-mono">{Array.isArray(proc.cmdline) ? proc.cmdline.join(' ') : '-'}</pre>
                        </div>
                        <div className="md:col-span-2 xl:col-span-2 rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">CWD</div><pre className="mt-2 text-xs whitespace-pre-wrap break-all text-theme-text-secondary font-mono">{proc.cwd || '-'}</pre></div>
                        <div className="md:col-span-2 xl:col-span-2 rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">EXE</div><pre className="mt-2 text-xs whitespace-pre-wrap break-all text-theme-text-secondary font-mono">{proc.exe || '-'}</pre></div>
                      </div>
                    )}

                    {processDetailTab === 'basic' && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">UID/GID</div><pre className="mt-2 text-xs text-theme-text-secondary font-mono whitespace-pre-wrap">{JSON.stringify({ uids: proc.uids, gids: proc.gids }, null, 2)}</pre></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">环境变量</div><pre className="mt-2 text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{JSON.stringify(proc.environ || {}, null, 2)}</pre></div>
                      </div>
                    )}

                    {processDetailTab === 'resources' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">CPU</div><pre className="mt-2 text-xs text-theme-text-secondary font-mono whitespace-pre-wrap">{JSON.stringify({ cpu_percent: proc.cpu_percent, cpu_times: proc.cpu_times }, null, 2)}</pre></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">Memory</div><pre className="mt-2 text-xs text-theme-text-secondary font-mono whitespace-pre-wrap">{JSON.stringify({ memory_percent: proc.memory_percent, memory_info: proc.memory_info }, null, 2)}</pre></div>
                        <div className="rounded-xl border border-theme-border p-4 md:col-span-2"><div className="text-xs text-theme-text-muted">IO Counters</div><pre className="mt-2 text-xs text-theme-text-secondary font-mono whitespace-pre-wrap">{JSON.stringify(proc.io_counters || {}, null, 2)}</pre></div>
                      </div>
                    )}

                    {processDetailTab === 'proc' && (
                      <div className="space-y-3">
                        {procTextSections.map((section) => (
                          <div key={section.key} className="rounded-xl border border-theme-border p-4">
                            <div className="text-xs uppercase tracking-wider text-theme-text-muted">{section.label}</div>
                            <pre className="mt-2 max-h-64 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{extractProcText(procEntries?.[section.key]) || '(empty)'}</pre>
                          </div>
                        ))}
                        <div className="rounded-xl border border-theme-border p-4">
                          <div className="text-xs uppercase tracking-wider text-theme-text-muted">net*</div>
                          <pre className="mt-2 max-h-72 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{extractProcText(procEntries?.net) || '(empty)'}</pre>
                        </div>
                      </div>
                    )}

                    {processDetailTab === 'files-net' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-theme-border p-4">
                          <div className="text-xs text-theme-text-muted">Open Files ({Array.isArray(proc.open_files) ? proc.open_files.length : 0})</div>
                          <pre className="mt-2 max-h-72 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{JSON.stringify(proc.open_files || [], null, 2)}</pre>
                        </div>
                        <div className="rounded-xl border border-theme-border p-4">
                          <div className="text-xs text-theme-text-muted">Connections ({Array.isArray(proc.connections) ? proc.connections.length : 0})</div>
                          <pre className="mt-2 max-h-72 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{JSON.stringify(proc.connections || [], null, 2)}</pre>
                        </div>
                        <div className="rounded-xl border border-theme-border p-4 md:col-span-2">
                          <div className="text-xs text-theme-text-muted">/proc/fd 摘要</div>
                          <pre className="mt-2 max-h-72 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{extractProcText(procEntries?.fd) || '(empty)'}</pre>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {syncPreviewOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setSyncPreviewOpen(false)}>
 <div className="w-[min(920px,95vw)] max-h-[85vh] rounded-2xl bg-theme-elevated border border-theme-border flex flex-col" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
                <div>
                  <h3 className="text-xl font-semibold text-theme-text-primary">同步预览确认</h3>
                  <p className="text-xs text-theme-text-muted">请确认统计信息和目标地址后再执行同步</p>
                </div>
                <button className="p-2 rounded-xl hover:bg-theme-elevated" onClick={() => setSyncPreviewOpen(false)}><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-4">
                {syncPreviewLoading ? (
                  <div className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></div>
                ) : syncPreviewError ? (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 text-rose-400 px-4 py-3 text-sm">{syncPreviewError}</div>
                ) : syncPreviewData ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">候选总数</div><div className="mt-1 text-xl font-semibold text-theme-text-primary">{syncPreviewData.summary?.total_candidates ?? 0}</div></div>
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">文件数</div><div className="mt-1 text-xl font-semibold text-theme-text-primary">{syncPreviewData.summary?.total_files ?? 0}</div></div>
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">符号链接</div><div className="mt-1 text-xl font-semibold text-theme-text-primary">{syncPreviewData.summary?.total_symlinks ?? 0}</div></div>
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">预计总大小</div><div className="mt-1 text-xl font-semibold text-theme-text-primary">{formatBytes(syncPreviewData.summary?.estimated_total_bytes)}</div></div>
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">失败项</div><div className="mt-1 text-xl font-semibold text-rose-400">{syncPreviewData.summary?.failed_count ?? 0}</div></div>
                      <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">跳过项</div><div className="mt-1 text-xl font-semibold text-amber-400">{syncPreviewData.summary?.skipped_count ?? 0}</div></div>
                    </div>

                    <div className="rounded-xl border border-theme-border p-4">
                      <div className="text-xs uppercase tracking-wider text-theme-text-muted">目标地址</div>
                      <div className="mt-2 text-sm text-theme-text-secondary break-all font-mono">{syncPreviewData.target?.remote_root_url || '-'}</div>
                      <div className="mt-1 text-sm text-theme-text-secondary break-all font-mono">{syncPreviewData.target?.remote_path_prefix || '-'}</div>
                    </div>

                    <div className="rounded-xl border border-theme-border p-4">
                      <div className="text-xs uppercase tracking-wider text-theme-text-muted">示例目标路径</div>
                      <pre className="mt-2 max-h-40 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{JSON.stringify(syncPreviewData.target?.sample_remote_paths || [], null, 2)}</pre>
                    </div>

                    <div className="rounded-xl border border-theme-border p-4">
                      <div className="text-xs uppercase tracking-wider text-theme-text-muted">问题摘要</div>
                      <pre className="mt-2 max-h-40 overflow-auto text-xs text-theme-text-secondary font-mono whitespace-pre-wrap break-all">{JSON.stringify((syncPreviewData.issues || []).slice(0, 50), null, 2)}</pre>
                    </div>
                  </>
                ) : (
                  <div className="py-16 text-center text-theme-text-muted">暂无预览数据</div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-theme-border flex items-center justify-end gap-3">
                <button className="px-4 py-2 rounded-xl border border-theme-border text-theme-text-secondary" onClick={() => setSyncPreviewOpen(false)}>取消</button>
                <button
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                  disabled={syncing || !syncPreviewPayload || (syncPreviewData?.summary?.total_candidates || 0) <= 0}
                  onClick={() => {
                    if (!syncPreviewPayload) return;
                    void runSync(syncPreviewPayload);
                  }}
                >
                  {syncing ? '同步中...' : '确认同步'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {feedbackNodes}
    </>
  );
};