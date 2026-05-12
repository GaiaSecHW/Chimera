import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ArrowLeft, Code2, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { api } from '../../clients/api';
import { B2SAdvancedFile, B2SAdvancedRun, B2SArtifact, B2SReviewAnalytics, B2STaskDetail, B2STaskItemAdvanced } from '../../clients/binaryToSource';
import { ReviewEffectivenessPanel } from './b2s-advanced/ReviewEffectivenessPanel';

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
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Pi Agent Session</div>
        <div className="mt-2 break-all font-mono text-xs text-slate-400">{file.name}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-300 md:grid-cols-4">
          <div className="rounded-xl bg-slate-800 px-3 py-2">消息<br /><span className="text-lg font-black text-white">{messages.length}</span></div>
          <div className="rounded-xl bg-slate-800 px-3 py-2">工具调用<br /><span className="text-lg font-black text-white">{toolCalls.length}</span></div>
          <div className="rounded-xl bg-slate-800 px-3 py-2">模型<br /><span className="font-black text-white">{modelChanges[0]?.modelId || '-'}</span></div>
          <div className="rounded-xl bg-slate-800 px-3 py-2">会话 ID<br /><span className="font-mono font-black text-white">{header?.id || '-'}</span></div>
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
            <article key={`${entry.id || index}-${index}`} className={`rounded border p-[18px] ${isUser ? 'border-slate-700 bg-chat-user' : isAssistant ? 'border-transparent bg-transparent' : isTool ? 'border-emerald-500/25 bg-emerald-950/25' : 'border-slate-700 bg-slate-900/60'}`}>
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
  const [artifacts, setArtifacts] = useState<B2SArtifact[]>([]);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});
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
      const [taskDetail, advancedDetail, artifactsDetail, analyticsDetail] = await Promise.all([
        api.domains.execution.binaryToSource.getTask(projectId, taskId),
        api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, false),
        api.domains.execution.binaryToSource.getTaskItemArtifacts(projectId, taskId, itemId),
        api.domains.execution.binaryToSource.getTaskItemReviewAnalytics(projectId, taskId, itemId, false),
      ]);
      setDetail(taskDetail);
      setAdvanced(advancedDetail);
      setArtifacts(artifactsDetail.artifacts || []);
      setArtifactContent({});
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

  const selectedBase = files.find((entry) => entry.file.path === selectedPath)?.file || null;
  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedPath);
  const selected = selectedBase ? { ...selectedBase, content: selectedArtifact ? artifactContent[selectedArtifact.id] ?? selectedBase.content : selectedBase.content } : null;
  const isSelectedJsonlSession = !!selected && selected.kind === 'agent_session' && selected.name.toLowerCase().endsWith('.jsonl');
  const item = detail?.items.find((entry) => entry.id === itemId || String(entry.sequence_no) === itemId);
  const isTaskRunning = isB2SActiveStatus(detail?.status) || isB2SActiveStatus(item?.status) || !!(detail?.running_items || detail?.queued_items || detail?.pending_items);
  const shouldAutoRefreshSession = isSelectedJsonlSession && autoRefreshSession;
  const selectedPreviewKey = selected ? `${selected.path}:${selected.size}:${selected.content?.length || 0}:${selected.content?.slice(-160) || ''}` : 'empty';

  useEffect(() => {
    if (!projectId || !taskId || !itemId || !selectedArtifact || artifactContent[selectedArtifact.id] !== undefined) return;
    let cancelled = false;
    api.domains.execution.binaryToSource.getTaskItemArtifactContent(projectId, taskId, itemId, selectedArtifact.id)
      .then((payload) => {
        if (!cancelled) setArtifactContent((current) => ({ ...current, [selectedArtifact.id]: payload.content || '' }));
      })
      .catch(() => {
        if (!cancelled) setArtifactContent((current) => ({ ...current, [selectedArtifact.id]: '' }));
      });
    return () => { cancelled = true; };
  }, [projectId, taskId, itemId, selectedArtifact?.id, artifactContent]);

  useEffect(() => {
    if (!projectId || !taskId || !itemId || !selectedPath || !shouldAutoRefreshSession) return;
    let cancelled = false;
    let inFlight = false;
    const refreshSession = async () => {
      if (inFlight) return;
      inFlight = true;
      setSessionRefreshing(true);
      try {
        const [taskDetail, advancedDetail, artifactsDetail, analyticsDetail] = await Promise.all([
          api.domains.execution.binaryToSource.getTask(projectId, taskId),
          api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, false),
          api.domains.execution.binaryToSource.getTaskItemArtifacts(projectId, taskId, itemId),
          api.domains.execution.binaryToSource.getTaskItemReviewAnalytics(projectId, taskId, itemId, false),
        ]);
        if (!cancelled) {
          setDetail(taskDetail);
          setAdvanced(advancedDetail);
          setArtifacts(artifactsDetail.artifacts || []);
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

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <section className="rounded-card border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-black tracking-[0.18em] text-violet-600">反编译任务</div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">#{advanced?.sequence_no || item?.sequence_no || '-'}</span>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">{advanced?.mode_label || detail?.mode_label || '-'}</span>
            </div>
            <div className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">{fileNameOf(item?.elf_path)}</div>
            <div className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-500">任务 {taskId} · item {itemId}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700 ring-1 ring-violet-100">Batch {totalBatches}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">评审 {totalReviews}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100">会话 {totalSessions}</span>
          </div>
        </div>
      </section>

      <ReviewEffectivenessPanel analytics={reviewAnalytics} />

      <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
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
                  <div key={group.stage} className="mb-4">
                    <div className="sticky top-0 z-10 mb-2 rounded-xl border border-slate-200 bg-slate-100/95 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 shadow-sm backdrop-blur">{group.stage}</div>
                    {group.sections.map((section) => (
                      <div key={`${group.stage}-${section.name}`} className="mb-3 ml-1 border-l-2 border-slate-200 pl-3">
                        <div className="mb-2 text-[11px] font-black tracking-[0.12em] text-slate-700">{section.name}</div>
                        {section.rounds.map((round) => (
                          <div key={`${group.stage}-${section.name}-${round.name}`} className="mb-2">
                            <div className="mb-1 text-[10px] font-black text-violet-600">{round.name}</div>
                            {round.entries.map(({ file, agent, role }) => {
                              const active = selectedPath === file.path;
                              const metaLine = [agent, role].filter(Boolean).join(' · ');
                              return (
                                <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={`mb-2 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-violet-300 bg-white shadow-sm ring-2 ring-violet-100' : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'}`}>
                                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {languageFromPath(file.name) === 'plaintext' ? <FileText size={17} /> : <Code2 size={17} />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="break-words text-sm font-black leading-5 text-slate-900 [overflow-wrap:anywhere]" title={file.name}>{file.name}</div>
                                    {metaLine && <div className="mt-1 break-words text-[11px] font-black text-violet-600 [overflow-wrap:anywhere]" title={metaLine}>{metaLine}</div>}
                                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-black text-slate-500"><span>{fileKindLabel(file)}</span><span>{formatSize(file.size)}</span>{file.truncated && <span className="text-amber-600">已截断</span>}</div>
                                    <div className="mt-1 truncate font-mono text-[10px] font-semibold text-slate-400" title={file.path}>{shortPath(file.path)}</div>
                                  </div>
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
