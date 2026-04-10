import React, { useMemo, useState } from 'react';
import { Background, Controls, Edge, Handle, MarkerType, MiniMap, Node, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RotateCcw } from 'lucide-react';
import { AiwfCard, AiwfEmpty, prettyJson } from './AiwfShared';

type WorkflowKind = 'atomic' | 'composite';

type AtomicWorkflow = {
  id: string;
  input_task_type?: string;
  output_task_type?: string;
  [key: string]: any;
};

type CompositeStage = {
  id?: string;
  stage_id?: string;
  workflow_kind?: WorkflowKind;
  workflow_type?: WorkflowKind;
  workflow_ref: string;
  sequence?: number;
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

type AtomicFlowSection = {
  id: string;
  title: string;
  mode: string;
  notes: string[];
};

type AtomicFlowStep = {
  id: string;
  title: string;
  subtitle: string;
  tone: 'plugin' | 'worker' | 'review' | 'output';
};

const STAGE_X_GAP = 300;
const STAGE_Y_GAP = 120;
const WORKFLOW_X_GAP = 360;

const StageNode: React.FC<any> = ({ data }) => (
  <div className="relative">
    <Handle id="left" type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#94a3b8' }} />
    <Handle id="right" type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#94a3b8' }} />
    <Handle id="bottom" type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#3b82f6' }} />
    {data?.label}
  </div>
);

const WorkflowNode: React.FC<any> = ({ data }) => (
  <div className="relative">
    <Handle id="left" type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#94a3b8' }} />
    <Handle id="top" type="target" position={Position.Top} style={{ width: 8, height: 8, background: '#3b82f6' }} />
    <Handle id="right" type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#94a3b8' }} />
    <Handle id="bottom" type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#3b82f6' }} />
    {data?.label}
  </div>
);

const nodeTypes = {
  stageNode: StageNode,
  workflowNode: WorkflowNode,
};

const getAtomicWorkflows = (definitionJson: Record<string, any>): AtomicWorkflow[] =>
  ((definitionJson.workflows?.atomic || definitionJson.atomic_workflows || []) as AtomicWorkflow[]).map((item) => ({
    ...item,
    input_task_type: item.input_task_type || `atomic:${item.id}:input`,
    output_task_type: item.output_task_type || `atomic:${item.id}:output`,
  }));

const getCompositeWorkflows = (definitionJson: Record<string, any>): CompositeWorkflow[] =>
  ((definitionJson.workflows?.composite || definitionJson.composite_workflows || []) as CompositeWorkflow[]).map((workflow) => ({
    ...workflow,
    stages: Array.isArray(workflow.stages)
      ? workflow.stages.map((stage: CompositeStage) => ({
          ...stage,
          id: stage.id || stage.stage_id,
          workflow_kind: (stage.workflow_kind || stage.workflow_type) as WorkflowKind,
        }))
      : [],
  }));

const getRootWorkflowId = (definitionJson: Record<string, any>): string =>
  String(definitionJson.execution?.entry_workflow || definitionJson.root_workflow_id || '');

const getPrePlugins = (atomic: AtomicWorkflow): string[] =>
  Array.isArray(atomic.start_plugins) ? atomic.start_plugins : Array.isArray(atomic.pre_plugins) ? atomic.pre_plugins : [];

const getPostPlugins = (atomic: AtomicWorkflow): string[] =>
  Array.isArray(atomic.end_plugins) ? atomic.end_plugins : Array.isArray(atomic.post_plugins) ? atomic.post_plugins : [];

const getReflectionPrompts = (atomic: AtomicWorkflow): Array<any> => {
  if (Array.isArray(atomic.roles?.worker?.prompts?.reflection)) return atomic.roles.worker.prompts.reflection;
  return Array.isArray(atomic.reflection_prompt_refs) ? atomic.reflection_prompt_refs : [];
};

const getGlobalReviewers = (atomic: AtomicWorkflow): Array<any> => {
  if (Array.isArray(atomic.roles?.advisors?.global_review)) return atomic.roles.advisors.global_review;
  return Array.isArray(atomic.advisor?.global_reviewers) ? atomic.advisor.global_reviewers : [];
};

const getResultReviewers = (atomic: AtomicWorkflow): Array<any> => {
  if (Array.isArray(atomic.roles?.advisors?.result_review)) return atomic.roles.advisors.result_review;
  return Array.isArray(atomic.advisor?.result_reviewers) ? atomic.advisor.result_reviewers : [];
};

const orderStages = (stages: CompositeStage[]): CompositeStage[] => {
  if (!stages.length) return [];
  if (stages.every((stage) => typeof stage.sequence === 'number')) {
    return [...stages].sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  }
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
    getAtomicWorkflows(definitionJson).map((item) => [item.id, item])
  );
  const compositeMap = new Map<string, CompositeWorkflow>(
    getCompositeWorkflows(definitionJson).map((item) => [item.id, item])
  );
  const rootId = getRootWorkflowId(definitionJson);
  if (!rootId || !compositeMap.has(rootId)) {
    return { nodes: [], edges: [], payloadByNodeId: {} };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const payloadByNodeId: Record<string, any> = {};
  const placed = new Set<string>();
  const nodePos = new Map<string, { x: number; y: number }>();
  let cursorY = 40;
  let defaultSelectedNodeId: string | undefined;

  const placeNode = (node: Node, payload: any) => {
    if (placed.has(node.id)) return;
    placed.add(node.id);
    nodes.push(node);
    nodePos.set(node.id, { x: node.position.x, y: node.position.y });
    payloadByNodeId[node.id] = payload;
    if (!defaultSelectedNodeId) defaultSelectedNodeId = node.id;
  };

  const ensureWorkflowNode = (
    kind: WorkflowKind,
    workflowId: string,
    depth: number,
    preferredPosition?: { x: number; y: number }
  ): string => {
    const nodeId = `wf:${kind}:${workflowId}`;
    if (placed.has(nodeId)) return nodeId;

    const y = preferredPosition?.y ?? cursorY;
    const x = preferredPosition?.x ?? depth * WORKFLOW_X_GAP + 20;
    if (!preferredPosition) cursorY += STAGE_Y_GAP;
    if (kind === 'atomic') {
      const atomic = atomicMap.get(workflowId);
      placeNode(
        {
          id: nodeId,
          type: 'workflowNode',
          position: { x, y },
          sourcePosition: 'right',
          targetPosition: 'top',
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
          type: 'workflowNode',
          position: { x, y },
          sourcePosition: 'right',
          targetPosition: 'top',
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

  const traverseComposite = (
    compositeId: string,
    depth: number,
    seenPath: Set<string>,
    preferredPosition?: { x: number; y: number }
  ) => {
    const compositeNodeId = ensureWorkflowNode('composite', compositeId, depth, preferredPosition);
    const composite = compositeMap.get(compositeId);
    if (!composite) return;
    if (seenPath.has(compositeId)) return;
    seenPath.add(compositeId);
    const compositePosition = nodePos.get(compositeNodeId) || { x: depth * WORKFLOW_X_GAP + 20, y: cursorY };

    const orderedStages = orderStages((composite.stages || []) as CompositeStage[]);
    const stageNodeIds: string[] = [];
    const stageBaseY = compositePosition.y;
    const stageStartX = compositePosition.x + STAGE_X_GAP;

    for (let i = 0; i < orderedStages.length; i += 1) {
      const stage = orderedStages[i];
      const stageNodeId = `stage:${compositeId}:${stage.id}`;
      stageNodeIds.push(stageNodeId);
      if (!placed.has(stageNodeId)) {
        placeNode(
          {
            id: stageNodeId,
            type: 'stageNode',
            position: { x: stageStartX + i * STAGE_X_GAP, y: stageBaseY },
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
    }
    if (orderedStages.length > 0) cursorY = Math.max(cursorY, stageBaseY + STAGE_Y_GAP + 20);

    if (stageNodeIds.length > 0) {
      edges.push({
        id: `edge:${compositeNodeId}:${stageNodeIds[0]}`,
        source: compositeNodeId,
        target: stageNodeIds[0],
        sourceHandle: 'right',
        targetHandle: 'left',
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { stroke: '#34d399', strokeWidth: 1.8 },
      });
    }

    for (let i = 0; i < stageNodeIds.length - 1; i += 1) {
      edges.push({
        id: `edge:${stageNodeIds[i]}:${stageNodeIds[i + 1]}`,
        source: stageNodeIds[i],
        target: stageNodeIds[i + 1],
        sourceHandle: 'right',
        targetHandle: 'left',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#94a3b8', strokeWidth: 1.6 },
      });
    }

    for (let i = 0; i < orderedStages.length; i += 1) {
      const stage = orderedStages[i];
      const stageNodeId = stageNodeIds[i];
      const targetNodeId = ensureWorkflowNode(stage.workflow_kind, stage.workflow_ref, depth + 2, {
        x: stageStartX + i * STAGE_X_GAP,
        y: stageBaseY + STAGE_Y_GAP + 44,
      });
      edges.push({
        id: `edge:${stageNodeId}:${targetNodeId}`,
        source: stageNodeId,
        target: targetNodeId,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#3b82f6', strokeWidth: 1.6, strokeDasharray: '4 3' },
      });
      if (stage.workflow_kind === 'composite' && compositeMap.has(stage.workflow_ref)) {
        const nestedPosition = nodePos.get(targetNodeId);
        traverseComposite(stage.workflow_ref, depth + 2, new Set(seenPath), nestedPosition);
      }
    }
  };

  traverseComposite(rootId, 0, new Set<string>());
  return { nodes, edges, payloadByNodeId, defaultSelectedNodeId };
};

const buildAtomicFlowSections = (atomic: AtomicWorkflow): AtomicFlowSection[] => {
  const prePlugins = getPrePlugins(atomic);
  const reflections = getReflectionPrompts(atomic);
  const globalReviewers = getGlobalReviewers(atomic);
  const resultReviewers = getResultReviewers(atomic);
  const postPlugins = getPostPlugins(atomic);

  const pluginStatusRules = [
    '`ok_next` / `error_continue`: 继续下一个插件',
    '`ok_end_stage`: 正常结束当前插件阶段',
    '`error_restart`: 重启当前原子工作流（受 `global.max_workflow_retry` 限制）',
    '`error_end_next_stage`: 异常结束当前阶段并进入下一阶段',
    '`error_exit`: 直接异常退出整个执行链',
  ];

  return [
    {
      id: 'pre-plugins',
      title: 'Pre Plugins',
      mode: '串行',
      notes: [
        prePlugins.length ? `执行顺序: ${prePlugins.join(' -> ')}` : '未配置 start_plugins，直接进入下一阶段',
        ...pluginStatusRules,
      ],
    },
    {
      id: 'worker',
      title: 'Worker 主执行',
      mode: '单智能体',
      notes: [
        `worker.agent_id = ${atomic.roles?.worker?.agent_id || atomic.worker?.agent_instance_id || '-'}`,
        `worker.new_session = ${String(atomic.roles?.worker?.new_session ?? true)}`,
        'Worker 通过多轮会话执行任务，完成后进入反思阶段',
      ],
    },
    {
      id: 'reflection',
      title: 'Worker Reflection',
      mode: '串行',
      notes: [
        reflections.length
          ? `反思 prompt 顺序: ${reflections.map((item: any) => item.id || item.prompt_file || String(item)).join(' -> ')}`
          : '未配置 reflection prompts，跳过反思阶段',
        '每一条 reflection 必须等待上一条完成',
      ],
    },
    {
      id: 'summary',
      title: 'Summary 产物',
      mode: '单次输出',
      notes: [
        `summary.prompt_file = ${atomic.roles?.worker?.prompts?.summary?.prompt_file || '-'}`,
        `summary.output_summary_filename = ${atomic.roles?.worker?.prompts?.summary?.output_summary_filename || 'summary.md'}`,
        `summary.output_results_dir = ${atomic.roles?.worker?.prompts?.summary?.output_results_dir || 'results'}`,
      ],
    },
    {
      id: 'global-review',
      title: 'Global Review',
      mode: '串行门禁',
      notes: [
        globalReviewers.length
          ? `reviewers: ${globalReviewers.map((r: any) => `${r.instance_id || r.id || '-'}(rerun=${r.re_review_on_cycle ?? r.rerun_on_next_round ?? true})`).join(', ')}`
          : '未配置 global reviewers，视为门禁直接通过',
        '任一 reviewer fail: 立即结束本轮，写入 review_feedback，回流 worker 进入下一轮',
      ],
    },
    {
      id: 'result-review',
      title: 'Result Review',
      mode: '结果间并行 + 结果内串行',
      notes: [
        resultReviewers.length
          ? `reviewers: ${resultReviewers.map((r: any) => `${r.instance_id || r.id || '-'}(rerun=${r.re_review_on_cycle ?? r.rerun_on_next_round ?? false})`).join(', ')}`
          : '未配置 result reviewers，跳过结果评审',
        '单个结果内某 reviewer fail: 该结果停止后续 reviewer，进入失败聚合',
        '默认 rerun=false 的通过结果会缓存，后续轮次跳过重评',
      ],
    },
    {
      id: 'post-plugins',
      title: 'Post Plugins',
      mode: '串行',
      notes: [
        postPlugins.length ? `执行顺序: ${postPlugins.join(' -> ')}` : '未配置 end_plugins，结束阶段直接收集输出',
        ...pluginStatusRules,
      ],
    },
    {
      id: 'builtin-next-task',
      title: 'Builtin Next Task Generator',
      mode: '固定末阶段',
      notes: [
        '常见配置是把 `next_task_generator` 放在 end_plugins 中',
        '插件会读取 summary/results 生成 output/next_tasks.json',
        '允许输出空任务清单（终态自然结束）',
      ],
    },
    {
      id: 'loop-and-retry',
      title: '回环与重启边界',
      mode: '控制规则',
      notes: [
        `engine.max_review_cycles = ${atomic.engine?.max_review_cycles ?? '-'}`,
        `global.max_workflow_retry = 继承全局配置`,
        `engine.max_worker_turns_per_cycle = ${atomic.engine?.max_worker_turns_per_cycle ?? '-'}`,
      ],
    },
  ];
};

const buildAtomicFlowSteps = (atomic: AtomicWorkflow): AtomicFlowStep[] => [
  {
    id: 'pre',
    title: 'Pre Plugins',
    subtitle: `${getPrePlugins(atomic).length} plugin(s)`,
    tone: 'plugin',
  },
  { id: 'worker', title: 'Worker', subtitle: '主执行', tone: 'worker' },
  {
    id: 'reflection',
    title: 'Reflection',
    subtitle: `${getReflectionPrompts(atomic).length} prompt(s)`,
    tone: 'worker',
  },
  { id: 'summary', title: 'Summary', subtitle: 'summary + results', tone: 'output' },
  {
    id: 'global-review',
    title: 'Global Review',
    subtitle: `${getGlobalReviewers(atomic).length} reviewer(s)`,
    tone: 'review',
  },
  {
    id: 'result-review',
    title: 'Result Review',
    subtitle: `${getResultReviewers(atomic).length} reviewer(s)`,
    tone: 'review',
  },
  {
    id: 'post',
    title: 'Post Plugins',
    subtitle: `${getPostPlugins(atomic).length} plugin(s)`,
    tone: 'plugin',
  },
  { id: 'next-task', title: 'Next Task Gen', subtitle: 'builtin', tone: 'output' },
  { id: 'done', title: 'Output Manifest', subtitle: 'next_tasks/manifest.json', tone: 'output' },
];

const toneCanvasStyle: Record<AtomicFlowStep['tone'], { border: string; background: string; width: number }> = {
  plugin: { border: '1px solid #ddd6fe', background: '#f5f3ff', width: 170 },
  worker: { border: '1px solid #bfdbfe', background: '#eff6ff', width: 170 },
  review: { border: '1px solid #fde68a', background: '#fffbeb', width: 170 },
  output: { border: '1px solid #a7f3d0', background: '#ecfdf5', width: 180 },
};

const buildCanvasGraphWithAtomicFlow = (
  base: BuildResult,
  expandedAtomicAnchorId: string | null,
  selectedAtomicDefinition: AtomicWorkflow | null
): { nodes: Node[]; edges: Edge[]; payloadByNodeId: Record<string, any> } => {
  if (!expandedAtomicAnchorId || !selectedAtomicDefinition) {
    return { nodes: base.nodes, edges: base.edges, payloadByNodeId: {} };
  }
  const anchor = base.nodes.find((item) => item.id === expandedAtomicAnchorId);
  if (!anchor) return { nodes: base.nodes, edges: base.edges, payloadByNodeId: {} };

  const steps = buildAtomicFlowSteps(selectedAtomicDefinition);
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const flowPayloadByNodeId: Record<string, any> = {};
  const adjustedBaseNodes = base.nodes.map((node) =>
    node.id === expandedAtomicAnchorId ? { ...node, sourcePosition: 'bottom' as const } : node
  );
  const startX = anchor.position.x;
  const startY = anchor.position.y + 250;
  const gapX = 215;
  const prefix = `atomic-flow:${selectedAtomicDefinition.id}:`;
  const boxId = `${prefix}box`;
  const boxX = startX - 24;
  const boxY = startY - 64;
  const boxWidth = Math.max(280, (steps.length - 1) * gapX + 204);
  const boxHeight = 176;

  flowNodes.push({
    id: boxId,
    type: 'default',
    position: { x: boxX, y: boxY },
    sourcePosition: 'bottom',
    targetPosition: 'top',
    style: {
      width: boxWidth,
      height: boxHeight,
      borderRadius: 14,
      border: '2px dashed #93c5fd',
      background: 'rgba(239, 246, 255, 0.32)',
      padding: 8,
    },
    data: {
      label: (
        <div className="text-[10px] font-black uppercase tracking-wider text-blue-700">
          Atomic Execution Flow
        </div>
      ),
    },
  });
  flowPayloadByNodeId[boxId] = {
    node_type: 'atomic_flow_group',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      workflow_id: selectedAtomicDefinition.id,
      step_count: steps.length,
      steps: steps.map((item) => ({ id: item.id, title: item.title, subtitle: item.subtitle })),
    },
  };

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const id = `${prefix}${step.id}`;
    flowNodes.push({
      id,
      type: 'default',
      position: { x: startX + i * gapX, y: startY },
      sourcePosition: 'right',
      targetPosition: 'left',
      style: {
        borderRadius: 12,
        padding: 10,
        ...toneCanvasStyle[step.tone],
      },
      data: {
        label: (
          <div>
            <div className="text-[11px] font-black text-slate-800">{step.title}</div>
            <div className="text-[10px] mt-1 text-slate-600">{step.subtitle}</div>
          </div>
        ),
      },
    });
    flowPayloadByNodeId[id] = {
      node_type: 'atomic_flow_step',
      workflow_kind: 'atomic',
      workflow_id: selectedAtomicDefinition.id,
      definition: {
        step_id: step.id,
        step_title: step.title,
        step_subtitle: step.subtitle,
        step_tone: step.tone,
      },
    };
    if (i > 0) {
      flowEdges.push({
        id: `edge:${prefix}${steps[i - 1].id}:${id}`,
        source: `${prefix}${steps[i - 1].id}`,
        target: id,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#64748b', strokeWidth: 1.6 },
      });
    }
  }

  if (steps.length > 0) {
    flowEdges.push({
      id: `edge:${anchor.id}:${boxId}`,
      source: anchor.id,
      target: boxId,
      sourceHandle: 'bottom',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: '#3b82f6', strokeWidth: 1.6, strokeDasharray: '5 4' },
    });
  }

  const prePlugins = getPrePlugins(selectedAtomicDefinition);
  const postPlugins = getPostPlugins(selectedAtomicDefinition);
  const globalReviewers = getGlobalReviewers(selectedAtomicDefinition);
  const resultReviewers = getResultReviewers(selectedAtomicDefinition);

  const listHeight = (count: number) => 46 + Math.max(count, 1) * 44;

  const pluginGroupX = startX - 20;
  const pluginGroupY = startY + 210;
  const preBoxHeight = listHeight(prePlugins.length);
  const postBoxHeight = listHeight(postPlugins.length);
  const pluginGroupWidth = 270;
  const pluginGroupHeight = preBoxHeight + postBoxHeight + 86;
  const pluginGroupId = `${prefix}plugins-group`;
  const preBoxId = `${prefix}plugins-pre`;
  const postBoxId = `${prefix}plugins-post`;

  flowNodes.push({
    id: pluginGroupId,
    type: 'default',
    position: { x: pluginGroupX, y: pluginGroupY },
    style: {
      width: pluginGroupWidth,
      height: pluginGroupHeight,
      borderRadius: 14,
      border: '2px dashed #a78bfa',
      background: 'rgba(245, 243, 255, 0.45)',
      padding: 10,
    },
    data: {
      label: <div className="text-[10px] font-black uppercase tracking-wider text-violet-700">Plugins</div>,
    },
  });
  flowPayloadByNodeId[pluginGroupId] = {
    node_type: 'plugin_group',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      start_plugins: prePlugins,
      end_plugins: postPlugins,
    },
  };

  flowNodes.push({
    id: preBoxId,
    type: 'default',
    position: { x: pluginGroupX + 14, y: pluginGroupY + 30 },
    sourcePosition: 'bottom',
    targetPosition: 'top',
    style: {
      width: pluginGroupWidth - 28,
      height: preBoxHeight,
      borderRadius: 10,
      border: '1px dashed #c4b5fd',
      background: '#ffffff',
      padding: 8,
    },
    data: {
      label: <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Pre Plugins</div>,
    },
  });
  flowPayloadByNodeId[preBoxId] = {
    node_type: 'plugin_scope',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      scope: 'start_plugins',
      plugins: prePlugins,
    },
  };

  flowNodes.push({
    id: postBoxId,
    type: 'default',
    position: { x: pluginGroupX + 14, y: pluginGroupY + 44 + preBoxHeight },
    sourcePosition: 'bottom',
    targetPosition: 'top',
    style: {
      width: pluginGroupWidth - 28,
      height: postBoxHeight,
      borderRadius: 10,
      border: '1px dashed #c4b5fd',
      background: '#ffffff',
      padding: 8,
    },
    data: {
      label: <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Post Plugins</div>,
    },
  });
  flowPayloadByNodeId[postBoxId] = {
    node_type: 'plugin_scope',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      scope: 'end_plugins',
      plugins: postPlugins,
    },
  };

  const renderPluginNodes = (plugins: string[], scopePrefix: string, baseX: number, baseY: number) => {
    const items = plugins.length > 0 ? plugins : ['(none)'];
    for (let i = 0; i < items.length; i += 1) {
      const pid = `${scopePrefix}:${i}`;
      flowNodes.push({
        id: pid,
        type: 'default',
        position: { x: baseX, y: baseY + i * 40 },
        sourcePosition: 'bottom',
        targetPosition: 'top',
        style: {
          width: pluginGroupWidth - 52,
          borderRadius: 8,
          border: '1px solid #ddd6fe',
          background: '#f5f3ff',
          padding: 8,
        },
        data: { label: <div className="text-[10px] text-slate-700 break-all">{items[i]}</div> },
      });
      flowPayloadByNodeId[pid] = {
        node_type: 'plugin_item',
        workflow_kind: 'atomic',
        workflow_id: selectedAtomicDefinition.id,
        definition: {
          plugin_id: items[i],
          scope: scopePrefix.includes('pre') ? 'start_plugins' : 'end_plugins',
        },
      };
      if (i > 0) {
        flowEdges.push({
          id: `edge:${scopePrefix}:${i - 1}:${i}`,
          source: `${scopePrefix}:${i - 1}`,
          target: pid,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { stroke: '#8b5cf6', strokeWidth: 1.2 },
        });
      }
    }
  };

  renderPluginNodes(prePlugins, `${prefix}pre-plugin`, pluginGroupX + 26, pluginGroupY + 56);
  renderPluginNodes(postPlugins, `${prefix}post-plugin`, pluginGroupX + 26, pluginGroupY + 70 + preBoxHeight);

  const reviewGroupX = startX + 4 * gapX - 10;
  const reviewGroupY = startY + 210;
  const globalBoxHeight = listHeight(globalReviewers.length);
  const resultBoxHeight = listHeight(resultReviewers.length);
  const reviewGroupWidth = 290;
  const reviewGroupHeight = globalBoxHeight + resultBoxHeight + 86;
  const reviewGroupId = `${prefix}review-group`;
  const globalBoxId = `${prefix}review-global`;
  const resultBoxId = `${prefix}review-result`;

  flowNodes.push({
    id: reviewGroupId,
    type: 'default',
    position: { x: reviewGroupX, y: reviewGroupY },
    style: {
      width: reviewGroupWidth,
      height: reviewGroupHeight,
      borderRadius: 14,
      border: '2px dashed #f59e0b',
      background: 'rgba(255, 251, 235, 0.58)',
      padding: 10,
    },
    data: {
      label: <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Review Advisors</div>,
    },
  });
  flowPayloadByNodeId[reviewGroupId] = {
    node_type: 'review_group',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      global_reviewers: globalReviewers,
      result_reviewers: resultReviewers,
    },
  };

  flowNodes.push({
    id: globalBoxId,
    type: 'default',
    position: { x: reviewGroupX + 14, y: reviewGroupY + 30 },
    sourcePosition: 'bottom',
    targetPosition: 'top',
    style: {
      width: reviewGroupWidth - 28,
      height: globalBoxHeight,
      borderRadius: 10,
      border: '1px dashed #fcd34d',
      background: '#ffffff',
      padding: 8,
    },
    data: {
      label: <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Global Reviewers</div>,
    },
  });
  flowPayloadByNodeId[globalBoxId] = {
    node_type: 'review_scope',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      scope: 'global_reviewers',
      reviewers: globalReviewers,
    },
  };

  flowNodes.push({
    id: resultBoxId,
    type: 'default',
    position: { x: reviewGroupX + 14, y: reviewGroupY + 44 + globalBoxHeight },
    sourcePosition: 'bottom',
    targetPosition: 'top',
    style: {
      width: reviewGroupWidth - 28,
      height: resultBoxHeight,
      borderRadius: 10,
      border: '1px dashed #fcd34d',
      background: '#ffffff',
      padding: 8,
    },
    data: {
      label: <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Result Reviewers</div>,
    },
  });
  flowPayloadByNodeId[resultBoxId] = {
    node_type: 'review_scope',
    workflow_kind: 'atomic',
    workflow_id: selectedAtomicDefinition.id,
    definition: {
      scope: 'result_reviewers',
      reviewers: resultReviewers,
    },
  };

  const renderReviewerNodes = (reviewers: any[], scopePrefix: string, baseX: number, baseY: number, scope: string) => {
    const items = reviewers.length > 0 ? reviewers : [{ id: '(none)', agent_instance_id: '-', user_prompt_ref: '-' }];
    for (let i = 0; i < items.length; i += 1) {
      const reviewer = items[i] || {};
      const rid = `${scopePrefix}:${i}`;
      flowNodes.push({
        id: rid,
        type: 'default',
        position: { x: baseX, y: baseY + i * 40 },
        sourcePosition: 'bottom',
        targetPosition: 'top',
        style: {
          width: reviewGroupWidth - 52,
          borderRadius: 8,
          border: '1px solid #fde68a',
          background: '#fffbeb',
          padding: 8,
        },
        data: {
          label: (
            <div>
              <div className="text-[10px] font-bold text-slate-800 break-all">{reviewer.instance_id || reviewer.id || '(anonymous reviewer)'}</div>
              <div className="text-[10px] text-slate-600 mt-0.5 break-all">{reviewer.agent_id || reviewer.agent_instance_id || '-'}</div>
            </div>
          ),
        },
      });
      flowPayloadByNodeId[rid] = {
        node_type: 'review_item',
        workflow_kind: 'atomic',
        workflow_id: selectedAtomicDefinition.id,
        definition: {
          scope,
          reviewer,
        },
      };
      if (i > 0) {
        flowEdges.push({
          id: `edge:${scopePrefix}:${i - 1}:${i}`,
          source: `${scopePrefix}:${i - 1}`,
          target: rid,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { stroke: '#d97706', strokeWidth: 1.2 },
        });
      }
    }
  };

  renderReviewerNodes(globalReviewers, `${prefix}global-reviewer`, reviewGroupX + 26, reviewGroupY + 56, 'global_reviewers');
  renderReviewerNodes(
    resultReviewers,
    `${prefix}result-reviewer`,
    reviewGroupX + 26,
    reviewGroupY + 70 + globalBoxHeight,
    'result_reviewers'
  );

  const preStepId = `${prefix}pre`;
  const postStepId = `${prefix}post`;
  const globalStepId = `${prefix}global-review`;
  const resultStepId = `${prefix}result-review`;

  flowEdges.push({
    id: `edge:${preStepId}:${preBoxId}`,
    source: preStepId,
    target: preBoxId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: '#8b5cf6', strokeWidth: 1.3, strokeDasharray: '4 3' },
  });
  flowEdges.push({
    id: `edge:${postStepId}:${postBoxId}`,
    source: postStepId,
    target: postBoxId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: '#8b5cf6', strokeWidth: 1.3, strokeDasharray: '4 3' },
  });
  flowEdges.push({
    id: `edge:${globalStepId}:${globalBoxId}`,
    source: globalStepId,
    target: globalBoxId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: '#d97706', strokeWidth: 1.3, strokeDasharray: '4 3' },
  });
  flowEdges.push({
    id: `edge:${resultStepId}:${resultBoxId}`,
    source: resultStepId,
    target: resultBoxId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: '#d97706', strokeWidth: 1.3, strokeDasharray: '4 3' },
  });

  const workerId = `${prefix}worker`;
  const globalReviewId = `${prefix}global-review`;
  const resultReviewId = `${prefix}result-review`;
  const workerExists = flowNodes.some((n) => n.id === workerId);
  const globalExists = flowNodes.some((n) => n.id === globalReviewId);
  const resultExists = flowNodes.some((n) => n.id === resultReviewId);
  if (workerExists && globalExists) {
    flowEdges.push({
      id: `edge:${globalReviewId}:${workerId}:loop`,
      source: globalReviewId,
      target: workerId,
      label: 'global fail 回流',
      labelStyle: { fontSize: 10, fill: '#b45309', fontWeight: 700 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { stroke: '#f59e0b', strokeWidth: 1.4, strokeDasharray: '3 3' },
    });
  }
  if (workerExists && resultExists) {
    flowEdges.push({
      id: `edge:${resultReviewId}:${workerId}:loop`,
      source: resultReviewId,
      target: workerId,
      label: 'result fail 回流',
      labelStyle: { fontSize: 10, fill: '#b45309', fontWeight: 700 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { stroke: '#f59e0b', strokeWidth: 1.4, strokeDasharray: '3 3' },
    });
  }

  return {
    nodes: [...adjustedBaseNodes, ...flowNodes],
    edges: [...base.edges, ...flowEdges],
    payloadByNodeId: flowPayloadByNodeId,
  };
};

export const AiwfWorkflowGraphPreview: React.FC<{
  definitionJson?: Record<string, any> | null;
}> = ({ definitionJson }) => {
  const graph = useMemo(() => buildWorkflowGraph(definitionJson), [definitionJson]);
  const [focusedPayloadNodeId, setFocusedPayloadNodeId] = useState<string | null>(null);
  const [expandedAtomicAnchorId, setExpandedAtomicAnchorId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['worker', 'global-review']));
  const selectedAtomicDefinition = useMemo(() => {
    if (!expandedAtomicAnchorId) return null;
    const payload = graph.payloadByNodeId[expandedAtomicAnchorId];
    if (payload?.node_type === 'workflow' && payload?.workflow_kind === 'atomic') {
      return payload.definition as AtomicWorkflow;
    }
    return null;
  }, [expandedAtomicAnchorId, graph.payloadByNodeId]);
  const canvasGraph = useMemo(
    () => buildCanvasGraphWithAtomicFlow(graph, expandedAtomicAnchorId, selectedAtomicDefinition),
    [graph, expandedAtomicAnchorId, selectedAtomicDefinition]
  );
  const mergedPayloadByNodeId = useMemo(
    () => ({ ...graph.payloadByNodeId, ...canvasGraph.payloadByNodeId }),
    [graph.payloadByNodeId, canvasGraph.payloadByNodeId]
  );
  const effectiveNodeId = (focusedPayloadNodeId && mergedPayloadByNodeId[focusedPayloadNodeId]
    ? focusedPayloadNodeId
    : graph.defaultSelectedNodeId) || null;
  const selectedPayload = effectiveNodeId ? mergedPayloadByNodeId[effectiveNodeId] : null;
  const atomicSections = useMemo(
    () => (selectedAtomicDefinition ? buildAtomicFlowSections(selectedAtomicDefinition) : []),
    [selectedAtomicDefinition]
  );
  const atomicSteps = useMemo(
    () => (selectedAtomicDefinition ? buildAtomicFlowSteps(selectedAtomicDefinition) : []),
    [selectedAtomicDefinition]
  );
  const atomicFlowExpanded = Boolean(expandedAtomicAnchorId);
  const selectedLabel = useMemo(() => {
    if (!selectedPayload) return '';
    if (selectedPayload.node_type === 'stage') return `Stage: ${selectedPayload.stage_id}`;
    if (selectedPayload.node_type === 'workflow') return `${selectedPayload.workflow_kind} workflow: ${selectedPayload.workflow_id}`;
    if (selectedPayload.node_type === 'plugin_group') return 'Atomic Plugins Group';
    if (selectedPayload.node_type === 'plugin_scope')
      return `Plugin Scope: ${selectedPayload.definition?.scope || 'unknown'}`;
    if (selectedPayload.node_type === 'plugin_item') return `Plugin: ${selectedPayload.definition?.plugin_id || 'unknown'}`;
    if (selectedPayload.node_type === 'review_group') return 'Atomic Review Group';
    if (selectedPayload.node_type === 'review_scope')
      return `Review Scope: ${selectedPayload.definition?.scope || 'unknown'}`;
    if (selectedPayload.node_type === 'review_item')
      return `Reviewer: ${selectedPayload.definition?.reviewer?.id || 'unknown'}`;
    if (selectedPayload.node_type === 'atomic_flow_step') return `Atomic Step: ${selectedPayload.definition?.step_title || ''}`;
    if (selectedPayload.node_type === 'atomic_flow_group') return 'Atomic Execution Flow';
    return 'Node Detail';
  }, [selectedPayload]);

  if (graph.nodes.length === 0) {
    return (
      <AiwfCard className="p-6">
        <AiwfEmpty title="暂无流程图" description="当前版本 definition JSON 无法解析为可视化流程图，请检查 execution.entry_workflow 与 workflow 引用。" />
      </AiwfCard>
    );
  }

  return (
    <AiwfCard className="overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),300px] min-h-[560px]">
        <div className="h-full min-h-[560px] bg-slate-50">
          <ReactFlow
            nodes={canvasGraph.nodes}
            edges={canvasGraph.edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              const payload = mergedPayloadByNodeId[node.id];
              const isAtomicWorkflowNode = payload?.node_type === 'workflow' && payload?.workflow_kind === 'atomic';
              if (isAtomicWorkflowNode) {
                if (expandedAtomicAnchorId === node.id) {
                  setExpandedAtomicAnchorId(null);
                } else {
                  setExpandedAtomicAnchorId(node.id);
                }
              }
              if (payload) {
                setFocusedPayloadNodeId(node.id);
              }
            }}
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{selectedLabel}</div>
              {selectedAtomicDefinition && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                  <button
                    onClick={() => {
                      if (expandedAtomicAnchorId === focusedPayloadNodeId) {
                        setExpandedAtomicAnchorId(null);
                      } else if (focusedPayloadNodeId) {
                        setExpandedAtomicAnchorId(focusedPayloadNodeId);
                      }
                    }}
                    className="w-full text-left flex items-center justify-between"
                  >
                    <div className="text-xs font-black tracking-widest uppercase text-blue-700">原子工作流执行流程</div>
                    <span className="text-xs font-bold text-blue-700">{atomicFlowExpanded ? '已展开' : '展开'}</span>
                  </button>
                  {atomicFlowExpanded && (
                    <div className="mt-2 space-y-2 max-h-[320px] overflow-auto pr-1">
                      <div className="rounded-lg border border-blue-100 bg-white p-3">
                        <div className="text-[11px] font-black tracking-widest uppercase text-blue-700 mb-2">执行步骤</div>
                        <div className="grid grid-cols-1 gap-1">
                          {atomicSteps.map((step, idx) => (
                            <div key={step.id} className="text-[11px] text-slate-600">
                              {idx + 1}. {step.title} ({step.subtitle})
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1">
                          <div className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                            <RotateCcw size={12} className="text-amber-600" />
                            Global Review fail: 回流 Worker 进入下一轮
                          </div>
                          <div className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                            <RotateCcw size={12} className="text-amber-600" />
                            Result Review fail: 聚合反馈后回流 Worker
                          </div>
                        </div>
                      </div>
                      {atomicSections.map((section, index) => {
                        const opened = expandedSections.has(section.id);
                        return (
                          <div key={section.id} className="rounded-lg border border-blue-100 bg-white">
                            <button
                              onClick={() =>
                                setExpandedSections((prev) => {
                                  const next = new Set(prev);
                                  next.add(section.id);
                                  return next;
                                })
                              }
                              className="w-full px-3 py-2 flex items-center justify-between"
                            >
                              <div className="text-xs font-bold text-slate-800">
                                {index + 1}. {section.title}
                                <span className="ml-2 text-[11px] text-slate-500">({section.mode})</span>
                              </div>
                              <span className="text-[11px] text-slate-500">{opened ? '隐藏' : '查看'}</span>
                            </button>
                            {opened && (
                              <div className="px-3 pb-3 space-y-1">
                                {section.notes.map((note, noteIndex) => (
                                  <div key={`${section.id}-${noteIndex}`} className="text-[11px] text-slate-600">
                                    - {note}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <pre className="w-full min-h-[300px] max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 text-slate-100 p-3 text-xs leading-5">
                {prettyJson(selectedPayload.definition || {})}
              </pre>
            </div>
          )}
        </div>
      </div>
    </AiwfCard>
  );
};
