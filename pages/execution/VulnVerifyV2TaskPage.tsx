import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, CircleHelp, Clock3, Loader2, PanelRightClose, RefreshCw, RotateCcw, Search, X, XCircle } from 'lucide-react';
import { vulnVerifyV2Api, VulnVerifyV2Attempt, VulnVerifyV2ProjectStats, VulnVerifyV2Result, VulnVerifyV2Task, VulnVerifyV2TaskDetail } from '../../clients/vulnVerifyV2';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  cancelled: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const VERDICT_LABEL: Record<string, string> = {
  confirmed: '确认漏洞',
  ruled_out: '排除漏洞',
  unresolved: '不可证',
  no_result: '未产出结果',
};

const DIMENSION_LABEL: Record<string, string> = {
  code_accurate: '代码定位准确',
  path_reachable: '路径可达',
  unmitigated: '无缓解措施',
  security_impact: '存在安全影响',
};

const DIMENSION_SHORT_LABEL: Record<string, string> = {
  code_accurate: '定位',
  path_reachable: '可达',
  unmitigated: '无缓解',
  security_impact: '影响',
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

function statusClass(status?: string): string {
  return STATUS_CLASS[status || ''] || 'bg-theme-elevated text-theme-text-secondary border-theme-border';
}

function fmtStatus(status?: string): string {
  return STATUS_LABEL[status || ''] || status || '-';
}

const VerdictBadge: React.FC<{ verdict?: string | null }> = ({ verdict }) => {
  const item = outcomeBadge(undefined, verdict);
  const Icon = item.Icon;
  return (
    <span className={`inline-flex w-auto items-center gap-1.5 rounded-full py-1.5 pl-3 pr-4 text-[13px] ${item.fontCls || 'font-semibold'} ${item.boxCls}`}>
      {Icon ? <Icon size={16} strokeWidth={2.2} className={`shrink-0 ${item.iconCls}`} /> : null}
      <span className={item.iconCls}>{item.label}</span>
    </span>
  );
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-normal ${statusClass(status)}`}>
    {status === 'running' ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
    {fmtStatus(status)}
  </span>
);

function outcomeBadge(status?: string, verdict?: string | null): { label: string; iconCls: string; boxCls: string; fontCls?: string; plain?: boolean; iconOnly?: boolean; Icon?: React.ElementType; loading?: boolean } {
  if (status === 'running') return { label: '验证中', iconCls: 'text-emerald-300', boxCls: '', iconOnly: true, loading: true };
  if (status === 'pending') return { label: '等待中', iconCls: 'text-theme-text-faint', boxCls: '', fontCls: 'font-normal', plain: true, iconOnly: true, Icon: Clock3 };
  if (status === 'failed') return { label: '验证失败', iconCls: 'text-rose-400', boxCls: 'border border-white/5 bg-rose-500/20', Icon: XCircle };
  if (status === 'cancelled') return { label: '已取消', iconCls: 'text-amber-400', boxCls: 'border border-white/5 bg-amber-500/20', Icon: Ban };
  if (verdict === 'confirmed') return { label: '已确认', iconCls: 'text-rose-400', boxCls: 'border border-white/5 bg-rose-500/20', Icon: AlertTriangle };
  if (verdict === 'ruled_out') return { label: '已排除', iconCls: 'text-sky-400', boxCls: 'border border-white/5 bg-sky-500/20', Icon: CheckCircle2 };
  if (verdict === 'unresolved') return { label: '不可证', iconCls: 'text-amber-400', boxCls: 'border border-white/5 bg-amber-500/20', Icon: CircleHelp };
  return { label: '未产出结果', iconCls: 'text-theme-text-muted', boxCls: 'border-theme-border bg-theme-elevated', Icon: CircleHelp };
}

const OutcomePill: React.FC<{ item: ReturnType<typeof outcomeBadge>; size?: 'normal' | 'sm' }> = ({ item, size = 'normal' }) => {
  const Icon = item.Icon;
  const isSm = size === 'sm';
  const boxCls = item.boxCls;
  return (
    <span className={`inline-flex w-auto items-center ${item.iconOnly ? `justify-center ${isSm ? 'px-2 py-1' : 'px-2.5 py-1.5'}` : `${isSm ? 'gap-1.5 py-1 pl-2 pr-3' : 'gap-1.5 pl-3 pr-4 py-1.5'} rounded-full ${boxCls}`} ${isSm ? 'text-xs' : 'text-[13px]'} ${item.fontCls || 'font-semibold'}`}>
      {item.loading ? (
        <Loader2 size={isSm ? 14 : 18} strokeWidth={isSm ? 2.5 : 2.8} className={`shrink-0 animate-spin ${item.iconCls}`} />
      ) : Icon ? (
        <Icon size={isSm ? 13 : 16} strokeWidth={2.2} className={`shrink-0 ${item.iconCls}`} />
      ) : null}
      {item.iconOnly ? null : <span className={`truncate ${item.iconCls}`}>{item.label}</span>}
    </span>
  );
};

const TaskOutcomeBadge: React.FC<{ status?: string; verdict?: string | null }> = ({ status, verdict }) => (
  <OutcomePill item={outcomeBadge(status, verdict)} />
);

const AttemptStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'success') {
    return <OutcomePill size="sm" item={{ label: '成功', iconCls: 'text-emerald-400', boxCls: 'border border-white/5 bg-emerald-500/20', Icon: CheckCircle2 }} />;
  }
  return <OutcomePill size="sm" item={outcomeBadge(status, null)} />;
};

function normalizeRuledOutBy(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

const EvidencePill: React.FC<{ children: React.ReactNode; tone?: 'rose' | 'emerald' | 'amber' | 'blue' | 'muted'; title?: string }> = ({ children, tone = 'muted', title }) => {
  const cls = tone === 'rose'
    ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
    : tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : tone === 'amber'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
        : tone === 'blue'
          ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
          : 'border-theme-border bg-theme-elevated text-theme-text-muted';
  return <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-normal ${cls}`}>{children}</span>;
};

