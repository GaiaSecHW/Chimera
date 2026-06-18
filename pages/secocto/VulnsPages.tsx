import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoVulnFinding, SecOctoVulnStats, SecOctoAnnotation, SecOctoPagerState, SecOctoNavKey, SecOctoReport } from '../../types/secocto';
import { SecOctoPager, PAGE_SIZE_OPTIONS } from './shared/Pager';
import { PageHeader } from '../../design-system';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'note'] as const;
const STATUS_TABS = ['confirmed', 'pending', 'false_positive', 'disputed'] as const;

const SEV_LABEL: Record<string, string> = { critical: '严重', high: '高危', medium: '中危', low: '低危', note: '提示' };
const SEV_STYLE: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-700', high: 'bg-orange-500/15 text-orange-700',
  medium: 'bg-amber-500/15 text-amber-700', low: 'bg-blue-500/15 text-blue-700',
  note: 'bg-gray-500/15 text-gray-600',
};
const STATUS_LABEL: Record<string, string> = { confirmed: '已确认', pending: '待确认', false_positive: '误报', disputed: '争议' };
const STATUS_STYLE: Record<string, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-700', pending: 'bg-amber-500/15 text-amber-700',
  false_positive: 'bg-blue-500/15 text-blue-700', disputed: 'bg-purple-500/15 text-purple-700',
};

interface VulnsListProps {
  onNavigateDetail: (id: number) => void;
  onNavigate: (navKey: SecOctoNavKey) => void;
}

export const SecOctoVulnsListPage: React.FC<VulnsListProps> = ({ onNavigateDetail, onNavigate }) => {
  const [items, setItems] = useState<SecOctoVulnFinding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SecOctoVulnStats | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, findingsRes] = await Promise.all([
        secoctoClients.vuln.stats(),
        secoctoClients.vuln.findings({
          severity: severityFilter,
          status: statusFilter,
          limit: pager.size,
          offset: (pager.page - 1) * pager.size,
        }),
      ]);
      setStats(statsRes);
      setItems(findingsRes.items);
      setTotal(findingsRes.total);
    } catch (e: any) {
      console.warn('[vulns] load failed:', e);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter, pager.page, pager.size]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSeverityClick = useCallback((sev: string) => {
    setSeverityFilter(severityFilter === sev ? '' : sev);
    setPager((prev) => ({ ...prev, page: 1 }));
  }, [severityFilter]);

  const handleStatusClick = useCallback((st: string) => {
    setStatusFilter(statusFilter === st ? '' : st);
    setPager((prev) => ({ ...prev, page: 1 }));
  }, [statusFilter]);

  const bySeverity = useMemo(() => {
    const map: Record<string, number> = {};
    if (stats?.by_severity) Object.assign(map, stats.by_severity);
    else SEVERITY_ORDER.forEach((s) => { map[s] = 0; });
    return map;
  }, [stats]);

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={<>漏洞<span className="gradient-text bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">管理</span></>}
        description={<>安全检测发现的风险 · 共 {total} 条</>}
        actions={<div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索..."
            className="pl-9 pr-4 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors"
          />
        </div>}
      />

      <div className="flex gap-2 mb-3 flex-wrap">
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            onClick={() => handleSeverityClick(sev)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${severityFilter === sev ? `${SEV_STYLE[sev]} ring-2 ring-offset-1 ring-brand-primary/30` : `border border-theme-border text-theme-text-secondary hover:bg-theme-elevated`}`}
          >
            {SEV_LABEL[sev]} ({bySeverity[sev] ?? 0})
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map((st) => (
          <button
            key={st}
            onClick={() => handleStatusClick(st)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${statusFilter === st ? `${STATUS_STYLE[st]} ring-2 ring-offset-1 ring-brand-primary/30` : `border border-theme-border text-theme-text-secondary hover:bg-theme-elevated`}`}
          >
            {STATUS_LABEL[st]}
          </button>
        ))}
        <button
          onClick={() => { setStatusFilter(''); setSeverityFilter(''); setPager((prev) => ({ ...prev, page: 1 })); }}
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-elevated"
        >全部</button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-theme-text-secondary">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-theme-text-secondary">暂无漏洞</div>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <button
              key={f.id}
              onClick={() => onNavigateDetail(f.id)}
              className="w-full rounded-xl border border-theme-border bg-theme-surface p-4 text-left hover:border-brand-primary/30 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-semibold text-theme-text-primary truncate">{f.title || f.rule_name || `Finding #${f.id}`}</div>
                <div className="text-xs text-theme-text-secondary mt-1 truncate">{f.location || f.file_path || '—'}</div>
                <div className="flex gap-2 mt-2">
                  {f.severity && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_STYLE[f.severity] || SEV_STYLE.note}`}>{SEV_LABEL[f.severity] || f.severity}</span>}
                  {f.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[f.status] || ''}`}>{STATUS_LABEL[f.status] || f.status}</span>}
                </div>
              </div>
              <ChevronRight size={18} className="text-theme-text-faint shrink-0" />
            </button>
          ))}
        </div>
      )}

      <SecOctoPager
        total={total}
        state={pager}
        onChange={(p) => setPager((prev) => ({ ...prev, page: p }))}
        onSizeChange={(s) => setPager({ page: 1, size: s })}
        sizeOptions={PAGE_SIZE_OPTIONS}
      />
    </div>
  );
};

