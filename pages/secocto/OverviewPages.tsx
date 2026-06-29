import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoTask, SecOctoTaskStats, SecOctoPagerState } from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import { getInitialResponsivePageSize, useResponsivePageSize } from './shared/useResponsivePageSize';
import { fmtCount, fmtTimeCompact } from './shared/format';
import {
  SECOCTO_AGENT_TYPES,
  SECOCTO_STATUS_OPTIONS,
  scoreClass,
  statusMeta,
  sumByAgent,
} from './shared/taskMeta';

// TaskDetail 已拆到独立文件,这里 re-export 让 viewRegistry 的旧 import 路径不动。
export { SecOctoTaskDetailPage } from './TaskDetailPage';

const OVERVIEW_PAGE_SIZE_OPTIONS = [5, 10, 20];

interface OverviewProps {
  onNavigateTask: (taskId: string) => void;
}

interface ExtraStats {
  indexedSkills: number | null;
  wikiTotal: number | null;
  vulnsDiscovered: number | null;
}

export const SecOctoOverviewPage: React.FC<OverviewProps> = ({ onNavigateTask }) => {
  const [tasks, setTasks] = useState<SecOctoTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SecOctoTaskStats | null>(null);
  const [extra, setExtra] = useState<ExtraStats>({ indexedSkills: null, wikiTotal: null, vulnsDiscovered: null });
  const [pager, setPager] = useState<SecOctoPagerState>(() => ({ page: 1, size: getInitialResponsivePageSize() }));
  const [userPickedSize, setUserPickedSize] = useState(false);
  const responsiveSize = useResponsivePageSize();

  // 视口断点变化时,自动跟随;但若用户手动选过页大小,就不再覆盖。
  // 切换 size 时重算 page,使原首条仍可见,避免每次缩放都跳回第 1 页。
  useEffect(() => {
    if (userPickedSize) return;
    setPager((prev) => {
      if (prev.size === responsiveSize) return prev;
      const firstItemIndex = (prev.page - 1) * prev.size;
      const nextPage = Math.floor(firstItemIndex / responsiveSize) + 1;
      return { page: Math.max(1, nextPage), size: responsiveSize };
    });
  }, [responsiveSize, userPickedSize]);
  const [statusFilter, setStatusFilter] = useState('');
  const [agentTypeFilter, setAgentTypeFilter] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const taskRes = await secoctoClients.tasks.list({
        status: statusFilter,
        agent_type: agentTypeFilter,
        limit: pager.size,
        offset: (pager.page - 1) * pager.size,
      });
      setTasks(taskRes.items);

      // total 4 级兜底,对齐 secocto-ui overview.js loadTaskPage:
      //   ① stats.by_agent 求和(权威总数,与"运行中 Agent"卡同源)
      //   ② client 返回的 total > 0(对象形态响应)
      //   ③ 启发式:满页 → offset+size+1(让"下一页"可点)
      //   ④ 不满页 → offset+len(已知尾页)
      // 注:client 端遇到裸数组响应会把 total 兜底为当前页 length,所以这里
      //    必须自行二次推断;否则分页器会显示"共 N 条 / 1 页"——翻不动页。
      const offset = (pager.page - 1) * pager.size;
      const statsTotal = sumByAgent(stats);
      let computedTotal: number;
      if (statsTotal != null) {
        computedTotal = statsTotal;
      } else if (typeof taskRes.total === 'number' && taskRes.total > taskRes.items.length) {
        computedTotal = taskRes.total;
      } else if (taskRes.items.length === pager.size) {
        // 满页:无法知道是否还有下一页,先 +1 让分页器可点
        computedTotal = offset + pager.size + 1;
      } else {
        // 不满页:已知是最后一页
        computedTotal = offset + taskRes.items.length;
      }
      setTotal(computedTotal);
    } catch (e: any) {
      console.warn('[secocto-overview] load tasks failed:', e);
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentTypeFilter, pager.page, pager.size, stats]);

  // 6 张统计卡的数据来自 4 个并行接口:tasks.stats / skills.healthz / memories.status / vuln.healthz
  // 各自失败独立兜底,不互相阻塞
  const loadAggregates = useCallback(async () => {
    const [tStats, sHealth, mStatus, vHealth] = await Promise.all([
      secoctoClients.tasks.stats().catch((e) => { console.warn('[secocto-overview] tasks.stats failed:', e); return null; }),
      secoctoClients.skills.healthz().catch((e) => { console.warn('[secocto-overview] skills.healthz failed:', e); return null; }),
      secoctoClients.memories.status().catch((e) => { console.warn('[secocto-overview] memories.status failed:', e); return null; }),
      secoctoClients.vuln.healthz().catch((e) => { console.warn('[secocto-overview] vuln.healthz failed:', e); return null; }),
    ]);
    setStats(tStats);
    setExtra({
      indexedSkills: typeof sHealth?.indexed_skills === 'number' ? sHealth.indexed_skills : null,
      // memories 状态接口主键是 wiki_total(原 overview.js 用法);旧 raw_pending 不是总数
      wikiTotal: typeof (mStatus as any)?.wiki_total === 'number' ? (mStatus as any).wiki_total : null,
      vulnsDiscovered: typeof (vHealth as any)?.total_findings === 'number' ? (vHealth as any).total_findings : null,
    });
    setLastUpdated(new Date().toLocaleString('zh-CN', { hour12: false }));
  }, []);

  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => { void loadAggregates(); }, [loadAggregates]);

  // 派生 6 张卡:运行中 Agent 优先按 stats.by_agent 求和(原口径),否则回退到列表里 running 计数
  const runningAgents = useMemo(() => {
    const fromStats = sumByAgent(stats);
    if (fromStats != null) return fromStats;
    if (typeof stats?.running === 'number') return stats.running;
    return tasks.filter((t) => t.status === 'running').length;
  }, [stats, tasks]);

  const completedTasks = useMemo(() => {
    const v = stats?.by_status?.completed ?? stats?.completed;
    if (typeof v === 'number') return v;
    return tasks.filter((t) => t.status === 'completed' || t.status === 'succeeded').length;
  }, [stats, tasks]);

  const avgScore = useMemo(() => {
    const v = stats?.avg_score;
    if (typeof v === 'number' && !isNaN(v)) return v.toFixed(1);
    return '0.0';
  }, [stats]);

  const handleFilterChange = (next: { status?: string; agent?: string }) => {
    if (next.status !== undefined) setStatusFilter(next.status);
    if (next.agent !== undefined) setAgentTypeFilter(next.agent);
    setPager((p) => ({ ...p, page: 1 }));
  };

  return (
    <div className="px-8 pt-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-theme-text-primary">总览</h1>
        <p className="text-sm text-theme-text-secondary mt-1">
          多平台 Agent 实时态势 · 进化数据汇总
          {lastUpdated && <span className="ml-3 text-xs text-theme-text-faint">最后更新:{lastUpdated}</span>}
        </p>
      </div>

      {/* 6 张统计卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="运行中 Agent" value={String(runningAgents)} />
        <StatCard label="累计完成任务" value={fmtCount(completedTasks)} />
        <StatCard label="进化技能库" value={extra.indexedSkills == null ? '—' : String(extra.indexedSkills)} />
        <StatCard label="进化记忆库" value={extra.wikiTotal == null ? '—' : String(extra.wikiTotal)} />
        <StatCard label="进化素材库" value={extra.vulnsDiscovered == null ? '—' : String(extra.vulnsDiscovered)} />
        <StatCard label="平均分" value={avgScore} />
      </div>

      {/* 任务表头部 + 过滤 */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold text-theme-text-primary">任务列表</h2>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange({ status: e.target.value })}
            className="form-select text-xs"
          >
            {SECOCTO_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={agentTypeFilter}
            onChange={(e) => handleFilterChange({ agent: e.target.value })}
            className="form-select text-xs"
          >
            {SECOCTO_AGENT_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 任务表 13 列 */}
      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-theme-bg-elevated/40">
              <tr>
                {['任务 ID','任务摘要','平台','Agent','得分','标签','卡片','提案','发现','确认','状态','更新时间','操作'].map((h, i) => (
                  <th key={i} className={`px-3 py-2 text-xs font-semibold text-theme-text-faint whitespace-nowrap ${i >= 6 && i <= 9 ? 'text-center' : i === 12 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="py-10 text-center text-theme-text-secondary">加载中…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={13} className="py-10 text-center text-theme-text-secondary">暂无任务</td></tr>
              ) : tasks.map((t) => <TaskRow key={t.task_id} task={t} onClick={() => onNavigateTask(t.task_id)} />)}
            </tbody>
          </table>
        </div>
      </div>

      <SecOctoPager
        total={total}
        state={pager}
        onChange={(p) => setPager((prev) => ({ ...prev, page: p }))}
        onSizeChange={(s) => {
          setUserPickedSize(true);
          setPager({ page: 1, size: s });
        }}
        sizeOptions={OVERVIEW_PAGE_SIZE_OPTIONS}
      />
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-4 text-center">
    <div className="text-2xl font-bold text-theme-text-primary">{value}</div>
    <div className="text-xs text-theme-text-faint mt-1">{label}</div>
  </div>
);

const TaskRow: React.FC<{ task: SecOctoTask; onClick: () => void }> = ({ task, onClick }) => {
  const status = statusMeta(task.status);
  const scoreCls = scoreClass(task.score);
  const summary = task.summary || task.title || '-';
  const platform = task.platform_name || task.platform || '-';
  const tags = (task.tags || []).slice(0, 3);
  const scoreText = task.score == null ? '-' : task.score;

  return (
    <tr
      onClick={onClick}
      className="border-b border-theme-border last:border-b-0 hover:bg-brand-soft/30 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2 font-mono text-xs text-theme-text-primary whitespace-nowrap">{task.task_id}</td>
      <td className="px-3 py-2 text-theme-text-secondary max-w-xs">
        <div className="truncate" title={summary}>{summary}</div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-2 py-0.5 rounded text-xs bg-theme-bg-elevated text-theme-text-secondary">{platform}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-2 py-0.5 rounded text-xs bg-theme-bg-elevated text-theme-text-secondary">{task.agent_type || '-'}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${scoreCls}`}>{scoreText}</span>
      </td>
      <td className="px-3 py-2">
        {tags.length === 0 ? <span className="text-theme-text-faint">-</span> : (
          <div className="flex flex-wrap gap-1">
            {tags.map((tg) => (
              <span key={tg} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-soft text-brand-primary whitespace-nowrap">{tg}</span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-center text-theme-text-secondary">{task.card_count ?? '-'}</td>
      <td className="px-3 py-2 text-center text-theme-text-secondary">{task.proposal_count ?? '-'}</td>
      <td className="px-3 py-2 text-center text-theme-text-secondary">{task.vulns_found ?? '-'}</td>
      <td className="px-3 py-2 text-center text-theme-text-secondary">{task.vulns_confirmed ?? '-'}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>{status.label}</span>
      </td>
      <td className="px-3 py-2 text-xs text-theme-text-secondary whitespace-nowrap">{fmtTimeCompact(task.updated_at)}</td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="px-2 py-0.5 rounded-md text-xs text-brand-primary hover:bg-brand-soft transition-colors whitespace-nowrap"
        >
          详情 →
        </button>
      </td>
    </tr>
  );
};
