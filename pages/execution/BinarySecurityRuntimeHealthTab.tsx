import React from 'react';

import type {
  BinarySecurityRuntimeHealthGroup,
  BinarySecurityRuntimeHealthLoopSnapshot,
  BinarySecurityRuntimeHealthUnit,
  BinarySecurityTaskDetail,
} from '../../clients/binarySecurity';
import type { RuntimeDiagnosis, RuntimeOwnerTopology } from '../../utils/binarySecurityRuntimeHealth';

const LK = {
  surfaceRaised: '#18233a',
  border: '#26324a',
  body: '#a4aec4',
  muted: '#72809a',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
} as const;

const formatRuntimeHealthStatus = (status?: string | null) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'healthy':
      return '健康';
    case 'degraded':
      return '风险';
    case 'unhealthy':
      return '异常';
    case 'idle':
      return '空闲';
    case 'done':
    case 'terminal':
      return '已完成';
    case 'unknown':
      return '未知';
    default:
      return status || '-';
  }
};

const runtimeHealthTone = (status?: string | null): { backgroundColor: string; color: string; borderColor: string } => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'healthy':
    case 'done':
    case 'terminal':
      return { backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success, borderColor: LK.success };
    case 'degraded':
      return { backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning, borderColor: LK.warning };
    case 'unhealthy':
      return { backgroundColor: 'rgba(241, 93, 93, 0.1)', color: LK.error, borderColor: LK.error };
    case 'idle':
    case 'unknown':
    default:
      return { backgroundColor: LK.surfaceRaised, color: LK.body, borderColor: LK.border };
  }
};

const formatRuntimeUnitKind = (kind?: string | null) => {
  switch (String(kind || '').trim().toLowerCase()) {
    case 'thread':
      return '线程';
    case 'coroutine':
      return '协程';
    case 'task_owner':
      return '保活';
    case 'operation':
      return '操作';
    case 'archive':
      return '归档';
    case 'sync':
      return '同步';
    default:
      return kind || '-';
  }
};

const runtimeGroupLabel = (groupKey?: string | null) => {
  switch (String(groupKey || '').trim().toLowerCase()) {
    case 'execution':
      return '任务执行';
    case 'lease':
      return '保活与心跳';
    case 'tail':
      return 'Tail 收口';
    case 'stage_workers':
      return '阶段子协程';
    case 'operation':
      return '任务操作';
    case 'archive':
      return '归档执行';
    default:
      return groupKey || '其他';
  }
};

const runtimeLoopRelation = (loopKey?: string | null) => {
  switch (String(loopKey || '').trim().toLowerCase()) {
    case 'task_dispatch':
      return '负责把 pending/dispatching 任务真正拉起到父任务执行协程。';
    case 'stage_item_dispatch':
      return '负责把可执行的 stage item 继续推进到阶段子协程。';
    case 'task_heartbeat':
      return '负责刷新任务级 lease/heartbeat，决定 owner 是否仍被视为活跃。';
    case 'downstream_reconcile':
      return '负责 entry/dataflow/vuln 这类 tail 阶段对子任务状态的持续收口。';
    case 'stage_item_sync_reconcile':
      return '负责把 stage item 与下游任务状态同步，避免父任务视图滞后。';
    case 'archive_dispatch':
      return '负责把归档任务送入 archive worker，决定产物链是否能继续。';
    case 'archive_runtime_reconcile':
      return '负责归档运行态的补偿与 reconcile，避免 archive 卡住。';
    case 'state_repair_reconcile':
      return '负责状态修复与补偿，处理 retryable 漂移事件。';
    case 'state_reducer':
      return '负责消费 state events 并更新 task/stage/item 的最终权威状态。';
    case 'readless_reconcile':
      return '负责只读投影相关的 reconcile，影响详情页与只读视图的一致性。';
    default:
      return '该 loop 与当前任务的控制面推进相关。';
  }
};

const formatAgeSeconds = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '-';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  if (value < 86400) return `${Math.round(value / 3600)}h`;
  return `${Math.round(value / 86400)}d`;
};

