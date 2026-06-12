import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Loader2, Pause, Play, ShieldAlert, Trash2 } from 'lucide-react';

import type {
  AppScanCallChainStep,
  AppScanFinding,
  AppScanFindingsSummary,
  AppScanPhaseProgress,
  AppScanStatus,
  AppScanTask,
} from '../../clients/appScan';
import { appScanApi } from '../../clients/appScan';
import { showConfirm } from '../../components/DialogService';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------
interface Props {
  projectId: string;
  toolTaskId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = new Set<AppScanStatus>(['pending', 'decompiling', 'running']);
const POLL_INTERVAL_MS = 3000;

// 排序权重：validation_result 越靠前优先级越高
const RESULT_ORDER: Record<string, number> = {
  CONFIRMED: 0,
  LIKELY: 1,
  POSSIBLE: 2,
  FALSE_POSITIVE: 3,
};
// 严重程度排序权重
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const resultRank = (result: string | null) => {
  const key = (result || '').toUpperCase();
  return RESULT_ORDER[key] ?? 4; // 空/未知 排最后
};
const severityRank = (severity: string | null) => {
  const key = (severity || '').toUpperCase();
  return SEVERITY_ORDER[key] ?? 5; // 空/未知 排最后
};

const statusTone = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'running':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'decompiling':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'paused':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    decompiling: '反编译中',
    running: '扫描中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
};

const fmtTimestamp = (value?: number | null) => {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString();
};

const fmtStringTimestamp = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const phaseLabel = (phase: string) => {
  const map: Record<string, string> = {
    detection: '检测',
    mining: '挖掘',
    validation: '验证',
  };
  return map[phase] || phase;
};

const phaseColor = (index: number) => {
  const colors = ['text-violet-600', 'text-sky-600', 'text-emerald-600'];
  return colors[index % colors.length];
};

const phaseBorderColor = (index: number) => {
  const colors = ['border-violet-200', 'border-sky-200', 'border-emerald-200'];
  return colors[index % colors.length];
};

