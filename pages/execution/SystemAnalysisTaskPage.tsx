import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileText, FolderOpen, Loader2, PlayCircle, Plus, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { api } from '../../clients/api';
import { AppSaStageEvent, AppSaTaskDetail, AppSaTaskItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';

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
      if (result[j].startTs !== null) { endTs = result[j].startTs; break; }
    }
    result[i].endTs = endTs;
  }
  return result;
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix = `/data/fileserver/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer' } }));
}

// Inline markdown renderer for report preview
const ReportMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="prose prose-sm max-w-none text-slate-800">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 text-xs leading-relaxed">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2">{children}</a>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0 text-xs">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0 text-xs">{children}</ol>,
        li: ({ children }) => <li className="text-xs">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 text-sm font-black text-slate-900 border-b border-slate-200 pb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-sm font-bold text-slate-800">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-xs font-bold text-slate-700">{children}</h3>,
        blockquote: ({ children }) => <blockquote className="mb-2 border-l-4 border-cyan-300 bg-cyan-50 px-3 py-1.5 italic text-xs last:mb-0">{children}</blockquote>,
        table: ({ children }) => <div className="mb-2 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
        th: ({ children }) => <th className="border border-slate-300 px-2 py-1 font-bold text-slate-700">{children}</th>,
        td: ({ children }) => <td className="border border-slate-300 px-2 py-1 align-top text-xs">{children}</td>,
        code: ({ children, className }) => className
          ? <code className="block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-100">{children}</code>
          : <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>,
        pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

const emptyForm = {
  task_name: '',
  input_path: '',
  output_path: '',
  task_description: '',
  analyse_targets: ['all'] as string[],
  binary_arch: ['all'] as string[],
};

// ── Stage display helpers ─────────────────────────────────────────────────────

const STAGE_STEPS = [
  { key: 'preprocess', label: '预处理',   desc: '文件过滤 / 目录探索 / 预扫描', triggers: ['filter', 'explore', 'prescan'], artifactSubpath: 'run/sessions/s0_preprocess' },
  { key: 'classify',   label: '全局分类', desc: '全局文件类型分类与脚本检查',   triggers: [1, '1'],                         artifactSubpath: 'run/sessions/s1_classify' },
  { key: 'refine',     label: '细分类',   desc: '子文件夹细分类与模块划分',     triggers: [2, '2'],                         artifactSubpath: 'run/sessions/s2_refine' },
  { key: 'analyse',    label: '安全分析', desc: '各模块安全威胁深度分析',       triggers: [3, '3'],                         artifactSubpath: 'run/sessions/s3_analyse' },
  { key: 'report',     label: '报告生成', desc: '完整性检查 + 最终安全报告',    triggers: [4, '4'],                         artifactSubpath: 'output' },
];

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function deriveStepStatuses(
  taskStatus: string,
  events: AppSaStageEvent[],
): StepStatus[] {
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

  // No stage events yet — show first step state based on task status
  if (lastSeenStep === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled') statuses[0] = 'failed';
    return statuses;
  }

  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (i < lastSeenStep) {
      statuses[i] = 'completed';
    } else if (i === lastSeenStep) {
      statuses[i] = taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled'
        ? 'failed'
        : 'running';
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
    case 'task_start':   return `[${ts}] 任务开始`;
    case 'stage': {
      const s = d.stage;
      if (s === 'filter')    return `[${ts}] \u25b6 开始文件类型过滤  types=${d.types ?? ''} arch=${d.arch ?? ''}`;
      if (s === 'explore')   return `[${ts}] \u25b6 开始目录探索`;
      if (s === 'prescan')   return `[${ts}] \u25b6 开始关键词预扫描`;
      if (String(s) === '1') return `[${ts}] \u25b6 Stage 1 全局分类  第 ${d.attempt ?? 1} 轮`;
      if (String(s) === '2') return `[${ts}] \u25b6 Stage 2 细分类`;
      if (String(s) === '3') return `[${ts}] \u25b6 Stage 3 安全分析`;
      if (String(s) === '4') return `[${ts}] \u25b6 Stage 4 报告生成`;
      return `[${ts}] \u25b6 Stage ${s}`;
    }
    case 'stage_result': {
      const s = d.stage;
      if (s === 'filter')  return `[${ts}] \u2713 过滤完成，发现 ${d.file_count ?? 0} 个文件`;
      if (s === 'prescan') return `[${ts}] \u2713 预扫描完成，${d.summary_lines ?? 0} 行摘要`;
      return `[${ts}] \u2713 ${s} 阶段完成`;
    }
    case 'model': {
      const parts = [];
      if (d.worker) parts.push(`Worker: ${d.worker}`);
      if (d.judge)  parts.push(`Judge: ${d.judge}`);
      if (d.model)  parts.push(`Model: ${d.model}`);
      return `[${ts}]   模型: ${parts.join('  ')}`;
    }
    case 'cli_output': {
      const text = (d.text ?? '').trim();
      const lines = text.split('\n');
      const preview = lines[0].slice(0, 120);
      const extra = lines.length > 1 ? ` (+${lines.length - 1} 行)` : '';
      return `[${ts}] \u2502 ${d.stage ?? ''} 脚本: ${preview}${extra}`;
    }
    case 'agent_stream': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return '';
      return `[${ts}] \u2502 ${d.stage ?? ''}: ${text}`;
    }
    case 'agent_output': {
      const text = (d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
      if (!text) return `[${ts}] \u2713 ${d.stage ?? ''} Agent 完成`;
      return `[${ts}] \u2713 ${d.stage ?? ''} Agent: ${text}`;
    }
    case 'error':    return `[${ts}] \u2717 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    default:
      return `[${ts}] ${evt.type}: ${JSON.stringify(d)}`;
  }
}

