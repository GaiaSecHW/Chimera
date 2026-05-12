import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ArrowLeft, ChevronRight, Code2, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { api } from '../../clients/api';
import { B2SAdvancedFile, B2SAdvancedRun, B2SReviewAnalytics, B2STaskDetail, B2STaskItemAdvanced } from '../../clients/binaryToSource';

interface Props {
  projectId: string;
  taskId: string;
  itemId: string;
  onBack: () => void;
}

const fileNameOf = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || path;
};

const languageFromPath = (path?: string | null) => {
  const name = fileNameOf(path).toLowerCase();
  if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
  if (name.endsWith('.json') || name.endsWith('.jsonl')) return 'json';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.log') || name.endsWith('.txt')) return 'plaintext';
  return 'plaintext';
};

const fileKindLabel = (file?: B2SAdvancedFile | null) => {
  if (!file) return '-';
  if (file.kind === 'batch_source') return '还原中间结果';
  if (file.kind === 'batch_disasm') return 'IDA/反编译上下文';
  if (file.kind === 'review') return '评审意见';
  if (file.kind === 'agent_session') return 'Agent 会话';
  if (file.kind === 'json') return 'JSON';
  return file.kind || '文件';
};

const formatSize = (value?: number | null) => {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
};

interface PiSessionEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: any;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  [key: string]: any;
}

const parseJsonlSession = (content?: string | null): PiSessionEntry[] => {
  if (!content) return [];
  // Pi session JSONL is one JSON object per physical line. Do not split on blank
  // runs with /\n+/ because pretty/partial payloads can leave meaningful line
  // numbers behind when users inspect malformed records.
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line) as PiSessionEntry; } catch { return null; }
  }).filter((entry): entry is PiSessionEntry => !!entry);
};

const stringifyValue = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

const textFromContent = (content: any, options?: { includeToolCalls?: boolean }): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((block) => {
    if (!block) return '';
    if (block.type === 'text') return block.text || '';
    if (block.type === 'thinking') return block.thinking || '';
    if (block.type === 'toolCall') {
      return options?.includeToolCalls ? `Tool call: ${block.name || ''}\n${stringifyValue(block.arguments || {})}` : '';
    }
    if (block.type === 'image') return `[image: ${block.mimeType || 'image'}]`;
    return stringifyValue(block);
  }).filter(Boolean).join('\n\n');
  return stringifyValue(content);
};

const getResultText = (result?: any): string => {
  if (!result) return '';
  const content = result.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return stringifyValue(content);
  return content.filter((block: any) => block?.type === 'text' || typeof block?.text === 'string').map((block: any) => block.text || '').join('\n');
};

const getLanguageFromPath = (path?: string | null) => {
  const name = fileNameOf(path).toLowerCase();
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript';
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
  if (name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.hpp')) return 'cpp';
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh')) return 'bash';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.md')) return 'markdown';
  return '';
};

const shortPath = (value?: string | null) => {
  if (!value) return '';
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : value;
};

const PiToolOutput: React.FC<{ text?: string; maxLines?: number; language?: string }> = ({ text = '', maxLines = 10, language }) => {
  const normalized = text.replace(/\t/g, '   ');
  if (!normalized.trim()) return null;
  const lines = normalized.split('\n');
  const clipped = lines.length > maxLines;
  return (
    <details open={!clipped} className="mt-3 rounded bg-black/20 text-[12px] text-code-output">
      {clipped && <summary className="cursor-pointer px-3 py-2 text-code-muted">输出预览 · {lines.length - maxLines} more lines</summary>}
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono leading-[18px]">
        {language ? <code className={`language-${language}`}>{normalized}</code> : normalized}
      </pre>
    </details>
  );
};

