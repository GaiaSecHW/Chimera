import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../../clients/api';
import {
  BinaryEvolutionPreviewResponse,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  APPLY_STYLE,
  fmtTime,
  normalizeTaskList,
  StatCard,
  STATUS_LABEL,
  STATUS_STYLE,
} from './BinaryEvolutionShared';
import { BinaryEvolutionTaskDetailPage } from './BinaryEvolutionTaskDetailPage';

interface Props {
  projectId: string;
}

const executionApi = api.domains.execution;

const BinaryEvolutionTaskListView: React.FC<Props> = ({ projectId }) => {
  const navigate = useNavigate();
  const { notify, feedbackNodes } = useUiFeedback();
  const [tasks, setTasks] = useState<BinaryEvolutionTaskSummary[]>([]);
  const [preview, setPreview] = useState<BinaryEvolutionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
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

  const loadTasks = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const items = normalizeTaskList(await executionApi.binaryEvolution.listTasks(projectId));
      setTasks(items);
    } catch (err: any) {
      notify(`加载进化任务失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!tasks.some((item) => item.status === 'running' || item.status === 'pending')) return;
    const timer = window.setInterval(() => {
      void loadTasks();
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSec, tasks, projectId]);

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
      await loadTasks();
      navigate(`/binary-evolution-dataflow-vuln/${encodeURIComponent(created.task_id)}`);
    } catch (err: any) {
      notify(`创建失败: ${err?.message || err}`, 'error');
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
          集中管理进化任务的创建与历史回看。点击任意任务可进入独立详情页查看轮次收敛、产物应用与事件轨迹。
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="总任务" value={tasks.length} />
        <StatCard label="运行中" value={activeCount} tone="bg-blue-50 border-blue-200 text-blue-700" />
        <StatCard label="已完成" value={succeededCount} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
        <StatCard label="失败/取消" value={failedCount} tone="bg-red-50 border-red-200 text-red-700" />
      </div>

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
              onClick={() => void loadTasks()}
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
                onClick={() => navigate(`/binary-evolution-dataflow-vuln/${encodeURIComponent(task.task_id)}`)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:bg-slate-50"
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
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

export const BinaryEvolutionCenterPage: React.FC<Props> = ({ projectId }) => {
  const { taskId } = useParams<{ taskId?: string }>();

  if (taskId) {
    return (
      <BinaryEvolutionTaskDetailPage
        projectId={projectId}
        taskId={decodeURIComponent(taskId)}
      />
    );
  }

  return <BinaryEvolutionTaskListView projectId={projectId} />;
};
