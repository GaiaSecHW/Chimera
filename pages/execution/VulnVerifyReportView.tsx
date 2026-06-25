import React, { useMemo, useState } from 'react';
import { ChevronRight, Filter, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { VulnVerifyReportData, VulnVerifyReportGroup, VulnVerifyReportItem } from '../../clients/vulnVerify';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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

function verdictStyle(verdict?: string): { border: string; backgroundColor: string; color: string } {
  if (verdict === 'confirmed') return { border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.1)', color: LK.error };
  if (verdict === 'ruled_out') return { border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success };
  if (verdict === 'unresolved') return { border: `1px solid ${LK.warning}`, backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning };
  return { border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, color: LK.body };
}

function severityStyle(severity?: string): { color: string; backgroundColor: string; border: string } {
  const value = String(severity || '').toLowerCase();
  if (value === 'critical') return { color: LK.critical, backgroundColor: 'rgba(255, 77, 79, 0.1)', border: `1px solid ${LK.critical}` };
  if (value === 'high') return { color: LK.high, backgroundColor: 'rgba(255, 139, 61, 0.1)', border: `1px solid ${LK.high}` };
  if (value === 'medium') return { color: LK.medium, backgroundColor: 'rgba(240, 182, 76, 0.1)', border: `1px solid ${LK.medium}` };
  if (value === 'low') return { color: LK.low, backgroundColor: 'rgba(73, 197, 255, 0.1)', border: `1px solid ${LK.low}` };
  return { color: LK.body, backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` };
}

const ReportStatCard: React.FC<{ label: string; value: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' | 'slate' }> = ({ label, value, tone = 'slate' }) => {
  const color = tone === 'blue' ? LK.info : tone === 'green' ? LK.success : tone === 'red' ? LK.error : tone === 'amber' ? LK.warning : LK.ink;
  return (
    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{label}</div>
      <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color }}>{value}</div>
    </div>
  );
};

const VerdictBadge: React.FC<{ verdict?: string }> = ({ verdict }) => {
  const style = verdictStyle(verdict);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', border: style.border, paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', fontWeight: 600, backgroundColor: style.backgroundColor, color: style.color }}>
      {VERDICT_LABEL[verdict || ''] || verdict || '未验证'}
    </span>
  );
};

const DimensionBadge: React.FC<{ name: string; status?: boolean | null; detail?: string }> = ({ name, status, detail }) => {
  const style = status === true
    ? { border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success }
    : status === false
    ? { border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.1)', color: LK.error }
    : { border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, color: LK.body };
  return (
    <span
      title={detail || ''}
      style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '8px', border: style.border, paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', fontWeight: 600, backgroundColor: style.backgroundColor, color: style.color }}
    >
      {DIMENSION_LABEL[name] || name}: {status ? '✓' : status === false ? '✕' : '?'}
    </span>
  );
};

const ReportItemView: React.FC<{ report: VulnVerifyReportItem }> = ({ report }) => {
  const [open, setOpen] = useState(false);
  const dimensions = Object.entries(report.dimensions || {});
  return (
    <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '16px', textAlign: 'left', cursor: 'pointer', backgroundColor: 'transparent', border: 'none' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, color: LK.info }}>{report.id}</span>
            <span style={{ borderRadius: '6px', border: `1px solid ${severityStyle(report.severity).border}`, paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', backgroundColor: severityStyle(report.severity).backgroundColor, color: severityStyle(report.severity).color }}>{report.severity || 'unknown'}</span>
            <VerdictBadge verdict={report.verdict} />
          </div>
          <div style={{ marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 600, color: LK.ink }} title={report.title}>{report.title || report.id}</div>
        </div>
        <ChevronRight size={16} style={{ marginTop: '4px', flexShrink: 0, color: LK.muted, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} />
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop:`1px solid ${LK.borderSoft}`, padding: '16px' }}>
          {dimensions.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {dimensions.map(([name, dim]) => <DimensionBadge key={name} name={name} status={dim.status} detail={dim.detail} />)}
            </div>
          ) : null}

          {report.root_cause ? (
            <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>根因分析</div>
              <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '24px', color: LK.ink }}>{report.root_cause}</div>
            </div>
          ) : null}

          {report.exploit ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px' }}><div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: LK.muted }}>前置条件</div><div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '20px', color: LK.body }}>{report.exploit.preconditions || '-'}</div></div>
              <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px' }}><div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: LK.muted }}>利用复杂度</div><div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '20px', color: LK.body }}>{report.exploit.complexity || '-'}</div></div>
              <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px' }}><div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: LK.muted }}>最坏影响</div><div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '20px', color: LK.body }}>{report.exploit.impact || '-'}</div></div>
            </div>
          ) : null}

          {report.evidence?.length ? (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: LK.body }}>验证证据（{report.evidence.length} 条）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {report.evidence.map((ev, index) => (
                  <div key={`${ev.type}-${index}`} style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px', fontSize: '12px', lineHeight: '20px' }}>
                    <span style={{ display: 'inline-flex', borderRadius: '6px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', paddingLeft: '8px', paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px', fontSize: '10px', fontWeight: 600, color: LK.info }}>{EVIDENCE_LABEL[ev.type] || ev.type || '证据'}</span>
                    <div style={{ marginTop: '8px', fontWeight: 600, color: LK.body }}>{ev.claim}</div>
                    <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', color: LK.ink }}>{ev.finding}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {report.ruled_out_by ? (
            <div style={{ borderRadius: '12px', border: `1px solid ${LK.warning}`, backgroundColor: 'rgba(213, 161, 58, 0.1)', paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '12px', fontWeight: 600, color: LK.warning }}>
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
  const verdictText = Object.entries(group.verdicts || {}).map(([k, v]) =>`${VERDICT_LABEL[k] || k}×${v}`).join(' · ');
  return (
    <div style={{ borderRadius: '16px', border: `1px solid ${group.dominant === 'confirmed' ? LK.error : LK.borderSoft}`, backgroundColor: LK.surface }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ display: 'flex', width: '100%', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px', textAlign: 'left', cursor: 'pointer', backgroundColor: 'transparent', border: 'none' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {group.dominant === 'confirmed' ? <ShieldAlert size={16} style={{ color: LK.error }} /> : group.dominant === 'ruled_out' ? <ShieldCheck size={16} style={{ color: LK.success }} /> : <ShieldQuestion size={16} style={{ color: LK.warning }} />}
            <span style={{ fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: LK.ink }}>{group.function || group.id}</span>
            <VerdictBadge verdict={group.dominant} />
            <span style={{ fontSize: '12px', color: LK.muted }}>{group.report_count} 报告</span>
          </div>
          <div style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: '12px', color: LK.body }} title={group.file}>{group.file || '-'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: LK.body }}>
          <span>{verdictText}</span>
          <ChevronRight size={16} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        </div>
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop:`1px solid ${LK.borderSoft}`, padding: '16px' }}>
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '32px', fontSize: '14px', color: LK.body }}>加载验证报告...</div>;
  if (error) return <div style={{ borderRadius: '16px', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.1)', padding: '16px', fontSize: '14px', fontWeight: 600, color: LK.error }}>{error}</div>;
  if (!data) return <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, padding: '32px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>暂无验证报告数据</div>;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: LK.ink }}>{data.title || '漏洞验证报告'}</h3>
          <p style={{ marginTop: '4px', fontSize: '12px', color: LK.body }}>{data.target} · {data.total_reports} 条报告 · {data.total_groups} 个分组 · {data.total_verified} 条验证结果</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px' }}>
        <ReportStatCard label="总验证数" value={data.total_verified} tone="blue" />
        <ReportStatCard label="排除" value={data.verdicts?.ruled_out || 0} tone="green" />
        <ReportStatCard label="确认漏洞" value={data.verdicts?.confirmed || 0} tone="red" />
        <ReportStatCard label="未定论" value={data.verdicts?.unresolved || 0} tone="amber" />
        <ReportStatCard label="分组数" value={data.total_groups} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px' }}>
        <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
          <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索函数 / 文件 / 报告 ID / 标题" style={{ width: '100%', borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingTop: '8px', paddingBottom: '8px', paddingLeft: '36px', paddingRight: '12px', fontSize: '14px', color: LK.ink, outline: 'none' }} />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: LK.body }}><Filter size={14} />判定</label>
        <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value)} style={{ borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '14px', color: LK.ink }}>
          <option value="all">全部判定</option>
          {Object.entries(VERDICT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {visibleGroups.length ? visibleGroups.map((group) => <GroupCard key={group.id} group={group} />) : (
          <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, padding: '32px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>没有匹配的报告分组</div>
        )}
      </div>
    </section>
  );
};
