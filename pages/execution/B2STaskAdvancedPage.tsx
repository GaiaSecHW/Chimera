import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ChevronRight, Code2, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../clients/api';
import { B2SAdvancedFile, B2SAdvancedRun, B2SArtifact, B2SReviewAnalytics, B2STaskDetail, B2STaskItemAdvanced } from '../../clients/binaryToSource';
import { FileWatchMessage, fileserverApi } from '../../clients/fileserver';
import { parseAgentSessionJsonlDelta } from './agentSessionParsing';
import { ReviewEffectivenessPanel } from './b2s-advanced/ReviewEffectivenessPanel';
import { B2SSessionPreview } from './b2s-detail/B2SSessionPreview';
import { PageHeader } from '../../design-system';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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

const shortPath = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 4) return normalized;
  return`.../${parts.slice(-4).join('/')}`;
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
  if (value < 1024) return`${value} B`;
  if (value < 1024 * 1024) return`${(value / 1024).toFixed(1)} KB`;
  return`${(value / 1024 / 1024).toFixed(2)} MB`;
};

const extractFsRelPath = (absolutePath: string, projectId: string): string | null => {
  const prefix =`/data/files/${projectId}`;
  if (!absolutePath.startsWith(prefix)) return null;
  const rel = absolutePath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel :`/${rel}`;
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
  return attempt ?`第 ${attempt} 轮` : undefined;
};

