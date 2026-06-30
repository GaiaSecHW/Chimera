import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ChevronDown, Database, Folder, GitBranch, FileText, Search, Info,
} from 'lucide-react';
import { EmptyState } from '../../../../design-system';
import { secAssessmentApi } from '../client';
import { buildBaselineTree, collectLeaves, findNode, NODE_TYPE_LABEL } from '../constants';
import type { BaselineTreeNode } from '../constants';
import type { BaselineNodeOut, ProjectDetail } from '../types';

interface ExecResultPanelProps {
  detail: ProjectDetail;
}

const ROOT_ID = -1;

export const ExecResultPanel: React.FC<ExecResultPanelProps> = ({ detail }) => {
  const [nodes, setNodes] = useState<BaselineNodeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([ROOT_ID]));
  const [selectedId, setSelectedId] = useState<number>(ROOT_ID);
  const [keyword, setKeyword] = useState('');

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await secAssessmentApi.getBaselineNodes(detail.baseline_id);
      setNodes(Array.isArray(data) ? data : []);
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [detail.baseline_id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const tree = useMemo(() => buildBaselineTree(nodes), [nodes]);
  const allLeaves = useMemo(() => tree.flatMap((r) => collectLeaves(r)), [tree]);

  const filteredLeaves = useMemo(() => {
    if (!keyword.trim()) return allLeaves;
    const kw = keyword.trim().toLowerCase();
    return allLeaves.filter((n) => (n.name || '').toLowerCase().includes(kw) || (n.code || '').toLowerCase().includes(kw));
  }, [allLeaves, keyword]);

  const selectedNode = selectedId === ROOT_ID ? null : findNode(tree, selectedId);
  const selectedLeaves = selectedNode ? collectLeaves(selectedNode) : filteredLeaves;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderTree = (nodeList: BaselineTreeNode[], depth: number): React.ReactNode => {
    if (depth === 0) {
      return (
        <div>
          {renderRoot()}
          {expanded.has(ROOT_ID) && renderTree(nodeList, 1)}
        </div>
      );
    }
    return (
      <div>
        {nodeList.map((n) => {
          const isOpen = expanded.has(n.id);
          const isSelected = selectedId === n.id;
          const icon = n.node_type === 'level1' ? <Folder size={13} className="text-violet-400" />
            : n.node_type === 'level2' ? <GitBranch size={13} className="text-sky-400" />
            : <FileText size={13} className="text-emerald-400" />;
          const hasChildren = n.children.length > 0;
          return (
            <div key={n.id}>
              <div
                className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm ${
                  isSelected ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-secondary hover:bg-theme-elevated'
                }`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => { setSelectedId(n.id); if (hasChildren) toggle(n.id); }}
              >
                {hasChildren ? (
                  <span className="text-theme-text-faint">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                ) : <span className="w-3" />}
                {icon}
                <span className="truncate">{n.name}</span>
                {n.code && <span className="text-xs text-theme-text-faint font-mono ml-1">{n.code}</span>}
              </div>
              {hasChildren && isOpen && renderTree(n.children, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRoot = () => (
    <div
      className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-sm font-medium ${
        selectedId === ROOT_ID ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-primary hover:bg-theme-elevated'
      }`}
      onClick={() => { setSelectedId(ROOT_ID); if (!expanded.has(ROOT_ID)) toggle(ROOT_ID); }}
    >
      {expanded.has(ROOT_ID) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      <Database size={14} className="text-brand-primary" />
      <span>{detail.baseline_name || '基线'}</span>
      {detail.baseline_name && (
        <span className="text-xs font-mono text-theme-text-faint ml-1">v{(detail as any).baseline_version || ''}</span>
      )}
    </div>
  );

  if (loading) {
    return <div className="p-10 text-center text-theme-text-muted">加载基线节点树...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
        <span className="text-xs text-theme-text-secondary">
          逐项评估结果需后端补充 <code className="text-xs px-1 py-0.5 rounded bg-theme-elevated text-brand-primary">GET /api/projects/{detail.id}/executions</code> 端点。
          当前仅展示基线节点树(只读),编辑功能待后端补端点后启用。
        </span>
      </div>

      <div className="flex gap-4 min-h-[400px]">
        {/* 左树 */}
        <div className="w-72 shrink-0 rounded-xl border border-theme-border bg-theme-surface overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-theme-border-subtle">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-text-faint" size={12} />
              <input
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setSelectedId(ROOT_ID); }}
                placeholder="搜索检查项..."
                className="form-input text-xs pl-7"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1 max-h-[500px]">
            {tree.length === 0 ? <div className="p-4 text-center text-xs text-theme-text-faint">无基线节点</div> : renderTree(tree, 0)}
          </div>
        </div>

        {/* 右内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-theme-text-primary">
              {selectedNode ? selectedNode.name : '全部检查项'}
            </span>
            <span className="text-xs text-theme-text-faint">({selectedLeaves.length} 个检查项)</span>
          </div>
          {selectedNode && selectedNode.node_type === 'item' ? (
            <NodeDetailCard node={selectedNode} />
          ) : selectedNode ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-theme-border bg-theme-surface p-3 text-sm">
                <div className="text-theme-text-faint text-xs mb-1">{NODE_TYPE_LABEL[selectedNode.node_type]}</div>
                <div className="text-theme-text-primary font-medium">{selectedNode.name}</div>
                {selectedNode.objective && <div className="text-xs text-theme-text-muted mt-2">{selectedNode.objective}</div>}
              </div>
              <LeafList leaves={selectedLeaves} onSelect={(id) => setSelectedId(id)} />
            </div>
          ) : (
            <LeafList leaves={selectedLeaves} onSelect={(id) => setSelectedId(id)} />
          )}
        </div>
      </div>
    </div>
  );
};

const NodeDetailCard: React.FC<{ node: BaselineTreeNode }> = ({ node }) => (
  <div className="rounded-lg border border-theme-border bg-theme-surface p-4 space-y-3">
    <div className="flex items-center gap-2">
      <FileText size={14} className="text-emerald-400" />
      <span className="text-sm font-medium text-theme-text-primary">{node.name}</span>
      {node.code && <span className="text-xs font-mono text-theme-text-faint">{node.code}</span>}
    </div>
    {node.objective && <Field label="目标" value={node.objective} />}
    {node.description && <Field label="描述" value={node.description} />}
    {node.verification && <Field label="验证方法" value={node.verification} />}
    {node.priority && <Field label="优先级" value={node.priority} />}
    {node.is_key_ability != null && <Field label="关键能力" value={node.is_key_ability ? '是' : '否'} />}
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-theme-text-faint mb-0.5">{label}</div>
    <div className="text-sm text-theme-text-secondary whitespace-pre-wrap">{value}</div>
  </div>
);

const LeafList: React.FC<{ leaves: BaselineTreeNode[]; onSelect: (id: number) => void }> = ({ leaves, onSelect }) => {
  if (leaves.length === 0) return <EmptyState variant="inline" title="暂无检查项" />;
  return (
    <div className="rounded-lg border border-theme-border bg-theme-surface overflow-hidden divide-y divide-theme-border-subtle">
      {leaves.map((n) => (
        <div
          key={n.id}
          className="flex items-center gap-2 px-3 py-2 hover:bg-theme-elevated cursor-pointer"
          onClick={() => onSelect(n.id)}
        >
          <FileText size={12} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-theme-text-primary truncate flex-1">{n.name}</span>
          {n.code && <span className="text-xs font-mono text-theme-text-faint">{n.code}</span>}
        </div>
      ))}
    </div>
  );
};

export default ExecResultPanel;
