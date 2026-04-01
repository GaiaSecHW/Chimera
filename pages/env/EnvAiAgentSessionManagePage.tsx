import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, SquareTerminal, Trash2, X } from 'lucide-react';

import { api } from '../../clients/api';
import { useUiFeedback } from '../../components/UiFeedback';
import { ProjectAiAgentSessionBatchTerminateResult, ProjectAiAgentSessionItem } from '../../types/types';
import { EmptyState } from './ai-agent/shared';

const GLOBAL_AUTO_SYNC_ENABLED_KEY = 'secflow_ai_global_session_auto_sync_enabled';
const GLOBAL_AUTO_SYNC_INTERVAL_KEY = 'secflow_ai_global_session_auto_sync_interval_ms';

const buildSessionKey = (item: Pick<ProjectAiAgentSessionItem, 'agent_key' | 'service_name' | 'session_id'>) =>
  `${item.agent_key}::${item.service_name}::${item.session_id}`;

const compactTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const statusBadge = (value?: string) => {
  const text = String(value || 'unknown').toLowerCase();
  if (text === 'ready') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (text === 'broken') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (text === 'closed') return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const parseInvalidReason = (reason: string) => {
  const text = String(reason || '');
  if (text.startsWith('status_not_ready:')) return `状态异常(${text.replace('status_not_ready:', '') || 'unknown'})`;
  if (text === 'pty_missing') return 'PTY 缺失';
  if (text === 'backend_pid_missing') return 'Backend PID 缺失';
  if (text === 'backend_not_found_in_helper_agents') return 'backend 不在当前 helper agent 列表';
  if (text.startsWith('agent_ids_not_found:')) return `agent_ids 不匹配(${text.replace('agent_ids_not_found:', '')})`;
  return text || '未知异常';
};

const sessionModeLabel = (mode?: string) => {
  const text = String(mode || '').toLowerCase();
  if (text === 'pty') return 'VTY';
  if (text === 'pipe') return '非VTY';
  if (text === 'invoke') return '经典';
  return '非VTY';
};
const sessionModeTone = (mode?: string) =>
  String(mode || '').toLowerCase() === 'pty'
    ? 'bg-violet-100 text-violet-700 border-violet-200'
    : String(mode || '').toLowerCase() === 'invoke'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-cyan-100 text-cyan-700 border-cyan-200';

const joinAgentDisplay = (item: Pick<ProjectAiAgentSessionItem, 'backend' | 'agent_ids'>) => {
  const ids = Array.isArray(item.agent_ids) ? item.agent_ids.filter(Boolean) : [];
  const backend = String(item.backend || '').trim();
  const merged = Array.from(new Set([...ids, ...(backend ? [backend] : [])]));
  return merged.join(', ');
};

const resolveBackendPid = (item: Pick<ProjectAiAgentSessionItem, 'backend_pid' | 'pty_pid'>) =>
  item.backend_pid ?? item.pty_pid ?? null;

export const EnvAiAgentSessionManagePage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProjectAiAgentSessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [stats, setStats] = useState({
    total_sessions: 0,
    normal_count: 0,
    invalid_count: 0,
    helper_total: 0,
    helper_reachable_count: 0,
    helper_unreachable_count: 0,
  });
  const [helperUnreachable, setHelperUnreachable] = useState<Array<{
    agent_key: string;
    service_name: string;
    agent_hostname?: string;
    error?: string;
  }>>([]);
  const [nodeOptions, setNodeOptions] = useState<string[]>([]);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [invalidReasonOptions, setInvalidReasonOptions] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [nodeFilterInput, setNodeFilterInput] = useState('');
  const [serviceFilterInput, setServiceFilterInput] = useState('');
  const [statusFilterInput, setStatusFilterInput] = useState('');
  const [invalidFilterInput, setInvalidFilterInput] = useState<'all' | 'invalid' | 'normal'>('all');
  const [reasonFilterInput, setReasonFilterInput] = useState('');

  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [invalidFilter, setInvalidFilter] = useState<'all' | 'invalid' | 'normal'>('all');
  const [reasonFilter, setReasonFilter] = useState('');

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState('');
  const [lastBatchResult, setLastBatchResult] = useState<ProjectAiAgentSessionBatchTerminateResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultOnlyFailed, setResultOnlyFailed] = useState(false);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(GLOBAL_AUTO_SYNC_ENABLED_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  });
  const [autoSyncIntervalMs, setAutoSyncIntervalMs] = useState<number>(() => {
    const raw = Number(localStorage.getItem(GLOBAL_AUTO_SYNC_INTERVAL_KEY) || '15000');
    return raw === 5000 || raw === 10000 || raw === 15000 ? raw : 15000;
  });

  const readUrlState = () => {
    const params = new URLSearchParams(window.location.search || '');
    const parsePositiveInt = (value: string, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    };
    const nextPage = parsePositiveInt(String(params.get('aasm_page') || ''), 1);
    const nextPerPage = parsePositiveInt(String(params.get('aasm_per_page') || ''), 50);
    const nextSearch = String(params.get('aasm_q') || '');
    const nextNode = String(params.get('aasm_node') || '');
    const nextService = String(params.get('aasm_service') || '');
    const nextStatus = String(params.get('aasm_status') || '');
    const nextInvalidFilterRaw = String(params.get('aasm_invalid_filter') || 'all');
    const nextInvalidFilter = (nextInvalidFilterRaw === 'invalid' || nextInvalidFilterRaw === 'normal') ? nextInvalidFilterRaw : 'all';
    const nextReason = String(params.get('aasm_reason') || '');

    setPage(nextPage);
    setPerPage(nextPerPage);
    setSearchInput(nextSearch);
    setNodeFilterInput(nextNode);
    setServiceFilterInput(nextService);
    setStatusFilterInput(nextStatus);
    setInvalidFilterInput(nextInvalidFilter);
    setReasonFilterInput(nextReason);

    setSearch(nextSearch);
    setNodeFilter(nextNode);
    setServiceFilter(nextService);
    setStatusFilter(nextStatus);
    setInvalidFilter(nextInvalidFilter);
    setReasonFilter(nextReason);
    setUrlStateReady(true);
  };

  const writeUrlState = () => {
    const params = new URLSearchParams(window.location.search || '');
    const setOrDelete = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete('aasm_page', String(page || 1));
    setOrDelete('aasm_per_page', String(perPage || 50));
    setOrDelete('aasm_q', search);
    setOrDelete('aasm_node', nodeFilter);
    setOrDelete('aasm_service', serviceFilter);
    setOrDelete('aasm_status', statusFilter);
    setOrDelete('aasm_invalid_filter', invalidFilter);
    setOrDelete('aasm_reason', reasonFilter);
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  };

  const loadData = async (withSpinner = true, options: { silent?: boolean } = {}) => {
    if (!projectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (withSpinner) setLoading(true);
    try {
      const data = await api.environment.listProjectAiAgentSessions(projectId, {
        page,
        per_page: perPage,
        q: search,
        node: nodeFilter,
        service_name: serviceFilter,
        status: statusFilter,
        invalid_filter: invalidFilter,
        invalid_reason: reasonFilter,
      });
      setItems(data.items || []);
      setTotal(Number(data.filtered_total || data.total || 0));
      setStats({
        total_sessions: Number(data.stats?.total_sessions || 0),
        normal_count: Number(data.stats?.normal_count || 0),
        invalid_count: Number(data.stats?.invalid_count || 0),
        helper_total: Number(data.stats?.helper_total || 0),
        helper_reachable_count: Number(data.stats?.helper_reachable_count || 0),
        helper_unreachable_count: Number(data.stats?.helper_unreachable_count || 0),
      });
      setHelperUnreachable((data.helper_unreachable || []).map((item) => ({
        agent_key: item.agent_key,
        service_name: item.service_name,
        agent_hostname: item.agent_hostname,
        error: item.error,
      })));
      setNodeOptions(Array.isArray(data.filters?.nodes) ? data.filters?.nodes.filter(Boolean) : []);
      setServiceOptions(Array.isArray(data.filters?.service_names) ? data.filters?.service_names.filter(Boolean) : []);
      setStatusOptions(Array.isArray(data.filters?.statuses) ? data.filters?.statuses.filter(Boolean) : []);
      setInvalidReasonOptions(Array.isArray(data.filters?.invalid_reasons) ? data.filters?.invalid_reasons.filter(Boolean) : []);
      setLastSyncedAt(new Date().toISOString());
    } catch (error: any) {
      if (!options.silent) {
        notify(`加载全局会话失败: ${error?.message || error}`, 'error');
      }
    } finally {
      if (withSpinner) setLoading(false);
    }
  };

  React.useEffect(() => {
    readUrlState();
  }, []);

  React.useEffect(() => {
    if (!urlStateReady) return;
    void loadData(true);
  }, [projectId, page, perPage, search, nodeFilter, serviceFilter, statusFilter, invalidFilter, reasonFilter, urlStateReady]);

  React.useEffect(() => {
    if (!urlStateReady) return;
    localStorage.setItem(GLOBAL_AUTO_SYNC_ENABLED_KEY, autoSyncEnabled ? 'true' : 'false');
  }, [urlStateReady, autoSyncEnabled]);

  React.useEffect(() => {
    if (!urlStateReady) return;
    localStorage.setItem(GLOBAL_AUTO_SYNC_INTERVAL_KEY, String(autoSyncIntervalMs));
  }, [urlStateReady, autoSyncIntervalMs]);

  React.useEffect(() => {
    if (!urlStateReady) return;
    if (!autoSyncEnabled) return;
    const timer = window.setInterval(() => {
      if (busyKey) return;
      void loadData(false, { silent: true });
    }, autoSyncIntervalMs);
    return () => window.clearInterval(timer);
  }, [urlStateReady, busyKey, projectId, page, perPage, search, nodeFilter, serviceFilter, statusFilter, invalidFilter, reasonFilter, autoSyncEnabled, autoSyncIntervalMs]);

  React.useEffect(() => {
    if (!urlStateReady) return;
    writeUrlState();
  }, [page, perPage, search, nodeFilter, serviceFilter, statusFilter, invalidFilter, reasonFilter, urlStateReady]);

  const nodeOptionsResolved = useMemo(
    () => (nodeOptions.length > 0 ? nodeOptions : Array.from(new Set(items.map((item) => item.agent_hostname || item.agent_key).filter(Boolean))).sort()),
    [nodeOptions, items],
  );
  const serviceOptionsResolved = useMemo(
    () => (serviceOptions.length > 0 ? serviceOptions : Array.from(new Set(items.map((item) => item.service_name).filter(Boolean))).sort()),
    [serviceOptions, items],
  );
  const statusOptionsResolved = useMemo(
    () => (statusOptions.length > 0 ? statusOptions : Array.from(new Set(items.map((item) => item.status || 'unknown'))).sort()),
    [statusOptions, items],
  );
  const invalidReasonOptionsResolved = useMemo(() => {
    if (invalidReasonOptions.length > 0) return invalidReasonOptions;
    const allReasons: string[] = [];
    items.forEach((item) => (item.invalid_reasons || []).forEach((reason) => allReasons.push(reason)));
    return Array.from(new Set(allReasons)).sort();
  }, [invalidReasonOptions, items]);

  const allPageSelected = items.length > 0 && items.every((item) => selectedKeys.includes(buildSessionKey(item)));
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const applyFilters = () => {
    setSearch(searchInput.trim());
    setNodeFilter(nodeFilterInput);
    setServiceFilter(serviceFilterInput);
    setStatusFilter(statusFilterInput);
    setInvalidFilter(invalidFilterInput);
    setReasonFilter(reasonFilterInput);
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setNodeFilterInput('');
    setServiceFilterInput('');
    setStatusFilterInput('');
    setInvalidFilterInput('all');
    setReasonFilterInput('');
    setSearch('');
    setNodeFilter('');
    setServiceFilter('');
    setStatusFilter('');
    setInvalidFilter('all');
    setReasonFilter('');
    setPage(1);
  };

  const toggleAllPage = (checked: boolean) => {
    const keys = items.map((item) => buildSessionKey(item));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => {
        if (checked) next.add(key);
        else next.delete(key);
      });
      return Array.from(next);
    });
  };

  const toggleSelected = (item: ProjectAiAgentSessionItem, checked?: boolean) => {
    const key = buildSessionKey(item);
    setSelectedKeys((prev) => {
      const has = prev.includes(key);
      const nextChecked = typeof checked === 'boolean' ? checked : !has;
      if (nextChecked && !has) return [...prev, key];
      if (!nextChecked && has) return prev.filter((k) => k !== key);
      return prev;
    });
  };

  const terminateTargets = (targets: ProjectAiAgentSessionItem[]) =>
    targets.map((item) => ({
      agent_key: item.agent_key,
      service_name: item.service_name,
      session_id: item.session_id,
    }));

  const terminateBatch = async (targets: ProjectAiAgentSessionItem[]) => {
    if (targets.length === 0) {
      notify('请先选择至少一个会话', 'error');
      return;
    }
    if (!window.confirm(`确认终止选中的 ${targets.length} 个会话？该操作会直接删除会话。`)) return;
    setBusyKey('batch-terminate');
    try {
      const result = await api.environment.batchTerminateAiAgentSessions(projectId, terminateTargets(targets));
      setLastBatchResult(result);
      setResultOnlyFailed(result.failed_count > 0);
      setShowResultModal(true);
      notify(
        result.failed_count > 0
          ? `批量终止部分成功（${result.success_count}/${result.total}）`
          : `批量终止成功（${result.success_count}/${result.total}）`,
        result.failed_count > 0 ? 'warning' : 'success',
      );
      const deletedKeySet = new Set(
        (result.results || [])
          .filter((item) => item.success)
          .map((item) => `${item.agent_key}::${item.service_name}::${item.session_id}`),
      );
      setSelectedKeys((prev) => prev.filter((key) => !deletedKeySet.has(key)));
      await loadData(false);
    } catch (error: any) {
      notify(`批量终止失败: ${error?.message || error}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const terminateSingle = async (item: ProjectAiAgentSessionItem) => {
    await terminateBatch([item]);
  };

  const copyFailedItems = async () => {
    if (!lastBatchResult) return;
    const failed = (lastBatchResult.results || []).filter((item) => !item.success);
    if (failed.length === 0) {
      notify('没有失败项可复制', 'success');
      return;
    }
    const text = failed
      .map((item) => `${item.agent_key}/${item.service_name}/${item.session_id} | ${item.error || 'unknown error'}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(`已复制 ${failed.length} 条失败项`, 'success');
    } catch {
      notify('复制失败，请检查浏览器剪贴板权限', 'error');
    }
  };

  return (
    <div className="px-6 pt-6 pb-8">
      <div className="space-y-4">
        {feedbackNodes}
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-600">AI Agent Workspace</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">会话管理</h1>
              <p className="mt-1 text-sm text-slate-500">项目内所有 helper/agent 会话的全局视图，支持异常识别与批量终止。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">最后同步: {compactTime(lastSyncedAt)}</span>
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                />
                自动同步
              </label>
              <select
                value={String(autoSyncIntervalMs)}
                onChange={(event) => setAutoSyncIntervalMs(Number(event.target.value))}
                className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700"
                disabled={!autoSyncEnabled}
              >
                <option value="5000">5s</option>
                <option value="10000">10s</option>
                <option value="15000">15s</option>
              </select>
              <button onClick={() => void loadData(true, { silent: false })} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white">
                <RefreshCw size={15} />
                手动同步状态
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">总会话</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{stats.total_sessions}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">正常</div>
            <div className="mt-1 text-2xl font-black text-emerald-800">{stats.normal_count}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">异常</div>
            <div className="mt-1 text-2xl font-black text-amber-800">{stats.invalid_count}</div>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-700">Helper不可达</div>
            <div className="mt-1 text-2xl font-black text-rose-800">{stats.helper_unreachable_count}</div>
          </div>
        </section>

        {helperUnreachable.length > 0 ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <div className="mb-1 inline-flex items-center gap-2 font-black"><AlertTriangle size={14} />以下 helper 当前不可达</div>
            <div className="space-y-1">
              {helperUnreachable.map((item) => (
                <div key={`${item.agent_key}::${item.service_name}`} className="truncate">
                  {(item.agent_hostname || item.agent_key)} · {item.service_name} · {item.error || 'unknown error'}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-7">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="关键词: session_id / agent_id / backend"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm xl:col-span-2"
            />
            <select value={nodeFilterInput} onChange={(event) => setNodeFilterInput(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部节点</option>
              {nodeOptionsResolved.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={serviceFilterInput} onChange={(event) => setServiceFilterInput(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部 service</option>
              {serviceOptionsResolved.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={statusFilterInput} onChange={(event) => setStatusFilterInput(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部状态</option>
              {statusOptionsResolved.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={invalidFilterInput} onChange={(event) => setInvalidFilterInput(event.target.value as 'all' | 'invalid' | 'normal')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="all">全部会话</option>
              <option value="invalid">仅异常</option>
              <option value="normal">仅正常</option>
            </select>
            <select value={reasonFilterInput} onChange={(event) => setReasonFilterInput(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全部异常类型</option>
              {invalidReasonOptionsResolved.map((item) => <option key={item} value={item}>{parseInvalidReason(item)}</option>)}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={applyFilters} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">应用筛选</button>
              <button onClick={resetFilters} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">重置</button>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={allPageSelected} onChange={(event) => toggleAllPage(event.target.checked)} />
              全选当前页
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">已选 {selectedKeys.length} 个</span>
              <button
                onClick={() => void terminateBatch(items.filter((item) => selectedKeys.includes(buildSessionKey(item))))}
                disabled={selectedKeys.length === 0 || !!busyKey}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === 'batch-terminate' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                批量终止会话
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">选择</th>
                  <th className="px-2 py-2 text-left">节点 / helper</th>
                  <th className="px-2 py-2 text-left">service</th>
                  <th className="px-2 py-2 text-left">session_id</th>
                  <th className="px-2 py-2 text-left">AI Agent</th>
                  <th className="px-2 py-2 text-left">状态</th>
                  <th className="px-2 py-2 text-left">backend_pid</th>
                  <th className="px-2 py-2 text-left">更新时间</th>
                  <th className="px-2 py-2 text-left">异常原因</th>
                  <th className="px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={10}><span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />加载中...</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={10} className="p-3"><EmptyState text="当前筛选条件下没有会话。" /></td></tr>
                ) : items.map((item) => {
                  const rowKey = buildSessionKey(item);
                  return (
                    <tr key={rowKey} className={item.is_invalid ? 'bg-amber-50/40' : 'bg-white'}>
                      <td className="px-2 py-2 align-top"><input type="checkbox" checked={selectedKeys.includes(rowKey)} onChange={(event) => toggleSelected(item, event.target.checked)} /></td>
                      <td className="px-2 py-2 align-top"><div className="font-semibold text-slate-800">{item.agent_hostname || item.agent_key}</div><div className="text-slate-500">{item.agent_key}</div></td>
                      <td className="px-2 py-2 align-top">{item.service_name}</td>
                      <td className="px-2 py-2 align-top font-mono text-[11px]">{item.session_id}</td>
                      <td className="px-2 py-2 align-top">
                        <div className="inline-flex items-center gap-1.5"><SquareTerminal size={12} className="text-cyan-700" />{item.backend || '-'}</div>
                        <div className="mt-0.5 text-slate-500">{joinAgentDisplay(item) || '-'}</div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${statusBadge(item.status)}`}>{item.status || 'unknown'}</span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${sessionModeTone(item.session_mode)}`}>{sessionModeLabel(item.session_mode)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">{resolveBackendPid(item) ?? '-'}</td>
                      <td className="px-2 py-2 align-top">{compactTime(item.updated_at || item.created_at)}</td>
                      <td className="px-2 py-2 align-top">
                        {!item.is_invalid ? <span className="text-emerald-700">正常</span> : (
                          <div className="space-y-0.5 text-amber-800">
                            {(item.invalid_reasons || []).map((reason) => <div key={reason}>{parseInvalidReason(reason)}</div>)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-right">
                        <button
                          onClick={() => void terminateSingle(item)}
                          disabled={!!busyKey}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={11} />
                          终止
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">共 {total} 条，当前第 {page}/{totalPages} 页</div>
            <div className="flex items-center gap-2">
              <select
                value={String(perPage)}
                onChange={(event) => {
                  setPerPage(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                <option value="20">20 / 页</option>
                <option value="50">50 / 页</option>
                <option value="100">100 / 页</option>
                <option value="200">200 / 页</option>
              </select>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-50">上一页</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-50">下一页</button>
            </div>
          </div>
        </section>
      </div>

      {showResultModal && lastBatchResult ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <div className="text-sm font-black text-slate-900">批量终止结果</div>
                <div className="text-xs text-slate-500">{lastBatchResult.success_count}/{lastBatchResult.total} 成功</div>
              </div>
              <button onClick={() => setShowResultModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-5 text-xs">
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">总数: {lastBatchResult.total}</div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">成功: {lastBatchResult.success_count}</div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">失败: {lastBatchResult.failed_count}</div>
              </div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={resultOnlyFailed}
                    onChange={(event) => setResultOnlyFailed(event.target.checked)}
                  />
                  仅看失败项
                </label>
                <button
                  onClick={() => void copyFailedItems()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  复制失败清单
                </button>
              </div>
              <div className="space-y-1.5">
                {(lastBatchResult.results || [])
                  .filter((item) => (resultOnlyFailed ? !item.success : true))
                  .map((item) => (
                  <div key={`${item.agent_key}::${item.service_name}::${item.session_id}`} className={`rounded-lg border px-3 py-2 ${item.success ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
                    <div className="font-mono text-[11px]">{item.agent_key}/{item.service_name}/{item.session_id}</div>
                    <div className={item.success ? 'text-emerald-700' : 'text-rose-700'}>
                      {item.success ? '终止成功' : `终止失败: ${item.error || 'unknown error'}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
