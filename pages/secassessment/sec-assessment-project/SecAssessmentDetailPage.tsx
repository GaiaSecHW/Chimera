import React, { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Share2, RefreshCw, MoreHorizontal, ChevronDown, ChevronRight,
  Pause, Play, Square, RotateCcw, Trash2, Server, Activity,
  CheckCircle2, AlertCircle, Clock, Cpu, Settings, Info,
  Database, Compass, ClipboardCheck, FileText,
} from 'lucide-react';
import { PageHeader, DataTable, EmptyState } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secAssessmentApi } from './client';
import {
  ProjectStatusBadge, SyncBadge, ActionBadge, fmtTime, fmtPercent,
  PROJECT_STATUS_MAP, ENGINE_MAP, TIMEOUT_UNIT_MAP, countByResult, buildItemTree,
} from './constants';
import type {
  ProjectDetail, OperationLogItem, EventItem,
  BaselineTreeResponse, ExecutionResult, ExecutionUpdate,
} from './types';
import { ExecResultPanel } from './components/ExecResultPanel';
import { ReportPanel, ResultDonut } from './components/ReportPanel';

interface SecAssessmentDetailPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'pipeline', label: '流水线' },
  { key: 'results', label: '评估结果' },
  { key: 'stats', label: '统计' },
  { key: 'report', label: '评估报告' },
  { key: 'worker', label: 'Worker' },
  { key: 'logs', label: '操作日志' },
  { key: 'events', label: '事件' },
] as const;
type TabKey = typeof TABS[number]['key'];

type PhaseIconType = React.ComponentType<{ size?: number; className?: string }>;

const PIPELINE_PHASES: { key: string; label: string; Icon: PhaseIconType; step: number }[] = [
  { key: 'baseline', label: '基线解析', Icon: Database, step: 1 },
  { key: 'context', label: '上下文', Icon: Compass, step: 2 },
  { key: 'assessment', label: '评估', Icon: ClipboardCheck, step: 3 },
  { key: 'report', label: '报告', Icon: FileText, step: 4 },
];

