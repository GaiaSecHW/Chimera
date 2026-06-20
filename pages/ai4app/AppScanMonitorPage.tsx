import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';

import type {
  AppScanOcPod,
  AppScanOcServer,
  AppScanOpencodeInstances,
  AppScanPoolStats,
  AppScanTokenJob,
  AppScanTokenStats,
} from './appScan';
import { appScanApi } from './appScan';
import { PageHeader } from '../../design-system';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------
interface Props {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const POOL_POLL_MS = 10000;

const fmtTk = (n?: number) => {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return`${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return`${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
};

const fmtDuration = (start?: number, end?: number) => {
  if (!start) return '';
  const diff = Math.max(0, Math.round((end || Date.now() / 1000) - start));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  let r = '';
  if (h > 0) r +=`${h}h`;
  if (m > 0 || h > 0) r +=`${m}m`;
  r +=`${s}s`;
  return r;
};

const fmtTimeShort = (ts?: number) => {
  if (!ts) return '--';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString();
};

const queueAgeText = (sec?: number) => {
  if (!sec || sec <= 0) return '最久等待: --';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return`最久等待: ${m}m${s}s`;
};

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

const StatCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-theme-text-muted">{label}</p>
    {children}
  </div>
);

const SectionCard: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-theme-text-primary">{title}</h2>
      {extra}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const ocStatusTone = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'STARTING':
      return 'bg-sky-500/15 text-sky-400';
    case 'DRAINING':
      return 'bg-amber-500/15 text-amber-400';
    case 'STOPPED':
      return 'bg-theme-elevated text-theme-text-muted';
    case 'FAILED':
      return 'bg-rose-500/15 text-rose-400';
    default:
      return 'bg-theme-elevated text-theme-text-muted';
  }
};

const jobStatusTone = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'done':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'running':
      return 'bg-sky-500/15 text-sky-400';
    case 'failed':
    case 'error':
      return 'bg-rose-500/15 text-rose-400';
    case 'pending':
      return 'bg-theme-elevated text-theme-text-secondary';
    case 'paused':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-theme-elevated text-theme-text-muted';
  }
};

