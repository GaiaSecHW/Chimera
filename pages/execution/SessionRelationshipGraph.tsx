import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Expand, GitBranch, Radar, TimerReset, X } from 'lucide-react';

import { AppSaSessionIndex, AppSaSessionIndexEdge, AppSaSessionIndexNode } from '../../types/types';
import { AgentSessionDialogHeader } from './AgentSessionDialogHeader';
import { AgentSessionViewer } from './AgentSessionViewer';
import SessionRelationshipGraphWorker from './workers/sessionRelationshipGraph.worker.ts?worker';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: '#1b2438',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-primary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function nodeStatusTone(status?: string) {
  if (status === 'running') return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
  if (status === 'completed') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (status === 'blocked') return 'border-red-500/20 bg-red-500/15 text-red-400';
  if (status === 'waiting') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  return 'border-theme-border bg-theme-elevated text-theme-text-secondary';
}

function roleTone(role?: string) {
  if (role === 'judge') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (role === 'sub_worker') return 'border-violet-500/20 bg-violet-500/15 text-violet-400';
  return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400';
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
    style={{ width: '100%', borderRadius: '16px', border: `1px solid ${selected ? LK.border : LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', textAlign: 'left', transition: 'all 0.2s', backgroundColor: selected ? LK.surface : LK.surfaceRaised, color: selected ? LK.ink : LK.inkSoft, cursor: 'pointer' }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 600 }}>{node.display_name}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: selected ? LK.body : LK.body }}>
          {formatNodeSubtitle(node) || node.relative_path}
        </div>
      </div>
 <span style={{ borderRadius: '9999px', border: `1px solid ${selected ? LK.border : 'transparent'}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontSize: '10px', fontWeight: 600, backgroundColor: selected ? LK.primaryMuted : 'transparent', color: selected ? LK.ink : LK.body }}>
        {node.is_active ? '运行中' : node.status}
      </span>
    </div>
    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '10px' }}>
 <span style={{ borderRadius: '9999px', border: `1px solid ${selected ? LK.border : 'transparent'}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontWeight: 600, backgroundColor: selected ? LK.primaryMuted : 'transparent', color: selected ? LK.inkSoft : LK.body }}>
        {node.role_label}
      </span>
 <span style={{ borderRadius: '9999px', border: `1px solid ${selected ? LK.border : LK.borderSoft}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontWeight: 600, backgroundColor: selected ? LK.primaryMuted : LK.surfaceRaised, color: selected ? LK.inkSoft : LK.body }}>
        {node.event_count} events
      </span>
    </div>
    <div style={{ marginTop: '12px', fontSize: '11px', color: selected ? LK.body : LK.body }}>
      开始 {formatTime(node.started_at || node.session_header?.timestamp as string | undefined)}
    </div>
  </button>
);

type GraphSnapshot = {
  childMap: Record<string, AppSaSessionIndexEdge[]>;
  orderedStages: StageSummary[];
};

