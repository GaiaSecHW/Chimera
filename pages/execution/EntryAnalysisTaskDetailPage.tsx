import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';

import { api } from '../../clients/api';
import { AppEaStageEvent, AppEaTaskDetail } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnContext, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatLiveDuration(startedAt: string | null | undefined, nowSecs: number): string {
  if (!startedAt) return '-';
  const secs = Math.max(0, nowSecs - Math.floor(new Date(startedAt).getTime() / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

interface RoundState {
  num: number;
  phase: 'pending' | 'worker' | 'judge' | 'passed' | 'failed' | 'reflection';
  passed?: boolean;
  passCount?: number;
  totalJudges?: number;
}

function deriveRounds(events: AppEaStageEvent[], maxRounds: number): RoundState[] {
  const map = new Map<number, RoundState>();
  for (const evt of events) {
    const d = evt.data ?? {};
    const rnd = typeof d.round === 'number' ? d.round : undefined;
    if (!rnd) continue;
    if (evt.type === 'round_start') {
      if (!map.has(rnd)) map.set(rnd, { num: rnd, phase: 'worker' });
    } else if (evt.type === 'worker_start') {
      if (!map.has(rnd)) map.set(rnd, { num: rnd, phase: 'worker' });
    } else if (evt.type === 'judge_start') {
      const s = map.get(rnd);
      if (s && s.phase === 'worker') map.set(rnd, { ...s, phase: 'judge' });
    } else if (evt.type === 'round_reflection') {
      const s = map.get(rnd);
      if (s) map.set(rnd, { ...s, phase: 'reflection' });
    } else if (evt.type === 'round_end') {
      map.set(rnd, {
        num: rnd,
        phase: d.passed ? 'passed' : 'failed',
        passed: Boolean(d.passed),
        passCount: typeof d.pass_count === 'number' ? d.pass_count : undefined,
        totalJudges: typeof d.total_judges === 'number' ? d.total_judges : undefined,
      });
    }
  }
  const shown = Math.max(maxRounds, Math.max(0, ...Array.from(map.keys())));
  return Array.from({ length: shown || 1 }, (_, i) => {
    const r = map.get(i + 1);
    return r ?? { num: i + 1, phase: 'pending' };
  });
}

function formatEaEvent(evt: AppEaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'round_start': return `[${ts}] ▶ 第 ${d.round ?? ''} 轮开始  workers=${d.workers ?? ''}  judges=${d.judges ?? ''}`;
    case 'round_end': return `[${ts}] ✓ 第 ${d.round ?? ''} 轮结束  passed=${d.passed ?? ''}`;
    case 'worker_start': return `[${ts}] ▶ Worker[${d.worker_idx ?? ''}] 开始分析  files=${d.file_count ?? ''}`;
    case 'worker_end': return `[${ts}] ✓ Worker[${d.worker_idx ?? ''}] 分析完成`;
    case 'judge_start': return `[${ts}] ▶ Judge[${d.judge_idx ?? ''}] 开始评审`;
    case 'judge_end': return `[${ts}] ✓ Judge[${d.judge_idx ?? ''}] 评审完成  passed=${d.passed ?? ''}`;
    case 'pi_output': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
      if (!text) return '';
      return `[${ts}] │ ${text}`;
    }
    case 'error': return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    default: {
      const text = (d.text ?? d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      return text ? `[${ts}] ${evt.type}: ${text}` : `[${ts}] ${evt.type}`;
    }
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700 break-all">{value}</span>
    </div>
  );
}

export const EntryAnalysisTaskDetailPage: React.FC<{
  projectId: string;
  taskId: string;
  onBack: () => void;
}> = ({ projectId: _projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appEntryAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();
  const hasReturnContext = hasBinarySecurityReturnContext();

  const [detail, setDetail] = useState<AppEaTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const d = await appApi.getTask(taskId);
      setDetail(d);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-refresh when running/pending
  const isActive = detail?.status === 'running' || detail?.status === 'pending';
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => void loadDetail(), 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, taskId]);

  const handleCancel = async () => {
    if (!detail) return;
    setCancelling(true);
    try {
      await appApi.cancelTask(detail.task_id);
      notify('任务已取消', 'success');
      void loadDetail();
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleRestart = async () => {
    if (!detail) return;
    setRestarting(true);
    try {
      const newTask = await appApi.restartTask(detail.task_id);
      notify(`已创建新任务: ${newTask.task_id}`, 'success');
      // navigate to new task
      onBack();
      // small delay then open new task via sessionStorage trigger
      setTimeout(() => {
        sessionStorage.setItem('secflow:entryAnalysisTaskId', newTask.task_id);
        window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-task' } }));
      }, 50);
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleBack = () => {
    if (hasReturnContext && navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const events: AppEaStageEvent[] = detail?.stages_json?.events ?? [];

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      {/* ── Top action bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回任务列表'}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />刷新
          </button>
          {detail && (detail.status === 'running' || detail.status === 'pending') ? (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              取消
            </button>
          ) : null}
          {detail && !['pending', 'running'].includes(detail.status) ? (
            <button
              type="button"
              onClick={() => void handleRestart()}
              disabled={restarting}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 disabled:opacity-60"
            >
              {restarting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              重新运行
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────── */}
      {loading && !detail ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />加载中...
        </div>
      ) : detail ? (
        <>
          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis · 任务详情</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{detail.task_name}</h1>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABEL[detail.status] ?? detail.status}
              </span>
              <span className="font-mono text-xs text-slate-400">{detail.task_id}</span>
            </div>
          </section>

          {/* ── Round progress ───────────────────────────────── */}
          {events.length > 0 ? (() => {
            const maxRounds = (detail.task_config_json?.max_rounds as number | undefined) ?? 0;
            const rounds = deriveRounds(events, maxRounds);
            return (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-black text-slate-900 mb-4">
                  分析进度
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {rounds.filter(r => r.phase === 'passed').length}/{rounds.length} 轮通过
                  </span>
                </h2>
                <div className="flex flex-wrap items-stretch gap-2">
                  {rounds.map((r) => {
                    const isActive = r.phase === 'worker' || r.phase === 'judge' || r.phase === 'reflection';
                    const borderCls =
                      r.phase === 'passed' ? 'border-emerald-200 bg-emerald-50' :
                      r.phase === 'failed' ? 'border-amber-200 bg-amber-50' :
                      isActive ? 'border-blue-200 bg-blue-50' :
                      'border-slate-200 bg-white';
                    const icon =
                      r.phase === 'passed' ? <span className="text-emerald-600 text-base">✓</span> :
                      r.phase === 'failed' ? <span className="text-amber-600 text-base">✗</span> :
                      isActive ? <Loader2 size={15} className="animate-spin text-blue-500" /> :
                      <span className="text-slate-300 text-base font-black">{r.num}</span>;
                    const label =
                      r.phase === 'passed' ? `通过 ${r.passCount ?? ''}/${r.totalJudges ?? ''}` :
                      r.phase === 'failed' ? `未通过 ${r.passCount ?? ''}/${r.totalJudges ?? ''}` :
                      r.phase === 'worker' ? 'Worker 分析中' :
                      r.phase === 'judge' ? 'Judge 评审中' :
                      r.phase === 'reflection' ? '强制续轮' :
                      '等待中';
                    return (
                      <div key={r.num} className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border min-w-[80px] ${borderCls}`}>
                        {icon}
                        <span className="text-xs font-bold text-slate-700">Round {r.num}</span>
                        <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })() : null}

          {/* ── Info cards ───────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <h2 className="text-base font-black text-slate-900 mb-1">基本信息</h2>
              <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
              <InfoRow label="目标路径" value={<span className="font-mono">{detail.input_path}</span>} />
              {detail.output_path ? <InfoRow label="输出路径" value={<span className="font-mono">{detail.output_path}</span>} /> : null}
              {detail.task_description ? <InfoRow label="描述" value={detail.task_description} /> : null}
              {detail.created_by ? <InfoRow label="创建人" value={detail.created_by} /> : null}
              <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
              {detail.started_at ? <InfoRow label="开始时间" value={new Date(detail.started_at).toLocaleString('zh-CN')} /> : null}
              {detail.finished_at ? (
                <>
                  <InfoRow label="完成时间" value={new Date(detail.finished_at).toLocaleString('zh-CN')} />
                  <InfoRow label="耗时" value={formatDuration(detail.started_at, detail.finished_at)} />
                </>
              ) : detail.started_at && isActive ? (
                <InfoRow label="运行时长" value={<span className="text-blue-600 font-semibold">{formatLiveDuration(detail.started_at, clockNow)}</span>} />
              ) : null}
            </section>

            {detail.error ? (
              <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-black text-red-700 mb-2">错误信息</h2>
                <pre className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 whitespace-pre-wrap break-all overflow-auto max-h-64">{detail.error}</pre>
              </section>
            ) : detail.result_json ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-black text-slate-900 mb-2">分析结果</h2>
                <pre className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700 whitespace-pre-wrap break-all overflow-auto max-h-64">{JSON.stringify(detail.result_json, null, 2)}</pre>
              </section>
            ) : (
              <div className="hidden xl:flex items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                暂无分析结果
              </div>
            )}
          </div>

          {/* ── Stage events ─────────────────────────────────── */}
          {events.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 mb-4">执行日志 <span className="text-sm font-normal text-slate-400">({events.length} 条)</span></h2>
              <div className="rounded-xl bg-slate-900 px-4 py-4 max-h-[480px] overflow-auto space-y-0.5">
                {[...events].reverse().map((evt, i) => {
                  const line = formatEaEvent(evt);
                  if (!line) return null;
                  return (
                    <p key={i} className={`font-mono text-xs leading-5 whitespace-pre-wrap break-all ${
                      evt.type === 'error' ? 'text-red-400' :
                      evt.type === 'task_end' ? 'text-emerald-400' :
                      evt.type === 'round_end' || evt.type === 'worker_end' || evt.type === 'judge_end' ? 'text-blue-300' :
                      'text-slate-300'
                    }`}>{line}</p>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── Prompt content ───────────────────────────────── */}
          {detail.prompt_content ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <details>
                <summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                  分析 Prompt
                </summary>
                <pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre>
              </details>
            </section>
          ) : null}

          {/* ── Result JSON (if also shown above as card) ────── */}
          {detail.result_json && !detail.error ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <details>
                <summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                  完整结果 JSON
                </summary>
                <pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-96 overflow-auto border-t border-slate-100">{JSON.stringify(detail.result_json, null, 2)}</pre>
              </details>
            </section>
          ) : null}
        </>
      ) : (
        !loading ? <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div> : null
      )}
    </div>
  );
};
