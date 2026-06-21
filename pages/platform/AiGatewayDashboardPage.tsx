import React, { useEffect, useState } from 'react';
import { Activity, Coins, FileText, KeyRound, RefreshCw, Settings, TrendingUp } from 'lucide-react';
import { api } from '../../clients/api';

interface AiGatewayDashboardPageProps {
  onNavigate: (view: string) => void;
}

type DashboardSummaryResponse = {
  range?: {
    preset?: string;
    start_at?: string;
    end_at?: string;
  };
  runtime?: {
    active_requests?: number;
    waiting_requests?: number;
    active_task_keys?: number;
    waiting_task_keys?: number;
    active_models?: number;
  };
  usage?: {
    total_requests?: number;
    total_prompt_tokens?: number;
    total_completion_tokens?: number;
    total_tokens?: number;
    total_estimated_cost?: number;
    cache_saved_tokens?: number;
    cache_saved_cost?: number;
  };
};

type DashboardActiveTaskKeyItem = {
  task_key_id: number;
  task_key_prefix: string;
  task_key_name: string;
  active_requests?: number;
  waiting_requests?: number;
  request_count: number;
  total_tokens: number;
};

type DashboardActiveModelItem = {
  backend_unit_id: number;
  model_name: string;
  backend_model_name: string;
  display_name: string;
  active_requests: number;
  waiting_requests: number;
  success_rate: number;
};

type DashboardRecentLogItem = {
  id: number;
  created_at: string;
  model_name: string;
  backend_model_name: string;
  status_code: number;
  response_time: number;
};

