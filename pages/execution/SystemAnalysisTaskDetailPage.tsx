import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  BarChart3,
  FolderOpen,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ScrollText,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import {
  AppSaResultModule,
  AppSaSessionEvent,
  AppSaSessionIndex,
  AppSaSessionMeta,
  AppSaSessionSnapshot,
  AppSaStageEvent,
  AppSaTaskDetail,
  AppSaTaskEvaluation,
  AppSaEvaluationRound,
  AppSaTaskResult,
} from '../../types/types';
import { FileWatchMessage } from '../../clients/fileserver';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  hasBinarySecurityReturnContext,
  hasExecutionReturnContext,
  navigateBackToBinarySecurityTask,
  navigateBackToExecutionView,
} from '../../utils/executionReturnContext';
import { getAnalysisModeInfo, TaskOriginCard } from './taskOrigin';
import { AgentSessionViewer } from './AgentSessionViewer';
import { AgentSessionDialogHeader } from './AgentSessionDialogHeader';
import { AgentSessionWarningPanel } from './AgentSessionWarningPanel';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { parseAgentSessionJsonlDelta } from './agentSessionParsing';
import { blobToText, buildSessionSnapshotFromText, parseSessionJsonlDelta } from './sessionParsing';
import { SessionRelationshipGraph } from './SessionRelationshipGraph';
import { buildCloneFormFromTask, SystemAnalysisTaskFormModal } from './SystemAnalysisTaskFormModal';
import { SystemAnalysisTaskConfigPanel } from './TaskConfigPanels';
import { WarningListPanel } from './WarningListPanel';
import { AbnormalReasonCard } from './AbnormalReasonCard';

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
type DetailTab = 'overview' | 'run-config' | 'session' | 'relationship' | 'result' | 'evaluation';
type ResultSelection = { type: 'report' } | { type: 'module'; moduleName: string };
type StageOverviewMetric = { label: string; value: string };
type EvaluationRoundContextMenu = {
  roundKey: string;
  moduleName: string;
  x: number;
  y: number;
};
type GroupedEvaluationRounds = {
  groupKey: string;
  displayName: string;
  firstRound: number | null;
  firstStageRound: number | null;
  latestStatus: string;
  rounds: AppSaEvaluationRound[];
};

const GLOBAL_TASK_GROUP_KEY = '__task__';
const GLOBAL_TASK_GROUP_LABEL = '全局任务';

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

function formatLiveDuration(startedAt: string | null | undefined, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const startSecs = Math.floor(new Date(startedAt).getTime() / 1000);
  const secs = Math.max(0, nowSecs - startSecs);
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

function normalizeJoinPath(basePath: string, relativePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  const relative = relativePath.replace(/^\/+/, '');
  return `${base}/${relative}`;
}

function openInFileExplorer(fsPath: string) {
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: fsPath } }));
}

function formatSessionMtime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString('zh-CN');
}

function sessionGroupLabel(group: string) {
  if (group === 'root') return '根会话';
  return group;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words leading-6 text-sm text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          h1: ({ children }) => <h1 className="mb-3 text-xl font-black text-slate-900 last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 text-lg font-black text-slate-900 last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-base font-black text-slate-900 last:mb-0">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 italic text-slate-700 last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
          th: ({ children }) => <th className="border border-slate-200 px-3 py-2 font-black text-slate-800">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
          code: ({ children, className }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className="block overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100">{children}</code>;
            }
            return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900">{children}</code>;
          },
          pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function riskTone(level?: string | null) {
  if (level === '高') return 'border-red-200 bg-red-50 text-red-700';
  if (level === '中') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (level === '低') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 text-sm text-slate-700">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">{icon}</div>
      </div>
    </div>
  );
}

function formatNumber(value: unknown, digits = 0): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? Math.min(digits, 2) : 0,
  });
}

