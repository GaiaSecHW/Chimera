import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';

export const BinarySecurityConfigPage: React.FC = () => {
  const executionApi = api.domains.execution;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(50);
  const [dispatchTimeoutSeconds, setDispatchTimeoutSeconds] = useState(60);

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await executionApi.binarySecurity.getServiceConfig();
      setMaxConcurrentTasks(data.config.max_concurrent_tasks);
      setDispatchTimeoutSeconds(data.config.dispatch_timeout_seconds);
    } catch (e: any) {
      setError(e?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await executionApi.binarySecurity.updateServiceConfig({
        max_concurrent_tasks: Math.max(1, Math.min(200, Number(maxConcurrentTasks) || 50)),
        dispatch_timeout_seconds: Math.max(10, Math.min(600, Number(dispatchTimeoutSeconds) || 60)),
      });
      setMaxConcurrentTasks(data.config.max_concurrent_tasks);
      setDispatchTimeoutSeconds(data.config.dispatch_timeout_seconds);
      setMessage('配置已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">参数配置</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              服务级全局队列配置，对所有项目和所有二进制安全任务生效。多实例部署下，调度器会按这里的并发上限统一抢占任务。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Settings size={18} className="text-rose-600" />
          <h2 className="text-xl font-black text-slate-900">队列控制</h2>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
            secflow-app-binary-security
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          当前面板配置项归属于 `secflow-app-binary-security` 微服务，用于控制该服务在多实例部署下的全局任务调度行为。
        </p>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-5">
            <div className="text-sm font-bold text-slate-700">最大并发总任务数</div>
            <div className="mt-2 text-xs text-slate-500">范围 1-200，默认 50。全局限制 `running + dispatching` 的总任务数。</div>
            <input
              type="number"
              min={1}
              max={200}
              disabled={loading || saving}
              value={maxConcurrentTasks}
              onChange={(e) => setMaxConcurrentTasks(Number(e.target.value || 50))}
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
          <div className="rounded-2xl bg-white p-5">
            <div className="text-sm font-bold text-slate-700">调度占用超时秒数</div>
            <div className="mt-2 text-xs text-slate-500">范围 10-600，默认 60。任务长时间停在 `dispatching` 时会被回收到 `pending`。</div>
            <input
              type="number"
              min={10}
              max={600}
              disabled={loading || saving}
              value={dispatchTimeoutSeconds}
              onChange={(e) => setDispatchTimeoutSeconds(Number(e.target.value || 60))}
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {loading && <div className="text-sm text-slate-500">加载中...</div>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            <Save size={16} />
            保存二进制安全配置
          </button>
        </div>
      </section>

      <FirmwareUnpackConfigPage projectId="" embedded />
    </div>
  );
};
