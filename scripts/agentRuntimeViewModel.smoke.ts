import assert from 'node:assert/strict';

import { buildUnifiedAgentRuntimeViewModel } from '../pages/execution/agentRuntimeViewModel.ts';

const merged = buildUnifiedAgentRuntimeViewModel({
  slotWorkers: [
    {
      worker_id: 'worker-a',
      pod_name: 'pod-a',
      healthy: true,
      max_concurrent_jobs: 4,
      running_jobs: 2,
      available_slots: 2,
      queued_jobs: 1,
      source: 'slot',
      active_jobs: [{ task_id: 't-1' }],
      agent_process_limit: 3,
      agent_process_in_use: 2,
      agent_process_available: 1,
      agent_waiting_requests: 1,
      agent_rss_total_bytes: 1024,
    },
    {
      worker_id: 'worker-b',
      pod_name: 'pod-b',
      healthy: false,
      max_concurrent_jobs: 2,
      running_jobs: 0,
      available_slots: 0,
      queued_jobs: 0,
      source: 'slot',
      active_jobs: [],
    },
  ],
  runtimeSummary: null,
  agentPods: [
    {
      pod_name: 'pod-a',
      worker_id: 'worker-a',
      healthy: true,
      process_count: 4,
      tracked_process_count: 3,
      residual_process_count: 1,
      unknown_process_count: 0,
      task_count: 2,
      running_task_count: 1,
    },
    {
      pod_name: 'pod-c',
      worker_id: 'worker-c',
      healthy: true,
      process_count: 1,
      tracked_process_count: 1,
      residual_process_count: 0,
      unknown_process_count: 0,
      task_count: 1,
      running_task_count: 1,
    },
  ],
});

assert.equal(merged.totalPods, 3);
assert.equal(merged.slotOnlyPods, 1);
assert.equal(merged.agentOnlyPods, 1);
assert.equal(merged.totalCapacity, 6);
assert.equal(merged.busySlots, 2);
assert.equal(merged.agentTotalCapacity, 3);
assert.equal(merged.agentInUse, 2);
assert.equal(merged.totalProcesses, 5);
assert.equal(merged.trackedProcesses, 4);
assert.equal(merged.residualProcesses, 1);
assert.equal(merged.unknownProcesses, 0);
assert.equal(merged.runningTasks, 2);
assert.equal(merged.ownedTasks, 3);

const podA = merged.podCards.find((item) => item.pod_name === 'pod-a');
const podB = merged.podCards.find((item) => item.pod_name === 'pod-b');
const podC = merged.podCards.find((item) => item.pod_name === 'pod-c');

assert.ok(podA);
assert.ok(podB);
assert.ok(podC);
assert.equal(podA?.mismatch, 'none');
assert.equal(podB?.mismatch, 'slot_only');
assert.equal(podC?.mismatch, 'agent_only');
assert.equal(podA?.process_count, 4);
assert.equal(podA?.running_jobs, 2);

const noLoss = buildUnifiedAgentRuntimeViewModel({
  slotWorkers: [{ worker_id: 'worker-slot', pod_name: 'slot-only', healthy: true, max_concurrent_jobs: 1, running_jobs: 1, available_slots: 0, queued_jobs: 0, source: 'slot', active_jobs: [] }],
  runtimeSummary: null,
  agentPods: [],
});

assert.equal(noLoss.totalPods, 1);
assert.equal(noLoss.podCards[0]?.pod_name, 'slot-only');
assert.equal(noLoss.podCards[0]?.mismatch, 'slot_only');

const fallsBackToRuntimeSummary = buildUnifiedAgentRuntimeViewModel({
  slotWorkers: [],
  runtimeSummary: {
    total_pods: 0,
    healthy_pods: 0,
    total_processes: 7,
    tracked_processes: 5,
    residual_processes: 1,
    unknown_processes: 1,
    killable_residual_processes: 0,
    killable_unknown_processes: 0,
    aggregate_partial: true,
    aggregate_sources: 2,
    aggregate_fanout_errors: 1,
    aggregate_failed_targets: ['pod-x'],
    aggregate_all_sources_failed: false,
    scanned_at: 1717200000000,
  },
  agentPods: [],
});

assert.equal(fallsBackToRuntimeSummary.totalProcesses, 7);
assert.equal(fallsBackToRuntimeSummary.trackedProcesses, 5);
assert.equal(fallsBackToRuntimeSummary.residualProcesses, 1);
assert.equal(fallsBackToRuntimeSummary.unknownProcesses, 1);
assert.equal(fallsBackToRuntimeSummary.aggregatePartial, true);
assert.equal(fallsBackToRuntimeSummary.aggregateFailedTargetCount, 1);
assert.equal(fallsBackToRuntimeSummary.scannedAt, 1717200000000);

console.log('agentRuntimeViewModel.smoke.ts passed');
