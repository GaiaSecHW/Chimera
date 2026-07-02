import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, CircleHelp, Clock3, FileText, Loader2, Minus, RefreshCw, RotateCcw, Search, Send, Server, SquareCheck, Wrench, X } from 'lucide-react';
import { vulnVerifyV2Api, VulnVerifyV2AdminPushResult, VulnVerifyV2Attempt, VulnVerifyV2ProjectStats, VulnVerifyV2Result, VulnVerifyV2Task, VulnVerifyV2TaskDetail } from '../../clients/vulnVerifyV2';
import { fileserverApi } from '../../clients/fileserver';
import type { ProjectFilesystemEntry, SecurityProject } from '../../types/types';
import { VulnVerifyV2SessionPreview } from './VulnVerifyV2SessionPreview';
import { VulnVerifyV2ServiceOverviewPanel } from './VulnVerifyV2ServiceOverviewPanel';
import { VulnVerifyV2RightDrawer } from './VulnVerifyV2RightDrawer';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { PageHeader } from '../../design-system';


const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const CANCELLABLE_TASK_STATUSES = new Set(['pending', 'running']);
const ACTIVE_TASK_STATUSES = new Set(['pending', 'running']);
const ACTIVE_LIST_AUTO_REFRESH_MS = 15_000;
const IDLE_LIST_AUTO_REFRESH_MS = 60_000;

