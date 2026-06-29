import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Building2, ChevronDown, ChevronRight, GitBranch, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, EmptyState } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { showConfirm, showAlert, showPrompt } from '../../../components/DialogService';
import { secBaselineApi } from './client';
import { ORG_TYPE_LABEL } from './constants';
import type { OrgTreeNode, OrgNode, OrgNodeType } from './types';

interface SecBaselineOrgTreePageProps {
  onNavigateToView?: (view: string) => void;
}

interface VisibleRow {
  node: OrgTreeNode;
  depth: number;
  hasKids: boolean;
  isExpanded: boolean;
}

const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'bg': return <Building2 size={14} className="text-violet-400" />;
    case 'bu': return <GitBranch size={14} className="text-sky-400" />;
    case 'product': return <Box size={14} className="text-emerald-400" />;
    default: return <Building2 size={14} />;
  }
};

function inferChildType(parent: OrgNode | null): OrgNodeType {
  if (!parent) return 'bg';
  if (parent.node_type === 'bg') return 'bu';
  return 'product';
}

export const SecBaselineOrgTreePage: React.FC<SecBaselineOrgTreePageProps> = ({ onNavigateToView }) => {
  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await secBaselineApi.getOrgTree();
      setTree(Array.isArray(data) ? data : []);
      setExpanded(new Set((data || []).map((n) => n.id)));
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const toggle = useCallback((id: number) => setExpanded((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const countSubtree = useCallback((n: OrgTreeNode): number => {
    return 1 + (n.children || []).reduce((s, c) => s + countSubtree(c), 0);
  }, []);

  const handleDelete = useCallback(async (node: OrgTreeNode) => {
    const cnt = countSubtree(node);
    const confirmed = await showConfirm({
      title: '删除组织节点',
      message: `确认删除节点「${node.name}」?${cnt > 1 ? `级联删除共 ${cnt} 个节点,` : ''}不可恢复。`,
      confirmText: '确认删除', cancelText: '取消', danger: true,
    });
    if (!confirmed) return;
    try {
      await secBaselineApi.deleteOrgNode(node.id);
      fetchTree();
    } catch (e: any) {
      await showAlert({ message: e.message || '删除失败', tone: 'error' });
    }
  }, [countSubtree]);

  const handleAdd = useCallback(async (parent: OrgNode | null) => {
    const childType = inferChildType(parent);
    const name = await showPrompt({
      title: `新增${ORG_TYPE_LABEL[childType]}`,
      message: parent ? `在「${parent.name}」下新增${ORG_TYPE_LABEL[childType]}名称` : `新增根 BG 名称`,
      placeholder: `${ORG_TYPE_LABEL[childType]}名称`,
      confirmText: '新增', cancelText: '取消',
    });
    if (name == null || !name.trim()) return;
    try {
      await secBaselineApi.createOrgNode({
        name: name.trim(),
        sort_order: 1,
        parent_id: parent ? parent.id : null,
        node_type: childType,
      });
      fetchTree();
    } catch (e: any) {
      await showAlert({ message: e.message || '新增失败', tone: 'error' });
    }
  }, []);

  const handleEdit = useCallback(async (node: OrgNode) => {
    const name = await showPrompt({
      title: `编辑${ORG_TYPE_LABEL[node.node_type]}`,
      message: '修改名称',
      defaultValue: node.name,
      confirmText: '保存', cancelText: '取消',
    });
    if (name == null || !name.trim()) return;
    try {
      await secBaselineApi.updateOrgNode(node.id, { name: name.trim(), sort_order: node.sort_order ?? 1 });
      fetchTree();
    } catch (e: any) {
      await showAlert({ message: e.message || '保存失败', tone: 'error' });
    }
  }, []);

  const rows = useMemo<VisibleRow[]>(() => {
    const out: VisibleRow[] = [];
    const walk = (nodes: OrgTreeNode[], depth: number) => {
      nodes
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .forEach((n) => {
          const kids = n.children || [];
          const isExp = expanded.has(n.id);
          out.push({ node: n, depth, hasKids: kids.length > 0, isExpanded: isExp });
          if (kids.length > 0 && isExp) walk(kids, depth + 1);
        });
    };
    walk(tree, 0);
    return out;
  }, [tree, expanded]);

  const stats = useMemo(() => {
    const c = (type: string) => {
      let n = 0;
      const walk = (list: OrgTreeNode[]) => list.forEach((node) => {
        if (node.node_type === type) n++;
        if (node.children?.length) walk(node.children);
      });
      walk(tree);
      return n;
    };
    return tree.length ? { bg: c('bg'), bu: c('bu'), product: c('product') } : { bg: 0, bu: 0, product: 0 };
  }, [tree]);

  const columns = useMemo<DataTableColumn<VisibleRow>[]>(() => [
    {
      key: 'name', header: '名称',
      render: (r) => (
        <div className="flex items-center gap-1.5" style={{ paddingLeft: r.depth * 20 }}>
          {r.hasKids ? (
            <button onClick={() => toggle(r.node.id)} className="shrink-0 text-theme-text-faint hover:text-theme-text-primary">
              {r.isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : <span className="w-3 shrink-0" />}
          <TypeIcon type={r.node.node_type} />
          <span className={`truncate ${r.node.node_type === 'product' ? 'font-semibold text-theme-text-primary' : 'text-theme-text-secondary'}`}>{r.node.name}</span>
        </div>
      ),
    },
    { key: 'type', header: '类型', render: (r) => <span className="text-xs px-2 py-0.5 rounded border border-theme-border bg-theme-elevated text-theme-text-secondary">{ORG_TYPE_LABEL[r.node.node_type]}</span> },
    { key: 'id', header: 'ID', render: (r) => <span className="text-xs font-mono text-theme-text-faint">#{r.node.id}</span> },
    { key: 'person', header: '创建人', render: (r) => <span className="text-theme-text-secondary">{r.node.person_name || '—'}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.node.node_type !== 'product' && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="新增子节点" onClick={() => handleAdd(r.node)}><Plus size={14} /></button>
          )}
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="编辑" onClick={() => handleEdit(r.node)}><Pencil size={14} /></button>
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-state-danger" title="删除" onClick={() => handleDelete(r.node)}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ], [toggle, handleAdd, handleEdit, handleDelete]);

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="px-5 md:px-6 2xl:px-8 pt-5 pb-4 border-b border-theme-border">
        <PageHeader
          back={{ label: '返回基线列表', onClick: () => onNavigateToView?.('sec-baseline-mgmt') }}
          title="组织树管理"
          description="维护 BG → BU → 产品 层级,供基线归属与过滤"
          actions={
            <div className="flex items-center gap-2">
              <button className="btn-icon" title="刷新" onClick={fetchTree}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
              <button className="btn btn-primary" onClick={() => handleAdd(null)}><Plus size={16} /> 新增根 BG</button>
            </div>
          }
        />
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-5 md:px-6 2xl:px-8 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3"><div className="text-xs text-theme-text-faint">BG</div><div className="text-2xl font-semibold tabular-nums text-violet-400 mt-1">{stats.bg}</div></div>
            <div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3"><div className="text-xs text-theme-text-faint">BU</div><div className="text-2xl font-semibold tabular-nums text-sky-400 mt-1">{stats.bu}</div></div>
            <div className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3"><div className="text-xs text-theme-text-faint">产品</div><div className="text-2xl font-semibold tabular-nums text-emerald-400 mt-1">{stats.product}</div></div>
          </div>
          <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(r) => String(r.node.id)}
              loading={loading && rows.length === 0}
              showRowNumber={false}
              minWidth={720}
              empty={<EmptyState variant="inline" title="暂无组织数据" description="点击右上角「新增根 BG」开始" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecBaselineOrgTreePage;