interface VulnDetailProps {
  findingId: number;
  onBack: () => void;
  onNavigateReport: (id: number) => void;
}

export const SecOctoVulnDetailPage: React.FC<VulnDetailProps> = ({ findingId, onBack, onNavigateReport }) => {
  const [finding, setFinding] = useState<SecOctoVulnFinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [annotations, setAnnotations] = useState<SecOctoAnnotation[]>([]);
  const [showSarif, setShowSarif] = useState(false);

  useEffect(() => {
    setLoading(true);
    secoctoClients.vuln
      .findingById(findingId)
      .then((f) => {
        setFinding(f);
        setAnnotations(f.annotations || []);
      })
      .catch((e: any) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [findingId]);

  const handleSubmitAnnotation = useCallback(async () => {
    if (!verdict) return;
    setSubmitting(true);
    try {
      if (newStatus) await secoctoClients.vuln.updateStatus(findingId, newStatus);
      const payload: Record<string, any> = { verdict, analysis };
      const ann = await secoctoClients.vuln.createAnnotation(findingId, payload);
      if (ann) setAnnotations((prev) => [...prev, ann]);
      setVerdict('');
      setAnalysis('');
      setNewStatus('');
    } catch (e: any) {
      console.warn('[vuln-detail] annotation failed:', e);
    } finally {
      setSubmitting(false);
    }
  }, [verdict, analysis, newStatus, findingId]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (error || !finding) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载失败：{error || '未找到漏洞'}</div>;

  const severityBanner = finding.severity
    ? SEV_STYLE[finding.severity] || ''
    : '';

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={finding.title || finding.rule_name || `Finding #${finding.id}`}
        description={finding.location || finding.file_path || '—'}
        back={{ label: '返回漏洞列表', onClick: onBack }}
      />

      <div className={`rounded-xl border-l-4 p-4 mb-4 ${severityBanner?.includes('red') ? 'border-l-red-500' : severityBanner?.includes('orange') ? 'border-l-orange-500' : severityBanner?.includes('amber') ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
        {finding.severity && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_STYLE[finding.severity] || SEV_STYLE.note}`}>{SEV_LABEL[finding.severity] || finding.severity}</span>}
        {finding.status && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[finding.status] || ''}`}>{STATUS_LABEL[finding.status] || finding.status}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {finding.status && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">状态</span><div className={`mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[finding.status] || ''}`}>{STATUS_LABEL[finding.status] || finding.status}</div></div>}
        {finding.report_id && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center cursor-pointer hover:border-brand-primary/30" onClick={() => onNavigateReport(finding.report_id!)}><span className="text-xs text-theme-text-faint">报告</span><div className="mt-1 text-sm font-semibold text-brand-primary">#{finding.report_id}</div></div>}
        {finding.cvss_score != null && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">CVSS</span><div className="mt-1 text-sm font-semibold">{finding.cvss_score}</div></div>}
      </div>

      {finding.evidence_chain && finding.evidence_chain.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">证据链</h3>
          <div className="space-y-2">
            {finding.evidence_chain.map((ev, i) => (
              <div key={i} className="text-xs text-theme-text-secondary">
                <span className="font-medium text-theme-text-primary">{ev.title || ev.type || `步骤 ${i + 1}`}</span>
                {ev.detail && <span className="ml-2">{ev.detail}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {finding.sarif_result && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <button onClick={() => setShowSarif(!showSarif)} className="text-sm font-semibold text-theme-text-primary hover:text-brand-primary">
            SARIF 详情 {showSarif ? '(隐藏)' : '(展开)'}
          </button>
          {showSarif && <pre className="mt-2 p-3 rounded-lg bg-theme-elevated text-xs font-mono text-theme-text-secondary overflow-x-auto max-h-64">{JSON.stringify(finding.sarif_result, null, 2)}</pre>}
        </section>
      )}

      {annotations.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">标注历史</h3>
          <div className="space-y-2">
            {annotations.map((ann, i) => (
              <div key={ann.id || i} className="text-xs text-theme-text-secondary border-b border-theme-border last:border-b-0 pb-2">
                <span className="font-medium">{ann.verdict}</span> — {ann.analysis || ann.notes || ''}
                {ann.created_at && <span className="ml-2 text-theme-text-faint">{ann.created_at}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-3">添加标注</h3>
        <div className="grid gap-3">
          <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="px-3 py-2 rounded-lg border border-theme-border bg-theme-elevated text-sm text-theme-text-primary">
            <option value="">选择判定…</option>
            <option value="true_positive">真实漏洞</option>
            <option value="false_positive">误报</option>
            <option value="disputed">争议</option>
            <option value="comment">评论</option>
            <option value="needs_info">需要更多信息</option>
          </select>
          <textarea value={analysis} onChange={(e) => setAnalysis(e.target.value)} rows={3} placeholder="分析说明…" className="px-3 py-2 rounded-lg border border-theme-border bg-theme-elevated text-sm text-theme-text-primary resize-none" />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-theme-border bg-theme-elevated text-sm text-theme-text-primary">
            <option value="">不修改状态</option>
            <option value="confirmed">确认</option>
            <option value="false_positive">标记误报</option>
            <option value="disputed">标记争议</option>
          </select>
          <button
            disabled={submitting || !verdict}
            onClick={handleSubmitAnnotation}
            className="px-4 py-2 rounded-lg bg-brand-primary text-theme-text-inverse font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >提交标注</button>
        </div>
      </section>
    </div>
  );
};

interface ReportDetailProps {
  reportId: number;
  onBack: () => void;
  onNavigateFinding: (id: number) => void;
}

export const SecOctoReportDetailPage: React.FC<ReportDetailProps> = ({ reportId, onBack, onNavigateFinding }) => {
  const [report, setReport] = useState<SecOctoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSarif, setShowSarif] = useState(false);

  useEffect(() => {
    setLoading(true);
    secoctoClients.vuln
      .reportById(reportId)
      .then((r) => setReport(r))
      .catch((e: any) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (error || !report) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载失败：{error || '未找到报告'}</div>;

  const highestSev = report.highest_severity || '';
  const bannerCls = SEV_STYLE[highestSev] || '';

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={`报告 #${report.id}`}
        back={{ label: '返回漏洞列表', onClick: onBack }}
      />

      <div className={`rounded-xl border-l-4 p-4 mb-4 ${highestSev.includes('high') || highestSev.includes('critical') ? 'border-l-red-500' : highestSev.includes('medium') ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
        {highestSev && <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bannerCls}`}>{SEV_LABEL[highestSev] || highestSev}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {report.task_id && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">任务</span><div className="mt-1 text-sm font-semibold">{report.task_id}</div></div>}
        {report.finding_count != null && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">发现数</span><div className="mt-1 text-sm font-semibold">{report.finding_count}</div></div>}
        {report.agent_type && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">Agent</span><div className="mt-1 text-sm font-semibold">{report.agent_type}</div></div>}
        {report.created_at && <div className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center"><span className="text-xs text-theme-text-faint">创建时间</span><div className="mt-1 text-xs">{report.created_at}</div></div>}
      </div>

      {report.findings && report.findings.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-3">漏洞列表 ({report.findings.length})</h3>
          <div className="space-y-2">
            {report.findings.map((f) => (
              <button key={f.id} onClick={() => onNavigateFinding(f.id)} className="w-full rounded-lg border border-theme-border p-3 text-left hover:border-brand-primary/30 cursor-pointer transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-theme-text-primary">{f.title || f.rule_name || `#${f.id}`}</span>
                    {f.severity && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${SEV_STYLE[f.severity] || ''}`}>{SEV_LABEL[f.severity] || f.severity}</span>}
                  </div>
                  <ChevronRight size={14} className="text-theme-text-faint" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {report.sarif_document && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <button onClick={() => setShowSarif(!showSarif)} className="text-sm font-semibold text-theme-text-primary hover:text-brand-primary">
            SARIF 文档 {showSarif ? '(隐藏)' : '(展开)'}
          </button>
          {showSarif && <pre className="mt-2 p-3 rounded-lg bg-theme-elevated text-xs font-mono text-theme-text-secondary overflow-x-auto max-h-64">{JSON.stringify(report.sarif_document, null, 2)}</pre>}
        </section>
      )}
    </div>
  );
};
