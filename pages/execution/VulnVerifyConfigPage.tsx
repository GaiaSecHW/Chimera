import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, ShieldCheck } from 'lucide-react';

import { api } from '../../clients/api';
import type { LlmProviderSummary } from '../../types/types';

const sourceLabel = (source?: string) => {
  switch (source) {
    case 'service_config':
      return '漏洞验证服务配置';
    case 'configcenter_pi_settings':
      return '模型配置中心全局默认';
    case 'none':
      return '未解析到默认模型';
    default:
      return source || '-';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
};

export const VulnVerifyConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const vulnVerifyApi = api.domains.execution.vulnVerify;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [effectiveDefaultModel, setEffectiveDefaultModel] = useState<string | null>(null);
  const [source, setSource] = useState('none');
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const [configResp, providersResp] = await Promise.all([
        vulnVerifyApi.getServiceConfig(projectId),
        api.configCenter.listLlmProviders().catch(() => ({ items: [] as LlmProviderSummary[] })),
      ]);
      setDefaultModel(configResp.config?.default_model || '');
      setEffectiveDefaultModel(configResp.effective_default_model || null);
      setSource(configResp.source || 'none');
      setUpdatedBy(configResp.updated_by || null);
      setUpdatedAt(configResp.updated_at || null);
      const options = (providersResp.items || [])
        .filter((provider: LlmProviderSummary) => provider.enabled && provider.provider_key && provider.model)
        .map((provider: LlmProviderSummary) => `${provider.provider_key}/${provider.model}`);
      setModelOptions(Array.from(new Set(options)));
    } catch (err: any) {
      setError(err?.message || '加载漏洞验证配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const resp = await vulnVerifyApi.saveServiceConfig(projectId, {
        default_model: defaultModel.trim() || null,
      });
      setDefaultModel(resp.config?.default_model || '');
      setEffectiveDefaultModel(resp.effective_default_model || null);
      setSource(resp.source || 'none');
      setUpdatedBy(resp.updated_by || null);
      setUpdatedAt(resp.updated_at || null);
      setMessage('漏洞验证默认模型配置已保存，仅影响后续新建任务');
    } catch (err: any) {
      setError(err?.message || '保存漏洞验证配置失败');
    } finally {
      setSaving(false);
    }
  };

  const containerClass = embedded ? '' : 'p-8';

  return (
    <div className={containerClass}>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-black text-slate-900">漏洞验证参数配置</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              配置 secflow-app-vuln-verify 新建任务默认模型。保存后只影响后续新建任务，不影响已创建任务；留空则继承模型配置中心的全局默认模型。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <label className="block">
              <div className="text-sm font-black text-slate-800">默认模型 default_model</div>
              <select
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
                disabled={loading || saving}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">继承模型配置中心全局默认模型</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              如果留空，创建任务不会显式传递 --model，pi 将使用 ConfigCenter 同步到 settings.json 的全局默认模型。
            </p>
            {defaultModel && !modelOptions.includes(defaultModel) ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                当前保存的模型不在可选 Provider 列表中，仍可保存；请确认模型配置中心中该 Provider 可用。
              </div>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Effective</div>
            <div className="mt-3 text-xs text-slate-500">当前有效默认模型</div>
            <div className="mt-1 break-all font-mono text-sm font-black text-slate-900">
              {effectiveDefaultModel || defaultModel || '继承 ConfigCenter 全局默认'}
            </div>
            <div className="mt-4 text-xs text-slate-500">来源</div>
            <div className="mt-1 font-bold text-slate-800">{sourceLabel(source)}</div>
            <div className="mt-4 text-xs text-slate-500">最近更新</div>
            <div className="mt-1 text-slate-800">{updatedBy || '-'}</div>
            <div className="mt-1 font-mono text-xs text-slate-500">{formatDate(updatedAt)}</div>
          </aside>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </section>
    </div>
  );
};
