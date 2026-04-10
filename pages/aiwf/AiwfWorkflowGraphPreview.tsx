import React, { useMemo, useState } from 'react';
import { Background, Controls, Edge, MarkerType, MiniMap, Node, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AiwfCard, AiwfEmpty, prettyJson } from './AiwfShared';

type WorkflowKind = 'atomic' | 'composite';

type AtomicWorkflow = {
  id: string;
  input_task_type?: string;
  output_task_type?: string;
  [key: string]: any;
};

type CompositeStage = {
  id: string;
  workflow_kind: WorkflowKind;
  workflow_ref: string;
  previous_stage_id?: string | null;
  next_stage_id?: string | null;
  [key: string]: any;
};

type CompositeWorkflow = {
  id: string;
  stages?: CompositeStage[];
  [key: string]: any;
};

type BuildResult = {
  nodes: Node[];
  edges: Edge[];
  defaultSelectedNodeId?: string;
  payloadByNodeId: Record<string, any>;
};

const STAGE_X_GAP = 300;
const STAGE_Y_GAP = 120;
const WORKFLOW_X_GAP = 360;

const orderStages = (stages: CompositeStage[]): CompositeStage[] => {
  if (!stages.length) return [];
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered: CompositeStage[] = [];
  const visited = new Set<string>();
  const heads = stages.filter((s) => !s.previous_stage_id || !byId.has(s.previous_stage_id));
  const queue = heads.length > 0 ? heads : [stages[0]];

  for (const head of queue) {
    let current: CompositeStage | undefined = head;
    while (current && !visited.has(current.id)) {
      ordered.push(current);
      visited.add(current.id);
      current = current.next_stage_id ? byId.get(current.next_stage_id) : undefined;
    }
  }
  for (const stage of stages) {
    if (!visited.has(stage.id)) ordered.push(stage);
  }
  return ordered;
};

