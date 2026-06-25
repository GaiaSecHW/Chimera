import React, { useEffect, useState } from 'react';
import { Eye, Loader2, RefreshCw, Save, Settings, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  B2SCacheDetailResponse,
  B2SCacheEntry,
  B2SLlmProviderSummary,
  B2SCacheSummary,
  B2SRunMode,
  B2SServiceConfig,
} from '../../clients/binaryToSource';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableEmptyRow, ExecutionTableHead, ExecutionTableTd, ExecutionTableTh, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageSection, FormField, FormActionBar, PageHeader } from '../../design-system';
import { StaticPipelineFlow } from './StaticPipelineFlow';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

type B2SInnerTab = 'runtime' | 'cache';

const defaultConfig = (): B2SServiceConfig => ({
  budget_exhausted_action: 'treat_as_passed',
  concurrency: 8,
  default_mode: 'turbo',
  llm_provider_key: null,
  effective_llm_provider: null,
});

const defaultModeOptions: Array<{ value: B2SRunMode; label: string; description: string }> = [
  { value: 'turbo', label: 'turbo / 极速', description: '优先命中缓存和极速收敛，适合大批量快速扫一遍。' },
  { value: 'fast', label: 'fast / 快速', description: '速度与质量折中，适合常规批量逆向。' },
  { value: 'deep', label: 'deep / 深度', description: '更偏高质量还原，耗时更长。' },
];

const defaultCacheSummary: B2SCacheSummary = {
  visible_entries: 0,
  current_project_entries: 0,
  fast_entries: 0,
  deep_entries: 0,
  turbo_entries: 0,
  total_hit_count: 0,
  latest_hit_at: null,
};

const cacheModeOptions = [
  { value: 'all', label: '全部模式' },
  { value: 'fast', label: 'fast / 快速' },
  { value: 'deep', label: 'deep / 深度' },
  { value: 'turbo', label: 'turbo / 极速' },
  { value: 'unknown', label: 'unknown / 其他' },
] as const;

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
      detail: 'binary-to-source / pi-re-agent 现在默认对 API 类错误无限重试；进入 30 秒退避档后，每 10 次重试会记录一次任务时间线。只有 max_rounds_exceeded、timeout_max_retries_exceeded 等非 API 预算耗尽类终态，才会由当前页面策略决定按通过还是失败收敛。',
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
  <PageSection title={title} description={subtitle} actions={actions}>{children}</PageSection>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <FormField label={label} hint={hint}>{children}</FormField>
);

