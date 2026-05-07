import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, XCircle } from 'lucide-react';

import { B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SStatsHeader, emptyB2SStats } from './B2SStatsHeader';
import { B2SPhaseBadge, B2SProgressBar, B2SStatusBadge, B2S_TERMINAL_STATUSES, formatBytes, formatDateTime, pct } from './b2sPresentation';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

export const B2STaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const executionApi = api.domains.execution;
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executionApi.binaryToSource.getTask(projectId, taskId);
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || '加载任务详情失败');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, taskId]);

  useEffect(() => {
    if (!projectId || !taskId) return;
    if (!detail || !B2S_TERMINAL_STATUSES.has(detail.status)) {
      const timer = window.setInterval(() => {
        void load();
      }, 5000);
      return () => window.clearInterval(timer);
    }
  }, [projectId, taskId, detail?.status]);

  const cancelTask = async () => {
    if (!projectId || !taskId || cancelling) return;
    if (!window.confirm('确认取消该二进制逆向任务？运行中的 item 会请求后端终止。')) return;
    setError(null);
    setCancelling(true);
    try {
      await executionApi.binaryToSource.terminateTask(projectId, taskId);
      await load();
    } catch (e: any) {
      setError(e?.message || '取消任务失败');
    } finally {
      setCancelling(false);
    }
  };

  const stats = useMemo(() => {
    if (!detail) return emptyB2SStats();
    return {
      taskCount: 1,
      totalItems: detail.total_items || 0,
      pendingItems: detail.pending_items || 0,
      queuedItems: detail.queued_items || 0,
      runningItems: detail.running_items || 0,
      successItems: detail.success_items || 0,
      partialItems: detail.partial_items || 0,
      failedItems: detail.failed_items || 0,
      cancelledItems: detail.cancelled_items || 0,
    };
  }, [detail]);

  if (!taskId) {
    return (
      <div className="px-8 pb-10 pt-8 space-y-6">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm">
          <ArrowLeft size={16} />
          返回二进制逆向
        </button>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          未指定任务，请返回列表重新选择。
        </div>
      </div>
    );
  }

  const overall = detail?.overall_progress;

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          返回二进制逆向
        </button>
        <div className="flex items-center gap-3">
          {detail && !B2S_TERMINAL_STATUSES.has(detail.status) && (
            <button
              type="button"
              onClick={() => void cancelTask()}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
            >
              {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              取消任务
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            手动刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        {loading && !detail ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">Binary Reverse Detail</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{detail.name || detail.id}</h1>
                <div className="mt-2 break-all font-mono text-xs text-slate-400">{detail.id}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <B2SStatusBadge status={detail.status} />
                  {detail.updated_at && <span className="text-sm text-slate-500">最近更新：{formatDateTime(detail.updated_at)}</span>}
                </div>
              </div>
              <div className="grid min-w-[280px] grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">创建时间</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{formatDateTime(detail.created_at)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">更新时间</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{formatDateTime(detail.updated_at)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-700">总体进度</div>
                  <div className="mt-1 text-2xl font-black text-slate-900">{pct(overall?.percent).toFixed(1)}%</div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>Item {overall?.completed_items ?? 0}/{overall?.total_items ?? 0}</span>
                  <span>函数 {overall?.completed_functions ?? 0}/{overall?.total_functions ?? 0}</span>
                  <span>字节 {formatBytes(overall?.completed_bytes)} / {formatBytes(overall?.total_bytes)}</span>
                  <span>批次 {overall?.completed_batches ?? 0}/{overall?.total_batches ?? 0}</span>
                </div>
              </div>
              <div className="mt-4">
                <B2SProgressBar value={overall?.percent} tone="emerald" />
              </div>
              {overall?.phase_summary && Object.keys(overall.phase_summary).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(overall.phase_summary).map(([phase, count]) => (
                    <B2SPhaseBadge key={phase} phase={phase} label={`${phase} · ${count}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">未找到任务详情。</div>
        )}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
        <B2SStatsHeader stats={stats} title="当前任务统计" />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-black text-slate-900">ELF Item 详情</h2>
          <p className="mt-1 text-sm text-slate-500">展示阶段、进度、过程消息、错误信息与输出文件。</p>
        </div>

        {!detail ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无详情数据</div>
        ) : detail.items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">当前任务没有可展示的 item。</div>
        ) : (
          <div className="mt-5 space-y-4">
            {detail.items.map((item) => {
              const progress = item.progress;
              const progressValue = progress?.percent ?? progress?.batches_percent ?? progress?.bytes_percent ?? 0;
              return (
                <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-900">#{item.sequence_no}</div>
                        <B2SStatusBadge status={item.status} />
                        <B2SPhaseBadge phase={item.phase} label={item.phase_label || item.phase} />
                      </div>
                      <div className="mt-3 break-all rounded-2xl bg-slate-50 px-4 py-3 font-mono text-xs text-slate-500">
                        {item.elf_path}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">开始时间</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">{formatDateTime(item.started_at)}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">结束时间</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">{formatDateTime(item.finished_at)}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">失败类型</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">{item.failure_type || '-'}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">输出目录</div>
                          <div className="mt-1 break-all text-sm font-bold text-slate-800">{item.output_dir || '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:max-w-[320px]">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-slate-700">过程进度</div>
                          <div className="text-sm font-black text-slate-900">{pct(progressValue).toFixed(1)}%</div>
                        </div>
                        <div className="mt-3">
                          <B2SProgressBar value={progressValue} />
                        </div>
                        <div className="mt-4 space-y-2 text-xs text-slate-600">
                          <div>函数：{progress?.completed_functions ?? 0} / {progress?.total_functions ?? 0}</div>
                          <div>字节：{formatBytes(progress?.completed_bytes)} / {formatBytes(progress?.total_bytes)}</div>
                          <div>批次：{progress?.completed_batches ?? 0} / {progress?.total_batches ?? 0}</div>
                          <div>当前批次：{progress?.current_batch ?? '-'}</div>
                          <div>尝试次数：{progress?.current_attempt ?? '-'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-bold text-slate-800">中间过程信息</div>
                      <div className="mt-3 space-y-3 text-sm text-slate-600">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">阶段消息</div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-slate-700">{item.phase_message || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">进度消息</div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-slate-700">{progress?.message || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">当前函数</div>
                          <div className="mt-1 break-all text-slate-700">{progress?.current_function || '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-bold text-slate-800">结果与异常</div>
                      <div className="mt-3 space-y-3 text-sm text-slate-600">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">失败原因</div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-rose-700">{item.error_reason || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">生成文件</div>
                          <div className="mt-1 space-y-2">
                            {item.generated_files.length === 0 ? (
                              <div className="text-slate-500">-</div>
                            ) : (
                              item.generated_files.map((generatedFile) => (
                                <div key={generatedFile} className="break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">
                                  {generatedFile}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