// 严重程度配色
const severityTone = (severity: string) => {
  switch ((severity || '').toUpperCase()) {
    case 'CRITICAL':
      return 'bg-rose-100 text-rose-700';
    case 'HIGH':
      return 'bg-rose-50 text-rose-600';
    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700';
    case 'LOW':
      return 'bg-slate-100 text-slate-600';
    case 'INFO':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

// 验证结果配色
const resultTone = (result: string) => {
  switch ((result || '').toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-rose-50 text-rose-700';
    case 'LIKELY':
      return 'bg-orange-50 text-orange-700';
    case 'POSSIBLE':
      return 'bg-amber-50 text-amber-700';
    case 'FALSE_POSITIVE':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-500';
  }
};

const resultLabel = (result: string) => {
  const map: Record<string, string> = {
    CONFIRMED: '已确认',
    LIKELY: '很可能',
    POSSIBLE: '可能',
    FALSE_POSITIVE: '误报',
  };
  return map[(result || '').toUpperCase()] || result || '待验证';
};

// 把任意结构（字符串/对象/数组）渲染为可读文本
const renderAny = (val: unknown): string => {
  if (val == null) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return val;
      }
    }
    return val;
  }
  if (typeof val === 'object') {
    try {
      const obj = val as Record<string, unknown>;
      if (typeof obj.raw === 'string') return obj.raw;
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
};

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

const PhaseCard: React.FC<{ phase: string; progress: AppScanPhaseProgress; index: number }> = ({ phase, progress, index }) => {
  const { total, pending, running, success, failed } = progress;
  const completedPercent = total > 0 ? Math.round(((success + failed) / total) * 100) : 0;

  return (
    <div className={`rounded-xl border ${phaseBorderColor(index)} bg-white p-4`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-black ${phaseColor(index)}`}>{phaseLabel(phase)}</h4>
        <span className="text-xs font-bold text-slate-400">{completedPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        {total > 0 && (
          <div className="flex h-full">
            {success > 0 && (
              <div className="bg-emerald-400 transition-all" style={{ width: `${(success / total) * 100}%` }} />
            )}
            {running > 0 && (
              <div className="bg-sky-400 transition-all" style={{ width: `${(running / total) * 100}%` }} />
            )}
            {failed > 0 && (
              <div className="bg-rose-400 transition-all" style={{ width: `${(failed / total) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* Counts */}
      <div className="mt-3 grid grid-cols-5 gap-1 text-center">
        <div>
          <div className="text-xs font-bold text-slate-900">{total}</div>
          <div className="text-[10px] text-slate-400">总计</div>
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500">{pending}</div>
          <div className="text-[10px] text-slate-400">等待</div>
        </div>
        <div>
          <div className="text-xs font-bold text-sky-600">{running}</div>
          <div className="text-[10px] text-slate-400">运行</div>
        </div>
        <div>
          <div className="text-xs font-bold text-emerald-600">{success}</div>
          <div className="text-[10px] text-slate-400">成功</div>
        </div>
        <div>
          <div className="text-xs font-bold text-rose-600">{failed}</div>
          <div className="text-[10px] text-slate-400">失败</div>
        </div>
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
    <div className={`text-2xl font-black ${tone}`}>{value}</div>
    <div className="mt-0.5 text-xs font-semibold text-slate-500">{label}</div>
  </div>
);

const CallChain: React.FC<{ steps: AppScanCallChainStep[] }> = ({ steps }) => {
  if (!steps || steps.length === 0) return null;
  const roleTone: Record<string, string> = {
    source: 'bg-rose-500',
    sink: 'bg-purple-600',
    check: 'bg-emerald-500',
    propagation: 'bg-indigo-500',
  };
  const roleLabel: Record<string, string> = {
    source: 'Source',
    sink: 'Sink',
    check: 'Check',
    propagation: 'Step',
  };
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <h4 className="mb-2 text-xs font-bold text-indigo-600">调用链</h4>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const role = s.role || 'propagation';
          const desc = s.description || s.action || '';
          const loc = s.file ? `${s.file}${s.line ? `:${s.line}` : ''}` : (s.location || '');
          const tone = roleTone[role] || 'bg-indigo-500';
          return (
            <div key={i} className="flex items-start gap-2">
              <div className={`${tone} mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-white`}>
                {s.step || i + 1}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-slate-700">{desc}</span>
                  <span className={`${tone} rounded px-1 py-px text-[0.6rem] text-white opacity-80`}>{roleLabel[role] || role}</span>
                </div>
                {s.code && (
                  <pre className="mt-0.5 overflow-x-auto rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[0.7rem] text-slate-700">{s.code}</pre>
                )}
                {loc && <div className="mt-0.5 break-all font-mono text-[0.7rem] text-indigo-500">{loc}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FindingCard: React.FC<{ finding: AppScanFinding; defaultOpen?: boolean }> = ({ finding, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const fDisp = finding.display_id || finding.id;
  const hasDetail = Boolean(
    finding.description ||
      (finding.call_chain && finding.call_chain.length) ||
      finding.analysis ||
      finding.fix_suggestion ||
      finding.cvss_vector ||
      finding.cvss_explanation,
  );

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-slate-300">
      {/* Header (click to expand) */}
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 p-4 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hasDetail && <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-800">{finding.title || fDisp}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{fDisp} · {finding.vuln_type}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${severityTone(finding.severity)}`}>{finding.severity || '-'}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${resultTone(finding.validation_result || '')}`}>{resultLabel(finding.validation_result || '')}</span>
          {finding.total_score != null && (
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">{finding.total_score}分</span>
          )}
        </div>
      </button>

      {/* Detail */}
      {open && hasDetail && (
        <div className="border-t border-slate-100 p-4">
          {finding.description && (
            <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{finding.description}</p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {finding.call_chain && finding.call_chain.length > 0 && (
              <div className="md:col-span-2">
                <CallChain steps={finding.call_chain} />
              </div>
            )}
            {finding.cvss_vector || finding.cvss_explanation ? (
              <div className={`rounded-lg bg-slate-50 p-3 ${!finding.fix_suggestion ? 'md:col-span-2' : ''}`}>
                <h4 className="mb-1 text-xs font-bold text-indigo-600">
                  CVSS 评分{finding.cvss_score != null && <span className="ml-1 font-bold text-indigo-700">{finding.cvss_score}</span>}
                </h4>
                {finding.cvss_vector && <div className="mb-1 font-mono text-xs text-indigo-600">{finding.cvss_vector}</div>}
                {finding.cvss_explanation && (
                  <div className="whitespace-pre-wrap text-xs text-slate-500">{finding.cvss_explanation}</div>
                )}
              </div>
            ) : null}
            {finding.fix_suggestion ? (
              <div className={`rounded-lg bg-slate-50 p-3 ${!finding.cvss_vector && !finding.cvss_explanation ? 'md:col-span-2' : ''}`}>
                <h4 className="mb-1 text-xs font-bold text-indigo-600">修复建议</h4>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{renderAny(finding.fix_suggestion)}</pre>
              </div>
            ) : null}
            {finding.analysis ? (
              <div className="md:col-span-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <h4 className="mb-1 text-xs font-bold text-indigo-600">分析</h4>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{renderAny(finding.analysis)}</pre>
                </div>
              </div>
            ) : null}
          </div>

          {/* Sub-scores */}
          {(finding.total_score != null || finding.cvss_score != null) && (
            <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3">
              {finding.total_score != null && (
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-600">{finding.total_score}</div>
                  <div className="text-[0.65rem] text-slate-400">总分</div>
                </div>
              )}
              {finding.cvss_score != null && (
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-600">{finding.cvss_score}</div>
                  <div className="text-[0.65rem] text-slate-400">CVSS</div>
                </div>
              )}
              {finding.created_at && (
                <div className="text-center">
                  <div className="text-sm font-bold text-slate-600">{fmtStringTimestamp(finding.created_at)}</div>
                  <div className="text-[0.65rem] text-slate-400">发现时间</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------
export const AppScanTaskDetailPage: React.FC<Props> = ({ projectId, toolTaskId, onBack }) => {
  const [task, setTask] = useState<AppScanTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Findings
  const [findings, setFindings] = useState<AppScanFinding[]>([]);
  const [findingsSummary, setFindingsSummary] = useState<AppScanFindingsSummary | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Scroll preservation (background refresh shouldn't move the viewport) ----
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const savedScrollTopRef = useRef<number | null>(null);

  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef.current && document.body.contains(scrollContainerRef.current)) {
      return scrollContainerRef.current;
    }
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        scrollContainerRef.current = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  // ---- Load task ----
  const load = useCallback(async () => {
    if (!toolTaskId) return;
    setError(null);
    try {
      const data = await appScanApi.getTask(toolTaskId);
      if (!mountedRef.current) return;
      setTask(data);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || '加载失败');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [toolTaskId]);

  // ---- Load findings ----
  const loadFindings = useCallback(async (opts?: { silent?: boolean }) => {
    if (!toolTaskId) return;
    if (!opts?.silent) setFindingsLoading(true);
    try {
      const data = await appScanApi.getTaskFindings(toolTaskId);
      if (!mountedRef.current) return;
      setFindings(data.findings || []);
      setFindingsSummary(data.summary || null);
    } catch {
      // 漏洞加载失败不阻断主流程，静默处理（详情页仍可用）
      if (!mountedRef.current) return;
    } finally {
      if (mountedRef.current && !opts?.silent) setFindingsLoading(false);
    }
  }, [toolTaskId]);

  // Restore scroll position after a background refresh committed its DOM changes
  useLayoutEffect(() => {
    if (savedScrollTopRef.current == null) return;
    const sc = findScrollContainer();
    if (sc) sc.scrollTop = savedScrollTopRef.current;
    savedScrollTopRef.current = null;
  }, [task, findings, findScrollContainer]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void load();
    void loadFindings();
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [load, loadFindings]);

  // Auto-poll for active tasks (task status + findings) — silent, preserves scroll
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (task && ACTIVE_STATUSES.has(task.status)) {
      pollTimerRef.current = setTimeout(() => {
        // 保存当前滚动位置，刷新后由 useLayoutEffect 还原，避免滚动条跳顶
        const sc = findScrollContainer();
        if (sc) savedScrollTopRef.current = sc.scrollTop;
        void load();
        void loadFindings({ silent: true });
      }, POLL_INTERVAL_MS);
    }
  }, [task, load, loadFindings, findScrollContainer]);

  // ---- Actions ----
  const handlePause = async () => {
    setActionLoading(true);
    try {
      await appScanApi.pauseTask(toolTaskId);
      await load();
    } catch (e: any) {
      alert(e?.message || '暂停失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await appScanApi.resumeTask(toolTaskId);
      await load();
    } catch (e: any) {
      alert(e?.message || '恢复失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm({ title: '确认删除', message: `确定要删除任务 ${toolTaskId} 吗？此操作不可恢复。` });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await appScanApi.deleteTask(toolTaskId);
      onBack();
    } catch (e: any) {
      alert(e?.message || '删除失败');
      setActionLoading(false);
    }
  };

  const isActive = task ? ACTIVE_STATUSES.has(task.status) : false;
  const isPaused = task?.status === 'paused';
  const isTerminal = task ? !isActive && !isPaused : false;

  const phases = useMemo(() => {
    if (!task?.progress?.phases) return [];
    return Object.entries(task.progress.phases).map(([name, progress]) => ({
      name,
      progress,
    }));
  }, [task]);

  const filteredFindings = useMemo(() => {
    let result = findings;
    if (severityFilter) {
      result = result.filter((f) => (f.severity || '').toUpperCase() === severityFilter);
    }
    if (resultFilter) {
      result = result.filter((f) => (f.validation_result || '').toUpperCase() === resultFilter);
    }
    // 排序：先按验证结果 (CONFIRMED → LIKELY → POSSIBLE → FALSE_POSITIVE → 空)，
    // 同组内再按严重程度 (CRITICAL → HIGH → MEDIUM → LOW → INFO)
    return [...result].sort((a, b) => {
      const dr = resultRank(a.validation_result) - resultRank(b.validation_result);
      if (dr !== 0) return dr;
      return severityRank(a.severity) - severityRank(b.severity);
    });
  }, [findings, severityFilter, resultFilter]);

  const hasFindings = findings.length > 0;

  // ---- Render ----
  return (
    <div ref={rootRef} className="px-8 pb-10 pt-8 space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">App Security</p>
                <h1 className="text-xl font-black text-slate-900">应用扫描详情</h1>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500">{toolTaskId}</span>
              {task && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusTone(task.status)}`}>
                  {isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />}
                  {statusLabel(task.status)}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(isActive) && (
              <button
                type="button"
                onClick={() => void handlePause()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                暂停
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={() => void handleResume()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                恢复
              </button>
            )}
            {!isTerminal && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 disabled:opacity-60"
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
            {isTerminal && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          加载任务详情...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Task error from backend */}
      {!loading && task?.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          错误信息: {task.error}
        </div>
      )}

      {/* Task info */}
      {!loading && task && (
        <>
          {/* Timeline */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">时间线</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">创建时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.created_at)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">开始时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.started_at)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">完成时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.completed_at)}</div>
              </div>
            </div>
          </section>

          {/* Three-phase progress */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">三阶段进度</h2>
              {isActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                  实时更新
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">检测 → 挖掘 → 验证</p>
            {phases.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {phases.map((phase, idx) => (
                  <PhaseCard key={phase.name} phase={phase.name} progress={phase.progress} index={idx} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
                暂无阶段进度数据
              </div>
            )}
          </section>

          {/* Vulnerability findings */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-500" />
                <h2 className="text-lg font-black text-slate-900">漏洞报告</h2>
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                    扫描中
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void loadFindings()}
                disabled={findingsLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {findingsLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
                刷新
              </button>
            </div>

            {/* Summary stats */}
            {findingsSummary && (
              <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
                <SummaryStat label="总计" value={findingsSummary.total} />
                <SummaryStat label="已确认" value={findingsSummary.confirmed} tone="text-rose-600" />
                <SummaryStat label="很可能" value={findingsSummary.likely} tone="text-orange-600" />
                <SummaryStat label="可能" value={findingsSummary.possible} tone="text-amber-600" />
                <SummaryStat label="待验证" value={findingsSummary.pending_validation} tone="text-slate-600" />
                <SummaryStat label="误报" value={findingsSummary.false_positive} tone="text-slate-400" />
              </div>
            )}

            {/* Filters */}
            {hasFindings && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">全部严重程度</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                  <option value="INFO">INFO</option>
                </select>
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">全部验证结果</option>
                  <option value="CONFIRMED">已确认</option>
                  <option value="LIKELY">很可能</option>
                  <option value="POSSIBLE">可能</option>
                  <option value="FALSE_POSITIVE">误报</option>
                </select>
                <div className="text-sm text-slate-500">共 {filteredFindings.length} 条</div>
              </div>
            )}

            {/* Findings list */}
            <div className="mt-4">
              {findingsLoading && !hasFindings ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                  加载漏洞数据...
                </div>
              ) : filteredFindings.length > 0 ? (
                filteredFindings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <ShieldAlert size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-400">
                    {hasFindings ? '没有匹配的漏洞。' : '暂无漏洞数据，扫描完成后将在此展示。'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