const buildWorkflowGraph = (definitionJson: Record<string, any> | null | undefined): BuildResult => {
  if (!definitionJson || typeof definitionJson !== 'object') {
    return { nodes: [], edges: [], payloadByNodeId: {} };
  }

  const atomicMap = new Map<string, AtomicWorkflow>(
    ((definitionJson.atomic_workflows || []) as AtomicWorkflow[]).map((item) => [item.id, item])
  );
  const compositeMap = new Map<string, CompositeWorkflow>(
    ((definitionJson.composite_workflows || []) as CompositeWorkflow[]).map((item) => [item.id, item])
  );
  const rootId = String(definitionJson.root_workflow_id || '');
  if (!rootId || !compositeMap.has(rootId)) {
    return { nodes: [], edges: [], payloadByNodeId: {} };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const payloadByNodeId: Record<string, any> = {};
  const placed = new Set<string>();
  let cursorY = 40;
  let defaultSelectedNodeId: string | undefined;

  const placeNode = (node: Node, payload: any) => {
    if (placed.has(node.id)) return;
    placed.add(node.id);
    nodes.push(node);
    payloadByNodeId[node.id] = payload;
    if (!defaultSelectedNodeId) defaultSelectedNodeId = node.id;
  };

  const ensureWorkflowNode = (kind: WorkflowKind, workflowId: string, depth: number): string => {
    const nodeId = `wf:${kind}:${workflowId}`;
    if (placed.has(nodeId)) return nodeId;

    const y = cursorY;
    cursorY += STAGE_Y_GAP;
    const x = depth * WORKFLOW_X_GAP + 20;
    if (kind === 'atomic') {
      const atomic = atomicMap.get(workflowId);
      placeNode(
        {
          id: nodeId,
          type: 'default',
          position: { x, y },
          sourcePosition: 'right',
          targetPosition: 'left',
          style: {
            borderRadius: 14,
            border: '1px solid #bfdbfe',
            background: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)',
            width: 260,
            padding: 10,
          },
          data: {
            label: (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-blue-600 font-bold">Atomic</div>
                <div className="font-black text-slate-800 mt-1 break-all">{workflowId}</div>
                <div className="text-[11px] text-slate-600 mt-2">
                  {atomic?.input_task_type || '-'} → {atomic?.output_task_type || '-'}
                </div>
              </div>
            ),
          },
        },
        { node_type: 'workflow', workflow_kind: kind, workflow_id: workflowId, definition: atomic || null }
      );
    } else {
      const composite = compositeMap.get(workflowId);
      placeNode(
        {
          id: nodeId,
          type: 'default',
          position: { x, y },
          sourcePosition: 'right',
          targetPosition: 'left',
          style: {
            borderRadius: 14,
            border: '1px solid #a7f3d0',
            background: 'linear-gradient(145deg, #ecfdf5 0%, #dcfce7 100%)',
            width: 280,
            padding: 10,
          },
          data: {
            label: (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold">Composite</div>
                <div className="font-black text-slate-800 mt-1 break-all">{workflowId}</div>
                <div className="text-[11px] text-slate-600 mt-2">stages: {composite?.stages?.length || 0}</div>
              </div>
            ),
          },
        },
        { node_type: 'workflow', workflow_kind: kind, workflow_id: workflowId, definition: composite || null }
      );
    }
    return nodeId;
  };

  const traverseComposite = (compositeId: string, depth: number, seenPath: Set<string>) => {
    const compositeNodeId = ensureWorkflowNode('composite', compositeId, depth);
    const composite = compositeMap.get(compositeId);
    if (!composite) return;
    if (seenPath.has(compositeId)) return;
    seenPath.add(compositeId);

    const orderedStages = orderStages((composite.stages || []) as CompositeStage[]);
    const stageNodeIds: string[] = [];
    let stageY = cursorY;

    for (const stage of orderedStages) {
      const stageNodeId = `stage:${compositeId}:${stage.id}`;
      stageNodeIds.push(stageNodeId);
      if (!placed.has(stageNodeId)) {
        placeNode(
          {
            id: stageNodeId,
            type: 'default',
            position: { x: depth * WORKFLOW_X_GAP + STAGE_X_GAP, y: stageY },
            sourcePosition: 'right',
            targetPosition: 'left',
            style: {
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              width: 280,
              padding: 10,
            },
            data: {
              label: (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Stage</div>
                  <div className="font-black text-slate-800 mt-1 break-all">{stage.id}</div>
                  <div className="text-[11px] text-slate-600 mt-2">
                    {stage.workflow_kind} → {stage.workflow_ref}
                  </div>
                </div>
              ),
            },
          },
          { node_type: 'stage', composite_id: compositeId, stage_id: stage.id, definition: stage }
        );
      }
      stageY += STAGE_Y_GAP;
    }
    if (orderedStages.length > 0) cursorY = Math.max(cursorY, stageY + 20);

    if (stageNodeIds.length > 0) {
      edges.push({
        id: `edge:${compositeNodeId}:${stageNodeIds[0]}`,
        source: compositeNodeId,
        target: stageNodeIds[0],
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { stroke: '#34d399', strokeWidth: 1.8 },
      });
    }

    for (let i = 0; i < stageNodeIds.length - 1; i += 1) {
      edges.push({
        id: `edge:${stageNodeIds[i]}:${stageNodeIds[i + 1]}`,
        source: stageNodeIds[i],
        target: stageNodeIds[i + 1],
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#94a3b8', strokeWidth: 1.6 },
      });
    }

    for (let i = 0; i < orderedStages.length; i += 1) {
      const stage = orderedStages[i];
      const stageNodeId = stageNodeIds[i];
      const targetNodeId = ensureWorkflowNode(stage.workflow_kind, stage.workflow_ref, depth + 2);
      edges.push({
        id: `edge:${stageNodeId}:${targetNodeId}`,
        source: stageNodeId,
        target: targetNodeId,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#3b82f6', strokeWidth: 1.6, strokeDasharray: '4 3' },
      });
      if (stage.workflow_kind === 'composite' && compositeMap.has(stage.workflow_ref)) {
        traverseComposite(stage.workflow_ref, depth + 2, new Set(seenPath));
      }
    }
  };

  traverseComposite(rootId, 0, new Set<string>());
  return { nodes, edges, payloadByNodeId, defaultSelectedNodeId };
};

export const AiwfWorkflowGraphPreview: React.FC<{
  definitionJson?: Record<string, any> | null;
}> = ({ definitionJson }) => {
  const graph = useMemo(() => buildWorkflowGraph(definitionJson), [definitionJson]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const effectiveNodeId = selectedNodeId || graph.defaultSelectedNodeId || null;
  const selectedPayload = effectiveNodeId ? graph.payloadByNodeId[effectiveNodeId] : null;

  if (graph.nodes.length === 0) {
    return (
      <AiwfCard className="p-6">
        <AiwfEmpty title="暂无流程图" description="当前版本 definition JSON 无法解析为可视化流程图，请检查 root_workflow_id 与 workflow 引用。" />
      </AiwfCard>
    );
  }

  return (
    <AiwfCard className="overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),340px] min-h-[560px]">
        <div className="h-[560px] bg-slate-50">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background gap={20} color="#e2e8f0" />
          </ReactFlow>
        </div>
        <div className="border-l border-slate-200 p-4 bg-white">
          {!selectedPayload ? (
            <AiwfEmpty title="节点详情" description="点击左侧流程图中的节点，查看对应定义。" />
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-black tracking-widest uppercase text-slate-500">节点定义</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {selectedPayload.node_type === 'stage'
                  ? `Stage: ${selectedPayload.stage_id}`
                  : `${selectedPayload.workflow_kind} workflow: ${selectedPayload.workflow_id}`}
              </div>
              <pre className="w-full min-h-[420px] max-h-[470px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 text-slate-100 p-3 text-xs leading-5">
                {prettyJson(selectedPayload.definition || {})}
              </pre>
            </div>
          )}
        </div>
      </div>
    </AiwfCard>
  );
};