const PiToolExecution: React.FC<{ call: any; result?: any }> = ({ call, result }) => {
  const args = call?.arguments || {};
  const name = call?.name || 'tool';
  const isError = !!result?.isError;
  const statusClass = result ? (isError ? 'border-red-500/30 bg-red-950/35' : 'border-emerald-500/25 bg-emerald-950/25') : 'border-amber-500/30 bg-amber-950/25';
  const statusText = result ? (isError ? 'error' : 'success') : 'pending';
  const resultText = getResultText(result);
  const toolPath = args.file_path ?? args.path;
  const lineRange = args.offset || args.limit ? `:${args.offset || 1}${args.limit ? `-${(args.offset || 1) + args.limit - 1}` : ''}` : '';

  const header = (() => {
    if (name === 'bash') return <div className="font-bold text-slate-100">$ {stringifyValue(args.command) || '...'}</div>;
    if (['read', 'write', 'edit', 'ls'].includes(name)) return <div><span className="font-bold text-slate-100">{name}</span> <span className="break-all text-violet-300">{shortPath(toolPath || '.')}</span><span className="text-amber-300">{lineRange}</span>{args.limit && name === 'ls' ? <span className="text-slate-400"> (limit {String(args.limit)})</span> : null}</div>;
    return <div><span className="font-bold text-slate-100">{name}</span></div>;
  })();

  return (
    <div className={`tool-execution rounded p-[18px] ${statusClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 font-mono text-[12px] leading-[18px]">{header}</div>
        <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">{statusText}</span>
      </div>
      {name !== 'bash' && name !== 'read' && name !== 'write' && name !== 'edit' && name !== 'ls' ? <PiToolOutput text={stringifyValue(args)} maxLines={12} language="json" /> : null}
      {name === 'write' && typeof args.content === 'string' ? <PiToolOutput text={args.content} maxLines={10} language={getLanguageFromPath(toolPath)} /> : null}
      {result?.details?.diff ? <PiToolOutput text={result.details.diff} maxLines={18} /> : <PiToolOutput text={resultText.trim()} maxLines={name === 'ls' ? 20 : name === 'read' ? 10 : 5} language={name === 'read' ? getLanguageFromPath(toolPath) : undefined} />}
    </div>
  );
};

const isB2SActiveStatus = (status?: string | null) => ['pending', 'queued', 'running', 'dispatching', 'cancelling', 'cancel_requested'].includes(String(status || '').toLowerCase());

interface AdvancedFileEntry {
  stage: string;
  stageOrder: number;
  section?: string;
  sectionOrder?: number;
  round?: string;
  roundOrder?: number;
  agent?: string;
  role?: string;
  batchNo?: number | null;
  attemptNo?: number | null;
  file: B2SAdvancedFile;
}

const entryFromFile = (file: B2SAdvancedFile, fallback: AdvancedFileEntry): AdvancedFileEntry => ({
  ...fallback,
  stage: file.stage || fallback.stage,
  stageOrder: file.stage_order ?? fallback.stageOrder,
  section: file.section || fallback.section,
  sectionOrder: file.section_order ?? fallback.sectionOrder,
  round: file.round || fallback.round,
  roundOrder: file.round_order ?? fallback.roundOrder,
  agent: file.agent || fallback.agent,
  role: file.role || fallback.role,
  batchNo: file.batch_no ?? fallback.batchNo,
  attemptNo: file.attempt_no ?? fallback.attemptNo,
  file,
});

const relativeTo = (path: string, base?: string | null) => {
  const normalized = path.replace(/\\/g, '/');
  const normalizedBase = (base || '').replace(/\\/g, '/');
  return normalizedBase && normalized.startsWith(`${normalizedBase}/`) ? normalized.slice(normalizedBase.length + 1) : normalized;
};

const attemptNumberFromName = (name?: string | null) => {
  const match = String(name || '').match(/attempt[_-]?(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

const attemptLabelFromName = (name?: string | null) => {
  const attempt = attemptNumberFromName(name);
  return attempt ? `第 ${attempt} 轮` : undefined;
};

const batchNumberFromName = (name?: string | null) => {
  const match = String(name || '').match(/batch[_-]?(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

const batchLabel = (batchName?: string | null, batchNo?: number | null) => {
  if (batchNo) return `Batch ${String(batchNo).padStart(3, '0')}`;
  const match = String(batchName || '').match(/batch[_-]?(\d+)/i);
  return match ? `Batch ${String(Number(match[1])).padStart(3, '0')}` : (batchName || 'Batch');
};

const sessionMetaFromPath = (file: B2SAdvancedFile, run: B2SAdvancedRun): Partial<AdvancedFileEntry> => {
  const rel = relativeTo(file.path, run.path);
  const lower = rel.toLowerCase();
  const agent = lower.includes('validator')
    ? 'validator agent'
    : lower.includes('executor')
      ? 'executor agent'
      : lower.includes('header') || lower.includes('synth')
        ? 'header agent'
        : lower.includes('review')
          ? 'review agent'
          : 'agent';
  const batchNo = batchNumberFromName(rel);
  const attemptNo = attemptNumberFromName(rel);
  const isSystemPrompt = lower.includes('system-prompt');
  if (lower.includes('header')) return { stage: '阶段 3 · 共享头文件合成', stageOrder: 3000, section: 'Header Agent', sectionOrder: 0, round: attemptNo ? `第 ${attemptNo} 轮` : run.name, roundOrder: attemptNo || 0, agent, role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话' };
  if (batchNo || lower.includes('executor') || lower.includes('validator')) {
    const batch = batchNo ? `Batch ${String(batchNo).padStart(3, '0')}` : 'Batch 处理';
    const isValidator = lower.includes('validator');
    return {
      stage: `阶段 4 · ${batch} 函数`,
      stageOrder: 4000 + (batchNo || 999),
      section: isValidator ? '评审' : '执行',
      sectionOrder: isValidator ? 20 : 10,
      round: isValidator ? (attemptNo ? `第 ${attemptNo} 次评审` : '评审会话') : '执行会话',
      roundOrder: attemptNo || 0,
      agent,
      role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话',
    };
  }
  return { stage: '阶段 4 · Agent 会话', stageOrder: 4999, section: '其他会话', sectionOrder: 90, round: attemptNo ? `第 ${attemptNo} 轮` : run.name, roundOrder: attemptNo || 0, agent, role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话' };
};

const runFileMeta = (file: B2SAdvancedFile): { stage: string; stageOrder: number; round?: string; agent?: string } => {
  const name = file.name.toLowerCase();
  if (name === 'run_manifest.json') return { stage: '阶段 0 · 运行配置', stageOrder: 0 };
  if (name === 'batch_manifest.json') return { stage: '阶段 2 · Batch 划分清单', stageOrder: 2000 };
  if (name === 'results.json') return { stage: '结果汇总', stageOrder: 6000 };
  if (name === 'preamble.h') return { stage: '阶段 3 · 共享头文件', stageOrder: 3000 };
  return { stage: '运行文件', stageOrder: 500 };
};

const RISK_COLORS: Record<string, string> = { critical: 'var(--color-rose-600)', warning: 'var(--color-amber-600)', passed: 'var(--color-emerald-600)', unknown: 'var(--color-slate-500)' };
const RISK_LABELS: Record<string, string> = { critical: '高危', warning: '提示', passed: '通过', unknown: '未知' };
const CHART_COLORS = {
  logic: 'var(--color-chart-logic)',
  logicRounds: ['var(--color-chart-logic1)', 'var(--color-chart-logic2)', 'var(--color-chart-logic3)'],
  structure: 'var(--color-chart-structure)',
  structureRounds: ['var(--color-chart-structure1)', 'var(--color-chart-structure2)', 'var(--color-chart-structure3)'],
  readability: 'var(--color-chart-readability)',
  readabilityRounds: ['var(--color-chart-readability1)', 'var(--color-chart-readability2)', 'var(--color-chart-readability3)'],
  round1: 'var(--color-chart-round1)',
  round2: 'var(--color-chart-round2)',
  round3: 'var(--color-chart-round3)',
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
};
const ISSUE_LABELS: Record<string, string> = { 'Length Logic': '长度校验逻辑反转', 'Return Code': 'accepted 返回值错误', 'Extra Check': '多余校验条件', Semantic: '语义问题', Validation: '输入校验', Return: '返回语义' };
const ISSUE_DETAILS: Record<string, string> = {
  'Length Logic': '序列号长度判断方向错误，导致有效输入路径被错误处理。',
  'Return Code': 'accepted 分支返回值与原始二进制语义不一致。',
  'Extra Check': '输出中出现原始逻辑不存在的 hex_len == 0 校验。',
};
const RISK_TEXT: Record<string, string> = { low: '低', 'low-medium': '低-中', medium: '中', high: '高', unknown: '未知' };
const QUALITY_DIMENSION_GROUPS = [
  {
    name: '代码逻辑准确性',
    terms: [
      { key: 'completeness', weight: 0.15 },
      { key: 'control_flow', weight: 0.25 },
      { key: 'return_semantics', weight: 0.2 },
      { key: 'input_validation', weight: 0.25 },
      { key: 'call_fidelity', weight: 0.15 },
    ],
    formula: 'Qlogic = 0.15·Ccmp + 0.25·CFG + 0.20·RET + 0.25·COND + 0.15·CALL',
  },
  {
    name: '数据结构准确性',
    terms: [
      { key: 'type_struct_fidelity', weight: 0.55 },
      { key: 'call_fidelity', weight: 0.25 },
      { key: 'completeness', weight: 0.2 },
    ],
    formula: 'Qstruct = 0.55·TYPEstruct + 0.25·CALL + 0.20·Ccmp',
  },
  {
    name: '可读性',
    terms: [
      { key: 'completeness', weight: 0.45 },
      { key: 'type_struct_fidelity', weight: 0.35 },
      { key: 'call_fidelity', weight: 0.2 },
    ],
    formula: 'Qread = 0.45·Ccmp + 0.35·TYPEstruct + 0.20·CALL',
  },
];
const averageTrendFallbackTitle = (analytics: B2SReviewAnalytics) => {
  const first = analytics.attempts[0]?.semantic_score || 0;
  const last = analytics.attempts[analytics.attempts.length - 1]?.semantic_score || analytics.summary.final_confidence || 0;
  const delta = last - first;
  if (delta >= 20) return '质量显著提升';
  if (delta >= 8) return '质量稳步提升';
  if (delta >= 0) return '质量基本稳定';
  return '质量出现回落';
};

const PanelCard: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <div className={`rounded-none border border-slate-200 bg-white/90 p-5 shadow-panel ring-1 ring-slate-900/[0.03] ${className}`}>
    <div className="mb-4 flex min-h-6 items-start justify-between gap-3">
      <div className="min-w-0">{typeof title === 'string' ? <div className="text-[14px] font-black tracking-[0.04em] text-slate-900">{title}</div> : title}</div>
      {right}
    </div>
    {children}
  </div>
);

const DimensionSparkline: React.FC<{ values: Array<{ attemptNo: number; value: number }>; color: string }> = ({ values, color }) => {
  const width = 118;
  const height = 58;
  const padding = 8;
  if (!values.length) return null;

  const nums = values.map((item) => item.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = Math.max(1, max - min);
  const points = values.map((item, index) => {
    const x = values.length === 1 ? width / 2 : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((item.value - min) / range) * (height - padding * 2);
    return { x, y, value: item.value };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg className="overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke="#d9d9de" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.slice(0, -1).map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="white" stroke="#e5e5ea" strokeWidth="2" />
      ))}
      {last && <circle cx={last.x} cy={last.y} r="4" fill="white" stroke={color} strokeWidth="2.6" />}
    </svg>
  );
};

const ReviewEffectivenessPanel: React.FC<{ analytics: B2SReviewAnalytics | null }> = ({ analytics }) => {
  if (!analytics) return null;
  const first = analytics.attempts[0];
  const last = analytics.attempts[analytics.attempts.length - 1];
  const resolvedCount = analytics.issues.filter((issue) => issue.status === 'resolved').length;
  const remainingCount = analytics.issues.filter((issue) => issue.status !== 'resolved').length;
  const dimensionGroups = QUALITY_DIMENSION_GROUPS;
  const dimensionRounds = useMemo(() => analytics.radar.slice(0, 3), [analytics]);
  const qualityDimensionColors = [CHART_COLORS.logic, CHART_COLORS.structure, CHART_COLORS.readability];
  const dimensionScore = (round: B2SReviewAnalytics['radar'][number], terms: Array<{ key: string; weight: number }>) => {
    const totalWeight = terms.reduce((sum, term) => sum + term.weight, 0);
    const weighted = terms.reduce((sum, term) => sum + Number((round as any)?.[term.key] || 0) * term.weight, 0);
    return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  };
  const trendInsight = analytics.trend_insight || {
    title: averageTrendFallbackTitle(analytics),
    conclusion: `共 ${analytics.attempts.length} 轮评审，最终语义质量 ${last.semantic_score || analytics.summary.final_confidence}。`,
    tone: 'neutral',
    primary_metric: '语义质量',
    first_score: first.semantic_score,
    final_score: last.semantic_score,
    delta: Math.max(0, (last.semantic_score || 0) - (first.semantic_score || 0)),
  };
  const trendToneClass = trendInsight.tone === 'warning' ? 'text-amber-700' : trendInsight.tone === 'positive' ? 'text-emerald-700' : 'text-slate-700';
  const dimensionRows = dimensionGroups.map((item, groupIndex) => {
    const values = dimensionRounds.map((round) => ({
      attemptNo: round.attempt_no,
      value: dimensionScore(round, item.terms),
    }));
    const firstValue = values[0]?.value || 0;
    const finalValue = values[values.length - 1]?.value || 0;
    return {
      name: item.name,
      labelClass: ['text-chart-logic', 'text-chart-structure', 'text-chart-readability'][groupIndex] || 'text-slate-700',
      dotClass: ['bg-chart-logic', 'bg-chart-structure', 'bg-chart-readability'][groupIndex] || 'bg-slate-500',
      sparkColor: qualityDimensionColors[groupIndex] || CHART_COLORS.axis,
      values,
      description: [
        '控制流、返回值和关键条件高度匹配原始程序',
        '类型、结构体和参数含义还原合理',
        '命名、代码结构和表达便于人工审查',
      ][groupIndex] || '评估该维度的最终质量表现',
      firstValue,
      finalValue,
      improvement: Math.max(0, finalValue - firstValue),
      improvementPercent: firstValue > 0 ? Math.round((Math.max(0, finalValue - firstValue) / firstValue) * 100) : 0,
    };
  });
  const qualityTrend = dimensionRounds.map((round) => ({
    round: `第${round.attempt_no}轮`,
    ...Object.fromEntries(dimensionGroups.map((item) => [item.name, dimensionScore(round, item.terms)])),
  }));
  const firstQualityScore = dimensionRows.length ? Math.round(dimensionRows.reduce((sum, row) => sum + row.firstValue, 0) / dimensionRows.length) : first.semantic_score;
  const finalQualityScore = dimensionRows.length ? Math.round(dimensionRows.reduce((sum, row) => sum + row.finalValue, 0) / dimensionRows.length) : analytics.summary.final_confidence;
  const finalQualityLabel = finalQualityScore >= 90 ? '优秀' : finalQualityScore >= 80 ? '良好' : finalQualityScore >= 70 ? '可用' : '待优化';
  const averageImprovement = Math.max(0, finalQualityScore - firstQualityScore);
  const improvementPercent = firstQualityScore > 0 ? Math.round((averageImprovement / firstQualityScore) * 100) : 0;
  const verdictPassed = analytics.summary.final_verdict === 'PASS';
  const verdictFailed = analytics.summary.final_verdict === 'FAIL';
  const verdictLabel = verdictPassed ? '通过' : verdictFailed ? '未通过' : '未知';
  const verdictTone = verdictPassed ? 'text-emerald-700' : verdictFailed ? 'text-rose-700' : 'text-slate-700';
  const verdictBg = verdictPassed ? 'border-emerald-200 border-l-emerald-500 bg-emerald-50/35' : verdictFailed ? 'border-rose-200 border-l-rose-500 bg-rose-50/35' : 'border-slate-200 border-l-slate-400 bg-slate-50/60';
  const conclusionText = verdictPassed
    ? `多轮评审已完成，当前未发现阻断问题，遗留问题 ${remainingCount} 项。`
    : verdictFailed
      ? `评审仍未通过，当前遗留问题 ${remainingCount} 项，建议优先查看闭环证据。`
      : `评审结论暂不可判定，建议查看各轮评审详情与中间产物。`;
  const closureTitle = remainingCount > 0 ? `仍有 ${remainingCount} 项未闭环` : '问题全部闭环';
  const closureTone = remainingCount > 0 ? 'text-rose-700' : 'text-emerald-700';
  const closureDescription = `共发现 ${analytics.issues.length || 0} 项问题，已解决 ${resolvedCount} 项，未解决 ${remainingCount} 项。`;
  const roundSummaries = analytics.attempts.map((attempt, index) => {
    const discovered = analytics.issues.filter((issue) => issue.introduced_attempt === attempt.attempt_no);
    const resolved = analytics.issues.filter((issue) => issue.resolved_attempt === attempt.attempt_no);
    const openAtRound = analytics.issues.filter((issue) => issue.introduced_attempt <= attempt.attempt_no && (!issue.resolved_attempt || issue.resolved_attempt > attempt.attempt_no));
    const verdictPassed = attempt.verdict === 'PASS';
    return {
      attempt,
      index,
      discovered,
      resolved,
      openAtRound,
      verdictLabel: verdictPassed ? '通过' : attempt.verdict === 'FAIL' ? '失败' : '未知',
      tone: verdictPassed ? 'emerald' : 'rose',
      isFinal: index === analytics.attempts.length - 1,
    };
  });

  return (
    <section className="overflow-hidden rounded-none border border-slate-200 bg-white p-6 shadow-section">
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div className="text-xl font-black tracking-[0.05em] text-slate-900">代码还原质量迭代追踪</div>
        {analytics.summary.mock && <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-cyan-700">模拟数据</div>}
      </div>

      <div className={`mb-4 rounded-none border border-l-4 p-5 ${verdictBg}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[13px] font-black tracking-[0.08em] text-slate-400">最终结论</div>
            <div className={`mt-1 text-5xl font-black leading-none tracking-tight ${verdictTone}`}>{verdictLabel}</div>
            <div className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{conclusionText}</div>
          </div>
          <div className="grid shrink-0 grid-cols-2 divide-x divide-slate-200 border-l border-slate-200 bg-white/45 lg:min-w-[430px]">
            <div className="px-5 py-3 text-center">
              <div className="text-[11px] font-black tracking-[0.12em] text-slate-400">最终质量</div>
              <div className="mt-1 flex items-baseline justify-center gap-2">
                <span className="text-3xl font-black text-indigo-700">{finalQualityScore}</span>
                <span className="text-sm font-black text-amber-700">+{improvementPercent}%</span>
              </div>
              <div className="mt-1 text-xs font-black text-indigo-600">{finalQualityLabel} · {firstQualityScore} → {finalQualityScore}</div>
            </div>
            <div className="px-5 py-3 text-center">
              <div className="text-[11px] font-black tracking-[0.12em] text-slate-400">问题闭环</div>
              <div className={`mt-1 text-3xl font-black ${remainingCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{resolvedCount}/{analytics.issues.length || 0}</div>
              <div className="mt-1 text-xs font-black text-slate-500">遗留 {remainingCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PanelCard
          title={(
            <div>
              <div className="text-[13px] font-black tracking-[0.08em] text-slate-400">质量趋势</div>
              <div className={`mt-1 text-3xl font-black leading-tight tracking-tight ${trendToneClass}`}>{trendInsight.title}</div>
              <div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{trendInsight.conclusion}</div>
            </div>
          )}
          className="flex h-full flex-col"
        >
          <div className="min-h-[300px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityTrend} margin={{ top: 20, right: 26, left: 0, bottom: 12 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 5" strokeOpacity={0.8} vertical={false} />
                <XAxis dataKey="round" stroke={CHART_COLORS.axis} tick={{ fontSize: 12, fontWeight: 900 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin / 10) * 10 - 5), 100]} ticks={[55, 70, 85, 100]} stroke={CHART_COLORS.axis} tick={{ fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                {dimensionGroups.map((item, index) => {
                  const color = qualityDimensionColors[index] || CHART_COLORS.axis;
                  return (
                    <Line
                      key={item.name}
                      type="monotone"
                      dataKey={item.name}
                      stroke={color}
                      strokeWidth={2.6}
                      dot={(props: any) => {
                        const cx = Number(props.cx || 0);
                        const cy = Number(props.cy || 0);
                        if (index === 1) return <rect x={cx - 3.2} y={cy - 3.2} width={6.4} height={6.4} rx={1.6} fill="white" stroke={color} strokeWidth={2} />;
                        if (index === 2) return <path d={`M ${cx} ${cy - 4} L ${cx + 4} ${cy} L ${cx} ${cy + 4} L ${cx - 4} ${cy} Z`} fill="white" stroke={color} strokeWidth={2} />;
                        return <circle cx={cx} cy={cy} r={3.4} fill="white" stroke={color} strokeWidth={2} />;
                      }}
                      activeDot={{ r: 6, strokeWidth: 2.5, fill: 'var(--color-white)', stroke: color }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-[11px] font-black">
            {dimensionGroups.map((item, index) => {
              const color = qualityDimensionColors[index] || CHART_COLORS.axis;
              return (
                <span key={item.name} className="inline-flex items-center gap-1.5 text-slate-600">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    {index === 1 ? <rect x="3.4" y="3.4" width="5.2" height="5.2" rx="1.3" fill="white" stroke={color} strokeWidth="2" /> : index === 2 ? <path d="M6 2.2 9.8 6 6 9.8 2.2 6Z" fill="white" stroke={color} strokeWidth="2" /> : <circle cx="6" cy="6" r="3.6" fill="white" stroke={color} strokeWidth="2" />}
                  </svg>
                  {item.name}
                </span>
              );
            })}
          </div>
        </PanelCard>

        <PanelCard
          title={(
            <div>
              <div className="text-[13px] font-black tracking-[0.08em] text-slate-400">质量评分拆解</div>
              <div className="mt-1 text-3xl font-black leading-tight tracking-tight text-slate-900">{finalQualityLabel} · {finalQualityScore}</div>
              <div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">初始质量 {firstQualityScore}，最终质量 {finalQualityScore}，综合提升 {averageImprovement} 分。</div>
            </div>
          )}
        >
          <div className="space-y-3">
            {dimensionRows.map((row) => (
              <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_118px] items-center gap-5 rounded-[18px] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.025),0_0_0_1px_rgba(60,60,67,0.045)]">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${row.dotClass}`} />
                    <div className={`text-sm font-black tracking-[-0.01em] ${row.labelClass}`}>{row.name}</div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[42px] font-black leading-none tracking-[-0.045em] text-black">{row.finalValue}</span>
                    <span className="text-[17px] font-semibold text-slate-400">分</span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {finalQualityLabel} · 较初始提升 <span className={row.labelClass}>{row.improvementPercent}%</span>
                  </div>
                  <div className="mt-2 text-sm font-medium leading-5 text-slate-400">{row.description}</div>
                </div>
                <div className="justify-self-end">
                  <DimensionSparkline values={row.values} color={row.sparkColor} />
                </div>
              </div>
            ))}
          </div>
        </PanelCard>

        <div id="b2s-review-evidence" className="scroll-mt-24 xl:col-span-2">
          <PanelCard
          title={(
            <div>
              <div className="text-[13px] font-black tracking-[0.08em] text-slate-400">评审闭环时间线</div>
              <div className={`mt-1 text-3xl font-black leading-tight tracking-tight ${closureTone}`}>{closureTitle}</div>
              <div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{closureDescription}</div>
            </div>
          )}
        >
          <div className="overflow-hidden border border-slate-200">
            <div className="grid grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              <div>轮次</div>
              <div>结论</div>
              <div>已验证</div>
              <div>阻断</div>
              <div>语义分</div>
              <div>发现</div>
              <div>解决</div>
              <div>未闭环</div>
              <div>状态</div>
              <div className="text-right">操作</div>
            </div>
            <div className="divide-y divide-slate-200">
              {roundSummaries.map((round) => {
                const attempt = round.attempt;
                const passed = round.tone === 'emerald';
                const border = passed ? 'border-emerald-200' : 'border-rose-200';
                const bg = passed ? 'bg-emerald-50/50' : 'bg-rose-50/50';
                const badge = passed ? 'border-emerald-300/30 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700';
                const accent = passed ? 'border-l-emerald-500' : 'border-l-rose-500';
                return (
                  <details key={attempt.attempt_no} className="group">
                    <summary className={`grid list-none cursor-pointer grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] items-center border-l-4 ${accent} bg-white px-4 py-3 text-sm transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden`}>
                      <div className="font-black text-slate-500">第 {attempt.attempt_no} 轮</div>
                      <div className={`text-lg font-black leading-none ${passed ? 'text-emerald-700' : 'text-rose-700'}`}>{round.verdictLabel}</div>
                      <div className="font-black text-emerald-700">{attempt.verified_functions}/{attempt.total_functions}</div>
                      <div className={`font-black ${attempt.blocking_issues ? 'text-rose-700' : 'text-emerald-700'}`}>{attempt.blocking_issues}</div>
                      <div className="font-black text-violet-700">{attempt.semantic_score}</div>
                      <div className={`font-black ${round.discovered.length ? 'text-rose-700' : 'text-slate-500'}`}>{round.discovered.length}</div>
                      <div className="font-black text-emerald-700">{round.resolved.length}</div>
                      <div className={`font-black ${round.openAtRound.length ? 'text-rose-700' : 'text-slate-700'}`}>{round.openAtRound.length}</div>
                      <div><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${badge}`}>{round.isFinal ? '最终轮' : passed ? '已通过' : '需修复'}</span></div>
                      <div className="text-right text-xs font-black text-slate-500 transition group-open:text-slate-900"><span className="group-open:hidden">详情 ▾</span><span className="hidden group-open:inline">收起 ▴</span></div>
                    </summary>

                    <div className={`border-l-4 ${accent} border-t ${border} ${bg} p-5`}>
                      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                        <span>本轮发现 {round.discovered.length} 项</span>
                        <span className="text-slate-300">/</span>
                        <span>本轮解决 {round.resolved.length} 项</span>
                        <span className="text-slate-300">/</span>
                        <span>轮后未闭环 {round.openAtRound.length} 项</span>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2"><div className="text-xs font-black tracking-[0.08em] text-rose-700">本轮发现</div><div className="text-[11px] font-bold text-slate-500">{round.discovered.length} 项</div></div>
                          <div className="space-y-2">
                            {round.discovered.length ? round.discovered.map((issue, idx) => <div key={`d-${attempt.attempt_no}-${issue.id}`} className="rounded-none border border-slate-200 bg-white/85 p-3"><div className="flex items-start gap-3"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-black text-rose-700">{idx + 1}</div><div className="min-w-0"><div className="text-sm font-black text-slate-900">{ISSUE_LABELS[issue.label] || issue.label}</div><div className="mt-1 text-xs font-medium leading-5 text-slate-500">{ISSUE_DETAILS[issue.label] || `${issue.category} · ${issue.severity}`}</div><div className="mt-1 font-mono text-[11px] font-bold text-slate-500">{issue.function}</div></div></div></div>) : <div className="rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">本轮未新增阻断问题</div>}
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2"><div className="text-xs font-black tracking-[0.08em] text-emerald-700">本轮解决</div><div className="text-[11px] font-bold text-slate-500">{round.resolved.length} 项</div></div>
                          <div className="space-y-2">
                            {round.resolved.length ? round.resolved.map((issue) => <div key={`r-${attempt.attempt_no}-${issue.id}`} className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2 rounded-none border border-slate-200 bg-white/85 p-3"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{ISSUE_LABELS[issue.label] || issue.label}</div><div className="mt-1 font-mono text-[11px] font-bold text-slate-500">第 {issue.introduced_attempt} 轮发现</div></div><div className="rounded-none bg-emerald-100 px-2 py-2 text-center text-xs font-black text-emerald-700">已解决</div></div>) : <div className="rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">本轮暂无已关闭问题</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
          </PanelCard>
        </div>

      </div>
    </section>
  );
};

const PiMessageContent: React.FC<{ entry: PiSessionEntry; entries: PiSessionEntry[] }> = ({ entry, entries }) => {
  const msg = entry.message || {};
  const content = msg.content;
  if (msg.role === 'assistant' && Array.isArray(content)) {
    return (
      <>
        {content.map((block: any, idx: number) => {
          if (block?.type === 'text' && block.text?.trim()) return <div key={idx} className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{block.text}</div>;
          if (block?.type === 'thinking' && block.thinking?.trim()) return <div key={idx} className="rounded bg-slate-950/40 p-3 text-sm italic leading-6 text-slate-400">{block.thinking}</div>;
          return null;
        })}
        {content.filter((block: any) => block?.type === 'toolCall').map((block: any) => {
          const result = entries.find((candidate) => candidate.type === 'message' && candidate.message?.role === 'toolResult' && candidate.message?.toolCallId === block.id)?.message;
          return <PiToolExecution key={block.id || `${block.name}-${Math.random()}`} call={block} result={result} />;
        })}
      </>
    );
  }
  if (msg.role === 'bashExecution') {
    return <PiToolExecution call={{ id: entry.id, name: 'bash', arguments: { command: msg.command } }} result={{ content: [{ type: 'text', text: msg.output || '' }], isError: msg.cancelled || (msg.exitCode !== 0 && msg.exitCode !== null) }} />;
  }
  return <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{textFromContent(content, { includeToolCalls: false })}</pre>;
};

const PiSessionPreview: React.FC<{ file: B2SAdvancedFile }> = ({ file }) => {
  const entries = useMemo(() => parseJsonlSession(file.content), [file.content]);
  if (!file.content) {
    return <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">会话内容为空或未加载。</div>;
  }
  if (entries.length === 0) {
    return <pre className="h-full overflow-auto whitespace-pre-wrap p-5 text-sm text-slate-200">{file.content}</pre>;
  }
  const header = entries.find((entry) => entry.type === 'session');
  const messages = entries.filter((entry) => entry.type === 'message');
  const visibleEntries = entries.filter((entry) => !(entry.type === 'message' && entry.message?.role === 'toolResult'));
  const modelChanges = entries.filter((entry) => entry.type === 'model_change');
  const toolCalls = messages.flatMap((entry) => {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((block: any) => block?.type === 'toolCall');
  });
  return (
    <div className="h-full overflow-auto bg-code-panel p-5 text-slate-100">
      <div className="rounded-none border border-slate-700 bg-slate-900/80 p-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Pi Agent Session</div>
        <div className="mt-2 break-all font-mono text-xs text-slate-400">{file.name}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-300 md:grid-cols-4">
          <div className="rounded-none bg-slate-800 px-3 py-2">消息<br /><span className="text-lg font-black text-white">{messages.length}</span></div>
          <div className="rounded-none bg-slate-800 px-3 py-2">工具调用<br /><span className="text-lg font-black text-white">{toolCalls.length}</span></div>
          <div className="rounded-none bg-slate-800 px-3 py-2">模型<br /><span className="font-black text-white">{modelChanges[0]?.modelId || '-'}</span></div>
          <div className="rounded-none bg-slate-800 px-3 py-2">会话 ID<br /><span className="font-mono font-black text-white">{header?.id || '-'}</span></div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {visibleEntries.filter((entry) => entry.type !== 'session').map((entry, index) => {
          const role = entry.message?.role || entry.type;
          const isUser = role === 'user';
          const isAssistant = role === 'assistant';
          const isTool = role === 'bashExecution';
          const body = entry.type === 'model_change'
            ? `Model: ${entry.provider || '-'} / ${entry.modelId || '-'}`
            : entry.type === 'thinking_level_change'
              ? `Thinking level: ${entry.thinkingLevel || '-'}`
              : entry.type !== 'message'
                ? JSON.stringify(entry, null, 2)
                : '';
          return (
            <article key={`${entry.id || index}-${index}`} className={`rounded-none border p-[18px] ${isUser ? 'border-slate-700 bg-chat-user' : isAssistant ? 'border-transparent bg-transparent' : isTool ? 'border-emerald-500/25 bg-emerald-950/25' : 'border-slate-700 bg-slate-900/60'}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest">
                <span className={`${isUser ? 'text-blue-300' : isAssistant ? 'text-emerald-300' : isTool ? 'text-amber-300' : 'text-slate-300'}`}>{role}</span>
                <span className="font-mono text-slate-500">{entry.timestamp || entry.id || ''}</span>
              </div>
              {entry.type === 'message' ? <PiMessageContent entry={entry} entries={entries} /> : <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{body}</pre>}
            </article>
          );
        })}
      </div>
    </div>
  );
};

