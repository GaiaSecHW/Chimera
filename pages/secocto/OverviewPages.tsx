import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoTask, SecOctoTaskStats, SecOctoPagerState, SecOctoNavKey } from '../../types/secocto';
import { SecOctoPager, PAGE_SIZE_OPTIONS } from './shared/Pager';
import { PageHeader } from '../../design-system';

const SCORE_CLASS = (score: number | null | undefined) => {
  if (score == null) return 'bg-gray-500/15 text-gray-600';
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-700';
  if (score >= 40) return 'bg-amber-500/15 text-amber-700';
  return 'bg-red-500/15 text-red-700';
};

const STATUS_CLASS = (status: string) => {
  if (status === 'succeeded') return 'bg-emerald-500/15 text-emerald-700';
  if (status === 'running') return 'bg-blue-500/15 text-blue-700';
  if (status === 'failed') return 'bg-red-500/15 text-red-700';
  return 'bg-gray-500/15 text-gray-600';
};

interface OverviewProps {
  onNavigateTask: (taskId: string) => void;
}

export const SecOctoOverviewPage: React.FC<OverviewProps> = ({ onNavigateTask }) => {
  const [tasks, setTasks] = useState<SecOctoTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SecOctoTaskStats | null>(null);
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });
  const [statusFilter, setStatusFilter] = useState('');
  const [agentTypeFilter, setAgentTypeFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, statsRes] = await Promise.all([
        secoctoClients.tasks.list({
          status: statusFilter,
          agent_type: agentTypeFilter,
          limit: pager.size,
          offset: (pager.page - 1) * pager.size,
        }),
        secoctoClients.tasks.stats(),
      ]);
      setTasks(taskRes.items);
      setTotal(taskRes.total);
      setStats(statsRes);
    } catch (e: any) {
      console.warn('[overview] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentTypeFilter, pager.page, pager.size]);

  useEffect(() => { void loadData(); }, [loadData]);

  const runningAgents = useMemo(() => stats?.running ?? tasks.filter((t) => t.status === 'running').length, [stats, tasks]);
  const completedTasks = useMemo(() => stats?.completed ?? tasks.filter((t) => t.status === 'succeeded').length, [stats, tasks]);

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader title="总览" description="多平台 Agent 实时态势与进化数据汇总" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: '运行中 Agent', value: runningAgents, cls: 'bg-blue-500/15 text-blue-700' },
          { label: '已完成任务', value: completedTasks, cls: 'bg-emerald-500/15 text-emerald-700' },
          { label: '平均评分', value: stats?.running ?? '—', cls: 'bg-amber-500/15 text-amber-700' },
          { label: '发现漏洞', value: stats?.total ?? '—', cls: 'bg-red-500/15 text-red-700' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border border-theme-border bg-theme-surface p-4 text-center ${card.cls}`}>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-xs mt-1 opacity-70">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-theme-text-primary">任务列表</h2>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPager((p) => ({ ...p, page: 1 })); }} className="px-2 py-1 rounded-lg text-xs border border-theme-border bg-theme-surface text-theme-text-secondary">
            <option value="">全部状态</option>
            <option value="running">运行中</option>
            <option value="succeeded">已完成</option>
            <option value="failed">失败</option>
          </select>
          <select value={agentTypeFilter} onChange={(e) => { setAgentTypeFilter(e.target.value); setPager((p) => ({ ...p, page: 1 })); }} className="px-2 py-1 rounded-lg text-xs border border-theme-border bg-theme-surface text-theme-text-secondary">
            <option value="">全部类型</option>
            <option value="binary_evolution">二进制进化</option>
            <option value="pentest">渗透测试</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-theme-elevated/5">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint">ID</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint">标题</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint">Agent</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-theme-text-faint">状态</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-theme-text-faint">评分</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-theme-text-faint">漏洞</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-theme-text-secondary">加载中…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-theme-text-secondary">暂无任务</td></tr>
              ) : tasks.map((t) => (
                <tr key={t.task_id} className="border-b border-theme-border last:border-b-0 hover:bg-brand-soft/30 cursor-pointer transition-colors" onClick={() => onNavigateTask(t.task_id)}>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-theme-text-primary">{t.task_id}</td>
                  <td className="px-3 py-2 text-theme-text-secondary truncate max-w-xs">{t.title || '—'}</td>
                  <td className="px-3 py-2 text-xs text-theme-text-secondary">{t.agent_type || '—'}</td>
                  <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS(t.status)}`}>{t.status === 'succeeded' ? '已完成' : t.status === 'running' ? '运行中' : t.status === 'failed' ? '失败' : t.status}</span></td>
                  <td className="px-3 py-2 text-center"><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${SCORE_CLASS(t.score)}`}>{t.score ?? '—'}</span></td>
                  <td className="px-3 py-2 text-center font-semibold text-theme-text-secondary">{t.vulns_discovered ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SecOctoPager total={total} state={pager} onChange={(p) => setPager((prev) => ({ ...prev, page: p }))} onSizeChange={(s) => setPager({ page: 1, size: s })} sizeOptions={PAGE_SIZE_OPTIONS} />
    </div>
  );
};

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

export const SecOctoTaskDetailPage: React.FC<TaskDetailProps> = ({ taskId, onBack }) => {
  const [task, setTask] = useState<SecOctoTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    secoctoClients.tasks
      .byId(taskId)
      .then((t) => setTask(t))
      .catch((e: any) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (error || !task) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">未找到任务</div>;

  const dims = ['evidence', 'result', 'process', 'evolution', 'consistency'];

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader title={task.task_id} back={{ label: '返回总览', onClick: onBack }} />

      <div className="rounded-xl border border-theme-border bg-theme-surface p-5 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS(task.status)}`}>{task.status === 'succeeded' ? '已完成' : task.status === 'running' ? '运行中' : task.status === 'failed' ? '失败' : task.status}</span>
              {task.agent_type && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/15 text-gray-600">{task.agent_type}</span>}
            </div>
            <div className="text-xs text-theme-text-secondary mt-2">{task.created_at && `创建：${task.created_at}`} · {task.updated_at && `更新：${task.updated_at}`}</div>
          </div>
          <div className="text-center shrink-0">
            <div className={`text-3xl font-extrabold ${SCORE_CLASS(task.score)}`}>{task.score ?? '—'}</div>
            <div className="text-xs text-theme-text-faint">/ 100</div>
          </div>
        </div>

        {task.score != null && (
          <div className="mt-4 grid gap-2">
            {dims.map((dim) => (
              <div key={dim} className="flex items-center gap-2">
                <span className="text-xs text-theme-text-faint w-20 text-right">{dim}</span>
                <div className="flex-1 h-2 bg-theme-elevated rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.min(100, task.score)}%` }} />
                </div>
                <span className="text-xs font-semibold">{task.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {task.skills_used && task.skills_used.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">技能 ({task.skills_used.length})</h3>
          <div className="flex flex-wrap gap-1">
            {task.skills_used.map((s) => <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-brand-soft text-brand-primary">{s}</span>)}
          </div>
        </section>
      )}

      {task.vulns_discovered != null && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-1">发现漏洞</h3>
          <span className="text-lg font-bold">{task.vulns_discovered}</span>
        </section>
      )}
    </div>
  );
};
