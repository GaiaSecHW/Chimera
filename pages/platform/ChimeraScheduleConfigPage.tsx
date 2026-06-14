import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  ScheduleRuntimeConfig,
  ScheduleRuntimeSchedulerPolicy,
  ScheduleRuntimeTaskType,
  ScheduleRuntimeTimeWindow,
  ScheduleRuntimeToolDefault,
} from '../../types/types';

const TASK_TYPE_ORDER: ScheduleRuntimeTaskType[] = [
  'binary_firmware_e2e',
  'source_scan_e2e',
  'binary_module_e2e',
  'ai4red',
  'ai4apk',
  'sechps_tool',
];

const DEFAULT_CAPACITY_POOL_IDS: Record<ScheduleRuntimeTaskType, number[]> = {
  binary_firmware_e2e: [1],
  source_scan_e2e: [1],
  binary_module_e2e: [1],
  ai4red: [],
  ai4apk: [1],
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

const emptyToolDefault = (taskType: ScheduleRuntimeTaskType, label: string): ScheduleRuntimeToolDefault => ({
  task_type: taskType,
  label,
  default_concurrency: 1,
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
    tool_defaults: normalizedTools,
    time_windows: (value?.time_windows || []).map((item) => ({
      ...item,
      scheduler_policy: item.scheduler_policy || emptySchedulerPolicy(),
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
    if (start === end) return `${row.name} 时段不能覆盖整天`;
    const split = start < end ? [{ start, end }] : [{ start, end: 24 * 60 }, { start: 0, end }];
    for (const current of split) {
      for (const existing of segments) {
        if (Math.max(current.start, existing.start) < Math.min(current.end, existing.end)) {
          return `${row.name} 与 ${existing.name} 存在重叠`;
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

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(draft), [config, draft]);

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
          name: `时段 ${current.time_windows.length + 1}`,
          enabled: true,
          start_time: '19:00',
          end_time: '23:00',
          scheduler_policy: { ...current.scheduler_policy },
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
        tool_defaults: draft.tool_defaults.map((item) => ({
          ...item,
          root_task_key_expires_at: item.root_task_key_expires_at || null,
        })),
        time_windows: draft.time_windows.map((item) => ({
          ...item,
          scheduler_policy: item.scheduler_policy,
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
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 p-6">
      {feedbackNodes}
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">Task Schedule</div>
              <h1 className="mt-2 text-3xl font-black text-slate-900">调度参数</h1>
              <p className="mt-2 text-sm text-slate-600">统一管理全局调度策略、工具默认并发与分时段并发覆盖。</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw size={16} />
                刷新
              </button>
              <button onClick={() => void handleReset()} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60">
                <RotateCcw size={16} />
                恢复默认
              </button>
              <button onClick={() => void handleSave()} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存配置
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">时区</div>
              <div className="mt-2 text-lg font-black text-slate-900">{draft.timezone}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">当前命中时段</div>
              <div className="mt-2 text-lg font-black text-slate-900">{draft.effective_now.active_time_window_name || '基础配置'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">更新人</div>
              <div className="mt-2 text-lg font-black text-slate-900">{draft.updated_by || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">更新时间</div>
              <div className="mt-2 text-lg font-black text-slate-900">{draft.updated_at ? new Date(draft.updated_at).toLocaleString('zh-CN') : '-'}</div>
            </div>
          </div>
          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">调度策略</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['project_default_concurrency', '项目默认并发'],
              ['target_default_concurrency', '目标默认并发'],
              ['worker_concurrency', 'Worker 并发'],
              ['ready_backfill_batch_size', 'Ready 回填批量'],
              ['db_fallback_batch_size', 'DB 回扫批量'],
            ].map(([key, label]) => (
              <label key={key} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-700">{label}</div>
                <input
                  type="number"
                  min={1}
                  value={(draft.scheduler_policy as any)[key]}
                  onChange={(event) => updateSchedulerPolicy(key as keyof ScheduleRuntimeSchedulerPolicy, event.target.value)}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400"
                />
              </label>
            ))}
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-700">分发策略</div>
              <select value={draft.scheduler_policy.dispatch_mode} onChange={(event) => updateSchedulerPolicy('dispatch_mode', event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400">
                <option value="balanced">balanced</option>
                <option value="fifo">fifo</option>
                <option value="priority_first">priority_first</option>
              </select>
            </label>
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-700">队列策略</div>
              <select value={draft.scheduler_policy.queue_strategy} onChange={(event) => updateSchedulerPolicy('queue_strategy', event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400">
                <option value="capacity_aware">capacity_aware</option>
                <option value="strict_fifo">strict_fifo</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">工具默认并发</h2>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {draft.tool_defaults.map((item) => (
              <div key={item.task_type} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
                <div className="text-lg font-black text-slate-900">{item.label}</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-bold text-slate-700">默认并发</div>
                    <input type="number" min={1} value={item.default_concurrency} onChange={(event) => updateToolDefault(item.task_type, { default_concurrency: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                  </label>
                  <label className="block">
                    <div className="text-sm font-bold text-slate-700">Root Task Key 默认并发</div>
                    <input type="number" min={0} value={item.root_task_key_max_concurrency} onChange={(event) => updateToolDefault(item.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                  </label>
                  <label className="block md:col-span-2">
                    <div className="text-sm font-bold text-slate-700">Capacity Pool IDs</div>
                    <input value={formatPoolIds(item.capacity_pool_ids)} onChange={(event) => updateToolDefault(item.task_type, { capacity_pool_ids: parsePoolIds(event.target.value) })} placeholder="例如 1,2,3" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">时段规则</h2>
              <p className="mt-1 text-sm text-slate-500">支持配置多个白天/夜间时段，命中后覆盖基础调度参数。</p>
            </div>
            <button onClick={addWindow} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700 hover:bg-cyan-100">
              <Plus size={16} />
              新增时段
            </button>
          </div>
          <div className="mt-5 space-y-5">
            {draft.time_windows.map((window, index) => (
              <div key={`${window.name}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input value={window.name} onChange={(event) => updateTimeWindow(index, { name: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-400" />
                    <input value={window.start_time} onChange={(event) => updateTimeWindow(index, { start_time: event.target.value })} placeholder="09:00" className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                    <span className="text-slate-400">至</span>
                    <input value={window.end_time} onChange={(event) => updateTimeWindow(index, { end_time: event.target.value })} placeholder="18:00" className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <input type="checkbox" checked={window.enabled} onChange={(event) => updateTimeWindow(index, { enabled: event.target.checked })} />
                      启用
                    </label>
                  </div>
                  <button onClick={() => void removeWindow(index)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100">
                    <Trash2 size={16} />
                    删除
                  </button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['project_default_concurrency', '项目默认并发'],
                    ['target_default_concurrency', '目标默认并发'],
                    ['worker_concurrency', 'Worker 并发'],
                    ['ready_backfill_batch_size', 'Ready 回填批量'],
                    ['db_fallback_batch_size', 'DB 回扫批量'],
                  ].map(([key, label]) => (
                    <label key={`${window.name}-${key}`} className="block rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-bold text-slate-700">{label}</div>
                      <input type="number" min={1} value={(window.scheduler_policy as any)?.[key] ?? 0} onChange={(event) => updateTimeWindowPolicy(index, key as keyof ScheduleRuntimeSchedulerPolicy, event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                    </label>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {window.tool_defaults.map((tool) => (
                    <div key={`${window.name}-${tool.task_type}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-black text-slate-900">{tool.label}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">默认并发</div>
                          <input type="number" min={1} value={tool.default_concurrency} onChange={(event) => updateTimeWindowTool(index, tool.task_type, { default_concurrency: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                        </label>
                        <label className="block">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Root Key 并发</div>
                          <input type="number" min={0} value={tool.root_task_key_max_concurrency} onChange={(event) => updateTimeWindowTool(index, tool.task_type, { root_task_key_max_concurrency: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {draft.time_windows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">当前没有时段规则，系统将始终使用基础配置。</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};