export const B2STaskAdvancedPage: React.FC<Props> = ({ projectId, taskId, itemId, onBack }) => {
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [advanced, setAdvanced] = useState<B2STaskItemAdvanced | null>(null);
  const [reviewAnalytics, setReviewAnalytics] = useState<B2SReviewAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [autoRefreshSession, setAutoRefreshSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState('');

  const load = async () => {
    if (!projectId || !taskId || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskDetail, advancedDetail, analyticsDetail] = await Promise.all([
        api.domains.execution.binaryToSource.getTask(projectId, taskId),
        api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, true),
        api.domains.execution.binaryToSource.getTaskItemReviewAnalytics(projectId, taskId, itemId, false),
      ]);
      setDetail(taskDetail);
      setAdvanced(advancedDetail);
      setReviewAnalytics(analyticsDetail);
    } catch (e: any) {
      setError(e?.message || '加载高级信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, taskId, itemId]);

  const files = useMemo(() => {
    const list: AdvancedFileEntry[] = [];
    advanced?.runs.forEach((run) => {
      run.files.forEach((file) => {
        const meta = runFileMeta(file);
        list.push(entryFromFile(file, { ...meta, round: meta.round || run.name, file }));
      });
      run.batches.forEach((batch) => {
        const batchNo = batch.batch_no || batchNumberFromName(batch.name) || 999;
        const batchName = batchLabel(batch.name, batch.batch_no);
        const stage = `阶段 4 · ${batchName} 函数`;
        const stageOrder = 4000 + batchNo;
        if (batch.disasm) list.push(entryFromFile(batch.disasm, { stage: '阶段 2 · Batch 上下文切片', stageOrder: 2000, round: batchName, file: batch.disasm }));
        if (batch.source) list.push(entryFromFile(batch.source, { stage, stageOrder, section: '执行', sectionOrder: 10, round: '执行输出', roundOrder: 0, agent: 'executor agent', role: 'batch 输出', file: batch.source }));
        batch.review_snapshots.forEach((file) => {
          const attemptNo = attemptNumberFromName(file.name) || 0;
          list.push(entryFromFile(file, { stage, stageOrder, section: '评审', sectionOrder: 20, round: attemptNo ? `第 ${attemptNo} 次评审` : '评审轮次', roundOrder: attemptNo, agent: 'validator agent', role: '评审输入', file }));
        });
        batch.reviews.forEach((file) => {
          const attemptNo = attemptNumberFromName(file.name) || 0;
          list.push(entryFromFile(file, { stage, stageOrder, section: '评审', sectionOrder: 20, round: attemptNo ? `第 ${attemptNo} 次评审` : '评审轮次', roundOrder: attemptNo, agent: 'validator agent', role: '评审输出', file }));
        });
      });
      run.agent_sessions.forEach((file) => {
        const meta = sessionMetaFromPath(file, run);
        list.push(entryFromFile(file, { stage: meta.stage || '阶段 4 · Agent 会话', stageOrder: meta.stageOrder ?? 4999, section: meta.section, sectionOrder: meta.sectionOrder, round: meta.round || run.name, roundOrder: meta.roundOrder, agent: meta.agent, role: meta.role, file }));
      });
    });
    advanced?.ida_files.forEach((file) => list.push(entryFromFile(file, { stage: '阶段 1 · IDA 分析缓存', stageOrder: 1000, file })));
    return list.sort((a, b) => a.stageOrder - b.stageOrder || (a.sectionOrder || 0) - (b.sectionOrder || 0) || (a.roundOrder || 0) - (b.roundOrder || 0) || a.file.name.localeCompare(b.file.name));
  }, [advanced]);

  const groupedFiles = useMemo(() => {
    const groups: Array<{ stage: string; sections: Array<{ name: string; rounds: Array<{ name: string; entries: AdvancedFileEntry[] }> }> }> = [];
    files.forEach((entry) => {
      let group = groups[groups.length - 1];
      if (!group || group.stage !== entry.stage) {
        group = { stage: entry.stage, sections: [] };
        groups.push(group);
      }
      const sectionName = entry.section || '文件';
      let section = group.sections[group.sections.length - 1];
      if (!section || section.name !== sectionName) {
        section = { name: sectionName, rounds: [] };
        group.sections.push(section);
      }
      const roundName = entry.round || '产物';
      let round = section.rounds[section.rounds.length - 1];
      if (!round || round.name !== roundName) {
        round = { name: roundName, entries: [] };
        section.rounds.push(round);
      }
      round.entries.push(entry);
    });
    return groups;
  }, [files]);

  useEffect(() => {
    setSelectedPath((current) => current && files.some((entry) => entry.file.path === current) ? current : (files[0]?.file.path || ''));
  }, [files]);

  const selected = files.find((entry) => entry.file.path === selectedPath)?.file || null;
  const isSelectedJsonlSession = !!selected && selected.kind === 'agent_session' && selected.name.toLowerCase().endsWith('.jsonl');
  const item = detail?.items.find((entry) => entry.id === itemId || String(entry.sequence_no) === itemId);
  const isTaskRunning = isB2SActiveStatus(detail?.status) || isB2SActiveStatus(item?.status) || !!(detail?.running_items || detail?.queued_items || detail?.pending_items);
  const shouldAutoRefreshSession = isSelectedJsonlSession && autoRefreshSession;
  const selectedPreviewKey = selected ? `${selected.path}:${selected.size}:${selected.content?.length || 0}:${selected.content?.slice(-160) || ''}` : 'empty';

  useEffect(() => {
    if (!projectId || !taskId || !itemId || !selectedPath || !shouldAutoRefreshSession) return;
    let cancelled = false;
    let inFlight = false;
    const refreshSession = async () => {
      if (inFlight) return;
      inFlight = true;
      setSessionRefreshing(true);
      try {
        const [taskDetail, advancedDetail, analyticsDetail] = await Promise.all([
          api.domains.execution.binaryToSource.getTask(projectId, taskId),
          api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, true),
          api.domains.execution.binaryToSource.getTaskItemReviewAnalytics(projectId, taskId, itemId, false),
        ]);
        if (!cancelled) {
          setDetail(taskDetail);
          setAdvanced(advancedDetail);
          setReviewAnalytics(analyticsDetail);
        }
      } catch {
        // Keep the current view stable during background polling; manual refresh still surfaces errors.
      } finally {
        inFlight = false;
        if (!cancelled) setSessionRefreshing(false);
      }
    };
    void refreshSession();
    const timer = window.setInterval(() => { void refreshSession(); }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, taskId, itemId, selectedPath, shouldAutoRefreshSession]);

  const totalBatches = advanced?.runs.reduce((sum, run) => sum + run.batches.length, 0) || 0;
  const totalReviews = advanced?.runs.reduce((sum, run) => sum + run.batches.reduce((n, batch) => n + batch.reviews.length + batch.review_snapshots.length, 0), 0) || 0;
  const totalSessions = advanced?.runs.reduce((sum, run) => sum + run.agent_sessions.length, 0) || 0;

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          <ArrowLeft size={16} />
          返回执行明细
        </button>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && <div className="rounded-none border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <section className="rounded-none border border-slate-200 bg-white/85 px-5 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-500">
              <span className="text-violet-600">反编译任务</span>
              <span className="text-slate-300">·</span>
              <span>#{advanced?.sequence_no || item?.sequence_no || '-'}</span>
              <span className="text-slate-300">·</span>
              <span>{advanced?.mode_label || detail?.mode_label || '-'}</span>
            </div>
            <div className="mt-1 break-words text-lg font-black tracking-tight text-slate-950">{fileNameOf(item?.elf_path)}</div>
            <div className="mt-0.5 break-all font-mono text-[10px] font-semibold text-slate-400">task {taskId} · item {itemId}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700 ring-1 ring-violet-100">Batch {totalBatches}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">评审 {totalReviews}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100">会话 {totalSessions}</span>
          </div>
        </div>
      </section>

      <ReviewEffectivenessPanel analytics={reviewAnalytics} />

      <section id="b2s-artifacts" className="scroll-mt-24 overflow-hidden rounded-none border border-slate-200 bg-white shadow-sm">
        {loading && !advanced ? (
          <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载中...</div>
        ) : files.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">未找到 batch 中间结果、评审快照或 Agent 会话记录。</div>
        ) : (
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 bg-slate-50/80 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">中间产物</div>
              <div className="max-h-[680px] overflow-auto p-3">
                {groupedFiles.map((group) => (
                  <div key={group.stage} className="mb-5">
                    <div className="mb-2 border-b border-slate-200 bg-slate-50 px-1 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{group.stage}</div>
                    {group.sections.map((section) => (
                      <div key={`${group.stage}-${section.name}`} className="mb-3 pl-1">
                        <div className="mb-2 text-[11px] font-black tracking-[0.12em] text-slate-700">{section.name}</div>
                        {section.rounds.map((round) => (
                          <div key={`${group.stage}-${section.name}-${round.name}`} className="mb-2">
                            <div className="mb-1 text-[10px] font-black text-violet-600">{round.name}</div>
                            {round.entries.map(({ file, agent, role }) => {
                              const active = selectedPath === file.path;
                              const metaLine = [agent, role].filter(Boolean).join(' · ');
                              return (
                                <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={`group relative mb-1 flex w-full cursor-pointer items-start gap-2 border-l-4 px-3 py-2.5 text-left transition-colors duration-150 ease-out ${active ? 'border-l-violet-500 bg-violet-50 text-slate-950' : 'border-l-transparent bg-white/35 hover:border-l-violet-300 hover:bg-white'}`}>
                                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border transition-colors duration-150 ease-out ${active ? 'border-violet-200 bg-white text-violet-700' : 'border-slate-200 bg-white/70 text-slate-500 group-hover:border-violet-200 group-hover:text-violet-600'}`}>
                                    {languageFromPath(file.name) === 'plaintext' ? <FileText size={15} /> : <Code2 size={15} />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-black leading-5 text-slate-900" title={file.name}>{file.name}</div>
                                    {metaLine && <div className="mt-0.5 truncate text-[11px] font-black text-violet-600" title={metaLine}>{metaLine}</div>}
                                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-semibold text-slate-400">
                                      <span className="shrink-0 font-black uppercase tracking-[0.08em] text-slate-500">{fileKindLabel(file)}</span>
                                      <span className="shrink-0">{formatSize(file.size)}</span>
                                      {file.truncated && <span className="shrink-0 font-black text-amber-600">已截断</span>}
                                      <span className="truncate font-mono" title={file.path}>{shortPath(file.path)}</span>
                                    </div>
                                  </div>
                                  <ChevronRight size={14} className={`mt-1.5 shrink-0 transition duration-150 ease-out ${active ? 'text-violet-600' : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-violet-500'}`} />
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </aside>
            <div className="min-w-0 bg-slate-950">
              <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-100" title={selected?.name || ''}>{selected?.name || '-'}</div>
                  {(() => {
                    const entry = files.find((candidate) => candidate.file.path === selectedPath);
                    const metaLine = [entry?.stage, entry?.section, entry?.round, entry?.agent, entry?.role].filter(Boolean).join(' / ');
                    return metaLine ? <div className="mt-0.5 truncate text-[11px] font-black text-violet-300" title={metaLine}>{metaLine}</div> : null;
                  })()}
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={selected?.path || ''}>{selected?.path || '-'}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isSelectedJsonlSession && (
                    <button type="button" onClick={() => setAutoRefreshSession((value) => !value)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${shouldAutoRefreshSession ? 'bg-emerald-900/70 text-emerald-200' : 'bg-slate-800 text-slate-400'}`}>
                      {sessionRefreshing ? '同步中' : autoRefreshSession ? (isTaskRunning ? '自动刷新 ON' : '继续刷新 ON') : '自动刷新 OFF'}
                    </button>
                  )}
                  <div className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">{selected ? fileKindLabel(selected) : '-'}</div>
                </div>
              </div>
              <div className="h-[680px]">
                {isSelectedJsonlSession && selected ? (
                  <PiSessionPreview key={selectedPreviewKey} file={selected} />
                ) : (
                  <Editor
                    height="100%"
                    language={languageFromPath(selected?.name)}
                    value={selected?.content || ''}
                    theme="vs-dark"
                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, renderWhitespace: 'selection' }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
