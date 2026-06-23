import type {
  BinarySecurityRuntimeHealthLoopSnapshot,
  BinarySecurityRuntimeHealthUnit,
  BinarySecurityTaskDetail,
} from '../clients/binarySecurity';

export type RuntimeDiagnosis = {
  key: string;
  severity: 'healthy' | 'degraded' | 'unhealthy';
  priority: number;
  title: string;
  summary: string;
  action: string;
};

export type RuntimeSnapshotCard = {
  card_key: string;
  rows?: Array<{ label: string; value?: string | null }>;
};

export type RuntimeOwnerTopology = {
  dispatcher: string | null;
  leaseOwner: string | null;
  runtimePhase: string | null;
  localWorkerAlive: boolean;
  localOwner: boolean;
  hasMismatch: boolean;
  mismatchReasons: string[];
};

const findRowValue = (card: RuntimeSnapshotCard | null, label: string) =>
  card?.rows?.find((row) => row.label === label)?.value;

export const deriveRuntimeOwnerTopology = (
  detail: BinarySecurityTaskDetail | null | undefined,
  runtimeHealthUnits: BinarySecurityRuntimeHealthUnit[],
  runtimeHealthSnapshotCards: RuntimeSnapshotCard[],
): RuntimeOwnerTopology => {
  const dispatcher = String(detail?.dispatcher_instance_id || '').trim() || null;
  const leaseOwner = String(detail?.task_lease_owner_instance_id || '').trim() || null;
  const runtimePhase = String(detail?.runtime_phase || '').trim() || null;
  const taskWorker = runtimeHealthUnits.find((unit) => unit.unit_key === 'task_worker') || null;
  const heartbeatUnit = runtimeHealthUnits.find((unit) => unit.unit_key === 'task_heartbeat') || null;
  const localTaskCard = runtimeHealthSnapshotCards.find((card) => card.card_key === 'local_task_runtime') || null;
  const localWorkerAlive = findRowValue(localTaskCard, 'local_worker_alive') === 'true';
  const localOwner = findRowValue(localTaskCard, 'local_owner') === 'true';
  const mismatchReasons: string[] = [];
  if (dispatcher && leaseOwner && dispatcher !== leaseOwner) mismatchReasons.push('dispatcher 与 lease owner 不一致');
  if ((dispatcher || leaseOwner) && !localWorkerAlive && !localOwner) mismatchReasons.push('远端 owner 存在，但当前 Pod 没有本地任务 handle');
  if (taskWorker?.status === 'degraded' || heartbeatUnit?.status === 'degraded') mismatchReasons.push('主任务执行或保活单元已降级');
  if (detail?.tail_takeover_required) mismatchReasons.push(`tail takeover required${detail?.tail_takeover_reason ? `: ${detail.tail_takeover_reason}` : ''}`);
  return {
    dispatcher,
    leaseOwner,
    runtimePhase,
    localWorkerAlive,
    localOwner,
    hasMismatch: mismatchReasons.length > 0,
    mismatchReasons,
  };
};