const batchNumberFromName = (name?: string | null) => {
  const match = String(name || '').match(/batch[_-]?(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

const batchLabel = (batchName?: string | null, batchNo?: number | null) => {
  if (batchNo) return`Batch ${String(batchNo).padStart(3, '0')}`;
  const match = String(batchName || '').match(/batch[_-]?(\d+)/i);
  return match ?`Batch ${String(Number(match[1])).padStart(3, '0')}` : (batchName || 'Batch');
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
  if (lower.includes('header')) return { stage: '阶段 3 · 共享头文件合成', stageOrder: 3000, section: 'Header Agent', sectionOrder: 0, round: attemptNo ?`第 ${attemptNo} 轮` : run.name, roundOrder: attemptNo || 0, agent, role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话' };
  if (batchNo || lower.includes('executor') || lower.includes('validator')) {
    const batch = batchNo ?`Batch ${String(batchNo).padStart(3, '0')}` : 'Batch 处理';
    const isValidator = lower.includes('validator');
    return {
      stage:`阶段 4 · ${batch} 函数`,
      stageOrder: 4000 + (batchNo || 999),
      section: isValidator ? '评审' : '执行',
      sectionOrder: isValidator ? 20 : 10,
      round: isValidator ? (attemptNo ?`第 ${attemptNo} 次评审` : '评审会话') : '执行会话',
      roundOrder: attemptNo || 0,
      agent,
      role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话',
    };
  }
  return { stage: '阶段 4 · Agent 会话', stageOrder: 4999, section: '其他会话', sectionOrder: 90, round: attemptNo ?`第 ${attemptNo} 轮` : run.name, roundOrder: attemptNo || 0, agent, role: isSystemPrompt ? 'System Prompt' : 'JSONL 会话' };
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

export const B2STaskAdvancedPage: React.FC<Props> = ({ projectId, taskId, itemId, onBack }) => {
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [advanced, setAdvanced] = useState<B2STaskItemAdvanced | null>(null);
  const [artifacts, setArtifacts] = useState<B2SArtifact[]>([]);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});
  const [sessionContentByPath, setSessionContentByPath] = useState<Record<string, string>>({});
  const [reviewAnalytics, setReviewAnalytics] = useState<B2SReviewAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const sessionLineCountRef = useRef(0);

  const load = async () => {
    if (!projectId || !taskId || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskDetail, advancedDetail, artifactsDetail, analyticsDetail] = await Promise.all([
        api.domains.execution.binaryToSource.getTask(projectId, taskId),
        api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, false),
        api.domains.execution.binaryToSource.getTaskItemArtifacts(projectId, taskId, itemId),
        api.domains.execution.binaryToSource.getTaskItemReviewAnalytics(projectId, taskId, itemId),
      ]);
      setDetail(taskDetail);
      setAdvanced(advancedDetail);
      setArtifacts(artifactsDetail.artifacts || []);
      setArtifactContent({});
      setSessionContentByPath({});
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
        const stage =`阶段 4 · ${batchName} 函数`;
        const stageOrder = 4000 + batchNo;
        if (batch.disasm) list.push(entryFromFile(batch.disasm, { stage: '阶段 2 · Batch 上下文切片', stageOrder: 2000, round: batchName, file: batch.disasm }));
        if (batch.source) list.push(entryFromFile(batch.source, { stage, stageOrder, section: '执行', sectionOrder: 10, round: '执行输出', roundOrder: 0, agent: 'executor agent', role: 'batch 输出', file: batch.source }));
        batch.review_snapshots.forEach((file) => {
          const attemptNo = attemptNumberFromName(file.name) || 0;
          list.push(entryFromFile(file, { stage, stageOrder, section: '评审', sectionOrder: 20, round: attemptNo ?`第 ${attemptNo} 次评审` : '评审轮次', roundOrder: attemptNo, agent: 'validator agent', role: '评审输入', file }));
        });
        batch.reviews.forEach((file) => {
          const attemptNo = attemptNumberFromName(file.name) || 0;
          list.push(entryFromFile(file, { stage, stageOrder, section: '评审', sectionOrder: 20, round: attemptNo ?`第 ${attemptNo} 次评审` : '评审轮次', roundOrder: attemptNo, agent: 'validator agent', role: '评审输出', file }));
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

  const closeSessionSocket = () => {
    if (!sessionSocketRef.current) return;
    try {
      if (sessionSocketRef.current.readyState === WebSocket.OPEN) {
        sessionSocketRef.current.send(JSON.stringify({ action: 'close' }));
      }
    } catch {
      // ignore close send errors
    }
    try {
      sessionSocketRef.current.close();
    } catch {
      // ignore socket close errors
    }
    sessionSocketRef.current = null;
    setSessionLive(false);
  };

  const selectedBase = files.find((entry) => entry.file.path === selectedPath)?.file || null;
  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedPath);
  const selected = selectedBase
    ? {
        ...selectedBase,
        content: sessionContentByPath[selectedBase.path]
          ?? (selectedArtifact ? artifactContent[selectedArtifact.id] ?? selectedBase.content : selectedBase.content),
      }
    : null;
  const isSelectedJsonlSession = !!selected && selected.kind === 'agent_session' && selected.name.toLowerCase().endsWith('.jsonl');
  const item = detail?.items.find((entry) => entry.id === itemId || String(entry.sequence_no) === itemId);
  const isTaskRunning = isB2SActiveStatus(detail?.status) || isB2SActiveStatus(item?.status) || !!(detail?.running_items || detail?.cancelling_items || detail?.queued_items || detail?.pending_items);
  const selectedPreviewKey = selected ?`${selected.path}:${selected.size}:${selected.content?.length || 0}:${selected.content?.slice(-160) || ''}` : 'empty';

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

  useEffect(() => () => {
    closeSessionSocket();
  }, []);

  useEffect(() => {
    if (!isSelectedJsonlSession || !selected || !selected.path) {
      closeSessionSocket();
      setSessionRefreshing(false);
      setSessionError(null);
      return;
    }
    setSessionRefreshing(true);
    setSessionError(null);
    const initialContent = selected.content || '';
    setSessionContentByPath((current) => ({ ...current, [selected.path]: initialContent }));
    sessionLineCountRef.current = initialContent.split(/\r?\n/).filter(Boolean).length;

    if (!isTaskRunning) {
      setSessionRefreshing(false);
      setSessionLive(false);
      return;
    }

    const watchPath = extractFsRelPath(selected.path, projectId);
    if (!watchPath) {
      setSessionRefreshing(false);
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }

    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: sessionLineCountRef.current,
    });
    sessionSocketRef.current = socket;

    socket.onopen = () => {
      setSessionRefreshing(false);
      setSessionLive(true);
      setSessionError(null);
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot') {
          setSessionRefreshing(false);
          setSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          setSessionContentByPath((current) => {
            const existing = current[selected.path] || '';
            const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
            return { ...current, [selected.path]:`${existing}${prefix}${deltaLines.join('\n')}` };
          });
          parseAgentSessionJsonlDelta(deltaLines, (message.from_line ?? sessionLineCountRef.current) + 1);
          sessionLineCountRef.current = message.to_line ?? (sessionLineCountRef.current + deltaLines.length);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setSessionLive(false);
            setSessionError('会话文件已重置，请手动刷新以重新同步完整内容');
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
      } catch (e: any) {
        setSessionLive(false);
        setSessionError(e?.message || '解析会话增量消息失败');
      }
    };
    socket.onerror = () => {
      setSessionRefreshing(false);
      setSessionLive(false);
    };
    socket.onclose = () => {
      setSessionRefreshing(false);
      setSessionLive(false);
    };

    return () => {
      if (sessionSocketRef.current === socket) {
        closeSessionSocket();
      } else {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [projectId, selected?.content, selected?.path, isSelectedJsonlSession, isTaskRunning]);

  const totalBatches = advanced?.runs.reduce((sum, run) => sum + run.batches.length, 0) || 0;
  const totalReviews = advanced?.runs.reduce((sum, run) => sum + run.batches.reduce((n, batch) => n + batch.reviews.length + batch.review_snapshots.length, 0), 0) || 0;
  const totalSessions = advanced?.runs.reduce((sum, run) => sum + run.agent_sessions.length, 0) || 0;

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      <PageHeader
        title={
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-theme-text-muted">
              <span className="text-violet-400">反编译任务</span>
              <span className="text-theme-text-faint">·</span>
              <span>#{advanced?.sequence_no || item?.sequence_no || '-'}</span>
              <span className="text-theme-text-faint">·</span>
              <span>{advanced?.mode_label || detail?.mode_label || '-'}</span>
            </div>
            <div className="mt-1 break-words text-lg font-semibold tracking-tight text-slate-950">{fileNameOf(item?.elf_path)}</div>
            <div className="mt-0.5 break-all font-mono text-[10px] font-semibold text-theme-text-muted">task {taskId} · item {itemId}</div>
          </div>
        }
        back={{ label: '返回执行明细', onClick: onBack }}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
            <span className="rounded-full bg-violet-500/15 px-3 py-1.5 text-violet-400 ring-1 ring-violet-100 text-xs font-semibold">Batch {totalBatches}</span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-emerald-400 ring-1 ring-emerald-100 text-xs font-semibold">评审 {totalReviews}</span>
            <span className="rounded-full bg-blue-500/15 px-3 py-1.5 text-blue-400 ring-1 ring-blue-100 text-xs font-semibold">会话 {totalSessions}</span>
          </div>
        }
      />

      {error && <div className="rounded-none border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>}

      <ReviewEffectivenessPanel analytics={reviewAnalytics} />

 <section id="b2s-artifacts" className="scroll-mt-24 overflow-hidden rounded-none border border-theme-border bg-theme-surface">
        {loading && !advanced ? (
          <div className="flex items-center gap-2 p-8 text-sm text-theme-text-muted"><Loader2 size={16} className="animate-spin" />加载中...</div>
        ) : files.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-theme-text-muted">未找到 batch 中间结果、评审快照或 Agent 会话记录。</div>
        ) : (
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)]">
            <aside className="border-b border-theme-border bg-slate-50/80 xl:border-b-0 xl:border-r">
              <div className="border-b border-theme-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">中间产物</div>
              <div className="max-h-[680px] overflow-auto p-3">
                {groupedFiles.map((group) => (
                  <div key={group.stage} className="mb-5">
                    <div className="mb-2 border-b border-theme-border bg-theme-elevated px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">{group.stage}</div>
                    {group.sections.map((section) => (
                      <div key={`${group.stage}-${section.name}`} className="mb-3 pl-1">
                        <div className="mb-2 text-[11px] font-medium tracking-[0.12em] text-theme-text-secondary">{section.name}</div>
                        {section.rounds.map((round) => (
                          <div key={`${group.stage}-${section.name}-${round.name}`} className="mb-2">
                            <div className="mb-1 text-[10px] font-semibold text-violet-400">{round.name}</div>
                            {round.entries.map(({ file, agent, role }) => {
                              const active = selectedPath === file.path;
                              const metaLine = [agent, role].filter(Boolean).join(' · ');
                              return (
                                <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={`group relative mb-1 flex w-full cursor-pointer items-start gap-2 border-l-4 px-3 py-2.5 text-left transition-colors duration-150 ease-out ${active ? 'border-l-violet-500 bg-violet-500/15 text-slate-950' : 'border-l-transparent bg-slate-50/35 hover:border-l-violet-300 hover:bg-theme-elevated'}`}>
 <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border transition-colors duration-150 ease-out ${active ? 'border-violet-500/20 bg-theme-elevated text-violet-400' : 'border-theme-border bg-theme-elevated text-theme-text-muted group-hover:border-violet-500/20 group-hover:text-violet-400'}`}>
                                    {languageFromPath(file.name) === 'plaintext' ? <FileText size={15} /> : <Code2 size={15} />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold leading-5 text-theme-text-primary" title={file.name}>{file.name}</div>
                                    {metaLine && <div className="mt-0.5 truncate text-[11px] font-semibold text-violet-400" title={metaLine}>{metaLine}</div>}
                                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-semibold text-theme-text-muted">
                                      <span className="shrink-0 font-semibold uppercase tracking-[0.08em] text-theme-text-muted">{fileKindLabel(file)}</span>
                                      <span className="shrink-0">{formatSize(file.size)}</span>
                                      {file.truncated && <span className="shrink-0 font-semibold text-amber-400">已截断</span>}
                                      <span className="truncate font-mono" title={file.path}>{shortPath(file.path)}</span>
                                    </div>
                                  </div>
                                  <ChevronRight size={14} className={`mt-1.5 shrink-0 transition duration-150 ease-out ${active ? 'text-violet-400' : 'text-theme-text-faint group-hover:translate-x-0.5 group-hover:text-violet-500'}`} />
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
            <div className="min-w-0 bg-theme-surface">
              <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-theme-border bg-theme-surface px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100" title={selected?.name || ''}>{selected?.name || '-'}</div>
                  {(() => {
                    const entry = files.find((candidate) => candidate.file.path === selectedPath);
                    const metaLine = [entry?.stage, entry?.section, entry?.round, entry?.agent, entry?.role].filter(Boolean).join(' / ');
                    return metaLine ? <div className="mt-0.5 truncate text-[11px] font-semibold text-violet-300" title={metaLine}>{metaLine}</div> : null;
                  })()}
                  <div className="mt-0.5 truncate font-mono text-[11px] text-theme-text-muted" title={selected?.path || ''}>{selected?.path || '-'}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isSelectedJsonlSession && (
                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${sessionLive ? 'bg-emerald-900/70 text-emerald-200' : isTaskRunning ? 'bg-amber-900/70 text-amber-200' : 'bg-theme-elevated text-theme-text-muted'}`}>
                      {sessionRefreshing ? '连接中' : sessionLive ? 'WebSocket 实时中' : isTaskRunning ? '等待实时连接' : '历史会话'}
                    </span>
                  )}
                  <div className="rounded-full bg-theme-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-theme-text-faint">{selected ? fileKindLabel(selected) : '-'}</div>
                </div>
              </div>
              <div className="h-[680px]">
                {isSelectedJsonlSession && selected ? (
                  <div className="space-y-3 bg-theme-elevated p-3">
                    {sessionError ? <div className="rounded-xl border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{sessionError}</div> : null}
                    <B2SSessionPreview key={selectedPreviewKey} name={selected.name} content={selected.content} meta={{ live: sessionLive, relativePath: selected.path }} />
                  </div>
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
