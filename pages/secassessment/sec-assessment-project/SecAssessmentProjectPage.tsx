import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye, Plus, RefreshCw, Search, Share2, AlertTriangle, Play, Pause, Square,
  RotateCcw, Trash2, CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import { PageHeader, StatisticCard, DataTable, EmptyState } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secAssessmentApi } from './client';
import {
  ProjectStatusBadge, SyncBadge, fmtTime, fmtPercent, PROJECT_STATUS_MAP,
} from './constants';
import type { ProjectListItem, ProjectStatus } from './types';
import { ProjectCreateModal } from './components/ProjectCreateModal';

interface SecAssessmentProjectPageProps {
  projectId?: string;
  onNavigateToView?: (view: string) => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  ...(['planning', 'queued', 'executing', 'paused', 'cancelled', 'completed', 'failed', 'deleted'] as ProjectStatus[]).map((s) => ({
    value: s, label: PROJECT_STATUS_MAP[s].label,
  })),
];

const SYNC_OPTIONS = [
  { value: '', label: '全部同步状态' },
  { value: 'unsync', label: '未同步' },
  { value: 'syncing', label: '同步中' },
  { value: 'synced', label: '已同步' },
  { value: 'sync_failed', label: '同步失败' },
];

export const SecAssessmentProjectPage: React.FC<SecAssessmentProjectPageProps> = ({ projectId, onNavigateToView }) => {
  const [list, setList] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await secAssessmentApi.listProjects({
        keyword: keyword.trim() || undefined,
        status: statusFilter || undefined,
        sync_status: syncFilter || undefined,
        limit: 100,
      });
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, syncFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const stats = useMemo(() => {
    const queued = list.filter((p) => p.project_status === 'planning' || p.project_status === 'queued').length;
    const executing = list.filter((p) => p.project_status === 'executing').length;
    const completed = list.filter((p) => p.project_status === 'completed').length;
    const failed = list.filter((p) => p.project_status === 'failed').length;
    const completedWithRate = list.filter((p) => p.project_status === 'completed' && p.compliance_rate != null);
    const avgRate = completedWithRate.length
      ? completedWithRate.reduce((s, p) => s + Number(p.compliance_rate), 0) / completedWithRate.length
      : 0;
    return { queued, executing, completed, failed, avgRate };
  }, [list]);

  const runAction = async (
    p: ProjectListItem,
    kind: 'pause' | 'resume' | 'cancel' | 'reExecute' | 'delete' | 'sync',
  ) => {
    const titles: Record<string, string> = {
      pause: '暂停项目', resume: '恢复项目', cancel: '取消项目',
      reExecute: '重新执行', delete: '删除项目', sync: '同步到三方系统',
    };
    const messages: Record<string, string> = {
      pause: `确认暂停项目「${p.project_name}」?暂停后 Worker 释放,checkpoint 保留。`,
      resume: `确认恢复项目「${p.project_name}」?恢复后继续执行。`,
      cancel: `确认取消项目「${p.project_name}」?取消后 Worker 释放,checkpoint 保留。`,
      reExecute: `确认重新执行项目「${p.project_name}」?从头跑,清 checkpoint + 重置所有 execution(不累加 retry_count)。`,
      delete: `确认删除项目「${p.project_name}」?终态操作,级联清理 execution + 清 checkpoint,保留日志事件,不可恢复。`,
      sync: `确认将项目「${p.project_name}」同步到三方系统?将同步项目与全部评估结果。`,
    };
    const confirmed = await showConfirm({
      title: titles[kind], message: messages[kind],
      confirmText: '确认', cancelText: '取消', danger: kind === 'delete',
    });
    if (!confirmed) return;
    setActionId(p.id);
    try {
      let result: any;
      if (kind === 'pause') result = await secAssessmentApi.pauseTask(p.chimera_need_taskId);
      else if (kind === 'resume') result = await secAssessmentApi.resumeTask(p.chimera_need_taskId);
      else if (kind === 'cancel') result = await secAssessmentApi.cancelProject(p.id);
      else if (kind === 'reExecute') result = await secAssessmentApi.reExecuteProject(p.id);
      else if (kind === 'delete') result = await secAssessmentApi.deleteTask(p.chimera_need_taskId);
      else if (kind === 'sync') result = await secAssessmentApi.syncProject(p.id);

      const msg = result?.message || (kind === 'sync' && result?.synced_executions != null
        ? `已同步 ${result.synced_executions} 条评估结果` : '操作成功');
      const ok = kind === 'sync' ? (result?.failed_executions === 0) : true;
      await showAlert({
        title: ok ? '操作完成' : '操作完成(部分失败)',
        message: msg, tone: ok ? 'success' : 'warning',
      });
      fetchList();
    } catch (e: any) {
      await showAlert({ message: e.message || '操作失败', tone: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const columns = useMemo<DataTableColumn<ProjectListItem>[]>(() => [
    {
      key: 'name', header: '项目', width: 220,
      render: (p) => (
        <div className="min-w-0">
          <div className="text-theme-text-primary font-medium truncate">{p.project_name}</div>
          <div className="text-xs text-theme-text-faint font-mono mt-0.5 truncate">{p.chimera_need_taskId}</div>
        </div>
      ),
    },
    { key: 'baseline', header: '基线', width: 160, render: (p) => <span className="text-theme-text-secondary text-sm truncate">{p.baseline_name || '—'}</span> },
    {
      key: 'status', header: '状态', width: 100,
      render: (p) => <ProjectStatusBadge status={p.project_status} />,
    },
    { key: 'executor', header: '负责人', width: 100, render: (p) => <span className="text-theme-text-secondary text-sm">{p.executor || '—'}</span> },
    { key: 'priority', header: '优先级', width: 80, render: (p) => <span className="text-theme-text-muted tabular-nums">{p.priority}</span> },
    {
      key: 'rate', header: '合规率', width: 120,
      render: (p) => {
        const r = p.compliance_rate;
        if (r == null) return <span className="text-xs text-theme-text-faint">—</span>;
        const pct = Number(r);
        const color = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400';
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 rounded-full bg-theme-elevated overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-xs text-theme-text-secondary tabular-nums">{pct.toFixed(1)}%</span>
          </div>
        );
      },
    },
    { key: 'sync', header: '同步', width: 90, render: (p) => <SyncBadge status={p.sync_status} /> },
    { key: 'time', header: '入队时间', width: 160, render: (p) => <span className="text-xs text-theme-text-muted font-mono">{fmtTime(p.create_time)}</span> },
    {
      key: 'actions', header: '操作', align: 'right', width: 150,
      render: (p) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="查看" onClick={() => onNavigateToView?.(`sec-assessment-project-detail-${p.id}`)}><Eye size={14} /></button>
          {p.project_status !== 'deleted' && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="同步" disabled={actionId === p.id} onClick={() => runAction(p, 'sync')}>
              {actionId === p.id ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />}
            </button>
          )}
          {(p.project_status === 'executing') && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-amber-400" title="暂停" disabled={actionId === p.id} onClick={() => runAction(p, 'pause')}><Pause size={14} /></button>
          )}
          {p.project_status === 'paused' && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-emerald-400" title="恢复" disabled={actionId === p.id} onClick={() => runAction(p, 'resume')}><Play size={14} /></button>
          )}
          {(p.project_status === 'executing' || p.project_status === 'paused') && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-zinc-400" title="取消" disabled={actionId === p.id} onClick={() => runAction(p, 'cancel')}><Square size={14} /></button>
          )}
          {(p.project_status === 'cancelled' || p.project_status === 'completed' || p.project_status === 'failed') && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-violet-400" title="重新执行" disabled={actionId === p.id} onClick={() => runAction(p, 'reExecute')}><RotateCcw size={14} /></button>
          )}
          {p.project_status !== 'deleted' && (
            <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-rose-400" title="删除" disabled={actionId === p.id} onClick={() => runAction(p, 'delete')}><Trash2 size={14} /></button>
          )}
        </div>
      ),
    },
  ], [onNavigateToView, actionId, runAction]);

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
          <PageHeader
            title="安全评估项目"
            description="评估项目的创建、执行控制与结果管理"
            actions={
              <div className="flex items-center gap-2">
                <button className="btn-icon" title="刷新" onClick={fetchList}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> 新建评估任务</button>
              </div>
            }
          />

          <div className="grid gap-4 grid-cols-2 xl:grid-cols-5">
            <StatisticCard label="排队中" value={stats.queued} icon={<Clock size={16} />} tone="info" />
            <StatisticCard label="执行中" value={stats.executing} icon={<Play size={16} />} tone="brand" />
            <StatisticCard label="已完成" value={stats.completed} icon={<CheckCircle2 size={16} />} tone="success" />
            <StatisticCard label="失败" value={stats.failed} icon={<AlertTriangle size={16} />} tone="danger" />
            <StatisticCard label="平均合规率" value={stats.avgRate ? `${stats.avgRate.toFixed(1)}%` : '—'} icon={<TrendingUp size={16} />} tone="success" />
          </div>

          <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-theme-border-subtle flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={14} />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索项目名 / taskId..."
                  className="form-input text-sm pl-8"
                />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-select text-sm w-auto">
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)} className="form-select text-sm w-auto">
                {SYNC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-xs text-theme-text-faint">共 {list.length} 条</span>
              </div>
            </div>
            <DataTable
              columns={columns}
              data={list}
              rowKey={(p) => String(p.id)}
              loading={loading && list.length === 0}
              showRowNumber
              minWidth={1240}
              onRowClick={(p) => onNavigateToView?.(`sec-assessment-project-detail-${p.id}`)}
              empty={<EmptyState variant="inline" title="暂无匹配的评估项目" />}
            />
          </div>
        </div>
      </div>

      <ProjectCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={fetchList} projectId={projectId || ''} />
    </div>
  );
};

export default SecAssessmentProjectPage;
