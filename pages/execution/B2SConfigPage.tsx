import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { B2SLlmProviderSummary, B2SServiceConfig } from '../../clients/binaryToSource';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

const defaultConfig = (projectId: string): B2SServiceConfig => ({
  project_id: projectId,
  budget_exhausted_action: 'treat_as_passed',
  llm_provider_key: null,
  effective_llm_provider: null,
});

const B2S_FLOW = {
  title: '二进制逆向阶段推进关系',
  subtitle: '展示二进制逆向微服务从静态分析到源码合并的固定推进链路，便于理解预算耗尽类策略最终会影响哪个收敛位置。',
  lanes: [
    {
      label: '反编译主链路',
      steps: [
        { id: 'b2s-ida', title: '静态分析', desc: '执行基础反汇编与符号识别，建立函数和上下文信息。', badge: '1', tone: 'analysis' as const },
        { id: 'b2s-batching', title: '函数分批', desc: '按函数规模拆分处理批次，为后续并行还原做准备。', badge: '2', tone: 'analysis' as const },
        { id: 'b2s-header', title: '生成头文件', desc: '先生成类型声明、函数原型和公共头部内容。', badge: '3', tone: 'artifact' as const },
        { id: 'b2s-body', title: '还原函数体', desc: '按批次逐步还原函数体源码，是主要耗时阶段。', badge: '4', tone: 'review' as const },
        { id: 'b2s-merge', title: '合并结果', desc: '合并头文件、函数体和补充信息，产出最终源码结果。', badge: '5', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '预算耗尽收敛',
      detail: '当下游返回 max_rounds_exceeded、max_retries_reached 或 timeout_max_retries_exceeded 等预算耗尽类终态时，会由当前页面的默认策略决定按通过还是失败收敛。',
      tone: 'review' as const,
    },
  ],
};

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  subtitle,
  actions,
  children,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions}
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

const PanelActions: React.FC<{ saving: boolean; onSave: () => void; onReset: () => void }> = ({ saving, onSave, onReset }) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      保存配置
    </button>
  </div>
);