const PanelActions: React.FC<{ saving: boolean; onSave: () => void; onReset: () => void }> = ({ saving, onSave, onReset }) => (
  <FormActionBar saving={saving} onSave={onSave} onReset={onReset} saveText="保存配置" resetText="重置为默认" />
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
  if (size < 1024) return`${size} B`;
  if (size < 1024 * 1024) return`${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return`${(size / 1024 / 1024).toFixed(1)} MB`;
  return`${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function summarizeGeneratedFiles(entry: B2SCacheDetailResponse | null): string {
  if (!entry) return '-';
  return`${entry.generated_files.length} 个文件`;
}

export const B2SConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const b2sApi = api.domains.execution.binaryToSource;

  const [activeTab, setActiveTab] = useState<B2SInnerTab>('runtime');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<B2SServiceConfig>(() => defaultConfig());
  const [savedConfig, setSavedConfig] = useState<B2SServiceConfig>(() => defaultConfig());
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
        b2sApi.getConfig(),
        b2sApi.listLlmProviders(projectId),
      ]);
      const normalized = { ...defaultConfig(), ...next };
      setConfig(normalized);
      setSavedConfig(normalized);
      setLlmProviders(Array.isArray(providerResponse?.items) ? providerResponse.items : []);
    } catch (err: any) {
      notify(`加载配置失败: ${err?.message ?? err}`, 'error');
      const fallback = defaultConfig();
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
      const saved = await b2sApi.saveConfig(nextConfig);
      const normalized = { ...defaultConfig(), ...saved };
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

  const saveDefaultModeConfig = async () => {
    await persistConfig(
      {
        ...savedConfig,
        default_mode: config.default_mode || defaultConfig().default_mode,
      },
      '默认模式配置已保存',
    );
  };

  const resetProviderConfig = () => {
    setConfig((prev) => ({ ...prev, llm_provider_key: null }));
    notify('LLM / Agent 配置已重置为默认值（尚未保存）', 'info');
  };

  const resetPolicy = () => {
    setConfig((prev) => ({ ...prev, budget_exhausted_action: defaultConfig().budget_exhausted_action }));
    notify('终态策略已重置为默认值（尚未保存）', 'info');
  };

  const resetConcurrencyConfig = () => {
    setConfig((prev) => ({ ...prev, concurrency: defaultConfig().concurrency }));
    notify('批次并发已重置为默认值（尚未保存）', 'info');
  };

  const resetDefaultModeConfig = () => {
    setConfig((prev) => ({ ...prev, default_mode: defaultConfig().default_mode }));
    notify('默认模式已重置为默认值（尚未保存）', 'info');
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
      message:`确认删除缓存 ${cacheKey} 吗？删除后后续任务将无法再命中该缓存。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setCacheDeletingKeys((current) => new Set(current).add(cacheKey));
    try {
      const result = await b2sApi.deleteCache(projectId, cacheKey);
      notify(result.message ||`缓存 ${cacheKey} 已删除`, result.deleted ? 'success' : 'warning');
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
      message:`确认删除当前选中的 ${selectedCount} 个缓存条目吗？删除后后续任务将无法再命中这些缓存。`,
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
        <PageHeader
          title={
            <div className="flex flex-wrap items-center gap-2">
              <Settings size={18} style={{ color: LK.error }} />
              <span>二进制逆向参数配置</span>
              <span style={{ borderRadius: '999px', border: `1px solid ${LK.error}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08'), padding: '4px 12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', color: LK.error }}>
                chimera-app-binary-to-source
              </span>
            </div>
          }
          description={
            <>
              这里既管理二进制逆向运行配置，也管理共享结果缓存。缓存页面默认只按当前项目做上下文筛选，但缓存本体仍是共享缓存池。
              {config.updated_at && <span className="ml-2 text-xs text-theme-text-muted">上次保存：{new Date(config.updated_at).toLocaleString()}</span>}
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void loadRuntimeConfig(); }}
                disabled={loading || saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft, cursor: (loading || saving) ? 'not-allowed' : 'pointer', opacity: (loading || saving) ? 0.5 : 1 }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新配置
              </button>
              <button
                type="button"
                onClick={() => { void loadCacheEntries(); }}
                disabled={cacheLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft, cursor: cacheLoading ? 'not-allowed' : 'pointer', opacity: cacheLoading ? 0.5 : 1 }}
              >
                {cacheLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新缓存
              </button>
            </div>
          }
        />
      ) : null}

      <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {[
            ['runtime', '运行配置'],
            ['cache', '缓存管理'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as B2SInnerTab)}
              style={{ borderRadius: '8px', padding: '12px 20px', fontSize: '14px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: activeTab === id ? LK.primary : 'transparent', color: activeTab === id ? '#ffffff' : LK.body, cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'runtime' ? (
        loading ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px 16px', fontSize: '14px', color: LK.body }}>
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
                  style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}
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
              <div style={{ borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontSize: '14px', color: LK.body }}>
                <div style={{ fontWeight: 600, color: LK.inkSoft }}>当前生效 Provider</div>
                {effectiveProvider ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <div>名称：{effectiveProvider.display_name || effectiveProvider.provider_key}</div>
                    <div className="font-mono break-all">Key：{effectiveProvider.provider_key}</div>
                    <div>类型：{effectiveProvider.provider_type || '-'}</div>
                    <div>模型：{effectiveProvider.model || '-'}</div>
                    <div>{effectiveProvider.is_default ? '平台默认 Provider' : '项目指定 Provider'}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-amber-400">
                    当前无法解析有效 Provider。若项目已保存特定 Provider，请检查该 Provider 是否仍在配置中心启用。
                  </div>
                )}
              </div>
              <p style={{ fontSize: '12px', lineHeight: '20px', color: LK.body }}>
                任务创建时若未手工指定`llm_provider_key`，默认取这里的项目级 Provider；若这里留空，则回退到配置中心默认 Provider。
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
                  style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}
                />
              </FieldRow>
              <p style={{ fontSize: '12px', lineHeight: '20px', color: LK.body }}>
                这里维护的是项目默认并发。新任务创建时会默认带出该值；如果用户在创建弹窗里手工修改，只影响本次任务。
              </p>
            </SectionCard>
            <SectionCard
              title="默认还原模式"
              subtitle="配置项目级默认逆向模式。保存后仅影响后续新建任务，不影响已创建、运行中或重试/重跑任务。"
              actions={<PanelActions saving={saving} onSave={() => { void saveDefaultModeConfig(); }} onReset={resetDefaultModeConfig} />}
            >
              <FieldRow label="default_mode" hint="新建任务未显式指定 mode 时生效">
                <div className="grid gap-3 md:grid-cols-3">
                  {defaultModeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, default_mode: option.value }))}
                      style={{
                        borderRadius: '12px',
                        border: `1px solid ${config.default_mode === option.value ? LK.info : LK.border}`,
                        padding: '16px',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                        backgroundColor: config.default_mode === option.value ? LK.primaryMuted.replace('0.14', '0.08') : LK.surface
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{option.label}</div>
                      <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 600, lineHeight: '20px', color: LK.body }}>{option.description}</div>
                    </button>
                  ))}
                </div>
              </FieldRow>
              <p style={{ fontSize: '12px', lineHeight: '20px', color: LK.body }}>
                如果创建任务时没有手工覆盖`mode`，后端会自动回退到这里配置的项目默认模式；当前后端默认值为`turbo`。
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
                  style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}
                >
                  <option value="treat_as_passed">默认通过，子任务按成功收敛</option>
                  <option value="treat_as_failed">判定失败，子任务按失败收敛</option>
                </select>
              </FieldRow>
              <p style={{ fontSize: '12px', lineHeight: '20px', color: LK.body }}>
                默认值为`treat_as_passed`。当`pi-re-agent` 返回预算耗尽类失败时，B2S 会按这里的策略把该子任务收敛为成功或失败。
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.inkSoft, cursor: 'pointer', opacity: 1 }}
                >
                  {cacheLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  刷新列表
                </button>
              </div>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {[
                { label: '当前可见条目', value: formatNumber(cacheSummary.visible_entries), tone: LK.ink },
                { label: '当前项目条目', value: formatNumber(cacheSummary.current_project_entries), tone: 'text-indigo-400' },
                { label: 'Fast 条目', value: formatNumber(cacheSummary.fast_entries), tone: 'text-emerald-400' },
                { label: 'Deep 条目', value: formatNumber(cacheSummary.deep_entries), tone: 'text-cyan-400' },
                { label: 'Turbo 条目', value: formatNumber(cacheSummary.turbo_entries), tone: 'text-fuchsia-400' },
                { label: '总命中次数', value: formatNumber(cacheSummary.total_hit_count), tone: 'text-amber-400' },
                { label: '最近命中时间', value: formatDateTime(cacheSummary.latest_hit_at), tone: LK.ink },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                  <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, color: item.tone.includes('slate-900') ? LK.ink : item.tone.includes('emerald') ? LK.success : item.tone.includes('rose') ? LK.error : LK.primary }}>{item.value}</div>
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
                <input value={projectId} disabled style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px', fontSize: '14px', color: LK.body }} />
              </FieldRow>
              <FieldRow label="模式" hint="支持 fast / deep / turbo / 其他">
                <select value={cacheModeFilter} onChange={(e) => { setCacheModeFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}>
                  {cacheModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="状态">
                <select value={cacheStatusFilter} onChange={(e) => { setCacheStatusFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}>
                  <option value="ready">ready</option>
                  <option value="all">全部</option>
                </select>
              </FieldRow>
              <FieldRow label="命中情况">
                <select value={cacheHitsFilter} onChange={(e) => { setCacheHitsFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }}>
                  <option value="all">全部</option>
                  <option value="hit">已命中</option>
                  <option value="never">从未命中</option>
                </select>
              </FieldRow>
              <FieldRow label="cache_key">
                <input value={cacheKeyFilter} onChange={(e) => { setCacheKeyFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }} />
              </FieldRow>
              <FieldRow label="elf_basename">
                <input value={elfBasenameFilter} onChange={(e) => { setElfBasenameFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }} />
              </FieldRow>
              <FieldRow label="source_task_id">
                <input value={sourceTaskIdFilter} onChange={(e) => { setSourceTaskIdFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }} />
              </FieldRow>
              <FieldRow label="source_item_id">
                <input value={sourceItemIdFilter} onChange={(e) => { setSourceItemIdFilter(e.target.value); setCachePage(1); }} style={{ width: '100%', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', backgroundColor: LK.surface, color: LK.ink }} />
              </FieldRow>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>
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
                  style={{ borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '12px', backgroundColor: LK.surface, color: LK.ink }}
                >
                  {[20, 50, 100, 200].map((size) => <option key={size} value={size}>{size} / 页</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => { void deleteSelectedCaches(); }}
                  disabled={selectedCount === 0 || cacheBatchDeleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/15 disabled:opacity-50"
                >
                  {cacheBatchDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  批量删除
                </button>
              </div>
            )}
          >
            <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12px', color: LK.body }}>
              <span>当前选择 {selectedCount} 条</span>
              <span>分页 {cachePage} / {cacheTotalPages}</span>
              {cacheLoading ? <span className="text-indigo-400">正在刷新缓存列表…</span> : null}
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
                      <div style={{ fontWeight: 600, color: LK.inkSoft }}>{entry.elf_basename || '-'}</div>
                    </ExecutionTableTd>
                    <ExecutionTableTd className="min-w-[260px] font-mono text-xs break-all">{entry.cache_key}</ExecutionTableTd>
                    <ExecutionTableTd>
                      <span style={{ display: 'inline-flex', borderRadius: '999px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>
                        {entry.mode || 'unknown'}
                      </span>
                    </ExecutionTableTd>
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
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '4px 8px', fontSize: '12px', fontWeight: 600, color: LK.inkSoft, cursor: 'pointer' }}
                        >
                          <Eye size={12} />
                          查看详情
                        </button>
                        <button
                          type="button"
                          onClick={() => { void deleteSingleCache(entry.cache_key); }}
                          disabled={cacheDeletingKeys.has(entry.cache_key)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/15 disabled:opacity-50"
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
              <div style={{ fontSize: '12px', color: LK.body }}>共 {formatNumber(cacheTotal)} 条</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCachePage((current) => Math.max(1, current - 1))}
                  disabled={cachePage <= 1}
                  style={{ borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer', opacity: 1 }}
                >
                  上一页
                </button>
                <span style={{ fontSize: '12px', color: LK.body }}>{cachePage} / {cacheTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setCachePage((current) => Math.min(cacheTotalPages, current + 1))}
                  disabled={cachePage >= cacheTotalPages}
                  style={{ borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer', opacity: 1 }}
                >
                  下一页
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {cacheDetail || cacheDetailLoading ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 280, backgroundColor: 'rgba(7, 13, 24, 0.6)', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ margin: '0 auto', maxHeight: '100%', maxWidth: '80rem', overflow: 'hidden', borderRadius: '24px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, boxShadow: '0 32px 120px rgba(15,23,42,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom:`1px solid ${LK.border}`, padding: '20px 24px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: LK.ink }}>{cacheDetail?.elf_basename || cacheDetail?.cache_key || '缓存详情'}</h3>
                <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '12px', color: LK.body, wordBreak: 'break-all' }}>{cacheDetail?.cache_key || '-'}</div>
              </div>
              <button type="button" onClick={() => setCacheDetail(null)} style={{ borderRadius: '6px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer' }}>
                关闭
              </button>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 10rem)', overflow: 'auto', padding: '24px' }}>
              {cacheDetailLoading || !cacheDetail ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontSize: '14px', color: LK.body }}>
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
                      <div key={label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{label}</div>
                        <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600, color: LK.ink, wordBreak: 'break-all' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <SectionCard title="基础元数据">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontSize: '14px', color: LK.inkSoft }}>
                        <div style={{ fontWeight: 600, color: LK.ink }}>analysis_signature</div>
                        <div style={{ marginTop: '8px', wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{cacheDetail.analysis_signature || '-'}</div>
                      </div>
                      <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontSize: '14px', color: LK.inkSoft }}>
                        <div style={{ fontWeight: 600, color: LK.ink }}>canonical_input_path</div>
                        <div className="mt-2 break-all font-mono text-xs">{cacheDetail.canonical_input_path || '-'}</div>
                      </div>
                      <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontSize: '14px', color: LK.inkSoft, gridColumn: '1 / -1' }}>
                        <div style={{ fontWeight: 600, color: LK.ink }}>canonical_output_dir</div>
                        <div style={{ marginTop: '8px', wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{cacheDetail.canonical_output_dir || '-'}</div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="generated_files 预览">
                    <pre style={{ maxHeight: '256px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px', fontSize: '12px', color: LK.ink }}>{JSON.stringify(cacheDetail.generated_files, null, 2)}</pre>
                  </SectionCard>

                  <SectionCard title="manifest.json 预览" subtitle={cacheDetail.manifest_parse_error ?`解析失败：${cacheDetail.manifest_parse_error}` : undefined}>
                    <pre style={{ maxHeight: '256px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px', fontSize: '12px', color: LK.ink }}>{JSON.stringify(cacheDetail.manifest, null, 2)}</pre>
                  </SectionCard>

                  <SectionCard title="source_metadata 预览">
                    <pre style={{ maxHeight: '256px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px', fontSize: '12px', color: LK.ink }}>{JSON.stringify(cacheDetail.source_metadata, null, 2)}</pre>
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
