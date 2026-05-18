import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../clients/api';
import { BinaryEvolutionTaskDetail } from '../../clients/binaryEvolution';
import { useUiFeedback } from '../../components/UiFeedback';
import { APPLY_STYLE, fmtTime, normalizeTaskDetail, StatCard, STATUS_LABEL, STATUS_STYLE } from './BinaryEvolutionShared';

interface Props {
  projectId: string;
  taskId: string;
}

const fmtNumber = (value: unknown, digits = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return digits > 0 ? num.toFixed(digits) : String(Math.round(num));
};

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
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 first:pt-0 last:border-b-0 last:pb-0">
    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="max-w-[70%] break-all text-right text-sm text-slate-700">{value}</div>
  </div>
);

export const BinaryEvolutionTaskDetailPage: React.FC<Props> = ({ projectId, taskId }) => {
  const navigate = useNavigate();
  const executionApi = api.domains.execution;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<BinaryEvolutionTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    try {
      const payload = normalizeTaskDetail(await executionApi.binaryEvolution.getTask(projectId, taskId));
      setDetail(payload);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [projectId, taskId]);

  const handleApply = async () => {
    if (!detail) return;
    setSubmitting(true);
    try {
      const payload = await executionApi.binaryEvolution.applyTask(projectId, detail.task_id);
      notify(payload.message || '产物应用完成', 'success');
      await loadDetail();
    } catch (err: any) {
      notify(`应用失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    if (!window.confirm(`确认删除进化任务 ${detail.task_id} 吗？`)) return;
    setSubmitting(true);
    try {
      await executionApi.binaryEvolution.deleteTask(projectId, detail.task_id);
      notify('任务已删除', 'success');
      navigate('/binary-evolution-dataflow-vuln');
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/binary-evolution-dataflow-vuln')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={15} />
              返回任务列表
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-amber-600">Binary Evolution</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">进化任务详情</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-500">
              参考系统分析详情页的独立页面结构，集中查看任务状态、轮次收敛、输入批次、产物与事件。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} />
              刷新详情
            </button>
            <button
              type="button"
              disabled={submitting || detail?.status !== 'succeeded'}
              onClick={() => void handleApply()}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              应用产物
            </button>
            <button
              type="button"
              disabled={submitting || !detail}
              onClick={() => void handleDelete()}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              删除任务
            </button>
          </div>
        </div>
      </section>

      {loading ? (
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
    </div>
  );
};
