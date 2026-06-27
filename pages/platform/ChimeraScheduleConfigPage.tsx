import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';
import {
  ScheduleRuntimeConfig,
  ScheduleRuntimeSchedulerPolicy,
  ScheduleRuntimeUserTaskSyncPolicy,
  ScheduleRuntimeTaskType,
  ScheduleRuntimeTimeWindow,
  ScheduleRuntimeToolDefault,
} from '../../types/types';

const TASK_TYPE_ORDER: ScheduleRuntimeTaskType[] = [
  'binary_firmware_e2e',
  'source_scan_e2e',
  'kg_source_vuln_scan_e2e',
  'binary_module_e2e',
  'ai4red',
  'ai4app_fast',
  'ai4app_deep',
  'ai4web_fast',
  'ai4web_deep',
  'sechps_tool',
];

const DEFAULT_CAPACITY_POOL_IDS: Record<ScheduleRuntimeTaskType, number[]> = {
  binary_firmware_e2e: [1],
  source_scan_e2e: [1],
  kg_source_vuln_scan_e2e: [1],
  binary_module_e2e: [1],
  ai4red: [],
  ai4app_fast: [1],
  ai4app_deep: [1],
  ai4web_fast: [1],
  ai4web_deep: [1],
  sechps_tool: [1],
};

const SYNC_POLICY_FIELDS: Array<{ key: keyof ScheduleRuntimeUserTaskSyncPolicy; label: string; type: 'checkbox' | 'number'; help: string }> = [
  { key: 'enabled', label: '启用', type: 'checkbox', help: '控制是否启动任务同步轮询；关闭后不会继续主动拉取下游状态。' },
  { key: 'worker_concurrency', label: '任务同步 Worker 并发', type: 'number', help: '允许同时处理多少条任务同步请求，值越大并行拉取越多。' },
  { key: 'lease_seconds', label: 'Lease 秒数', type: 'number', help: '单次同步认领的租约时长；超时未续租会被其他实例回收。' },
  { key: 'heartbeat_interval_seconds', label: '心跳间隔秒数', type: 'number', help: '同步执行期间刷新租约的频率，用于避免长任务被误判失活。' },
  { key: 'db_fallback_batch_size', label: 'DB 回扫批量', type: 'number', help: 'Redis 队列空或异常时，从数据库补扫待同步任务的单次扫描上限。' },
  { key: 'queue_pop_timeout_seconds', label: '队列弹出超时', type: 'number', help: '同步 Worker 从 Redis ready queue 阻塞取任务的最长等待时间。' },
  { key: 'reclaim_batch_size', label: '回收批量', type: 'number', help: '每轮回收失活同步任务时，最多修复或重新入队的任务数量。' },
  { key: 'dispatching_seconds', label: 'Dispatching 超时', type: 'number', help: '任务处于 dispatching 阶段时，两次状态同步之间的间隔秒数。' },
  { key: 'running_seconds', label: 'Running 超时', type: 'number', help: '任务处于 running 阶段时，两次状态同步之间的间隔秒数。' },
  { key: 'paused_seconds', label: 'Paused 超时', type: 'number', help: '任务处于 paused 阶段时，两次状态同步之间的间隔秒数。' },
  { key: 'terminal_verify_seconds', label: '终态校验秒数', type: 'number', help: '任务进入终态后，为防止漏状态而追加一次校验的等待间隔。' },
  { key: 'retry_initial_seconds', label: '重试初始秒数', type: 'number', help: '同步失败后进入 retry_wait 队列时，下一次重试的基础等待时间。' },
  { key: 'retry_max_seconds', label: '重试最大秒数', type: 'number', help: '失败重试退避允许增长到的最长等待时间上限。' },
  { key: 'failure_threshold', label: '失败阈值', type: 'number', help: '连续失败超过该阈值后，系统会按失败态或告警逻辑进一步处理。' },
];

