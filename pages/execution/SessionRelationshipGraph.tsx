import React, { useMemo, useState } from 'react';
import { ArrowDown, Expand, GitBranch, Radar, TimerReset, X } from 'lucide-react';

import { AppSaSessionIndex, AppSaSessionIndexEdge, AppSaSessionIndexNode } from '../../types/types';
import { AgentSessionDialogHeader } from './AgentSessionDialogHeader';
import { AgentSessionViewer } from './AgentSessionViewer';

function nodeStatusTone(status?: string) {
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'waiting') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function roleTone(role?: string) {
  if (role === 'judge') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (role === 'sub_worker') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-cyan-200 bg-cyan-50 text-cyan-700';
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function formatNodeSubtitle(node: AppSaSessionIndexNode) {
  const parts: string[] = [];
  if (node.module_name) parts.push(node.module_name);
  if (node.attempt) parts.push(`轮次 ${node.attempt}`);
  if (node.batch_index) parts.push(`Batch ${node.batch_index}`);
  if (typeof node.judge_index === 'number') parts.push(`Judge ${node.judge_index}`);
  return parts.join(' · ');
}

type StageSummary = {
  stageKey: string;
  stageLabel: string;
  stageOrder: number;
  items: AppSaSessionIndexNode[];
  workerCount: number;
  judgeCount: number;
  subWorkerCount: number;
  activeCount: number;
  parallelGroupCount: number;
  status: string;
};

const SessionNodeCard: React.FC<{
  node: AppSaSessionIndexNode;
  selected: boolean;
  onSelect: (path: string) => void;
}> = ({ node, selected, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(node.relative_path)}
    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
      selected
        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)]'
        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{node.display_name}</div>
        <div className={`mt-1 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          {formatNodeSubtitle(node) || node.relative_path}
        </div>
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-white/20 bg-white/10 text-white' : nodeStatusTone(node.status)}`}>
        {node.is_active ? '运行中' : node.status}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
      <span className={`rounded-full border px-2 py-0.5 font-bold ${selected ? 'border-white/15 bg-white/10 text-slate-100' : roleTone(node.role)}`}>
        {node.role_label}
      </span>
      <span className={`rounded-full border px-2 py-0.5 font-bold ${selected ? 'border-white/15 bg-white/10 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
        {node.event_count} events
      </span>
    </div>
    <div className={`mt-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
      开始 {formatTime(node.started_at || node.session_header?.timestamp as string | undefined)}
    </div>
  </button>
);

function buildStageStatus(items: AppSaSessionIndexNode[]) {
  if (items.some((item) => item.is_active || item.status === 'running')) return 'running';
  if (items.some((item) => item.status === 'blocked')) return 'blocked';
  if (items.some((item) => item.status === 'waiting')) return 'waiting';
  return 'completed';
}

function buildGraph(index: AppSaSessionIndex | null) {
  const nodes = index?.nodes || [];
  const edges = index?.edges || [];
  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]));
  const childMap = new Map<string, AppSaSessionIndexEdge[]>();
  for (const edge of edges) {
    const list = childMap.get(edge.source_node_id) || [];
    list.push(edge);
    childMap.set(edge.source_node_id, list);
  }
  const stages = new Map<string, AppSaSessionIndexNode[]>();
  for (const node of nodes) {
    const key = node.stage_key || 'unknown';
    const list = stages.get(key) || [];
    list.push(node);
    stages.set(key, list);
  }
  const orderedStages: StageSummary[] = Array.from(stages.entries())
    .map(([stageKey, items]) => {
      const sortedItems = [...items].sort((a, b) => (a.started_ts || a.mtime || 0) - (b.started_ts || b.mtime || 0));
      const parallelGroups = new Set(sortedItems.map((item) => item.parallel_group).filter(Boolean));
      return {
        stageKey,
        stageLabel: sortedItems[0]?.stage_label || stageKey,
        stageOrder: sortedItems[0]?.stage_order || 999,
        items: sortedItems,
        workerCount: sortedItems.filter((item) => item.role === 'worker').length,
        judgeCount: sortedItems.filter((item) => item.role === 'judge').length,
        subWorkerCount: sortedItems.filter((item) => item.role === 'sub_worker').length,
        activeCount: sortedItems.filter((item) => item.is_active).length,
        parallelGroupCount: parallelGroups.size,
        status: buildStageStatus(sortedItems),
      };
    })
    .sort((a, b) => a.stageOrder - b.stageOrder);
  return { nodeMap, childMap, orderedStages };
}

