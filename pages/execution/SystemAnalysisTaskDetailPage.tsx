import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, FolderOpen, Loader2, PlayCircle, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppSaStageEvent, AppSaTaskDetail } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

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

const STAGE_STEPS = [
  { key: 'preprocess', label: '预处理', desc: '文件过滤 / 目录探索 / 预扫描', triggers: ['filter', 'explore', 'prescan'], artifactSubpath: 'run/workspace' },
  { key: 'classify', label: '全局分类', desc: '全局文件类型分类与脚本检查', triggers: [1, '1'], artifactSubpath: 'run/sessions' },
  { key: 'refine', label: '细分类', desc: '子文件夹细分类与模块划分', triggers: [2, '2'], artifactSubpath: 'run/sessions' },
  { key: 'analyse', label: '安全分析', desc: '各模块安全威胁深度分析', triggers: [3, '3'], artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告生成', desc: '完整性检查 + 最终安全报告', triggers: [4, '4'], artifactSubpath: 'output' },
];

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatTsDuration(startTs: number | null, endTs: number | null): string {
  if (!startTs || !endTs || endTs <= startTs) return '';
  const secs = Math.round(endTs - startTs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function computeStageTimes(events: AppSaStageEvent[]): Array<{ startTs: number | null; endTs: number | null }> {
  const result = STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  let taskEndTs: number | null = null;
  for (const evt of events) {
    if (evt.type === 'task_end') taskEndTs = evt.ts;
  }
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (result[i].startTs === null) result[i].startTs = evt.ts;
        break;
      }
    }
  }
  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (result[i].startTs === null) continue;
    let endTs = taskEndTs;
    for (let j = i + 1; j < STAGE_STEPS.length; j++) {
      if (result[j].startTs !== null) {
        endTs = result[j].startTs;
        break;
      }
    }
    result[i].endTs = endTs;
  }
  return result;
}

function deriveStepStatuses(taskStatus: string, events: AppSaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');

  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');

  let lastSeenStep = -1;
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (i > lastSeenStep) lastSeenStep = i;
      }
    }
  }

  if (lastSeenStep === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled') statuses[0] = 'failed';
    return statuses;
  }

  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (i < lastSeenStep) statuses[i] = 'completed';
    else if (i === lastSeenStep) {
      statuses[i] = taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled' ? 'failed' : 'running';
    }
  }

  if ((taskStatus === 'error' || taskStatus === 'failed') && lastSeenStep >= 0) {
    statuses[lastSeenStep] = 'failed';
  }

  return statuses;
}

function formatEventLog(evt: AppSaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'stage': {
      const s = d.stage;
      if (s === 'filter') return `[${ts}] ▶ 开始文件类型过滤  types=${d.types ?? ''} arch=${d.arch ?? ''}`;
      if (s === 'explore') return `[${ts}] ▶ 开始目录探索`;
      if (s === 'prescan') return `[${ts}] ▶ 开始关键词预扫描`;
      if (String(s) === '1') return `[${ts}] ▶ Stage 1 全局分类  第 ${d.attempt ?? 1} 轮`;
      if (String(s) === '2') return `[${ts}] ▶ Stage 2 细分类`;
      if (String(s) === '3') return `[${ts}] ▶ Stage 3 安全分析`;
      if (String(s) === '4') return `[${ts}] ▶ Stage 4 报告生成`;
      return `[${ts}] ▶ Stage ${s}`;
    }
    case 'stage_result': {
      const s = d.stage;
      if (s === 'filter') return `[${ts}] ✓ 过滤完成，发现 ${d.file_count ?? 0} 个文件`;
      if (s === 'prescan') return `[${ts}] ✓ 预扫描完成，${d.summary_lines ?? 0} 行摘要`;
      return `[${ts}] ✓ ${s} 阶段完成`;
    }
    case 'model': {
      const parts = [];
      if (d.worker) parts.push(`Worker: ${d.worker}`);
      if (d.judge) parts.push(`Judge: ${d.judge}`);
      if (d.model) parts.push(`Model: ${d.model}`);
      return `[${ts}]   模型: ${parts.join('  ')}`;
    }
    case 'cli_output': {
      const text = (d.text ?? '').trim();
      const lines = text.split('\n');
      const preview = lines[0].slice(0, 120);
      const extra = lines.length > 1 ? ` (+${lines.length - 1} 行)` : '';
      return `[${ts}] │ ${d.stage ?? ''} 脚本: ${preview}${extra}`;
    }
    case 'agent_stream': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return '';
      return `[${ts}] │ ${d.stage ?? ''}: ${text}`;
    }
    case 'agent_output': {
      const text = (d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
      if (!text) return `[${ts}] ✓ ${d.stage ?? ''} Agent 完成`;
      return `[${ts}] ✓ ${d.stage ?? ''} Agent: ${text}`;
    }
    case 'error': return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    default: return `[${ts}] ${evt.type}: ${JSON.stringify(d)}`;
  }
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer' } }));
}

