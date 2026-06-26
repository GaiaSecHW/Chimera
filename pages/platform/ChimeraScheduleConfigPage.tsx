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
            {[
              ['enabled', '启用', 'checkbox'],
              ['worker_concurrency', '任务同步 Worker 并发', 'number'],
              ['lease_seconds', 'Lease 秒数', 'number'],
              ['heartbeat_interval_seconds', '心跳间隔秒数', 'number'],
              ['db_fallback_batch_size', 'DB 回扫批量', 'number'],
              ['queue_pop_timeout_seconds', '队列弹出超时', 'number'],
              ['reclaim_batch_size', '回收批量', 'number'],
              ['dispatching_seconds', 'Dispatching 超时', 'number'],
              ['running_seconds', 'Running 超时', 'number'],
              ['paused_seconds', 'Paused 超时', 'number'],
              ['terminal_verify_seconds', '终态校验秒数', 'number'],
              ['retry_initial_seconds', '重试初始秒数', 'number'],
              ['retry_max_seconds', '重试最大秒数', 'number'],
              ['failure_threshold', '失败阈值', 'number'],
            ].map(([key, label, type]) => {
              const value = (draft.user_task_sync_policy as any)?.[key];
              return (
                <label key={key} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                  <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
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
            {[
              ['project_default_concurrency', '项目默认并发'],
              ['target_default_concurrency', '目标默认并发'],
              ['worker_concurrency', '调度执行 Worker 并发'],
              ['ready_backfill_batch_size', 'Ready 回填批量'],
              ['db_fallback_batch_size', 'DB 回扫批量'],
            ].map(([key, label]) => (
              <label key={key} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
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
              <select value={draft.scheduler_policy.dispatch_mode} onChange={(event) => updateSchedulerPolicy('dispatch_mode', event.target.value)} className="form-input mt-3 w-full">
                <option value="balanced">balanced</option>
                <option value="fifo">fifo</option>
                <option value="priority_first">priority_first</option>
              </select>
            </label>
            <label className="block rounded-xl border border-theme-border bg-theme-surface p-4">
              <div className="text-sm font-bold text-theme-text-secondary">队列策略</div>
              <select value={draft.scheduler_policy.queue_strategy} onChange={(event) => updateSchedulerPolicy('queue_strategy', event.target.value)} className="form-input mt-3 w-full">
                <option value="capacity_aware">capacity_aware</option>
                <option value="strict_fifo">strict_fifo</option>
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
                    <input type="number" min={0} value={item.root_task_key_max_concurrency} onChange={(event) => updateToolDefault(item.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="form-input mt-2 w-full" />
                  </label>
                  <label className="block">
                    <div className="text-sm font-bold text-theme-text-secondary">Capacity Pool IDs</div>
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
                  {[
                    ['project_default_concurrency', '项目默认并发'],
                    ['target_default_concurrency', '目标默认并发'],
                    ['worker_concurrency', '调度执行 Worker 并发'],
                    ['ready_backfill_batch_size', 'Ready 回填批量'],
                    ['db_fallback_batch_size', 'DB 回扫批量'],
                  ].map(([key, label]) => (
                    <label key={`${window.name}-${key}`} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
                      <input type="number" min={1} value={(window.scheduler_policy as any)?.[key] ?? 0} onChange={(event) => updateTimeWindowPolicy(index, key as keyof ScheduleRuntimeSchedulerPolicy, event.target.value)} className="form-input mt-3 w-full" />
                    </label>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['worker_concurrency', '任务同步 Worker 并发'],
                    ['db_fallback_batch_size', 'DB 回扫批量'],
                    ['reclaim_batch_size', '回收扫描批量'],
                  ].map(([key, label]) => (
                    <label key={`${window.name}-sync-${key}`} className="block rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-bold text-theme-text-secondary">{label}</div>
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
                          <input type="number" min={0} value={tool.root_task_key_max_concurrency} onChange={(event) => updateTimeWindowTool(index, tool.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="form-input mt-2 w-full" />
                        </label>
                        <label className="block">
                          <div className="text-xs font-bold uppercase tracking-wider text-theme-text-muted">Capacity Pool IDs</div>
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
