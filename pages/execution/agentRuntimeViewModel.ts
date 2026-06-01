import type {
  AgentPodRuntimeSnapshot,
  AgentRuntimeAggregateSummary,
  AppDfaClusterCapacity,
  AppSaClusterCapacity,
  EntryAnalyseSlotClusterSummary,
} from '../../types/types';

export type UnifiedAgentPodCard = {
  pod_name: string;
  worker_id: string;
  pod_ip: string | null;
  healthy: boolean;
  slot_source: 'slot' | 'agent' | 'merged';
  mismatch: 'none' | 'slot_only' | 'agent_only';
  max_concurrent_jobs: number;
  running_jobs: number;
  available_slots: number;
  queued_jobs: number;
  active_task_count: number;
  agent_process_limit: number;
  agent_process_in_use: number;
  agent_process_available: number;
  agent_waiting_requests: number;
  agent_rss_total_bytes: number;
  process_count: number;
  tracked_process_count: number;
  residual_process_count: number;
  unknown_process_count: number;
  running_task_count: number;
  task_count: number;
  source: string;
  last_heartbeat_at: string | null;
  last_scanned_at: number | null;
  scan_errors: number;
  error: string | null;
};

export type UnifiedAgentRuntimeViewModel = {
  podCards: UnifiedAgentPodCard[];
  totalPods: number;
  healthyPods: number;
  totalCapacity: number;
  busySlots: number;
  availableSlots: number;
  queuedJobs: number;
  agentTotalCapacity: number;
  agentInUse: number;
  agentAvailable: number;
  agentWaitingRequests: number;
  agentRssTotalBytes: number;
  slotOnlyPods: number;
  agentOnlyPods: number;
  totalProcesses: number;
  trackedProcesses: number;
  residualProcesses: number;
  unknownProcesses: number;
  runningTasks: number;
  ownedTasks: number;
  aggregatePartial: boolean;
  aggregateSources: number | null;
  aggregateFanoutErrors: number | null;
  aggregateFailedTargetCount: number;
  aggregateAllSourcesFailed: boolean;
  scannedAt: number | null;
};

