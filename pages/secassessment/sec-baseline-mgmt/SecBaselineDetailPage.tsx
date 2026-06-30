import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp, Database, FileText, Folder, GitBranch, MoreHorizontal,
  Pencil, RefreshCw, Search, Share2, Trash2,
} from 'lucide-react';
import { PageHeader, EmptyState, DataTable } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { Modal, FormField, FormActionBar } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secBaselineApi } from './client';
import {
  SyncBadge, PriorityBadge, Badge, ACTION_BADGE, PRIORITY_MAP, coveragePercent, normalizeSources, NODE_TYPE_LABEL,
} from './constants';
import type { BaselineDetail, NodeOut, NodeType, LogOut, EventOut, BaselineUpdate } from './types';
import { NodeEditorModal } from './components/NodeEditorModal';

interface SecBaselineDetailPageProps {
  baselineId: string;
  onNavigateToView?: (view: string) => void;
}

const ROOT_ID = 0;
const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'nodes', label: '节点树' },
  { key: 'sync', label: '同步' },
  { key: 'logs', label: '操作日志' },
  { key: 'events', label: '事件' },
] as const;
type TabKey = typeof TABS[number]['key'];

export const SecBaselineDetailPage: React.FC<SecBaselineDetailPageProps> = ({ baselineId, onNavigateToView }) => {
  const id = Number(baselineId);
  const [detail, setDetail] = useState<BaselineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [logs, setLogs] = useState<LogOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const d = await secBaselineApi.getBaseline(id);
      setDetail(d);
    } catch (e: any) {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try { setLogs(await secBaselineApi.getLogs(id)); } catch { setLogs([]); } finally { setLogsLoading(false); }
  }, [id]);
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try { setEvents(await secBaselineApi.getEvents(id)); } catch { setEvents([]); } finally { setEventsLoading(false); }
  }, [id]);

  useEffect(() => {
    if (tab === 'logs' && logs.length === 0) fetchLogs();
    if (tab === 'events' && events.length === 0) fetchEvents();
  }, [tab]);

  const handleSync = async () => {
    const confirmed = await showConfirm({
      title: '同步基线到外部系统',
      message: `确认将基线「${detail?.baseline_name}」同步到外部系统?`,
      confirmText: '确认同步', cancelText: '取消',
    });
    if (!confirmed) return;
    setSyncing(true);
    try {
      const r = await secBaselineApi.syncBaseline(id);
      await showAlert({ title: r.success ? '同步成功' : '同步失败', message: r.message, tone: r.success ? 'success' : 'error' });
      fetchDetail();
      if (tab === 'sync') fetchEvents();
    } catch (e: any) {
      await showAlert({ message: e.message || '同步失败', tone: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    setMoreOpen(false);
    const confirmed = await showConfirm({
      title: '删除基线', message: `确认删除基线「${detail?.baseline_name}」?此操作将级联删除所有节点及关联日志事件,不可恢复。`,
      confirmText: '确认删除', cancelText: '取消', danger: true,
    });
    if (!confirmed) return;
    try {
      await secBaselineApi.deleteBaseline(id);
      await showAlert({ title: '已删除', message: '基线已删除', tone: 'success' });
      onNavigateToView?.('sec-baseline-mgmt');
    } catch (e: any) {
      await showAlert({ message: e.message || '删除失败', tone: 'error' });
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-theme-text-muted">加载中...</div>;
  }
  if (!detail) {
    return <div className="p-10 text-center text-theme-text-muted">基线不存在或加载失败</div>;
  }

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="px-5 md:px-6 2xl:px-8 pt-5 pb-4 border-b border-theme-border">
        <PageHeader
          back={{ label: '返回基线列表', onClick: () => onNavigateToView?.('sec-baseline-mgmt') }}
          title={detail.baseline_name}
          description={
            <span className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-theme-text-faint">{detail.baseline_code || '—'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>v{detail.version || '—'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>{detail.product_org_name || '—'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>创建于 {detail.create_time} 由 {detail.person_name || '—'}</span>
              <SyncBadge status={detail.sync_status} />
            </span>
          }
          actions={
            <div className="flex items-center gap-2 relative">
              <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                {syncing ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />} 手动同步
              </button>
              <button className="btn btn-secondary" onClick={() => setMoreOpen((v) => !v)}><MoreHorizontal size={14} /> 更多</button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-theme-surface border border-theme-border rounded-lg shadow-overlay p-1 z-50" onClick={() => setMoreOpen(false)}>
                  <button className="w-full text-left px-3 py-2 text-xs rounded-md text-theme-text-secondary hover:bg-theme-elevated flex items-center gap-2" onClick={() => { setEditInfoOpen(true); setMoreOpen(false); }}><Pencil size={13} /> 编辑基本信息</button>
                  <button className="w-full text-left px-3 py-2 text-xs rounded-md text-state-danger hover:bg-rose-500/10 flex items-center gap-2" onClick={handleDelete}><Trash2 size={13} /> 删除基线</button>
                </div>
              )}
            </div>
          }
        />
      </div>

      <nav className="px-5 md:px-6 2xl:px-8 flex items-center gap-6 border-b border-theme-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'text-brand-primary border-brand-primary' : 'text-theme-text-muted border-transparent hover:text-theme-text-primary'
            }`}
          >{t.label}</button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-5 md:px-6 2xl:px-8 py-5 space-y-4">
          {tab === 'overview' && <OverviewTab detail={detail} />}
          {tab === 'nodes' && <NodesTab baselineId={id} detail={detail} />}
          {tab === 'sync' && <SyncTab detail={detail} events={events} onSync={handleSync} syncing={syncing} />}
          {tab === 'logs' && <LogsTab logs={logs} loading={logsLoading} />}
          {tab === 'events' && <EventsTab events={events} loading={eventsLoading} />}
        </div>
      </div>

      {editInfoOpen && (
        <EditInfoModal detail={detail} onClose={() => setEditInfoOpen(false)} onSaved={(d) => { setDetail(d); setEditInfoOpen(false); }} />
      )}
    </div>
  );
};

// ===== 概览 =====
const OverviewTab: React.FC<{ detail: BaselineDetail }> = ({ detail }) => {
  const s = detail.stats;
  const info: [string, React.ReactNode, boolean?][] = [
    ['基线名称', detail.baseline_name],
    ['英文名称', detail.baseline_name_en || '—'],
    ['基线编码', <span className="font-mono">{detail.baseline_code || '—'}</span>, true],
    ['分类', detail.category || '—'],
    ['版本号', <span className="font-mono">{detail.version || '—'}</span>, true],
    ['所属产品', detail.product_org_name || '—'],
    ['创建人', detail.person_name || '—'],
    ['创建时间', <span className="font-mono">{detail.create_time}</span>, true],
    ['最后更新', <span className="font-mono">{detail.last_updated || '—'}</span>, true],
  ];
  const stats: [string, React.ReactNode, string?][] = [
    ['总检查项', s?.total_items ?? '—'],
    ['已映射', s?.mapped_items ?? '—', 'text-state-success'],
    ['未映射', s?.unmapped_items ?? 0, s?.unmapped_items ? 'text-state-warning' : ''],
    ['覆盖率', `${coveragePercent(s?.mapping_coverage_percent).toFixed(1)}%`, 'text-state-success'],
    ['一级维度', s?.total_level1_dimensions ?? '—'],
    ['二级维度', s?.total_level2_dimensions ?? '—'],
    ['含项二级', s?.level2_dimensions_with_items ?? '—'],
    ['空二级', s?.level2_dimensions_empty ?? 0, s?.level2_dimensions_empty ? 'text-state-warning' : ''],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <h2 className="text-base font-semibold text-theme-text-primary mb-4">基本信息</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {info.map(([k, v]) => (
            <div key={k as string}>
              <div className="text-xs text-theme-text-faint mb-1">{k}</div>
              <div className="text-sm text-theme-text-secondary">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <h2 className="text-base font-semibold text-theme-text-primary mb-4">检查项统计</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(([k, v, cls]) => (
            <div key={k as string} className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3">
              <div className="text-xs uppercase tracking-wider text-theme-text-faint font-medium">{k}</div>
              <div className={`text-2xl font-semibold tabular-nums mt-1 ${cls || ''}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ===== 节点树 =====
const NodesTab: React.FC<{ baselineId: number; detail: BaselineDetail }> = ({ baselineId, detail }) => {
  const [nodes, setNodes] = useState<NodeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number>(ROOT_ID);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [kw, setKw] = useState('');
  const [leafKw, setLeafKw] = useState('');
  const [leafPriority, setLeafPriority] = useState<string>('all');
  const [leafKey, setLeafKey] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [modalState, setModalState] = useState<{ open: boolean; mode: 'add' | 'edit' | 'view'; node: NodeOut | null; parent: NodeOut | null }>({ open: false, mode: 'add', node: null, parent: null });

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try { setNodes(await secBaselineApi.listNodes(baselineId)); } catch { setNodes([]); } finally { setLoading(false); }
  }, [baselineId]);
  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const childrenOf = useCallback((parentId: number) => {
    if (parentId === ROOT_ID) return nodes.filter((n) => n.parent_id == null);
    return nodes.filter((n) => n.parent_id === parentId);
  }, [nodes]);

  const virtualRoot = { id: ROOT_ID, node_type: 'root' as NodeType, name: `${detail.baseline_name} · v${detail.version}`, code: detail.baseline_code, parent_id: null };

  const nodeMatches = (n: NodeOut | typeof virtualRoot, isRoot: boolean): boolean => {
    if (isRoot) return true;
    if (!kw.trim()) return true;
    const k = kw.trim().toLowerCase();
    if ((n.name || '').toLowerCase().includes(k) || (n.code || '').toLowerCase().includes(k)) return true;
    return childrenOf((n as NodeOut).id).some((c) => nodeMatches(c, false));
  };

  const leafDescendants = (parentId: number): NodeOut[] => {
    const out: NodeOut[] = [];
    const walk = (pid: number) => {
      childrenOf(pid).forEach((c) => {
        if (c.node_type === 'item') out.push(c); else walk(c.id);
      });
    };
    walk(parentId);
    return out.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  const selectedNode = selectedId === ROOT_ID ? virtualRoot : nodes.find((n) => n.id === selectedId) || virtualRoot;
  const isLeafSelected = (selectedNode as NodeOut).node_type === 'item';

  const filteredLeaves = useMemo(() => {
    if (isLeafSelected) return [];
    let leaves = leafDescendants(selectedId);
    const k = leafKw.trim().toLowerCase();
    if (k) leaves = leaves.filter((n) => (n.name || '').toLowerCase().includes(k) || (n.code || '').toLowerCase().includes(k));
    if (leafPriority !== 'all') leaves = leaves.filter((n) => n.priority === leafPriority);
    if (leafKey === 'yes') leaves = leaves.filter((n) => n.is_key_ability);
    if (leafKey === 'no') leaves = leaves.filter((n) => !n.is_key_ability);
    return leaves;
  }, [selectedId, nodes, leafKw, leafPriority, leafKey, isLeafSelected]);

  const getNodePath = useCallback((nodeId: number): NodeOut[] => {
    const path: NodeOut[] = [];
    let current: NodeOut | undefined = nodes.find((n) => n.id === nodeId);
    while (current) {
      path.unshift(current);
      const pid = current.parent_id;
      if (pid == null) break;
      current = nodes.find((n) => n.id === pid);
    }
    return path;
  }, [nodes]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderTree = (n: NodeOut | typeof virtualRoot, depth: number, isRoot: boolean): React.ReactNode => {
    if (!nodeMatches(n, isRoot)) return null;
    const kids = isRoot ? childrenOf(ROOT_ID) : childrenOf((n as NodeOut).id);
    const hasKids = kids.length > 0;
    const isExpanded = expanded.has((n as NodeOut).id) || !!kw.trim();
    const selected = selectedId === (n as NodeOut).id;
    const icon = isRoot ? <Database size={13} className="text-amber-400" /> :
      (n as NodeOut).node_type === 'level1' ? <Folder size={13} className="text-violet-400" /> :
      (n as NodeOut).node_type === 'level2' ? <GitBranch size={13} className="text-sky-400" /> :
      <FileText size={13} className="text-emerald-400" />;
    return (
      <div key={(n as NodeOut).id}>
        <button
          onClick={() => {
            if (hasKids && !kw.trim()) setExpanded((p) => { const next = new Set(p); next.has((n as NodeOut).id) ? next.delete((n as NodeOut).id) : next.add((n as NodeOut).id); return next; });
            setSelectedId((n as NodeOut).id);
            setExpandedRows(new Set());
          }}
          className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${selected ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-secondary hover:bg-theme-elevated'}`}
        >
          {hasKids ? (isExpanded ? <ChevronDown size={12} className="text-theme-text-faint" /> : <ChevronRight size={12} className="text-theme-text-faint" />) : <span className="w-3" />}
          {icon}
          <span className={`text-xs truncate flex-1 ${isRoot ? 'font-semibold text-theme-text-primary' : (n as NodeOut).node_type === 'item' ? '' : 'font-medium'}`}>{n.name}</span>
          {!isRoot && (n as NodeOut).code && <span className="text-[10px] font-mono text-theme-text-faint">{(n as NodeOut).code}</span>}
        </button>
        {hasKids && isExpanded && (
          <div className="ml-1 border-l border-theme-border-subtle pl-1">
            {kids.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((c) => renderTree(c, depth + 1, false))}
          </div>
        )}
      </div>
    );
  };

  const handleDeleteNode = async (node: NodeOut) => {
    const collect = (nid: number): number[] => {
      const out = [nid];
      childrenOf(nid).forEach((c) => out.push(...collect(c.id)));
      return out;
    };
    const cnt = collect(node.id).length;
    const confirmed = await showConfirm({
      title: '删除节点', message: `确认删除节点「${node.name}」?级联删除共 ${cnt} 个节点,不可恢复。`,
      confirmText: '确认删除', cancelText: '取消', danger: true,
    });
    if (!confirmed) return;
    try {
      await secBaselineApi.deleteNode(baselineId, node.id);
      await fetchNodes();
    } catch (e: any) {
      await showAlert({ message: e.message || '删除失败', tone: 'error' });
    }
  };

  const addChildLabel = (n: NodeOut | typeof virtualRoot): string => {
    if (n === virtualRoot) return '新增一级维度';
    if ((n as NodeOut).node_type === 'level1') return '新增二级维度';
    return '新增检查项';
  };

  return (
    <div className="flex gap-4" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="w-72 shrink-0 rounded-xl border border-theme-border bg-theme-surface flex flex-col">
        <div className="px-4 py-3 border-b border-theme-border-subtle"><span className="text-xs font-semibold uppercase tracking-wider text-theme-text-faint">节点树</span></div>
        <div className="p-2 border-b border-theme-border-subtle relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={13} />
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索节点..." className="form-input text-xs pl-8 py-1.5 w-full" />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {loading ? <div className="text-center text-theme-text-faint py-6 text-xs">加载中...</div> : renderTree(virtualRoot, 0, true)}
        </div>
      </div>

      <div className="flex-1 min-w-0 rounded-xl border border-theme-border bg-theme-surface flex flex-col">
        {isLeafSelected ? (
          <ItemDetail node={selectedNode as NodeOut} onView={() => setModalState({ open: true, mode: 'view', node: selectedNode as NodeOut, parent: null })} onEdit={() => setModalState({ open: true, mode: 'edit', node: selectedNode as NodeOut, parent: null })} onDelete={() => handleDeleteNode(selectedNode as NodeOut)} />
        ) : (
          <>
            <div className="px-4 py-3 border-b border-theme-border-subtle flex items-center justify-between">
              <div className="text-sm text-theme-text-secondary">
                <span className="text-theme-text-faint">{selectedId === ROOT_ID ? '根节点' : NODE_TYPE_LABEL[(selectedNode as NodeOut).node_type]}:</span>{' '}
                <span className="text-theme-text-primary">{selectedNode.name}</span>{' '}
                <span className="text-xs text-theme-text-faint">· {filteredLeaves.length} 个检查项</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalState({ open: true, mode: 'add', node: null, parent: selectedId === ROOT_ID ? null : (selectedNode as NodeOut) })}>
                <Pencil size={13} /> {addChildLabel(selectedNode)}
              </button>
            </div>
            <div className="px-4 py-2 border-b border-theme-border-subtle flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[160px] max-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={13} />
                <input value={leafKw} onChange={(e) => setLeafKw(e.target.value)} placeholder="搜索检查项..." className="form-input text-xs pl-8 py-1.5" />
              </div>
              <select value={leafPriority} onChange={(e) => setLeafPriority(e.target.value)} className="form-select text-xs w-auto py-1"><option value="all">全部优先级</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
              <select value={leafKey} onChange={(e) => setLeafKey(e.target.value)} className="form-select text-xs w-auto py-1"><option value="all">全部能力</option><option value="yes">核心能力项</option><option value="no">非核心能力项</option></select>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredLeaves.length === 0 ? (
                <div className="px-6 py-12"><EmptyState variant="inline" title="无匹配的检查项" /></div>
              ) : (
                <table className="w-full text-left text-sm text-theme-text-secondary" style={{ minWidth: 720 }}>
                  <thead className="border-b border-theme-border bg-theme-elevated text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">编码</th>
                      <th className="px-4 py-3">名称</th>
                      <th className="px-4 py-3">英文名</th>
                      <th className="px-4 py-3 whitespace-nowrap">优先级</th>
                      <th className="px-4 py-3 whitespace-nowrap">核心能力</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">来源数</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:align-middle">
                    {filteredLeaves.map((n) => {
                      const expanded = expandedRows.has(n.id);
                      return (
                        <Fragment key={n.id}>
                          <tr className="group transition-colors hover:bg-theme-elevated cursor-pointer" onClick={() => toggleRow(n.id)}>
                            <td className="border-b border-theme-border px-4 py-3"><span className="font-mono text-theme-text-secondary">{n.code || '—'}</span></td>
                            <td className="border-b border-theme-border px-4 py-3"><span className="text-theme-text-primary font-medium">{n.name}</span></td>
                            <td className="border-b border-theme-border px-4 py-3"><span className="text-theme-text-muted text-xs">{n.name_en || '—'}</span></td>
                            <td className="border-b border-theme-border px-4 py-3"><PriorityBadge priority={n.priority} /></td>
                            <td className="border-b border-theme-border px-4 py-3">{n.is_key_ability ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">是</Badge> : <span className="text-xs text-theme-text-faint">否</span>}</td>
                            <td className="border-b border-theme-border px-4 py-3 text-right tabular-nums text-theme-text-secondary">{normalizeSources(n.sources).length}</td>
                            <td className="border-b border-theme-border px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title={expanded ? '收起' : '展开'} onClick={() => toggleRow(n.id)}>
                                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="编辑" onClick={() => setModalState({ open: true, mode: 'edit', node: n, parent: null })}><Pencil size={14} /></button>
                                <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-state-danger" title="删除" onClick={() => handleDeleteNode(n)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={7} className="border-b border-theme-border bg-theme-elevated p-4">
                                <LeafReadonlyDetail node={n} path={getNodePath(n.id)} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <NodeEditorModal
        open={modalState.open}
        mode={modalState.mode}
        baselineId={baselineId}
        node={modalState.node}
        parent={modalState.parent}
        onClose={() => setModalState((s) => ({ ...s, open: false }))}
        onSaved={fetchNodes}
      />
    </div>
  );
};

// 行内只读详情(展开行)
const LeafReadonlyDetail: React.FC<{ node: NodeOut; path: NodeOut[] }> = ({ node, path }) => {
  const srcList = normalizeSources(node.sources);
  const inline = (label: string, value: React.ReactNode, mono?: boolean) => (
    <div>
      <span className="text-theme-text-faint">{label}:</span>{' '}
      <span className={`text-theme-text-secondary ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="text-xs text-theme-text-faint">{path.map((n) => n.name).join(' / ')}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {inline('编码', node.code, true)}
        {inline('排序', node.sort_order, true)}
        {inline('优先级', node.priority ? PRIORITY_MAP[node.priority]?.label : '—')}
        {inline('核心能力', node.is_key_ability ? '是' : '否')}
      </div>
      {node.description && (
        <div>
          <div className="text-xs text-theme-text-faint mb-1">描述</div>
          <div className="text-xs text-theme-text-secondary leading-relaxed">{node.description}</div>
        </div>
      )}
      {node.verification && (
        <div>
          <div className="text-xs text-theme-text-faint mb-1">验证方法</div>
          <div className="text-xs text-theme-text-secondary leading-relaxed">{node.verification}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-theme-text-faint mb-1">来源文档 ({srcList.length})</div>
        {srcList.length > 0 ? (
          <div className="space-y-1">
            {srcList.map((s, i) => (
              <div key={i} className="text-xs">
                <span className="font-mono text-theme-text-faint w-6 inline-block">{i + 1}</span>
                <span className="text-theme-text-secondary">{s.document}</span>
                {s.section && <span className="text-theme-text-faint font-mono ml-2">{s.section}</span>}
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-theme-text-faint">无来源文档</div>}
      </div>
    </div>
  );
};

// 检查项详情(选中叶子时)
const ItemDetail: React.FC<{ node: NodeOut; onView: () => void; onEdit: () => void; onDelete: () => void }> = ({ node, onView, onEdit, onDelete }) => {
  const srcList = normalizeSources(node.sources);
  const tile = (label: string, value: React.ReactNode, mono?: boolean) => (
    <div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3">
      <div className="text-xs text-theme-text-faint mb-1">{label}</div>
      <div className={`text-sm text-theme-text-secondary ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  );
  return (
    <>
      <div className="px-4 py-3 border-b border-theme-border-subtle flex items-center justify-between">
        <div className="text-sm text-theme-text-secondary">
          <span className="text-theme-text-faint">检查项:</span>{' '}
          <span className="text-theme-text-primary">{node.name}</span>{' '}
          <span className="text-xs text-theme-text-faint font-mono">{node.code}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-secondary btn-sm" onClick={onView}>查看</button>
          <button className="btn btn-primary btn-sm" onClick={onEdit}><Pencil size={13} /> 编辑</button>
          <button className="btn btn-danger-soft btn-sm" onClick={onDelete}><Trash2 size={13} /> 删除</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tile('编码', node.code, true)}
          {tile('排序序号', node.sort_order, true)}
          {tile('优先级', <PriorityBadge priority={node.priority} />)}
          {tile('核心能力项', node.is_key_ability ? '是' : '否')}
        </div>
        {node.description && <div><div className="text-xs font-semibold uppercase tracking-wider text-theme-text-faint mb-2">描述</div><div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-4 text-sm text-theme-text-secondary leading-relaxed">{node.description}</div></div>}
        {node.verification && <div><div className="text-xs font-semibold uppercase tracking-wider text-theme-text-faint mb-2">验证方法</div><div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-4 text-sm text-theme-text-secondary leading-relaxed">{node.verification}</div></div>}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-theme-text-faint mb-2">来源文档({srcList.length})</div>
          {srcList.length ? (
            <div className="space-y-2">
              {srcList.map((s, i) => (
                <div key={i} className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3 flex items-center gap-3">
                  <span className="text-xs font-mono text-theme-text-faint w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0"><div className="text-sm text-theme-text-secondary truncate">{s.document}</div>{s.section && <div className="text-xs text-theme-text-faint font-mono mt-0.5">{s.section}</div>}</div>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-theme-text-faint">无来源文档</div>}
        </div>
      </div>
    </>
  );
};

// ===== 同步 =====
const SyncTab: React.FC<{ detail: BaselineDetail; events: EventOut[]; onSync: () => void; syncing: boolean }> = ({ detail, events, onSync, syncing }) => {
  const syncEvents = events.filter((e) => e.event_type.includes('sync'));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-theme-border bg-theme-surface p-5"><div className="text-xs uppercase tracking-wider text-theme-text-faint font-medium">当前状态</div><div className="mt-2"><SyncBadge status={detail.sync_status} /></div></div>
        <div className="rounded-xl border border-theme-border bg-theme-surface p-5"><div className="text-xs uppercase tracking-wider text-theme-text-faint font-medium">已同步次数</div><div className="text-lg font-semibold mt-2 tabular-nums">{detail.sync_count}</div></div>
        <div className="rounded-xl border border-theme-border bg-theme-surface p-5"><div className="text-xs uppercase tracking-wider text-theme-text-faint font-medium">最后同步时间</div><div className="text-lg font-semibold mt-2 font-mono text-theme-text-secondary">{detail.last_sync_time || '—'}</div></div>
      </div>
      <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-theme-text-primary">同步事件流</h2>
          <button className="btn btn-secondary btn-sm" onClick={onSync} disabled={syncing}>{syncing ? <RefreshCw size={13} className="animate-spin" /> : <Share2 size={13} />} 手动同步</button>
        </div>
        {syncEvents.length ? (
          <div className="space-y-0">
            {syncEvents.map((e, i) => {
              const dot = e.event_type.includes('success') ? 'bg-emerald-400' : e.event_type.includes('failed') ? 'bg-rose-400' : 'bg-amber-400';
              return (
                <div key={e.id} className={`relative pl-5 pb-4 ${i === syncEvents.length - 1 ? '' : 'border-l border-theme-border-subtle'}`} style={{ marginLeft: 4 }}>
                  <span className={`absolute left-0 top-1 w-2.5 h-2.5 rounded-full border-2 border-theme-surface ${dot}`} />
                  <div className="text-xs text-theme-text-faint font-mono">{e.create_time}</div>
                  <div className="text-sm text-theme-text-secondary mt-0.5">{e.event_detail}{(e.from_status || e.to_status) && <span className="text-theme-text-faint font-mono text-[10px] ml-2">{e.from_status || '∅'} → {e.to_status || '∅'}</span>}</div>
                </div>
              );
            })}
          </div>
        ) : <EmptyState variant="inline" title="暂无同步事件" />}
      </div>
    </div>
  );
};

// ===== 日志 =====
const LogsTab: React.FC<{ logs: LogOut[]; loading: boolean }> = ({ logs, loading }) => {
  const columns: DataTableColumn<LogOut>[] = [
    { key: 'time', header: '时间', render: (l) => <span className="text-xs text-theme-text-muted font-mono">{l.create_time}</span> },
    { key: 'action', header: '操作', render: (l) => <Badge className={ACTION_BADGE[l.action] || 'bg-theme-elevated text-theme-text-muted border-theme-border'}>{l.action}</Badge> },
    { key: 'target', header: '对象', render: (l) => <span className="text-xs text-theme-text-faint font-mono">{l.target_table}#{l.target_id}</span> },
    { key: 'detail', header: '描述', render: (l) => <span className="text-theme-text-secondary">{l.action_detail}</span> },
    { key: 'person', header: '操作人', render: (l) => <span className="text-theme-text-secondary">{l.person_name || '—'}</span> },
  ];
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <DataTable columns={columns} data={logs} rowKey={(l) => String(l.id)} loading={loading} showRowNumber={false} minWidth={800} empty={<EmptyState variant="inline" title="暂无操作日志" />} />
    </div>
  );
};

// ===== 事件 =====
const EventsTab: React.FC<{ events: EventOut[]; loading: boolean }> = ({ events, loading }) => {
  const columns: DataTableColumn<EventOut>[] = [
    { key: 'time', header: '时间', render: (e) => <span className="text-xs text-theme-text-muted font-mono">{e.create_time}</span> },
    { key: 'type', header: '事件类型', render: (e) => {
      const cls = e.event_type.includes('success') || e.event_type.includes('created') ? 'bg-brand-soft text-brand-primary border-brand-border' : e.event_type.includes('failed') ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' : e.event_type.includes('started') ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'bg-sky-500/15 text-sky-400 border-sky-500/20';
      return <Badge className={cls}>{e.event_type}</Badge>;
    } },
    { key: 'target', header: '对象', render: (e) => <span className="text-xs text-theme-text-faint font-mono">{e.target_table}#{e.target_id}</span> },
    { key: 'change', header: '状态变更', render: (e) => <span className="text-xs font-mono text-theme-text-faint">{e.from_status || '∅'} → {e.to_status || '∅'}</span> },
    { key: 'detail', header: '描述', render: (e) => <span className="text-theme-text-secondary">{e.event_detail}</span> },
    { key: 'person', header: '触发人', render: (e) => <span className="text-theme-text-secondary">{e.person_name || '—'}</span> },
  ];
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <DataTable columns={columns} data={events} rowKey={(e) => String(e.id)} loading={loading} showRowNumber={false} minWidth={900} empty={<EmptyState variant="inline" title="暂无事件" />} />
    </div>
  );
};

// ===== 编辑基本信息弹窗 =====
const EditInfoModal: React.FC<{ detail: BaselineDetail; onClose: () => void; onSaved: (d: BaselineDetail) => void }> = ({ detail, onClose, onSaved }) => {
  const [form, setForm] = useState<BaselineUpdate>({
    baseline_name: detail.baseline_name,
    baseline_name_en: detail.baseline_name_en || '',
    baseline_code: detail.baseline_code || '',
    category: detail.category || '',
    version: detail.version || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof BaselineUpdate, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.baseline_name?.trim()) { await showAlert({ message: '基线名称不能为空', tone: 'warning' }); return; }
    setSaving(true);
    try {
      const d = await secBaselineApi.updateBaseline(detail.id, form);
      await showAlert({ title: '已更新', message: '基本信息已更新', tone: 'success' });
      onSaved(d);
    } catch (e: any) {
      await showAlert({ message: e.message || '保存失败', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="xl" title="编辑基本信息" footer={
      <FormActionBar saving={saving} saveText="保存" resetText="取消" onSave={handleSave} onReset={onClose} />
    }>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="基线名称" required><input className="form-input" value={form.baseline_name || ''} onChange={(e) => set('baseline_name', e.target.value)} /></FormField>
        <FormField label="基线编码"><input className="form-input" value={form.baseline_code || ''} onChange={(e) => set('baseline_code', e.target.value)} /></FormField>
        <FormField label="英文名称"><input className="form-input" value={form.baseline_name_en || ''} onChange={(e) => set('baseline_name_en', e.target.value)} /></FormField>
        <FormField label="分类"><input className="form-input" value={form.category || ''} onChange={(e) => set('category', e.target.value)} /></FormField>
        <FormField label="版本号"><input className="form-input" value={form.version || ''} onChange={(e) => set('version', e.target.value)} /></FormField>
      </div>
    </Modal>
  );
};

export default SecBaselineDetailPage;