// 隐藏的开发者模式：首次点击 v2 胶囊后的 2 秒内连续点击 7 次切换；纯内存态，刷新即关闭；触发成功时一次性提示。
function useDevMode() {
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1600);
  }, []);

  const resetClicks = useCallback(() => {
    clickCountRef.current = 0;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const onClick = useCallback(() => {
    if (clickCountRef.current === 0) {
      clickTimerRef.current = window.setTimeout(resetClicks, 2000);
    }
    clickCountRef.current += 1;
    if (clickCountRef.current >= 7) {
      resetClicks();
      setEnabled((v) => {
        const next = !v;
        showToast(next ? '开发者模式已开启' : '开发者模式已关闭');
        return next;
      });
    }
  }, [resetClicks, showToast]);

  useEffect(() => () => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  return { enabled, onClick, toast };
}

const DIMENSION_LABEL: Record<string, string> = {
  code_accurate: '代码定位准确',
  path_reachable: '路径可达',
  unmitigated: '无缓解措施',
  security_impact: '存在安全影响',
};

interface TaskRuntime {
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  resolved_model?: string | null;
}

function fmtDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}小时${pad2(minutes)}分`;
  if (minutes > 0) return `${minutes}分${pad2(seconds)}秒`;
  return `${seconds}秒`;
}

function fmtRuntime(runtime?: TaskRuntime | null): string {
  if (!runtime?.started_at) return '-';
  const start = new Date(runtime.started_at).getTime();
  const end = runtime.completed_at ? new Date(runtime.completed_at).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '-';
  return fmtDurationMs(end - start);
}

function fmtTime(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : value;
}

function getPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const items: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push('ellipsis');
  for (let item = start; item <= end; item += 1) items.push(item);
  if (end < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null;
}

function readStringField(record: Record<string, any> | null, keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

function getAttemptOutputDetails(attempt: VulnVerifyV2Attempt): Array<{ label: 'stdout' | 'stderr'; text: string }> {
  const failure = asRecord(attempt.failure_reason);
  const result = asRecord(attempt.result);
  const stdout = readStringField(failure, ['stdout', 'standard_output', 'out']) || readStringField(result, ['stdout', 'standard_output', 'out']);
  const stderr = readStringField(failure, ['stderr', 'standard_error', 'err']) || readStringField(result, ['stderr', 'standard_error', 'err']);
  return [
    stdout ? { label: 'stdout' as const, text: stdout } : null,
    stderr ? { label: 'stderr' as const, text: stderr } : null,
  ].filter(Boolean) as Array<{ label: 'stdout' | 'stderr'; text: string }>;
}

function outcomeBadge(status?: string, verdict?: string | null): { label: string; iconCls: string; boxCls: string; fontCls?: string; iconOnly?: boolean; Icon?: React.ElementType; loading?: boolean } {
  if (status === 'running') return { label: '验证中', iconCls: 'text-[var(--color-signal-green)]', boxCls: '', iconOnly: true, loading: true };
  if (status === 'pending') return { label: '等待中', iconCls: 'text-theme-text-faint', boxCls: '', fontCls: 'font-normal', iconOnly: true, Icon: Clock3 };
  if (status === 'failed') return { label: '验证失败', iconCls: 'text-[var(--color-signal-red)]', boxCls: '', iconOnly: true, Icon: X };
  if (status === 'cancelled') return { label: '已取消', iconCls: 'text-[var(--color-signal-amber)]', boxCls: '', iconOnly: true, Icon: Minus };
  if (verdict === 'confirmed') return { label: '已确认', iconCls: 'text-[var(--color-signal-red)]', boxCls: 'border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)]', Icon: AlertTriangle };
  if (verdict === 'ruled_out') return { label: '已排除', iconCls: 'text-[var(--color-signal-cyan)]', boxCls: 'border border-[var(--color-signal-cyan-border)] bg-[var(--color-signal-cyan-bg)]', Icon: SquareCheck };
  if (verdict === 'unresolved') return { label: '不可证', iconCls: 'text-[var(--color-signal-amber)]', boxCls: 'border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)]', Icon: CircleHelp };
  return { label: '未产出结果', iconCls: 'text-theme-text-muted', boxCls: '', iconOnly: true, Icon: Minus };
}

const OutcomePill: React.FC<{ item: ReturnType<typeof outcomeBadge>; size?: 'normal' | 'sm' }> = ({ item, size = 'normal' }) => {
  const Icon = item.Icon;
  const isSm = size === 'sm';
  const boxCls = item.boxCls;
  return (
    <span className={`inline-flex w-auto items-center ${item.iconOnly ? `justify-center ${isSm ? 'px-2 py-1' : 'px-2.5 py-1.5'}` : `${isSm ? 'gap-1.5 py-1 pl-2 pr-3' : 'gap-1.5 pl-3 pr-4 py-1'} rounded-full ${boxCls}`} ${isSm ? 'text-xs' : 'text-sm'} ${item.fontCls || 'font-medium'}`}>
      {item.loading ? (
        <Loader2 size={isSm ? 14 : 18} strokeWidth={isSm ? 2.5 : 2.8} className={`shrink-0 animate-spin ${item.iconCls}`} />
      ) : Icon ? (
        <Icon size={isSm ? 13 : 17} strokeWidth={isSm ? 2.2 : 2.5} className={`shrink-0 ${item.iconCls}`} />
      ) : null}
      {item.iconOnly ? null : <span className={`truncate ${item.iconCls}`}>{item.label}</span>}
    </span>
  );
};

const TaskOutcomeInline: React.FC<{ status?: string; verdict?: string | null }> = ({ status, verdict }) => {
  if (status === 'running') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-secondary"><Loader2 size={16} strokeWidth={2.2} className="shrink-0 animate-spin text-[var(--color-signal-green)]" />验证中</span>;
  }
  if (status === 'pending') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-secondary"><Clock3 size={16} strokeWidth={2.2} className="shrink-0" />等待中</span>;
  }
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-secondary"><X size={16} strokeWidth={2.2} className="shrink-0 text-[var(--color-signal-red)]" />执行失败</span>;
  }
  if (status === 'cancelled') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-muted"><Minus size={16} strokeWidth={2.2} className="shrink-0" />已取消</span>;
  }
  if (verdict === 'confirmed') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-primary"><AlertTriangle size={17} strokeWidth={2.5} className="shrink-0 text-[var(--color-signal-red)]" />已确认</span>;
  }
  if (verdict === 'ruled_out') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-primary"><SquareCheck size={17} strokeWidth={2.5} className="shrink-0 text-[var(--color-signal-cyan)]" />已排除</span>;
  }
  if (verdict === 'unresolved') {
    return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-primary"><CircleHelp size={17} strokeWidth={2.5} className="shrink-0 text-[var(--color-signal-amber)]" />不可证</span>;
  }
  return <span className="inline-flex items-center gap-2 text-sm font-normal text-theme-text-muted"><Minus size={16} strokeWidth={2.2} className="shrink-0" />未产出</span>;
};

const AttemptStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'success') {
    return <OutcomePill size="sm" item={{ label: '成功', iconCls: 'text-[var(--color-signal-green)]', boxCls: '', iconOnly: true, Icon: Check }} />;
  }
  return <OutcomePill size="sm" item={outcomeBadge(status, null)} />;
};

type OperationResultLevel = 'success' | 'warning' | 'error';

interface OperationResultDialogState {
  title: string;
  message?: string;
  level: OperationResultLevel;
  items?: Array<{ id: string; label?: string; status: 'success' | 'failed' | 'skipped'; reason?: string }>;
}

const OperationResultDialog: React.FC<{ state: OperationResultDialogState; onClose: () => void }> = ({ state, onClose }) => {
  const toneCls = state.level === 'error'
    ? 'text-[var(--color-signal-red)] border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)]'
    : state.level === 'warning'
      ? 'text-[var(--color-signal-amber)] border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)]'
      : 'text-[var(--color-signal-green)] border-[var(--color-signal-green-border)] bg-[var(--color-signal-green-bg)]';
  const successCount = state.items?.filter((item) => item.status === 'success').length || 0;
  const failedCount = state.items?.filter((item) => item.status === 'failed').length || 0;
  const skippedCount = state.items?.filter((item) => item.status === 'skipped').length || 0;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={state.title} onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-theme-border px-5 py-4">
          <div>
            <div className="text-base font-semibold text-theme-text-primary">{state.title}</div>
            {state.message ? <div className="mt-1 text-xs text-theme-text-muted">{state.message}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary" aria-label="关闭结果弹窗">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className={`rounded-xl border px-4 py-3 text-xs ${toneCls}`}>{state.message || state.title}</div>
          {state.items?.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-3">
                  <div className="text-xs text-theme-text-muted">成功</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--color-signal-green)]">{successCount}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-3">
                  <div className="text-xs text-theme-text-muted">跳过</div>
                  <div className="mt-1 text-2xl font-semibold text-theme-text-secondary">{skippedCount}</div>
                </div>
                <div className="rounded-xl border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] px-4 py-3">
                  <div className="text-xs text-[var(--color-signal-red)]">失败</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--color-signal-red)]">{failedCount}</div>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-theme-border">
                <div className="grid grid-cols-[minmax(180px,1fr)_100px_minmax(180px,1fr)] gap-3 border-b border-theme-border bg-theme-elevated px-4 py-2 text-xs font-medium text-theme-text-muted">
                  <div>任务</div>
                  <div>结果</div>
                  <div>说明</div>
                </div>
                <div className="divide-y divide-theme-border">
                  {state.items.map((item) => {
                    const cls = item.status === 'success' ? 'text-[var(--color-signal-green)]' : item.status === 'failed' ? 'text-[var(--color-signal-red)]' : 'text-theme-text-muted';
                    const label = item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '跳过';
                    return (
                      <div key={item.id} className="grid grid-cols-[minmax(180px,1fr)_100px_minmax(180px,1fr)] gap-3 px-4 py-3 text-xs text-theme-text-secondary">
                        <div className="min-w-0 truncate font-mono text-theme-text-primary" title={item.label || item.id}>{item.label || item.id}</div>
                        <div className={cls}>{label}</div>
                        <div className="min-w-0 break-words text-theme-text-muted">{item.reason || '-'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-theme-border px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-theme-border bg-theme-surface px-4 text-sm text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary">关闭</button>
        </div>
      </div>
    </div>
  );
};

const PushResultDialog: React.FC<{ result: VulnVerifyV2AdminPushResult; onClose: () => void }> = ({ result, onClose }) => {
  const summary = result.summary || { pushed: 0, skipped: 0, failed: 0 };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="手动推送结果" onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-theme-border px-5 py-4">
          <div>
            <div className="text-base font-semibold text-theme-text-primary">手动推送结果</div>
            <div className="mt-1 text-xs text-theme-text-muted">后端仅会实际推送 running / success 任务，其余任务会跳过。</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary" aria-label="关闭推送结果">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-3">
              <div className="text-xs text-theme-text-muted">成功推送</div>
              <div className="mt-1 text-2xl font-semibold text-[var(--color-signal-green)]">{summary.pushed}</div>
            </div>
            <div className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-3">
              <div className="text-xs text-theme-text-muted">已跳过</div>
              <div className="mt-1 text-2xl font-semibold text-theme-text-secondary">{summary.skipped}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] px-4 py-3">
              <div className="text-xs text-[var(--color-signal-red)]">失败</div>
              <div className="mt-1 text-2xl font-semibold text-[var(--color-signal-red)]">{summary.failed}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-theme-border">
            <div className="grid grid-cols-[minmax(180px,1fr)_110px_120px_minmax(160px,1fr)] gap-3 border-b border-theme-border bg-theme-elevated px-4 py-2 text-xs font-medium text-theme-text-muted">
              <div>任务</div>
              <div>状态</div>
              <div>结果</div>
              <div>说明</div>
            </div>
            <div className="divide-y divide-theme-border">
              {(result.items || []).map((item) => {
                const push = item.push;
                const failed = push && !push.ok;
                const skipped = Boolean(item.skipped || push?.skipped);
                const resultText = failed ? '失败' : skipped ? '跳过' : item.dry_run ? '预览' : '成功';
                const resultCls = failed ? 'text-[var(--color-signal-red)]' : skipped ? 'text-theme-text-muted' : 'text-[var(--color-signal-green)]';
                const reason = item.reason || push?.error || (push?.status_code ? `HTTP ${push.status_code}` : '-');
                return (
                  <div key={item.task_id} className="grid grid-cols-[minmax(180px,1fr)_110px_120px_minmax(160px,1fr)] gap-3 px-4 py-3 text-xs text-theme-text-secondary">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-theme-text-primary" title={item.task_id}>{item.task_id}</div>
                      {item.vuln_id ? <div className="mt-1 truncate text-theme-text-muted" title={item.vuln_id}>{item.vuln_id}</div> : null}
                    </div>
                    <div>{item.status || '-'}</div>
                    <div className={resultCls}>{resultText}</div>
                    <div className="min-w-0 break-words text-theme-text-muted">{reason}</div>
                    {item.payload ? (
                      <details className="col-span-4 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2">
                        <summary className="cursor-pointer select-none text-theme-text-muted transition hover:text-theme-text-primary">Payload</summary>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-theme-text-secondary">{JSON.stringify(item.payload, null, 2)}</pre>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-theme-border px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-theme-border bg-theme-surface px-4 text-sm text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary">关闭</button>
        </div>
      </div>
    </div>
  );
};

function normalizeRuledOutBy(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

const EvidencePill: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
  <span title={title} className="inline-flex items-center rounded-full border border-theme-border bg-theme-elevated px-2 py-1 text-xs font-normal text-theme-text-secondary">{children}</span>
);

const TaskDecisionEvidence: React.FC<{ task: VulnVerifyV2Task }> = ({ task }) => {
  if (task.status === 'running' || task.status === 'pending') return <span className="text-xs font-normal text-theme-text-secondary">-</span>;
  if (task.status === 'failed') return <span className="text-xs font-normal text-theme-text-secondary">执行失败</span>;
  if (task.status === 'cancelled') return <span className="text-xs font-normal text-theme-text-secondary">已取消</span>;

  if (task.verdict === 'confirmed') {
    const summary = task.root_cause_summary || '';
    return summary
      ? <div className="line-clamp-2 text-xs font-normal text-theme-text-secondary" title={summary}>{summary}</div>
      : <span className="text-xs font-normal text-theme-text-secondary">-</span>;
  }

  if (task.verdict === 'ruled_out') {
    const reasons = normalizeRuledOutBy(task.ruled_out_by);
    if (!reasons.length) return <span className="text-xs font-normal text-theme-text-secondary">排除原因见详情</span>;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {reasons.map((key) => (
          <EvidencePill key={key} title={dimensionConclusionText(key, false)}>
            {dimensionConclusionText(key, false)}
          </EvidencePill>
        ))}
      </div>
    );
  }

  if (task.verdict === 'unresolved') return <span className="text-xs font-normal text-theme-text-secondary">证据不足</span>;
  return <span className="text-xs font-normal text-theme-text-secondary">未产出判定</span>;
};

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'green' | 'cyan' | 'red' | 'amber' | 'slate'; Icon?: React.ElementType }> = ({ label, value, hint, accent = 'slate', Icon }) => {
  const color = accent === 'green' ? 'text-[var(--color-signal-green)]' : accent === 'cyan' ? 'text-[var(--color-signal-cyan)]' : accent === 'red' ? 'text-[var(--color-signal-red)]' : accent === 'amber' ? 'text-[var(--color-signal-amber)]' : 'text-theme-text-primary';
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className={`inline-flex items-center gap-2 text-sm font-semibold ${color}`}>
        {Icon ? <Icon size={17} strokeWidth={2.5} className="shrink-0" /> : null}
        <span>{label}</span>
      </div>
      {hint ? <div className="mt-5 text-sm text-theme-text-muted">{hint}</div> : null}
      <div className={`mt-1.5 flex items-baseline gap-1 ${color}`}>
        <span className="text-2xl font-semibold">{value}</span>
        <span className="text-sm font-medium">个</span>
      </div>
    </div>
  );
};

const DIMENSION_KEYS = ['code_accurate', 'path_reachable', 'unmitigated', 'security_impact'] as const;

function dimensionConclusionText(dimKey: string, status?: boolean | null): string {
  const textMap: Record<string, { pass: string; fail: string; unknown: string }> = {
    code_accurate: { pass: '漏洞代码准确', fail: '漏洞代码不准确', unknown: '漏洞代码未判定' },
    path_reachable: { pass: '路径可达', fail: '路径不可达', unknown: '路径可达性未判定' },
    unmitigated: { pass: '无缓解措施', fail: '存在缓解措施', unknown: '缓解措施未判定' },
    security_impact: { pass: '存在安全影响', fail: '无安全影响', unknown: '安全影响未判定' },
  };
  const item = textMap[dimKey];
  if (!item) return DIMENSION_LABEL[dimKey] || dimKey;
  if (status === true) return item.pass;
  if (status === false) return item.fail;
  return item.unknown;
}

const DimensionCard: React.FC<{ dimKey: string; status?: boolean | null; detail?: string }> = ({ dimKey, status, detail }) => {
  const conclusion = dimensionConclusionText(dimKey, status);
  // 风险语义统一，且避免只靠红/绿：成立=红色警告，排除=蓝色勾选，未判定=黄色问号。
  const statusTone = status === true
    ? { cls: 'text-[var(--color-signal-red)]', Icon: AlertTriangle, label: '支持漏洞成立' }
    : status === false
      ? { cls: 'text-[var(--color-signal-cyan)]', Icon: SquareCheck, label: '支持排除漏洞' }
      : { cls: 'text-[var(--color-signal-amber)]', Icon: CircleHelp, label: '未判定' };
  const statusCls = statusTone.cls;
  const StatusIcon = statusTone.Icon;
  return (
    <div className="grid grid-cols-[minmax(156px,188px)_minmax(0,1fr)] items-start gap-3 py-3">
      <div className="flex min-w-0 items-start gap-2 pl-2">
        <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center ${statusCls}`} title={statusTone.label}>
          <StatusIcon size={20} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 truncate pt-0.5 text-base font-medium leading-6 text-theme-text-primary">{conclusion}</div>
      </div>
      <div className="min-w-0">
        <div className="whitespace-pre-wrap break-words text-sm font-normal leading-6 text-theme-text-primary">{detail || '-'}</div>
      </div>
    </div>
  );
};

