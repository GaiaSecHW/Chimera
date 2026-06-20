import type { AppSaSessionIndex, AppSaSessionIndexEdge, AppSaSessionIndexNode } from '../../../types/types';

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

function buildStageStatus(items: AppSaSessionIndexNode[]) {
  if (items.some((item) => item.is_active || item.status === 'running')) return 'running';
  if (items.some((item) => item.status === 'blocked')) return 'blocked';
  if (items.some((item) => item.status === 'waiting')) return 'waiting';
  return 'completed';
}

function buildGraph(index: AppSaSessionIndex | null) {
  const nodes = index?.nodes || [];
  const edges = index?.edges || [];
  const childMap: Record<string, AppSaSessionIndexEdge[]> = {};
  for (const edge of edges) {
    childMap[edge.source_node_id] = childMap[edge.source_node_id] || [];
    childMap[edge.source_node_id].push(edge);
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
  self.postMessage({
    orderedStages,
    childMap,
  });
}

self.onmessage = (event: MessageEvent<{ index: AppSaSessionIndex | null }>) => {
  buildGraph(event.data.index);
};
