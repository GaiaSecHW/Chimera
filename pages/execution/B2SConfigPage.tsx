import React, { useEffect, useState } from 'react';
import { Eye, Loader2, RefreshCw, Save, Settings, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  B2SCacheDetailResponse,
  B2SCacheEntry,
  B2SLlmProviderSummary,
  B2SCacheSummary,
  B2SServiceConfig,
} from '../../clients/binaryToSource';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableEmptyRow, ExecutionTableHead, ExecutionTableTd, ExecutionTableTh, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

type B2SInnerTab = 'runtime' | 'cache';

const defaultConfig = (projectId: string): B2SServiceConfig => ({
  project_id: projectId,
  budget_exhausted_action: 'treat_as_passed',
  concurrency: 8,
  llm_provider_key: null,
  effective_llm_provider: null,
});

const defaultCacheSummary: B2SCacheSummary = {
  visible_entries: 0,
  current_project_entries: 0,
  fast_entries: 0,
  deep_entries: 0,
  total_hit_count: 0,
  latest_hit_at: null,
};

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

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN');
}

function formatNumber(value?: number | null): string {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '-';
  return normalized.toLocaleString('zh-CN');
}

function formatFileSize(value?: number | null): string {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function summarizeGeneratedFiles(entry: B2SCacheDetailResponse | null): string {
  if (!entry) return '-';
  return `${entry.generated_files.length} 个文件`;
}

export const B2SConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const b2sApi = api.domains.execution.binaryToSource;

  const [activeTab, setActiveTab] = useState<B2SInnerTab>('runtime');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<B2SServiceConfig>(() => defaultConfig(projectId));
  const [savedConfig, setSavedConfig] = useState<B2SServiceConfig>(() => defaultConfig(projectId));
  const [llmProviders, setLlmProviders] = useState<B2SLlmProviderSummary[]>([]);

  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheEntries, setCacheEntries] = useState<B2SCacheEntry[]>([]);
  const [cacheTotal, setCacheTotal] = useState(0);
  const [cacheSummary, setCacheSummary] = useState<B2SCacheSummary>(defaultCacheSummary);
  const [cachePage, setCachePage] = useState(1);
  const [cachePageSize, setCachePageSize] = useState(50);
  const [includeAllProjects, setIncludeAllProjects] = useState(false);
  const [cacheModeFilter, setCacheModeFilter] = useState('all');
  const [cacheStatusFilter, setCacheStatusFilter] = useState('ready');
  const [cacheHitsFilter, setCacheHitsFilter] = useState('all');
  const [cacheKeyFilter, setCacheKeyFilter] = useState('');
  const [elfBasenameFilter, setElfBasenameFilter] = useState('');
  const [sourceTaskIdFilter, setSourceTaskIdFilter] = useState('');
  const [sourceItemIdFilter, setSourceItemIdFilter] = useState('');
  const [selectedCacheKeys, setSelectedCacheKeys] = useState<Set<string>>(new Set());
  const [cacheDetail, setCacheDetail] = useState<B2SCacheDetailResponse | null>(null);
  const [cacheDetailLoading, setCacheDetailLoading] = useState(false);
  const [cacheDeletingKeys, setCacheDeletingKeys] = useState<Set<string>>(new Set());
  const [cacheBatchDeleting, setCacheBatchDeleting] = useState(false);

  const loadRuntimeConfig = async () => {
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

  const loadCacheEntries = async () => {
    setCacheLoading(true);
    try {
      const response = await b2sApi.listCache(projectId, {
        limit: cachePageSize,
        offset: (cachePage - 1) * cachePageSize,
        include_all_projects: includeAllProjects,
        mode: cacheModeFilter === 'all' ? undefined : cacheModeFilter,
        status: cacheStatusFilter === 'all' ? undefined : cacheStatusFilter,
        has_hits: cacheHitsFilter === 'all' ? undefined : cacheHitsFilter,
        cache_key: cacheKeyFilter.trim() || undefined,
        elf_basename: elfBasenameFilter.trim() || undefined,
        source_task_id: sourceTaskIdFilter.trim() || undefined,
        source_item_id: sourceItemIdFilter.trim() || undefined,
      });
      setCacheEntries(response.items || []);
      setCacheTotal(response.total || 0);
      setCacheSummary(response.summary || defaultCacheSummary);
      setSelectedCacheKeys((current) => {
        const valid = new Set((response.items || []).map((item) => item.cache_key));
        return new Set(Array.from(current).filter((item) => valid.has(item)));
      });
    } catch (err: any) {
      notify(`加载缓存失败: ${err?.message ?? err}`, 'error');
      setCacheEntries([]);
      setCacheTotal(0);
      setCacheSummary(defaultCacheSummary);
      setSelectedCacheKeys(new Set());
    } finally {
      setCacheLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntimeConfig();
  }, [projectId]);

  useEffect(() => {
    void loadCacheEntries();
  }, [
    projectId,
    cachePage,
    cachePageSize,
    includeAllProjects,
    cacheModeFilter,
    cacheStatusFilter,
    cacheHitsFilter,
    cacheKeyFilter,
    elfBasenameFilter,
    sourceTaskIdFilter,
    sourceItemIdFilter,
  ]);

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

  const saveConcurrencyConfig = async () => {
    await persistConfig(
      {
        ...savedConfig,
        concurrency: Math.max(1, Math.min(16, Number.isFinite(config.concurrency) ? config.concurrency : 8)),
      },
      '批次并发配置已保存',
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

  const resetConcurrencyConfig = () => {
    setConfig((prev) => ({ ...prev, concurrency: defaultConfig(projectId).concurrency }));
    notify('批次并发已重置为默认值（尚未保存）', 'info');
  };

  const resetCacheFilters = () => {
    setIncludeAllProjects(false);
    setCacheModeFilter('all');
    setCacheStatusFilter('ready');
    setCacheHitsFilter('all');
    setCacheKeyFilter('');
    setElfBasenameFilter('');
    setSourceTaskIdFilter('');
    setSourceItemIdFilter('');
    setCachePage(1);
    notify('缓存筛选条件已重置', 'info');
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
  const allPageSelected = cacheEntries.length > 0 && cacheEntries.every((item) => selectedCacheKeys.has(item.cache_key));
  const selectedCount = selectedCacheKeys.size;
  const cacheTotalPages = Math.max(1, Math.ceil(cacheTotal / cachePageSize));

  const toggleAllCurrentPage = (checked: boolean) => {
    setSelectedCacheKeys((current) => {
      const next = new Set(current);
      cacheEntries.forEach((item) => {
        if (checked) next.add(item.cache_key);
        else next.delete(item.cache_key);
      });
      return next;
    });
  };

  const openCacheDetail = async (cacheKey: string) => {
    setCacheDetail(null);
    setCacheDetailLoading(true);
    try {
      const detail = await b2sApi.getCacheDetail(projectId, cacheKey);
      setCacheDetail(detail);
    } catch (err: any) {
      notify(`加载缓存详情失败: ${err?.message ?? err}`, 'error');
    } finally {
      setCacheDetailLoading(false);
    }
  };

  const deleteSingleCache = async (cacheKey: string) => {
    const confirmed = await showConfirm({
      title: '删除缓存',
      message: `确认删除缓存 ${cacheKey} 吗？删除后后续任务将无法再命中该缓存。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setCacheDeletingKeys((current) => new Set(current).add(cacheKey));
    try {
      const result = await b2sApi.deleteCache(projectId, cacheKey);
      notify(result.message || `缓存 ${cacheKey} 已删除`, result.deleted ? 'success' : 'warning');
      if (cacheDetail?.cache_key === cacheKey) setCacheDetail(null);
      await loadCacheEntries();
    } catch (err: any) {
      notify(`删除缓存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setCacheDeletingKeys((current) => {
        const next = new Set(current);
        next.delete(cacheKey);
        return next;
      });
    }
  };

  const deleteSelectedCaches = async () => {
    if (selectedCount === 0) {
      notify('请先选择要删除的缓存条目', 'info');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除缓存',
      message: `确认删除当前选中的 ${selectedCount} 个缓存条目吗？删除后后续任务将无法再命中这些缓存。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setCacheBatchDeleting(true);
    try {
      const result = await b2sApi.batchDeleteCache(projectId, Array.from(selectedCacheKeys));
      notify(`批量删除完成：成功 ${result.deleted_count}，失败 ${result.failed_count}`, result.failed_count > 0 ? 'warning' : 'success');
      setSelectedCacheKeys(new Set());
      if (cacheDetail && result.results.some((item) => item.cache_key === cacheDetail.cache_key && item.deleted)) {
        setCacheDetail(null);
      }
      await loadCacheEntries();
    } catch (err: any) {
      notify(`批量删除失败: ${err?.message ?? err}`, 'error');
    } finally {
      setCacheBatchDeleting(false);
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
                这里既管理二进制逆向运行配置，也管理共享结果缓存。缓存页面默认只按当前项目做上下文筛选，但缓存本体仍是共享缓存池。
              </p>
              {config.updated_at && <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void loadRuntimeConfig(); }}
                disabled={loading || saving}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新配置
              </button>
              <button
                type="button"
                onClick={() => { void loadCacheEntries(); }}
                disabled={cacheLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {cacheLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新缓存
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['runtime', '运行配置'],
            ['cache', '缓存管理'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as B2SInnerTab)}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'runtime' ? (
        loading ? (
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
              title="批次并发配置"
              subtitle="配置项目级默认 batch 并发。保存后仅影响后续新建任务，不影响已创建、运行中或重试中的任务。"
              actions={<PanelActions saving={saving} onSave={() => { void saveConcurrencyConfig(); }} onReset={resetConcurrencyConfig} />}
            >
              <FieldRow label="默认 batch 并发" hint="concurrency · 1-16">
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={config.concurrency}
                  onChange={(e) => setConfig((prev) => ({ ...prev, concurrency: Math.max(1, Math.min(16, Number(e.target.value) || 8)) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                />
              </FieldRow>
              <p className="text-xs leading-5 text-slate-500">
                这里维护的是项目默认并发。新任务创建时会默认带出该值；如果用户在创建弹窗里手工修改，只影响本次任务。
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
        )
      ) : (
        <div className="space-y-6">
          <SectionCard
            title="共享缓存概览"
            subtitle="当前缓存为共享结果缓存。默认只按当前项目做上下文筛选，不代表缓存物理上按项目隔离。"
            actions={(
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void loadCacheEntries(); }}
                  disabled={cacheLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {cacheLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  刷新列表
                </button>
              </div>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {[
                { label: '当前可见条目', value: formatNumber(cacheSummary.visible_entries), tone: 'text-slate-900' },
                { label: '当前项目条目', value: formatNumber(cacheSummary.current_project_entries), tone: 'text-indigo-700' },
                { label: 'Fast 条目', value: formatNumber(cacheSummary.fast_entries), tone: 'text-emerald-700' },
                { label: 'Deep 条目', value: formatNumber(cacheSummary.deep_entries), tone: 'text-cyan-700' },
                { label: '总命中次数', value: formatNumber(cacheSummary.total_hit_count), tone: 'text-amber-700' },
                { label: '最近命中时间', value: formatDateTime(cacheSummary.latest_hit_at), tone: 'text-slate-900' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                  <div className={`mt-2 text-lg font-black ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="缓存筛选"
            subtitle="按当前项目、模式、命中情况和来源任务筛选共享缓存条目。"
            actions={<PanelActions saving={false} onSave={() => { setCachePage(1); void loadCacheEntries(); }} onReset={resetCacheFilters} />}
          >
            <div className="grid gap-4 xl:grid-cols-4">
              <FieldRow label="当前项目">
                <input value={projectId} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
              </FieldRow>
              <FieldRow label="模式">
                <select value={cacheModeFilter} onChange={(e) => { setCacheModeFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                  <option value="all">全部</option>
                  <option value="fast">fast</option>
                  <option value="deep">deep</option>
                </select>
              </FieldRow>
              <FieldRow label="状态">
                <select value={cacheStatusFilter} onChange={(e) => { setCacheStatusFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                  <option value="ready">ready</option>
                  <option value="all">全部</option>
                </select>
              </FieldRow>
              <FieldRow label="命中情况">
                <select value={cacheHitsFilter} onChange={(e) => { setCacheHitsFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                  <option value="all">全部</option>
                  <option value="hit">已命中</option>
                  <option value="never">从未命中</option>
                </select>
              </FieldRow>
              <FieldRow label="cache_key">
                <input value={cacheKeyFilter} onChange={(e) => { setCacheKeyFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
              </FieldRow>
              <FieldRow label="elf_basename">
                <input value={elfBasenameFilter} onChange={(e) => { setElfBasenameFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
              </FieldRow>
              <FieldRow label="source_task_id">
                <input value={sourceTaskIdFilter} onChange={(e) => { setSourceTaskIdFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
              </FieldRow>
              <FieldRow label="source_item_id">
                <input value={sourceItemIdFilter} onChange={(e) => { setSourceItemIdFilter(e.target.value); setCachePage(1); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
              </FieldRow>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={includeAllProjects} onChange={(e) => { setIncludeAllProjects(e.target.checked); setCachePage(1); }} />
              查看全部共享缓存（默认仅显示 source_project_id = 当前项目）
            </label>
          </SectionCard>

          <SectionCard
            title="缓存条目"
            subtitle="删除缓存只会影响后续任务是否命中缓存，不影响已完成任务已有结果目录。"
            actions={(
              <div className="flex items-center gap-2">
                <select
                  value={cachePageSize}
                  onChange={(e) => { setCachePageSize(Number(e.target.value)); setCachePage(1); }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  {[20, 50, 100, 200].map((size) => <option key={size} value={size}>{size} / 页</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => { void deleteSelectedCaches(); }}
                  disabled={selectedCount === 0 || cacheBatchDeleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {cacheBatchDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  批量删除
                </button>
              </div>
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>当前选择 {selectedCount} 条</span>
              <span>分页 {cachePage} / {cacheTotalPages}</span>
              {cacheLoading ? <span className="text-indigo-600">正在刷新缓存列表…</span> : null}
            </div>
            <ExecutionTable minWidth={1280}>
              <ExecutionTableHead>
                <tr>
                  <ExecutionTableTh className="w-12">
                    <input type="checkbox" checked={allPageSelected} onChange={(e) => toggleAllCurrentPage(e.target.checked)} />
                  </ExecutionTableTh>
                  <ExecutionTableTh>文件名</ExecutionTableTh>
                  <ExecutionTableTh>cache_key</ExecutionTableTh>
                  <ExecutionTableTh>mode</ExecutionTableTh>
                  <ExecutionTableTh>source_project_id</ExecutionTableTh>
                  <ExecutionTableTh>source_task_id</ExecutionTableTh>
                  <ExecutionTableTh>source_item_id</ExecutionTableTh>
                  <ExecutionTableTh>file_size</ExecutionTableTh>
                  <ExecutionTableTh>hit_count</ExecutionTableTh>
                  <ExecutionTableTh>last_hit_at</ExecutionTableTh>
                  <ExecutionTableTh>created_at</ExecutionTableTh>
                  <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
                </tr>
              </ExecutionTableHead>
              <tbody>
                {cacheLoading ? (
                  <ExecutionTableEmptyRow colSpan={12} message="缓存列表加载中..." />
                ) : cacheEntries.length === 0 ? (
                  <ExecutionTableEmptyRow colSpan={12} message="当前筛选条件下没有缓存条目" />
                ) : cacheEntries.map((entry) => (
                  <tr key={entry.cache_key} className={executionTableRowClassName}>
                    <ExecutionTableTd>
                      <input
                        type="checkbox"
                        checked={selectedCacheKeys.has(entry.cache_key)}
                        onChange={(e) => setSelectedCacheKeys((current) => {
                          const next = new Set(current);
                          if (e.target.checked) next.add(entry.cache_key);
                          else next.delete(entry.cache_key);
                          return next;
                        })}
                      />
                    </ExecutionTableTd>
                    <ExecutionTableTd className="min-w-[180px]">
                      <div className="font-semibold text-slate-800">{entry.elf_basename || '-'}</div>
                    </ExecutionTableTd>
                    <ExecutionTableTd className="min-w-[260px] font-mono text-xs break-all">{entry.cache_key}</ExecutionTableTd>
                    <ExecutionTableTd>{entry.mode}</ExecutionTableTd>
                    <ExecutionTableTd>{entry.source_project_id || '-'}</ExecutionTableTd>
                    <ExecutionTableTd className="font-mono text-xs">{entry.source_task_id || '-'}</ExecutionTableTd>
                    <ExecutionTableTd className="font-mono text-xs">{entry.source_item_id || '-'}</ExecutionTableTd>
                    <ExecutionTableTd>{formatFileSize(entry.file_size)}</ExecutionTableTd>
                    <ExecutionTableTd>{formatNumber(entry.hit_count)}</ExecutionTableTd>
                    <ExecutionTableTd>{formatDateTime(entry.last_hit_at)}</ExecutionTableTd>
                    <ExecutionTableTd>{formatDateTime(entry.created_at)}</ExecutionTableTd>
                    <ExecutionTableTd className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { void openCacheDetail(entry.cache_key); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={12} />
                          查看详情
                        </button>
                        <button
                          type="button"
                          onClick={() => { void deleteSingleCache(entry.cache_key); }}
                          disabled={cacheDeletingKeys.has(entry.cache_key)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {cacheDeletingKeys.has(entry.cache_key) ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          删除
                        </button>
                      </div>
                    </ExecutionTableTd>
                  </tr>
                ))}
              </tbody>
            </ExecutionTable>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">共 {formatNumber(cacheTotal)} 条</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCachePage((current) => Math.max(1, current - 1))}
                  disabled={cachePage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="text-xs text-slate-500">{cachePage} / {cacheTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setCachePage((current) => Math.min(cacheTotalPages, current + 1))}
                  disabled={cachePage >= cacheTotalPages}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {cacheDetail || cacheDetailLoading ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="mx-auto max-h-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_32px_120px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Cache Detail</div>
                <h3 className="mt-2 text-xl font-black text-slate-900">{cacheDetail?.elf_basename || cacheDetail?.cache_key || '缓存详情'}</h3>
                <div className="mt-1 font-mono text-xs text-slate-500 break-all">{cacheDetail?.cache_key || '-'}</div>
              </div>
              <button type="button" onClick={() => setCacheDetail(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                关闭
              </button>
            </div>
            <div className="max-h-[calc(100vh-10rem)] overflow-auto px-6 py-6">
              {cacheDetailLoading || !cacheDetail ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 size={14} className="animate-spin" />正在加载缓存详情...
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['Mode', cacheDetail.mode],
                      ['Hit Count', formatNumber(cacheDetail.hit_count)],
                      ['Generated Files', summarizeGeneratedFiles(cacheDetail)],
                      ['Last Hit', formatDateTime(cacheDetail.last_hit_at)],
                      ['Created At', formatDateTime(cacheDetail.created_at)],
                      ['File Size', formatFileSize(cacheDetail.file_size)],
                      ['Output Dir Exists', cacheDetail.output_dir_exists ? '是' : '否'],
                      ['Manifest Exists', cacheDetail.manifest_exists ? '是' : '否'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
                        <div className="mt-2 text-sm font-bold text-slate-900 break-all">{value}</div>
                      </div>
                    ))}
                  </div>

                  <SectionCard title="基础元数据">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <div className="font-black text-slate-900">analysis_signature</div>
                        <div className="mt-2 break-all font-mono text-xs">{cacheDetail.analysis_signature || '-'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <div className="font-black text-slate-900">canonical_input_path</div>
                        <div className="mt-2 break-all font-mono text-xs">{cacheDetail.canonical_input_path || '-'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:col-span-2">
                        <div className="font-black text-slate-900">canonical_output_dir</div>
                        <div className="mt-2 break-all font-mono text-xs">{cacheDetail.canonical_output_dir || '-'}</div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="generated_files 预览">
                    <pre className="max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(cacheDetail.generated_files, null, 2)}</pre>
                  </SectionCard>

                  <SectionCard title="manifest.json 预览" subtitle={cacheDetail.manifest_parse_error ? `解析失败：${cacheDetail.manifest_parse_error}` : undefined}>
                    <pre className="max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(cacheDetail.manifest, null, 2)}</pre>
                  </SectionCard>

                  <SectionCard title="source_metadata 预览">
                    <pre className="max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(cacheDetail.source_metadata, null, 2)}</pre>
                  </SectionCard>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