const AttemptDebugInfo: React.FC<{ details: Array<{ label: 'stdout' | 'stderr'; text: string }> }> = ({ details }) => (
  <details className="group">
    <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-theme-text-muted transition hover:text-theme-text-secondary">
      <ChevronRight size={13} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
      调试信息
    </summary>
    <div className="mt-2 space-y-2">
      {details.map((detail) => (
        <div key={detail.label}>
          <div className="mb-1 text-xs font-medium text-theme-text-muted">{detail.label}</div>
          <pre className="max-h-80 overflow-auto rounded-lg border border-theme-border bg-theme-elevated p-3 text-xs font-mono leading-5 text-theme-text-secondary break-words whitespace-pre-wrap">{detail.text}</pre>
        </div>
      ))}
    </div>
  </details>
);

const AttemptDevJson: React.FC<{ attempt: VulnVerifyV2Attempt }> = ({ attempt }) => {
  const [opened, setOpened] = useState(false);
  let json = '';
  if (opened) {
    try {
      json = JSON.stringify(attempt, null, 2);
    } catch {
      json = String(attempt);
    }
  }
  return (
    <details className="group" onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-theme-text-muted transition hover:text-theme-text-secondary">
        <ChevronRight size={13} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
        原始 JSON
      </summary>
      {opened ? <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-theme-border bg-theme-elevated p-3 text-xs font-mono leading-5 text-theme-text-secondary break-words whitespace-pre-wrap">{json}</pre> : null}
    </details>
  );
};

function joinPath(base: string, name: string): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${cleanBase || ''}/${name}`;
}

function buildRunProjectPath(projectId: string, workDir?: string | null): string {
  if (!workDir) return '';
  const runAbs = `${workDir.replace(/\/$/, '')}/run`;
  const prefix = `/data/files/${projectId}`;
  if (runAbs.startsWith(prefix)) return runAbs.slice(prefix.length) || '/';
  return runAbs.startsWith('/') ? runAbs : `/${runAbs}`;
}

function isJsonlFile(entry: ProjectFilesystemEntry): boolean {
  return entry.node_type === 'file' && (entry.path || entry.name).toLowerCase().endsWith('.jsonl');
}

function sortJsonlFiles(files: ProjectFilesystemEntry[]): ProjectFilesystemEntry[] {
  return [...files].sort((a, b) => {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    return String(b.path || b.name).localeCompare(String(a.path || a.name));
  });
}

async function listSessionJsonlFiles(projectId: string, runPath: string, maxDepth = 3): Promise<ProjectFilesystemEntry[]> {
  const files: ProjectFilesystemEntry[] = [];
  const visit = async (path: string, depth: number) => {
    const payload = await fileserverApi.getProjectFilesystemChildren(projectId, path);
    files.push(...(payload.files || []).filter(isJsonlFile));
    if (depth <= 0) return;
    for (const dir of payload.directories || []) {
      await visit(dir.path || joinPath(path, dir.name), depth - 1);
    }
  };
  await visit(runPath, maxDepth);
  return sortJsonlFiles(files);
}

const SessionFileButton: React.FC<{ file: ProjectFilesystemEntry; active: boolean; onClick: () => void }> = ({ file, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full min-w-0 items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${active ? 'border-[var(--color-signal-blue)] bg-[var(--color-signal-blue-bg)] text-theme-text-primary' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary'}`}
    title={file.path}
  >
    <FileText size={14} className="mt-0.5 shrink-0 text-theme-text-muted" />
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{file.name}</span>
      <span className="mt-1 block truncate font-mono text-theme-text-faint">{file.updated_at ? fmtTime(file.updated_at) : file.path}</span>
    </span>
  </button>
);

