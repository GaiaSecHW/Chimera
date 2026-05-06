import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { BinarySecurityTaskDetail } from '../../clients/binarySecurity';
import { api } from '../../clients/api';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled']);

const statusTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial_success':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');

export const BinarySecurityTaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const executionApi = api.domains.execution;
  const [detail, setDetail] = useState<BinarySecurityTaskDetail | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError(null);
    try {
      const [task, timelineResp, artifactsResp] = await Promise.all([
        executionApi.binarySecurity.getTask(projectId, taskId),
        executionApi.binarySecurity.getTimeline(projectId, taskId),
        executionApi.binarySecurity.getArtifacts(projectId, taskId),
      ]);
      setDetail(task);
      setTimeline(timelineResp.events || []);
      setArtifacts(artifactsResp);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, taskId]);

  useEffect(() => {
    if (!detail || TERMINAL.has(detail.status)) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, projectId, taskId]);

  const runAction = async (action: 'cancel' | 'retry' | 'resume') => {
    if (!projectId || !taskId) return;
    setActionLoading(action);
    try {
      if (action === 'cancel') await executionApi.binarySecurity.cancelTask(projectId, taskId);
      if (action === 'retry') await executionApi.binarySecurity.retryTask(projectId, taskId);
      if (action === 'resume') await executionApi.binarySecurity.resumeTask(projectId, taskId);
      await load();
    } catch (e: any) {
      setError(e?.message || `${action} 失败`);
    } finally {
      setActionLoading('');
    }
  };

  if (!taskId) {
    return <div className="px-8 pb-10 pt-8 text-sm text-slate-500">未指定任务。</div>;
  }

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          <ArrowLeft size={16} />
          返回任务列表
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw size={16} />
            刷新
          </button>
          <button type="button" onClick={() => void runAction('cancel')} disabled={actionLoading !== ''} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60">取消</button>
          <button type="button" onClick={() => void runAction('retry')} disabled={actionLoading !== ''} className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-60">重试</button>
          <button type="button" onClick={() => void runAction('resume')} disabled={actionLoading !== ''} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">继续</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      {loading && !detail ? (
        <div className="text-sm text-slate-500">加载中...</div>
      ) : detail ? (
        <>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security Detail</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{detail.name}</h1>
                <div className="mt-2 break-all font-mono text-xs text-slate-400">{detail.id}</div>
                <div className="mt-4 flex items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(detail.status)}`}>{detail.status}</span>
                  <span className="text-sm text-slate-500">当前阶段：{detail.current_stage || '-'}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">创建时间：<span className="font-bold text-slate-900">{fmt(detail.created_at)}</span></div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">完成时间：<span className="font-bold text-slate-900">{fmt(detail.finished_at)}</span></div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">高危模块：<span className="font-bold text-slate-900">{detail.high_risk_module_count}</span></div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">漏洞结果：<span className="font-bold text-slate-900">{detail.vuln_result_count}</span></div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">固件路径</div>
                <div className="mt-2 break-all font-mono text-xs text-slate-700">{detail.firmware_path}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">产物目录</div>
                <div className="mt-2 break-all font-mono text-xs text-slate-700">{artifacts?.fileserver_path || detail.output_root}</div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">阶段概览</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {detail.stage_summaries.map((stage) => (
                <div key={stage.stage_name} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-slate-900">{stage.sequence_no}. {stage.stage_name}</div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(stage.status)}`}>{stage.status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div>总数：<span className="font-bold text-slate-900">{stage.total_items}</span></div>
                    <div>成功：<span className="font-bold text-slate-900">{stage.success_items}</span></div>
                    <div>失败：<span className="font-bold text-slate-900">{stage.failed_items}</span></div>
                    <div>运行中：<span className="font-bold text-slate-900">{stage.running_items}</span></div>
                  </div>
                  {stage.last_error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{stage.last_error}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">阶段子任务</h2>
            <div className="mt-5 space-y-3">
              {detail.stage_items.length === 0 ? (
                <div className="text-sm text-slate-400">暂无子任务</div>
              ) : detail.stage_items.map((item) => (
                <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="font-black text-slate-900">{item.stage_name} / {item.item_name || item.item_key}</div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
                        <div className="rounded-xl bg-white px-3 py-2">downstream: {item.downstream_service || '-'} / {item.downstream_task_id || '-'}</div>
                        <div className="rounded-xl bg-white px-3 py-2">error: {item.error_message || '-'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{fmt(item.started_at)} {'->'} {fmt(item.finished_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">事件时间线</h2>
            <div className="mt-5 space-y-3">
              {timeline.length === 0 ? (
                <div className="text-sm text-slate-400">暂无事件</div>
              ) : timeline.slice(-80).reverse().map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">{event.message}</div>
                    <div className="text-xs text-slate-500">{fmt(event.created_at)}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{event.event_type} {event.stage_name ? `· ${event.stage_name}` : ''}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">产物文件</h2>
            <div className="mt-3 text-xs text-slate-500">工作目录：{artifacts?.workspace_root || '-'}</div>
            <div className="mt-5 max-h-[420px] space-y-2 overflow-auto">
              {(artifacts?.files || []).map((file: any) => (
                <div key={file.path} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                  {file.path}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};