export const deriveRuntimeDiagnoses = ({
  detail,
  runtimeHealthUnits,
  runtimeHealthRelatedLoops,
  runtimeHealthSnapshotCards,
  runtimeOwnerTopology,
}: {
  detail: BinarySecurityTaskDetail | null | undefined;
  runtimeHealthUnits: BinarySecurityRuntimeHealthUnit[];
  runtimeHealthRelatedLoops: BinarySecurityRuntimeHealthLoopSnapshot[];
  runtimeHealthSnapshotCards: RuntimeSnapshotCard[];
  runtimeOwnerTopology: RuntimeOwnerTopology;
}): RuntimeDiagnosis[] => {
  const diagnoses: RuntimeDiagnosis[] = [];
  const taskStatus = String(detail?.status || '').trim().toLowerCase();
  const runtimePhase = String(detail?.runtime_phase || '').trim().toLowerCase();
  const taskWorker = runtimeHealthUnits.find((unit) => unit.unit_key === 'task_worker') || null;
  const heartbeatUnit = runtimeHealthUnits.find((unit) => unit.unit_key === 'task_heartbeat') || null;
  const tailUnit = runtimeHealthUnits.find((unit) => unit.unit_key === 'downstream_sync') || null;
  const operationUnit = runtimeHealthUnits.find((unit) => unit.unit_key === 'task_operation') || null;
  const reducerLoop = runtimeHealthRelatedLoops.find((loop) => loop.loop_key === 'state_reducer') || null;
  const dispatchLoop = runtimeHealthRelatedLoops.find((loop) => loop.loop_key === 'task_dispatch') || null;
  const localTaskCard = runtimeHealthSnapshotCards.find((card) => card.card_key === 'local_task_runtime') || null;
  const localWorkerAlive = findRowValue(localTaskCard, 'local_worker_alive') === 'true';
  const localOwner = findRowValue(localTaskCard, 'local_owner') === 'true';
  const localStageCard = runtimeHealthSnapshotCards.find((card) => card.card_key === 'local_stage_workers') || null;
  const localStageWorkerCount = Number(findRowValue(localStageCard, 'local_stage_worker_count') || 0);
  const activeStageItemCount = Number(findRowValue(localStageCard, 'active_stage_item_count') || 0);

  if (runtimeOwnerTopology.hasMismatch) {
    diagnoses.push({
      key: 'owner_drift',
      severity: 'unhealthy',
      priority: taskStatus === 'dispatching' || taskStatus === 'running' ? 100 : 90,
      title: 'Owner / Lease 漂移',
      summary: runtimeOwnerTopology.mismatchReasons.join('；'),
      action: '优先核对 dispatcher、lease owner、本地主 handle 和 pod 日志，确认任务是否处于假活跃或 owner takeover 漂移。',
    });
  }
  if (taskStatus === 'dispatching' && !localWorkerAlive && dispatchLoop?.status === 'healthy') {
    diagnoses.push({
      key: 'dispatching_without_worker',
      severity: 'unhealthy',
      priority: 110,
      title: '任务停在 dispatching 但没有本地主协程',
      summary: '分发表面健康，但当前 Pod 没看到本地父任务执行句柄，任务可能停在“已 claim 但未真正拉起”。',
      action: '检查 dispatch loop、_start_task_runtime 和当前 task 的 owner 变更日志，确认是否存在 fake dispatching。',
    });
  }
  if (taskStatus === 'running' && !localWorkerAlive && !localOwner && runtimeOwnerTopology.dispatcher && dispatchLoop?.status === 'healthy') {
    diagnoses.push({
      key: 'running_without_local_runtime',
      severity: 'unhealthy',
      priority: 105,
      title: '任务显示 running，但当前 Pod 没有本地运行句柄',
      summary: '任务处于运行态，但本地父任务协程和本地 owner 都不存在，存在假运行或 owner 已漂移的风险。',
      action: '交叉核对 dispatcher pod、lease owner、worker 日志和 timeline，确认任务是否真的在其它 Pod 继续执行。',
    });
  }
  if (tailUnit && ['degraded', 'unhealthy'].includes(String(tailUnit.status || '').trim().toLowerCase())) {
    diagnoses.push({
      key: 'tail_reconcile_risk',
      severity: String(tailUnit.status || '').trim().toLowerCase() === 'unhealthy' ? 'unhealthy' : 'degraded',
      priority: taskStatus === 'running' || runtimePhase === 'tail_reconciliation' ? 95 : 70,
      title: 'Tail 收口存在风险',
      summary: tailUnit.reason || '下游同步/收口协程信号异常。',
      action: '核对 tail takeover 标记、last sync 时间、entry/dataflow/vuln 下游任务状态，确认是否进入收口停滞。',
    });
  }
  if (activeStageItemCount > 0 && localStageWorkerCount === 0 && !localWorkerAlive && runtimePhase !== 'terminal') {
    diagnoses.push({
      key: 'active_items_without_local_stage_worker',
      severity: 'degraded',
      priority: taskStatus === 'running' ? 88 : 60,
      title: '有活跃子项但当前 Pod 没有阶段子协程',
      summary: `active stage items = ${activeStageItemCount}，local stage workers = 0。`,
      action: '结合 owner/lease 判断当前任务是否由其它 Pod 持有；如果不是，需要检查 stage item dispatch 是否停滞。',
    });
  }
  if (heartbeatUnit && heartbeatUnit.status === 'degraded' && taskWorker?.status === 'degraded') {
    diagnoses.push({
      key: 'lease_aging',
      severity: 'degraded',
      priority: taskStatus === 'running' || taskStatus === 'dispatching' ? 84 : 58,
      title: '主协程与保活同时老化',
      summary: '主任务执行协程和任务保活单元都已降级，owner 可能接近丢失或心跳窗口边缘。',
      action: '优先检查 task heartbeat loop、lease 过期时间和 worker pod 健康，确认是否即将发生 owner 丢失。',
    });
  }
  if (operationUnit && ['degraded', 'unhealthy'].includes(String(operationUnit.status || '').trim().toLowerCase())) {
    diagnoses.push({
      key: 'operation_lock_drift',
      severity: String(operationUnit.status || '').trim().toLowerCase() === 'unhealthy' ? 'unhealthy' : 'degraded',
      priority: taskStatus.startsWith('retry') || taskStatus === 'dispatching' || taskStatus === 'running' ? 82 : 62,
      title: '任务操作协程 / 锁存在漂移',
      summary: operationUnit.reason || '任务级 operation lock 与 worker 信号不一致。',
      action: '检查 continue/retry/cancel 当前 operation 是否残留 queued/running 锁但没有实际 worker 推进。',
    });
  }
  if (reducerLoop && reducerLoop.status !== 'healthy') {
    diagnoses.push({
      key: 'reducer_not_healthy',
      severity: reducerLoop.status === 'unhealthy' ? 'unhealthy' : 'degraded',
      priority: 80,
      title: 'State Reducer 不健康',
      summary: reducerLoop.message || '状态归约 loop 不在健康窗口内。',
      action: '检查 reducer pod、state events 积压和 reducer logs；否则任务状态可能不会及时收敛。',
    });
  }
  if (taskStatus === 'success' && (tailUnit?.status === 'degraded' || tailUnit?.status === 'unhealthy' || runtimeOwnerTopology.hasMismatch)) {
    diagnoses.push({
      key: 'terminal_consistency_risk',
      severity: 'degraded',
      priority: 108,
      title: '任务已 success，但终态一致性存在风险',
      summary: '任务表面已成功，但 tail 收口或 owner 拓扑仍显示漂移，需要防止出现“success 但内部残留 pending / active”。',
      action: '重点核对 stage_runs、stage_items、downstream refs 和 orchestration observability，确认没有假成功或残留执行世界。',
    });
  }
  if (taskStatus === 'failed' && dispatchLoop?.status === 'healthy' && reducerLoop?.status === 'healthy' && operationUnit?.status !== 'healthy') {
    diagnoses.push({
      key: 'failed_with_operation_residue',
      severity: 'degraded',
      priority: 86,
      title: '任务已 failed，但任务操作残留未收干净',
      summary: '控制面主循环仍健康，但任务操作协程 / 锁仍然漂移，可能影响继续、重试或删除。',
      action: '检查当前 task operation、cleanup state 和 blocking refs，确认失败后的清理链是否已收口。',
    });
  }
  if (!diagnoses.length) {
    diagnoses.push({
      key: 'runtime_healthy',
      severity: 'healthy',
      priority: 0,
      title: '当前未见明显运行漂移',
      summary: '主任务执行、保活、tail 收口和控制面 loops 暂未显示明显异常。',
      action: '继续结合 timeline、orchestration observability 和下游任务详情做交叉确认。',
    });
  }
  const severityRank = (severity: RuntimeDiagnosis['severity']) => {
    switch (severity) {
      case 'unhealthy':
        return 3;
      case 'degraded':
        return 2;
      default:
        return 1;
    }
  };
  return diagnoses.sort((left, right) => (right.priority - left.priority) || (severityRank(right.severity) - severityRank(left.severity)));
};
