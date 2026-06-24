import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../design-system';
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2, RefreshCw, Shield, X } from 'lucide-react';
import { vulnApi } from '../../clients/vuln';
import { useUiFeedback } from '../../components/UiFeedback';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const truncate = (value?: string | null, max = 60) => {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: LK.error,
  high: '#e08a3a',
  medium: LK.warning,
  low: LK.info,
};

const renderSeverity = (severity?: string | null) => {
  const value = String(severity || '').toLowerCase();
  const color = SEVERITY_COLOR[value] || LK.muted;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {severity || '—'}
    </span>
  );
};

const STAGE_LABEL: Record<string, string> = {
  receive: '已接收',
  triage: '研判中',
  validation: '研判中',
  finished: '已结束',
};

const renderStage = (stage?: string | null) => {
  const value = String(stage || '');
  return STAGE_LABEL[value] || value || '—';
};

const OPTIONAL_COLUMNS = [
  { key: 'cvss_score', label: 'CVSS', accessor: (c: any) => (c.cvss_score != null ? Number(c.cvss_score).toFixed(1) : '—') },
  { key: 'confidence', label: '置信度', accessor: (c: any) => (c.confidence != null ? `${Math.round(Number(c.confidence) * 100)}%` : '—') },
  { key: 'global_vuln_id', label: '全局漏洞 ID', accessor: (c: any) => c.global_vuln_id || '—', mono: true },
  { key: 'reporter', label: '上报方', accessor: (c: any) => [c.reporter?.type, c.reporter?.name].filter(Boolean).join(' / ') || '—' },
  { key: 'source_task', label: '来源任务', accessor: (c: any) => c.source_task?.task_id || '—', mono: true },
  { key: 'source_execution', label: '来源执行', accessor: (c: any) => c.source_task?.execution_id || '—', mono: true },
  { key: 'current_status', label: '当前状态', accessor: (c: any) => c.current_status || '—' },
  { key: 'triage_decision', label: '研判结论', accessor: (c: any) => c.triage_decision || c.decision_status || '—' },
  { key: 'validation_result', label: '验证结果', accessor: (c: any) => c.validation_result || '—' },
  { key: 'finished_reason', label: '结束原因', accessor: (c: any) => c.finished_reason || '—' },
  { key: 'created_at', label: '创建时间', accessor: (c: any) => formatDateTime(c.created_at) },
  { key: 'updated_at', label: '更新时间', accessor: (c: any) => formatDateTime(c.updated_at) },
] as const;

const STORAGE_KEY = 'chimera:taskVulnList:columns';

const loadOptionalColumns = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const saveOptionalColumns = (set: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
};