const SCHEDULER_POLICY_FIELDS: Array<{ key: keyof ScheduleRuntimeSchedulerPolicy; label: string; help: string }> = [
  { key: 'project_default_concurrency', label: '项目默认并发', help: '单个项目在未单独配置时可同时占用的默认调度槽位数。' },
  { key: 'target_default_concurrency', label: '目标默认并发', help: '同一目标地址或同一类下游资源默认可并发处理的任务数量。' },
  { key: 'worker_concurrency', label: '调度执行 Worker 并发', help: '调度器并行处理派发、补偿和状态推进的执行线程数。' },
  { key: 'ready_backfill_batch_size', label: 'Ready 回填批量', help: '每轮把数据库中的 ready 任务补回内存/Redis 队列时的最大批量。' },
  { key: 'db_fallback_batch_size', label: 'DB 回扫批量', help: '调度 Worker 在队列缺失或异常时，从数据库兜底扫描任务的最大数量。' },
];

const DISPATCH_MODE_OPTIONS = [
  { value: 'balanced', label: 'balanced', help: '优先均衡不同项目和目标的槽位占用，避免单一来源挤占全部执行资源。' },
  { value: 'fifo', label: 'fifo', help: '严格按进入队列的先后顺序派发，适合强调顺序一致性的场景。' },
  { value: 'priority_first', label: 'priority_first', help: '优先派发高优先级任务，再按时间顺序处理其余任务。' },
];

const QUEUE_STRATEGY_OPTIONS = [
  { value: 'capacity_aware', label: 'capacity_aware', help: '派发时会结合容量池和并发额度判断是否允许进入执行。' },
  { value: 'strict_fifo', label: 'strict_fifo', help: '只按先进先出推进，不额外考虑容量均衡策略。' },
];

const emptySchedulerPolicy = (): ScheduleRuntimeSchedulerPolicy => ({
  dispatch_mode: 'balanced',
  queue_strategy: 'capacity_aware',
  project_default_concurrency: 16,
  target_default_concurrency: 8,
  worker_concurrency: 32,
  ready_backfill_batch_size: 100,
  db_fallback_batch_size: 20,
});

const emptyUserTaskSyncPolicy = (): ScheduleRuntimeUserTaskSyncPolicy => ({
  enabled: true,
  worker_concurrency: 8,
  lease_seconds: 45,
  heartbeat_interval_seconds: 10,
  db_fallback_batch_size: 20,
  queue_pop_timeout_seconds: 1,
  reclaim_batch_size: 50,
  dispatching_seconds: 5,
  running_seconds: 15,
  paused_seconds: 60,
  terminal_verify_seconds: 10,
  retry_initial_seconds: 30,
  retry_max_seconds: 300,
  failure_threshold: 5,
});

const emptyToolDefault = (taskType: ScheduleRuntimeTaskType, label: string): ScheduleRuntimeToolDefault => ({
  task_type: taskType,
  label,
  create_task_enabled: !['binary_firmware_e2e', 'binary_module_e2e'].includes(taskType),
  root_task_key_max_concurrency: 0,
  capacity_pool_ids: [...(DEFAULT_CAPACITY_POOL_IDS[taskType] || [])],
  root_task_key_expires_at: '',
});

const normalizeConfig = (value?: ScheduleRuntimeConfig | null): ScheduleRuntimeConfig => {
  const toolDefaults = value?.tool_defaults || [];
  const toolMap = new Map(toolDefaults.map((item) => [item.task_type, item]));
  const normalizedTools = TASK_TYPE_ORDER.map((taskType) => {
    const existing = toolMap.get(taskType);
    return existing || emptyToolDefault(taskType, taskType);
  });
  return {
    config_key: value?.config_key || 'global_default',
    timezone: value?.timezone || 'Asia/Shanghai',
    scheduler_policy: value?.scheduler_policy || emptySchedulerPolicy(),
    user_task_sync_policy: value?.user_task_sync_policy || emptyUserTaskSyncPolicy(),
    tool_defaults: normalizedTools,
    time_windows: (value?.time_windows || []).map((item) => ({
      ...item,
      scheduler_policy: item.scheduler_policy || emptySchedulerPolicy(),
      user_task_sync_policy: item.user_task_sync_policy || emptyUserTaskSyncPolicy(),
      tool_defaults: TASK_TYPE_ORDER.map((taskType) => {
        const match = (item.tool_defaults || []).find((tool) => tool.task_type === taskType);
        const base = normalizedTools.find((tool) => tool.task_type === taskType);
        return match || emptyToolDefault(taskType, base?.label || taskType);
      }),
    })),
    version: value?.version || 1,
    updated_by: value?.updated_by || '',
    updated_at: value?.updated_at || '',
    source: value?.source || 'default',
    effective_now: value?.effective_now || {
      source: 'default',
      active_time_window_name: null,
      timezone: 'Asia/Shanghai',
      scheduler_policy: emptySchedulerPolicy(),
      user_task_sync_policy: emptyUserTaskSyncPolicy(),
      tool_defaults: normalizedTools,
    },
  };
};