type Props = {
  detail: BinarySecurityTaskDetail | null;
  runtimeHealthSummary: BinarySecurityTaskDetail['runtime_health']['summary'] | null;
  runtimeHealthUnits: BinarySecurityRuntimeHealthUnit[];
  runtimeHealthSpotlight: Array<any>;
  runtimeHealthGroups: BinarySecurityRuntimeHealthGroup[];
  runtimeHealthAlerts: BinarySecurityRuntimeHealthUnit[];
  runtimeHealthSnapshotCards: Array<any>;
  runtimeHealthRelatedLoops: BinarySecurityRuntimeHealthLoopSnapshot[];
  runtimeHealthHotLoops: BinarySecurityRuntimeHealthLoopSnapshot[];
  runtimeOwnerTopology: RuntimeOwnerTopology;
  runtimeDiagnoses: RuntimeDiagnosis[];
  runtimeHealthExpanded: boolean;
  visibleRuntimeHealthUnits: BinarySecurityRuntimeHealthUnit[];
  onToggleExpanded: () => void;
  fmt: (value?: string | null) => string;
};

export function BinarySecurityRuntimeHealthTab({
  detail,
  runtimeHealthSummary,
  runtimeHealthUnits,
  runtimeHealthSpotlight,
  runtimeHealthGroups,
  runtimeHealthAlerts,
  runtimeHealthSnapshotCards,
  runtimeHealthRelatedLoops,
  runtimeHealthHotLoops,
  runtimeOwnerTopology,
  runtimeDiagnoses,
  runtimeHealthExpanded,
  visibleRuntimeHealthUnits,
  onToggleExpanded,
  fmt,
}: Props) {
  return (
    <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-theme-text-primary">线程与协程健康</h2>
          <p className="mt-2 text-sm text-theme-text-muted">用于同步确认当前任务的主执行协程、保活心跳、tail 收口协程，以及其他 task-scoped 运行单元是否真的在推进。</p>
        </div>
        <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 12px', fontSize: '12px', fontWeight: 600, ...runtimeHealthTone(runtimeHealthSummary?.overall_status), borderColor: runtimeHealthTone(runtimeHealthSummary?.overall_status).borderColor }}>
          {formatRuntimeHealthStatus(runtimeHealthSummary?.overall_status)}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm xl:grid-cols-5">
        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
          <div className="text-xs font-bold text-theme-text-muted">活跃单元</div>
          <div className="mt-1 text-lg font-semibold text-theme-text-primary">{runtimeHealthSummary?.active_unit_count ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
          <div className="text-xs font-bold text-theme-text-muted">健康 / 风险</div>
          <div className="mt-1 text-lg font-semibold text-theme-text-primary">{runtimeHealthSummary?.healthy_unit_count ?? 0} / {runtimeHealthSummary?.degraded_unit_count ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
          <div className="text-xs font-bold text-theme-text-muted">异常单元</div>
          <div className="mt-1 text-lg font-semibold text-theme-text-primary">{runtimeHealthSummary?.unhealthy_unit_count ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
          <div className="text-xs font-bold text-theme-text-muted">当前运行相位</div>
          <div className="mt-1 text-sm font-semibold text-theme-text-primary">{detail?.runtime_phase || '-'}</div>
          <div className="mt-1 text-[11px] text-theme-text-muted">{detail?.current_stage || '当前无阶段'}</div>
        </div>
        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
          <div className="text-xs font-bold text-theme-text-muted">最近刷新</div>
          <div className="mt-1 text-sm font-semibold text-theme-text-primary">{fmt(runtimeHealthSummary?.last_updated_at)}</div>
          <div className="mt-1 text-[11px] text-theme-text-muted">{detail?.dispatcher_instance_id || detail?.task_lease_owner_instance_id || 'worker · -'}</div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
        {runtimeHealthSummary?.message || '当前暂无可展示的任务线程/协程健康快照。'}
      </div>
      <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">排障结论</h3>
            <p className="mt-1 text-sm text-theme-text-secondary">基于当前任务详情、运行单元健康、本地 handle 快照和控制面 loop 自动归纳的当前判断。</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {runtimeDiagnoses.map((diagnosis) => (
            <div key={diagnosis.key} className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm font-semibold text-theme-text-primary">{diagnosis.title}</div>
                <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(diagnosis.severity), borderColor: runtimeHealthTone(diagnosis.severity).borderColor }}>
                  {formatRuntimeHealthStatus(diagnosis.severity)}
                </span>
              </div>
              <div className="mt-3 text-sm text-theme-text-secondary">{diagnosis.summary}</div>
              <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-[12px] text-theme-text-secondary">
                <span className="font-bold text-theme-text-primary">建议动作：</span> {diagnosis.action}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">Owner / Dispatcher / Lease 对照</h3>
            <p className="mt-1 text-sm text-theme-text-secondary">这里专门用于确认任务当前“谁在宣称持有它”、lease 归谁、当前页面所在 Pod 是否真的有本地执行句柄。</p>
          </div>
          <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(runtimeOwnerTopology.hasMismatch ? 'degraded' : 'healthy'), borderColor: runtimeHealthTone(runtimeOwnerTopology.hasMismatch ? 'degraded' : 'healthy').borderColor }}>
            {runtimeOwnerTopology.hasMismatch ? '存在漂移' : '基本一致'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3"><div className="text-xs font-bold text-theme-text-muted">Dispatcher</div><div className="mt-1 font-mono text-sm text-theme-text-primary">{runtimeOwnerTopology.dispatcher || '-'}</div></div>
          <div className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3"><div className="text-xs font-bold text-theme-text-muted">Lease Owner</div><div className="mt-1 font-mono text-sm text-theme-text-primary">{runtimeOwnerTopology.leaseOwner || '-'}</div><div className="mt-1 text-[11px] text-theme-text-muted">{detail?.task_lease_expires_at ? `expires ${fmt(detail.task_lease_expires_at)}` : 'lease 未展示过期时间'}</div></div>
          <div className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3"><div className="text-xs font-bold text-theme-text-muted">本地主 handle</div><div className="mt-1 text-sm font-semibold text-theme-text-primary">{runtimeOwnerTopology.localWorkerAlive ? 'alive' : runtimeOwnerTopology.localOwner ? 'owner-only' : 'absent'}</div></div>
          <div className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3"><div className="text-xs font-bold text-theme-text-muted">运行相位 / takeover</div><div className="mt-1 text-sm font-semibold text-theme-text-primary">{runtimeOwnerTopology.runtimePhase || '-'}</div><div className="mt-1 text-[11px] text-theme-text-muted">{detail?.tail_takeover_required ? `takeover required${detail?.tail_takeover_reason ? ` · ${detail.tail_takeover_reason}` : ''}` : '当前无 tail takeover 标记'}</div></div>
        </div>
        {runtimeOwnerTopology.hasMismatch ? <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-50/60 px-4 py-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Owner 漂移告警</div><div className="mt-2 flex flex-wrap gap-2">{runtimeOwnerTopology.mismatchReasons.map((reason) => <span key={reason} className="inline-flex rounded-full border border-amber-400/30 bg-white/80 px-2 py-1 text-[11px] text-amber-800">{reason}</span>)}</div></div> : null}
      </div>
      {runtimeHealthAlerts.length > 0 ? <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-50/60 px-4 py-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">需要重点确认</div><div className="mt-3 grid gap-3 xl:grid-cols-2">{runtimeHealthAlerts.map((unit) => <div key={`alert-${unit.unit_key}`} className="rounded-2xl border border-amber-400/20 bg-white/70 px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold text-theme-text-primary">{unit.unit_label}</div><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(unit.status), borderColor: runtimeHealthTone(unit.status).borderColor }}>{formatRuntimeHealthStatus(unit.status)}</span></div><div className="mt-2 text-sm text-theme-text-secondary">{unit.reason || '暂无附加原因'}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-theme-text-muted"><span className="rounded-full border border-theme-border bg-theme-bg-app px-2 py-1">owner: {unit.owner_instance_id || '-'}</span><span className="rounded-full border border-theme-border bg-theme-bg-app px-2 py-1">最近心跳: {fmt(unit.last_heartbeat_at || unit.started_at)}</span><span className="rounded-full border border-theme-border bg-theme-bg-app px-2 py-1">年龄: {formatAgeSeconds(unit.age_seconds)}</span></div></div>)}</div></div> : null}
      <div className="mt-4">
        <div><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">关键协程 / 线程位</h3><p className="mt-1 text-sm text-theme-text-secondary">优先看这几张卡，可以快速判断任务是否真的有人在跑、有人在保活、有人在收口。</p></div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {runtimeHealthSpotlight.length > 0 ? runtimeHealthSpotlight.map((unit) => <div key={`spotlight-${unit.slot_key}`} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-theme-text-primary">{unit.title}</div>{unit.subtitle ? <div className="mt-1 text-[11px] text-theme-text-muted">{unit.subtitle}</div> : null}</div><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(unit.status), borderColor: runtimeHealthTone(unit.status).borderColor }}>{formatRuntimeHealthStatus(unit.status)}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-theme-text-secondary"><div><div className="font-bold text-theme-text-muted">Owner</div><div className="mt-1 font-mono text-theme-text-secondary">{unit.owner_instance_id || '-'}</div></div><div><div className="font-bold text-theme-text-muted">最近心跳</div><div className="mt-1 font-mono text-theme-text-secondary">{fmt(unit.last_heartbeat_at)}</div></div></div><div className="mt-3 text-sm text-theme-text-secondary">{unit.reason || '暂无附加原因'}</div>{unit.evidence?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{unit.evidence.map((evidence: any) => <span key={`spotlight-${unit.slot_key}-${evidence.label}`} className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">{evidence.label}:{evidence.value ?? '-'}</span>)}</div> : null}</div>) : <div className="rounded-2xl border border-dashed border-theme-border bg-theme-bg-app px-4 py-6 text-sm text-theme-text-muted">当前没有关键运行单元快照。</div>}
        </div>
      </div>
      <div className="mt-6">
        <div><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">运行单元分组</h3><p className="mt-1 text-sm text-theme-text-secondary">把与任务有关的协程/线程按职责分层，便于确认“谁该跑、谁该保活、谁在收口、谁在归档”。</p></div>
        <div className="mt-3 space-y-4">{runtimeHealthGroups.map((group) => <div key={group.group_key} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-theme-text-primary">{runtimeGroupLabel(group.group_key)}</div>{group.description ? <div className="mt-1 text-[11px] text-theme-text-muted">{group.description}</div> : null}</div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">活跃 {group.active_unit_count}</span><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(group.status), borderColor: runtimeHealthTone(group.status).borderColor }}>{formatRuntimeHealthStatus(group.status)}</span></div></div><div className="mt-3 grid gap-3 xl:grid-cols-2">{group.units.map((unit) => <div key={`${group.group_key}-${unit.unit_key}`} className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-semibold text-theme-text-primary">{unit.unit_label}</div>{unit.detail ? <div className="mt-1 text-[11px] text-theme-text-muted">{unit.detail}</div> : null}</div><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(unit.status), borderColor: runtimeHealthTone(unit.status).borderColor }}>{formatRuntimeHealthStatus(unit.status)}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-theme-text-secondary"><div><div className="font-bold text-theme-text-muted">类型</div><div className="mt-1">{formatRuntimeUnitKind(unit.unit_kind)}</div></div><div><div className="font-bold text-theme-text-muted">年龄</div><div className="mt-1">{formatAgeSeconds(unit.age_seconds)}</div></div><div className="col-span-2"><div className="font-bold text-theme-text-muted">Owner / 最近心跳</div><div className="mt-1 font-mono">{unit.owner_instance_id || '-'} · {fmt(unit.last_heartbeat_at || unit.started_at)}</div></div></div><div className="mt-3 text-sm text-theme-text-secondary">{unit.reason || '暂无附加原因'}</div>{unit.evidence?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{unit.evidence.slice(0, 6).map((evidence) => <span key={`${group.group_key}-${unit.unit_key}-${evidence.label}`} className="inline-flex rounded-full border border-theme-border bg-theme-surface px-2 py-1 text-[11px] text-theme-text-muted">{evidence.label}:{evidence.value ?? '-'}</span>)}</div> : null}</div>)}</div></div>)}</div>
      </div>
      <div className="mt-6">
        <div><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">当前 Pod 本地运行快照</h3><p className="mt-1 text-sm text-theme-text-secondary">直接打印当前 binary-security Pod 看到的本地 handle、heartbeat task、stage/archive/operation worker 快照。</p></div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">{runtimeHealthSnapshotCards.length > 0 ? runtimeHealthSnapshotCards.map((card) => <div key={card.card_key} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-theme-text-primary">{card.title}</div>{card.subtitle ? <div className="mt-1 text-[11px] text-theme-text-muted">{card.subtitle}</div> : null}</div><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(card.status), borderColor: runtimeHealthTone(card.status).borderColor }}>{formatRuntimeHealthStatus(card.status)}</span></div><div className="mt-3 text-sm text-theme-text-secondary">{card.message || '暂无附加说明'}</div><div className="mt-3 grid gap-2 text-[11px] text-theme-text-secondary">{card.rows.map((row: any) => <div key={`${card.card_key}-${row.label}`} className="flex items-start justify-between gap-3 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2"><span className="font-bold text-theme-text-muted">{row.label}</span><span className="font-mono text-right text-theme-text-secondary">{row.value ?? '-'}</span></div>)}</div></div>) : <div className="rounded-2xl border border-dashed border-theme-border bg-theme-bg-app px-4 py-6 text-sm text-theme-text-muted">当前没有可展示的本地运行快照。</div>}</div>
      </div>
      <div className="mt-6">
        <div><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-text-muted">相关控制面 Loops</h3><p className="mt-1 text-sm text-theme-text-secondary">这些 loop 不是 task-scoped worker，但它们直接决定任务是否能被分发、保活、收口、归档和归约。</p></div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">{runtimeHealthRelatedLoops.map((loop) => <div key={loop.loop_key} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-theme-text-primary">{loop.loop_label}</div><div className="mt-1 text-[11px] text-theme-text-muted">{loop.loop_key}</div></div><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontSize: '11px', fontWeight: 700, ...runtimeHealthTone(loop.status), borderColor: runtimeHealthTone(loop.status).borderColor }}>{formatRuntimeHealthStatus(loop.status)}</span></div><div className="mt-3 text-sm text-theme-text-secondary">{loop.message || '暂无附加说明'}</div><div className="mt-2 text-[11px] text-theme-text-muted">{runtimeLoopRelation(loop.loop_key)}</div><div className="mt-3 flex flex-wrap gap-1.5"><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">alive:{String(loop.alive)}</span><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">task_running:{String(loop.task_running)}</span><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">heartbeat_alive:{String(loop.heartbeat_alive)}</span><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">heartbeat:{fmt(loop.heartbeat_at)}</span><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">age:{formatAgeSeconds(loop.heartbeat_age_seconds)}</span><span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">stale_after:{loop.stale_after_seconds ?? '-'}s</span></div></div>)}</div>
        {runtimeHealthHotLoops.length === 0 ? <div className="mt-3 rounded-2xl border border-dashed border-theme-border bg-theme-bg-app px-4 py-6 text-sm text-theme-text-muted">当前没有观测到与该任务展示相关的控制面 loop 快照。</div> : null}
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
        <div className="border-b border-theme-border px-4 py-3"><div className="text-sm font-semibold text-theme-text-primary">原始运行单元明细</div><div className="mt-1 text-[11px] text-theme-text-muted">保留完整表格，便于和 reducer / orchestrator / pod 日志逐项对照。</div></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-theme-border text-left text-xs">
            <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted"><tr><th className="min-w-[150px] px-4 py-3">名称</th><th className="w-24 px-4 py-3">类型</th><th className="w-24 px-4 py-3">状态</th><th className="min-w-[140px] px-4 py-3">Owner</th><th className="min-w-[150px] px-4 py-3">最近心跳</th><th className="w-24 px-4 py-3">持续/年龄</th><th className="min-w-[260px] px-4 py-3">原因 / 证据</th></tr></thead>
            <tbody className="divide-y divide-theme-border bg-theme-bg-app">
              {visibleRuntimeHealthUnits.length > 0 ? visibleRuntimeHealthUnits.map((unit) => <tr key={unit.unit_key}><td className="px-4 py-3 align-top"><div className="font-bold text-theme-text-primary">{unit.unit_label}</div>{unit.detail ? <div className="mt-1 text-[11px] text-theme-text-muted">{unit.detail}</div> : null}</td><td className="px-4 py-3 align-top text-theme-text-secondary">{formatRuntimeUnitKind(unit.unit_kind)}</td><td className="px-4 py-3 align-top"><span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 10px', fontWeight: 600, ...runtimeHealthTone(unit.status), borderColor: runtimeHealthTone(unit.status).borderColor }}>{formatRuntimeHealthStatus(unit.status)}</span></td><td className="px-4 py-3 align-top font-mono text-[11px] text-theme-text-secondary">{unit.owner_instance_id || '-'}</td><td className="px-4 py-3 align-top font-mono text-[11px] text-theme-text-secondary">{fmt(unit.last_heartbeat_at || unit.started_at)}</td><td className="px-4 py-3 align-top text-theme-text-secondary">{formatAgeSeconds(unit.age_seconds)}</td><td className="px-4 py-3 align-top">{unit.reason ? <div className="text-theme-text-secondary">{unit.reason}</div> : <div className="text-theme-text-muted">-</div>}{unit.evidence?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{unit.evidence.slice(0, 3).map((evidence) => <span key={`${unit.unit_key}-${evidence.label}`} className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] text-theme-text-muted">{evidence.label}:{evidence.value ?? '-'}</span>)}</div> : null}</td></tr>) : <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-theme-text-muted">当前暂无可展示的任务线程/协程健康快照</td></tr>}
            </tbody>
          </table>
        </div>
        {runtimeHealthUnits.length > 5 ? <div className="border-t border-theme-border px-4 py-3"><button type="button" onClick={onToggleExpanded} className="text-xs font-bold text-sky-400 transition hover:text-sky-400">{runtimeHealthExpanded ? '收起' : `查看全部 ${runtimeHealthUnits.length} 个运行单元`}</button></div> : null}
      </div>
    </section>
  );
}
