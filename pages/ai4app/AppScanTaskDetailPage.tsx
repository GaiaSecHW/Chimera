import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Loader2, Pause, Play, ShieldAlert, Trash2 } from 'lucide-react';

import type {
  AppScanCallChainStep,
  AppScanFinding,
  AppScanFindingsSummary,
  AppScanPhaseProgress,
  AppScanStatus,
  AppScanTask,
} from './appScan';
import { appScanApi } from './appScan';
import { showConfirm } from '../../components/DialogService';
import { PageHeader } from '../../design-system';

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
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'failed':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
    case 'running':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
    case 'decompiling':
      return 'bg-violet-500/15 text-violet-400 border-violet-500/20';
    case 'paused':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    case 'pending':
      return 'bg-theme-elevated text-theme-text-muted border-theme-border';
    default:
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
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

// 阶段规范顺序：仅渲染 phases 中实际存在的 key
const PHASE_ORDER = ['preprocessing', 'detection', 'mining', 'deep_mining', 'validation'] as const;

const phaseLabel = (phase: string) => {
  const map: Record<string, string> = {
    preprocessing: '预处理',
    detection: '检测',
    mining: '挖掘',
    deep_mining: '深度挖掘',
    validation: '验证',
  };
  return map[phase] || phase;
};

const phaseColor = (index: number) => {
  const colors = ['text-amber-400', 'text-violet-400', 'text-sky-400', 'text-cyan-400', 'text-emerald-400'];
  return colors[index % colors.length];
};

const phaseBorderColor = (index: number) => {
  const colors = ['border-amber-500/20', 'border-violet-500/20', 'border-sky-500/20', 'border-cyan-500/20', 'border-emerald-500/20'];
  return colors[index % colors.length];
};

// 严重程度配色
const severityTone = (severity: string) => {
  switch ((severity || '').toUpperCase()) {
    case 'CRITICAL':
      return 'bg-rose-500/15 text-rose-400';
    case 'HIGH':
      return 'bg-rose-500/15 text-rose-400';
    case 'MEDIUM':
      return 'bg-amber-500/15 text-amber-400';
    case 'LOW':
      return 'bg-theme-elevated text-theme-text-secondary';
    case 'INFO':
      return 'bg-theme-elevated text-theme-text-muted';
    default:
      return 'bg-theme-elevated text-theme-text-secondary';
  }
};

