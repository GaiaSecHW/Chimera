import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { B2SServiceConfig } from '../../clients/binaryToSource';
import { useUiFeedback } from '../../components/UiFeedback';

const defaultConfig = (projectId: string): B2SServiceConfig => ({
  project_id: projectId,
  budget_exhausted_action: 'treat_as_passed',
});

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
    <div>
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
    </label>
    {children}
  </div>
);

export const B2SConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const b2sApi = api.domains.execution.binaryToSource;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<B2SServiceConfig>(() => defaultConfig(projectId));

  const reload = async () => {
    setLoading(true);
    try {
      const next = await b2sApi.getConfig(projectId);
      setConfig({ ...defaultConfig(projectId), ...next, project_id: projectId });
    } catch (err: any) {
      notify(`加载配置失败: ${err?.message ?? err}`, 'error');
      setConfig(defaultConfig(projectId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await b2sApi.saveConfig(projectId, config);
      setConfig({ ...defaultConfig(projectId), ...saved, project_id: projectId });
      notify('配置已保存', 'success');
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'px-8 pt-8 pb-10 space-y-6'}>
      {feedbackNodes}

      {embedded ? (
        <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Settings size={18} className="text-rose-600" />
                <h2 className="text-xl font-black text-slate-900">二进制逆向参数配置</h2>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
                  secflow-app-binary-to-source
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                当前配置项归属于 `secflow-app-binary-to-source` 微服务，用于控制反编译子任务在预算耗尽类终态下的默认收敛动作。
              </p>
              {config.updated_at && <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>}
            </div>
            <button
              type="button"
              onClick={() => { void reload(); }}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          <SectionCard title="终态策略" subtitle="预算耗尽类失败的默认收敛动作">
            <FieldRow label="budget_exhausted_action" hint="当下游返回 max_rounds_exceeded / max_retries_reached / timeout_max_retries_exceeded 等预算耗尽类失败时生效">
              <select
                value={config.budget_exhausted_action}
                onChange={(e) => setConfig((prev) => ({ ...prev, budget_exhausted_action: e.target.value as B2SServiceConfig['budget_exhausted_action'] }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                <option value="treat_as_passed">默认通过，子任务按成功收敛</option>
                <option value="treat_as_failed">判定失败，子任务按失败收敛</option>
              </select>
            </FieldRow>
            <p className="text-xs leading-5 text-slate-500">
              默认值为 `treat_as_passed`。当 `pi-re-agent` 返回预算耗尽类失败时，B2S 会按这里的策略把该子任务收敛为成功或失败。
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => { void save(); }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                保存配置
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
};
