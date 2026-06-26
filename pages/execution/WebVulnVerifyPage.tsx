import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, Search, X } from 'lucide-react';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const WEB_E2E_API_BASE = `${API_BASE}/api/app/web-e2e`;

interface WebVuln {
  id: number;
  chimera_vuln_id?: string;
  rule_id?: string;
  rule_name?: string;
  ai_analysis_status?: string;
  ai_verification_status?: string;
  created_time?: string;
  updated_time?: string;
}

interface WebVulnListResponse {
  items: WebVuln[];
  total: number;
  page: number;
  page_size: number;
}

interface WebVulnStats {
  total: number;
  vulnerable: number;
  not_vulnerable: number;
  pending: number;
  exploitable: number;
  not_exploitable: number;
  failed_analysis: number;
  failed_verification: number;
}

const fmtTime = (value?: string | null): string => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : value;
};

const requestGaia = async (url: string, init?: RequestInit): Promise<any> => {
  const raw = await handleResponse(await fetch(url, { ...init, headers: { ...getHeaders(), ...(init?.headers || {}) } }));
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    if (raw.success === false) throw new Error(raw.message || 'gaiasec API 请求失败');
    return raw.data;
  }
  return raw;
};

const extractArray = (raw: any, keys: string[]): any[] => {
  if (Array.isArray(raw)) return raw;
  for (const key of keys) {
    const value = raw?.[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.items)) return raw.data.items;
  if (Array.isArray(raw?.data?.records)) return raw.data.records;
  if (Array.isArray(raw?.result?.items)) return raw.result.items;
  return [];
};