const DetailedStageGraph: React.FC<{
  stage: StageSummary;
  nodeMap: Map<string, AppSaSessionIndexNode>;
  childMap: Map<string, AppSaSessionIndexEdge[]>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}> = ({ stage, nodeMap, childMap, selectedPath, onSelect }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
      <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Nodes</div>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.ink }}>{stage.items.length}</div>
      </div>
      <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Workers</div>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.info }}>{stage.workerCount + stage.subWorkerCount}</div>
      </div>
      <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Judges</div>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.warning }}>{stage.judgeCount}</div>
      </div>
      <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Parallel</div>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.ink }}>{stage.parallelGroupCount}</div>
      </div>
    </div>

    <div style={{ borderRadius: '24px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px', paddingBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Agent Graph</div>
      <div style={{ marginTop: '4px', fontSize: '14px', color: LK.body }}>展示该阶段内的智能体节点，以及派生出的并行 Judge / Sub Worker 关系。</div>

      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {stage.items.map((node, nodeIndex) => {
          const childEdges = (childMap.get(node.node_id) || []).filter((edge) => {
            const target = nodeMap.get(edge.target_node_id);
            return target && target.stage_key === stage.stageKey && (target.role === 'judge' || target.role === 'sub_worker');
          });
          const groupedChildren = childEdges.reduce<Map<string, AppSaSessionIndexNode[]>>((map, edge) => {
            const target = nodeMap.get(edge.target_node_id);
            if (!target) return map;
            const key = target.parallel_group ||`${target.role}:${edge.kind}`;
            const list = map.get(key) || [];
            list.push(target);
            map.set(key, list);
            return map;
          }, new Map());
          return (
            <div key={node.node_id}>
              {nodeIndex > 0 ? (
                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px', fontSize: '11px', fontWeight: 600, color: LK.muted }}>
                  <TimerReset size={12} />
                  同阶段推进
                </div>
              ) : null}
              <SessionNodeCard node={node} selected={selectedPath === node.relative_path} onSelect={onSelect} />

              {groupedChildren.size > 0 ? (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px' }}>
                  {Array.from(groupedChildren.entries()).map(([groupKey, children]) => (
                    <div key={groupKey} style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: 'rgba(24, 35, 58, 0.7)', paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>
                        <GitBranch size={12} />
                        {children[0]?.role === 'judge' ? '并列 Judge' : '并列 Sub Worker'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
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
  focusedStageKey?: string | null;
  sessionPreview?: {
    path: string | null;
    sessionMeta?: any;
    sessionHeader?: Record<string, any> | null;
    events: any[];
    loading?: boolean;
    live?: boolean;
    error?: string | null;
  };
}> = ({ index, selectedPath, onSelect, focusedStageKey, sessionPreview }) => {
  const [graph, setGraph] = useState<GraphSnapshot>({ childMap: {}, orderedStages: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const nodeMap = useMemo(() => new Map((index?.nodes || []).map((node) => [node.node_id, node])), [index]);
  useEffect(() => {
    const worker = new SessionRelationshipGraphWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GraphSnapshot>) => {
      setGraph(event.data || { childMap: {}, orderedStages: [] });
      setGraphLoading(false);
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!index) {
      setGraph({ childMap: {}, orderedStages: [] });
      setGraphLoading(false);
      return;
    }
    setGraphLoading(true);
    workerRef.current?.postMessage({ index });
  }, [index]);
  const normalizedFocusedStageKey = String(focusedStageKey || '').trim().toLowerCase();
  const [expandedStageKey, setExpandedStageKey] = useState<string | null>(null);
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);
  const effectiveExpandedStageKey =
    expandedStageKey ||
    graph.orderedStages.find((stage) => stage.stageKey === normalizedFocusedStageKey)?.stageKey ||
    null;
  const expandedStage = graph.orderedStages.find((stage) => stage.stageKey === effectiveExpandedStageKey) || null;
  const inspectedNode = inspectedPath
    ? index?.nodes?.find((node) => node.relative_path === inspectedPath) || null
    : null;
  const inspectedPreview = inspectedPath && sessionPreview?.path === inspectedPath ? sessionPreview : null;

  const handleInspectNode = (path: string) => {
    onSelect(path);
    setInspectedPath(path);
  };

  if (!index) {
    return (
      <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '40px', paddingBottom: '40px', textAlign: 'center', fontSize: '14px', color: LK.body }}>
        暂无可视化会话关系
      </div>
    );
  }

  if (graphLoading) {
    return (
      <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '40px', paddingBottom: '40px', textAlign: 'center', fontSize: '14px', color: LK.body }}>
        正在异步构建关系图...
      </div>
    );
  }

  if (graph.orderedStages.length === 0) {
    return (
      <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '40px', paddingBottom: '40px', textAlign: 'center', fontSize: '14px', color: LK.body }}>
        暂无可视化会话关系
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Session Count</div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.ink }}>{index.summary?.session_count ?? index.nodes.length}</div>
          </div>
          <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Stage Count</div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.info }}>{graph.orderedStages.length}</div>
          </div>
          <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Active</div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.primary }}>{index.summary?.active_session_count ?? 0}</div>
          </div>
          <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Index File</div>
            <div style={{ marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{index.index_path || '-'}</div>
          </div>
        </section>

        <section style={{ borderRadius: '24px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px', paddingBottom: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Stage Graph</div>
              <div style={{ marginTop: '4px', fontSize: '14px', color: LK.body }}>
                默认只展示阶段之间的推进关系，避免 500+ 智能体节点直接铺开；点击阶段卡片可全屏查看该阶段的智能体关系。
              </div>
            </div>
            <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '11px', color: LK.body }}>
              更新时间 {formatTime(index.generated_at)}
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {graph.orderedStages.map((stage, stageIndex) => (
              <div key={stage.stageKey}>
                {stageIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedStageKey(stage.stageKey)}
                    style={{ marginBottom: '16px', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.body, transition: 'all 0.2s', cursor: 'pointer' }}
                  >
                    <ArrowDown size={13} />
                    推进到下一阶段，点击查看阶段内智能体关系
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setExpandedStageKey(stage.stageKey)}
                  style={{ width: '100%', borderRadius: '16px', border: `1px solid ${stage.stageKey === normalizedFocusedStageKey ? LK.info : LK.borderSoft}`, padding: '16px', textAlign: 'left', transition: 'all 0.2s', backgroundColor: stage.stageKey === normalizedFocusedStageKey ? 'rgba(79, 140, 255, 0.15)' : LK.surfaceRaised, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Radar size={15} style={{ color: LK.info }} />
                        <div style={{ fontSize: '15px', fontWeight: 600, color: LK.ink }}>{stage.stageLabel}</div>
                        <span style={{ borderRadius: '9999px', border: `1px solid transparent`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontSize: '10px', fontWeight: 600, backgroundColor: 'transparent', color: LK.body }}>
                          {stage.activeCount > 0 ? '运行中' : stage.status}
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '12px', color: LK.body }}>
                        仅展示阶段摘要。点击后进入全屏视图查看智能体推进、并列 Judge / Sub Worker 关系。
                      </div>
                      {stage.stageKey === normalizedFocusedStageKey ? (
                        <div style={{ marginTop: '8px', display: 'inline-flex', borderRadius: '9999px', border: `1px solid ${LK.info}`, backgroundColor: LK.surfaceRaised, paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.info }}>
                          当前阶段聚焦
                        </div>
                      ) : null}
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '12px', fontWeight: 600, color: LK.body }}>
                      <Expand size={14} />
                      查看智能体关系
                    </span>
                  </div>

                  <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px' }}>
                    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>Nodes</div>
                      <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, color: LK.ink }}>{stage.items.length}</div>
                    </div>
                    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>Workers</div>
                      <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, color: LK.info }}>{stage.workerCount}</div>
                    </div>
                    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>Sub Workers</div>
                      <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, color: LK.primary }}>{stage.subWorkerCount}</div>
                    </div>
                    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>Judges</div>
                      <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, color: LK.warning }}>{stage.judgeCount}</div>
                    </div>
                    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '12px', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>Parallel Groups</div>
                      <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, color: LK.ink }}>{stage.parallelGroupCount}</div>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {expandedStage ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 260, backgroundColor: 'rgba(2, 6, 23, 0.7)', padding: '16px', backdropFilter: 'blur(4px)' }}>
 <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden', borderRadius: '32px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom:`1px solid ${LK.borderSoft}`, paddingLeft: '24px', paddingRight: '24px', paddingTop: '20px', paddingBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Agent Relationship</div>
                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.025em', color: LK.ink }}>{expandedStage.stageLabel}</div>
                <div style={{ marginTop: '8px', fontSize: '14px', color: LK.body }}>
                  当前查看阶段内的智能体推进与并列关系。选择节点后，下方任务详情中的会话查看器会同步切到对应会话。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedStageKey(null)}
                style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px', color: LK.body, transition: 'background-color 0.2s', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', paddingLeft: '24px', paddingRight: '24px', paddingTop: '24px', paddingBottom: '24px' }}>
              <DetailedStageGraph
                stage={expandedStage}
                nodeMap={nodeMap}
                childMap={new Map(Object.entries(graph.childMap))}
                selectedPath={selectedPath}
                onSelect={handleInspectNode}
              />
            </div>
          </div>
        </div>
      ) : null}

      {inspectedPath ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 280, backgroundColor: 'rgba(2, 6, 23, 0.7)', padding: '16px', backdropFilter: 'blur(4px)' }}>
 <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden', borderRadius: '32px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
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

            <div style={{ flex: 1, overflow: 'auto', paddingLeft: '24px', paddingRight: '24px', paddingTop: '24px', paddingBottom: '24px' }}>
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