function formatRate(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${(num * 100).toFixed(1)}%`;
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

function stageLabel(stage: string | undefined): string {
  const labels: Record<string, string> = {
    classify: '全局分类',
    refine: '细分类',
    '2-reclassify': '细分类补归类',
    analyse: '安全分析',
    final_report: '最终报告',
  };
  return labels[stage || ''] || stage || '-';
}

function findLatestStageEventData(events: AppSaStageEvent[], stages: string[]): Record<string, any> | null {
  const stageSet = new Set(stages.map((item) => String(item)));
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (evt.type !== 'stage_result') continue;
    const stage = String(evt.data?.stage ?? '');
    if (stageSet.has(stage)) {
      return evt.data ?? null;
    }
  }
  return null;
}

function appendMetric(metrics: StageOverviewMetric[], label: string, value: unknown, digits = 0) {
  if (value == null || value === '') return;
  const num = Number(value);
  const formatted = Number.isFinite(num) ? formatNumber(num, digits) : String(value).trim();
  if (!formatted || formatted === '-') return;
  metrics.push({ label, value: formatted });
}

function buildOverviewStageMetrics(
  detail: AppSaTaskDetail | null,
  result: AppSaTaskResult | null,
  evaluation: AppSaTaskEvaluation | null,
): Record<string, StageOverviewMetric[]> {
  if (!detail) return {};

  const events = detail.stages_json?.events ?? [];
  const stageSummary = evaluation?.summary?.stage_summary ?? {};
  const preprocessMetrics: StageOverviewMetric[] = [];
  const classifyMetrics: StageOverviewMetric[] = [];
  const refineMetrics: StageOverviewMetric[] = [];
  const analyseMetrics: StageOverviewMetric[] = [];
  const reportMetrics: StageOverviewMetric[] = [];

  const filterResult = findLatestStageEventData(events, ['filter-engine', 'filter']);
  const prescanResult = findLatestStageEventData(events, ['prescan']);
  const preprocessSummary = detail.result_json?.preprocess_summary;
  appendMetric(
    preprocessMetrics,
    '全部输入文件',
    preprocessSummary?.total_input_file_count ?? filterResult?.total_input_file_count,
  );
  appendMetric(
    preprocessMetrics,
    '过滤后接受的文件',
    preprocessSummary?.accepted_input_file_count ?? filterResult?.accepted_input_file_count ?? filterResult?.file_count,
  );
  appendMetric(preprocessMetrics, '预扫描摘要', prescanResult?.summary_lines);
  if (filterResult?.effective_engine) {
    preprocessMetrics.push({
      label: '过滤引擎',
      value: filterResult.effective_engine === 'agent' ? '智能体' : '脚本',
    });
  }

  const classifySummary = stageSummary.classify ?? {};
  appendMetric(classifyMetrics, '轮次', classifySummary.round_count);
  appendMetric(classifyMetrics, 'Judge 均分', classifySummary.avg_judge_score, 1);
  appendMetric(classifyMetrics, '模块数', evaluation?.summary?.module_count ?? result?.summary.module_count);

  const refineSummary = stageSummary.refine ?? stageSummary['2-reclassify'] ?? {};
  appendMetric(refineMetrics, '轮次', refineSummary.round_count);
  appendMetric(refineMetrics, 'Judge 均分', refineSummary.avg_judge_score, 1);
  appendMetric(refineMetrics, '完成模块', evaluation?.summary?.completed_module_count);

  const analyseSummary = stageSummary.analyse ?? {};
  appendMetric(analyseMetrics, '轮次', analyseSummary.round_count);
  appendMetric(analyseMetrics, '完成模块', evaluation?.summary?.completed_module_count);
  appendMetric(analyseMetrics, '威胁数', result?.summary.threat_count);

  const reportSummary = stageSummary.final_report ?? {};
  appendMetric(reportMetrics, '分析模块', result?.summary.module_count);
  appendMetric(reportMetrics, '高风险模块', result?.summary.high_risk_module_count);
  appendMetric(reportMetrics, '威胁数', result?.summary.threat_count);
  if (detail.effective_config_json?.enable_final_check !== undefined) {
    reportMetrics.push({
      label: '完整性检查',
      value: detail.effective_config_json.enable_final_check ? '开启' : '关闭',
    });
  }
  if (detail.effective_config_json?.continue_on_module_failure !== undefined) {
    reportMetrics.push({
      label: '单模块失败后继续',
      value: detail.effective_config_json.continue_on_module_failure ? '允许继续' : '失败即终止',
    });
  }

  return {
    preprocess: preprocessMetrics.slice(0, 4),
    classify: classifyMetrics.slice(0, 3),
    refine: refineMetrics.slice(0, 3),
    analyse: analyseMetrics.slice(0, 3),
    report: reportMetrics.slice(0, 3),
  };
}

function sessionRoleLabel(role: string | undefined): string {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'worker') return 'Worker';
  if (normalized === 'judge') return 'Judge';
  return role || '-';
}

function sessionRoleTone(role: string | undefined) {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'worker') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (normalized === 'judge') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function evaluationStatusTone(status?: string) {
  if (status === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'needs_reflection') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'needs_retry') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (status === 'reclassify_required') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700';
  if (status === 'skipped') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function evaluationStatusLabel(status?: string) {
  if (status === 'passed') return '已通过';
  if (status === 'failed') return '失败';
  if (status === 'running') return '运行中';
  if (status === 'needs_reflection') return '待反思';
  if (status === 'needs_retry') return '待重试';
  if (status === 'reclassify_required') return '待重分类';
  if (status === 'skipped') return '已跳过';
  return status || '-';
}

function evaluationRoundKey(round: AppSaEvaluationRound): string {
  return [
    round.round ?? '',
    round.stage_round ?? '',
    round.stage ?? '',
    round.module_name ?? '',
    round.source_path ?? '',
  ].join('::');
}

function normalizeEvaluationModuleName(moduleName?: string | null): string {
  const normalized = String(moduleName || '').trim();
  return normalized || GLOBAL_TASK_GROUP_LABEL;
}

function evaluationModuleGroupKey(round: AppSaEvaluationRound): string {
  const normalized = String(round.module_name || '').trim();
  return normalized || GLOBAL_TASK_GROUP_KEY;
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function normalizeSessionDisplayPath(path: string): string {
  return path.replace(/^.*\/run\/sessions\//, '').replace(/^\/+/, '');
}

function resolveRoundActorSessionPath(rawPathInput: unknown, detail: AppSaTaskDetail | null, projectId: string): { fsPath: string; displayPath: string; rawPath: string } | null {
  const rawPath = String(rawPathInput || '').trim();
  if (!rawPath) return null;
  const taskRoot = detail?.output_path ? `${detail.output_path.replace(/\/+$/, '')}/${detail.task_id}` : '';
  let absolutePath = rawPath;
  if (!rawPath.startsWith('/')) {
    const relative = rawPath.replace(/^\/+/, '');
    absolutePath = relative.startsWith('run/') ? `${taskRoot}/${relative}` : `${taskRoot}/run/sessions/${relative}`;
  }
  const fsPath = extractFsRelPath(absolutePath, projectId);
  if (!fsPath) return null;
  return {
    fsPath,
    displayPath: normalizeSessionDisplayPath(rawPath),
    rawPath,
  };
}

function resolveEvaluationRoundSessionPath(round: AppSaEvaluationRound, detail: AppSaTaskDetail | null, projectId: string): { fsPath: string; displayPath: string; rawPath: string } | null {
  return resolveRoundActorSessionPath(round.worker?.session_file || round.extra?.session_file || round.session_file, detail, projectId);
}

function buildRoundSessionMeta(sessionPath: { displayPath: string; rawPath: string } | null, round: AppSaEvaluationRound | null): AppSaSessionMeta | null {
  if (!sessionPath || !round) return null;
  const sessionName = sessionPath.displayPath.split('/').pop() || sessionPath.displayPath;
  return {
    session_id: sessionName,
    session_name: sessionName,
    relative_path: sessionPath.displayPath,
    stage_group: stageLabel(round.stage),
    role_name: 'worker',
    size: 0,
    mtime: 0,
    event_count: 0,
    line_count: 0,
    is_active: round.status === 'running',
    display_name: `${stageLabel(round.stage)} · ${round.module_name || '全局任务'} · Worker`,
    warnings: [],
  };
}

function buildJudgeRoundSessionMeta(sessionPath: { displayPath: string; rawPath: string } | null, round: AppSaEvaluationRound | null, judge: Record<string, any> | null): AppSaSessionMeta | null {
  if (!sessionPath || !round || !judge) return null;
  const sessionName = sessionPath.displayPath.split('/').pop() || sessionPath.displayPath;
  return {
    session_id: sessionName,
    session_name: sessionName,
    relative_path: sessionPath.displayPath,
    stage_group: stageLabel(round.stage),
    role_name: 'judge',
    size: 0,
    mtime: 0,
    event_count: 0,
    line_count: 0,
    is_active: round.status === 'running',
    display_name: `${stageLabel(round.stage)} · ${round.module_name || '全局任务'} · ${judge.judge_id || 'Judge'}`,
    warnings: [],
  };
}

export const SystemAnalysisTaskDetailPage: React.FC<{
  projectId: string;
  taskId: string;
  onBack: () => void;
}> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<AppSaTaskDetail | null>(null);
  const hasReturnContext = hasExecutionReturnContext() || hasBinarySecurityReturnContext();
  const [result, setResult] = useState<AppSaTaskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<AppSaTaskEvaluation | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationModuleFilter, setEvaluationModuleFilter] = useState('');
  const [evaluationStageFilter, setEvaluationStageFilter] = useState('');
  const [evaluationStatusFilter, setEvaluationStatusFilter] = useState('');
  const [evaluationRoundMenu, setEvaluationRoundMenu] = useState<EvaluationRoundContextMenu | null>(null);
  const [selectedEvaluationRoundKey, setSelectedEvaluationRoundKey] = useState<string | null>(null);
  const [roundSessionSnapshot, setRoundSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [roundSessionWatchStartLine, setRoundSessionWatchStartLine] = useState(0);
  const [roundSessionEvents, setRoundSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [roundSessionWarnings, setRoundSessionWarnings] = useState<string[]>([]);
  const [roundSessionLoading, setRoundSessionLoading] = useState(false);
  const [roundSessionError, setRoundSessionError] = useState<string | null>(null);
  const [roundSessionLive, setRoundSessionLive] = useState(false);
  const roundSessionSocketRef = useRef<WebSocket | null>(null);
  const [selectedEvaluationJudgeKey, setSelectedEvaluationJudgeKey] = useState<string | null>(null);
  const [judgeSessionSnapshot, setJudgeSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [judgeSessionWatchStartLine, setJudgeSessionWatchStartLine] = useState(0);
  const [judgeSessionEvents, setJudgeSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [judgeSessionWarnings, setJudgeSessionWarnings] = useState<string[]>([]);
  const [judgeSessionLoading, setJudgeSessionLoading] = useState(false);
  const [judgeSessionError, setJudgeSessionError] = useState<string | null>(null);
  const [judgeSessionLive, setJudgeSessionLive] = useState(false);
  const judgeSessionSocketRef = useRef<WebSocket | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [repairingOrigin, setRepairingOrigin] = useState(false);
  const [originEditMode, setOriginEditMode] = useState<'binary' | 'source' | null>(null);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selection, setSelection] = useState<ResultSelection>({ type: 'report' });
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AppSaSessionMeta[]>([]);
  const [sessionIndex, setSessionIndex] = useState<AppSaSessionIndex | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [activeAgentSessionPath, setActiveAgentSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const [sessionEvents, setSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);

  const handleBack = () => {
    if (navigateBackToExecutionView()) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

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

  const loadResult = async () => {
    if (!taskId) return;
    setResultLoading(true);
    try {
      const data = await appApi.getTaskResult(taskId);
      setResult(data);
    } catch (err: any) {
      notify(`加载任务结果失败: ${err?.message || err}`, 'error');
    } finally {
      setResultLoading(false);
    }
  };

  const loadEvaluation = async () => {
    if (!taskId) return;
    setEvaluationLoading(true);
    setEvaluationError(null);
    try {
      const data = await appApi.getTaskEvaluation(taskId);
      setEvaluation(data);
    } catch (err: any) {
      const message = err?.message || String(err);
      setEvaluationError(message);
      notify(`加载观测指标失败: ${message}`, 'error');
    } finally {
      setEvaluationLoading(false);
    }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      if (sessionSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          sessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
        } catch {
          // ignore close handshake failures
        }
      }
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  const closeRoundSessionSocket = () => {
    if (roundSessionSocketRef.current) {
      if (roundSessionSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          roundSessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
        } catch {
          // ignore close handshake failures
        }
      }
      roundSessionSocketRef.current.close();
      roundSessionSocketRef.current = null;
    }
    setRoundSessionLive(false);
  };

  const closeJudgeSessionSocket = () => {
    if (judgeSessionSocketRef.current) {
      if (judgeSessionSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          judgeSessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
        } catch {
          // ignore close handshake failures
        }
      }
      judgeSessionSocketRef.current.close();
      judgeSessionSocketRef.current = null;
    }
    setJudgeSessionLive(false);
  };

  const openActiveAgentSession = (path: string) => {
    setSelectedSessionPath(path);
    setActiveAgentSessionPath(path);
  };

  const loadSessions = async (options?: { silent?: boolean }) => {
    if (!taskId) return;
    if (!options?.silent) {
      setSessionsLoading(true);
      setSessionsError(null);
    }
    try {
      const [data, index] = await Promise.all([
        appApi.listTaskSessions(taskId),
        appApi.getTaskSessionIndex(taskId).catch(() => null),
      ]);
      setSessions(data);
      setSessionIndex(index);
      setSessionsError(null);
      setSelectedSessionPath((current) => {
        if (current && data.some((item) => item.relative_path === current)) {
          return current;
        }
        const active = data.find((item) => item.is_active);
        return active?.relative_path || data[0]?.relative_path || null;
      });
    } catch (err: any) {
      setSessionsError(err?.message || String(err));
    } finally {
      if (!options?.silent) {
        setSessionsLoading(false);
      }
    }
  };

  const loadSessionFile = async (path: string) => {
    if (!taskId || !path) return;
    setSessionLoading(true);
    setSessionError(null);
    try {
      const snapshot = await appApi.getTaskSessionFile(taskId, path);
      setSessionSnapshot(snapshot);
      setSessionWatchStartLine(snapshot.line_count || 0);
      setSessionEvents(snapshot.events || []);
      setSessionWarnings(snapshot.warnings || []);
    } catch (err: any) {
      setSessionSnapshot(null);
      setSessionWatchStartLine(0);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionError(err?.message || String(err));
    } finally {
      setSessionLoading(false);
    }
  };

  const loadRoundSessionFile = async (fsPath: string, displayPath: string) => {
    setRoundSessionLoading(true);
    setRoundSessionError(null);
    setRoundSessionSnapshot(null);
    setRoundSessionWatchStartLine(0);
    setRoundSessionEvents([]);
    setRoundSessionWarnings([]);
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, fsPath);
      const content = await blobToText(blob);
      const snapshot = buildSessionSnapshotFromText(displayPath, content);
      setRoundSessionSnapshot(snapshot);
      setRoundSessionWatchStartLine(snapshot.line_count || 0);
      setRoundSessionEvents(snapshot.events || []);
      setRoundSessionWarnings(snapshot.warnings || []);
    } catch (err: any) {
      setRoundSessionSnapshot(null);
      setRoundSessionWatchStartLine(0);
      setRoundSessionEvents([]);
      setRoundSessionWarnings([]);
      setRoundSessionError(err?.message || String(err));
    } finally {
      setRoundSessionLoading(false);
    }
  };

  const loadJudgeSessionFile = async (fsPath: string, displayPath: string) => {
    setJudgeSessionLoading(true);
    setJudgeSessionError(null);
    setJudgeSessionSnapshot(null);
    setJudgeSessionWatchStartLine(0);
    setJudgeSessionEvents([]);
    setJudgeSessionWarnings([]);
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, fsPath);
      const content = await blobToText(blob);
      const snapshot = buildSessionSnapshotFromText(displayPath, content);
      setJudgeSessionSnapshot(snapshot);
      setJudgeSessionWatchStartLine(snapshot.line_count || 0);
      setJudgeSessionEvents(snapshot.events || []);
      setJudgeSessionWarnings(snapshot.warnings || []);
    } catch (err: any) {
      setJudgeSessionError(err?.message || String(err));
    } finally {
      setJudgeSessionLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [taskId]);

  useEffect(() => () => {
    closeSessionSocket();
    closeRoundSessionSocket();
    closeJudgeSessionSocket();
  }, []);

  useEffect(() => {
    if (!detail || !['running', 'pending'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);

  useEffect(() => {
    if (!detail || !['running', 'pending'].includes(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);

  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detail?.stages_json?.events?.length, logsExpanded]);

  useEffect(() => {
    if (activeTab !== 'result') return;
    void loadResult();
  }, [activeTab, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || !detail || detail.status === 'pending' || resultLoading || result) return;
    void loadResult();
  }, [activeTab, detail, result, resultLoading]);

  useEffect(() => {
    if (activeTab !== 'evaluation') return;
    void loadEvaluation();
  }, [activeTab, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || !detail || ['pending', 'running'].includes(detail.status) || evaluationLoading || evaluation) return;
    void loadEvaluation();
  }, [activeTab, detail, evaluation, evaluationLoading]);

  useEffect(() => {
    setSelectedEvaluationRoundKey(null);
    setRoundSessionSnapshot(null);
    setRoundSessionEvents([]);
    setRoundSessionWarnings([]);
    setRoundSessionError(null);
    closeRoundSessionSocket();
    closeJudgeSessionSocket();
  }, [taskId]);

  useEffect(() => {
    if (activeTab !== 'evaluation') {
      closeRoundSessionSocket();
      closeJudgeSessionSocket();
      setEvaluationRoundMenu(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!evaluationRoundMenu) return;
    const closeMenu = () => setEvaluationRoundMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [evaluationRoundMenu]);

  useEffect(() => {
    if (activeTab !== 'session' && activeTab !== 'overview' && activeTab !== 'relationship' && !activeAgentSessionPath) {
      closeSessionSocket();
      return;
    }
    void loadSessions();
  }, [activeTab, taskId, activeAgentSessionPath]);

  useEffect(() => {
    if (activeTab !== 'session' && activeTab !== 'overview' && activeTab !== 'relationship' && !activeAgentSessionPath) return;
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadSessions({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId, activeAgentSessionPath]);

  useEffect(() => {
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath) {
      if (!sessionViewerActive) {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
        setSessionError(null);
      }
      return;
    }
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, selectedSessionPath, taskId, activeAgentSessionPath]);

  useEffect(() => {
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath || !sessionSnapshot) return;
    if (!['pending', 'running'].includes(detail?.status || '')) {
      setSessionLive(false);
      return;
    }
    if (!detail?.output_path) {
      setSessionLive(false);
      setSessionError('当前任务缺少输出路径，无法建立实时监听');
      return;
    }
    const sessionAbsPath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(sessionAbsPath, projectId);
    if (!watchPath) {
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: sessionWatchStartLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => {
      setSessionLive(['pending', 'running'].includes(detail?.status || ''));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot') {
          setSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          const parsed = parseAgentSessionJsonlDelta(deltaLines, (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length > 0) {
            setSessionEvents((current) => current.concat(parsed.events));
          }
          if (parsed.warnings.length > 0) {
            setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          if (parsed.sessionMeta) {
            setSessionSnapshot((current) => current ? {
              ...current,
              session_meta: {
                ...(current.session_meta || {}),
                ...parsed.sessionMeta,
              },
              line_count: message.to_line ?? current.line_count,
            } : current);
          } else {
            setSessionSnapshot((current) => current ? { ...current, line_count: message.to_line ?? current.line_count } : current);
          }
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setSessionLive(false);
            setSessionError('会话文件已重置，正在重新加载');
            void loadSessionFile(selectedSessionPath);
            return;
          }
          if (message.event === 'deleted') {
            setSessionLive(false);
            setSessionError('会话文件已删除');
            closeSessionSocket();
          }
          return;
        }
        if (message.type === 'error') {
          setSessionLive(false);
          setSessionError(message.message || '会话订阅失败');
        }
      } catch (err: any) {
        setSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => {
      setSessionLive(false);
    };
    socket.onclose = () => {
      setSessionLive(false);
    };
    return () => {
      if (sessionSocketRef.current === socket) {
        closeSessionSocket();
      } else {
        socket.close();
      }
    };
  }, [activeTab, selectedSessionPath, sessionSnapshot?.path, sessionWatchStartLine, taskId, detail?.status, detail?.output_path, detail?.task_id, projectId, activeAgentSessionPath]);

  useEffect(() => {
    if (!result) return;
    if (selection.type === 'report') return;
    if (!result.modules.some((item) => item.module_name === selection.moduleName)) {
      setSelection({ type: 'report' });
    }
  }, [result, selection]);

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
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${detail.task_name}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(detail.task_id, true);
      notify('任务已删除', 'success');
      handleBack();
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
      if (activeTab === 'result') await loadResult();
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
      if (activeTab === 'result') await loadResult();
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const handleRepairOrigin = async () => {
    if (!detail || !originEditMode) return;
    setRepairingOrigin(true);
    try {
      const updated = await appApi.repairTaskOrigin(detail.task_id, originEditMode);
      setDetail(updated);
      notify(`来源信息已切换为${originEditMode === 'source' ? '源码模式' : '二进制模式'}`, 'success');
      setOriginEditMode(null);
    } catch (err: any) {
      notify(`来源信息修复失败: ${err?.message || err}`, 'error');
    } finally {
      setRepairingOrigin(false);
    }
  };

  const stageStatuses = detail
    ? deriveStepStatuses(detail.status, detail.stages_json?.events ?? [])
    : STAGE_STEPS.map((): StepStatus => 'pending');
  const stageTimes = detail
    ? computeStageTimes(detail.stages_json?.events ?? [])
    : STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  const logLines = detail?.stages_json?.events?.map(formatEventLog) ?? [];
  const selectedModule = useMemo<AppSaResultModule | null>(() => {
    if (!result || selection.type !== 'module') return null;
    return result.modules.find((item) => item.module_name === selection.moduleName) || null;
  }, [result, selection]);
  const selectedMarkdown = selection.type === 'report'
    ? result?.final_report_markdown || ''
    : selectedModule?.module_report_markdown || '';
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const resultAvailable = Boolean(result?.available);
  const moduleCount = result?.summary.module_count || result?.modules.length || 0;
  const highRiskCount = result?.summary.high_risk_module_count || result?.modules.filter((item) => item.risk_level === '高').length || 0;
  const analysisModeInfo = detail ? getAnalysisModeInfo(detail) : null;
  const canRepairOrigin = Boolean(
    detail &&
    !['pending', 'running'].includes(detail.status) &&
    String(detail.task_origin_type || 'manual').trim() === 'manual',
  );
  const effectiveOriginEditMode = originEditMode || analysisModeInfo?.mode || 'binary';
  const selectedSession = useMemo(
    () => sessions.find((item) => item.relative_path === selectedSessionPath) || null,
    [sessions, selectedSessionPath],
  );
  const groupedSessions = useMemo(() => {
    const map = new Map<string, AppSaSessionMeta[]>();
    for (const session of sessions) {
      const list = map.get(session.stage_group) || [];
      list.push(session);
      map.set(session.stage_group, list);
    }
    return Array.from(map.entries());
  }, [sessions]);
  const activeSessions = useMemo(
    () => sessions.filter((item) => item.is_active),
    [sessions],
  );
  const activeAgentSessionMeta = useMemo(
    () => sessions.find((item) => item.relative_path === activeAgentSessionPath) || null,
    [sessions, activeAgentSessionPath],
  );
  const overviewStageMetrics = useMemo(
    () => buildOverviewStageMetrics(detail, result, evaluation),
    [detail, evaluation, result],
  );
  const evaluationRounds = evaluation?.rounds || [];
  const evaluationStages = useMemo(
    () => Array.from(new Set(evaluationRounds.map((item) => item.stage).filter(Boolean) as string[])).sort(),
    [evaluationRounds],
  );
  const evaluationStatuses = useMemo(
    () => Array.from(new Set(evaluationRounds.map((item) => item.status).filter(Boolean) as string[])).sort(),
    [evaluationRounds],
  );
  const filteredEvaluationRounds = useMemo(() => {
    const keyword = evaluationModuleFilter.trim().toLowerCase();
    return evaluationRounds.filter((round) => {
      const moduleName = normalizeEvaluationModuleName(round.module_name).toLowerCase();
      const stage = String(round.stage || '');
      const status = String(round.status || '');
      if (keyword && !moduleName.includes(keyword)) return false;
      if (evaluationStageFilter && stage !== evaluationStageFilter) return false;
      if (evaluationStatusFilter && status !== evaluationStatusFilter) return false;
      return true;
    });
  }, [evaluationModuleFilter, evaluationRounds, evaluationStageFilter, evaluationStatusFilter]);
  const groupedEvaluationRounds = useMemo<GroupedEvaluationRounds[]>(() => {
    const grouped = new Map<string, GroupedEvaluationRounds>();
    const sortedRounds = [...filteredEvaluationRounds].sort((left, right) => {
      const roundCompare = compareNullableNumber(
        Number.isFinite(Number(left.round)) ? Number(left.round) : null,
        Number.isFinite(Number(right.round)) ? Number(right.round) : null,
      );
      if (roundCompare !== 0) return roundCompare;
      const stageRoundCompare = compareNullableNumber(
        Number.isFinite(Number(left.stage_round)) ? Number(left.stage_round) : null,
        Number.isFinite(Number(right.stage_round)) ? Number(right.stage_round) : null,
      );
      if (stageRoundCompare !== 0) return stageRoundCompare;
      const startedAtCompare = String(left.started_at || '').localeCompare(String(right.started_at || ''), 'zh-CN');
      if (startedAtCompare !== 0) return startedAtCompare;
      return evaluationRoundKey(left).localeCompare(evaluationRoundKey(right), 'zh-CN');
    });

    for (const round of sortedRounds) {
      const groupKey = evaluationModuleGroupKey(round);
      const displayName = normalizeEvaluationModuleName(round.module_name);
      const normalizedRound = Number.isFinite(Number(round.round)) ? Number(round.round) : null;
      const normalizedStageRound = Number.isFinite(Number(round.stage_round)) ? Number(round.stage_round) : null;
      const current = grouped.get(groupKey);
      if (!current) {
        grouped.set(groupKey, {
          groupKey,
          displayName,
          firstRound: normalizedRound,
          firstStageRound: normalizedStageRound,
          latestStatus: String(round.status || ''),
          rounds: [round],
        });
        continue;
      }
      current.rounds.push(round);
      if (compareNullableNumber(normalizedRound, current.firstRound) < 0) {
        current.firstRound = normalizedRound;
        current.firstStageRound = normalizedStageRound;
      } else if (normalizedRound === current.firstRound && compareNullableNumber(normalizedStageRound, current.firstStageRound) < 0) {
        current.firstStageRound = normalizedStageRound;
      }
      current.latestStatus = String(round.status || current.latestStatus || '');
    }

    return Array.from(grouped.values()).sort((left, right) => {
      const firstRoundCompare = compareNullableNumber(left.firstRound, right.firstRound);
      if (firstRoundCompare !== 0) return firstRoundCompare;
      const firstStageRoundCompare = compareNullableNumber(left.firstStageRound, right.firstStageRound);
      if (firstStageRoundCompare !== 0) return firstStageRoundCompare;
      return left.displayName.localeCompare(right.displayName, 'zh-CN');
    });
  }, [filteredEvaluationRounds]);
  const averageJudgeScore = useMemo(() => {
    const scores = evaluationRounds
      .map((item) => Number(item.metrics?.avg_judge_score))
      .filter((item) => Number.isFinite(item));
    if (!scores.length) return null;
    return scores.reduce((sum, item) => sum + item, 0) / scores.length;
  }, [evaluationRounds]);
  const selectedEvaluationRound = useMemo<AppSaEvaluationRound | null>(
    () => evaluationRounds.find((item) => evaluationRoundKey(item) === selectedEvaluationRoundKey) || null,
    [evaluationRounds, selectedEvaluationRoundKey],
  );
  const selectedEvaluationSessionPath = useMemo(
    () => selectedEvaluationRound ? resolveEvaluationRoundSessionPath(selectedEvaluationRound, detail, projectId) : null,
    [detail, projectId, selectedEvaluationRound],
  );
  const selectedEvaluationSessionMeta = useMemo(
    () => buildRoundSessionMeta(selectedEvaluationSessionPath, selectedEvaluationRound),
    [selectedEvaluationRound, selectedEvaluationSessionPath],
  );
  const selectedEvaluationJudge = useMemo<Record<string, any> | null>(
    () => (selectedEvaluationRound?.judges || []).find((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey) || null,
    [selectedEvaluationJudgeKey, selectedEvaluationRound],
  );
  const selectedEvaluationJudgeSessionPath = useMemo(
    () => selectedEvaluationJudge ? resolveRoundActorSessionPath(selectedEvaluationJudge.session_file, detail, projectId) : null,
    [detail, projectId, selectedEvaluationJudge],
  );
  const selectedEvaluationJudgeSessionMeta = useMemo(
    () => buildJudgeRoundSessionMeta(selectedEvaluationJudgeSessionPath, selectedEvaluationRound, selectedEvaluationJudge),
    [selectedEvaluationJudge, selectedEvaluationJudgeSessionPath, selectedEvaluationRound],
  );

  const openEvaluationRoundMenu = (event: React.MouseEvent, round: AppSaEvaluationRound) => {
    const moduleName = normalizeEvaluationModuleName(round.module_name);
    event.preventDefault();
    event.stopPropagation();
    setEvaluationRoundMenu({
      roundKey: evaluationRoundKey(round),
      moduleName,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleFilterSingleModule = () => {
    const currentFilter = evaluationModuleFilter.trim();
    if (!evaluationRoundMenu?.moduleName && !currentFilter) return;
    if (currentFilter) {
      setEvaluationModuleFilter('');
      setEvaluationRoundMenu(null);
      return;
    }
    setEvaluationModuleFilter(evaluationRoundMenu.moduleName);
    setEvaluationRoundMenu(null);
  };

  useEffect(() => {
    if (!selectedEvaluationRoundKey) return;
    if (!selectedEvaluationRound) {
      setSelectedEvaluationRoundKey(null);
    }
  }, [selectedEvaluationRound, selectedEvaluationRoundKey]);

  useEffect(() => {
    const judges = selectedEvaluationRound?.judges || [];
    const currentValid = judges.some((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey);
    if (currentValid) return;
    const firstWithSession = judges.find((item) => Boolean(String(item?.session_file || '').trim()));
    setSelectedEvaluationJudgeKey(firstWithSession ? `${firstWithSession.judge_id || 0}::${firstWithSession.model || ''}` : null);
  }, [selectedEvaluationJudgeKey, selectedEvaluationRound]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationRound || !selectedEvaluationSessionPath) {
      if (activeTab === 'evaluation' && selectedEvaluationRound && !selectedEvaluationSessionPath) {
        setRoundSessionSnapshot(null);
        setRoundSessionEvents([]);
        setRoundSessionWarnings([]);
        setRoundSessionError('本轮未记录可读取的 Worker 会话文件');
      }
      closeRoundSessionSocket();
      return;
    }
    closeRoundSessionSocket();
    void loadRoundSessionFile(selectedEvaluationSessionPath.fsPath, selectedEvaluationSessionPath.displayPath);
  }, [activeTab, selectedEvaluationRoundKey, selectedEvaluationSessionPath?.fsPath]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationRound || !selectedEvaluationSessionPath || !roundSessionSnapshot) return;
    if (!['pending', 'running'].includes(detail?.status || '')) {
      setRoundSessionLive(false);
      return;
    }
    closeRoundSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, selectedEvaluationSessionPath.fsPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: roundSessionWatchStartLine,
    });
    roundSessionSocketRef.current = socket;
    socket.onopen = () => setRoundSessionLive(true);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot') {
          setRoundSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          const parsed = parseSessionJsonlDelta(deltaLines, (message.from_line ?? roundSessionWatchStartLine) + 1);
          if (parsed.events.length > 0) {
            setRoundSessionEvents((current) => current.concat(parsed.events));
          }
          if (parsed.warnings.length > 0) {
            setRoundSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          setRoundSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setRoundSessionWatchStartLine(message.to_line ?? roundSessionWatchStartLine);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setRoundSessionLive(false);
            setRoundSessionError('会话文件已重置，正在重新加载');
            void loadRoundSessionFile(selectedEvaluationSessionPath.fsPath, selectedEvaluationSessionPath.displayPath);
            return;
          }
          if (message.event === 'deleted') {
            setRoundSessionLive(false);
            setRoundSessionError('会话文件已删除');
            closeRoundSessionSocket();
          }
          return;
        }
        if (message.type === 'error') {
          setRoundSessionLive(false);
          setRoundSessionError(message.message || '会话订阅失败');
        }
      } catch (err: any) {
        setRoundSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setRoundSessionLive(false);
    socket.onclose = () => setRoundSessionLive(false);
    return () => {
      if (roundSessionSocketRef.current === socket) {
        closeRoundSessionSocket();
      } else {
        socket.close();
      }
    };
  }, [
    activeTab,
    selectedEvaluationRoundKey,
    selectedEvaluationSessionPath?.fsPath,
    roundSessionSnapshot?.path,
    roundSessionWatchStartLine,
    detail?.status,
    projectId,
  ]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath) {
      if (activeTab === 'evaluation' && selectedEvaluationJudge && !selectedEvaluationJudgeSessionPath) {
        setJudgeSessionSnapshot(null);
        setJudgeSessionEvents([]);
        setJudgeSessionWarnings([]);
        setJudgeSessionError('该 Judge 未记录可读取的会话文件');
      }
      closeJudgeSessionSocket();
      return;
    }
    closeJudgeSessionSocket();
    void loadJudgeSessionFile(selectedEvaluationJudgeSessionPath.fsPath, selectedEvaluationJudgeSessionPath.displayPath);
  }, [activeTab, selectedEvaluationJudgeKey, selectedEvaluationJudgeSessionPath?.fsPath]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath || !judgeSessionSnapshot) return;
    if (!['pending', 'running'].includes(detail?.status || '')) {
      setJudgeSessionLive(false);
      return;
    }
    closeJudgeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, selectedEvaluationJudgeSessionPath.fsPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: judgeSessionWatchStartLine,
    });
    judgeSessionSocketRef.current = socket;
    socket.onopen = () => setJudgeSessionLive(true);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot') {
          setJudgeSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          const parsed = parseSessionJsonlDelta(deltaLines, (message.from_line ?? judgeSessionWatchStartLine) + 1);
          if (parsed.events.length > 0) setJudgeSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length > 0) setJudgeSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          setJudgeSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setJudgeSessionWatchStartLine(message.to_line ?? judgeSessionWatchStartLine);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setJudgeSessionLive(false);
            setJudgeSessionError('Judge 会话文件已重置，正在重新加载');
            void loadJudgeSessionFile(selectedEvaluationJudgeSessionPath.fsPath, selectedEvaluationJudgeSessionPath.displayPath);
            return;
          }
          if (message.event === 'deleted') {
            setJudgeSessionLive(false);
            setJudgeSessionError('Judge 会话文件已删除');
            closeJudgeSessionSocket();
          }
          return;
        }
        if (message.type === 'error') {
          setJudgeSessionLive(false);
          setJudgeSessionError(message.message || 'Judge 会话订阅失败');
        }
      } catch (err: any) {
        setJudgeSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setJudgeSessionLive(false);
    socket.onclose = () => setJudgeSessionLive(false);
    return () => {
      if (judgeSessionSocketRef.current === socket) closeJudgeSessionSocket();
      else socket.close();
    };
  }, [
    activeTab,
    selectedEvaluationJudgeKey,
    selectedEvaluationJudgeSessionPath?.fsPath,
    judgeSessionSnapshot?.path,
    judgeSessionWatchStartLine,
    detail?.status,
    projectId,
  ]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      {detail ? (
        <SystemAnalysisTaskFormModal
          projectId={projectId}
          isOpen={cloneModalOpen}
          title="复制任务"
          submitLabel="创建复制任务"
          initialForm={buildCloneFormFromTask(detail, projectId)}
          loadProjectDefaultsOnOpen={false}
          onClose={() => setCloneModalOpen(false)}
          onCreated={async (task) => {
            notify(`复制任务创建成功: ${task.task_id}`, 'success');
            setCloneModalOpen(false);
          }}
          onError={(message) => notify(message, 'error')}
        />
      ) : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              {hasReturnContext ? '返回原任务' : '返回任务列表'}
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{detail?.task_name || '任务详情'}</h1>
              {detail ? (
                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              ) : null}
              {analysisModeInfo ? (
                <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${analysisModeInfo.className}`}>
                  {analysisModeInfo.label}
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
            {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="system_analysis" task={detail} /> : null}
            {detail ? (
              <button
                onClick={() => setCloneModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
              >
                <ClipboardCopy size={13} />
                复制任务
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
            <button onClick={() => {
              void loadDetail();
              if (activeTab === 'result') void loadResult();
              if (activeTab === 'evaluation') void loadEvaluation();
            }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="刷新">
              <RefreshCw size={14} className={loading || resultLoading || evaluationLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {detail ? (
          <div className="mt-5">
            <TaskOriginCard
              origin={detail}
              actions={canRepairOrigin ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                    {([
                      { value: 'binary' as const, label: '二进制模式' },
                      { value: 'source' as const, label: '源码模式' },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setOriginEditMode(option.value)}
                        disabled={repairingOrigin}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          effectiveOriginEditMode === option.value
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRepairOrigin()}
                    disabled={repairingOrigin || effectiveOriginEditMode === (analysisModeInfo?.mode || 'binary')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {repairingOrigin ? <Loader2 size={13} className="animate-spin" /> : null}
                    修复来源
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-slate-400">
                  {String(detail.task_origin_type || 'manual').trim() !== 'manual'
                    ? '仅手动任务支持切换'
                    : '仅非运行态可切换'}
                </span>
              )}
            />
          </div>
        ) : null}
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
          <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'overview' as DetailTab, label: '总览' },
                  { id: 'run-config' as DetailTab, label: '任务配置' },
                  { id: 'session' as DetailTab, label: '智能体会话' },
                  { id: 'relationship' as DetailTab, label: '智能体关系' },
                  { id: 'result' as DetailTab, label: '结果' },
                  { id: 'evaluation' as DetailTab, label: '观测指标' },
                ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === 'overview' ? (
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
                    <InfoRow label="耗时" value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
                  <div className="mt-4 space-y-3">
                    {STAGE_STEPS.map((step, i) => {
                      const st = stageStatuses[i];
                      const timing = stageTimes[i];
                      const metrics = overviewStageMetrics[step.key] || [];
                      const timingStr = st === 'completed' || st === 'failed'
                        ? formatTsDuration(timing.startTs, timing.endTs)
                        : st === 'running' && timing.startTs
                          ? formatTsDuration(timing.startTs, clockNow)
                          : '';
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
                              {st === 'completed' && metrics.length > 0 ? (
                                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[10px] font-black tracking-[0.12em] text-slate-400">
                                    {metrics.map((item) => item.label).join(' / ')}
                                  </div>
                                  <div className="mt-1 text-sm font-bold text-slate-900">
                                    {metrics.map((item) => item.value).join(' / ')}
                                  </div>
                                </div>
                              ) : null}
                              {artifactFsPath && st !== 'pending' ? (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <button
                                    onClick={() => openInFileExplorer(artifactFsPath)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50"
                                  >
                                    <FolderOpen size={11} />
                                    打开阶段输出
                                  </button>
                                  <button
                                    onClick={() => { if (artifactFull) void navigator.clipboard.writeText(artifactFull); }}
                                    title="复制容器路径"
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                                  >
                                    <ClipboardCopy size={10} />
                                    复制路径
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">当前运行智能体</h2>
                    <p className="mt-1 text-xs text-slate-400">展示当前任务仍处于活跃状态的智能体会话与角色。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {activeSessions.length} 个活跃会话
                  </span>
                </div>
                {sessionsLoading && sessions.length === 0 ? (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    <Loader2 size={15} className="animate-spin" />
                    加载智能体状态中...
                  </div>
                ) : activeSessions.length > 0 ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="divide-y divide-slate-200 bg-white">
                      {activeSessions.map((session) => (
                        <button
                          key={session.relative_path}
                          type="button"
                          onClick={() => openActiveAgentSession(session.relative_path)}
                          className="w-full px-4 py-4 text-left transition hover:bg-slate-50"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-black text-slate-900">{session.display_name}</div>
                              <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{session.relative_path}</div>
                              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                                <span>分组 {session.stage_group || '-'}</span>
                                <span>事件 {session.event_count}</span>
                                <span>更新时间 {formatSessionMtime(session.mtime)}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${sessionRoleTone(session.role_name)}`}>
                                {sessionRoleLabel(session.role_name)}
                              </span>
                              <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                活跃
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {detail.status === 'pending'
                      ? '任务尚未启动，当前没有活跃智能体。'
                      : ['running', 'pending'].includes(detail.status)
                        ? '当前没有检测到活跃智能体会话。'
                        : '任务已结束，当前没有活跃智能体。'}
                  </div>
                )}
              </section>

              {detail.abnormal_reason ? <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} /> : null}

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
            </>
          ) : activeTab === 'run-config' ? (
            <SystemAnalysisTaskConfigPanel detail={detail} />
          ) : activeTab === 'session' ? (
            <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div>
                    <div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSessions()}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    title="刷新会话"
                  >
                    <RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {sessionsError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {sessionsError}
                  </div>
                ) : null}

                <WarningListPanel
                  title="索引生成提示"
                  items={sessionIndex?.warnings?.slice(0, 5) || []}
                  className="mt-4 text-xs"
                />

                {sessionsLoading && sessions.length === 0 ? (
                  <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    加载会话中...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    当前任务暂无智能体会话文件
                  </div>
                ) : (
                  <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
                    {groupedSessions.map(([group, items]) => (
                      <div key={group}>
                        <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {sessionGroupLabel(group)}
                        </div>
                        <div className="space-y-2">
                          {items.map((session) => {
                            const selected = session.relative_path === selectedSessionPath;
                            return (
                              <button
                                key={session.relative_path}
                                type="button"
                                onClick={() => setSelectedSessionPath(session.relative_path)}
                                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                  selected
                                    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-black">{session.display_name}</div>
                                    <div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                      {session.relative_path}
                                    </div>
                                  </div>
                                  <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    session.is_active
                                      ? selected
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : selected
                                        ? 'border-slate-500 bg-slate-800 text-slate-100'
                                        : 'border-slate-200 bg-white text-slate-500'
                                  }`}>
                                    {session.is_active ? '活跃' : '历史'}
                                  </span>
                                </div>
                                <div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                  <span>事件 {session.event_count}</span>
                                  <span>更新时间 {formatSessionMtime(session.mtime)}</span>
                                </div>
                                {session.warnings.length > 0 ? (
                                  <div className={`mt-2 text-[11px] ${selected ? 'text-amber-200' : 'text-amber-700'}`}>
                                    {session.warnings[0]}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </aside>

              <div className="space-y-4">
                <AgentSessionWarningPanel warnings={sessionWarnings} />

                <AgentSessionViewer
                  sessionMeta={selectedSession}
                  sessionHeader={sessionSnapshot?.session_meta}
                  events={sessionEvents}
                  loading={sessionLoading}
                  live={sessionLive}
                  error={sessionError}
                />
              </div>
            </section>
          ) : activeTab === 'relationship' ? (
            <section className="space-y-4">
              <WarningListPanel title="索引生成提示" items={sessionIndex?.warnings?.slice(0, 5) || []} />

              <AgentSessionWarningPanel warnings={sessionWarnings} />

              <SessionRelationshipGraph
                index={sessionIndex}
                selectedPath={selectedSessionPath}
                onSelect={setSelectedSessionPath}
                sessionPreview={{
                  path: selectedSessionPath,
                  sessionMeta: selectedSession,
                  sessionHeader: sessionSnapshot?.session_meta,
                  events: sessionEvents,
                  loading: sessionLoading,
                  live: sessionLive,
                  error: sessionError,
                }}
              />
            </section>
          ) : activeTab === 'result' ? (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-6">
                <MetricCard label="模块数" value={moduleCount} icon={<ScrollText size={18} />} />
                <MetricCard label="高风险模块" value={highRiskCount} icon={<ShieldAlert size={18} />} />
                <MetricCard label="总文件数" value={result?.summary.total_file_count ?? 0} icon={<FolderOpen size={18} />} />
                <MetricCard label="威胁总数" value={result?.summary.threat_count ?? 0} icon={<AlertTriangle size={18} />} />
                <MetricCard label="报告来源" value={result?.report_generation_label || '-'} icon={<ScrollText size={18} />} />
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div>
                  <div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!resultRootFsPath}
                      onClick={() => { if (resultRootFsPath) openInFileExplorer(resultRootFsPath); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderOpen size={11} />
                      打开目录
                    </button>
                    <button
                      type="button"
                      disabled={!result?.output_root}
                      onClick={() => { if (result?.output_root) void navigator.clipboard.writeText(result.output_root); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ClipboardCopy size={10} />
                      复制路径
                    </button>
                  </div>
                </div>
              </div>

              {resultLoading ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    加载结果中...
                  </div>
                </section>
              ) : !result ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">
                  暂无结果数据
                </section>
              ) : !resultAvailable ? (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <ScrollText size={20} />
                  </div>
                  <div className="mt-4 text-base font-bold text-slate-800">任务完成后可查看结果</div>
                  <div className="mt-2 text-sm text-slate-500">当前状态：{STATUS_LABEL[result.status] || result.status}</div>
                </section>
              ) : (
                <>
                  <WarningListPanel
                    title="结果存在部分缺失，以下内容已按可用文件展示"
                    items={result.warnings}
                  />

                  <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
                    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div>
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelection({ type: 'report' })}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selection.type === 'report'
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <div className="text-sm font-black">总报告</div>
                          <div className={`mt-1 text-xs ${selection.type === 'report' ? 'text-slate-200' : 'text-slate-500'}`}>完整渲染 final_report.md</div>
                        </button>

                        {result.modules.map((module) => {
                          const selected = selection.type === 'module' && selection.moduleName === module.module_name;
                          return (
                            <button
                              key={module.module_name}
                              type="button"
                              onClick={() => setSelection({ type: 'module', moduleName: module.module_name })}
                              className={`w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
                                selected
                                  ? 'border-slate-900 bg-white text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.12)]'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">#{module.rank}</div>
                                  <div className="mt-1 truncate text-sm font-black">{module.module_name}</div>
                                </div>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${riskTone(module.risk_level)}`}>
                                  {module.risk_level || '未知'}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span>分数 {module.risk_score ?? '-'}</span>
                                <span>文件 {module.file_count}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {selection.type === 'report' ? '最终结果' : '模块报告'}
                          </div>
                          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                            {selection.type === 'report' ? '总报告' : selectedModule?.module_name || '模块报告'}
                          </h2>
                        </div>
                        {selection.type === 'module' && selectedModule ? (
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${riskTone(selectedModule.risk_level)}`}>
                              风险等级：{selectedModule.risk_level || '未知'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                              风险分数：{selectedModule.risk_score ?? '-'}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">
                        {selectedMarkdown ? (
                          <MarkdownContent content={selectedMarkdown} />
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                            当前结果缺少可展示内容
                          </div>
                        )}
                      </div>
                    </main>

                    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {selection.type === 'report' ? '结果说明' : '模块辅助信息'}
                      </div>

                      {selection.type === 'report' ? (
                        <div className="mt-3 space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-bold text-slate-700">模块排序</div>
                            <div className="mt-2 space-y-2">
                              {result.modules.map((module) => (
                                <div key={module.module_name} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                                  <span className="font-mono">#{module.rank}</span>
                                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{module.module_name}</span>
                                  <span className={`rounded-full border px-2 py-0.5 font-bold ${riskTone(module.risk_level)}`}>{module.risk_level || '未知'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={!result.final_report_path}
                              onClick={() => {
                                const fsPath = result.final_report_path ? extractFsRelPath(result.final_report_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开总报告文件
                            </button>
                            <button
                              type="button"
                              disabled={!result.modules_list_path}
                              onClick={() => {
                                const fsPath = result.modules_list_path ? extractFsRelPath(result.modules_list_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开 modules.list
                            </button>
                          </div>
                        </div>
                      ) : selectedModule ? (
                        <div className="mt-3 space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold text-slate-700">文件列表</div>
                                <div className="mt-1 text-[11px] text-slate-500">{selectedModule.file_count} 个文件</div>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600">#{selectedModule.rank}</span>
                            </div>
                            <div className="mt-3 max-h-[380px] space-y-2 overflow-auto pr-1">
                              {selectedModule.files.length > 0 ? selectedModule.files.map((file) => (
                                <div key={file} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
                                  {file}
                                </div>
                              )) : (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
                                  没有 files.list 内容
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-bold text-slate-700">报告结构</div>
                            <div className="mt-2 space-y-2">
                              {selectedModule.report_sections.length > 0 ? selectedModule.report_sections.map((section) => (
                                <div key={section.anchor} className="text-xs text-slate-600">
                                  <span className="mr-2 font-mono text-slate-400">H{section.level}</span>
                                  {section.title}
                                </div>
                              )) : (
                                <div className="text-xs text-slate-400">没有可解析的小节标题</div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={!selectedModule.module_dir_path}
                              onClick={() => {
                                const fsPath = selectedModule.module_dir_path ? extractFsRelPath(selectedModule.module_dir_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开模块目录
                            </button>
                            <button
                              type="button"
                              disabled={!selectedModule.module_report_path}
                              onClick={() => {
                                const fsPath = selectedModule.module_report_path ? extractFsRelPath(selectedModule.module_report_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开报告文件
                            </button>
                            <button
                              type="button"
                              disabled={!selectedModule.files_list_path}
                              onClick={() => {
                                const fsPath = selectedModule.files_list_path ? extractFsRelPath(selectedModule.files_list_path, projectId) : null;
                                if (fsPath) openInFileExplorer(fsPath);
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FolderOpen size={13} />
                              打开 files.list
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </aside>
                  </section>
                </>
              )}
            </section>
          ) : (
            <section className="space-y-4">
              {evaluationLoading ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    加载观测指标中...
                  </div>
                </section>
              ) : evaluationError ? (
                <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 shadow-sm">
                  {evaluationError}
                </section>
              ) : !evaluation || !evaluation.available ? (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <BarChart3 size={20} />
                  </div>
                  <div className="mt-4 text-base font-bold text-slate-800">当前任务尚未生成观测指标</div>
                  <div className="mt-2 text-sm text-slate-500">任务至少完成一个 Worker/Judge 轮次后会出现观测数据。</div>
                </section>
              ) : (
                <>
                  <WarningListPanel title="部分观测文件读取异常" items={evaluation.warnings} />

                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="模块总数" value={formatNumber(evaluation.summary?.module_count)} icon={<ScrollText size={18} />} />
                    <MetricCard label="完成模块" value={formatNumber(evaluation.summary?.completed_module_count)} icon={<CheckCircle2 size={18} />} />
                    <MetricCard label="失败模块" value={formatNumber(evaluation.summary?.failed_module_count)} icon={<XCircle size={18} />} />
                    <MetricCard label="总轮数" value={formatNumber(evaluation.summary?.round_count ?? evaluation.rounds.length)} icon={<BarChart3 size={18} />} />
                    <MetricCard label="总 Token" value={formatNumber(evaluation.summary?.total_tokens)} icon={<ScrollText size={18} />} />
                    <MetricCard label="实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ShieldAlert size={18} />} />
                    <MetricCard label="平均 Judge 分" value={averageJudgeScore == null ? '-' : formatNumber(averageJudgeScore, 1)} icon={<BarChart3 size={18} />} />
                    <MetricCard label="最终通过率" value={formatRate(evaluation.summary?.effectiveness?.final_module_pass_rate)} icon={<CheckCircle2 size={18} />} />
                  </section>

                  {evaluation.summary?.final_check_disabled ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Stage 4a 已关闭</h2>
                          <p className="mt-1 text-xs text-slate-400">
                            当前任务未执行最终完整性检查，以下为基于当前模块归类结果推导出的遗漏文件。
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">遗漏文件数</div>
                          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                            {formatNumber(evaluation.summary?.missing_file_count ?? 0)}
                          </div>
                          <span
                            className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
                              Number(evaluation.summary?.missing_file_count ?? 0) > 0
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {Number(evaluation.summary?.missing_file_count ?? 0) > 0 ? '存在遗漏' : '0 个遗漏'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 text-xs text-slate-500">
                        计算时间：{evaluation.summary?.missing_files_computed_at ? new Date(evaluation.summary.missing_files_computed_at).toLocaleString('zh-CN') : '-'}
                      </div>
                      {Number(evaluation.summary?.missing_file_count ?? 0) > 0 ? (
                        <div className="mt-4 space-y-3">
                          <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="space-y-2">
                              {(evaluation.summary?.missing_files_preview || []).map((file: string) => (
                                <div key={file} className="break-all rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
                                  {file}
                                </div>
                              ))}
                            </div>
                          </div>
                          {Number(evaluation.summary?.missing_file_count ?? 0) > (evaluation.summary?.missing_files_preview || []).length ? (
                            <div className="text-xs text-slate-500">
                              还有 {Number(evaluation.summary?.missing_file_count ?? 0) - (evaluation.summary?.missing_files_preview || []).length} 个未展开
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700">
                          当前未发现遗漏文件
                        </div>
                      )}
                    </section>
                  ) : null}

                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段汇总</h2>
                        <p className="mt-1 text-xs text-slate-400">按阶段聚合 Judge 分、通过率与轮次数</p>
                      </div>
                      <div className="text-xs text-slate-500">生成时间：{evaluation.summary?.generated_at ? new Date(evaluation.summary.generated_at).toLocaleString('zh-CN') : '-'}</div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {Object.entries(evaluation.summary?.stage_summary || {}).map(([stage, item]) => (
                        <div key={stage} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-black text-slate-900">{stageLabel(stage)}</div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <div>轮次 <span className="font-bold text-slate-900">{formatNumber(item.round_count)}</span></div>
                            <div>通过 <span className="font-bold text-slate-900">{formatNumber(item.passed_round_count)}</span></div>
                            <div>均分 <span className="font-bold text-slate-900">{formatNumber(item.avg_judge_score, 1)}</span></div>
                            <div>通过率 <span className="font-bold text-slate-900">{formatRate(item.avg_review_pass_rate)}</span></div>
                          </div>
                        </div>
                      ))}
                      {Object.keys(evaluation.summary?.stage_summary || {}).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-4">
                          暂无阶段汇总
                        </div>
                      ) : null}
                    </div>
                  </section>

                  {selectedEvaluationRound ? (
                    <section className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedEvaluationRoundKey(null)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <ArrowLeft size={14} />
                              返回轮次列表
                            </button>
                            <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Round Detail</div>
                            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                              #{selectedEvaluationRound.round ?? '-'} · {selectedEvaluationRound.module_name || '全局任务'}
                            </h2>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full border px-3 py-1 font-bold ${evaluationStatusTone(selectedEvaluationRound.status)}`}>
                                {evaluationStatusLabel(selectedEvaluationRound.status)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">
                                {stageLabel(selectedEvaluationRound.stage)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono font-bold text-slate-600">
                                Stage Round {selectedEvaluationRound.stage_round ?? '-'}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                            <div className="font-black text-slate-700">来源文件</div>
                            <div className="mt-1 max-w-xl break-all font-mono">{selectedEvaluationRound.source_path || '-'}</div>
                          </div>
                        </div>
                      </section>

                      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <MetricCard label="耗时" value={formatMs(selectedEvaluationRound.duration_ms)} icon={<BarChart3 size={18} />} />
                        <MetricCard label="Token" value={formatNumber(selectedEvaluationRound.metrics?.token_total)} icon={<ScrollText size={18} />} />
                        <MetricCard label="任务实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ShieldAlert size={18} />} />
                        <MetricCard label="Judge 均分" value={formatNumber(selectedEvaluationRound.metrics?.avg_judge_score, 1)} icon={<CheckCircle2 size={18} />} />
                      </section>

                      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="space-y-4">
                          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">本轮执行摘要</h3>
                            <div className="mt-4 space-y-3">
                              <InfoRow label="开始时间" value={selectedEvaluationRound.started_at ? new Date(selectedEvaluationRound.started_at).toLocaleString('zh-CN') : '-'} />
                              <InfoRow label="结束时间" value={selectedEvaluationRound.ended_at ? new Date(selectedEvaluationRound.ended_at).toLocaleString('zh-CN') : '-'} />
                              <InfoRow label="完成原因" value={selectedEvaluationRound.completion_reason || '-'} />
                              <InfoRow label="模块完成" value={selectedEvaluationRound.module_completed ? '是' : '否'} />
                              <InfoRow label="通过投票" value={selectedEvaluationRound.metrics?.passed_by_vote ? '通过' : '未通过'} />
                              <InfoRow label="通过率" value={formatRate(selectedEvaluationRound.metrics?.review_pass_rate)} />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              {selectedEvaluationRound.effectiveness?.needed_reflection ? <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700">需要反思</span> : null}
                              {selectedEvaluationRound.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-700">触发重分类</span> : null}
                              {!selectedEvaluationRound.effectiveness?.needed_reflection && !selectedEvaluationRound.effectiveness?.triggered_reclassify ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600">无额外调整</span>
                              ) : null}
                            </div>
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Worker</h3>
                            <div className="mt-4 space-y-3">
                              <InfoRow label="模型" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.model || '-'}</span>} />
                              <InfoRow label="会话文件" value={<span className="break-all font-mono">{selectedEvaluationSessionPath?.rawPath || selectedEvaluationRound.worker?.session_file || '-'}</span>} />
                              <InfoRow label="错误" value={selectedEvaluationRound.worker?.error || '-'} />
                            </div>
                            {Array.isArray(selectedEvaluationRound.worker?.artifact_paths) && selectedEvaluationRound.worker.artifact_paths.length > 0 ? (
                              <div className="mt-4">
                                <div className="text-xs font-bold text-slate-500">产物路径</div>
                                <div className="mt-2 space-y-2">
                                  {(selectedEvaluationRound.worker?.artifact_paths || []).slice(0, 8).map((path: string) => (
                                    <div key={path} className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">{path}</div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </section>
                        </div>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 评审</h3>
                              <p className="mt-1 text-xs text-slate-400">展示本轮所有 Judge 的评分、通过状态、会话文件和反馈摘要</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                              {selectedEvaluationRound.judges?.length || 0} 个 Judge
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {(selectedEvaluationRound.judges || []).map((judge, index) => (
                              <div key={`${judge.judge_id || index}-${judge.model || ''}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-mono text-xs font-bold text-slate-700">{judge.judge_id || `judge-${index + 1}`}</div>
                                  <div className="flex flex-wrap gap-2 text-[11px]">
                                    {judge.session_file ? (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedEvaluationJudgeKey(`${judge.judge_id || index}::${judge.model || ''}`)}
                                        className={`rounded-full border px-2 py-0.5 font-bold ${selectedEvaluationJudgeKey === `${judge.judge_id || index}::${judge.model || ''}` ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                                      >
                                        查看会话
                                      </button>
                                    ) : null}
                                    <span className={`rounded-full px-2 py-0.5 font-bold ${judge.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                      {judge.passed ? '通过' : '未通过'}
                                    </span>
                                    <span className="rounded-full bg-white px-2 py-0.5 font-bold text-slate-600">评分 {formatNumber(judge.score)}</span>
                                  </div>
                                </div>
                                <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.model || '-'}</div>
                                <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.session_file || '未记录会话文件'}</div>
                                {judge.feedback_excerpt ? (
                                  <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
                                    {judge.feedback_excerpt}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                            {(selectedEvaluationRound.judges || []).length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                                本轮没有 Judge 明细
                              </div>
                            ) : null}
                          </div>
                        </section>

                        {selectedEvaluationJudge ? (
                          <section className="space-y-4">
                            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 会话</h3>
                                  <p className="mt-1 text-xs text-slate-400">通过 fileserver 读取当前选中 Judge 的 session 文件；任务运行中会实时监听追加内容。</p>
                                </div>
                                {selectedEvaluationJudgeSessionPath ? (
                                  <div className="max-w-xl break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">
                                    {selectedEvaluationJudgeSessionPath.fsPath}
                                  </div>
                                ) : null}
                              </div>
                            </section>
                            <WarningListPanel title="Judge 会话文件存在部分异常行，已跳过不可解析内容" items={judgeSessionWarnings} />
                            <AgentSessionViewer
                              sessionMeta={selectedEvaluationJudgeSessionMeta}
                              sessionHeader={judgeSessionSnapshot?.session_meta}
                              events={judgeSessionEvents}
                              loading={judgeSessionLoading}
                              live={judgeSessionLive}
                              error={judgeSessionError}
                            />
                          </section>
                        ) : null}
                      </section>

                      <section className="space-y-4">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Worker 会话</h3>
                              <p className="mt-1 text-xs text-slate-400">通过 fileserver 读取本轮 session 文件；任务运行中会实时监听追加内容。</p>
                            </div>
                            {selectedEvaluationSessionPath ? (
                              <div className="max-w-xl break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">
                                {selectedEvaluationSessionPath.fsPath}
                              </div>
                            ) : null}
                          </div>
                        </section>
                        <WarningListPanel title="会话文件存在部分异常行，已跳过不可解析内容" items={roundSessionWarnings} />
                        <AgentSessionViewer
                          sessionMeta={selectedEvaluationSessionMeta}
                          sessionHeader={roundSessionSnapshot?.session_meta}
                          events={roundSessionEvents}
                          loading={roundSessionLoading}
                          live={roundSessionLive}
                          error={roundSessionError}
                        />
                      </section>
                    </section>
                  ) : (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2>
                        <p className="mt-1 text-xs text-slate-400">展示每一轮 Worker/Judge 的观测指标，点击行进入轮次详情页</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div className="relative">
                          <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                          <input
                            value={evaluationModuleFilter}
                            onChange={(event) => setEvaluationModuleFilter(event.target.value)}
                            placeholder="搜索模块"
                            className="w-44 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                          />
                        </div>
                        <select
                          value={evaluationStageFilter}
                          onChange={(event) => setEvaluationStageFilter(event.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-cyan-300"
                        >
                          <option value="">全部阶段</option>
                          {evaluationStages.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
                        </select>
                        <select
                          value={evaluationStatusFilter}
                          onChange={(event) => setEvaluationStatusFilter(event.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-cyan-300"
                        >
                          <option value="">全部状态</option>
                          {evaluationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="min-w-[1120px] w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                          <tr>
                            <th className="px-3 py-3">Round</th>
                            <th className="px-3 py-3">Stage Round</th>
                            <th className="px-3 py-3">模块</th>
                            <th className="px-3 py-3">阶段</th>
                            <th className="px-3 py-3">状态</th>
                            <th className="px-3 py-3">耗时</th>
                            <th className="px-3 py-3">Worker</th>
                            <th className="px-3 py-3">Judge 均分</th>
                            <th className="px-3 py-3">通过率</th>
                            <th className="px-3 py-3">Token</th>
                            <th className="px-3 py-3">任务实际开始时间</th>
                            <th className="px-3 py-3">效果</th>
                            <th className="px-3 py-3">完成原因</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupedEvaluationRounds.flatMap((group) => (
                            group.rounds.map((round, index) => (
                              <tr
                                key={evaluationRoundKey(round)}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedEvaluationRoundKey(evaluationRoundKey(round))}
                                onContextMenu={(event) => openEvaluationRoundMenu(event, round)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedEvaluationRoundKey(evaluationRoundKey(round));
                                  }
                                }}
                                className="cursor-pointer bg-white transition hover:bg-slate-50"
                              >
                                <td className="px-3 py-3 font-mono font-bold text-slate-800">#{round.round ?? '-'}</td>
                                <td className="px-3 py-3 font-mono text-slate-600">{round.stage_round ?? '-'}</td>
                                {index === 0 ? (
                                  <td
                                    rowSpan={group.rounds.length}
                                    className="px-3 py-3 text-center align-middle font-mono font-bold text-slate-800"
                                  >
                                    <div>{group.displayName}</div>
                                  </td>
                                ) : null}
                                <td className="px-3 py-3 font-semibold text-slate-700">{stageLabel(round.stage)}</td>
                                <td className="px-3 py-3">
                                  <span className={`rounded-full border px-2 py-0.5 font-bold ${evaluationStatusTone(round.status)}`}>{evaluationStatusLabel(round.status)}</span>
                                </td>
                                <td className="px-3 py-3 text-slate-600">{formatMs(round.duration_ms)}</td>
                                <td className="px-3 py-3 max-w-[180px] truncate font-mono text-slate-600">{round.worker?.model || '-'}</td>
                                <td className="px-3 py-3 font-bold text-slate-800">{formatNumber(round.metrics?.avg_judge_score, 1)}</td>
                                <td className="px-3 py-3 text-slate-600">{formatRate(round.metrics?.review_pass_rate)}</td>
                                <td className="px-3 py-3 font-mono text-slate-600">{formatNumber(round.metrics?.token_total)}</td>
                                <td className="px-3 py-3 font-mono text-slate-600">{detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'}</td>
                                <td className="px-3 py-3 text-slate-600">
                                  <div className="flex flex-wrap gap-1">
                                    {round.effectiveness?.needed_reflection ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">反思</span> : null}
                                    {round.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">重分类</span> : null}
                                    {!round.effectiveness?.needed_reflection && !round.effectiveness?.triggered_reclassify ? '-' : null}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-slate-600">{round.completion_reason || '-'}</td>
                              </tr>
                            ))
                          ))}
                          {groupedEvaluationRounds.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="px-4 py-10 text-center text-sm text-slate-500">
                                当前筛选条件下没有轮次记录
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    {evaluationRoundMenu ? (
                      <div
                        className="fixed z-50 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl"
                        style={{ left: evaluationRoundMenu.x, top: evaluationRoundMenu.y }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="border-b border-slate-100 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">轮次操作</div>
                          <div className="mt-1 truncate font-mono text-xs text-slate-700">{evaluationRoundMenu.moduleName}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleFilterSingleModule}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-cyan-50 hover:text-cyan-700"
                        >
                          <Search size={14} />
                          {evaluationModuleFilter.trim() ? '取消仅看此模块' : '仅看此模块'}
                        </button>
                      </div>
                    ) : null}
                  </section>
                  )}
                </>
              )}
            </section>
          )}
        </>
      ) : null}

      {activeAgentSessionPath ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_32px_120px_rgba(15,23,42,0.35)]">
            <AgentSessionDialogHeader
              title={activeAgentSessionMeta?.display_name || activeAgentSessionPath}
              subtitle={activeAgentSessionMeta?.relative_path || activeAgentSessionPath}
              stage={activeAgentSessionMeta?.stage_group}
              roleLabel={sessionRoleLabel(activeAgentSessionMeta?.role_name)}
              roleToneClass={sessionRoleTone(activeAgentSessionMeta?.role_name)}
              eventCount={activeAgentSessionMeta?.event_count}
              live={sessionLive}
              onClose={() => setActiveAgentSessionPath(null)}
            />
            <div className="flex-1 overflow-auto px-6 py-6">
              <AgentSessionWarningPanel warnings={sessionWarnings} className="mb-4" />
              <AgentSessionViewer
                sessionMeta={activeAgentSessionMeta || selectedSession}
                sessionHeader={sessionSnapshot?.session_meta}
                events={sessionEvents}
                loading={sessionLoading}
                live={sessionLive}
                error={sessionError}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