const AttemptTimeline: React.FC<{ attempts: VulnVerifyV2Attempt[]; devMode?: boolean }> = ({ attempts, devMode }) => {
  if (!attempts.length) {
    return <div className="py-6 text-center text-sm font-normal text-theme-text-muted">暂无执行尝试记录</div>;
  }
  return (
    <ol className="space-y-4">
      {attempts.map((att) => {
        const isFailed = att.status === 'failed';
        const dotCls = att.status === 'success' ? 'bg-[var(--color-signal-green)]'
          : att.status === 'failed' ? 'bg-[var(--color-signal-red)]'
          : att.status === 'running' ? 'bg-[var(--color-signal-green)]'
          : att.status === 'cancelled' ? 'bg-[var(--color-signal-amber)]'
          : 'bg-theme-border';
        const duration = att.started_at
          ? fmtDurationMs((att.completed_at ? new Date(att.completed_at).getTime() : Date.now()) - new Date(att.started_at).getTime())
          : '-';
        const failureMsg = att.failure_reason && typeof att.failure_reason === 'object'
          ? String((att.failure_reason as any).message || (att.failure_reason as any).error || JSON.stringify(att.failure_reason))
          : null;
        const outputDetails = getAttemptOutputDetails(att);
        return (
          <li key={att.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className={`h-2.5 w-2.5 rounded-full ${dotCls}`} />
              <span className="mt-1 w-px flex-1 bg-theme-border" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-medium text-theme-text-primary">第 {att.attempt_number} 次执行</span>
                <AttemptStatusBadge status={att.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-normal text-theme-text-muted">
                <span>开始：{fmtTime(att.started_at)}</span>
                <span>结束：{fmtTime(att.completed_at)}</span>
                <span>耗时：{duration}</span>
                {att.worker_id ? <span>Worker：{att.worker_id}</span> : null}
              </div>
              {isFailed && (failureMsg || outputDetails.length) || devMode ? (
                <div className="space-y-2">
                  {isFailed && failureMsg ? (
                    <div className="rounded-lg border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] p-3 text-xs font-normal text-[var(--color-signal-red)] break-words">{failureMsg}</div>
                  ) : null}
                  {isFailed && outputDetails.length ? <AttemptDebugInfo details={outputDetails} /> : null}
                  {devMode ? <AttemptDevJson attempt={att} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export const VulnVerifyV2TaskPage: React.FC<{ projectId: string; projects?: SecurityProject[] }> = ({ projectId, projects = [] }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyV2Api.getHealth);
  const { enabled: devMode, onClick: handleDevBadgeClick, toast: devToast } = useDevMode();

  const [tasks, setTasks] = useState<VulnVerifyV2Task[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VulnVerifyV2ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);

  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detail, setDetail] = useState<VulnVerifyV2TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionViewOpen, setSessionViewOpen] = useState(false);
  const [sessionRunPath, setSessionRunPath] = useState('');
  const [sessionFiles, setSessionFiles] = useState<ProjectFilesystemEntry[]>([]);
  const [selectedSessionPath, setSelectedSessionPath] = useState('');
  const [sessionJsonl, setSessionJsonl] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, string>>({});
  const [selectedDevTaskIds, setSelectedDevTaskIds] = useState<string[]>([]);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchRerunning, setBatchRerunning] = useState(false);
  const [pushingResults, setPushingResults] = useState(false);
  const [pushResultDialog, setPushResultDialog] = useState<VulnVerifyV2AdminPushResult | null>(null);
  const [operationResultDialog, setOperationResultDialog] = useState<OperationResultDialogState | null>(null);
  const [serviceOverviewOpen, setServiceOverviewOpen] = useState(false);
  const [devToastPos, setDevToastPos] = useState<{ top: number; left: number } | null>(null);
  const devBadgeRef = useRef<HTMLSpanElement | null>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const closeDetailTimerRef = useRef<number | null>(null);
  const autoRefreshInFlightRef = useRef(false);

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, offset + tasks.length);
  const paginationItems = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages]);
  const resultFilterValue = resultFilter;
  const visibleTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const cancellableTaskIds = useMemo(() => tasks.filter((task) => CANCELLABLE_TASK_STATUSES.has(String(task.status || ''))).map((task) => task.id), [tasks]);
  const selectedDevTaskIdSet = useMemo(() => new Set(selectedDevTaskIds), [selectedDevTaskIds]);
  const selectedVisibleTaskIds = useMemo(() => selectedDevTaskIds.filter((id) => visibleTaskIds.includes(id)), [selectedDevTaskIds, visibleTaskIds]);
  const selectedCancellableTaskIds = useMemo(() => selectedVisibleTaskIds.filter((id) => cancellableTaskIds.includes(id)), [cancellableTaskIds, selectedVisibleTaskIds]);
  const allVisibleTasksSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedDevTaskIdSet.has(id));
  const hasActiveVisibleTask = useMemo(() => tasks.some((task) => ACTIVE_TASK_STATUSES.has(String(task.status || ''))), [tasks]);
  const listAutoRefreshIntervalMs = hasActiveVisibleTask ? ACTIVE_LIST_AUTO_REFRESH_MS : IDLE_LIST_AUTO_REFRESH_MS;

  const handleDevBadgeClickWithPosition = useCallback(() => {
    const rect = devBadgeRef.current?.getBoundingClientRect();
    if (rect) {
      setDevToastPos({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 260)),
      });
    }
    handleDevBadgeClick();
  }, [handleDevBadgeClick]);

  const handleResultFilterChange = useCallback((value: string) => {
    setPage(1);
    setResultFilter(value);
    if (!value) {
      setStatusFilter('');
      setVerdictFilter('');
      return;
    }
    if (value === 'other') {
      setStatusFilter('failed');
      setVerdictFilter('');
      return;
    }
    const [kind, actualValue] = value.split(':', 2);
    if (kind === 'status') {
      setStatusFilter(actualValue || '');
      setVerdictFilter('');
      return;
    }
    if (kind === 'verdict') {
      setStatusFilter('');
      setVerdictFilter(actualValue || '');
    }
  }, []);


  const loadOverview = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId) return;
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    try {
      const searchText = search.trim() || undefined;
      const [list, stat] = await Promise.all([
        vulnVerifyV2Api.listTasks(projectId, {
          status: statusFilter || undefined,
          verdict: verdictFilter || undefined,
          search: searchText,
          limit: perPage,
          offset,
        }),
        vulnVerifyV2Api.getProjectStats(projectId).catch(() => null),
      ]);
      setTasks(list.items || []);
      setTotal(Number(list.total || 0));
      setStats(stat);
      if (!silent) setMessage(null);
    } catch (e: any) {
      if (!silent) setMessage(e?.message || String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId, resultFilter, statusFilter, verdictFilter, search, perPage, offset]);

  const refreshOverviewSilently = useCallback(async () => {
    if (!projectId || autoRefreshInFlightRef.current) return;
    autoRefreshInFlightRef.current = true;
    setAutoRefreshing(true);
    try {
      await loadOverview({ silent: true });
    } finally {
      autoRefreshInFlightRef.current = false;
      setAutoRefreshing(false);
    }
  }, [loadOverview, projectId]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        await refreshOverviewSilently();
      }
      if (!cancelled) timer = window.setTimeout(tick, listAutoRefreshIntervalMs);
    };
    timer = window.setTimeout(tick, listAutoRefreshIntervalMs);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [listAutoRefreshIntervalMs, projectId, refreshOverviewSilently]);

  useEffect(() => {
    if (!devMode) {
      setSelectedDevTaskIds([]);
      return;
    }
    const visibleIds = new Set(visibleTaskIds);
    setSelectedDevTaskIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [devMode, visibleTaskIds]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetailPanelOpen(false);
      return;
    }
    setDetailPanelOpen(false);
    const frame = window.requestAnimationFrame(() => {
      detailScrollRef.current?.scrollTo({ top: 0 });
      setDetailPanelOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedTaskId]);

  useEffect(() => () => {
    if (closeDetailTimerRef.current !== null) window.clearTimeout(closeDetailTimerRef.current);
  }, []);

  const loadDetail = useCallback(async (taskId: string) => {
    if (closeDetailTimerRef.current !== null) {
      window.clearTimeout(closeDetailTimerRef.current);
      closeDetailTimerRef.current = null;
    }
    setSelectedTaskId(taskId);
    setDetailLoading(true);
    setDetail(null);
    setSessionViewOpen(false);
    setSessionRunPath('');
    setSessionFiles([]);
    setSelectedSessionPath('');
    setSessionJsonl('');
    setSessionError(null);
    try {
      const task = await vulnVerifyV2Api.getTask(projectId, taskId);
      setDetail(task);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setDetailLoading(false);
    }
  }, [projectId]);

  const closeDetailPanel = useCallback(() => {
    setDetailPanelOpen(false);
    if (closeDetailTimerRef.current !== null) window.clearTimeout(closeDetailTimerRef.current);
    closeDetailTimerRef.current = window.setTimeout(() => {
      setSelectedTaskId('');
      setDetail(null);
      setSessionViewOpen(false);
      closeDetailTimerRef.current = null;
    }, 250);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetailPanel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedTaskId, closeDetailPanel]);

  const handleRerun = useCallback(async (taskId: string) => {
    try {
      await vulnVerifyV2Api.rerunTask(projectId, taskId);
      setOperationResultDialog({ title: '重新执行已提交', message: '已请求重新执行该任务。', level: 'success' });
      await loadOverview();
      if (selectedTaskId === taskId) await loadDetail(taskId);
    } catch (e: any) {
      setOperationResultDialog({ title: '重新执行失败', message: e?.message || String(e), level: 'error' });
    }
  }, [projectId, loadOverview, loadDetail, selectedTaskId]);

  const loadSessionFile = useCallback(async (path: string, force = false) => {
    setSelectedSessionPath(path);
    setSessionError(null);
    const cached = sessionCache[path];
    if (!force && cached !== undefined) {
      setSessionJsonl(cached);
      return;
    }
    setSessionLoading(true);
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, path);
      const text = await blob.text();
      setSessionJsonl(text);
      setSessionCache((prev) => ({ ...prev, [path]: text }));
    } catch (e: any) {
      setSessionJsonl('');
      setSessionError(e?.message || String(e));
    } finally {
      setSessionLoading(false);
    }
  }, [projectId, sessionCache]);

  const openSessionView = useCallback(async (force = false) => {
    if (!detail?.work_dir) return;
    const runPath = buildRunProjectPath(projectId, detail.work_dir);
    setSessionViewOpen(true);
    setSessionRunPath(runPath);
    setSessionFiles([]);
    setSelectedSessionPath('');
    setSessionJsonl('');
    setSessionError(null);
    setSessionLoading(true);
    try {
      const files = await listSessionJsonlFiles(projectId, runPath);
      setSessionFiles(files);
      if (files.length) {
        await loadSessionFile(files[0].path, force);
      } else {
        setSessionError('未找到 session JSONL 文件');
      }
    } catch (e: any) {
      setSessionError(e?.message || String(e));
    } finally {
      setSessionLoading(false);
    }
  }, [detail?.work_dir, loadSessionFile, projectId]);

  const toggleDevSelection = useCallback((taskId: string) => {
    setSelectedDevTaskIds((prev) => prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]);
  }, []);

  const toggleAllVisibleSelections = useCallback(() => {
    setSelectedDevTaskIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => prevSet.has(id));
      if (allSelected) return prev.filter((id) => !visibleTaskIds.includes(id));
      const next = new Set(prev);
      visibleTaskIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [visibleTaskIds]);

  const handleBatchCancelTasks = useCallback(async () => {
    const taskIds = selectedCancellableTaskIds;
    if (!taskIds.length) return;
    if (!window.confirm(`确认取消选中的 ${taskIds.length} 个任务？`)) return;
    setBatchCancelling(true);
    try {
      const results = await Promise.allSettled(taskIds.map((taskId) => vulnVerifyV2Api.terminateTask(projectId, taskId)));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      setOperationResultDialog({
        title: failedCount ? '批量取消未完全成功' : '批量取消完成',
        message: `成功 ${successCount}，失败 ${failedCount}`,
        level: failedCount ? 'warning' : 'success',
        items: results.map((result, index) => ({
          id: taskIds[index],
          status: result.status === 'fulfilled' ? 'success' : 'failed',
          reason: result.status === 'fulfilled' ? '已取消' : (result.reason?.message || String(result.reason)),
        })),
      });
      setSelectedDevTaskIds([]);
      await loadOverview();
      if (selectedTaskId && taskIds.includes(selectedTaskId)) await loadDetail(selectedTaskId);
    } catch (e: any) {
      setOperationResultDialog({ title: '批量取消失败', message: e?.message || String(e), level: 'error' });
    } finally {
      setBatchCancelling(false);
    }
  }, [loadDetail, loadOverview, projectId, selectedCancellableTaskIds, selectedTaskId]);

  const handleBatchRerunTasks = useCallback(async () => {
    const taskIds = selectedVisibleTaskIds;
    if (!taskIds.length) return;
    if (!window.confirm(`确认重跑选中的 ${taskIds.length} 个任务？`)) return;
    setBatchRerunning(true);
    try {
      const results = await Promise.allSettled(taskIds.map((taskId) => vulnVerifyV2Api.rerunTask(projectId, taskId)));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      setOperationResultDialog({
        title: failedCount ? '批量重跑未完全成功' : '批量重跑已提交',
        message: `成功 ${successCount}，失败 ${failedCount}`,
        level: failedCount ? 'warning' : 'success',
        items: results.map((result, index) => ({
          id: taskIds[index],
          status: result.status === 'fulfilled' ? 'success' : 'failed',
          reason: result.status === 'fulfilled' ? '已请求重跑' : (result.reason?.message || String(result.reason)),
        })),
      });
      setSelectedDevTaskIds([]);
      await loadOverview();
      if (selectedTaskId && taskIds.includes(selectedTaskId)) await loadDetail(selectedTaskId);
    } catch (e: any) {
      setOperationResultDialog({ title: '批量重跑失败', message: e?.message || String(e), level: 'error' });
    } finally {
      setBatchRerunning(false);
    }
  }, [loadDetail, loadOverview, projectId, selectedTaskId, selectedVisibleTaskIds]);

  const handlePushSelectedResults = useCallback(async () => {
    const taskIds = selectedVisibleTaskIds;
    if (!taskIds.length || pushingResults) return;
    if (!window.confirm(`确认手动推送选中的 ${taskIds.length} 个任务最新验证结果？后端仅会实际推送 running/success 任务。`)) return;
    setPushingResults(true);
    try {
      const result = await vulnVerifyV2Api.adminPushResults({ task_ids: taskIds, dry_run: false });
      setPushResultDialog(result);
      await loadOverview({ silent: true });
    } catch (e: any) {
      setOperationResultDialog({ title: '手动推送最新结果失败', message: e?.message || String(e), level: 'error' });
    } finally {
      setPushingResults(false);
    }
  }, [loadOverview, pushingResults, selectedVisibleTaskIds]);

  const confirmedVulns = Number(stats?.confirmed ?? 0);
  const ruledOutVulns = Number(stats?.ruled_out ?? 0);
  const unresolvedVulns = Number(stats?.unresolved ?? 0);

  const detailResult = detail?.results?.[0] as VulnVerifyV2Result | undefined;
  const detailRaw = (detailResult?.raw_result || {}) as Record<string, any>;
  const detailDimensions = (detailRaw.dimensions || detailResult?.dimensions || {}) as Record<string, { status?: boolean | null; detail?: string }>;
  const detailHasFinalVerdict = detail?.verdict === 'confirmed' || detail?.verdict === 'ruled_out' || detail?.verdict === 'unresolved';
  const detailAttempts = detail?.attempts || [];

  return (
    <div className="min-h-full bg-theme-bg-app text-theme-text-primary">
      {devToast && devToastPos ? (
        <div className="fixed z-[60] inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-medium text-theme-text-secondary shadow-md" style={{ top: devToastPos.top, left: devToastPos.left }}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-signal-blue)] text-white">
            <Wrench size={13} strokeWidth={2.2} />
          </span>
          {devToast}
        </div>
      ) : null}
      {operationResultDialog ? <OperationResultDialog state={operationResultDialog} onClose={() => setOperationResultDialog(null)} /> : null}
      {pushResultDialog ? <PushResultDialog result={pushResultDialog} onClose={() => setPushResultDialog(null)} /> : null}
      {devMode && serviceOverviewOpen ? (
        <VulnVerifyV2ServiceOverviewPanel projects={projects} currentProjectId={projectId} onClose={() => setServiceOverviewOpen(false)} />
      ) : null}
      <div className="w-full space-y-8 px-4 pt-8 pb-10 lg:px-6 xl:px-8">
        <PageHeader
          className="border-b-0 !pb-0"
          title={<ServicePageTitle title={<span className="inline-flex items-baseline gap-1.5 py-2">漏洞验证<span ref={devBadgeRef} className="select-none text-xs font-medium text-theme-text-muted" onClick={handleDevBadgeClickWithPosition} role="presentation" aria-hidden>v2</span></span>} version={buildVersion} />}
          description="基于漏洞报告、代码上下文与威胁模型，由 AI 围绕代码定位、路径可达性、缓解措施和安全影响进行四维判定，产出确认漏洞、排除漏洞或不可证结论。"
        />

        <section>
          <div className="grid gap-5 md:grid-cols-3">
            <SummaryCard label="已确认" value={confirmedVulns} accent="red" Icon={AlertTriangle} hint="确认存在真实漏洞风险" />
            <SummaryCard label="已排除" value={ruledOutVulns} accent="cyan" Icon={SquareCheck} hint="验证后排除漏洞风险" />
            <SummaryCard label="不可证" value={unresolvedVulns} accent="amber" Icon={CircleHelp} hint="现有证据不足以判定" />
          </div>
        </section>

        {message ? <div className="rounded-lg border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] px-4 py-3 text-sm text-[var(--color-signal-amber)]">{message}</div> : null}

        <div className="grid grid-cols-1 gap-4">
          {/* 列表 */}
          <section>
            <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-[260px] flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
                  <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜索标题 / ID" className="form-input h-8 w-full py-1 pl-9 pr-9 text-xs text-theme-text-primary" />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => { setSearch(''); setPage(1); }}
                      className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary"
                      aria-label="清空搜索"
                      title="清空搜索"
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </div>
                <div className="max-w-full overflow-x-auto pb-1 sm:pb-0">
                  <div className="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-theme-border bg-theme-surface p-0.5" role="group" aria-label="验证结果筛选">
                    {[
                      { label: '全部', value: '' },
                      { label: '已确认', value: 'verdict:confirmed' },
                      { label: '已排除', value: 'verdict:ruled_out' },
                      { label: '不可证', value: 'verdict:unresolved' },
                      { label: '执行中', value: 'status:running' },
                      { label: '等待中', value: 'status:pending' },
                      { label: '其他', value: 'other' },
                    ].map((option) => {
                      const active = resultFilterValue === option.value;
                      return (
                        <button
                          key={option.value || 'all'}
                          type="button"
                          onClick={() => handleResultFilterChange(option.value)}
                          className={`inline-flex shrink-0 items-center self-stretch rounded-sm px-2 py-1 text-xs font-medium transition-all duration-200 ease-out ${active ? 'bg-[var(--color-signal-blue)] text-white shadow-sm' : 'text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary'}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadOverview()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-surface text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary sm:ml-2"
                  aria-label="刷新任务列表"
                  title="刷新任务列表"
                >
                  <RefreshCw size={16} className={loading || autoRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>

              {devMode ? (
                <div className="mb-4 flex flex-col gap-2 rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setServiceOverviewOpen(true)}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-theme-border bg-theme-surface px-3 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary"
                      title="查看跨项目全局概览"
                    >
                      <Server size={14} className="mr-1.5" />
                      全局概览
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedVisibleTaskIds.length ? (
                      <button type="button" onClick={() => setSelectedDevTaskIds([])} className="h-8 px-1 text-xs text-theme-text-muted transition hover:text-theme-text-primary">
                        清空选择
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!selectedVisibleTaskIds.length || pushingResults}
                      onClick={() => void handlePushSelectedResults()}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-theme-border bg-theme-surface px-3 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      title="手动推送选中任务的最新验证结果；仅 running/success 会实际推送"
                    >
                      {pushingResults ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
                      手动推送最新结果{selectedVisibleTaskIds.length ? ` (${selectedVisibleTaskIds.length})` : ''}
                    </button>
                    <button
                      type="button"
                      disabled={!selectedVisibleTaskIds.length || batchRerunning}
                      onClick={() => void handleBatchRerunTasks()}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-theme-border bg-theme-surface px-3 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      title="重跑选中的任务"
                    >
                      {batchRerunning ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RotateCcw size={14} className="mr-1.5" />}
                      重跑选中任务{selectedVisibleTaskIds.length ? ` (${selectedVisibleTaskIds.length})` : ''}
                    </button>
                    <button
                      type="button"
                      disabled={!selectedCancellableTaskIds.length || batchCancelling}
                      onClick={() => void handleBatchCancelTasks()}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] px-3 text-xs font-medium text-[var(--color-signal-red)] transition hover:bg-[var(--color-signal-red-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      title="取消选中的等待中/执行中任务"
                    >
                      {batchCancelling ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                      取消选中任务{selectedCancellableTaskIds.length ? ` (${selectedCancellableTaskIds.length})` : ''}
                    </button>
                  </div>
                </div>
              ) : null}

            <div className="overflow-hidden bg-theme-surface">
              <div className={`hidden border-b border-theme-border bg-theme-elevated/80 px-4 py-3 text-xs font-medium text-theme-text-muted lg:grid ${devMode ? 'lg:grid-cols-[32px_minmax(260px,1.45fr)_112px_minmax(180px,1fr)_80px]' : 'lg:grid-cols-[minmax(260px,1.45fr)_112px_minmax(180px,1fr)_80px]'} lg:gap-5`}>
                {devMode ? (
                  <label className="flex items-center justify-center" title="选择当前页任务">
                    <input type="checkbox" checked={allVisibleTasksSelected} disabled={!visibleTaskIds.length} onChange={toggleAllVisibleSelections} className="h-4 w-4 rounded border-theme-border bg-theme-surface" />
                  </label>
                ) : null}
                <div className="lg:pr-3">漏洞标题 / ID</div>
                <div className="lg:pl-2">验证结果</div>
                <div className="lg:pl-1">判定依据</div>
                <div className="text-center">耗时</div>
              </div>
              <div className="divide-y divide-theme-border">
                {tasks.map((task) => {
                  const runtime = task.runtime;
                  const isSel = selectedTaskId === task.id;
                  const showRuntime = task.verdict === 'confirmed' || task.verdict === 'ruled_out' || task.verdict === 'unresolved';
                  const canCancelTask = CANCELLABLE_TASK_STATUSES.has(String(task.status || ''));
                  const isDevSelected = selectedDevTaskIdSet.has(task.id);
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => void loadDetail(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void loadDetail(task.id);
                        }
                      }}
                      className={`group relative grid w-full cursor-pointer gap-2 px-4 py-4 text-left transition-colors hover:bg-[var(--color-signal-blue-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal-blue-border)] ${devMode ? 'lg:grid-cols-[32px_minmax(260px,1.45fr)_112px_minmax(180px,1fr)_80px]' : 'lg:grid-cols-[minmax(260px,1.45fr)_112px_minmax(180px,1fr)_80px]'} lg:items-center lg:gap-5 ${isSel ? 'bg-[var(--color-signal-blue-bg)]' : ''}`.trim()}
                    >
                      <span aria-hidden="true" className={`absolute bottom-0 left-0 top-0 w-1 bg-[var(--color-signal-blue)] transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                      {devMode ? (
                        <label className="flex items-center lg:justify-center" title={canCancelTask ? '选择任务，可批量重跑/取消' : '选择任务，可批量重跑'} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isDevSelected}
                            disabled={batchCancelling || batchRerunning}
                            onChange={() => toggleDevSelection(task.id)}
                            className="h-4 w-4 rounded border-theme-border bg-theme-surface disabled:opacity-40"
                          />
                        </label>
                      ) : null}
                      <div className="min-w-0 lg:pr-3">
                        <div className="truncate text-sm font-normal text-theme-text-primary" title={task.name}>{task.name}</div>
                        <div className="mt-1 font-mono text-xs text-theme-text-faint">{task.vuln_id || task.case_id || '-'}</div>
                      </div>
                      <div className="flex items-center lg:pl-2">
                        <TaskOutcomeInline status={task.status} verdict={task.verdict} />
                      </div>
                      <div className="min-w-0 lg:flex lg:items-center lg:pl-1">
                        <div className="mb-1 text-xs font-medium text-theme-text-muted lg:hidden">判定依据</div>
                        <TaskDecisionEvidence task={task} />
                      </div>
                      <div className="flex items-center gap-2 text-xs lg:justify-end">
                        <span className="text-xs font-medium text-theme-text-muted lg:hidden">耗时</span>
                        <span className="text-xs font-normal text-theme-text-secondary lg:text-right">{showRuntime ? fmtRuntime(runtime) : '-'}</span>
                      </div>
                    </div>
                  );
                })}
                {!tasks.length && !loading ? (
                  <div className="py-10 text-center text-sm text-theme-text-muted">暂无任务</div>
                ) : null}
              </div>
            </div>

              <div className="mt-4 flex flex-col gap-3 text-xs text-theme-text-muted lg:flex-row lg:items-center lg:justify-between">
                <span>第 {pageStart}-{pageEnd} 项，共 {total} 项</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span>每页</span>
                    <select
                      value={perPage}
                      onChange={(e) => {
                        const next = Number(e.target.value) || 50;
                        setPerPage(next);
                        setPage(1);
                      }}
                      className="form-select h-8 py-1 text-xs"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(1)} className="h-8 rounded-lg border border-theme-border px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40">首页</button>
                    <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 rounded-lg border border-theme-border px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
                    <span className="px-2 text-theme-text-muted md:hidden">第 {page}/{totalPages} 页</span>
                    <div className="hidden items-center gap-1 md:flex">
                      {paginationItems.map((item, index) => item === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="inline-flex h-8 min-w-8 items-center justify-center px-1 text-theme-text-muted">...</span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPage(item)}
                          className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-medium transition ${item === page ? 'border-[var(--color-signal-blue)] bg-[var(--color-signal-blue)] text-white' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary'}`}
                          aria-current={item === page ? 'page' : undefined}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-8 rounded-lg border border-theme-border px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
                    <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="h-8 rounded-lg border border-theme-border px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-40">末页</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {selectedTaskId ? (
        <VulnVerifyV2RightDrawer
          open={detailPanelOpen}
          ariaLabel={sessionViewOpen ? '会话记录' : '验证详情'}
          onClose={closeDetailPanel}
          scrollRef={detailScrollRef}
          bodyClassName={sessionViewOpen ? 'flex min-h-full flex-col space-y-5 pt-5' : 'space-y-7 pt-5'}
          title={sessionViewOpen ? (
            <span className="space-y-2">
              <button
                type="button"
                onClick={() => setSessionViewOpen(false)}
                className="inline-flex items-center gap-2 text-sm font-medium text-theme-text-secondary transition hover:text-theme-text-primary"
              >
                <ArrowLeft size={16} strokeWidth={2.2} />返回验证详情
              </button>
              <span className="block">会话记录</span>
            </span>
          ) : (detail?.name || '验证详情')}
          subtitle={sessionViewOpen ? `run: ${sessionRunPath || '-'}` : undefined}
          actions={sessionViewOpen ? (
            <button
              type="button"
              onClick={() => void openSessionView(true)}
              disabled={sessionLoading}
              className="inline-flex h-8 shrink-0 items-center rounded-lg border border-theme-border bg-theme-surface px-3 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={`mr-1.5 ${sessionLoading ? 'animate-spin' : ''}`} />刷新
            </button>
          ) : undefined}
        >
          {detailLoading ? (
                <div className="flex h-full min-h-[300px] items-center justify-center gap-2 py-10 text-sm font-normal text-theme-text-muted">
                  <Loader2 size={16} className="animate-spin" />加载详情...
                </div>
          ) : detail ? (
            sessionViewOpen ? (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                      <aside className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
                        <div className="text-xs font-medium text-theme-text-muted">JSONL 文件（{sessionFiles.length}）</div>
                        <div className="max-h-[38vh] space-y-2 overflow-auto rounded-2xl border border-theme-border bg-theme-surface p-3 lg:max-h-[calc(100vh-180px)]">
                          {sessionFiles.map((file) => (
                            <SessionFileButton key={file.path} file={file} active={selectedSessionPath === file.path} onClick={() => void loadSessionFile(file.path)} />
                          ))}
                          {!sessionFiles.length && !sessionLoading ? <div className="py-8 text-center text-sm text-theme-text-muted">未找到 session JSONL 文件</div> : null}
                          {sessionLoading && !sessionFiles.length ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-theme-text-muted"><Loader2 size={16} className="animate-spin" />正在扫描会话文件...</div> : null}
                        </div>
                      </aside>

                      <section className="min-w-0 space-y-3">
                        {selectedSessionPath ? (
                          <div className="truncate rounded-xl border border-theme-border bg-theme-surface px-3 py-2 font-mono text-xs text-theme-text-muted" title={selectedSessionPath}>{selectedSessionPath}</div>
                        ) : null}
                        {sessionError ? <div className="rounded-xl border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] px-4 py-3 text-sm text-[var(--color-signal-amber)]">{sessionError}</div> : null}
                        {sessionLoading && selectedSessionPath ? (
                          <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-theme-border bg-theme-surface text-sm text-theme-text-muted">
                            <Loader2 size={16} className="animate-spin" />正在读取会话...
                          </div>
                        ) : sessionJsonl ? (
                          <VulnVerifyV2SessionPreview path={selectedSessionPath} jsonl={sessionJsonl} />
                        ) : !sessionError && !sessionLoading ? (
                          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-theme-border bg-theme-surface text-sm text-theme-text-muted">请选择 JSONL 文件</div>
                        ) : null}
                      </section>
              </div>
            ) : (
              <>
                    {/* 头部：metadata */}
                    <div className="space-y-4 px-1 pb-2">
                      <div className="text-xs font-normal">
                        {[
                          ['漏洞ID', detail.vuln_id || detail.case_id, true],
                          ['AI模型', detail.runtime?.resolved_model || detail.model || '-', false],
                          ['创建时间', fmtTime(detail.created_at), false],
                        ].map(([label, value, mono]) => (
                          <div key={String(label)} className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 border-b border-theme-border/70 py-2">
                            <span className="text-theme-text-muted">{label}</span>
                            <span className={`${mono ? 'font-mono' : ''} truncate text-theme-text-secondary`} title={String(value)}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  {/* 结论依据 */}
                  <section className="space-y-3">
                    <div className="text-base font-medium text-theme-text-primary">验证结论</div>
                    <div className="space-y-4 rounded-2xl border border-theme-border bg-theme-surface p-5">
                      {(() => {
                        const outcome = outcomeBadge(undefined, detail.verdict);
                        const Icon = outcome.Icon;
                        return (
                          <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${outcome.iconCls}`}>
                            {Icon ? <Icon size={17} strokeWidth={2.5} className="shrink-0" /> : null}
                            <span className="truncate">{outcome.label}</span>
                          </div>
                        );
                      })()}
                      {detailRaw.root_cause_summary ? (
                        <p className="whitespace-pre-wrap text-sm font-normal leading-6 text-theme-text-primary">
                          {String(detailRaw.root_cause_summary)}
                        </p>
                      ) : (
                        <Minus size={16} strokeWidth={2.2} className="text-theme-text-muted" />
                      )}
                    </div>
                  </section>

                  {/* 四维判定 */}
                  <section className="space-y-3">
                    <div className="text-base font-medium text-theme-text-primary">四维判定</div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-5 py-3">
                      {detailHasFinalVerdict ? (
                        <div className="divide-y divide-theme-border/70">
                          {DIMENSION_KEYS.map((key) => {
                            const dim = detailDimensions[key];
                            return <DimensionCard key={key} dimKey={key} status={dim?.status} detail={dim?.detail} />;
                          })}
                        </div>
                      ) : (
                        <div className="py-5">
                          <Minus size={16} strokeWidth={2.2} className="text-theme-text-muted" />
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 时间线 */}
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-base font-medium text-theme-text-primary">时间线</div>
                      {devMode && detail.work_dir ? (
                        <button onClick={() => void openSessionView()} aria-label="会话记录" className="inline-flex h-8 shrink-0 items-center rounded-lg border border-theme-border bg-theme-surface px-3 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated hover:text-theme-text-primary">
                          <FileText size={14} className="mr-1.5" />会话记录
                        </button>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <AttemptTimeline attempts={detailAttempts} devMode={devMode} />
                    </div>
                  </section>
                </>
            )
          ) : (
            <div className="py-10 text-center text-sm font-normal text-theme-text-muted">加载详情失败</div>
          )}
        </VulnVerifyV2RightDrawer>
      ) : null}
    </div>
  );
};