export const SystemAnalysisTaskDetailPage: React.FC<{
  projectId: string;
  taskId: string;
  onBack: () => void;
}> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<AppSaTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logScrollRef = useRef<HTMLDivElement>(null);

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await appApi.getTask(taskId);
      setDetail(data);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [taskId]);

  useEffect(() => {
    if (!detail || !['running', 'pending'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);

  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detail?.stages_json?.events?.length, logsExpanded]);

  const handleCancel = async () => {
    if (!detail) return;
    try {
      await appApi.cancelTask(detail.task_id);
      notify('任务已取消', 'success');
      await loadDetail();
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    if (!window.confirm(`确定要删除任务「${detail.task_name}」及其所有输出文件吗？此操作不可撤销。`)) return;
    try {
      await appApi.deleteTask(detail.task_id, true);
      notify('任务已删除', 'success');
      onBack();
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const handleRestart = async () => {
    if (!detail) return;
    setRestarting(true);
    try {
      await appApi.restartTask(detail.task_id);
      notify('任务已重新启动', 'success');
      await loadDetail();
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleResume = async () => {
    if (!detail) return;
    setResuming(true);
    try {
      await appApi.resumeTask(detail.task_id);
      notify('已从断点继续', 'success');
      await loadDetail();
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const stageStatuses = detail
    ? deriveStepStatuses(detail.status, detail.stages_json?.events ?? [])
    : STAGE_STEPS.map((): StepStatus => 'pending');
  const stageTimes = detail
    ? computeStageTimes(detail.stages_json?.events ?? [])
    : STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  const logLines = detail?.stages_json?.events?.map(formatEventLog) ?? [];

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              返回任务列表
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{detail?.task_name || '任务详情'}</h1>
              {detail ? (
                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-500 break-all">{detail?.input_path || '正在加载任务详情。'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && (detail.status === 'running' || detail.status === 'pending') ? (
              <button onClick={() => void handleCancel()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                取消任务
              </button>
            ) : null}
            {detail && !['pending', 'running'].includes(detail.status) ? (
              <button
                onClick={() => void handleRestart()}
                disabled={restarting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
              >
                {restarting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                重新运行
              </button>
            ) : null}
            {detail && detail.started_at && !['pending', 'running'].includes(detail.status) ? (
              <button
                onClick={() => void handleResume()}
                disabled={resuming}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {resuming ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                断点续跑
              </button>
            ) : null}
            {detail ? (
              <button
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 size={13} />
                删除任务
              </button>
            ) : null}
            <button onClick={() => void loadDetail()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="刷新">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </section>

      {loading && !detail ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        </section>
      ) : null}

      {detail ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
              <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="输入路径" value={<span className="font-mono break-all">{detail.input_path}</span>} />
                <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono break-all">{detail.output_path}</span> : '-'} />
                <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="描述" value={detail.task_description || '-'} />
                <InfoRow label="耗时" value={detail.started_at ? formatDuration(detail.started_at, detail.finished_at ?? undefined) : '-'} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
              <div className="mt-4 space-y-3">
                {STAGE_STEPS.map((step, i) => {
                  const st = stageStatuses[i];
                  const timing = stageTimes[i];
                  const timingStr = (st === 'completed' || st === 'failed') ? formatTsDuration(timing.startTs, timing.endTs) : '';
                  const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : null;
                  const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                  return (
                    <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                          st === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                            : st === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : st === 'failed' ? 'border-red-400 bg-red-50 text-red-600'
                            : 'border-slate-200 bg-white text-slate-400'
                        }`}>
                          {st === 'completed' ? <CheckCircle2 size={16} className="text-emerald-500" />
                            : st === 'running' ? <Loader2 size={14} className="animate-spin text-blue-500" />
                            : st === 'failed' ? <XCircle size={16} className="text-red-500" />
                            : <span>{i + 1}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{step.label}</p>
                            {timingStr ? <span className="text-[11px] font-mono text-slate-500">⏱ {timingStr}</span> : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{step.desc}</p>
                          {artifactFsPath && (st === 'completed' || st === 'running') ? (
                            <button
                              onClick={() => openInFileExplorer(artifactFsPath)}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50"
                            >
                              <FolderOpen size={11} />
                              打开阶段输出
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {detail.error ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              type="button"
              onClick={() => setLogsExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2>
                <p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p>
              </div>
              {logsExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>
            {logsExpanded ? (
              logLines.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">
                  {detail.status === 'pending' ? '任务尚未开始，暂无日志' : '暂无阶段事件（日志在任务运行期间每 5 秒刷新一次）'}
                </div>
              ) : (
                <div
                  ref={logScrollRef}
                  className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300"
                >
                  {logLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        !line ? 'h-1'
                          : line.includes('✗') ? 'text-red-400'
                          : line.includes('▶') ? 'text-cyan-300'
                          : line.includes('✓') ? 'text-emerald-400'
                          : line.includes('│') && line.includes('脚本') ? 'text-yellow-300'
                          : line.includes('│') ? 'text-slate-400 text-[11px]'
                          : line.includes('模型') ? 'text-slate-400'
                          : 'text-slate-300'
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>

          {detail.result_json ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析结果</h2>
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
                {JSON.stringify(detail.result_json, null, 2)}
              </pre>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 text-sm text-slate-700">{value}</span>
    </div>
  );
}
