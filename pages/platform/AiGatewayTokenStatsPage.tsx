import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Coins, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { api } from '../../clients/api';
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

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  colorClass?: string;
}> = ({ icon, label, value, subValue, colorClass = 'text-theme-text-primary' }) => (
 <div className="rounded-[1.5rem] border border-theme-border bg-theme-bg-app p-5">
    <div className="flex items-center justify-between gap-3">
      <div className="rounded-2xl bg-theme-elevated p-3 text-theme-text-secondary">{icon}</div>
      <div className="text-right text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">{label}</div>
    </div>
    <div className={`mt-5 text-3xl font-black tracking-tight ${colorClass}`}>{value}</div>
    {subValue ? <div className="mt-2 text-sm font-medium text-theme-text-muted">{subValue}</div> : null}
  </div>
);

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
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-theme-text-primary">Token 用量统计</h1>
          <p className="mt-2 text-sm font-medium text-theme-text-muted">按项目、任务、子任务维度分析 Token 使用情况</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={daysRange}
            onChange={(e) => setDaysRange(Number(e.target.value))}
            className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-2.5 text-sm font-bold text-theme-text-secondary"
          >
            <option value={1}>今日</option>
            <option value={7}>近 7 天</option>
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
          </select>
          <button
            onClick={() => void loadStats(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

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
 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-muted">用量趋势</div>
          <h2 className="mt-2 text-xl font-black text-theme-text-primary">Token 使用趋势图</h2>
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

 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app overflow-hidden">
        <div className="p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-muted">项目维度</div>
          <h2 className="mt-2 text-xl font-black text-theme-text-primary">按项目统计</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-theme-border bg-theme-bg-app text-theme-text-muted">
                <th className="px-6 py-4 font-black">项目</th>
                <th className="px-6 py-4 font-black text-right">请求数</th>
                <th className="px-6 py-4 font-black text-right">Prompt</th>
                <th className="px-6 py-4 font-black text-right">Completion</th>
                <th className="px-6 py-4 font-black text-right">总 Token</th>
                <th className="px-6 py-4 font-black text-right">费用</th>
                <th className="px-6 py-4 font-black text-right">缓存节省</th>
              </tr>
            </thead>
            <tbody>
              {projectStats.map((project) => (
                <React.Fragment key={project.project_id}>
                  <tr
                    className="border-b border-theme-border hover:bg-theme-elevated cursor-pointer"
                    onClick={() => handleExpandProject(project.project_id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-bold text-theme-text-primary">
                        {expandedProject === project.project_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {project.project_name || project.project_id}
                        <span className="text-xs font-medium text-theme-text-muted">{project.task_count} 任务</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(project.request_count)}</td>
                    <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(project.prompt_tokens)}</td>
                    <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(project.completion_tokens)}</td>
                    <td className="px-6 py-4 text-right font-black text-theme-text-primary">{formatNumber(project.total_tokens)}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-400">{formatCost(project.estimated_cost)}</td>
                    <td className="px-6 py-4 text-right font-medium text-blue-400">{formatNumber(project.cache_saved_tokens)}</td>
                  </tr>
                  {expandedProject === project.project_id && taskStats.filter(t => t.project_id === project.project_id).map((task) => (
                    <React.Fragment key={task.task_id}>
                      <tr
                        className="border-b border-theme-border bg-theme-bg-app hover:bg-theme-elevated cursor-pointer"
                        onClick={() => handleExpandTask(task.task_id)}
                      >
                        <td className="px-6 py-4 pl-10">
                          <div className="flex items-center gap-2 font-bold text-theme-text-primary">
                            {expandedTask === task.task_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {task.task_name || task.task_id}
                            <span className="text-xs font-medium text-theme-text-muted">{task.sub_task_count} 子任务</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(task.request_count)}</td>
                        <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(task.prompt_tokens)}</td>
                        <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(task.completion_tokens)}</td>
                        <td className="px-6 py-4 text-right font-black text-theme-text-primary">{formatNumber(task.total_tokens)}</td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-400">{formatCost(task.estimated_cost)}</td>
                        <td className="px-6 py-4 text-right font-medium text-blue-400">{formatNumber(task.cache_saved_tokens)}</td>
                      </tr>
                      {expandedTask === task.task_id && subTaskStats.filter(s => s.task_id === task.task_id).map((subTask) => (
                        <tr key={subTask.sub_task_id} className="border-b border-theme-border bg-theme-elevated">
                          <td className="px-6 py-4 pl-16">
                            <div className="font-medium text-theme-text-secondary">
                              {subTask.sub_task_name || subTask.sub_task_id}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(subTask.request_count)}</td>
                          <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(subTask.prompt_tokens)}</td>
                          <td className="px-6 py-4 text-right font-medium text-theme-text-secondary">{formatNumber(subTask.completion_tokens)}</td>
                          <td className="px-6 py-4 text-right font-bold text-theme-text-primary">{formatNumber(subTask.total_tokens)}</td>
                          <td className="px-6 py-4 text-right font-bold text-emerald-400">{formatCost(subTask.estimated_cost)}</td>
                          <td className="px-6 py-4 text-right font-medium text-blue-500">{formatNumber(subTask.cache_saved_tokens)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
              {!projectStats.length && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-theme-text-muted">暂无项目统计数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};