const PHASE_STATUS: Record<string, { label: string; Icon: PhaseIconType; color: string; border: string; bg: string; spin?: boolean }> = {
  completed: { label: 'DONE', Icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/5' },
  finish: { label: 'DONE', Icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/5' },
  running: { label: 'RUNNING', Icon: RefreshCw, color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/5', spin: true },
  executing: { label: 'RUNNING', Icon: RefreshCw, color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/5', spin: true },
  failed: { label: 'FAILED', Icon: AlertCircle, color: 'text-rose-400', border: 'border-rose-500/40', bg: 'bg-rose-500/5' },
  pending: { label: 'PENDING', Icon: Clock, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' },
};
const DEFAULT_PHASE_STATUS: { label: string; Icon: PhaseIconType; color: string; border: string; bg: string; spin?: boolean } = { label: 'NOT STARTED', Icon: Clock, color: 'text-theme-text-faint', border: 'border-theme-border', bg: '' };

export const SecAssessmentDetailPage: React.FC<SecAssessmentDetailPageProps> = ({ projectId, onNavigateToView }) => {
  const id = Number(projectId);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<OperationLogItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState<Set<string>>(new Set(PIPELINE_PHASES.map((p) => p.key)));
  const [baselineTree, setBaselineTree] = useState<BaselineTreeResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [execLoaded, setExecLoaded] = useState(false);
  const [execLoading, setExecLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await secAssessmentApi.getProject(id));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try { setLogs(await secAssessmentApi.getLogs(id)); } catch { setLogs([]); } finally { setLogsLoading(false); }
  }, [id]);
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try { setEvents(await secAssessmentApi.getEvents(id)); } catch { setEvents([]); } finally { setEventsLoading(false); }
  }, [id]);

  useEffect(() => {
    if (tab === 'logs' && logs.length === 0) fetchLogs();
    if (tab === 'events' && events.length === 0) fetchEvents();
  }, [tab]);

  // Tab3/4/5 首次选中时统一拉取 baseline-tree + executions
  const fetchExecData = useCallback(async () => {
    setExecLoading(true);
    try {
      const [tree, execs] = await Promise.all([
        secAssessmentApi.getBaselineTree(id),
        secAssessmentApi.listExecutions(id),
      ]);
      setBaselineTree(tree);
      setExecutions(Array.isArray(execs) ? execs : []);
      setExecLoaded(true);
    } catch {
      setBaselineTree(null);
      setExecutions([]);
      setExecLoaded(true);
    } finally {
      setExecLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if ((tab === 'results' || tab === 'stats' || tab === 'report') && !execLoaded) {
      fetchExecData();
    }
  }, [tab, execLoaded, fetchExecData]);

  const handleSaveExecution = useCallback(async (eid: number, payload: ExecutionUpdate): Promise<ExecutionResult> => {
    const updated = await secAssessmentApi.updateExecution(id, eid, payload);
    setExecutions((prev) => prev.map((e) => (e.id === eid ? updated : e)));
    return updated;
  }, [id]);

  const runControl = async (kind: 'pause' | 'resume' | 'cancel' | 'reExecute' | 'delete' | 'sync') => {
    if (!detail) return;
    setMoreOpen(false);
    const titles: Record<string, string> = {
      pause: '暂停项目', resume: '恢复项目', cancel: '取消项目',
      reExecute: '重新执行', delete: '删除项目', sync: '同步到三方系统',
    };
    const messages: Record<string, string> = {
      pause: `确认暂停「${detail.project_name}」?Worker 释放,checkpoint 保留。`,
      resume: `确认恢复「${detail.project_name}」?继续执行。`,
      cancel: `确认取消「${detail.project_name}」?Worker 释放,checkpoint 保留。`,
      reExecute: `确认重新执行「${detail.project_name}」?从头跑,清 checkpoint + 重置 execution。`,
      delete: `确认删除「${detail.project_name}」?级联清理,不可恢复。`,
      sync: `确认同步「${detail.project_name}」到三方?将同步项目与全部评估结果。`,
    };
    const confirmed = await showConfirm({
      title: titles[kind], message: messages[kind],
      confirmText: '确认', cancelText: '取消', danger: kind === 'delete',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      let result: any;
      if (kind === 'pause') result = await secAssessmentApi.pauseTask(detail.chimera_need_taskId);
      else if (kind === 'resume') result = await secAssessmentApi.resumeTask(detail.chimera_need_taskId);
      else if (kind === 'cancel') result = await secAssessmentApi.cancelProject(id);
      else if (kind === 'reExecute') result = await secAssessmentApi.reExecuteProject(id);
      else if (kind === 'delete') result = await secAssessmentApi.deleteTask(detail.chimera_need_taskId);
      else if (kind === 'sync') result = await secAssessmentApi.syncProject(id);

      const msg = result?.message || (kind === 'sync' && result?.synced_executions != null
        ? `已同步 ${result.synced_executions} 条评估结果` : '操作成功');
      const ok = kind === 'sync' ? (result?.failed_executions === 0) : true;
      await showAlert({ title: ok ? '操作完成' : '操作完成(部分失败)', message: msg, tone: ok ? 'success' : 'warning' });
      if (kind === 'delete') { onNavigateToView?.('sec-assessment-project-list'); return; }
      fetchDetail();
    } catch (e: any) {
      await showAlert({ message: e.message || '操作失败', tone: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-theme-text-muted">加载中...</div>;
  if (!detail) return <div className="p-10 text-center text-theme-text-muted">项目不存在或加载失败</div>;

  const status = detail.project_status;
  const canPause = status === 'executing';
  const canResume = status === 'paused';
  const canCancel = status === 'executing' || status === 'paused';
  const canReExecute = status === 'cancelled' || status === 'completed' || status === 'failed';
  const canDelete = status !== 'deleted';
  const canSync = status !== 'deleted';

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="px-5 md:px-6 2xl:px-8 pt-5 pb-4 border-b border-theme-border">
        <PageHeader
          back={{ label: '返回项目列表', onClick: () => onNavigateToView?.('sec-assessment-project-list') }}
          title={detail.project_name}
          description={
            <span className="flex items-center gap-3 flex-wrap text-xs">
              <span className="font-mono text-theme-text-faint">{detail.chimera_need_taskId}</span>
              <span className="text-theme-text-faint">·</span>
              <span>{detail.baseline_name || '—'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>{detail.executor || '—'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>{fmtTime(detail.create_time)}</span>
              <ProjectStatusBadge status={status} />
              <SyncBadge status={detail.sync_status} />
            </span>
          }
          actions={
            <div className="flex items-center gap-2 relative">
              {canSync && (
                <button className="btn btn-secondary" onClick={() => runControl('sync')} disabled={actionLoading}>
                  {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />} 同步
                </button>
              )}
              <div className="flex items-center gap-1">
                {canPause && <button className="btn-icon" title="暂停" onClick={() => runControl('pause')} disabled={actionLoading}><Pause size={15} /></button>}
                {canResume && <button className="btn-icon" title="恢复" onClick={() => runControl('resume')} disabled={actionLoading}><Play size={15} /></button>}
                {canCancel && <button className="btn-icon" title="取消" onClick={() => runControl('cancel')} disabled={actionLoading}><Square size={15} /></button>}
                {canReExecute && <button className="btn-icon" title="重新执行" onClick={() => runControl('reExecute')} disabled={actionLoading}><RotateCcw size={15} /></button>}
              </div>
              {canDelete && (
                <button className="btn-icon" onClick={() => setMoreOpen((v) => !v)}><MoreHorizontal size={15} /></button>
              )}
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-theme-surface border border-theme-border rounded-lg shadow-overlay p-1 z-50" onClick={() => setMoreOpen(false)}>
                  <button className="w-full text-left px-3 py-2 text-xs rounded-md text-state-danger hover:bg-rose-500/10 flex items-center gap-2" onClick={() => runControl('delete')}><Trash2 size={13} /> 删除项目</button>
                </div>
              )}
            </div>
          }
        />
      </div>

      <nav className="px-5 md:px-6 2xl:px-8 flex items-center gap-6 border-b border-theme-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key ? 'text-brand-primary border-brand-primary' : 'text-theme-text-muted border-transparent hover:text-theme-text-primary'
            }`}
          >{t.label}</button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-5 md:px-6 2xl:px-8 py-5 space-y-4">
          {tab === 'overview' && <OverviewTab detail={detail} executions={executions} onNavigateToView={onNavigateToView} />}
          {tab === 'pipeline' && <PipelineTab detail={detail} expanded={pipelineExpanded} setExpanded={setPipelineExpanded} />}
          {tab === 'results' && (execLoading ? <div className="p-10 text-center text-theme-text-muted">加载评估结果...</div> : <ExecResultPanel baselineTree={baselineTree} executions={executions} onExecutionUpdated={fetchExecData} onSaveExecution={handleSaveExecution} />)}
          {tab === 'stats' && <StatsTab detail={detail} executions={executions} tree={baselineTree} />}
          {tab === 'report' && <ReportPanel detail={detail} executions={executions} tree={baselineTree} />}
          {tab === 'worker' && <WorkerTab detail={detail} onNavigateToView={onNavigateToView} />}
          {tab === 'logs' && <LogsTab logs={logs} loading={logsLoading} />}
          {tab === 'events' && <EventsTab events={events} loading={eventsLoading} />}
        </div>
      </div>
    </div>
  );
};

// ===== Tab1 概览 =====
const OverviewTab: React.FC<{ detail: ProjectDetail; executions: ExecutionResult[]; onNavigateToView?: (v: string) => void }> = ({ detail, executions, onNavigateToView }) => {
  const env = detail.chimera_env || {};
  const snap = detail.config_snapshot || {};
  const envEntries = Object.entries(env).filter(([k]) => k !== 'key');
  const rate = detail.compliance_rate != null ? Number(detail.compliance_rate) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 基本信息 */}
      <Card title="基本信息" icon={<Info size={14} />}>
        <Grid>
          <Field label="项目名称" value={detail.project_name} />
          <Field label="UUID" value={detail.uuid} mono />
          <Field label="基线" value={detail.baseline_name || '—'} />
          <Field label="目标环境" value={detail.environment || '—'} />
          <Field label="负责人" value={detail.executor || '—'} />
          <Field label="优先级" value={String(detail.priority)} />
          <Field label="重试" value={`${detail.retry_count} / ${snap.max_retry ?? '—'}`} mono />
          <Field label="claim_version" value={String(detail.claim_version)} mono />
          <Field label="创建时间" value={fmtTime(detail.create_time)} mono />
          <Field label="状态" value={PROJECT_STATUS_MAP[detail.project_status]?.label || detail.project_status} />
        </Grid>
      </Card>

      {/* Chimera 集成 */}
      <Card title="Chimera 集成" icon={<Cpu size={14} />}>
        <div className="text-xs text-theme-text-faint mb-1">chimera_env(key 已脱敏)</div>
        <div className="rounded-md bg-theme-elevated p-2 mb-3 max-h-40 overflow-y-auto custom-scrollbar">
          {envEntries.length === 0 ? <span className="text-xs text-theme-text-faint">—</span> : envEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs py-0.5">
              <span className="text-theme-text-faint shrink-0 w-28 truncate">{k}:</span>
              <span className="text-theme-text-secondary font-mono break-all">{String(v)}</span>
            </div>
          ))}
        </div>
        <Grid cols={2}>
          <Field label="taskId" value={detail.chimera_need_taskId} mono />
          <Field label="Worker" value={detail.worker_name || '—'} />
          <Field label="error" value={detail.error_message || '—'} />
          <Field label="同步状态" value={<SyncBadge status={detail.sync_status} />} />
        </Grid>
        <div className="mt-3 pt-3 border-t border-theme-border-subtle">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-theme-text-faint">三方系统同步</span>
            <button className="text-xs text-brand-primary hover:underline" onClick={() => onNavigateToView?.('sec-assessment-project-detail-' + detail.id)}>手动同步</button>
          </div>
        </div>
      </Card>

      {/* 执行统计 */}
      <Card title="执行统计" icon={<CheckCircle2 size={14} />}>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="总项" value={detail.total_items ?? '—'} />
          <Tile label="已完成" value={detail.finish_count ?? '—'} tone="text-emerald-400" />
          <Tile label="合规率" value={rate != null ? `${rate.toFixed(2)}%` : '—'} tone="text-brand-primary" />
        </div>
        {executions.length > 0 && (
          <div className="mt-4 flex justify-center">
            <ResultDonut counts={countByResult(executions)} total={executions.length} />
          </div>
        )}
      </Card>

      {/* 运行配置 */}
      <Card title="运行配置(config_snapshot)" icon={<Settings size={14} />}>
        <Grid>
          <Field label="agent 引擎" value={ENGINE_MAP[snap.agent_engine_type as keyof typeof ENGINE_MAP]?.label || snap.agent_engine_type || '—'} />
          <Field label="tool 最大重试" value={String(snap.max_retry ?? '—')} mono />
          <Field label="agent 最大执行" value={String(snap.max_agent_exec_count ?? '—')} mono />
          <Field label="基线执行并发" value={String(snap.concurrency ?? '—')} mono />
          <Field label="最大超时" value={`${snap.max_timeout_value ?? '—'} ${TIMEOUT_UNIT_MAP[snap.max_timeout_unit as keyof typeof TIMEOUT_UNIT_MAP] || ''}`} mono />
          <Field label="tool_type" value={String(snap.tool_type ?? '—')} mono />
        </Grid>
        <div className="text-xs text-theme-text-faint mt-2">项目 dispatch 时从全局配置刷新快照</div>
      </Card>
    </div>
  );
};

// ===== Tab2 流水线 =====
const PipelineTab: React.FC<{ detail: ProjectDetail; expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>> }> = ({ detail, expanded, setExpanded }) => {
  const cp = detail.checkpoint || {};
  const hasCp = Object.keys(cp).length > 0;
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const getStatus = (status?: string) => (status && PHASE_STATUS[status]) || DEFAULT_PHASE_STATUS;

  if (!hasCp) {
    return <div className="text-center text-theme-text-faint py-12 text-sm">无 checkpoint（项目未执行或已重置）</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-theme-text-primary">4 阶段流水线 Checkpoint</span>
        <span className="text-xs text-theme-text-faint ml-2">点击卡片展开/收起详情</span>
      </div>

      {/* 水平步骤条 */}
      <div className="flex items-stretch gap-1 overflow-x-auto custom-scrollbar pb-1">
        {PIPELINE_PHASES.map((phase, i) => {
          const info = cp[phase.key];
          const st = getStatus(info?.status);
          const isOpen = expanded.has(phase.key);
          const PhaseIcon = phase.Icon;
          const StatusIcon = st.Icon;
          return (
            <Fragment key={phase.key}>
              <button
                onClick={() => toggle(phase.key)}
                className={`flex-1 min-w-[140px] rounded-xl border ${st.border} ${st.bg} bg-theme-surface p-3 text-left transition-all ${isOpen ? 'ring-1 ring-brand-primary/30' : 'hover:brightness-110'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${st.color} border ${st.border}`}>{phase.step}</span>
                  <PhaseIcon size={14} className={st.color} />
                  <span className="text-sm font-medium text-theme-text-primary truncate">{phase.label}</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <StatusIcon size={12} className={`${st.color} ${st.spin ? 'animate-spin' : ''}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${st.color}`}>{st.label}</span>
                </div>
              </button>
              {i < PIPELINE_PHASES.length - 1 && (
                <div className="flex items-center text-theme-text-faint shrink-0">
                  <ChevronRight size={16} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* 细节区 */}
      <div className="space-y-3">
        {PIPELINE_PHASES.map((phase) => {
          if (!expanded.has(phase.key)) return null;
          const info = cp[phase.key];
          const st = getStatus(info?.status);
          const PhaseIcon = phase.Icon;
          const StatusIcon = st.Icon;
          return (
            <div key={phase.key} className={`rounded-lg border ${st.border} bg-theme-elevated p-4 space-y-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PhaseIcon size={15} className={st.color} />
                  <span className="text-sm font-semibold text-theme-text-primary">{phase.label}</span>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${st.color}`}>
                  <StatusIcon size={12} className={st.spin ? 'animate-spin' : ''} />
                  {st.label}
                </span>
              </div>
              <div>
                <div className="text-xs text-theme-text-faint mb-1">artifact</div>
                {info?.artifacts && info.artifacts.length > 0 ? (
                  <div className="space-y-1">
                    {info.artifacts.map((a, idx) => (
                      <div key={idx} className="text-xs font-mono text-theme-text-secondary break-all bg-theme-surface rounded p-2 border border-theme-border-subtle">{a}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-theme-text-faint">无 artifact</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ===== Tab4 统计 =====
const StatsTab: React.FC<{ detail: ProjectDetail; executions: ExecutionResult[]; tree: BaselineTreeResponse | null }> = ({ detail, executions, tree }) => {
  const rate = detail.compliance_rate != null ? Number(detail.compliance_rate) : null;
  const total = detail.total_items ?? 0;
  const finish = detail.finish_count ?? 0;
  const unfinished = Math.max(0, total - finish);
  const pct = total ? (finish / total) * 100 : 0;
  const counts = countByResult(executions);

  // 按一级维度分组
  const dimensionStats = React.useMemo(() => {
    if (!tree) return [];
    const roots = buildItemTree(tree.nodes);
    const dimMap = new Map<string, Record<string, number>>();
    const walk = (nodes: any[], dimName?: string) => {
      nodes.forEach((n) => {
        if (n.node_type === 'level1') {
          const name = n.name;
          if (!dimMap.has(name)) dimMap.set(name, { PASS: 0, PARTIAL: 0, FAIL: 0, N_A: 0, OTHER: 0 });
          walk(n.children, name);
        } else if (n.node_type === 'item' && dimName) {
          const exec = executions.find((e) => e.item_node_id === n.id);
          const r = exec?.execute_result || 'OTHER';
          const m = dimMap.get(dimName)!;
          m[r in m ? r : 'OTHER'] = (m[r in m ? r : 'OTHER'] || 0) + 1;
        } else {
          walk(n.children, dimName);
        }
      });
    };
    walk(roots);
    return Array.from(dimMap.entries());
  }, [tree, executions]);

  return (
    <div className="space-y-4">
      {/* 顶部汇总 — 5 个统一 tile */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg border border-theme-border-subtle bg-theme-elevated p-3 text-center">
          <div className="text-2xl font-bold text-theme-text-primary tabular-nums">{total}</div>
          <div className="text-xs text-theme-text-faint mt-1">总检查项</div>
        </div>
        <div className="rounded-lg border border-theme-border-subtle bg-theme-elevated p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">{finish}</div>
          <div className="text-xs text-theme-text-faint mt-1">已完成</div>
        </div>
        <div className="rounded-lg border border-theme-border-subtle bg-theme-elevated p-3 text-center">
          <div className="text-2xl font-bold text-amber-400 tabular-nums">{unfinished}</div>
          <div className="text-xs text-theme-text-faint mt-1">未完成</div>
        </div>
        <div className="rounded-lg border border-theme-border-subtle bg-theme-elevated p-3 text-center">
          <div className="text-2xl font-bold text-brand-primary tabular-nums">{pct.toFixed(1)}%</div>
          <div className="text-xs text-theme-text-faint mt-1">执行进度</div>
        </div>
        <div className="rounded-lg border border-theme-border-subtle bg-theme-elevated p-3 text-center">
          <div className="text-2xl font-bold text-brand-primary tabular-nums">{rate != null ? `${rate.toFixed(2)}%` : '—'}</div>
          <div className="text-xs text-theme-text-faint mt-1">合规率</div>
        </div>
      </div>

      {/* 结论分布 */}
      {executions.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
          <div className="text-sm font-medium text-theme-text-primary mb-3">评估结论分布</div>
          <div className="space-y-2">
            {[
              { key: 'PASS', label: 'PASS', color: 'bg-emerald-400' },
              { key: 'PARTIAL', label: 'PARTIAL', color: 'bg-amber-400' },
              { key: 'FAIL', label: 'FAIL', color: 'bg-rose-400' },
              { key: 'N_A', label: 'N_A', color: 'bg-sky-400' },
              { key: 'MANUAL_REVIEW', label: 'MANUAL_REVIEW', color: 'bg-violet-400' },
            ].map((r) => {
              const c = counts[r.key] || 0;
              const w = executions.length ? (c / executions.length) * 100 : 0;
              return (
                <div key={r.key} className="flex items-center gap-3">
                  <span className="text-xs text-theme-text-secondary w-28 shrink-0">{r.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-theme-elevated overflow-hidden">
                    <div className={`h-full ${r.color} transition-all`} style={{ width: `${w}%` }} />
                  </div>
                  <span className="text-xs text-theme-text-muted tabular-nums w-8 text-right">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 按一级维度分组 — 堆叠条状图 */}
      {dimensionStats.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
          <div className="text-sm font-medium text-theme-text-primary mb-3">按一级维度分组</div>
          <div className="space-y-3">
            {dimensionStats.map(([dim, c]) => {
              const sum = (c.PASS || 0) + (c.PARTIAL || 0) + (c.FAIL || 0) + (c.N_A || 0) + (c.OTHER || 0);
              const segs = [
                { key: 'PASS', count: c.PASS || 0, color: 'bg-emerald-400' },
                { key: 'PARTIAL', count: c.PARTIAL || 0, color: 'bg-amber-400' },
                { key: 'FAIL', count: c.FAIL || 0, color: 'bg-rose-400' },
                { key: 'N_A', count: c.N_A || 0, color: 'bg-sky-400' },
                { key: 'OTHER', count: c.OTHER || 0, color: 'bg-zinc-500' },
              ].filter((s) => s.count > 0);
              return (
                <div key={dim} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-theme-text-secondary truncate">{dim}</span>
                    <span className="text-theme-text-faint tabular-nums">共 {sum}</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-theme-elevated">
                    {sum > 0 && segs.map((s) => (
                      <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${(s.count / sum) * 100}%` }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {segs.map((s) => (
                      <span key={s.key} className="flex items-center gap-1 text-theme-text-muted">
                        <span className={`w-2 h-2 rounded-full ${s.color}`} />
                        {s.key} {s.count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-theme-border-subtle text-[10px] text-theme-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />PASS</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />PARTIAL</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />FAIL</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" />N_A</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-500" />OTHER</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Tab6 Worker =====
const WorkerTab: React.FC<{ detail: ProjectDetail; onNavigateToView?: (v: string) => void }> = ({ detail, onNavigateToView }) => {
  if (!detail.worker_name) {
    return <EmptyState variant="block" icon={<Server size={32} />} title="无分配的 Worker" description="当前项目暂无 Worker 分配" />;
  }
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface p-5 max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <Server size={16} className="text-brand-primary" />
        <span className="text-sm font-medium text-theme-text-primary">{detail.worker_name}</span>
      </div>
      <Grid cols={2}>
        <Field label="Worker ID" value={detail.worker_id ? String(detail.worker_id) : '—'} mono />
        <Field label="claim_version" value={String(detail.claim_version)} mono />
      </Grid>
      <button className="btn btn-secondary text-xs mt-3" onClick={() => onNavigateToView?.('sec-assessment-workers')}>
        <Activity size={13} /> 查看 Worker 管理
      </button>
    </div>
  );
};

// ===== Tab7 操作日志 =====
const LogsTab: React.FC<{ logs: OperationLogItem[]; loading: boolean }> = ({ logs, loading }) => {
  const columns: DataTableColumn<OperationLogItem>[] = [
    { key: 'time', header: '时间', width: 150, render: (r) => <span className="text-xs font-mono text-theme-text-muted">{fmtTime(r.create_time)}</span> },
    { key: 'action', header: '操作', width: 120, render: (r) => <ActionBadge action={r.action} /> },
    { key: 'target', header: '对象', render: (r) => <span className="text-xs font-mono text-theme-text-faint">{r.target_table}#{r.target_id}</span> },
    { key: 'detail', header: '描述', render: (r) => <span className="text-sm text-theme-text-secondary">{r.action_detail || '—'}</span> },
    { key: 'person', header: '操作人', width: 100, render: (r) => <span className="text-sm text-theme-text-secondary">{r.person_name || r.person_id || '—'}</span> },
  ];
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <DataTable columns={columns} data={logs} rowKey={(r) => String(r.id)} loading={loading && logs.length === 0} minWidth={700} showRowNumber empty={<EmptyState variant="inline" title="暂无操作日志" />} />
    </div>
  );
};

// ===== Tab8 事件 =====
const EventsTab: React.FC<{ events: EventItem[]; loading: boolean }> = ({ events, loading }) => {
  const columns: DataTableColumn<EventItem>[] = [
    { key: 'time', header: '时间', width: 150, render: (r) => <span className="text-xs font-mono text-theme-text-muted">{fmtTime(r.create_time)}</span> },
    { key: 'type', header: '事件类型', width: 160, render: (r) => <ActionBadge action={r.event_type} /> },
    { key: 'target', header: '对象', render: (r) => <span className="text-xs font-mono text-theme-text-faint">{r.target_table}#{r.target_id}</span> },
    {
      key: 'change', header: '状态变更', width: 180,
      render: (r) => r.from_status || r.to_status ? (
        <span className="text-xs font-mono text-theme-text-secondary">{r.from_status || '—'} → {r.to_status || '—'}</span>
      ) : <span className="text-xs text-theme-text-faint">—</span>,
    },
    { key: 'detail', header: '描述', render: (r) => <span className="text-sm text-theme-text-secondary">{r.event_detail || '—'}</span> },
    { key: 'person', header: '触发人', width: 100, render: (r) => <span className="text-sm text-theme-text-secondary">{r.person_name || r.person_id || '—'}</span> },
  ];
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <DataTable columns={columns} data={events} rowKey={(r) => String(r.id)} loading={loading && events.length === 0} minWidth={800} showRowNumber empty={<EmptyState variant="inline" title="暂无事件" />} />
    </div>
  );
};

// ===== 共用小组件 =====
const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <div className="flex items-center gap-2 text-sm font-medium text-theme-text-primary mb-3">{icon}{title}</div>
    {children}
  </div>
);

const GridColClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

const Grid: React.FC<{ cols?: number; children: React.ReactNode }> = ({ cols = 2, children }) => (
  <div className={`grid ${GridColClass[cols] || GridColClass[2]} gap-3`}>{children}</div>
);

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <div className="text-xs text-theme-text-faint mb-0.5 truncate">{label}</div>
    <div className={`text-sm text-theme-text-secondary truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

const Tile: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-center">
    <div className={`text-lg font-bold tabular-nums ${tone || 'text-theme-text-primary'}`}>{value}</div>
    <div className="text-xs text-theme-text-faint mt-0.5">{label}</div>
  </div>
);

export default SecAssessmentDetailPage;
