import { deriveRuntimeDiagnoses, deriveRuntimeOwnerTopology } from '../utils/binarySecurityRuntimeHealth.ts';
import type {
  BinarySecurityRuntimeHealthLoopSnapshot,
  BinarySecurityRuntimeHealthUnit,
  BinarySecurityTaskDetail,
} from '../clients/binarySecurity.ts';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const makeDetail = (overrides: Partial<BinarySecurityTaskDetail> = {}): BinarySecurityTaskDetail => ({
  id: 'task-1',
  project_id: 'project-1',
  task_type: 'source',
  name: 'source',
  status: 'dispatching',
  execution_epoch: 1,
  firmware_path: '/src',
  stage_sequence: ['system_analysis', 'entry_analysis', 'dataflow_vuln_scan'],
  is_queued: false,
  high_risk_module_count: 0,
  medium_risk_module_count: 0,
  low_risk_module_count: 0,
  candidate_module_count: 0,
  selected_module_count: 0,
  selected_risk_levels: [],
  module_selection_mode: 'auto',
  entry_selection_mode: 'auto',
  candidate_entry_count: 0,
  selected_entry_count: 0,
  entry_count: 0,
  vuln_result_count: 0,
  firmware_item_count: 0,
  unpacked_firmware_count: 0,
  failed_firmware_count: 0,
  stage_summaries: [],
  task_retry_supported: false,
  task_continue_supported: false,
  output_root: '/o',
  workspace_root: '/w',
  policy: {},
  summary: {},
  metrics: {},
  item_stats: {},
  stage_items_total: 0,
  stage_items_truncated: false,
  stage_items: [],
  archive_jobs: [],
  overview_nodes: [],
  orchestration_observability: {},
  cleanup_snapshot: {},
  abnormal_reason_history: [],
  task_key_snapshot: { root_task_key: { has_secret: false, used: false }, work_keys: [] },
  ...overrides,
});

const makeUnit = (unit_key: string, status: string, reason = ''): BinarySecurityRuntimeHealthUnit => ({
  unit_key,
  unit_label: unit_key,
  unit_kind: 'coroutine',
  status,
  task_scoped: true,
  reason,
  evidence: [],
});

const makeLoop = (loop_key: string, status: string): BinarySecurityRuntimeHealthLoopSnapshot => ({
  loop_key,
  loop_label: loop_key,
  status,
  alive: status !== 'unhealthy',
  task_running: status === 'healthy',
  heartbeat_alive: status !== 'unhealthy',
});

const runDispatchingScenario = () => {
  const detail = makeDetail({
    status: 'dispatching',
    dispatcher_instance_id: 'worker-a',
    task_lease_owner_instance_id: 'worker-a',
  });
  const units = [makeUnit('task_worker', 'unhealthy'), makeUnit('task_heartbeat', 'degraded')];
  const loops = [makeLoop('task_dispatch', 'healthy')];
  const cards = [
    { card_key: 'local_task_runtime', rows: [{ label: 'local_worker_alive', value: 'false' }, { label: 'local_owner', value: 'false' }] },
    { card_key: 'local_stage_workers', rows: [{ label: 'local_stage_worker_count', value: '0' }, { label: 'active_stage_item_count', value: '0' }] },
  ];
  const topology = deriveRuntimeOwnerTopology(detail, units, cards);
  const diagnoses = deriveRuntimeDiagnoses({ detail, runtimeHealthUnits: units, runtimeHealthRelatedLoops: loops, runtimeHealthSnapshotCards: cards, runtimeOwnerTopology: topology });
  assert(diagnoses[0]?.key === 'dispatching_without_worker', 'dispatching scenario should prioritize missing local worker');
};

const runSuccessDriftScenario = () => {
  const detail = makeDetail({
    status: 'success',
    dispatcher_instance_id: 'worker-a',
    task_lease_owner_instance_id: 'worker-b',
  });
  const units = [makeUnit('downstream_sync', 'degraded', 'sync stale')];
  const loops = [makeLoop('state_reducer', 'healthy')];
  const cards = [
    { card_key: 'local_task_runtime', rows: [{ label: 'local_worker_alive', value: 'false' }, { label: 'local_owner', value: 'false' }] },
    { card_key: 'local_stage_workers', rows: [{ label: 'local_stage_worker_count', value: '0' }, { label: 'active_stage_item_count', value: '0' }] },
  ];
  const topology = deriveRuntimeOwnerTopology(detail, units, cards);
  const diagnoses = deriveRuntimeDiagnoses({ detail, runtimeHealthUnits: units, runtimeHealthRelatedLoops: loops, runtimeHealthSnapshotCards: cards, runtimeOwnerTopology: topology });
  assert(diagnoses.some((item) => item.key === 'terminal_consistency_risk'), 'success scenario should flag terminal consistency risk');
};

const runHealthyScenario = () => {
  const detail = makeDetail({ status: 'running', dispatcher_instance_id: 'worker-a', task_lease_owner_instance_id: 'worker-a' });
  const units = [makeUnit('task_worker', 'healthy'), makeUnit('task_heartbeat', 'healthy')];
  const loops = [makeLoop('task_dispatch', 'healthy'), makeLoop('state_reducer', 'healthy')];
  const cards = [
    { card_key: 'local_task_runtime', rows: [{ label: 'local_worker_alive', value: 'true' }, { label: 'local_owner', value: 'true' }] },
    { card_key: 'local_stage_workers', rows: [{ label: 'local_stage_worker_count', value: '1' }, { label: 'active_stage_item_count', value: '1' }] },
  ];
  const topology = deriveRuntimeOwnerTopology(detail, units, cards);
  const diagnoses = deriveRuntimeDiagnoses({ detail, runtimeHealthUnits: units, runtimeHealthRelatedLoops: loops, runtimeHealthSnapshotCards: cards, runtimeOwnerTopology: topology });
  assert(diagnoses[0]?.key === 'runtime_healthy', 'healthy scenario should return runtime_healthy');
};

runDispatchingScenario();
runSuccessDriftScenario();
runHealthyScenario();
console.log('binarySecurityRuntimeHealth.smoke.ts passed');