export const buildUnifiedAgentRuntimeViewModel = ({
  slotWorkers,
  runtimeSummary,
  agentPods,
}: {
  slotWorkers: Array<
    Partial<AppSaClusterCapacity['workers'][number]> |
    Partial<AppDfaClusterCapacity['workers'][number]> |
    Partial<EntryAnalyseSlotClusterSummary['workers'][number]>
  >;
  runtimeSummary: AgentRuntimeAggregateSummary | null;
  agentPods: AgentPodRuntimeSnapshot[];
}): UnifiedAgentRuntimeViewModel => {
  const podMap = new Map<string, UnifiedAgentPodCard>();
  void runtimeSummary;

  const ensurePod = (podName: string, seed?: Partial<UnifiedAgentPodCard>): UnifiedAgentPodCard => {
    const key = String(podName || '').trim() || `unknown-pod-${podMap.size + 1}`;
    const existing = podMap.get(key);
    if (existing) {
      if (seed) Object.assign(existing, seed);
      return existing;
    }
    const created: UnifiedAgentPodCard = {
      pod_name: key,
      worker_id: String(seed?.worker_id || '').trim() || key,
      pod_ip: seed?.pod_ip ?? null,
      healthy: seed?.healthy ?? false,
      slot_source: seed?.slot_source || 'agent',
      mismatch: seed?.mismatch || 'none',
      max_concurrent_jobs: Number(seed?.max_concurrent_jobs || 0),
      running_jobs: Number(seed?.running_jobs || 0),
      available_slots: Number(seed?.available_slots || 0),
      queued_jobs: Number(seed?.queued_jobs || 0),
      active_task_count: Number(seed?.active_task_count || 0),
      agent_process_limit: Number(seed?.agent_process_limit || 0),
      agent_process_in_use: Number(seed?.agent_process_in_use || 0),
      agent_process_available: Number(seed?.agent_process_available || 0),
      agent_waiting_requests: Number(seed?.agent_waiting_requests || 0),
      agent_rss_total_bytes: Number(seed?.agent_rss_total_bytes || 0),
      process_count: Number(seed?.process_count || 0),
      tracked_process_count: Number(seed?.tracked_process_count || 0),
      residual_process_count: Number(seed?.residual_process_count || 0),
      unknown_process_count: Number(seed?.unknown_process_count || 0),
      running_task_count: Number(seed?.running_task_count || 0),
      task_count: Number(seed?.task_count || 0),
      source: String(seed?.source || '').trim() || 'unknown',
      last_heartbeat_at: seed?.last_heartbeat_at ?? null,
      last_scanned_at: typeof seed?.last_scanned_at === 'number' ? seed.last_scanned_at : null,
      scan_errors: Number(seed?.scan_errors || 0),
      error: seed?.error ?? null,
    };
    podMap.set(key, created);
    return created;
  };

  slotWorkers.forEach((worker) => {
    const podName = String((worker as { pod_name?: string | null }).pod_name || '').trim();
    if (!podName) return;
    ensurePod(podName, {
      worker_id: String((worker as { worker_id?: string | null }).worker_id || '').trim() || podName,
      pod_ip: (worker as { pod_ip?: string | null }).pod_ip ?? null,
      healthy: Boolean((worker as { healthy?: boolean }).healthy),
      slot_source: 'slot',
      mismatch: 'slot_only',
      max_concurrent_jobs: Number((worker as { max_concurrent_jobs?: number }).max_concurrent_jobs || 0),
      running_jobs: Number((worker as { running_jobs?: number }).running_jobs || 0),
      available_slots: Number((worker as { available_slots?: number }).available_slots || 0),
      queued_jobs: Number((worker as { queued_jobs?: number }).queued_jobs || 0),
      active_task_count: Array.isArray((worker as { active_jobs?: unknown[] }).active_jobs) ? (worker as { active_jobs?: unknown[] }).active_jobs!.length : 0,
      agent_process_limit: Number((worker as { agent_process_limit?: number }).agent_process_limit || 0),
      agent_process_in_use: Number((worker as { agent_process_in_use?: number }).agent_process_in_use || 0),
      agent_process_available: Number((worker as { agent_process_available?: number }).agent_process_available || 0),
      agent_waiting_requests: Number((worker as { agent_waiting_requests?: number }).agent_waiting_requests || 0),
      agent_rss_total_bytes: Number((worker as { agent_rss_total_bytes?: number }).agent_rss_total_bytes || 0),
      source: String((worker as { source?: string | null }).source || '').trim() || 'slot',
      last_heartbeat_at: (worker as { last_heartbeat_at?: string | null }).last_heartbeat_at ?? null,
      error: (worker as { error?: string | null }).error ?? null,
    });
  });

  agentPods.forEach((pod) => {
    const card = ensurePod(pod.pod_name, {
      worker_id: pod.worker_id || pod.pod_name,
      healthy: pod.healthy !== false,
      slot_source: podMap.has(pod.pod_name) ? 'merged' : 'agent',
      mismatch: podMap.has(pod.pod_name) ? 'none' : 'agent_only',
      process_count: Number(pod.process_count || 0),
      tracked_process_count: Number(pod.tracked_process_count || 0),
      residual_process_count: Number(pod.residual_process_count || 0),
      unknown_process_count: Number(pod.unknown_process_count || 0),
      running_task_count: Number(pod.running_task_count || 0),
      task_count: Number(pod.task_count || 0),
      last_scanned_at: pod.last_scanned_at ?? null,
      scan_errors: Number(pod.scan_errors || 0),
      error: null,
    });
    if (card.mismatch === 'slot_only') {
      card.mismatch = 'none';
      card.slot_source = 'merged';
    }
  });

  const podCards = Array.from(podMap.values()).sort((left, right) => left.pod_name.localeCompare(right.pod_name, 'zh-CN'));
  return {
    podCards,
    totalPods: podCards.length,
    healthyPods: podCards.filter((pod) => pod.healthy).length,
    totalCapacity: podCards.reduce((sum, pod) => sum + pod.max_concurrent_jobs, 0),
    busySlots: podCards.reduce((sum, pod) => sum + pod.running_jobs, 0),
    availableSlots: podCards.reduce((sum, pod) => sum + pod.available_slots, 0),
    queuedJobs: podCards.reduce((sum, pod) => sum + pod.queued_jobs, 0),
    agentTotalCapacity: podCards.reduce((sum, pod) => sum + pod.agent_process_limit, 0),
    agentInUse: podCards.reduce((sum, pod) => sum + pod.agent_process_in_use, 0),
    agentAvailable: podCards.reduce((sum, pod) => sum + pod.agent_process_available, 0),
    agentWaitingRequests: podCards.reduce((sum, pod) => sum + pod.agent_waiting_requests, 0),
    agentRssTotalBytes: podCards.reduce((sum, pod) => sum + pod.agent_rss_total_bytes, 0),
    slotOnlyPods: podCards.filter((pod) => pod.mismatch === 'slot_only').length,
    agentOnlyPods: podCards.filter((pod) => pod.mismatch === 'agent_only').length,
    totalProcesses: podCards.reduce((sum, pod) => sum + pod.process_count, 0) || Number(runtimeSummary?.total_processes || 0),
    trackedProcesses: podCards.reduce((sum, pod) => sum + pod.tracked_process_count, 0) || Number(runtimeSummary?.tracked_processes || 0),
    residualProcesses: podCards.reduce((sum, pod) => sum + pod.residual_process_count, 0) || Number(runtimeSummary?.residual_processes || 0),
    unknownProcesses: podCards.reduce((sum, pod) => sum + pod.unknown_process_count, 0) || Number(runtimeSummary?.unknown_processes || 0),
    runningTasks: podCards.reduce((sum, pod) => sum + pod.running_task_count, 0),
    ownedTasks: podCards.reduce((sum, pod) => sum + pod.task_count, 0),
    aggregatePartial: Boolean(runtimeSummary?.aggregate_partial),
    aggregateSources: runtimeSummary?.aggregate_sources ?? null,
    aggregateFanoutErrors: runtimeSummary?.aggregate_fanout_errors ?? null,
    aggregateFailedTargetCount: Array.isArray(runtimeSummary?.aggregate_failed_targets) ? runtimeSummary!.aggregate_failed_targets.length : 0,
    aggregateAllSourcesFailed: Boolean(runtimeSummary?.aggregate_all_sources_failed),
    scannedAt: typeof runtimeSummary?.scanned_at === 'number' ? runtimeSummary.scanned_at : null,
  };
};