const TaskDecisionEvidence: React.FC<{ task: VulnVerifyV2Task }> = ({ task }) => {
  if (task.status === 'running' || task.status === 'pending') return <span className="text-[13px] font-normal text-theme-text-faint">-</span>;
  if (task.status === 'failed') return <EvidencePill tone="rose">执行失败</EvidencePill>;
  if (task.status === 'cancelled') return <EvidencePill tone="amber">已取消</EvidencePill>;

  if (task.verdict === 'confirmed') {
    const summary = task.root_cause_summary || '';
    return summary
      ? <div className="line-clamp-2 text-[13px] font-normal text-theme-text-secondary" title={summary}>{summary}</div>
      : <span className="text-[13px] font-normal text-theme-text-faint">-</span>;
  }

  if (task.verdict === 'ruled_out') {
    const reasons = normalizeRuledOutBy(task.ruled_out_by);
    if (!reasons.length) return <EvidencePill>排除原因见详情</EvidencePill>;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {reasons.map((key) => (
          <EvidencePill key={key} title={dimensionConclusionText(key, false)}>
            <CheckCircle2 size={13} strokeWidth={2.1} className="mr-1 shrink-0 text-sky-400" />
            {dimensionConclusionText(key, false)}
          </EvidencePill>
        ))}
      </div>
    );
  }

  if (task.verdict === 'unresolved') return <span className="text-[13px] font-normal text-theme-text-secondary">证据不足</span>;
  return <EvidencePill>未产出判定</EvidencePill>;
};

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'emerald' | 'sky' | 'rose' | 'amber' | 'slate'; Icon?: React.ElementType }> = ({ label, value, hint, accent = 'slate', Icon }) => {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'sky' ? 'text-sky-400' : accent === 'rose' ? 'text-rose-400' : accent === 'amber' ? 'text-amber-400' : 'text-theme-text-primary';
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
      <div className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${color}`}>
        {Icon ? <Icon size={13} strokeWidth={2.1} className="shrink-0" /> : null}
        <span>{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-theme-text-muted">{hint}</div> : null}
    </div>
  );
};

const DIMENSION_KEYS = ['code_accurate', 'path_reachable', 'unmitigated', 'security_impact'] as const;

function dimensionConclusionText(dimKey: string, status?: boolean | null): string {
  const textMap: Record<string, { pass: string; fail: string; unknown: string }> = {
    code_accurate: { pass: '代码准确', fail: '代码不准确', unknown: '代码定位未判定' },
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
    ? { cls: 'text-rose-400', Icon: AlertTriangle, label: '支持漏洞成立' }
    : status === false
      ? { cls: 'text-sky-400', Icon: CheckCircle2, label: '支持排除漏洞' }
      : { cls: 'text-amber-400', Icon: CircleHelp, label: '未判定' };
  const statusCls = statusTone.cls;
  const StatusIcon = statusTone.Icon;
  return (
    <div className="grid grid-cols-[minmax(156px,188px)_minmax(0,1fr)] items-start gap-3 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center ${statusCls}`} title={statusTone.label}>
          <StatusIcon size={16} strokeWidth={2.1} />
        </div>
        <div className={`min-w-0 truncate pt-1 text-[15px] font-semibold leading-6 ${statusCls}`}>{conclusion}</div>
      </div>
      <div className="min-w-0">
        <div className="whitespace-pre-wrap break-words text-[13px] font-normal leading-6 text-theme-text-primary">{detail || '-'}</div>
      </div>
    </div>
  );
};