export const TaskVulnListPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [submittingId, setSubmittingId] = useState<string>('');
  const [optionalColumns, setOptionalColumns] = useState<Set<string>>(() => loadOptionalColumns());
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const activeOptionalColumns = useMemo(() => OPTIONAL_COLUMNS.filter((col) => optionalColumns.has(col.key)), [optionalColumns]);

  const loadCases = async (nextPage = page) => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError('');
    try {
      const resp = await vulnApi.listCases({
        project_id: projectId,
        source_task_id: taskId,
        page: nextPage,
        page_size: pageSize,
      });
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setPage(resp.page || nextPage);
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCases(1);
  }, [projectId, taskId]);

  const toggleColumn = (key: string) => {
    setOptionalColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveOptionalColumns(next);
      return next;
    });
  };

  const canTriage = (caseItem: any) => {
    const stage = String(caseItem?.current_stage || '');
    return stage === 'receive' || stage === 'triage';
  };

  const submitTriage = async (caseItem: any, decision: 'vulnerable' | 'non_issue') => {
    if (!canTriage(caseItem) || submittingId) return;
    const confirmed = await confirm({
      title: decision === 'vulnerable' ? '确认漏洞有效' : '拒绝该漏洞',
      message: `「${caseItem.title || '未命名'}」\n确认后将记录研判结论${decision === 'vulnerable' ? '（vulnerable）' : '（non_issue）'}。`,
      confirmText: decision === 'vulnerable' ? '确认' : '拒绝',
      cancelText: '取消',
      danger: decision === 'non_issue',
    });
    if (!confirmed) return;
    setSubmittingId(caseItem.id);
    try {
      await vulnApi.submitTriageDecision(caseItem.id, { triage_decision: decision });
      notify(decision === 'vulnerable' ? '已确认漏洞' : '已拒绝漏洞', 'success');
      await loadCases(page);
    } catch (err: any) {
      notify(err?.message || '研判失败', 'error');
    } finally {
      setSubmittingId('');
    }
  };

  const headerCellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    borderBottom: `1px solid ${LK.border}`,
    backgroundColor: LK.surfaceRaised,
    ...extra,
  });

  return (
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <PageHeader
        title="任务漏洞"
        description={<span className="font-mono text-xs" style={{ color: LK.muted }}>source_task_id: {taskId || '—'}</span>}
        back={{ label: '返回', onClick: onBack }}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setColumnMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
              >
                列设置 <ChevronDown size={14} />
              </button>
              {columnMenuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setColumnMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 z-20 mt-1 max-h-[60vh] w-56 overflow-auto rounded-lg p-2"
                    style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                  >
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>
                      可选列
                    </div>
                    {OPTIONAL_COLUMNS.map((col) => {
                      const checked = optionalColumns.has(col.key);
                      return (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                          style={{ color: LK.body }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }}
                        >
                          <span style={{ color: checked ? LK.primary : LK.muted }}>
                            {checked ? <CheckCircle2 size={13} /> : <span className="inline-block h-[13px] w-[13px] rounded-full" style={{ border: `1px solid ${LK.border}` }} />}
                          </span>
                          {col.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
            <button
              onClick={() => void loadCases(page)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
            >
              <RefreshCw size={15} /> 刷新
            </button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: '漏洞总数', value: total, icon: Shield },
          { label: '可研判', value: items.filter(canTriage).length, icon: CheckCircle2 },
          { label: '已确认', value: items.filter((c) => c.decision_status === 'vulnerable' || c.triage_decision === 'vulnerable').length, icon: CheckCircle2 },
          { label: '已拒绝', value: items.filter((c) => c.decision_status === 'non_issue' || c.triage_decision === 'non_issue').length, icon: X },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div>
                <div className="text-xs" style={{ color: LK.muted }}>{stat.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{stat.value}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}>
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>标题 / 摘要</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>severity</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>阶段 / 决策</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>上报时间</th>
              {activeOptionalColumns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>{col.label}</th>
              ))}
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle()}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-10 text-center" colSpan={4 + activeOptionalColumns.length + 1} style={{ color: LK.muted }}>
                <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载中...</span>
              </td></tr>
            ) : null}
            {!loading && items.length === 0 ? (
              <tr><td className="px-4 py-10 text-center" colSpan={4 + activeOptionalColumns.length + 1} style={{ color: LK.muted }}>该任务暂无漏洞</td></tr>
            ) : null}
            {!loading && items.map((caseItem) => {
              const triageable = canTriage(caseItem);
              const blocking = submittingId === caseItem.id;
              return (
                <tr
                  key={caseItem.id}
                  className="transition-colors"
                  style={{ borderBottom: `1px solid ${LK.borderSoft}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td className="px-4 py-3 align-top" style={{ maxWidth: 360 }}>
                    <div className="font-semibold" style={{ color: LK.inkSoft }}>{caseItem.title || '未命名'}</div>
                    <div className="mt-1 text-xs" style={{ color: LK.muted }} title={caseItem.summary || ''}>{truncate(caseItem.summary, 120)}</div>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">{renderSeverity(caseItem.severity)}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <div className="font-semibold" style={{ color: LK.inkSoft }}>{renderStage(caseItem.current_stage)}</div>
                    <div className="text-xs" style={{ color: LK.muted }}>{caseItem.decision_status || '—'}</div>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-xs" style={{ color: LK.muted }}>
                    {formatDateTime(caseItem.reported_at)}
                  </td>
                  {activeOptionalColumns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 align-top text-xs whitespace-nowrap"
                      style={{ color: LK.body, fontFamily: (col as any).mono ? MONO : undefined }}
                    >
                      {col.accessor(caseItem)}
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void submitTriage(caseItem, 'vulnerable')}
                        disabled={!triageable || blocking}
                        title={!triageable ? '当前阶段不可研判（仅 receive / triage 阶段可操作）' : undefined}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ backgroundColor: `${LK.success}22`, color: LK.success, border: `1px solid ${LK.success}40` }}
                        onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = `${LK.success}3a`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.success}22`; }}
                      >
                        {blocking ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        确认
                      </button>
                      <button
                        onClick={() => void submitTriage(caseItem, 'non_issue')}
                        disabled={!triageable || blocking}
                        title={!triageable ? '当前阶段不可研判（仅 receive / triage 阶段可操作）' : undefined}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
                        onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = `${LK.error}3a`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.error}22`; }}
                      >
                        <X size={12} />
                        拒绝
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between text-sm" style={{ color: LK.muted }}>
          <div>共 {total} 条，当前第 {page} / {totalPages} 页</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadCases(page - 1)}
              disabled={page <= 1 || loading}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
            >
              上一页
            </button>
            <button
              onClick={() => void loadCases(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}

      {feedbackNodes}
    </div>
  );
};