// 验证结果配色
const resultTone = (result: string) => {
  switch ((result || '').toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-rose-500/15 text-rose-400';
    case 'LIKELY':
      return 'bg-orange-500/15 text-orange-400';
    case 'POSSIBLE':
      return 'bg-amber-500/15 text-amber-400';
    case 'FALSE_POSITIVE':
      return 'bg-theme-elevated text-theme-text-muted';
    default:
      return 'bg-theme-elevated text-theme-text-muted';
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
    <div className={`rounded-xl border ${phaseBorderColor(index)} bg-theme-surface p-4`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-semibold ${phaseColor(index)}`}>{phaseLabel(phase)}</h4>
        <span className="text-xs font-medium text-theme-text-muted">{completedPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-theme-elevated">
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
          <div className="text-xs font-medium text-theme-text-primary">{total}</div>
          <div className="text-[10px] text-theme-text-muted">总计</div>
        </div>
        <div>
          <div className="text-xs font-medium text-theme-text-muted">{pending}</div>
          <div className="text-[10px] text-theme-text-muted">等待</div>
        </div>
        <div>
          <div className="text-xs font-medium text-sky-400">{running}</div>
          <div className="text-[10px] text-theme-text-muted">运行</div>
        </div>
        <div>
          <div className="text-xs font-medium text-emerald-400">{success}</div>
          <div className="text-[10px] text-theme-text-muted">成功</div>
        </div>
        <div>
          <div className="text-xs font-medium text-rose-400">{failed}</div>
          <div className="text-[10px] text-theme-text-muted">失败</div>
        </div>
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone = 'text-theme-text-primary' }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center">
    <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    <div className="mt-0.5 text-xs font-semibold text-theme-text-muted">{label}</div>
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
    <div className="rounded-lg bg-theme-surface p-3">
      <h4 className="mb-2 text-xs font-medium text-indigo-400">调用链</h4>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const role = s.role || 'propagation';
          const desc = s.description || s.action || '';
          const loc = s.file ?`${s.file}${s.line ?`:${s.line}` : ''}` : (s.location || '');
          const tone = roleTone[role] || 'bg-indigo-500';
          return (
            <div key={i} className="flex items-start gap-2">
              <div className={`${tone} mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-medium text-white`}>
                {s.step || i + 1}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-theme-text-secondary">{desc}</span>
                  <span className={`${tone} rounded px-1 py-px text-[0.6rem] text-white opacity-80`}>{roleLabel[role] || role}</span>
                </div>
                {s.code && (
                  <pre className="mt-0.5 overflow-x-auto rounded border border-theme-border bg-theme-surface px-2 py-1 font-mono text-[0.7rem] text-theme-text-secondary">{s.code}</pre>
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
 <div className="mb-3 rounded-lg border border-theme-border bg-theme-surface transition hover:border-theme-border">
      {/* Header (click to expand) */}
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 p-4 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hasDetail && <ChevronDown size={14} className={`flex-shrink-0 text-theme-text-muted transition ${open ? 'rotate-180' : ''}`} />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-theme-text-primary">{finding.title || fDisp}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-theme-text-muted">{fDisp} · {finding.vuln_type}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${severityTone(finding.severity)}`}>{finding.severity || '-'}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${resultTone(finding.validation_result || '')}`}>{resultLabel(finding.validation_result || '')}</span>
          {finding.total_score != null && (
            <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-400">{finding.total_score}分</span>
          )}
        </div>
      </button>

      {/* Detail */}
      {open && hasDetail && (
        <div className="border-t border-theme-border p-4">
          {finding.description && (
            <p className="mb-4 whitespace-pre-wrap text-sm text-theme-text-secondary">{finding.description}</p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {finding.call_chain && finding.call_chain.length > 0 && (
              <div className="md:col-span-2">
                <CallChain steps={finding.call_chain} />
              </div>
            )}
            {finding.cvss_vector || finding.cvss_explanation ? (
              <div className={`rounded-lg bg-theme-surface p-3 ${!finding.fix_suggestion ? 'md:col-span-2' : ''}`}>
                <h4 className="mb-1 text-xs font-medium text-indigo-400">
                  CVSS 评分{finding.cvss_score != null && <span className="ml-1 font-medium text-indigo-400">{finding.cvss_score}</span>}
                </h4>
                {finding.cvss_vector && <div className="mb-1 font-mono text-xs text-indigo-400">{finding.cvss_vector}</div>}
                {finding.cvss_explanation && (
                  <div className="whitespace-pre-wrap text-xs text-theme-text-muted">{finding.cvss_explanation}</div>
                )}
              </div>
            ) : null}
            {finding.fix_suggestion ? (
              <div className={`rounded-lg bg-theme-surface p-3 ${!finding.cvss_vector && !finding.cvss_explanation ? 'md:col-span-2' : ''}`}>
                <h4 className="mb-1 text-xs font-medium text-indigo-400">修复建议</h4>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-theme-text-secondary">{renderAny(finding.fix_suggestion)}</pre>
              </div>
            ) : null}
            {finding.analysis ? (
              <div className="md:col-span-2">
                <div className="rounded-lg bg-theme-surface p-3">
                  <h4 className="mb-1 text-xs font-medium text-indigo-400">分析</h4>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-theme-text-secondary">{renderAny(finding.analysis)}</pre>
                </div>
              </div>
            ) : null}
          </div>

          {/* Sub-scores */}
          {(finding.total_score != null || finding.cvss_score != null) && (
            <div className="mt-3 flex flex-wrap gap-4 border-t border-theme-border pt-3">
              {finding.total_score != null && (
                <div className="text-center">
                  <div className="text-lg font-medium text-indigo-400">{finding.total_score}</div>
                  <div className="text-[0.65rem] text-theme-text-muted">总分</div>
                </div>
              )}
              {finding.cvss_score != null && (
                <div className="text-center">
                  <div className="text-lg font-medium text-indigo-400">{finding.cvss_score}</div>
                  <div className="text-[0.65rem] text-theme-text-muted">CVSS</div>
                </div>
              )}
              {finding.created_at && (
                <div className="text-center">
                  <div className="text-sm font-medium text-theme-text-secondary">{fmtStringTimestamp(finding.created_at)}</div>
                  <div className="text-[0.65rem] text-theme-text-muted">发现时间</div>
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
    const confirmed = await showConfirm({ title: '确认删除', message:`确定要删除任务 ${toolTaskId} 吗？此操作不可恢复。` });
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
    const raw = task?.progress?.phases;
    if (!raw) return [];
    const present = Object.keys(raw);
    const ordered = [
      ...PHASE_ORDER.filter((name) => name in raw),
      ...present.filter((name) => !PHASE_ORDER.includes(name as (typeof PHASE_ORDER)[number])),
    ];
    return ordered.map((name) => ({ name, progress: raw[name] }));
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
      <PageHeader
        title="应用扫描详情"
        back={{ onClick: onBack }}
        description={
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-theme-text-muted">{toolTaskId}</span>
            {task && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusTone(task.status)}`}>
                {isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />}
                {statusLabel(task.status)}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {(isActive) && (
              <button
                type="button"
                onClick={() => void handlePause()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/15 disabled:opacity-60"
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
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-60"
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
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/15 disabled:opacity-60"
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
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
        }
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-theme-text-muted">
          <Loader2 size={18} className="animate-spin" />
          加载任务详情...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
          {error}
        </div>
      )}

      {/* Task error from backend */}
      {!loading && task?.error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
          错误信息: {task.error}
        </div>
      )}

      {/* Task info */}
      {!loading && task && (
        <>
          {/* Timeline */}
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <h2 className="text-lg font-semibold text-theme-text-primary">时间线</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
                <div className="text-xs font-medium text-theme-text-muted">创建时间</div>
                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{fmtTimestamp(task.created_at)}</div>
              </div>
              <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
                <div className="text-xs font-medium text-theme-text-muted">开始时间</div>
                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{fmtTimestamp(task.started_at)}</div>
              </div>
              <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
                <div className="text-xs font-medium text-theme-text-muted">完成时间</div>
                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{fmtTimestamp(task.completed_at)}</div>
              </div>
            </div>
          </section>

          {/* Phase progress */}
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-theme-text-primary">阶段进度</h2>
              {isActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                  实时更新
                </span>
              )}
            </div>
            {phases.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-theme-text-muted">{phases.map((p) => phaseLabel(p.name)).join(' → ')}</p>
                <div className="mt-4 flex flex-wrap gap-4">
                  {phases.map((phase, idx) => (
                    <div key={phase.name} className="min-w-[200px] flex-1">
                      <PhaseCard phase={phase.name} progress={phase.progress} index={idx} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface py-8 text-center text-sm text-theme-text-muted">
                暂无阶段进度数据
              </div>
            )}
          </section>

          {/* Vulnerability findings */}
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-500" />
                <h2 className="text-lg font-semibold text-theme-text-primary">漏洞报告</h2>
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                    扫描中
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void loadFindings()}
                disabled={findingsLoading}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-1.5 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
              >
                {findingsLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
                刷新
              </button>
            </div>

            {/* Summary stats */}
            {findingsSummary && (
              <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
                <SummaryStat label="总计" value={findingsSummary.total} />
                <SummaryStat label="已确认" value={findingsSummary.confirmed} tone="text-rose-400" />
                <SummaryStat label="很可能" value={findingsSummary.likely} tone="text-orange-400" />
                <SummaryStat label="可能" value={findingsSummary.possible} tone="text-amber-400" />
                <SummaryStat label="待验证" value={findingsSummary.pending_validation} tone="text-theme-text-secondary" />
                <SummaryStat label="误报" value={findingsSummary.false_positive} tone="text-theme-text-muted" />
              </div>
            )}

            {/* Filters */}
            {hasFindings && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="form-select"
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
                  className="form-select"
                >
                  <option value="">全部验证结果</option>
                  <option value="CONFIRMED">已确认</option>
                  <option value="LIKELY">很可能</option>
                  <option value="POSSIBLE">可能</option>
                  <option value="FALSE_POSITIVE">误报</option>
                </select>
                <div className="text-sm text-theme-text-muted">共 {filteredFindings.length} 条</div>
              </div>
            )}

            {/* Findings list */}
            <div className="mt-4">
              {findingsLoading && !hasFindings ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-theme-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  加载漏洞数据...
                </div>
              ) : filteredFindings.length > 0 ? (
                filteredFindings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
              ) : (
                <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface py-10 text-center">
                  <ShieldAlert size={28} className="mx-auto mb-2 text-theme-text-faint" />
                  <p className="text-sm font-semibold text-theme-text-muted">
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