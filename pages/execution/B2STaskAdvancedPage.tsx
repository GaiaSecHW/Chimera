import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ArrowLeft, Code2, FileText, Loader2, RefreshCw } from 'lucide-react';

import { api } from '../../clients/api';
import { B2SAdvancedFile, B2STaskDetail, B2STaskItemAdvanced } from '../../clients/binaryToSource';

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
  return content.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line) as PiSessionEntry; } catch { return null; }
  }).filter((entry): entry is PiSessionEntry => !!entry);
};

const textFromContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((block) => {
    if (!block) return '';
    if (block.type === 'text') return block.text || '';
    if (block.type === 'thinking') return block.thinking || '';
    if (block.type === 'toolCall') return `Tool call: ${block.name || ''}\n${JSON.stringify(block.arguments || {}, null, 2)}`;
    if (block.type === 'image') return `[image: ${block.mimeType || 'image'}]`;
    return JSON.stringify(block);
  }).filter(Boolean).join('\n\n');
  return content ? JSON.stringify(content, null, 2) : '';
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
  const modelChanges = entries.filter((entry) => entry.type === 'model_change');
  const toolCalls = messages.flatMap((entry) => {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((block: any) => block?.type === 'toolCall');
  });
  return (
    <div className="h-full overflow-auto bg-[#0b1020] p-5 text-slate-100">
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
        {entries.filter((entry) => entry.type !== 'session').map((entry, index) => {
          const role = entry.message?.role || entry.type;
          const isUser = role === 'user';
          const isAssistant = role === 'assistant';
          const isTool = role === 'toolResult' || role === 'bashExecution';
          const body = entry.type === 'message'
            ? textFromContent(entry.message?.content)
            : entry.type === 'model_change'
              ? `Model: ${entry.provider || '-'} / ${entry.modelId || '-'}`
              : entry.type === 'thinking_level_change'
                ? `Thinking level: ${entry.thinkingLevel || '-'}`
                : JSON.stringify(entry, null, 2);
          return (
            <article key={`${entry.id || index}-${index}`} className={`rounded-2xl border p-4 ${isUser ? 'border-blue-800 bg-blue-950/40' : isAssistant ? 'border-emerald-800 bg-emerald-950/30' : isTool ? 'border-amber-800 bg-amber-950/25' : 'border-slate-700 bg-slate-900/60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-xs font-black">
                <span className={`${isUser ? 'text-blue-300' : isAssistant ? 'text-emerald-300' : isTool ? 'text-amber-300' : 'text-slate-300'}`}>{role}</span>
                <span className="font-mono text-slate-500">{entry.timestamp || entry.id || ''}</span>
              </div>
              <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{body}</pre>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState('');

  const load = async () => {
    if (!projectId || !taskId || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskDetail, advancedDetail] = await Promise.all([
        api.domains.execution.binaryToSource.getTask(projectId, taskId),
        api.domains.execution.binaryToSource.getTaskItemAdvanced(projectId, taskId, itemId, true),
      ]);
      setDetail(taskDetail);
      setAdvanced(advancedDetail);
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
    const list: Array<{ group: string; file: B2SAdvancedFile }> = [];
    advanced?.runs.forEach((run) => {
      run.files.forEach((file) => list.push({ group: `${run.name} / 运行文件`, file }));
      run.batches.forEach((batch) => {
        if (batch.disasm) list.push({ group: `${run.name} / ${batch.name}`, file: batch.disasm });
        if (batch.source) list.push({ group: `${run.name} / ${batch.name}`, file: batch.source });
        batch.review_snapshots.forEach((file) => list.push({ group: `${run.name} / ${batch.name}`, file }));
        batch.reviews.forEach((file) => list.push({ group: `${run.name} / ${batch.name}`, file }));
      });
      run.agent_sessions.forEach((file) => list.push({ group: `${run.name} / Agent 会话`, file }));
    });
    advanced?.ida_files.forEach((file) => list.push({ group: 'IDA 缓存', file }));
    return list;
  }, [advanced]);

  useEffect(() => {
    setSelectedPath((current) => current && files.some((entry) => entry.file.path === current) ? current : (files[0]?.file.path || ''));
  }, [files]);

  const selected = files.find((entry) => entry.file.path === selectedPath)?.file || null;
  const item = detail?.items.find((entry) => entry.id === itemId || String(entry.sequence_no) === itemId);
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Advanced B2S Trace</div>
            <h1 className="mt-3 break-words text-3xl font-black tracking-tight text-slate-950">高级信息 · #{advanced?.sequence_no || item?.sequence_no || '-'}</h1>
            <div className="mt-2 break-all font-mono text-xs font-semibold text-slate-500">任务 {taskId} · item {itemId}</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">{fileNameOf(item?.elf_path)} · {advanced?.mode_label || detail?.mode_label || '-'}</div>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 xl:w-[420px]">
            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-violet-900"><div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-60">Batch</div><div className="mt-1 text-2xl font-black">{totalBatches}</div></div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900"><div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-60">评审</div><div className="mt-1 text-2xl font-black">{totalReviews}</div></div>
            <div className="rounded-2xl bg-blue-50 px-4 py-3 text-blue-900"><div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-60">会话</div><div className="mt-1 text-2xl font-black">{totalSessions}</div></div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        {loading && !advanced ? (
          <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载中...</div>
        ) : files.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">未找到 batch 中间结果、评审快照或 Agent 会话记录。</div>
        ) : (
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 bg-slate-50/80 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">中间产物</div>
              <div className="max-h-[680px] overflow-auto p-3">
                {files.map(({ group, file }) => {
                  const active = selectedPath === file.path;
                  return (
                    <button key={file.path} type="button" onClick={() => setSelectedPath(file.path)} className={`mb-2 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-violet-300 bg-white shadow-sm ring-2 ring-violet-100' : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'}`}>
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                        {languageFromPath(file.name) === 'plaintext' ? <FileText size={17} /> : <Code2 size={17} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5 text-slate-900 [overflow-wrap:anywhere]" title={file.name}>{file.name}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-black text-slate-500"><span>{fileKindLabel(file)}</span><span>{formatSize(file.size)}</span>{file.truncated && <span className="text-amber-600">已截断</span>}</div>
                        <div className="mt-1 truncate text-[11px] font-semibold text-slate-400" title={group}>{group}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
            <div className="min-w-0 bg-slate-950">
              <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-100" title={selected?.name || ''}>{selected?.name || '-'}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={selected?.path || ''}>{selected?.path || '-'}</div>
                </div>
                <div className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">{selected ? fileKindLabel(selected) : '-'}</div>
              </div>
              <div className="h-[680px]">
                {selected?.name.toLowerCase().endsWith('.jsonl') && selected.kind === 'agent_session' ? (
                  <PiSessionPreview file={selected} />
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