const OcServerTable: React.FC<{ servers: AppScanOcServer[]; urlToJob: Record<string, string> }> = ({ servers, urlToJob }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-theme-border text-left text-xs font-medium uppercase tracking-wider text-theme-text-muted">
          <th className="px-3 py-2">ID</th>
          <th className="px-3 py-2">状态</th>
          <th className="px-3 py-2">URL</th>
          <th className="px-3 py-2">Provider</th>
          <th className="px-3 py-2 text-center">Sessions</th>
          <th className="px-3 py-2">运行时长</th>
          <th className="px-3 py-2">绑定 Job</th>
          <th className="px-3 py-2 text-center">PID</th>
        </tr>
      </thead>
      <tbody>
        {servers.map((s, i) => {
          const boundJob = s.base_url ? urlToJob[s.base_url] : undefined;
          return (
            <tr key={s.instance_id || i} className="border-b border-slate-50 hover:bg-slate-100/70">
              <td className="px-3 py-2 font-mono text-xs text-theme-text-secondary">{(s.instance_id || '').slice(0, 8)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ocStatusTone(s.status)}`}>{s.status || '-'}</span>
              </td>
              <td className="px-3 py-2 text-xs text-theme-text-secondary">{(s.base_url || '--').replace(/^https?:\/\//, '')}</td>
              <td className="px-3 py-2 text-xs text-theme-text-muted">{s.provider_id || '-'}</td>
              <td className="px-3 py-2 text-center text-xs text-theme-text-secondary">{s.session_count || 0}</td>
              <td className="px-3 py-2 text-xs text-theme-text-muted">{fmtDuration(s.started_at_epoch)}</td>
              <td className="px-3 py-2">
                {boundJob ? (
                  <span className="font-mono text-xs text-indigo-400">{boundJob.slice(0, 8)}...</span>
                ) : (
                  <span className="text-xs text-theme-text-faint">-</span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-xs text-theme-text-muted">{s.pid || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------
export const AppScanMonitorPage: React.FC<Props> = ({ onBack }) => {
  const [pool, setPool] = useState<AppScanPoolStats | null>(null);
  const [oc, setOc] = useState<AppScanOpencodeInstances | null>(null);
  const [token, setToken] = useState<AppScanTokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token range
  const [tokenRange, setTokenRange] = useState<'all' | '1d' | '7d' | '30d'>('all');
  const mountedRef = useRef(true);
  const poolTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPool = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    try {
      const [poolData, ocData] = await Promise.all([
        appScanApi.getPoolStats(),
        appScanApi.getOpencodeInstances(),
      ]);
      if (!mountedRef.current) return;
      setPool(poolData);
      setOc(ocData);
      setError(null);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || '加载失败');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadToken = useCallback(async (range: 'all' | '1d' | '7d' | '30d') => {
    const now = Date.now() / 1000;
    let since: number | undefined;
    if (range === '1d') since = now - 86400;
    else if (range === '7d') since = now - 7 * 86400;
    else if (range === '30d') since = now - 30 * 86400;
    try {
      const data = await appScanApi.getTokenStats(since);
      if (!mountedRef.current) return;
      setToken(data);
    } catch {
      // token 统计失败不阻断
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void loadPool();
    void loadToken('all');
    return () => {
      mountedRef.current = false;
      if (poolTimerRef.current) clearTimeout(poolTimerRef.current);
    };
  }, [loadPool, loadToken]);

  // Auto-poll pool + opencode (silent)
  useEffect(() => {
    if (poolTimerRef.current) {
      clearTimeout(poolTimerRef.current);
      poolTimerRef.current = null;
    }
    poolTimerRef.current = setTimeout(() => {
      void loadPool({ silent: true });
    }, POOL_POLL_MS);
    return () => {
      if (poolTimerRef.current) clearTimeout(poolTimerRef.current);
    };
  }, [pool, loadPool]);

  const handleTokenRangeChange = (range: 'all' | '1d' | '7d' | '30d') => {
    setTokenRange(range);
    void loadToken(range);
  };

  // Derived data
  const urlToJob = useMemo(() => {
    const map: Record<string, string> = {};
    (oc?.job_bindings || []).forEach((b) => {
      map[b.base_url] = b.job_id;
    });
    return map;
  }, [oc]);

  const activeProjects = pool?.active_projects || [];
  const taskCounts = pool?.task_counts || {};
  const scheduling = pool?.scheduling || { in_flight: 0, total_dispatched: 0, total_slots: 0 };
  const queue = pool?.queue || { length: 0, oldest_age_seconds: 0 };
  const keys = pool?.keys || {};
  const pods = oc?.pods || [];
  const totalDraining = pods.reduce((sum, p) => sum + (p.status?.draining || 0), 0);
  const totalCapacity = pods.reduce((sum, p) => sum + (p.status?.max_pool_size || 0), 0);

  const tokenSummary = token?.summary || { input: 0, cache_read: 0, output: 0, cost: 0 };
  const tokenJobs = (token?.jobs || []).filter(
    (j) => (j.token_input || 0) + (j.token_cache_read || 0) + (j.token_output || 0) > 0,
  );

  // ---- Render ----
  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <PageHeader
        title="引擎监控"
        back={{ onClick: onBack }}
        actions={
          <button
            type="button"
            onClick={() => void loadPool()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
          >
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {refreshing ? '刷新中...' : '刷新'}
          </button>
        }
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-theme-text-muted">
          <Loader2 size={18} className="animate-spin" />
          加载监控数据...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
          {error}
        </div>
      )}

      {!loading && !error && pool && (
        <>
          {/* Top stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="引擎状态">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${pool.engine_running ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="text-sm font-medium text-theme-text-secondary">{pool.engine_running ? '运行中' : '已停止'}</span>
              </div>
            </StatCard>
            <StatCard label="进行中的扫描">
              <span className="text-2xl font-medium text-indigo-400">{activeProjects.length}</span>
            </StatCard>
            <StatCard label="调度中">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-medium text-sky-400">{scheduling.in_flight}</span>
                <span className="text-xs text-theme-text-muted">/ {scheduling.total_slots}</span>
              </div>
            </StatCard>
            <StatCard label="排队中">
              <span className="text-2xl font-bold text-amber-500">{taskCounts.PENDING || 0}</span>
            </StatCard>
            <StatCard label="累计调度">
              <span className="text-2xl font-medium text-theme-text-secondary">{scheduling.total_dispatched}</span>
            </StatCard>
            <StatCard label="Redis 队列深度">
              <span className="text-2xl font-bold text-orange-500">{queue.length}</span>
              <p className="mt-1 text-xs text-theme-text-muted">{queueAgeText(queue.oldest_age_seconds)}</p>
            </StatCard>
          </div>

          {/* Active projects */}
          <SectionCard title="正在扫描的项目">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-theme-text-muted">当前没有正在扫描的项目</p>
            ) : (
              <div className="space-y-3">
                {activeProjects.map((p) => (
                  <div key={p.job_id} className="flex items-center gap-4 text-sm">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    <span className="font-semibold text-theme-text-primary">{p.project_name || p.workspace || '--'}</span>
                    <span className="text-xs text-theme-text-muted">Job {p.job_id ?`${p.job_id.slice(0, 8)}...` : '--'}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Concurrency controller */}
          <SectionCard title="并发控制器">
            {Object.keys(keys).length === 0 ? (
              <p className="text-sm text-theme-text-muted">暂无并发 key</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border text-left text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                      <th className="px-3 py-2">Key</th>
                      <th className="px-3 py-2">调度中 / 并发槽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(keys).map(([name, k]) => (
                      <tr key={name} className="border-b border-slate-50">
                        <td className="px-3 py-3 text-sm font-semibold text-theme-text-primary">{name}</td>
                        <td className="px-3 py-3 text-sm text-theme-text-secondary">{k.in_flight} / {k.concurrency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* OpenCode instances */}
          <SectionCard
            title="OpenCode 实例"
            extra={<span className="text-xs text-theme-text-muted">{oc?.error ||`${pods.length} 个 Manager Pod`}</span>}
          >
            {oc?.error && pods.length === 0 ? (
              <p className="text-sm text-theme-text-muted">{oc.error}</p>
            ) : (
              <>
                {/* Summary */}
                <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center">
                    <div className="text-xl font-semibold text-theme-text-secondary">{oc?.total_instances || 0}</div>
                    <div className="text-xs text-theme-text-muted">总实例</div>
                  </div>
                  <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center">
                    <div className="text-xl font-semibold text-emerald-400">{oc?.total_active || 0}</div>
                    <div className="text-xs text-theme-text-muted">Active</div>
                  </div>
                  <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center">
                    <div className="text-xl font-semibold text-amber-400">{totalDraining}</div>
                    <div className="text-xs text-theme-text-muted">Draining</div>
                  </div>
                  <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center">
                    <div className="text-xl font-semibold text-theme-text-muted">{totalCapacity}</div>
                    <div className="text-xs text-theme-text-muted">总容量</div>
                  </div>
                </div>

                {/* Pods */}
                {pods.length === 0 ? (
                  <p className="text-sm text-theme-text-muted">暂无 OpenCode Manager 连接</p>
                ) : (
                  <div className="space-y-4">
                    {pods.map((pod, idx) => (
                      <OcPodBlock key={pod.pod_url || idx} pod={pod} urlToJob={urlToJob} />
                    ))}
                  </div>
                )}

                {/* Job bindings */}
                {(oc?.job_bindings || []).length > 0 && (
                  <div className="mt-4 border-t border-theme-border pt-4">
                    <p className="mb-2 text-xs font-medium text-theme-text-muted">Job 绑定 ({(oc?.job_bindings || []).length})</p>
                    <div className="flex flex-wrap gap-2">
                      {(oc?.job_bindings || []).map((b, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-2 py-1 text-xs">
                          <span className="font-semibold text-indigo-400">Job {b.job_id ? b.job_id.slice(0, 8) : '?'}</span>
                          <span className="text-theme-text-muted">→</span>
                          <span className="text-theme-text-secondary">{b.base_url.replace(/^https?:\/\//, '')}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* Token stats */}
          <SectionCard
            title="Token 消耗统计"
            extra={
              <div className="flex items-center gap-1.5">
                {(['all', '1d', '7d', '30d'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleTokenRangeChange(r)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      tokenRange === r ? 'bg-indigo-500/15 text-indigo-400' : 'text-theme-text-muted hover:bg-theme-elevated'
                    }`}
                  >
                    {r === 'all' ? '全部' : r === '1d' ? '前一天' : r === '7d' ? '前一周' : '前一月'}
                  </button>
                ))}
              </div>
            }
          >
            {/* Summary cards */}
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="总 Token">
                <span className="text-2xl font-medium text-indigo-400">
                  {fmtTk(tokenSummary.input + tokenSummary.cache_read + tokenSummary.output)}
                </span>
              </StatCard>
              <StatCard label="输入">
                <span className="text-2xl font-medium text-sky-400">{fmtTk(tokenSummary.input + tokenSummary.cache_read)}</span>
                <p className="mt-1 text-xs text-theme-text-muted">缓存命中: {fmtTk(tokenSummary.cache_read)}</p>
              </StatCard>
              <StatCard label="输出">
                <span className="text-2xl font-medium text-emerald-400">{fmtTk(tokenSummary.output)}</span>
              </StatCard>
              <StatCard label="费用">
                <span className="text-2xl font-medium text-theme-text-secondary">{tokenSummary.cost ?`$${tokenSummary.cost.toFixed(2)}` : '--'}</span>
              </StatCard>
            </div>

            {/* Jobs table */}
            {tokenJobs.length === 0 ? (
              <p className="text-sm text-theme-text-muted">所选时间段内暂无 token 消耗</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border text-left text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                      <th className="px-3 py-2">项目</th>
                      <th className="px-3 py-2">扫描时间</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">模型</th>
                      <th className="px-3 py-2 text-right">总 Token</th>
                      <th className="px-3 py-2 text-right">输入</th>
                      <th className="px-3 py-2 text-right">缓存命中</th>
                      <th className="px-3 py-2 text-right">输出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenJobs.map((j: AppScanTokenJob) => {
                      const total = (j.token_input || 0) + (j.token_cache_read || 0) + (j.token_output || 0);
                      const start = j.started_at || j.created_at;
                      return (
                        <tr key={j.job_id} className="border-b border-slate-50">
                          <td className="px-3 py-2.5 text-sm font-semibold text-theme-text-primary">{j.project_display_name || j.project_name || '--'}</td>
                          <td className="px-3 py-2.5 text-xs text-theme-text-muted">
                            {fmtTimeShort(start)} ~ {fmtTimeShort(j.completed_at)}
                            {(j.started_at || j.created_at) && <span className="text-theme-text-muted"> ({fmtDuration(start, j.completed_at)})</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${jobStatusTone(j.status)}`}>{j.status || '-'}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-theme-text-muted">{j.model_name || '自动'}</td>
                          <td className="px-3 py-2.5 text-right text-sm font-medium text-indigo-400">{fmtTk(total)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-theme-text-secondary">{fmtTk((j.token_input || 0) + (j.token_cache_read || 0))}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-sky-500">{fmtTk(j.token_cache_read)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-theme-text-secondary">{fmtTk(j.token_output)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
};

const OcPodBlock: React.FC<{ pod: AppScanOcPod; urlToJob: Record<string, string> }> = ({ pod, urlToJob }) => {
  const podHost = (pod.pod_url || '--').replace(/^https?:\/\//, '');
  if (pod.error) {
    return (
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/15 p-4">
        <p className="text-sm font-semibold text-rose-400">Manager: {podHost}</p>
        <p className="mt-1 text-xs text-rose-500">连接失败: {pod.error}</p>
      </div>
    );
  }
  const status = pod.status || {};
  const servers = status.servers || [];
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-semibold text-theme-text-primary">Manager: {podHost}</span>
        <span className="text-xs text-theme-text-muted">
          {status.active || 0} active / {status.total || 0} total (容量: {status.max_pool_size || 0})
        </span>
      </div>
      {servers.length === 0 ? (
        <p className="pl-5 text-xs text-theme-text-muted">暂无实例</p>
      ) : (
        <div className="pl-5">
          <OcServerTable servers={servers} urlToJob={urlToJob} />
        </div>
      )}
    </div>
  );
};