import React, { useMemo, useState } from 'react';
import {
  ChevronRight, ChevronDown, Database, Folder, GitBranch, FileText, Search, Pencil,
} from 'lucide-react';
import { EmptyState } from '../../../../design-system';
import {
  buildItemTree, collectItemLeaves, findItemNode, resultDotColor,
  EXEC_RESULT_MAP, EXEC_STATUS_MAP, CONFIDENCE_MAP, PRIORITY_MAP, SYNC_MAP,
  ExecResultBadge, Badge, fmtTime,
} from '../constants';
import type { ItemTreeNode } from '../constants';
import type {
  BaselineTreeResponse, ExecutionResult, ExecutionUpdate, ExecuteResult, Confidence,
} from '../types';
import { ExecutionEditForm } from './ExecutionEditForm';

interface ExecResultPanelProps {
  baselineTree: BaselineTreeResponse | null;
  executions: ExecutionResult[];
  onExecutionUpdated: () => void;
  onSaveExecution: (eid: number, payload: ExecutionUpdate) => Promise<ExecutionResult>;
}

const ROOT_ID = -1;

export const ExecResultPanel: React.FC<ExecResultPanelProps> = ({
  baselineTree, executions, onExecutionUpdated, onSaveExecution,
}) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([ROOT_ID]));
  const [selectedId, setSelectedId] = useState<number>(ROOT_ID);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [executorFilter, setExecutorFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [keyAbilityFilter, setKeyAbilityFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingEid, setEditingEid] = useState<number | null>(null);

  const tree = useMemo(
    () => (baselineTree ? buildItemTree(baselineTree.nodes) : []),
    [baselineTree],
  );
  const itemNodeMap = useMemo(() => {
    const m = new Map<number, ItemTreeNode>();
    const walk = (nodes: ItemTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.node_type === 'item') m.set(n.id, n);
        walk(n.children);
      });
    };
    walk(tree);
    return m;
  }, [tree]);

  // 当前选中节点下的全部 item executions
  const branchExecutions = useMemo(() => {
    if (selectedId === ROOT_ID) return executions;
    const node = findItemNode(tree, selectedId);
    if (!node) return [];
    if (node.node_type === 'item') return executions.filter((e) => e.item_node_id === node.id);
    const leaves = collectItemLeaves(node);
    const ids = new Set(leaves.map((l) => l.id));
    return executions.filter((e) => ids.has(e.item_node_id));
  }, [selectedId, tree, executions]);

  // 5 筛选
  const filteredExecutions = useMemo(() => {
    let list = branchExecutions;
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((e) => {
        const node = itemNodeMap.get(e.item_node_id);
        return (node?.name || '').toLowerCase().includes(kw) || (e.item_code || '').toLowerCase().includes(kw);
      });
    }
    if (statusFilter) list = list.filter((e) => e.execute_status === statusFilter);
    if (resultFilter) list = list.filter((e) => e.execute_result === resultFilter);
    if (confidenceFilter) list = list.filter((e) => e.confidence === confidenceFilter);
    if (executorFilter) list = list.filter((e) => (e.executor || '') === executorFilter);
    if (priorityFilter) list = list.filter((e) => {
      const node = itemNodeMap.get(e.item_node_id);
      return node?.priority === priorityFilter;
    });
    if (keyAbilityFilter) list = list.filter((e) => {
      const node = itemNodeMap.get(e.item_node_id);
      return keyAbilityFilter === 'yes' ? !!node?.is_key_ability : !node?.is_key_ability;
    });
    return list;
  }, [branchExecutions, keyword, statusFilter, resultFilter, confidenceFilter, executorFilter, priorityFilter, keyAbilityFilter, itemNodeMap]);

  const executors = useMemo(
    () => Array.from(new Set(branchExecutions.map((e) => e.executor).filter(Boolean) as string[])),
    [branchExecutions],
  );

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRow = (eid: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid); else next.add(eid);
      return next;
    });
  };

  const selectedNode = selectedId === ROOT_ID ? null : findItemNode(tree, selectedId);

  // 编辑模式
  if (editingEid != null) {
    const exec = executions.find((e) => e.id === editingEid);
    if (exec) {
      const itemNode = itemNodeMap.get(exec.item_node_id);
      return (
        <ExecutionEditForm
          execution={exec}
          itemName={itemNode?.name}
          onBack={() => setEditingEid(null)}
          onSave={async (payload) => {
            await onSaveExecution(exec.id, payload);
            onExecutionUpdated();
            setEditingEid(null);
          }}
        />
      );
    }
  }

  // 选中 item 叶子 → 直接编辑
  if (selectedNode && selectedNode.node_type === 'item') {
    const exec = executions.find((e) => e.item_node_id === selectedNode.id);
    if (exec) {
      return (
        <ExecutionEditForm
          execution={exec}
          itemName={selectedNode.name}
          onBack={() => setSelectedId(ROOT_ID)}
          onSave={async (payload) => {
            await onSaveExecution(exec.id, payload);
            onExecutionUpdated();
          }}
        />
      );
    }
    // item 无 execution 记录
    return (
      <div className="space-y-3">
        <button className="btn btn-ghost text-sm" onClick={() => setSelectedId(ROOT_ID)}>
          <ChevronRight size={14} className="rotate-180" /> 返回列表
        </button>
        <EmptyState variant="block" icon={<FileText size={32} />} title="该检查项暂无评估结果" />
      </div>
    );
  }

  if (!baselineTree) {
    return <div className="p-10 text-center text-theme-text-muted">加载基线节点树...</div>;
  }

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* 左树 */}
      <div className="w-72 shrink-0 rounded-xl border border-theme-border bg-theme-surface overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-theme-border-subtle">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-text-faint" size={12} />
            <input
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setSelectedId(ROOT_ID); }}
              placeholder="搜索检查项编码..."
              className="form-input text-xs pl-7"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1 max-h-[560px]">
          {tree.length === 0 ? (
            <div className="p-4 text-center text-xs text-theme-text-faint">无基线节点</div>
          ) : renderTree(tree, 0)}
        </div>
      </div>

      {/* 右内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-theme-text-primary">
            {selectedNode ? selectedNode.name : baselineTree.baseline_name || '全部检查项'}
          </span>
          <span className="text-xs text-theme-text-faint">({filteredExecutions.length} 条评估结果)</span>
        </div>

        {/* 筛选栏 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索检查项名称..."
            className="form-input text-xs w-40"
          />
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部优先级</option>
            {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={keyAbilityFilter} onChange={(e) => setKeyAbilityFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部能力</option>
            <option value="yes">核心能力</option>
            <option value="no">非核心能力</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部状态</option>
            {Object.entries(EXEC_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部结论</option>
            {Object.entries(EXEC_RESULT_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部置信</option>
            {Object.entries(CONFIDENCE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={executorFilter} onChange={(e) => setExecutorFilter(e.target.value)} className="form-select text-xs w-auto">
            <option value="">全部评估人</option>
            {executors.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        </div>

        {/* 列表 */}
        {filteredExecutions.length === 0 ? (
          <EmptyState variant="inline" title="暂无匹配的评估结果" />
        ) : (
          <div className="rounded-lg border border-theme-border bg-theme-surface overflow-hidden">
            {/* 表头 */}
            <div className="flex items-center gap-3 px-3 py-2 bg-theme-elevated border-b border-theme-border text-[10px] font-bold uppercase tracking-wider text-theme-text-faint">
              <span className="w-2 shrink-0" />
              <span className="w-48 shrink-0">检查项</span>
              <span className="w-20 shrink-0 text-right">CODE</span>
              <span className="w-20 shrink-0 text-center whitespace-nowrap">基线项优先级</span>
              <span className="w-20 shrink-0 text-center whitespace-nowrap">核心安全能力</span>
              <span className="w-20 shrink-0 text-center whitespace-nowrap">评估置信度</span>
              <span className="w-24 shrink-0 text-center">执行结论</span>
              <span className="w-20 shrink-0 text-center">评估人</span>
              <span className="w-6 shrink-0 text-center">操作</span>
            </div>
            {/* 行 */}
            <div className="divide-y divide-theme-border-subtle">
            {filteredExecutions.map((e) => {
              const itemNode = itemNodeMap.get(e.item_node_id);
              const isOpen = expandedRows.has(e.id);
              return (
                <div key={e.id}>
                  <div
                    className="flex items-center gap-3 px-3 py-2 hover:bg-theme-elevated cursor-pointer"
                    onClick={() => toggleRow(e.id)}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${resultDotColor(e.execute_result)}`} />
                    <span className="text-sm text-theme-text-primary truncate w-48 shrink-0">
                      {itemNode?.name || e.item_code || `#${e.item_node_id}`}
                    </span>
                    {e.item_code && <span className="text-xs font-mono text-theme-text-faint w-20 shrink-0 truncate text-right">{e.item_code}</span>}
                    <div className="w-20 shrink-0 flex justify-center">
                      {itemNode?.priority ? <Badge className={PRIORITY_MAP[itemNode.priority]?.badge || ''}>{PRIORITY_MAP[itemNode.priority]?.label || itemNode.priority}</Badge> : <span className="text-xs text-theme-text-faint">—</span>}
                    </div>
                    <div className="w-20 shrink-0 flex justify-center">
                      {itemNode?.is_key_ability ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">是</Badge> : <span className="text-xs text-theme-text-faint">否</span>}
                    </div>
                    <div className="w-20 shrink-0 flex justify-center">
                      {e.confidence ? <Badge className={CONFIDENCE_MAP[e.confidence as keyof typeof CONFIDENCE_MAP]?.badge || ''}>{e.confidence}</Badge> : <span className="text-xs text-theme-text-faint">—</span>}
                    </div>
                    <div className="w-24 shrink-0 flex justify-center"><ExecResultBadge result={e.execute_result as ExecuteResult} /></div>
                    <span className="text-xs text-theme-text-faint w-20 shrink-0 truncate text-center">{e.executor || '—'}</span>
                    <button
                      className="btn-ghost p-1 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary shrink-0"
                      title="编辑"
                      onClick={(ev) => { ev.stopPropagation(); setEditingEid(e.id); }}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  {isOpen && <ExecDetailInline exec={e} />}
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderTree(nodeList: ItemTreeNode[], depth: number): React.ReactNode {
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
          const exec = executions.find((e) => e.item_node_id === n.id);
          const resultDot = n.node_type === 'item' && exec ? resultDotColor(exec.execute_result) : '';
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
                {resultDot && <span className={`w-1.5 h-1.5 rounded-full ${resultDot} shrink-0`} />}
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
  }

  function renderRoot() {
    const name = baselineTree?.baseline_name || '基线';
    const ver = baselineTree?.version;
    return (
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-sm font-medium ${
          selectedId === ROOT_ID ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-primary hover:bg-theme-elevated'
        }`}
        onClick={() => { setSelectedId(ROOT_ID); if (!expanded.has(ROOT_ID)) toggle(ROOT_ID); }}
      >
        {expanded.has(ROOT_ID) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Database size={14} className="text-brand-primary" />
        <span>{name}</span>
        {ver && <span className="text-xs font-mono text-theme-text-faint ml-1">v{ver}</span>}
      </div>
    );
  }
};

// ===== 行内只读详情 =====
const ExecDetailInline: React.FC<{ exec: ExecutionResult }> = ({ exec }) => {
  const m = SYNC_MAP[exec.sync_status as keyof typeof SYNC_MAP] || SYNC_MAP.unsync;
  return (
    <div className="px-3 py-3 bg-theme-elevated space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <Badge className={EXEC_STATUS_MAP[exec.execute_status as keyof typeof EXEC_STATUS_MAP]?.badge || ''}>{exec.execute_status}</Badge>
        <ExecResultBadge result={exec.execute_result as ExecuteResult} />
        {exec.confidence && <Badge className={CONFIDENCE_MAP[exec.confidence as keyof typeof CONFIDENCE_MAP]?.badge || ''}>{exec.confidence}</Badge>}
        <Badge className={m.badge} dot={m.dot}>{m.label}</Badge>
        <span className="text-theme-text-faint">评估人:{exec.executor || '—'}</span>
        <span className="text-theme-text-faint">{fmtTime(exec.executed_time)}</span>
      </div>
      {exec.summary && <Field label="摘要" value={exec.summary} />}
      {exec.recommendation && <Field label="建议" value={exec.recommendation} />}
      {exec.evidence_set && <JsonField label="证据集" value={exec.evidence_set} />}
      {exec.counter_evidence && <JsonField label="反证" value={exec.counter_evidence} />}
      {exec.gaps && <JsonField label="差距" value={exec.gaps} />}
      {exec.configuration_dependency && <JsonField label="配置依赖" value={exec.configuration_dependency} />}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-theme-text-faint mb-0.5">{label}</div>
    <div className="text-theme-text-secondary whitespace-pre-wrap">{value}</div>
  </div>
);

const JsonField: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-theme-text-faint mb-0.5">{label}</div>
    <pre className="text-xs font-mono text-theme-text-secondary bg-theme-surface rounded p-2 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>
  </div>
);

export default ExecResultPanel;
