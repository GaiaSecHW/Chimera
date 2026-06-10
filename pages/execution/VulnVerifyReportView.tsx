import React, { useMemo, useState } from 'react';
import { ChevronRight, Filter, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { VulnVerifyReportData, VulnVerifyReportGroup, VulnVerifyReportItem } from '../../clients/vulnVerify';

const VERDICT_LABEL: Record<string, string> = {
  confirmed: '确认漏洞',
  ruled_out: '排除',
  unresolved: '未定论',
  unverified: '未验证',
};

const DIMENSION_LABEL: Record<string, string> = {
  code_accurate: '代码准确性',
  path_reachable: '路径可达性',
  unmitigated: '防护缺失',
  security_impact: '安全影响',
};

const RULED_OUT_BY_LABEL: Record<string, string> = {
  code_accurate: '代码事实不准确',
  path_reachable: '攻击路径不可达',
  unmitigated: '已有有效防护',
  security_impact: '无实质安全影响',
};

const EVIDENCE_LABEL: Record<string, string> = {
  source: '源码验证',
  defense: '防御分析',
  attack_surface: '攻击面',
  impact: '影响评估',
  binary: '二进制验证',
};

function verdictClass(verdict?: string): string {
  if (verdict === 'confirmed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (verdict === 'ruled_out') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (verdict === 'unresolved') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function severityClass(severity?: string): string {
  const value = String(severity || '').toLowerCase();
  if (value === 'critical') return 'text-rose-700 bg-rose-50 border-rose-200';
  if (value === 'high') return 'text-orange-700 bg-orange-50 border-orange-200';
  if (value === 'medium') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (value === 'low') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

const ReportStatCard: React.FC<{ label: string; value: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' | 'slate' }> = ({ label, value, tone = 'slate' }) => {
  const color = tone === 'blue' ? 'text-blue-600' : tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : 'text-theme-text-primary';
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint">{label}</div>
      <div className={`mt-2 text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
};

const VerdictBadge: React.FC<{ verdict?: string }> = ({ verdict }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${verdictClass(verdict)}`}>
    {VERDICT_LABEL[verdict || ''] || verdict || '未验证'}
  </span>
);

const DimensionBadge: React.FC<{ name: string; status?: boolean | null; detail?: string }> = ({ name, status, detail }) => (
  <span
    title={detail || ''}
    className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${status ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === false ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
  >
    {DIMENSION_LABEL[name] || name}: {status ? '✓' : status === false ? '✕' : '?'}
  </span>
);

const ReportItemView: React.FC<{ report: VulnVerifyReportItem }> = ({ report }) => {
  const [open, setOpen] = useState(false);
  const dimensions = Object.entries(report.dimensions || {});
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-theme-elevated">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-black text-blue-600">{report.id}</span>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${severityClass(report.severity)}`}>{report.severity || 'unknown'}</span>
            <VerdictBadge verdict={report.verdict} />
          </div>
          <div className="mt-2 truncate text-sm font-black text-theme-text-primary" title={report.title}>{report.title || report.id}</div>
        </div>
        <ChevronRight size={16} className={`mt-1 shrink-0 text-theme-text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-theme-border p-4">
          {dimensions.length ? (
            <div className="flex flex-wrap gap-2">
              {dimensions.map(([name, dim]) => <DimensionBadge key={name} name={name} status={dim.status} detail={dim.detail} />)}
            </div>
          ) : null}

          {report.root_cause ? (
            <div className="rounded-2xl border border-theme-border bg-theme-elevated p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint">根因分析</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-theme-text-primary">{report.root_cause}</div>
            </div>
          ) : null}

          {report.exploit ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-theme-border bg-theme-elevated p-3"><div className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint">前置条件</div><div className="mt-1 text-xs leading-5 text-theme-text-secondary">{report.exploit.preconditions || '-'}</div></div>
              <div className="rounded-2xl border border-theme-border bg-theme-elevated p-3"><div className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint">利用复杂度</div><div className="mt-1 text-xs leading-5 text-theme-text-secondary">{report.exploit.complexity || '-'}</div></div>
              <div className="rounded-2xl border border-theme-border bg-theme-elevated p-3"><div className="text-[10px] font-black uppercase tracking-widest text-theme-text-faint">最坏影响</div><div className="mt-1 text-xs leading-5 text-theme-text-secondary">{report.exploit.impact || '-'}</div></div>
            </div>
          ) : null}

          {report.evidence?.length ? (
            <div>
              <div className="mb-2 text-xs font-black text-theme-text-secondary">验证证据（{report.evidence.length} 条）</div>
              <div className="space-y-2">
                {report.evidence.map((ev, index) => (
                  <div key={`${ev.type}-${index}`} className="rounded-2xl border border-theme-border bg-theme-elevated p-3 text-xs leading-5">
                    <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{EVIDENCE_LABEL[ev.type] || ev.type || '证据'}</span>
                    <div className="mt-2 font-semibold text-theme-text-secondary">{ev.claim}</div>
                    <div className="mt-1 whitespace-pre-wrap text-theme-text-primary">{ev.finding}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {report.ruled_out_by ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              排除原因：{RULED_OUT_BY_LABEL[report.ruled_out_by] || report.ruled_out_by}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const GroupCard: React.FC<{ group: VulnVerifyReportGroup }> = ({ group }) => {
  const [open, setOpen] = useState(group.dominant === 'confirmed');
  const verdictText = Object.entries(group.verdicts || {}).map(([k, v]) => `${VERDICT_LABEL[k] || k}×${v}`).join(' · ');
  return (
    <div className={`rounded-2xl border bg-theme-surface shadow-sm ${group.dominant === 'confirmed' ? 'border-rose-300' : 'border-theme-border'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-theme-elevated">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {group.dominant === 'confirmed' ? <ShieldAlert size={16} className="text-rose-500" /> : group.dominant === 'ruled_out' ? <ShieldCheck size={16} className="text-emerald-500" /> : <ShieldQuestion size={16} className="text-amber-500" />}
            <span className="font-mono text-sm font-black text-theme-text-primary">{group.function || group.id}</span>
            <VerdictBadge verdict={group.dominant} />
            <span className="text-xs text-theme-text-faint">{group.report_count} 报告</span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-theme-text-muted" title={group.file}>{group.file || '-'}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-theme-text-muted">
          <span>{verdictText}</span>
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-theme-border p-4">
          {group.reports.map((report) => <ReportItemView key={report.id} report={report} />)}
        </div>
      ) : null}
    </div>
  );
};

export const VulnVerifyReportView: React.FC<{ data: VulnVerifyReportData | null; loading?: boolean; error?: string | null }> = ({ data, loading = false, error = null }) => {
  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all');

  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.groups.filter((group) => {
      const text = [
        group.id,
        group.file,
        group.function,
        ...group.reports.flatMap((r) => [r.id, r.title, r.verdict]),
      ].join(' ').toLowerCase();
      const matchesSearch = !q || text.includes(q);
      const matchesVerdict = verdictFilter === 'all' || group.dominant === verdictFilter || group.reports.some((r) => r.verdict === verdictFilter);
      return matchesSearch && matchesVerdict;
    });
  }, [data, search, verdictFilter]);

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface p-8 text-sm text-theme-text-muted">加载验证报告...</div>;
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-dashed border-theme-border p-8 text-center text-sm text-theme-text-faint">暂无验证报告数据</div>;

  return (
    <section className="space-y-5 rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-theme-text-primary">{data.title || '漏洞验证报告'}</h3>
          <p className="mt-1 text-xs text-theme-text-muted">{data.target} · {data.total_reports} 条报告 · {data.total_groups} 个分组 · {data.total_verified} 条验证结果</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <ReportStatCard label="总验证数" value={data.total_verified} tone="blue" />
        <ReportStatCard label="排除" value={data.verdicts?.ruled_out || 0} tone="green" />
        <ReportStatCard label="确认漏洞" value={data.verdicts?.confirmed || 0} tone="red" />
        <ReportStatCard label="未定论" value={data.verdicts?.unresolved || 0} tone="amber" />
        <ReportStatCard label="分组数" value={data.total_groups} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-theme-border bg-theme-elevated p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-theme-text-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索函数 / 文件 / 报告 ID / 标题" className="w-full rounded-xl border border-theme-border bg-theme-surface py-2 pl-9 pr-3 text-sm text-theme-text-primary outline-none" />
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-theme-text-muted"><Filter size={14} />判定</label>
        <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary">
          <option value="all">全部判定</option>
          {Object.entries(VERDICT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {visibleGroups.length ? visibleGroups.map((group) => <GroupCard key={group.id} group={group} />) : (
          <div className="rounded-2xl border border-dashed border-theme-border p-8 text-center text-sm text-theme-text-faint">没有匹配的报告分组</div>
        )}
      </div>
    </section>
  );
};