export const B2SConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const b2sApi = api.domains.execution.binaryToSource;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<B2SServiceConfig>(() => defaultConfig(projectId));
  const [savedConfig, setSavedConfig] = useState<B2SServiceConfig>(() => defaultConfig(projectId));
  const [llmProviders, setLlmProviders] = useState<B2SLlmProviderSummary[]>([]);

  const reload = async () => {
    setLoading(true);
    try {
      const [next, providerResponse] = await Promise.all([
        b2sApi.getConfig(projectId),
        b2sApi.listLlmProviders(projectId),
      ]);
      const normalized = { ...defaultConfig(projectId), ...next, project_id: projectId };
      setConfig(normalized);
      setSavedConfig(normalized);
      setLlmProviders(Array.isArray(providerResponse?.items) ? providerResponse.items : []);
    } catch (err: any) {
      notify(`加载配置失败: ${err?.message ?? err}`, 'error');
      const fallback = defaultConfig(projectId);
      setConfig(fallback);
      setSavedConfig(fallback);
      setLlmProviders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [projectId]);

  const persistConfig = async (nextConfig: B2SServiceConfig, message: string) => {
    setSaving(true);
    try {
      const saved = await b2sApi.saveConfig(projectId, nextConfig);
      const normalized = { ...defaultConfig(projectId), ...saved, project_id: projectId };
      setConfig(normalized);
      setSavedConfig(normalized);
      notify(message, 'success');
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveProviderConfig = async () => {
    await persistConfig(
      {
        ...savedConfig,
        llm_provider_key: config.llm_provider_key || null,
      },
      'LLM / Agent 配置已保存',
    );
  };

  const saveBudgetPolicy = async () => {
    await persistConfig(
      {
        ...savedConfig,
        budget_exhausted_action: config.budget_exhausted_action,
      },
      '终态策略已保存',
    );
  };

  const resetProviderConfig = () => {
    setConfig((prev) => ({ ...prev, llm_provider_key: null }));
    notify('LLM / Agent 配置已重置为默认值（尚未保存）', 'info');
  };

  const resetPolicy = () => {
    setConfig((prev) => ({ ...prev, budget_exhausted_action: defaultConfig(projectId).budget_exhausted_action }));
    notify('终态策略已重置为默认值（尚未保存）', 'info');
  };

  const effectiveProvider = config.llm_provider_key
    ? llmProviders.find((item) => item.provider_key === config.llm_provider_key)
      || (config.effective_llm_provider?.provider_key === config.llm_provider_key ? config.effective_llm_provider : null)
    : llmProviders.find((item) => item.provider_key === config.effective_llm_provider?.provider_key)
      || llmProviders.find((item) => item.is_default)
      || llmProviders[0]
      || config.effective_llm_provider
      || null;
  const hasSelectedProviderInList = !config.llm_provider_key || llmProviders.some((item) => item.provider_key === config.llm_provider_key);

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
                当前配置项归属于 `secflow-app-binary-to-source` 微服务，用于控制反编译子任务默认使用的 LLM Provider，以及预算耗尽类终态的收敛动作。
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
          <StaticPipelineFlow
            title={B2S_FLOW.title}
            subtitle={B2S_FLOW.subtitle}
            lanes={B2S_FLOW.lanes}
            notes={B2S_FLOW.notes}
          />
          <SectionCard
            title="LLM / Agent 配置"
            subtitle="配置二进制逆向任务默认使用的 LLM Provider。修改只影响后续新建任务，不影响已创建任务及其重试/重跑。"
            actions={<PanelActions saving={saving} onSave={() => { void saveProviderConfig(); }} onReset={resetProviderConfig} />}
          >
            <FieldRow label="默认 LLM Provider" hint="llm_provider_key">
              <select
                value={config.llm_provider_key || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, llm_provider_key: e.target.value || null }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">跟随配置中心默认 Provider</option>
                {!hasSelectedProviderInList && config.llm_provider_key ? (
                  <option value={config.llm_provider_key}>
                    {config.llm_provider_key} · 已失效或已禁用
                  </option>
                ) : null}
                {llmProviders.map((provider) => (
                  <option key={provider.provider_key} value={provider.provider_key} disabled={!provider.enabled}>
                    {(provider.display_name || provider.provider_key)} · {provider.provider_type || 'unknown'} · {provider.model || 'no-model'}{provider.is_default ? ' · 平台默认' : ''}
                  </option>
                ))}
              </select>
            </FieldRow>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-semibold text-slate-800">当前生效 Provider</div>
              {effectiveProvider ? (
                <div className="mt-2 space-y-1 text-xs">
                  <div>名称：{effectiveProvider.display_name || effectiveProvider.provider_key}</div>
                  <div className="font-mono break-all">Key：{effectiveProvider.provider_key}</div>
                  <div>类型：{effectiveProvider.provider_type || '-'}</div>
                  <div>模型：{effectiveProvider.model || '-'}</div>
                  <div>{effectiveProvider.is_default ? '平台默认 Provider' : '项目指定 Provider'}</div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-amber-700">
                  当前无法解析有效 Provider。若项目已保存特定 Provider，请检查该 Provider 是否仍在配置中心启用。
                </div>
              )}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              任务创建时若未手工指定 `llm_provider_key`，默认取这里的项目级 Provider；若这里留空，则回退到配置中心默认 Provider。
            </p>
          </SectionCard>
          <SectionCard
            title="终态策略"
            subtitle="预算耗尽类失败的默认收敛动作"
            actions={<PanelActions saving={saving} onSave={() => { void saveBudgetPolicy(); }} onReset={resetPolicy} />}
          >
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
          </SectionCard>
        </div>
      )}
    </div>
  );
};