const AttemptTimeline: React.FC<{ attempts: VulnVerifyV2Attempt[] }> = ({ attempts }) => {
  if (!attempts.length) {
    return <div className="py-6 text-center text-[13px] font-normal text-theme-text-muted">暂无执行尝试记录</div>;
  }
  return (
    <ol className="space-y-3">
      {attempts.map((att) => {
        const isFailed = att.status === 'failed';
        const dotCls = att.status === 'success' ? 'bg-emerald-400'
          : att.status === 'failed' ? 'bg-rose-400'
          : att.status === 'running' ? 'bg-blue-400'
          : att.status === 'cancelled' ? 'bg-amber-400'
          : 'bg-theme-border';
        const duration = att.started_at
          ? fmtDurationMs((att.completed_at ? new Date(att.completed_at).getTime() : Date.now()) - new Date(att.started_at).getTime())
          : '-';
        const failureMsg = att.failure_reason && typeof att.failure_reason === 'object'
          ? String((att.failure_reason as any).message || (att.failure_reason as any).error || JSON.stringify(att.failure_reason))
          : null;
        return (
          <li key={att.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className={`h-2.5 w-2.5 rounded-full ${dotCls}`} />
              <span className="mt-1 w-px flex-1 bg-theme-border" />
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium text-theme-text-primary">第 {att.attempt_number} 次执行</span>
                <AttemptStatusBadge status={att.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-normal text-theme-text-muted">
                <span>开始：{fmtTime(att.started_at)}</span>
                <span>结束：{fmtTime(att.completed_at)}</span>
                <span>耗时：{duration}</span>
              </div>
              {isFailed && failureMsg ? (
                <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[13px] font-normal text-rose-300 break-words">{failureMsg}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export const VulnVerifyV2TaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyV2Api.getHealth);
  const { feedbackNodes, notify } = useUiFeedback();

  const [tasks, setTasks] = useState<VulnVerifyV2Task[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VulnVerifyV2ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
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
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const closeDetailTimerRef = useRef<number | null>(null);

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, offset + tasks.length);
  const resultFilterValue = resultFilter;

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


  const loadOverview = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
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
      setMessage(null);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, resultFilter, statusFilter, verdictFilter, search, perPage, offset]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

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
      closeDetailTimerRef.current = null;
    }, 220);
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
      notify('已请求重新执行', 'success');
      await loadOverview();
      if (selectedTaskId === taskId) await loadDetail(taskId);
    } catch (e: any) {
      notify(e?.message || String(e), 'error', '重新执行失败');
    }
  }, [projectId, loadOverview, loadDetail, selectedTaskId, notify]);

  const confirmedVulns = Number(stats?.confirmed ?? 0);
  const ruledOutVulns = Number(stats?.ruled_out ?? 0);
  const unresolvedVulns = Number(stats?.unresolved ?? 0);

  const detailResult = detail?.results?.[0] as VulnVerifyV2Result | undefined;
  const detailRaw = (detailResult?.raw_result || {}) as Record<string, any>;
  const detailDimensions = (detailRaw.dimensions || detailResult?.dimensions || {}) as Record<string, { status?: boolean | null; detail?: string }>;
  const detailAttempts = detail?.attempts || [];
  const ruledOutByRaw = detailRaw.ruled_out_by;
  const ruledOutByList = Array.isArray(ruledOutByRaw) ? ruledOutByRaw.map(String) : ruledOutByRaw ? [String(ruledOutByRaw)] : [];

  return (
    <div className="min-h-full bg-theme-bg-app text-theme-text-primary">
      <div className="w-full space-y-8 px-4 lg:px-6 xl:px-8">
        {feedbackNodes}
        <PageHeader
          title={<ServicePageTitle title="漏洞验证 v2" version={buildVersion} />}
          description="基于漏洞报告、代码上下文与威胁模型，由 AI 围绕代码定位、路径可达性、缓解措施和安全影响进行四维判定，产出确认漏洞、排除漏洞或不可证结论。"
          actions={
            <button type="button" onClick={() => void loadOverview()} className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3.5 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />刷新
            </button>
          }
        />

        {message ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{message}</div> : null}

        <section>
          <div className="grid gap-5 md:grid-cols-3">
            <SummaryCard label="已确认" value={confirmedVulns} accent="rose" Icon={AlertTriangle} hint="确认存在真实漏洞风险" />
            <SummaryCard label="已排除" value={ruledOutVulns} accent="sky" Icon={CheckCircle2} hint="验证后排除漏洞风险" />
            <SummaryCard label="不可证" value={unresolvedVulns} accent="amber" Icon={CircleHelp} hint="现有证据不足以判定" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4">
          {/* 列表 */}
          <section>
            <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-[260px] flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
                  <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜索标题 / ID" className="form-input h-10 w-full py-2 pl-9 pr-9 text-sm text-theme-text-primary" />
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
                <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="验证结果筛选">
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
                    const activeCls = 'border-blue-600 bg-blue-600 text-white';
                    return (
                      <button
                        key={option.value || 'all'}
                        type="button"
                        onClick={() => handleResultFilterChange(option.value)}
                        className={`shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${active ? activeCls : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

            <div className="overflow-hidden bg-theme-surface">
              <div className="hidden border-b border-theme-border bg-theme-elevated/80 px-4 py-3 text-xs font-medium text-theme-text-muted lg:grid lg:grid-cols-[minmax(240px,1.55fr)_128px_minmax(160px,0.9fr)_80px] lg:gap-4">
                <div>漏洞标题 / ID</div>
                <div className="text-center">验证结果</div>
                <div className="lg:pl-5">判定依据</div>
                <div className="text-center">耗时</div>
              </div>
              <div className="divide-y divide-theme-border">
                {tasks.map((task) => {
                  const runtime = task.runtime;
                  const isSel = selectedTaskId === task.id;
                  const showRuntime = task.verdict === 'confirmed' || task.verdict === 'ruled_out' || task.verdict === 'unresolved';
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => void loadDetail(task.id)}
                      className={`relative grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-theme-elevated lg:grid-cols-[minmax(240px,1.55fr)_128px_minmax(160px,0.9fr)_80px] lg:items-center lg:gap-4 ${isSel ? 'bg-blue-500/15' : ''}`.trim()}
                    >
                      {isSel ? <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-1.5 rounded-r-full bg-blue-300" /> : null}
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-normal text-theme-text-primary" title={task.name}>{task.name}</div>
                        <div className="mt-1 font-mono text-xs text-theme-text-faint">{task.vuln_id || task.case_id || '-'}</div>
                      </div>
                      <div className="flex items-center justify-center">
                        <TaskOutcomeBadge status={task.status} verdict={task.verdict} />
                      </div>
                      <div className="min-w-0 lg:flex lg:items-center lg:pl-5">
                        <div className="mb-1 text-xs font-medium text-theme-text-muted lg:hidden">判定依据</div>
                        <TaskDecisionEvidence task={task} />
                      </div>
                      <div className="flex items-center gap-2 text-xs lg:justify-end">
                        <span className="text-xs font-medium text-theme-text-muted lg:hidden">耗时</span>
                        <span className="text-[13px] font-normal text-theme-text-secondary lg:text-right">{showRuntime ? fmtRuntime(runtime) : '-'}</span>
                      </div>
                    </button>
                  );
                })}
                {!tasks.length && !loading ? (
                  <div className="py-10 text-center text-sm text-theme-text-muted">暂无任务</div>
                ) : null}
              </div>
            </div>

              <div className="mt-4 flex flex-col gap-3 text-xs text-theme-text-muted sm:flex-row sm:items-center sm:justify-between">
                <span>第 {page}/{totalPages} 页 · {pageStart}-{pageEnd} / {total}</span>
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
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40">上一页</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40">下一页</button>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {selectedTaskId ? (
        <div
          className={`fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${detailPanelOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeDetailPanel}
          role="presentation"
        >
          <aside
            className={`absolute right-0 top-0 flex h-full w-full max-w-[1080px] transform flex-col overflow-visible border-l border-theme-border bg-theme-surface shadow-2xl transition-transform duration-300 ease-out xl:w-[62vw] 2xl:max-w-[1180px] ${detailPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="验证详情"
          >
            <button
              onClick={closeDetailPanel}
              aria-label="收起详情"
              title="收起详情"
              className="absolute left-0 top-1/2 z-10 inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-theme-border bg-theme-surface/95 text-theme-text-muted shadow-md backdrop-blur hover:bg-theme-elevated hover:text-theme-text-primary"
            >
              <PanelRightClose size={14} strokeWidth={2.1} />
            </button>
            <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-8 lg:px-10 lg:py-10">
              {detailLoading ? (
                <div className="flex h-full min-h-[300px] items-center justify-center gap-2 py-10 text-[13px] font-normal text-theme-text-muted">
                  <Loader2 size={16} className="animate-spin" />加载详情...
                </div>
              ) : detail ? (
                <div className="space-y-7">
                  {/* 头部：标题 + 结论 + 重试 */}
                  <div className="px-1 pb-2 pt-4">
                    <div className="min-w-0">
                      <div className="whitespace-normal break-words text-[17px] font-bold leading-6 text-theme-text-primary" title={detail.name}>{detail.name}</div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <VerdictBadge verdict={detail.verdict} />
                        <button onClick={() => void handleRerun(detail.id)} aria-label="重新执行" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-theme-border px-3 py-1.5 text-[13px] font-medium text-theme-text-secondary hover:bg-theme-elevated">
                          <RotateCcw size={13} />重试
                        </button>
                      </div>
                      <div className="mt-4 text-xs font-normal">
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
                  </div>

                  {/* 根因摘要 */}
                  <section>
                    <div className="mb-3 text-[15px] font-medium text-theme-text-primary">根因摘要</div>
                    <div className="rounded-2xl border border-theme-border bg-theme-elevated p-5">
                      <p className="whitespace-pre-wrap text-[13px] font-normal leading-6 text-theme-text-primary">
                        {String(detailRaw.root_cause_summary || '-')}
                      </p>
                    </div>
                  </section>

                  {/* 四维判定 */}
                  <section>
                    <div className="mb-3 text-[15px] font-medium text-theme-text-primary">四维判定</div>
                    <div className="rounded-2xl border border-theme-border bg-theme-elevated px-7 py-3 lg:px-8">
                      <div className="divide-y divide-theme-border/70">
                        {DIMENSION_KEYS.map((key) => {
                          const dim = detailDimensions[key];
                          return <DimensionCard key={key} dimKey={key} status={dim?.status} detail={dim?.detail} />;
                        })}
                      </div>
                    </div>
                  </section>

                  {/* 时间线 */}
                  <section>
                    <div className="mb-3 text-[15px] font-medium text-theme-text-primary">时间线</div>
                    <div className="rounded-2xl border border-theme-border bg-theme-elevated p-5">
                      <AttemptTimeline attempts={detailAttempts} />
                    </div>
                  </section>
                </div>
              ) : (
                <div className="py-10 text-center text-[13px] font-normal text-theme-text-muted">加载详情失败</div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
};
