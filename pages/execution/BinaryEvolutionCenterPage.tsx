import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { api } from '../../clients/api';
import {
  BinaryEvolutionPreviewResponse,
  BinaryEvolutionTaskDetail,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';
import { useUiFeedback } from '../../components/UiFeedback';

interface Props {
  projectId: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const APPLY_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  applied: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
};

const fmtTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const fmtNumber = (value: unknown, digits = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return digits > 0 ? num.toFixed(digits) : String(Math.round(num));
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.tasks)) return record.tasks as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const normalizeTaskList = (value: unknown): BinaryEvolutionTaskSummary[] => asArray<BinaryEvolutionTaskSummary>(value);

const normalizeTaskDetail = (value: BinaryEvolutionTaskDetail): BinaryEvolutionTaskDetail => ({
  ...value,
  metrics: asRecord(value?.metrics),
  config: asRecord(value?.config),
  source_task_ids: asArray<string>(value?.source_task_ids),
  source_case_ids: asArray<string>(value?.source_case_ids),
  agent_state_roots: asRecord(value?.agent_state_roots),
  default_agent_source_dirs: asRecord(value?.default_agent_source_dirs),
  preview: {
    ...(value?.preview || {
      project_id: value?.project_id || '',
      requested_case_ids: [],
      effective_case_ids: [],
      can_create: false,
      blocked_reasons: [],
      sources: [],
    }),
    requested_case_ids: asArray<string>(value?.preview?.requested_case_ids),
    effective_case_ids: asArray<string>(value?.preview?.effective_case_ids),
    blocked_reasons: asArray<string>(value?.preview?.blocked_reasons),
    sources: asArray<any>(value?.preview?.sources),
  },
  sources: asArray<any>(value?.sources),
  rounds: asArray<any>(value?.rounds),
  artifacts: asArray<any>(value?.artifacts),
  events: asArray<any>(value?.events),
});

const executionApi = api.domains.execution;

const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'bg-slate-50 border-slate-200 text-slate-800' }) => (
  <div className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
    <div className="text-3xl font-black">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{label}</div>
  </div>
);

const DetailBlock: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0 last:pb-0 first:pt-0">
    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="max-w-[70%] break-all text-right text-sm text-slate-700">{value}</div>
  </div>
);

