import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Coins, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { DataTable, DataTableColumn, PageHeader, StatisticCard } from '../../design-system';
import {
  AiGatewayProjectTokenStats,
  AiGatewayTaskTokenStats,
  AiGatewaySubTaskTokenStats,
  AiGatewayTokenStatsSummary,
  AiGatewayTokenStatsTrendPoint,
} from '../../types/types';

interface AiGatewayTokenStatsPageProps {
  onNavigate?: (view: string) => void;
}

const formatNumber = (value: number) => {
  if (value >= 1_000_000) return`${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return`${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('zh-CN');
};

const formatCost = (value: number) => {
  if (value >= 1) return`$${value.toFixed(2)}`;
  if (value >= 0.01) return`$${value.toFixed(3)}`;
  return`$${value.toFixed(4)}`;
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; subValue?: string; colorClass?: string }> = ({ icon, label, value, subValue, colorClass = 'text-theme-text-primary' }) => {
  const toneMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
    'text-theme-text-primary': 'default',
    'emerald': 'success',
    'rose': 'danger',
    'amber': 'warning',
    'blue': 'info',
    'indigo': 'brand',
    'violet': 'brand',
    'brand': 'brand',
  };
  const tone = Object.entries(toneMap).find(([k]) => colorClass.includes(k))?.[1] ?? 'default';
  return <StatisticCard label={label} value={value} icon={icon} hint={subValue} tone={tone} />;
};