const fetchWebVulns = async (projectId: string, page: number, pageSize: number, search?: string): Promise<WebVulnListResponse> => {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (search && search.trim()) {
    query.set('search_text', search.trim());
  }
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/vulnerabilities/projects/${encodeURIComponent(projectId)}?${query.toString()}`);
  const items = extractArray(raw, ['items', 'vulnerabilities', 'records', 'data']);
  const total = Number(raw?.total || raw?.data?.total || items.length || 0);
  return {
    items: items.map((item: any) => ({
      id: item?.id,
      chimera_vuln_id: item?.chimera_vuln_id || item?.chimeraVulnId,
      rule_id: item?.rule_id || item?.ruleId,
      rule_name: item?.rule_name || item?.ruleName,
      ai_analysis_status: item?.ai_analysis_status || item?.aiAnalysisStatus,
      ai_verification_status: item?.ai_verification_status || item?.aiVerificationStatus,
      created_time: item?.created_time || item?.createdTime,
      updated_time: item?.updated_time || item?.updatedTime,
    })),
    total,
    page: Number(raw?.page || raw?.data?.page || page),
    page_size: Number(raw?.page_size || raw?.data?.pageSize || pageSize),
  };
};

const emptyStats = (): WebVulnStats => ({
  total: 0,
  vulnerable: 0,
  not_vulnerable: 0,
  pending: 0,
  exploitable: 0,
  not_exploitable: 0,
  failed_analysis: 0,
  failed_verification: 0,
});

const fetchWebVulnStats = async (projectId: string, search?: string): Promise<WebVulnStats> => {
  const query = new URLSearchParams();
  if (search && search.trim()) {
    query.set('search_text', search.trim());
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const raw = await requestGaia(`${WEB_E2E_API_BASE}/vulnerabilities/projects/${encodeURIComponent(projectId)}/stats${suffix}`);
  return {
    total: Number(raw?.total || 0),
    vulnerable: Number(raw?.vulnerable || 0),
    not_vulnerable: Number(raw?.not_vulnerable || raw?.notVulnerable || 0),
    pending: Number(raw?.pending || 0),
    exploitable: Number(raw?.exploitable || 0),
    not_exploitable: Number(raw?.not_exploitable || raw?.notExploitable || 0),
    failed_analysis: Number(raw?.failed_analysis || raw?.failedAnalysis || 0),
    failed_verification: Number(raw?.failed_verification || raw?.failedVerification || 0),
  };
};

const AI_ANALYSIS_STATUS_LABEL: Record<string, string> = {
  PENDING: '待分析',
  RUNNING: '分析中',
  VULNERABLE: '有漏洞',
  NOT_VULNERABLE: '非漏洞',
  FAILED: '失败',
};

const AI_VERIFICATION_STATUS_LABEL: Record<string, string> = {
  PENDING: '待验证',
  RUNNING: '验证中',
  EXTERNAL_REQUEST_EXPLOITABLE: '外部发包',
  INTERNAL_REQUEST_EXPLOITABLE: '内部发包',
  UNIT_TEST_EXPLOITABLE: '单元测试',
  NOT_EXPLOITABLE: '无利用',
  FAILED: '失败',
};

const getStatusBadge = (status?: string, labelMap?: Record<string, string>): { label: string; cls: string } => {
  const key = (status || '').toUpperCase();
  const label = labelMap?.[key] || status || '-';
  if (['VULNERABLE', 'EXTERNAL_REQUEST_EXPLOITABLE', 'INTERNAL_REQUEST_EXPLOITABLE', 'UNIT_TEST_EXPLOITABLE'].includes(key)) {
    return { label, cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' };
  }
  if (['NOT_VULNERABLE', 'NOT_EXPLOITABLE'].includes(key)) {
    return { label, cls: 'bg-sky-500/15 text-sky-400 border-sky-500/20' };
  }
  if (['RUNNING'].includes(key)) {
    return { label, cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
  }
  if (['FAILED'].includes(key)) {
    return { label, cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' };
  }
  return { label, cls: 'bg-theme-elevated text-theme-text-secondary border-theme-border' };
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

export const WebVulnVerifyPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { feedbackNodes } = useUiFeedback();

  const [vulns, setVulns] = useState<WebVuln[]>([]);
  const [stats, setStats] = useState<WebVulnStats>(emptyStats);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, offset + vulns.length);

  const loadVulns = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const searchText = search.trim() || undefined;
      const [response, statsResponse] = await Promise.all([
        fetchWebVulns(projectId, page, perPage, searchText),
        fetchWebVulnStats(projectId, searchText),
      ]);
      setVulns(response.items || []);
      setTotal(Number(response.total || 0));
      setStats(statsResponse);
      setMessage(null);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, search, page, perPage]);

  useEffect(() => {
    void loadVulns();
  }, [loadVulns]);

  return (
    <div className="min-h-full bg-theme-bg-app text-theme-text-primary">
      <div className="w-full space-y-8 px-4 lg:px-6 xl:px-8">
        {feedbackNodes}
        <PageHeader
          title="WEB漏洞验证"
          description="展示WEB漏洞的AI分析和验证状态，数据来源于 gaiasec-server。"
          actions={
            <button
              type="button"
              onClick={() => void loadVulns()}
              className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3.5 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
          }
        />

        {message ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {message}
          </div>
        ) : null}

        <section>
          <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
            <SummaryCard label="漏洞总数" value={stats.total} accent="slate" Icon={AlertTriangle} hint="所有WEB漏洞数量" />
            <SummaryCard label="确认漏洞" value={stats.vulnerable} accent="rose" Icon={AlertTriangle} hint="AI分析确认存在漏洞" />
            <SummaryCard label="排除漏洞" value={stats.not_vulnerable} accent="sky" Icon={CheckCircle2} hint="AI分析排除漏洞风险" />
            <SummaryCard label="待分析" value={stats.pending} accent="amber" Icon={CircleHelp} hint="等待AI分析或未分析" />
            <SummaryCard label="可利用" value={stats.exploitable} accent="rose" Icon={AlertTriangle} hint="AI验证确认可利用" />
            <SummaryCard label="无利用" value={stats.not_exploitable} accent="sky" Icon={CheckCircle2} hint="AI验证无利用价值" />
          </div>
        </section>

        <section>
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[260px] flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索漏洞ID或标题"
                  className="form-input h-10 w-full py-2 pl-9 pr-9 text-sm text-theme-text-primary"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary"
                    aria-label="清空搜索"
                    title="清空搜索"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden bg-theme-surface">
              <div className="hidden border-b border-theme-border bg-theme-elevated/80 px-4 py-3 text-xs font-medium text-theme-text-muted lg:grid lg:grid-cols-[minmax(180px,1.5fr)_minmax(240px,2fr)_120px_120px] lg:gap-4">
                <div>chimera_vuln_id</div>
                <div>title</div>
                <div className="text-center">AI分析状态</div>
                <div className="text-center">AI验证状态</div>
              </div>
              <div className="divide-y divide-theme-border">
                {vulns.map((vuln) => {
                  const analysisBadge = getStatusBadge(vuln.ai_analysis_status, AI_ANALYSIS_STATUS_LABEL);
                  const verificationBadge = getStatusBadge(vuln.ai_verification_status, AI_VERIFICATION_STATUS_LABEL);
                  return (
                    <div
                      key={vuln.id}
                      className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-theme-elevated lg:grid-cols-[minmax(180px,1.5fr)_minmax(240px,2fr)_120px_120px] lg:items-center lg:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-normal text-theme-text-primary" title={vuln.chimera_vuln_id || String(vuln.id)}>
                          {vuln.chimera_vuln_id || vuln.id}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-normal text-theme-text-secondary" title={vuln.rule_name || vuln.rule_id || '-'}>
                          {vuln.rule_name || vuln.rule_id || '-'}
                        </div>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-normal ${analysisBadge.cls}`}>
                          {analysisBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-normal ${verificationBadge.cls}`}>
                          {verificationBadge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!vulns.length && !loading ? (
                  <div className="py-10 text-center text-sm text-theme-text-muted">暂无漏洞数据</div>
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
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