export const BinaryEvolutionCenterPage: React.FC<Props> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [tasks, setTasks] = useState<BinaryEvolutionTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<BinaryEvolutionTaskDetail | null>(null);
  const [preview, setPreview] = useState<BinaryEvolutionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [form, setForm] = useState({
    title: '',
    objective: '',
    caseIdsText: '',
    minRounds: 1,
    maxRounds: 3,
    maxConcurrentSourceTasks: 4,
  });

  const selectedTask = useMemo(
    () => tasks.find((item) => item.task_id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  );

  const caseIds = useMemo(
    () => Array.from(new Set(form.caseIdsText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))),
    [form.caseIdsText],
  );

  const filteredTasks = useMemo(
    () => (statusFilter ? tasks.filter((item) => item.status === statusFilter) : tasks),
    [tasks, statusFilter],
  );

  const activeCount = useMemo(
    () => tasks.filter((item) => item.status === 'running' || item.status === 'pending').length,
    [tasks],
  );

  const succeededCount = useMemo(
    () => tasks.filter((item) => item.status === 'succeeded').length,
    [tasks],
  );

  const failedCount = useMemo(
    () => tasks.filter((item) => item.status === 'failed' || item.status === 'cancelled').length,
    [tasks],
  );

  const loadTasks = async (preferredTaskId?: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const items = normalizeTaskList(await executionApi.binaryEvolution.listTasks(projectId));
      setTasks(items);
      setSelectedTaskId((current) => preferredTaskId || current || items[0]?.task_id || '');
    } catch (err: any) {
      notify(`加载进化任务失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (taskId: string) => {
    if (!taskId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const payload = normalizeTaskDetail(await executionApi.binaryEvolution.getTask(projectId, taskId));
      setDetail(payload);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  useEffect(() => {
    void loadDetail(selectedTaskId);
  }, [projectId, selectedTaskId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!tasks.some((item) => item.status === 'running' || item.status === 'pending')) return;
    const timer = window.setInterval(() => {
      void loadTasks(selectedTaskId);
      if (selectedTaskId) void loadDetail(selectedTaskId);
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSec, tasks, selectedTaskId, projectId]);

  const handlePreview = async () => {
    if (caseIds.length === 0) {
      notify('请先输入至少一个案例 ID', 'warning');
      return;
    }
    setSubmitting(true);
    setPreview(null);
    try {
      const payload = await executionApi.binaryEvolution.previewTask(projectId, caseIds);
      setPreview(payload);
      notify(payload.can_create ? '预览通过，可创建进化任务' : '预览已返回，请检查阻塞原因', payload.can_create ? 'success' : 'warning');
    } catch (err: any) {
      notify(`预览失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const created = await executionApi.binaryEvolution.createTask(projectId, {
        case_ids: preview?.effective_case_ids?.length ? preview.effective_case_ids : caseIds,
        title: form.title.trim() || `Evolution ${new Date().toLocaleString()}`,
        objective: form.objective.trim(),
        min_rounds: Math.max(1, Number(form.minRounds) || 1),
        max_rounds: Math.max(1, Number(form.maxRounds) || 1),
        max_concurrent_source_tasks: Math.max(1, Number(form.maxConcurrentSourceTasks) || 1),
        metrics: {
          false_negative_rate: true,
          false_positive_rate: true,
          avg_discovery_round: true,
        },
      });
      notify(`已创建进化任务 ${created.task_id}`, 'success');
      setShowCreate(false);
      setPreview(null);
      await loadTasks(created.task_id);
    } catch (err: any) {
      notify(`创建失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTaskId) return;
    setSubmitting(true);
    try {
      const payload = await executionApi.binaryEvolution.applyTask(projectId, selectedTaskId);
      notify(payload.message || '产物应用完成', 'success');
      await loadDetail(selectedTaskId);
      await loadTasks(selectedTaskId);
    } catch (err: any) {
      notify(`应用失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTaskId) return;
    if (!window.confirm(`确认删除进化任务 ${selectedTaskId} 吗？`)) return;
    setSubmitting(true);
    try {
      await executionApi.binaryEvolution.deleteTask(projectId, selectedTaskId);
      notify('任务已删除', 'success');
      setDetail(null);
      setSelectedTaskId('');
      await loadTasks();
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      {feedbackNodes}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-600">Binary Evolution</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">进化中心任务</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-500">
          参考入口分析任务页的操作方式，集中管理进化任务的创建、轮次收敛、产物应用与历史回看。
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="总任务" value={tasks.length} />
        <StatCard label="运行中" value={activeCount} tone="bg-blue-50 border-blue-200 text-blue-700" />
        <StatCard label="已完成" value={succeededCount} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
        <StatCard label="失败/取消" value={failedCount} tone="bg-red-50 border-red-200 text-red-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-slate-900">
              任务列表 <span className="text-sm font-normal text-slate-400">({filteredTasks.length})</span>
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={autoRefreshEnabled}
                  onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                />
                自动刷新
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                间隔
                <input
                  type="number"
                  min={5}
                  step={1}
                  value={refreshIntervalSec}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setRefreshIntervalSec(Number.isFinite(value) ? Math.max(5, Math.floor(value)) : 5);
                  }}
                  className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                />
                秒
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadTasks(selectedTaskId)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                <Plus size={13} />
                新建任务
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>项目：{projectId}</span>
            <span>活跃任务：{activeCount}</span>
            {autoRefreshEnabled ? <span className="text-violet-600">自动刷新已开启（{Math.max(5, refreshIntervalSec)}s）</span> : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              加载中...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">暂无进化任务，点击右上角「新建任务」创建</div>
          ) : (
            <div className="mt-4 space-y-2">
              {filteredTasks.map((task) => (
                <button
                  key={task.task_id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.task_id)}
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-colors hover:bg-slate-50 ${
                    selectedTaskId === task.task_id ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black text-slate-900">{task.title}</div>
                      <div className="mt-1 truncate font-mono text-xs text-slate-500">{task.task_id}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[task.status] || STATUS_STYLE.pending}`}>
                          {STATUS_LABEL[task.status] || task.status}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${APPLY_STYLE[task.apply_status] || 'bg-slate-100 text-slate-600'}`}>
                          {task.apply_status || 'pending'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          round {task.current_round}/{task.config?.max_rounds || '-'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{fmtTime(task.updated_at)}</div>
                      <div className="mt-2 font-black text-slate-700">score {task.overall_score ?? '-'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {!selectedTask ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm text-sm text-slate-400">
              请选择左侧任务查看详情。
            </section>
          ) : detailLoading ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm text-sm text-slate-500">
              <div className="inline-flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" />
                详情加载中...
              </div>
            </section>
          ) : !detail ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm text-sm text-slate-400">
              暂无详情。
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_STYLE[detail.status] || STATUS_STYLE.pending}`}>
                        {STATUS_LABEL[detail.status] || detail.status}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${APPLY_STYLE[detail.apply_status] || 'bg-slate-100 text-slate-600'}`}>
                        {detail.apply_status || 'pending'}
                      </span>
                    </div>
                    <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{detail.title}</h2>
                    <div className="mt-1 font-mono text-xs text-slate-500">{detail.task_id}</div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{detail.objective || '未填写进化目标'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadDetail(detail.task_id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw size={14} />
                      刷新详情
                    </button>
                    <button
                      type="button"
                      disabled={submitting || detail.status !== 'succeeded'}
                      onClick={() => void handleApply()}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      应用产物
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleDelete()}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      删除任务
                    </button>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard label="当前轮次" value={detail.current_round} />
                <StatCard label="最佳轮次" value={detail.best_round ?? '-'} tone="bg-amber-50 border-amber-200 text-amber-700" />
                <StatCard label="综合评分" value={detail.overall_score ?? '-'} tone="bg-violet-50 border-violet-200 text-violet-700" />
                <StatCard label="案例总数" value={detail.source_case_ids.length} tone="bg-sky-50 border-sky-200 text-sky-700" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                <DetailBlock title="任务概览" subtitle="基础配置、时间与收敛状态">
                  <div className="space-y-1">
                    <InfoRow label="创建时间" value={fmtTime(detail.created_at)} />
                    <InfoRow label="开始时间" value={fmtTime(detail.started_at)} />
                    <InfoRow label="结束时间" value={fmtTime(detail.finished_at)} />
                    <InfoRow label="收敛原因" value={detail.convergence_reason || '-'} />
                    <InfoRow label="最小轮次" value={detail.config?.min_rounds ?? '-'} />
                    <InfoRow label="最大轮次" value={detail.config?.max_rounds ?? '-'} />
                    <InfoRow label="轮内并发" value={detail.config?.max_concurrent_source_tasks ?? '-'} />
                  </div>
                </DetailBlock>

                <DetailBlock title="输入批次" subtitle="本次进化任务引用的原始任务与案例集合">
                  <div className="space-y-3">
                    {detail.preview.sources.length === 0 ? (
                      <div className="text-sm text-slate-400">暂无输入批次。</div>
                    ) : (
                      detail.preview.sources.map((source) => (
                        <div key={source.source_task_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-black text-slate-800">{source.source_title || source.source_task_id}</div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${source.replay_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-xs text-slate-500">{source.source_task_id}</div>
                          <div className="mt-2 text-sm text-slate-600">
                            已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}
                            {source.auto_expanded_case_ids.length > 0 ? ` · 自动补齐 ${source.auto_expanded_case_ids.length}` : ''}
                          </div>
                          {source.blocked_reasons.length > 0 ? (
                            <div className="mt-2 space-y-1 text-xs text-rose-600">
                              {source.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </DetailBlock>
              </div>

              <DetailBlock title="轮次记录" subtitle="每轮评分、指标与收敛决策">
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">轮次</th>
                        <th className="px-3 py-3">状态</th>
                        <th className="px-3 py-3">评分</th>
                        <th className="px-3 py-3">漏报率</th>
                        <th className="px-3 py-3">误报率</th>
                        <th className="px-3 py-3">平均发现轮次</th>
                        <th className="px-3 py-3">收敛</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {detail.rounds.length === 0 ? (
                        <tr>
                          <td className="px-3 py-10 text-center text-sm text-slate-400" colSpan={7}>暂无轮次数据</td>
                        </tr>
                      ) : (
                        detail.rounds.map((round) => (
                          <tr key={round.round_no}>
                            <td className="px-3 py-3 font-black text-slate-800">{round.round_no}</td>
                            <td className="px-3 py-3">{round.status || '-'}</td>
                            <td className="px-3 py-3">{round.score ?? '-'}</td>
                            <td className="px-3 py-3">{fmtNumber(round.metrics?.false_negative_rate, 4)}</td>
                            <td className="px-3 py-3">{fmtNumber(round.metrics?.false_positive_rate, 4)}</td>
                            <td className="px-3 py-3">{fmtNumber(round.metrics?.avg_discovery_round, 2)}</td>
                            <td className="px-3 py-3">{round.convergence_decision ? '是' : '否'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </DetailBlock>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <DetailBlock title="Agent 目录映射" subtitle="进化态目录与正常态目录的对应关系">
                  <div className="space-y-3">
                    {Object.keys(detail.agent_state_roots).length === 0 ? (
                      <div className="text-sm text-slate-400">暂无 agent 目录。</div>
                    ) : (
                      Object.entries(detail.agent_state_roots).map(([agentId, root]) => (
                        <div key={agentId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-black text-slate-800">{agentId}</div>
                          <div className="mt-2 text-xs text-slate-500">evolution root</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-700">{root}</div>
                          <div className="mt-2 text-xs text-slate-500">normal root</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.default_agent_source_dirs[agentId] || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </DetailBlock>

                <DetailBlock title="产物与事件" subtitle="最近事件及持久化产物路径">
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最近事件</div>
                      <div className="space-y-2">
                        {detail.events.length === 0 ? (
                          <div className="text-sm text-slate-400">暂无事件</div>
                        ) : (
                          detail.events.slice(0, 6).map((event) => (
                            <div key={`${event.event_type}-${event.created_at}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-black text-slate-800">{event.summary || event.event_type}</div>
                                <div className="text-xs text-slate-500">{fmtTime(String(event.created_at || ''))}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">产物路径</div>
                      <div className="space-y-2">
                        {detail.artifacts.length === 0 ? (
                          <div className="text-sm text-slate-400">暂无产物</div>
                        ) : (
                          detail.artifacts.map((artifact) => (
                            <div key={`${artifact.artifact_type}-${artifact.path}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="font-black text-slate-800">{artifact.artifact_type}</div>
                              <div className="mt-2 break-all font-mono text-xs text-slate-600">{artifact.path}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </DetailBlock>
              </div>
            </>
          )}
        </section>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                  <Sparkles size={14} />
                  创建进化任务
                </div>
                <h2 className="mt-3 text-2xl font-black text-slate-900">先预览整批样本，再确认创建</h2>
                <p className="mt-2 text-sm text-slate-500">沿用入口分析任务页的创建风格，把输入参数和预览结果放在同一个弹窗里完成确认。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setPreview(null);
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div>
                  <div className="mb-2 text-sm font-black text-slate-800">任务标题</div>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="例如：DFVS 漏报率优化 - 批次 A"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-black text-slate-800">进化目标</div>
                  <textarea
                    value={form.objective}
                    onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
                    className="min-h-[9rem] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="说明本次主要想优化漏报、误报，还是更早发现。"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-black text-slate-800">案例 ID 列表</div>
                  <textarea
                    value={form.caseIdsText}
                    onChange={(event) => setForm((current) => ({ ...current, caseIdsText: event.target.value }))}
                    className="min-h-[12rem] w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm"
                    placeholder="每行一个 case id，也支持空格/逗号分隔"
                  />
                  <div className="mt-2 text-xs text-slate-500">已解析 {caseIds.length} 个案例 ID。</div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">最小轮次</div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.minRounds}
                      onChange={(event) => setForm((current) => ({ ...current, minRounds: Number(event.target.value || 1) }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">最大轮次</div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.maxRounds}
                      onChange={(event) => setForm((current) => ({ ...current, maxRounds: Number(event.target.value || 1) }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">轮内并发</div>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.maxConcurrentSourceTasks}
                      onChange={(event) => setForm((current) => ({ ...current, maxConcurrentSourceTasks: Number(event.target.value || 1) }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={submitting || caseIds.length === 0}
                      onClick={() => void handlePreview()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw size={15} />
                      预览整批
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !preview?.can_create}
                      onClick={() => void handleCreate()}
                      className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Play size={15} />
                      确认创建
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">如果同一原始 normal 任务的 case 不完整，预览会自动补齐并展示阻塞原因。</div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {!preview ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-400">
                    预览结果会在这里展示。
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {preview.can_create ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
                      <div className="font-black text-slate-900">{preview.can_create ? '预览通过，可创建' : '预览未通过'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                      <StatCard label="请求案例" value={preview.requested_case_ids.length} />
                      <StatCard label="生效案例" value={preview.effective_case_ids.length} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
                      <StatCard label="涉及任务" value={preview.sources.length} tone="bg-sky-50 border-sky-200 text-sky-700" />
                      <StatCard label="可创建" value={preview.can_create ? '是' : '否'} tone={preview.can_create ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-red-50 border-red-200 text-red-700'} />
                    </div>
                    {preview.blocked_reasons.length > 0 ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {preview.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                      </div>
                    ) : null}
                    <div className="space-y-3">
                      {preview.sources.map((source) => (
                        <div key={source.source_task_id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black text-slate-800">{source.source_title || source.source_task_id}</div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${source.replay_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}</div>
                          {source.auto_expanded_case_ids.length > 0 ? (
                            <div className="mt-1 text-xs text-amber-700">自动补齐 {source.auto_expanded_case_ids.length} 个遗漏 case。</div>
                          ) : null}
                          {source.blocked_reasons.length > 0 ? (
                            <div className="mt-2 space-y-1 text-xs text-rose-600">
                              {source.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