export const AiGatewayTokenStatsPage: React.FC<AiGatewayTokenStatsPageProps> = () => {
  const platformApi = api.domains.platform;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<AiGatewayTokenStatsSummary | null>(null);
  const [projectStats, setProjectStats] = useState<AiGatewayProjectTokenStats[]>([]);
  const [taskStats, setTaskStats] = useState<AiGatewayTaskTokenStats[]>([]);
  const [subTaskStats, setSubTaskStats] = useState<AiGatewaySubTaskTokenStats[]>([]);
  const [trend, setTrend] = useState<AiGatewayTokenStatsTrendPoint[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [daysRange, setDaysRange] = useState(7);

  const loadStats = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const startDate = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();
      const [summaryResp, projectResp, trendResp] = await Promise.all([
        platformApi.aigw.getTokenStatsSummary({ start_date: startDate, end_date: endDate }),
        platformApi.aigw.getTokenStatsByProject({ start_date: startDate, end_date: endDate }),
        platformApi.aigw.getTokenStatsTrend({ start_date: startDate, end_date: endDate, days: daysRange }),
      ]);
      setSummary(summaryResp as AiGatewayTokenStatsSummary);
      setProjectStats(Array.isArray(projectResp) ? projectResp as AiGatewayProjectTokenStats[] : []);
      setTrend(Array.isArray(trendResp) ? trendResp as AiGatewayTokenStatsTrendPoint[] : []);
      setTaskStats([]);
      setSubTaskStats([]);
      setExpandedProject(null);
      setExpandedTask(null);
    } catch (err: any) {
      setError(err?.message || '加载 Token 统计失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTaskStats = async (projectId: string) => {
    try {
      const startDate = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();
      const resp = await platformApi.aigw.getTokenStatsByTask({ project_id: projectId, start_date: startDate, end_date: endDate });
      setTaskStats(Array.isArray(resp) ? resp as AiGatewayTaskTokenStats[] : []);
    } catch (err) {
      console.error('Failed to load task stats:', err);
    }
  };

  const loadSubTaskStats = async (taskId: string) => {
    try {
      const startDate = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();
      const resp = await platformApi.aigw.getTokenStatsBySubTask({ task_id: taskId, start_date: startDate, end_date: endDate });
      setSubTaskStats(Array.isArray(resp) ? resp as AiGatewaySubTaskTokenStats[] : []);
    } catch (err) {
      console.error('Failed to load subtask stats:', err);
    }
  };

  useEffect(() => {
    void loadStats();
  }, [daysRange]);

  const handleExpandProject = (projectId: string) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
      setTaskStats([]);
      setExpandedTask(null);
      setSubTaskStats([]);
    } else {
      setExpandedProject(projectId);
      setExpandedTask(null);
      setSubTaskStats([]);
      void loadTaskStats(projectId);
    }
  };

  const handleExpandTask = (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
      setSubTaskStats([]);
    } else {
      setExpandedTask(taskId);
      void loadSubTaskStats(taskId);
    }
  };

  const trendChartData = useMemo(() => {
    if (!trend.length) return null;
    const maxTokens = Math.max(...trend.map(t => t.total_tokens));
    return {
      maxTokens,
      bars: trend.map(t => ({
        date: t.date,
        tokens: t.total_tokens,
        prompt: t.prompt_tokens,
        completion: t.completion_tokens,
        height: maxTokens > 0 ? (t.total_tokens / maxTokens) * 100 : 0,
      })),
    };
  }, [trend]);

  return (
    <div className="flex min-h-full flex-col gap-6 p-8">
      <PageHeader
        title="Token 用量统计"
        description="按项目、任务、子任务维度分析 Token 使用情况"
        actions={<div className="flex items-center gap-3">
          <select
            value={daysRange}
            onChange={(e) => setDaysRange(Number(e.target.value))}
            className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary"
          >
            <option value={1}>今日</option>
            <option value={7}>近 7 天</option>
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
          </select>
          <button
            onClick={() => void loadStats(true)}
            disabled={refreshing || loading}
            className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>}
      />

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Zap className="h-5 w-5" />}
          label="总请求数"
          value={loading ? '-' : formatNumber(summary?.total_requests || 0)}
          subValue={`时间范围：近 ${daysRange} 天`}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="总 Token"
          value={loading ? '-' : formatNumber(summary?.total_tokens || 0)}
          subValue={`Prompt: ${formatNumber(summary?.total_prompt_tokens || 0)} | Completion: ${formatNumber(summary?.total_completion_tokens || 0)}`}
        />
        <MetricCard
          icon={<Coins className="h-5 w-5" />}
          label="预估费用"
          value={loading ? '-' : formatCost(summary?.total_estimated_cost || 0)}
          subValue={`缓存节省: ${formatCost(summary?.cache_saved_cost || 0)}`}
          colorClass="text-emerald-400"
        />
        <MetricCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="缓存节省"
          value={loading ? '-' : formatNumber(summary?.cache_saved_tokens || 0)}
          subValue={`节省 Token 数量`}
          colorClass="text-blue-400"
        />
      </div>

      {trendChartData ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">用量趋势</div>
          <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">Token 使用趋势图</h2>
          <div className="mt-6 flex items-end gap-2 h-32">
            {trendChartData.bars.map((bar) => (
              <div key={bar.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-theme-elevated rounded-t-lg relative" style={{ height: '100%' }}>
                  <div
                    className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all"
                    style={{ height: `${bar.height}%` }}
                  >
                    <div className="absolute bottom-0 w-full h-1/3 bg-blue-300 opacity-60 rounded-t-lg" />
                  </div>
                </div>
                <div className="text-xs font-bold text-theme-text-muted">{bar.date.slice(5)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-6 text-xs font-bold text-theme-text-muted">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600" /> 总 Token</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-300" /> Completion</div>
          </div>
        </section>
      ) : null}

 <section className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
        <div className="p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">项目维度</div>
          <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">按项目统计</h2>
        </div>
        {(() => {
          type TableRow =
            | { type: 'project'; id: string; data: AiGatewayProjectTokenStats }
            | { type: 'task'; id: string; data: AiGatewayTaskTokenStats }
            | { type: 'subtask'; id: string; data: AiGatewaySubTaskTokenStats };

          const rows: TableRow[] = [];
          for (const project of projectStats) {
            rows.push({ type: 'project', id: project.project_id, data: project });
            if (expandedProject === project.project_id) {
              for (const task of taskStats.filter(t => t.project_id === project.project_id)) {
                rows.push({ type: 'task', id: task.task_id, data: task });
                if (expandedTask === task.task_id) {
                  for (const subTask of subTaskStats.filter(s => s.task_id === task.task_id)) {
                    rows.push({ type: 'subtask', id: subTask.sub_task_id, data: subTask });
                  }
                }
              }
            }
          }

          const columns: DataTableColumn<TableRow>[] = [
            {
              key: 'name',
              header: '项目',
              render: (row) => {
                if (row.type === 'project') {
                  const p = row.data as AiGatewayProjectTokenStats;
                  return (
                    <div className="flex items-center gap-2 font-bold text-theme-text-primary">
                      {expandedProject === p.project_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {p.project_name || p.project_id}
                      <span className="text-xs font-medium text-theme-text-muted">{p.task_count} 任务</span>
                    </div>
                  );
                }
                if (row.type === 'task') {
                  const t = row.data as AiGatewayTaskTokenStats;
                  return (
                    <div className="flex items-center gap-2 font-bold text-theme-text-primary pl-6">
                      {expandedTask === t.task_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {t.task_name || t.task_id}
                      <span className="text-xs font-medium text-theme-text-muted">{t.sub_task_count} 子任务</span>
                    </div>
                  );
                }
                const s = row.data as AiGatewaySubTaskTokenStats;
                return (
                  <div className="font-medium text-theme-text-secondary pl-12">
                    {s.sub_task_name || s.sub_task_id}
                  </div>
                );
              },
            },
            {
              key: 'request_count',
              header: '请求数',
              align: 'right',
              render: (row) => <span className="font-medium text-theme-text-secondary">{formatNumber(row.data.request_count)}</span>,
            },
            {
              key: 'prompt_tokens',
              header: 'Prompt',
              align: 'right',
              render: (row) => <span className="font-medium text-theme-text-secondary">{formatNumber(row.data.prompt_tokens)}</span>,
            },
            {
              key: 'completion_tokens',
              header: 'Completion',
              align: 'right',
              render: (row) => <span className="font-medium text-theme-text-secondary">{formatNumber(row.data.completion_tokens)}</span>,
            },
            {
              key: 'total_tokens',
              header: '总 Token',
              align: 'right',
              render: (row) => <span className={row.type === 'subtask' ? 'font-bold text-theme-text-primary' : 'font-semibold text-theme-text-primary'}>{formatNumber(row.data.total_tokens)}</span>,
            },
            {
              key: 'estimated_cost',
              header: '费用',
              align: 'right',
              render: (row) => <span className="font-bold text-emerald-400">{formatCost(row.data.estimated_cost)}</span>,
            },
            {
              key: 'cache_saved_tokens',
              header: '缓存节省',
              align: 'right',
              render: (row) => <span className={`font-medium ${row.type === 'subtask' ? 'text-blue-500' : 'text-blue-400'}`}>{formatNumber(row.data.cache_saved_tokens)}</span>,
            },
          ];

          return (
            <DataTable<TableRow>
              columns={columns}
              data={rows}
              rowKey={(row) => row.id}
              loading={loading}
              empty={<div className="px-6 py-10 text-center text-theme-text-muted">暂无项目统计数据</div>}
              onRowClick={(row) => {
                if (row.type === 'project') handleExpandProject((row.data as AiGatewayProjectTokenStats).project_id);
                else if (row.type === 'task') handleExpandTask((row.data as AiGatewayTaskTokenStats).task_id);
              }}
              minWidth={900}
            />
          );
        })()}
      </section>
    </div>
  );
};