const DetailedStageGraph: React.FC<{
  stage: StageSummary;
  nodeMap: Map<string, AppSaSessionIndexNode>;
  childMap: Map<string, AppSaSessionIndexEdge[]>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}> = ({ stage, nodeMap, childMap, selectedPath, onSelect }) => (
  <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Nodes</div>
        <div className="mt-2 text-2xl font-black text-slate-900">{stage.items.length}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Workers</div>
        <div className="mt-2 text-2xl font-black text-cyan-700">{stage.workerCount + stage.subWorkerCount}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Judges</div>
        <div className="mt-2 text-2xl font-black text-amber-700">{stage.judgeCount}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Parallel</div>
        <div className="mt-2 text-2xl font-black text-slate-900">{stage.parallelGroupCount}</div>
      </div>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Agent Graph</div>
      <div className="mt-1 text-sm text-slate-500">展示该阶段内的智能体节点，以及派生出的并行 Judge / Sub Worker 关系。</div>

      <div className="mt-5 space-y-4">
        {stage.items.map((node, nodeIndex) => {
          const childEdges = (childMap.get(node.node_id) || []).filter((edge) => {
            const target = nodeMap.get(edge.target_node_id);
            return target && target.stage_key === stage.stageKey && (target.role === 'judge' || target.role === 'sub_worker');
          });
          const groupedChildren = childEdges.reduce<Map<string, AppSaSessionIndexNode[]>>((map, edge) => {
            const target = nodeMap.get(edge.target_node_id);
            if (!target) return map;
            const key = target.parallel_group || `${target.role}:${edge.kind}`;
            const list = map.get(key) || [];
            list.push(target);
            map.set(key, list);
            return map;
          }, new Map());
          return (
            <div key={node.node_id}>
              {nodeIndex > 0 ? (
                <div className="mb-3 flex items-center gap-2 pl-2 text-[11px] font-bold text-slate-400">
                  <TimerReset size={12} />
                  同阶段推进
                </div>
              ) : null}
              <SessionNodeCard node={node} selected={selectedPath === node.relative_path} onSelect={onSelect} />

              {groupedChildren.size > 0 ? (
                <div className="mt-3 space-y-3 pl-4">
                  {Array.from(groupedChildren.entries()).map(([groupKey, children]) => (
                    <div key={groupKey} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        <GitBranch size={12} />
                        {children[0]?.role === 'judge' ? '并列 Judge' : '并列 Sub Worker'}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                        {children
                          .sort((a, b) => (a.started_ts || a.mtime || 0) - (b.started_ts || b.mtime || 0))
                          .map((child) => (
                            <SessionNodeCard key={child.node_id} node={child} selected={selectedPath === child.relative_path} onSelect={onSelect} />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export const SessionRelationshipGraph: React.FC<{
  index: AppSaSessionIndex | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  sessionPreview?: {
    path: string | null;
    sessionMeta?: any;
    sessionHeader?: Record<string, any> | null;
    events: any[];
    loading?: boolean;
    live?: boolean;
    error?: string | null;
  };
}> = ({ index, selectedPath, onSelect, sessionPreview }) => {
  const graph = useMemo(() => buildGraph(index), [index]);
  const [expandedStageKey, setExpandedStageKey] = useState<string | null>(null);
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);
  const expandedStage = graph.orderedStages.find((stage) => stage.stageKey === expandedStageKey) || null;
  const inspectedNode = inspectedPath
    ? index?.nodes?.find((node) => node.relative_path === inspectedPath) || null
    : null;
  const inspectedPreview = inspectedPath && sessionPreview?.path === inspectedPath ? sessionPreview : null;

  const handleInspectNode = (path: string) => {
    onSelect(path);
    setInspectedPath(path);
  };

  if (!index || graph.orderedStages.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        暂无可视化会话关系
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Session Count</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{index.summary?.session_count ?? index.nodes.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Stage Count</div>
            <div className="mt-2 text-2xl font-black text-cyan-700">{graph.orderedStages.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Active</div>
            <div className="mt-2 text-2xl font-black text-blue-700">{index.summary?.active_session_count ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Index File</div>
            <div className="mt-2 truncate font-mono text-[11px] text-slate-600">{index.index_path || '-'}</div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Stage Graph</div>
              <div className="mt-1 text-sm text-slate-500">
                默认只展示阶段之间的推进关系，避免 500+ 智能体节点直接铺开；点击阶段卡片可全屏查看该阶段的智能体关系。
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              更新时间 {formatTime(index.generated_at)}
            </div>
          </div>

          <div className="mt-5 space-y-6">
            {graph.orderedStages.map((stage, stageIndex) => (
              <div key={stage.stageKey}>
                {stageIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedStageKey(stage.stageKey)}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    <ArrowDown size={13} />
                    推进到下一阶段，点击查看阶段内智能体关系
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setExpandedStageKey(stage.stageKey)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Radar size={15} className="text-cyan-600" />
                        <div className="text-sm font-black text-slate-900">{stage.stageLabel}</div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${nodeStatusTone(stage.status)}`}>
                          {stage.activeCount > 0 ? '运行中' : stage.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        仅展示阶段摘要。点击后进入全屏视图查看智能体推进、并列 Judge / Sub Worker 关系。
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                      <Expand size={14} />
                      查看智能体关系
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Nodes</div>
                      <div className="mt-2 text-xl font-black text-slate-900">{stage.items.length}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Workers</div>
                      <div className="mt-2 text-xl font-black text-cyan-700">{stage.workerCount}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Sub Workers</div>
                      <div className="mt-2 text-xl font-black text-violet-700">{stage.subWorkerCount}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Judges</div>
                      <div className="mt-2 text-xl font-black text-amber-700">{stage.judgeCount}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Parallel Groups</div>
                      <div className="mt-2 text-xl font-black text-slate-900">{stage.parallelGroupCount}</div>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {expandedStage ? (
        <div className="fixed inset-0 z-[260] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_32px_120px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Agent Relationship</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{expandedStage.stageLabel}</div>
                <div className="mt-2 text-sm text-slate-500">
                  当前查看阶段内的智能体推进与并列关系。选择节点后，下方任务详情中的会话查看器会同步切到对应会话。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedStageKey(null)}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-6">
              <DetailedStageGraph
                stage={expandedStage}
                nodeMap={graph.nodeMap}
                childMap={graph.childMap}
                selectedPath={selectedPath}
                onSelect={handleInspectNode}
              />
            </div>
          </div>
        </div>
      ) : null}

      {inspectedPath ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_32px_120px_rgba(15,23,42,0.35)]">
            <AgentSessionDialogHeader
              title={inspectedNode?.display_name || inspectedPath}
              subtitle={inspectedNode ? formatNodeSubtitle(inspectedNode) || inspectedNode.relative_path : inspectedPath}
              stage={inspectedNode?.stage_label || inspectedNode?.stage_key}
              roleLabel={inspectedNode?.role_label || inspectedNode?.role || 'Agent'}
              roleToneClass={roleTone(inspectedNode?.role)}
              eventCount={inspectedNode?.event_count}
              live={inspectedPreview?.live}
              onClose={() => setInspectedPath(null)}
            />

            <div className="flex-1 overflow-auto px-6 py-6">
              <AgentSessionViewer
                sessionMeta={inspectedPreview?.sessionMeta}
                sessionHeader={inspectedPreview?.sessionHeader}
                events={inspectedPreview?.events || []}
                loading={Boolean(inspectedPath && (!inspectedPreview || inspectedPreview.loading))}
                live={inspectedPreview?.live}
                error={inspectedPreview?.error}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