export const SystemAnalysisTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [tasks, setTasks] = useState<AppSaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<AppSaTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);

  // Report inline viewer state
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'output'>('input');
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Pre-fill input_path from FileExplorer right-click
  useEffect(() => {
    const stored = sessionStorage.getItem('secflow:systemAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('secflow:systemAnalysisInputPath');
      setCreateModalOpen(true);
      setSelectedTaskId('');
      setForm({ ...emptyForm, input_path: stored });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load task list ────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await appApi.listTasks({ project_id: projectId, page: p, per_page: perPage });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, perPage]);

  useEffect(() => { void loadTasks(page); }, [projectId, page, perPage]);

  // ── Load task detail ──────────────────────────────────────────────────────

  const loadDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const d = await appApi.getTask(taskId);
      setDetail(d);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setModalOpen(true);
    void loadDetail(taskId);
  };

  // ── Auto-poll when tasks are running or pending ───────────────────────────
  const hasActiveTasks = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = setInterval(() => {
      void loadTasks(page);
      if (selectedTaskId && modalOpen) void loadDetail(selectedTaskId);
    }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveTasks, projectId, page, selectedTaskId, modalOpen]);

  // Auto-scroll logs to bottom when new events arrive
  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detail?.stages_json?.events?.length, logsExpanded]);

  const handleInputPathChange = (value: string) => {
    setForm((prev) => ({ ...prev, input_path: value }));
  };

  // ── Create task ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.task_name.trim()) { notify('任务名称不能为空', 'error'); return; }
    if (!form.input_path.trim()) { notify('输入路径不能为空', 'error'); return; }
    if (!form.output_path.trim()) { notify('输出路径不能为空', 'error'); return; }
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
        analyse_targets: form.analyse_targets.length > 0 && !form.analyse_targets.includes('all') ? form.analyse_targets : undefined,
        binary_arch: form.binary_arch.length > 0 && !form.binary_arch.includes('all') ? form.binary_arch : undefined,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
      setForm({ ...emptyForm });
      setCreateModalOpen(false);
      setPage(1);
      await loadTasks(1);
    } catch (err: any) {
      notify(`任务创建失败: ${err?.message || err}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await appApi.cancelTask(taskId);
      notify('任务已取消', 'success');
      if (selectedTaskId === taskId) void loadDetail(taskId);
      await loadTasks(page);
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleRestart = async (taskId: string) => {
    setRestarting(true);
    try {
      await appApi.restartTask(taskId);
      notify('任务已重新启动', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) void loadDetail(taskId);
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleResume = async (taskId: string) => {
    setResuming(true);
    try {
      await appApi.resumeTask(taskId);
      notify('已从断点继续', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) void loadDetail(taskId);
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedTaskId('');
    setDetail(null);
  };

  const totalPages = Math.ceil(total / perPage);

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
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'output') {
            setForm((p) => ({ ...p, output_path: containerPath }));
          } else {
            handleInputPathChange(containerPath);
          }
        }}
      />

      {/* Task Detail Modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              {detail ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-lg font-black text-slate-900 truncate">{detail.task_name}</h2>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
              ) : (
                <h2 className="text-lg font-black text-slate-900">任务详情</h2>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {detail && (detail.status === 'running' || detail.status === 'pending') ? (
                  <button onClick={() => void handleCancel(detail.task_id)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">取消</button>
                ) : null}
                {detail && !['pending', 'running'].includes(detail.status) ? (
                  <>
                    <button
                      onClick={() => void handleRestart(detail.task_id)}
                      disabled={restarting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
                    >
                      {restarting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      重新运行
                    </button>
                    {detail.started_at ? (
                      <button
                        onClick={() => void handleResume(detail.task_id)}
                        disabled={resuming}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {resuming ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                        断点续跑
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button onClick={() => detail && void loadDetail(detail.task_id)} title="刷新"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700"><RefreshCw size={14} /></button>
                <button onClick={closeModal} title="关闭"
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>

            {/* Modal body */}
            {detailLoading && !detail ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />加载中...
              </div>
            ) : detail ? (
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                  <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="输入路径" value={<span className="font-mono break-all">{detail.input_path}</span>} />
                  {detail.started_at ? <InfoRow label="开始时间" value={new Date(detail.started_at).toLocaleString('zh-CN')} /> : <div />}
                  {detail.output_path ? <InfoRow label="输出路径" value={<span className="font-mono break-all">{detail.output_path}</span>} /> : <div />}
                  {detail.finished_at ? <InfoRow label="完成时间" value={new Date(detail.finished_at).toLocaleString('zh-CN')} /> : <div />}
                  {detail.task_description ? <InfoRow label="描述" value={detail.task_description} /> : null}
                  {detail.started_at ? <InfoRow label="耗时" value={formatDuration(detail.started_at, detail.finished_at ?? undefined)} /> : null}
                </div>

                {/* Stage Progress */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">分析阶段进度</h3>
                  <div className="relative flex items-start gap-0">
                    {STAGE_STEPS.map((step, i) => {
                      const st = stageStatuses[i];
                      const timing = stageTimes[i];
                      const timingStr = (st === 'completed' || st === 'failed') ? formatTsDuration(timing.startTs, timing.endTs) : '';
                      const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : null;
                      const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                      return (
                        <div key={step.key} className="flex-1 flex flex-col items-center relative">
                          {i < STAGE_STEPS.length - 1 ? (
                            <div className={`absolute top-4 left-1/2 w-full h-0.5 ${st === 'completed' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          ) : null}
                          <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold
                            ${st === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                              : st === 'running'   ? 'border-blue-500 bg-blue-50 text-blue-600'
                              : st === 'failed'    ? 'border-red-400 bg-red-50 text-red-600'
                              : 'border-slate-200 bg-white text-slate-400'}`}>
                            {st === 'completed' ? <CheckCircle2 size={16} className="text-emerald-500" />
                              : st === 'running'  ? <Loader2 size={14} className="animate-spin text-blue-500" />
                              : st === 'failed'   ? <XCircle size={16} className="text-red-500" />
                              : <span>{i + 1}</span>}
                          </div>
                          <div className={`mt-2 text-center px-1 ${st === 'running' ? 'text-blue-600' : st === 'completed' ? 'text-emerald-600' : st === 'failed' ? 'text-red-500' : 'text-slate-400'}`}>
                            <div className="text-xs font-semibold">{step.label}</div>
                            <div className="text-[10px] text-slate-400 leading-tight mt-0.5 hidden sm:block">{step.desc}</div>
                            {timingStr ? <div className="text-[10px] font-mono text-slate-500 mt-0.5">⏱ {timingStr}</div> : null}
                            {artifactFsPath && (st === 'completed' || st === 'running') ? (
                              <button
                                onClick={() => openInFileExplorer(artifactFsPath)}
                                className="mt-1 inline-flex items-center gap-0.5 rounded border border-cyan-200 px-1 py-0.5 text-[10px] text-cyan-600 hover:bg-cyan-50"
                              >
                                <FolderOpen size={9} />输出
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Error */}
                {detail.error ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1">错误信息</h3>
                    <pre className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap break-all max-h-32 overflow-auto">{detail.error}</pre>
                  </div>
                ) : null}

                {/* Analysis Logs */}
                <div>
                  <button
                    type="button"
                    onClick={() => setLogsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 mb-1"
                  >
                    <span>分析日志 <span className="normal-case font-normal text-slate-400">({logLines.length} 条事件)</span></span>
                    {logsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {logsExpanded ? (
                    logLines.length === 0 ? (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-xs text-slate-400">
                        {detail.status === 'pending' ? '任务尚未开始，暂无日志' : '暂无阶段事件（日志在任务运行期间每5个事件刷新一次）'}
                      </div>
                    ) : (
                      <div
                        ref={logScrollRef}
                        className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-300 font-mono max-h-60 overflow-auto space-y-0.5 leading-relaxed"
                      >
                        {logLines.map((line, idx) => (
                          <div key={idx} className={
                            !line ? 'h-1' :
                            line.includes('\u2717') ? 'text-red-400' :
                            line.includes('\u25b6') ? 'text-cyan-300' :
                            line.includes('\u2713') ? 'text-emerald-400' :
                            line.includes('\u2502') && line.includes('脚本') ? 'text-yellow-300' :
                            line.includes('\u2502') ? 'text-slate-400 text-[11px]' :
                            line.includes('\u6a21\u578b') ? 'text-slate-400' :
                            'text-slate-300'
                          }>{line}</div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>

                {/* Result */}
                {detail.result_json ? (
                  <details className="rounded-lg border border-slate-200" open={false}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">分析结果 (JSON)</summary>
                    <pre className="px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-auto border-t border-slate-100">{JSON.stringify(detail.result_json, null, 2)}</pre>
                  </details>
                ) : null}


              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">指定分析路径，启动安全分析任务。</p>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: '总任务', value: total, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
          { label: '运行中', value: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
          { label: '已通过', value: tasks.filter((t) => t.status === 'passed').length, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
          { label: '失败/取消', value: tasks.filter((t) => t.status === 'failed' || t.status === 'error' || t.status === 'cancelled').length, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex flex-col gap-1 shadow-sm`}>
            <p className={`text-3xl font-black ${s.text}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Task list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
          <div className="flex items-center gap-2">
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="每页显示条数"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}条/页</option>)}
            </select>
            <button onClick={() => void loadTasks(page)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setCreateModalOpen(true); setForm({ ...emptyForm }); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6"><Loader2 size={14} className="animate-spin" />加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无任务，点击右上角「新建任务」创建</div>
        ) : (
          <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
            {tasks.map((t) => (
              <button
                key={t.task_id}
                onClick={() => handleSelectTask(t.task_id)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{t.task_name}</div>
                    <div className="mt-0.5 text-xs text-slate-500 truncate font-mono">{t.input_path}</div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                  <span>创建: {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}</span>
                  <span>耗时: {formatDuration(t.started_at, t.finished_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">上一页</button>
            <span className="text-slate-500">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">下一页</button>
          </div>
        ) : null}
      </section>

      {/* Create Task Modal */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">新建任务</h2>
                <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>

              <label className="block text-sm text-slate-600">
                任务名称 <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_name}
                  onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))}
                  placeholder="例：固件安全分析-2025"
                />
              </label>

              <label className="block text-sm text-slate-600">
                输入路径 <span className="text-red-500">*</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.input_path}
                    onChange={(e) => handleInputPathChange(e.target.value)}
                    placeholder="/data/fileserver/files/<project>/<subproject>"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              <label className="block text-sm text-slate-600">
                输出路径 <span className="text-red-500">*</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.output_path}
                    onChange={(e) => setForm((p) => ({ ...p, output_path: e.target.value }))}
                    placeholder="/data/fileserver/files/<project>/<subproject>"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              <label className="block text-sm text-slate-600">
                任务描述 <span className="text-slate-400 text-xs">(可选)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_description}
                  onChange={(e) => setForm((p) => ({ ...p, task_description: e.target.value }))}
                  placeholder="简要说明分析目标或背景"
                />
              </label>

              {/* Per-task analysis scope */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-600">分析范围 <span className="font-normal text-slate-400">(覆盖服务默认配置，默认 all)</span></p>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">文件类型</p>
                  <div className="flex flex-wrap gap-2">
                    {['all','binary','script','source','config','firmware','crypto','database','web','network_model','document','archive'].map((t) => (
                      <label key={t} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={form.analyse_targets.includes(t)}
                          onChange={(e) => {
                            setForm((p) => {
                              let next = e.target.checked
                                ? (t === 'all' ? ['all'] : p.analyse_targets.filter(x => x !== 'all').concat(t))
                                : p.analyse_targets.filter(x => x !== t);
                              if (next.length === 0) next = ['all'];
                              return { ...p, analyse_targets: next };
                            });
                          }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">二进制架构</p>
                  <div className="flex flex-wrap gap-2">
                    {['all','x86','x86_64','arm','aarch64','mips','mips64','ppc','ppc64','riscv','s390'].map((a) => (
                      <label key={a} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={form.binary_arch.includes(a)}
                          onChange={(e) => {
                            setForm((p) => {
                              let next = e.target.checked
                                ? (a === 'all' ? ['all'] : p.binary_arch.filter(x => x !== 'all').concat(a))
                                : p.binary_arch.filter(x => x !== a);
                              if (next.length === 0) next = ['all'];
                              return { ...p, binary_arch: next };
                            });
                          }}
                        />
                        {a}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void handleCreate()}
                disabled={creating || !form.task_name.trim() || !form.input_path.trim() || !form.output_path.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                创建分析任务
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700 min-w-0">{value}</span>
    </div>
  );
}
