import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Play, RefreshCw, Sparkles, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  BinaryEvolutionPreviewResponse,
  BinaryEvolutionTaskDetail,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';

interface Props {
  projectId: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  running: 'border-sky-200 bg-sky-50 text-sky-700',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-500',
};

const fmtTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

const normalizeTaskList = (value: unknown): BinaryEvolutionTaskSummary[] => asArray<BinaryEvolutionTaskSummary>(value);

const normalizeTaskDetail = (value: BinaryEvolutionTaskDetail): BinaryEvolutionTaskDetail => ({
  ...value,
  source_task_ids: asArray<string>(value?.source_task_ids),
  source_case_ids: asArray<string>(value?.source_case_ids),
  agent_state_roots: value?.agent_state_roots && typeof value.agent_state_roots === 'object' ? value.agent_state_roots : {},
  default_agent_source_dirs: value?.default_agent_source_dirs && typeof value.default_agent_source_dirs === 'object' ? value.default_agent_source_dirs : {},
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

export const BinaryEvolutionCenterPage: React.FC<Props> = ({ projectId }) => {
  const [tasks, setTasks] = useState<BinaryEvolutionTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [detail, setDetail] = useState<BinaryEvolutionTaskDetail | null>(null);
  const [preview, setPreview] = useState<BinaryEvolutionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    objective: '',
    caseIdsText: '',
    minRounds: 1,
    maxRounds: 3,
    maxConcurrentSourceTasks: 4,
  });

  const selectedTask = useMemo(
    () => (Array.isArray(tasks) ? tasks.find((item) => item.task_id === selectedTaskId) : null) || null,
    [tasks, selectedTaskId],
  );

  const caseIds = useMemo(
    () => Array.from(new Set(form.caseIdsText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))),
    [form.caseIdsText],
  );

  const loadTasks = async (preferredTaskId?: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const items = normalizeTaskList(await executionApi.binaryEvolution.listTasks(projectId));
      setTasks(items);
      const nextTaskId = preferredTaskId || selectedTaskId || items[0]?.task_id || '';
      setSelectedTaskId(nextTaskId);
    } catch (err: any) {
      setError(err?.message || '加载进化任务失败');
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
    setError(null);
    try {
      const payload = normalizeTaskDetail(await executionApi.binaryEvolution.getTask(projectId, taskId));
      setDetail(payload);
    } catch (err: any) {
      setError(err?.message || '加载任务详情失败');
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

  const handlePreview = async () => {
    setSubmitting(true);
    setPreview(null);
    setError(null);
    setMessage(null);
    try {
      const payload = await executionApi.binaryEvolution.previewTask(projectId, caseIds);
      setPreview(payload);
    } catch (err: any) {
      setError(err?.message || '预览失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
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
      setMessage(`已创建进化任务 ${created.task_id}`);
      setShowCreate(false);
      setPreview(null);
      await loadTasks(created.task_id);
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTaskId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await executionApi.binaryEvolution.applyTask(projectId, selectedTaskId);
      setMessage(payload.message);
      await loadDetail(selectedTaskId);
      await loadTasks(selectedTaskId);
    } catch (err: any) {
      setError(err?.message || '应用失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTaskId || !window.confirm(`确认删除进化任务 ${selectedTaskId} 吗？`)) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await executionApi.binaryEvolution.deleteTask(projectId, selectedTaskId);
      setMessage('任务已删除');
      setDetail(null);
      setSelectedTaskId('');
      await loadTasks();
    } catch (err: any) {
      setError(err?.message || '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      <section className="rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.12),_transparent_24%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
              <Sparkles size={14} />
              二进制安全进化中心
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">围绕已人工收敛的数据流漏洞结果，做多轮 replay 进化</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              这里负责冻结一批有效样本、按轮次派生 evolution 任务、记录评分与收敛结论，并在完成后把产物应用回正常 agent 目录。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
            >
              <Play size={15} />
              创建进化任务
            </button>
            <button
              type="button"
              onClick={() => void loadTasks(selectedTaskId)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
            >
              <RefreshCw size={15} />
              刷新
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">任务列表</h2>
              <p className="mt-1 text-xs text-slate-500">当前项目下的全部进化任务。</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{tasks.length} Tasks</div>
          </div>
          <div className="max-h-[62rem] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-400">加载中...</div>
            ) : tasks.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-400">暂无进化任务</div>
            ) : (
              tasks.map((task) => (
                <button
                  type="button"
                  key={task.task_id}
                  onClick={() => setSelectedTaskId(task.task_id)}
                  className={`w-full px-5 py-4 text-left transition ${selectedTaskId === task.task_id ? 'bg-amber-50/70' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black text-slate-900">{task.title}</div>
                      <div className="mt-1 text-xs font-mono text-slate-500">{task.task_id}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLES[task.status] || STATUS_STYLES.pending}`}>
                          {task.status}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          round {task.current_round}/{task.config.max_rounds || '-'}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          source {task.source_task_ids.length}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{fmtTime(task.updated_at)}</div>
                      <div className="mt-2 font-black text-slate-700">score {task.overall_score ?? '-'}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          {!selectedTask ? (
            <div className="px-6 py-10 text-sm text-slate-400">请选择左侧任务查看详情。</div>
          ) : detailLoading ? (
            <div className="px-6 py-10 text-sm text-slate-400">详情加载中...</div>
          ) : !detail ? (
            <div className="px-6 py-10 text-sm text-slate-400">暂无详情。</div>
          ) : (
            <div className="space-y-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLES[detail.status] || STATUS_STYLES.pending}`}>{detail.status}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">{detail.apply_status}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-slate-900">{detail.title}</h2>
                  <div className="mt-1 text-xs font-mono text-slate-500">{detail.task_id}</div>
                  <p className="mt-3 text-sm text-slate-600">{detail.objective || '未填写进化目标'}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void loadDetail(detail.task_id)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
                  >
                    <RefreshCw size={15} />
                    刷新详情
                  </button>
                  <button
                    type="button"
                    disabled={submitting || detail.status !== 'succeeded'}
                    onClick={() => void handleApply()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} />
                    应用产物
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDelete()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700"
                  >
                    <Trash2 size={15} />
                    删除任务
                  </button>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">当前轮次</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{detail.current_round}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最佳轮次</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{detail.best_round ?? '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">综合评分</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{detail.overall_score ?? '-'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">样本数</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{detail.source_case_ids.length}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">输入批次</div>
                  <div className="mt-3 space-y-3">
                    {detail.preview.sources.map((source) => (
                      <div key={source.source_task_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-black text-slate-800">{source.source_title || source.source_task_id}</div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${source.replay_ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                            {source.replay_ready ? 'replay ready' : 'blocked'}
                          </span>
                        </div>
                        <div className="mt-2 text-xs font-mono text-slate-500">{source.source_task_id}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}
                          {source.auto_expanded_case_ids.length > 0 && ` · 自动补齐 ${source.auto_expanded_case_ids.length}`}
                        </div>
                        {source.blocked_reasons.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-rose-600">
                            {source.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">Agent 目录映射</div>
                  <div className="mt-3 space-y-3">
                    {Object.keys(detail.agent_state_roots).length === 0 ? (
                      <div className="text-sm text-slate-400">暂无 agent 目录。</div>
                    ) : (
                      Object.entries(detail.agent_state_roots).map(([agentId, root]) => (
                        <div key={agentId} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="font-black text-slate-800">{agentId}</div>
                          <div className="mt-2 text-xs text-slate-500">evolution root</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-700">{root}</div>
                          <div className="mt-2 text-xs text-slate-500">normal root</div>
                          <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.default_agent_source_dirs[agentId] || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-black text-slate-900">轮次记录</div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white">
                      <tr className="text-slate-500">
                        <th className="px-3 py-2 font-black">轮次</th>
                        <th className="px-3 py-2 font-black">状态</th>
                        <th className="px-3 py-2 font-black">评分</th>
                        <th className="px-3 py-2 font-black">漏报率</th>
                        <th className="px-3 py-2 font-black">误报率</th>
                        <th className="px-3 py-2 font-black">平均发现轮次</th>
                        <th className="px-3 py-2 font-black">收敛</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rounds.length === 0 ? (
                        <tr><td className="px-3 py-4 text-slate-400" colSpan={7}>暂无轮次数据</td></tr>
                      ) : (
                        detail.rounds.map((round) => (
                          <tr key={round.round_no} className="border-t border-slate-100 bg-white">
                            <td className="px-3 py-3 font-black text-slate-800">{round.round_no}</td>
                            <td className="px-3 py-3">{round.status}</td>
                            <td className="px-3 py-3">{round.score ?? '-'}</td>
                            <td className="px-3 py-3">{Number(round.metrics.false_negative_rate || 0).toFixed(4)}</td>
                            <td className="px-3 py-3">{Number(round.metrics.false_positive_rate || 0).toFixed(4)}</td>
                            <td className="px-3 py-3">{Number(round.metrics.avg_discovery_round || 0).toFixed(2)}</td>
                            <td className="px-3 py-3">{round.convergence_decision ? '是' : '否'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">时间线</div>
                  <div className="mt-3 space-y-3">
                    {detail.events.length === 0 ? (
                      <div className="text-sm text-slate-400">暂无事件</div>
                    ) : (
                      detail.events.map((event) => (
                        <div key={`${event.event_type}-${event.created_at}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black text-slate-800">{event.summary || event.event_type}</div>
                            <div className="text-xs text-slate-500">{fmtTime(String(event.created_at || ''))}</div>
                          </div>
                          {event.payload && Object.keys(event.payload).length > 0 && (
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">产物</div>
                  <div className="mt-3 space-y-3">
                    {detail.artifacts.length === 0 ? (
                      <div className="text-sm text-slate-400">暂无产物</div>
                    ) : (
                      detail.artifacts.map((artifact) => (
                        <div key={`${artifact.artifact_type}-${artifact.path}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="font-black text-slate-800">{artifact.artifact_type}</div>
                          <div className="mt-2 break-all font-mono text-xs text-slate-600">{artifact.path}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                  <Sparkles size={14} />
                  创建进化任务
                </div>
                <h2 className="mt-3 text-2xl font-black text-slate-900">先预览整批样本，再确认创建</h2>
              </div>
              <button type="button" onClick={() => { setShowCreate(false); setPreview(null); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600">
                关闭
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
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
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">最小轮次</div>
                    <input type="number" min={1} max={100} value={form.minRounds} onChange={(event) => setForm((current) => ({ ...current, minRounds: Number(event.target.value || 1) }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">最大轮次</div>
                    <input type="number" min={1} max={100} value={form.maxRounds} onChange={(event) => setForm((current) => ({ ...current, maxRounds: Number(event.target.value || 1) }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">轮内并发</div>
                    <input type="number" min={1} max={64} value={form.maxConcurrentSourceTasks} onChange={(event) => setForm((current) => ({ ...current, maxConcurrentSourceTasks: Number(event.target.value || 1) }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={submitting || caseIds.length === 0} onClick={() => void handlePreview()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                      <RefreshCw size={15} />
                      预览整批
                    </button>
                    <button type="button" disabled={submitting || !preview?.can_create} onClick={() => void handleCreate()} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Play size={15} />
                      确认创建
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">如果同一原始 normal 任务的 case 不完整，预览会自动补齐并显示阻塞原因。</div>
                </div>

                {!preview ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-400">
                    预览结果会在这里展示。
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2">
                      {preview.can_create ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
                      <div className="font-black text-slate-900">{preview.can_create ? '预览通过，可创建' : '预览未通过'}</div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">请求 {preview.requested_case_ids.length} 个案例，整批后生效 {preview.effective_case_ids.length} 个案例，涉及 {preview.sources.length} 个原始任务。</div>
                    {preview.blocked_reasons.length > 0 && (
                      <div className="mt-3 space-y-2 text-sm text-rose-600">
                        {preview.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                      </div>
                    )}
                    <div className="mt-4 space-y-3">
                      {preview.sources.map((source) => (
                        <div key={source.source_task_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black text-slate-800">{source.source_title || source.source_task_id}</div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${source.replay_ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}</div>
                          {source.auto_expanded_case_ids.length > 0 && (
                            <div className="mt-1 text-xs text-amber-700">自动补齐 {source.auto_expanded_case_ids.length} 个遗漏 case。</div>
                          )}
                          {source.blocked_reasons.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs text-rose-600">
                              {source.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