const parsePoolIds = (value: string): number[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);

const formatPoolIds = (value: number[] | undefined | null) => (value || []).join(', ');

const overlaps = (rows: ScheduleRuntimeTimeWindow[]) => {
  const segments: Array<{ name: string; start: number; end: number }> = [];
  const toMinute = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  for (const row of rows.filter((item) => item.enabled)) {
    const start = toMinute(row.start_time);
    const end = toMinute(row.end_time);
    if (start === end) return`${row.name} 时段不能覆盖整天`;
    const split = start < end ? [{ start, end }] : [{ start, end: 24 * 60 }, { start: 0, end }];
    for (const current of split) {
      for (const existing of segments) {
        if (Math.max(current.start, existing.start) < Math.min(current.end, existing.end)) {
          return`${row.name} 与 ${existing.name} 存在重叠`;
        }
      }
      segments.push({ name: row.name, start: current.start, end: current.end });
    }
  }
  return '';
};

export const ChimeraScheduleConfigPage: React.FC = () => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const { notify, feedbackNodes } = useUiFeedback();
  const buildVersion = useServiceBuildVersion(scheduleApi.getHealth);
  const [config, setConfig] = useState<ScheduleRuntimeConfig | null>(null);
  const [draft, setDraft] = useState<ScheduleRuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = normalizeConfig(await scheduleApi.getRuntimeConfig());
      setConfig(response);
      setDraft(response);
    } catch (err: any) {
      setError(err?.message || '加载调度参数失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(draft),
    [config, draft],
  );

  const updateSchedulerPolicy = (key: keyof ScheduleRuntimeSchedulerPolicy, value: string) => {
    setDraft((current) => current ? {
      ...current,
      scheduler_policy: {
        ...current.scheduler_policy,
        [key]: ['dispatch_mode', 'queue_strategy'].includes(key) ? value : Number(value || 0),
      },
    } : current);
  };

  const updateToolDefault = (taskType: ScheduleRuntimeTaskType, patch: Partial<ScheduleRuntimeToolDefault>) => {
    setDraft((current) => current ? ({
      ...current,
      tool_defaults: current.tool_defaults.map((item) => item.task_type === taskType ? { ...item, ...patch } : item),
    }) : current);
  };

  const updateTimeWindow = (index: number, patch: Partial<ScheduleRuntimeTimeWindow>) => {
    setDraft((current) => current ? ({
      ...current,
      time_windows: current.time_windows.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }) : current);
  };

  const updateTimeWindowPolicy = (index: number, key: keyof ScheduleRuntimeSchedulerPolicy, value: string) => {
    setDraft((current) => current ? ({
      ...current,
      time_windows: current.time_windows.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        scheduler_policy: {
          ...(item.scheduler_policy || emptySchedulerPolicy()),
          [key]: ['dispatch_mode', 'queue_strategy'].includes(key) ? value : Number(value || 0),
        },
      } : item),
    }) : current);
  };

  const updateTimeWindowTool = (index: number, taskType: ScheduleRuntimeTaskType, patch: Partial<ScheduleRuntimeToolDefault>) => {
    setDraft((current) => current ? ({
      ...current,
      time_windows: current.time_windows.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        tool_defaults: item.tool_defaults.map((tool) => tool.task_type === taskType ? { ...tool, ...patch } : tool),
      } : item),
    }) : current);
  };

  const addWindow = () => {
    setDraft((current) => current ? ({
      ...current,
      time_windows: [
        ...current.time_windows,
        {
          name:`时段 ${current.time_windows.length + 1}`,
          enabled: true,
          start_time: '19:00',
          end_time: '23:00',
          scheduler_policy: { ...current.scheduler_policy },
          user_task_sync_policy: { ...current.user_task_sync_policy },
          tool_defaults: current.tool_defaults.map((item) => ({ ...item })),
        },
      ],
    }) : current);
  };

  const removeWindow = async (index: number) => {
    const confirmed = await showConfirm({ title: '删除时段规则', message: '确认删除这个时段规则吗？', confirmText: '删除', danger: true });
    if (!confirmed) return;
    setDraft((current) => current ? ({
      ...current,
      time_windows: current.time_windows.filter((_, itemIndex) => itemIndex !== index),
    }) : current);
  };

  const handleReset = async () => {
    const confirmed = await showConfirm({ title: '恢复默认值', message: '将删除数据库中的调度参数配置，并恢复为服务默认值。', confirmText: '恢复默认', danger: true });
    if (!confirmed) return;
    setSaving(true);
    try {
      const response = normalizeConfig(await scheduleApi.resetRuntimeConfig());
      setConfig(response);
      setDraft(response);
      notify('已恢复默认调度参数', 'success');
    } catch (err: any) {
      notify(err?.message || '恢复默认值失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    const overlapMessage = overlaps(draft.time_windows);
    if (overlapMessage) {
      notify(overlapMessage, 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        timezone: draft.timezone,
        scheduler_policy: draft.scheduler_policy,
        user_task_sync_policy: draft.user_task_sync_policy,
        tool_defaults: draft.tool_defaults.map((item) => ({
          ...item,
          root_task_key_expires_at: item.root_task_key_expires_at || null,
        })),
        time_windows: draft.time_windows.map((item) => ({
          ...item,
          scheduler_policy: item.scheduler_policy,
          user_task_sync_policy: item.user_task_sync_policy,
          tool_defaults: item.tool_defaults.map((tool) => ({
            ...tool,
            root_task_key_expires_at: tool.root_task_key_expires_at || null,
          })),
        })),
      };
      const response = normalizeConfig(await scheduleApi.saveRuntimeConfig(payload));
      setConfig(response);
      setDraft(response);
      notify('调度参数已保存', 'success');
    } catch (err: any) {
      notify(err?.message || '保存调度参数失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) {
    return (
      <div className="flex h-full items-center justify-center text-theme-text-secondary">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
        正在加载调度参数...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-theme-surface px-4 py-5 md:px-6 2xl:px-8">
      {feedbackNodes}
      <div className="w-full space-y-4">
        <PageHeader
          title={<ServicePageTitle title="调度参数" version={buildVersion} className="" titleClassName="text-2xl font-semibold tracking-tight text-theme-text-primary" />}
          description="统一管理全局调度策略、任务同步参数、Task Key 默认额度与分时段覆盖。"
          actions={<div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <RefreshCw size={16} />
              刷新
            </button>
            <button onClick={() => void handleReset()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-400 hover:bg-amber-500/15 disabled:opacity-60">
              <RotateCcw size={16} />
              恢复默认
            </button>
            <button onClick={() => void handleSave()} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-medium text-white hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              保存配置
            </button>
          </div>}
        />

        {error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-theme-text-muted">时区</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{draft.timezone}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-theme-text-muted">当前命中时段</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{draft.effective_now.active_time_window_name || '基础配置'}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-theme-text-muted">更新人</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{draft.updated_by || '-'}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-theme-text-muted">更新时间</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{draft.updated_at ? new Date(draft.updated_at).toLocaleString('zh-CN') : '-'}</div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          <div className="border-b border-theme-border bg-theme-elevated px-4 py-4 md:px-5">
            <h2 className="text-lg font-semibold text-theme-text-primary">任务同步参数</h2>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {SYNC_POLICY_FIELDS.map(({ key, label, type, help }) => {
              const value = (draft.user_task_sync_policy as any)?.[key];
              return (
                <label key={key} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                  <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
                  <div className="mt-1 text-xs leading-5 text-theme-text-muted">{help}</div>
                  {type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => setDraft((current) => current ? ({
                        ...current,
                        user_task_sync_policy: {
                          ...current.user_task_sync_policy,
                          enabled: event.target.checked,
                        },
                      }) : current)}
                      className="mt-3 h-4 w-4"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={value ?? 0}
                      onChange={(event) => setDraft((current) => current ? ({
                        ...current,
                        user_task_sync_policy: {
                          ...current.user_task_sync_policy,
                          [key]: Number(event.target.value || 0),
                        },
                      }) : current)}
                      className="form-input mt-3 w-full"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>

 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          <div className="border-b border-theme-border bg-theme-elevated px-4 py-4 md:px-5">
            <h2 className="text-lg font-semibold text-theme-text-primary">调度策略</h2>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
            {SCHEDULER_POLICY_FIELDS.map(({ key, label, help }) => (
              <label key={key} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
                <div className="mt-1 text-xs leading-5 text-theme-text-muted">{help}</div>
                <input
                  type="number"
                  min={1}
                  value={(draft.scheduler_policy as any)[key]}
                  onChange={(event) => updateSchedulerPolicy(key as keyof ScheduleRuntimeSchedulerPolicy, event.target.value)}
                  className="form-input mt-3 w-full"
                />
              </label>
            ))}
            <label className="block rounded-xl border border-theme-border bg-theme-surface p-4">
              <div className="text-sm font-bold text-theme-text-secondary">分发策略</div>
              <div className="mt-1 text-xs leading-5 text-theme-text-muted">
                {DISPATCH_MODE_OPTIONS.find((item) => item.value === draft.scheduler_policy.dispatch_mode)?.help}
              </div>
              <select value={draft.scheduler_policy.dispatch_mode} onChange={(event) => updateSchedulerPolicy('dispatch_mode', event.target.value)} className="form-input mt-3 w-full">
                {DISPATCH_MODE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="block rounded-xl border border-theme-border bg-theme-surface p-4">
              <div className="text-sm font-bold text-theme-text-secondary">队列策略</div>
              <div className="mt-1 text-xs leading-5 text-theme-text-muted">
                {QUEUE_STRATEGY_OPTIONS.find((item) => item.value === draft.scheduler_policy.queue_strategy)?.help}
              </div>
              <select value={draft.scheduler_policy.queue_strategy} onChange={(event) => updateSchedulerPolicy('queue_strategy', event.target.value)} className="form-input mt-3 w-full">
                {QUEUE_STRATEGY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          <div className="border-b border-theme-border bg-theme-elevated px-4 py-4 md:px-5">
            <h2 className="text-lg font-semibold text-theme-text-primary">工具默认配置</h2>
            <p className="mt-1 text-sm text-theme-text-muted">“允许在测试任务中新建”仅影响前端新建任务弹窗的可选状态，不控制后端服务是否运行。</p>
          </div>
          <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-2">
            {draft.tool_defaults.map((item) => (
              <div key={item.task_type} className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-theme-text-primary">{item.label}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">仅控制“测试任务 → 新建任务”里该工具是否可选。</div>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-elevated px-3 py-1.5 text-sm font-semibold text-theme-text-secondary">
                    <input
                      type="checkbox"
                      checked={item.create_task_enabled ?? true}
                      onChange={(event) => updateToolDefault(item.task_type, { create_task_enabled: event.target.checked })}
                    />
                    允许前端新建
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-bold text-theme-text-secondary">Task Key 最大并发</div>
                    <div className="mt-1 text-xs leading-5 text-theme-text-muted">限制同一 Task Key 同时派发的最大任务数，填 0 表示不单独限流。</div>
                    <input type="number" min={0} value={item.root_task_key_max_concurrency} onChange={(event) => updateToolDefault(item.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="form-input mt-2 w-full" />
                  </label>
                  <label className="block">
                    <div className="text-sm font-bold text-theme-text-secondary">Capacity Pool IDs</div>
                    <div className="mt-1 text-xs leading-5 text-theme-text-muted">指定该任务类型默认占用的容量池编号，可填多个，用英文逗号分隔。</div>
                    <input value={formatPoolIds(item.capacity_pool_ids)} onChange={(event) => updateToolDefault(item.task_type, { capacity_pool_ids: parsePoolIds(event.target.value) })} placeholder="例如 1,2,3" className="form-input mt-2 w-full" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme-border bg-theme-elevated px-4 py-4 md:px-5">
            <div>
              <h2 className="text-lg font-semibold text-theme-text-primary">时段规则</h2>
              <p className="mt-1 text-sm text-theme-text-muted">支持配置多个白天/夜间时段，命中后覆盖基础调度参数。</p>
            </div>
            <button onClick={addWindow} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <Plus size={16} />
              新增时段
            </button>
          </div>
          <div className="space-y-5 p-4 md:p-5">
            {draft.time_windows.map((window, index) => (
              <div key={`${window.name}-${index}`} className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input value={window.name} onChange={(event) => updateTimeWindow(index, { name: event.target.value })} className="form-input" />
                    <input value={window.start_time} onChange={(event) => updateTimeWindow(index, { start_time: event.target.value })} placeholder="09:00" className="form-input w-28" />
                    <span className="text-theme-text-muted">至</span>
                    <input value={window.end_time} onChange={(event) => updateTimeWindow(index, { end_time: event.target.value })} placeholder="18:00" className="form-input w-28" />
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
                      <input type="checkbox" checked={window.enabled} onChange={(event) => updateTimeWindow(index, { enabled: event.target.checked })} />
                      启用
                    </label>
                  </div>
                  <button onClick={() => void removeWindow(index)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-400 hover:bg-rose-500/15">
                    <Trash2 size={16} />
                    删除
                  </button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {SCHEDULER_POLICY_FIELDS.map(({ key, label, help }) => (
                    <label key={`${window.name}-${key}`} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
                      <div className="mt-1 text-xs leading-5 text-theme-text-muted">{help}</div>
                      <input type="number" min={1} value={(window.scheduler_policy as any)?.[key] ?? 0} onChange={(event) => updateTimeWindowPolicy(index, key as keyof ScheduleRuntimeSchedulerPolicy, event.target.value)} className="form-input mt-3 w-full" />
                    </label>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {SYNC_POLICY_FIELDS.filter((item) => ['worker_concurrency', 'db_fallback_batch_size', 'reclaim_batch_size'].includes(item.key)).map(({ key, label, help }) => (
                    <label key={`${window.name}-sync-${key}`} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
                      <div className="mt-1 text-xs leading-5 text-theme-text-muted">{help}</div>
                      <input
                        type="number"
                        min={1}
                        value={(window.user_task_sync_policy as any)?.[key] ?? (draft.user_task_sync_policy as any)?.[key] ?? 0}
                        onChange={(event) => updateTimeWindow(index, {
                          user_task_sync_policy: {
                            ...(window.user_task_sync_policy || draft.user_task_sync_policy),
                            [key]: Number(event.target.value || 0),
                          },
                        })}
                        className="form-input mt-3 w-full"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {window.tool_defaults.map((tool) => (
                    <div key={`${window.name}-${tool.task_type}`} className="rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-semibold text-theme-text-primary">{tool.label}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-bold uppercase tracking-wider text-theme-text-muted">Task Key 最大并发</div>
                          <div className="mt-1 text-xs leading-5 text-theme-text-muted">命中该时段后，覆盖该任务类型的 Task Key 并发上限。</div>
                          <input type="number" min={0} value={tool.root_task_key_max_concurrency} onChange={(event) => updateTimeWindowTool(index, tool.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="form-input mt-2 w-full" />
                        </label>
                        <label className="block">
                          <div className="text-xs font-bold uppercase tracking-wider text-theme-text-muted">Capacity Pool IDs</div>
                          <div className="mt-1 text-xs leading-5 text-theme-text-muted">命中该时段后，覆盖该任务类型默认使用的容量池列表。</div>
                          <input value={formatPoolIds(tool.capacity_pool_ids)} onChange={(event) => updateTimeWindowTool(index, tool.task_type, { capacity_pool_ids: parsePoolIds(event.target.value) })} placeholder="例如 1,2,3" className="form-input mt-2 w-full" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {draft.time_windows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-8 text-center text-sm font-semibold text-theme-text-muted">当前没有时段规则，系统将始终使用基础配置。</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};