const numberText = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
const compactNumber = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('zh-CN');
};
const formatCost = (value: number) => {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
};
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';
const formatPercent = (value: number) => `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;

const DASHBOARD_RANGE_OPTIONS = [
  { value: '15m', label: '最近 15 分钟' },
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
];

const getRangeLabel = (value?: string | null) =>
  DASHBOARD_RANGE_OPTIONS.find((item) => item.value === value)?.label || value || '当前';

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-panel">
    <div className="flex items-center justify-between gap-3">
      <div className="rounded-2xl bg-theme-elevated p-3 text-theme-text-secondary">{icon}</div>
      <div className="text-right text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">{label}</div>
    </div>
    <div className="mt-5 text-3xl font-black tracking-tight text-theme-text-primary">{value}</div>
    <div className="mt-2 text-sm font-medium text-theme-text-muted">{hint}</div>
  </div>
);

export const AiGatewayDashboardPage: React.FC<AiGatewayDashboardPageProps> = ({ onNavigate }) => {
  const platformApi = api.domains.platform;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [activeTaskKeys, setActiveTaskKeys] = useState<DashboardActiveTaskKeyItem[]>([]);
  const [activeModels, setActiveModels] = useState<DashboardActiveModelItem[]>([]);
  const [logs, setLogs] = useState<DashboardRecentLogItem[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [rangePreset, setRangePreset] = useState('24h');

  const loadDashboard = async (silent = false, range = rangePreset) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [summaryResp, taskResp, modelResp, logResp] = await Promise.all([
        platformApi.aigw.getDashboardSummary({ range }),
        platformApi.aigw.getDashboardActiveTaskKeys({ range, limit: 10 }),
        platformApi.aigw.getDashboardActiveModels({ range, limit: 10 }),
        platformApi.aigw.getDashboardRecentLogs({ limit: 10 }),
      ]);
      setSummary((summaryResp || null) as DashboardSummaryResponse | null);
      setActiveTaskKeys(Array.isArray(taskResp?.items) ? taskResp.items as DashboardActiveTaskKeyItem[] : []);
      setActiveModels(Array.isArray(modelResp?.items) ? modelResp.items as DashboardActiveModelItem[] : []);
      setLogs(Array.isArray(logResp?.items) ? logResp.items as DashboardRecentLogItem[] : []);
      setLogsTotal(Number(logResp?.total || 0));
    } catch (err: any) {
      setError(err?.message || '加载 AI 网关 Dashboard 失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard(false, rangePreset);
  }, [rangePreset]);

  const errorLogs = logs.filter((item) => Number(item.status_code || 0) >= 400).length;
  const rangeLabel = getRangeLabel(summary?.range?.preset || rangePreset);

  return (
    <div className="flex min-h-full flex-col gap-6 p-8">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-theme-text-primary">Dashboard</h1>
        </div>
        <button
          onClick={() => void loadDashboard(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]">
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label="实时队列"
          value={loading ? '-' : `${numberText(summary?.runtime?.active_requests || 0)} / ${numberText(summary?.runtime?.waiting_requests || 0)}`}
          hint={`${numberText(summary?.runtime?.active_models || 0)} 个模型活跃，${numberText(summary?.runtime?.waiting_task_keys || 0)} 个任务密钥处于等待`}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={`${rangeLabel}总 Token`}
          value={loading ? '-' : compactNumber(summary?.usage?.total_tokens || 0)}
          hint={`Prompt ${compactNumber(summary?.usage?.total_prompt_tokens || 0)} | Completion ${compactNumber(summary?.usage?.total_completion_tokens || 0)}`}
        />
        <MetricCard
          icon={<Coins className="h-5 w-5" />}
          label={`${rangeLabel}预估费用`}
          value={loading ? '-' : formatCost(summary?.usage?.total_estimated_cost || 0)}
          hint={`共 ${compactNumber(summary?.usage?.total_requests || 0)} 次请求`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr_1fr]">
        <section className="rounded-xl border border-theme-border bg-theme-surface p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">{rangeLabel}统计</div>
              <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">活跃任务</h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={rangePreset}
                onChange={(event) => setRangePreset(event.target.value)}
                disabled={loading || refreshing}
                className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-sm font-bold text-theme-text-secondary outline-none transition hover:bg-theme-surface disabled:opacity-50"
              >
                {DASHBOARD_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button onClick={() => onNavigate('aigw-keys')} className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
                <KeyRound className="h-4 w-4" />
                密钥管理
              </button>
            </div>
          </div>
          <div className="mt-5 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-theme-border text-theme-text-muted">
                  <th className="px-3 py-3 font-bold">Key Name</th>
                  <th className="px-3 py-3 font-bold text-right">活跃请求</th>
                  <th className="px-3 py-3 font-bold text-right">排队请求</th>
                  <th className="px-3 py-3 font-bold text-right">Token 用量</th>
                  <th className="px-3 py-3 font-bold text-right">请求次数</th>
                </tr>
              </thead>
              <tbody>
                {activeTaskKeys.map((item) => (
                  <tr key={item.task_key_id} className="border-b border-theme-border">
                    <td className="px-3 py-3">
                      <div className="line-clamp-2 break-words font-bold leading-6 text-theme-text-primary">{item.task_key_name || item.task_key_prefix}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-theme-text-primary">{numberText(item.active_requests || 0)}</td>
                    <td className="px-3 py-3 text-right text-theme-text-secondary">{numberText(item.waiting_requests || 0)}</td>
                    <td className="px-3 py-3 text-right font-black text-theme-text-primary">{compactNumber(item.total_tokens || 0)}</td>
                    <td className="px-3 py-3 text-right text-theme-text-secondary">{item.request_count || 0}</td>
                  </tr>
                ))}
                {!activeTaskKeys.length && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-theme-text-muted">{rangeLabel}暂无活跃任务记录</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-theme-border bg-theme-surface p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">模型视图</div>
              <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">活跃模型</h2>
            </div>
            <button onClick={() => onNavigate('aigw-config')} className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <Settings className="h-4 w-4" />
              网关配置
            </button>
          </div>
          <div className="mt-5 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-theme-border text-theme-text-muted">
                  <th className="px-3 py-3 font-bold">模型</th>
                  <th className="px-3 py-3 font-bold text-right">活跃</th>
                  <th className="px-3 py-3 font-bold text-right">排队</th>
                  <th className="px-3 py-3 font-bold text-right">成功率</th>
                </tr>
              </thead>
              <tbody>
                {activeModels.map((item) => (
                  <tr key={item.backend_unit_id} className="border-b border-theme-border">
                    <td className="px-3 py-3">
                      <div className="truncate font-bold text-theme-text-primary">{item.display_name || item.backend_model_name || item.model_name}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-theme-text-primary">{numberText(item.active_requests || 0)}</td>
                    <td className="px-3 py-3 text-right text-theme-text-secondary">{numberText(item.waiting_requests || 0)}</td>
                    <td className="px-3 py-3 text-right text-theme-text-secondary">{formatPercent(Number(item.success_rate || 0))}</td>
                  </tr>
                ))}
                {!activeModels.length && !loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-theme-text-muted">暂无活跃模型</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-theme-border bg-theme-surface p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">近期请求</div>
              <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">网关调用日志</h2>
            </div>
            <button onClick={() => onNavigate('aigw-logs')} className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <FileText className="h-4 w-4" />
              全部日志
            </button>
          </div>
          <div className="mt-5 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-theme-border text-theme-text-muted">
                  <th className="px-3 py-3 font-bold">时间</th>
                  <th className="px-3 py-3 font-bold">模型</th>
                  <th className="px-3 py-3 font-bold">状态</th>
                  <th className="px-3 py-3 font-bold">延迟</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-theme-border">
                    <td className="px-3 py-3 text-theme-text-secondary">{formatDateTime(log.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-theme-text-primary">{log.model_name || '-'}</div>
                      <div className="text-xs text-theme-text-muted">{log.backend_model_name || '-'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(log.status_code || 0) >= 200 && Number(log.status_code || 0) < 300 ? 'bg-emerald-500/15 text-emerald-400' : Number(log.status_code || 0) >= 400 ? 'bg-rose-500/15 text-rose-400' : 'bg-theme-elevated text-theme-text-secondary'}`}>{log.status_code || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-theme-text-secondary">{log.response_time || 0} ms</td>
                  </tr>
                ))}
                {!logs.length && !loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-theme-text-muted">暂无请求日志</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs font-bold text-theme-text-muted">共 {numberText(logsTotal)} 条日志，当前预览 {logs.length} 条，错误预览 {errorLogs} 条。</div>
        </section>

      </div>
    </div>
  );
};
