import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, FolderOpen, Search } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoVulnFinding, SecOctoVulnStats, SecOctoAnnotation, SecOctoPagerState, SecOctoNavKey, SecOctoReport } from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import {
  annotationVerdictMeta,
  findingStatusMeta,
  flattenEvidenceChain,
} from './shared/taskMeta';
import { fmtTimeCompact } from './shared/format';
import { SecOctoTaskDetailPage } from './TaskDetailPage';
import {
  getInitialResponsivePageSize,
  useResponsivePageSize,
  type ResponsivePageSizeConfig,
} from './shared/useResponsivePageSize';

// SEV_LABEL/STATUS_LABEL 同时供 list / detail / report 三页使用。
// list 页只用 high/medium/low(对齐 secocto-ui vlSevBadge 的 4 个选项含全部),
// detail/report 仍需 critical/note 的 fallback,所以保留全集。
const SEV_LABEL: Record<string, string> = { critical: '严重', high: '高危', medium: '中危', low: '低危', note: '信息' };
const SEV_STYLE: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-700', high: 'bg-red-500/15 text-red-700',
  medium: 'bg-amber-500/15 text-amber-700', low: 'bg-blue-500/15 text-blue-700',
  note: 'bg-theme-bg-elevated text-theme-text-secondary',
};
const STATUS_LABEL: Record<string, string> = { confirmed: '已确认', pending: '待确认', false_positive: '误报', disputed: '争议' };
const STATUS_STYLE: Record<string, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-700', pending: 'bg-amber-500/15 text-amber-700',
  false_positive: 'bg-blue-500/15 text-blue-700', disputed: 'bg-purple-500/15 text-purple-700',
};

const SEARCH_DEBOUNCE_MS = 300;

// 与"总览"任务列表口径一致:每页大小 [10, 20, 50, 100],按视口宽度选默认。
//   - 笔记本 / 常规外屏:默认 10(一屏少滚)
//   - >=1920px 外接显示器:默认 20
const VULNS_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const VULNS_PAGE_SIZE_CONFIG: ResponsivePageSizeConfig = {
  breakpoints: [
    { query: '(min-width: 1920px)', size: 20 },
  ],
  fallback: 10,
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
  // 与 secocto-ui VL_FILTERS.query 一致:这是搜 rule_id(CWE)的关键字
  const [searchInput, setSearchInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>(() => ({
    page: 1,
    size: getInitialResponsivePageSize(VULNS_PAGE_SIZE_CONFIG),
  }));
  const [userPickedSize, setUserPickedSize] = useState(false);
  const responsiveSize = useResponsivePageSize(VULNS_PAGE_SIZE_CONFIG);

  // 视口跨断点自动跟随;用户手动选过 size 就锁住(与 Overview 任务列表一致)
  useEffect(() => {
    if (userPickedSize) return;
    setPager((prev) => {
      if (prev.size === responsiveSize) return prev;
      const firstItemIndex = (prev.page - 1) * prev.size;
      const nextPage = Math.floor(firstItemIndex / responsiveSize) + 1;
      return { page: Math.max(1, nextPage), size: responsiveSize };
    });
  }, [responsiveSize, userPickedSize]);

  // 输入 debounce 300ms 后真正触发请求,与 secocto-ui app.js _searchDebounceId 一致
  useEffect(() => {
    const next = searchInput.trim();
    if (next === appliedQuery) return;
    const tid = window.setTimeout(() => {
      setAppliedQuery(next);
      setPager((prev) => ({ ...prev, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(tid);
  }, [searchInput, appliedQuery]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, findingsRes] = await Promise.all([
        secoctoClients.vuln.stats().catch(() => null as SecOctoVulnStats | null),
        secoctoClients.vuln.findings({
          severity: severityFilter,
          status: statusFilter,
          rule_id: appliedQuery,
          limit: pager.size,
          offset: (pager.page - 1) * pager.size,
        }),
      ]);
      if (statsRes) setStats(statsRes);
      setItems(findingsRes.items);

      // total 4 级兜底(对齐 Overview/技能进化的策略,修"client 把裸数组 total 兜底成 items.length"导致的翻不动页):
      //   ① 无过滤 → stats.total_findings 权威源
      //   ② 仅单一严重度过滤(无 status / 无 rule_id 关键字)→ stats.by_severity[severity] 作为该子总数
      //   ③ findingsRes.total 但必须 > 当前页 length 才信(否则可能是 client 兜底的假 total = items.length)
      //   ④ 满页 → offset + size + 1(让"下一页"可点);不满页 → offset + items.length
      const offset = (pager.page - 1) * pager.size;
      const itemsLen = findingsRes.items.length;
      const hasStatus = !!statusFilter;
      const hasQuery = !!appliedQuery;
      const hasSev = !!severityFilter;
      const noFilter = !hasSev && !hasStatus && !hasQuery;
      const sevOnly = hasSev && !hasStatus && !hasQuery;

      let computed: number;
      if (noFilter && typeof statsRes?.total_findings === 'number') {
        computed = statsRes.total_findings;
      } else if (sevOnly && typeof statsRes?.by_severity?.[severityFilter] === 'number') {
        computed = statsRes.by_severity[severityFilter];
      } else if (typeof findingsRes.total === 'number' && findingsRes.total > itemsLen) {
        computed = findingsRes.total;
      } else if (itemsLen === pager.size) {
        computed = offset + pager.size + 1;
      } else {
        computed = offset + itemsLen;
      }
      setTotal(computed);
    } catch (e: any) {
      console.warn('[vulns] load failed:', e);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter, appliedQuery, pager.page, pager.size]);

  useEffect(() => { void loadData(); }, [loadData]);

  const bySeverity = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (stats?.by_severity) Object.assign(map, stats.by_severity);
    return map;
  }, [stats]);

  // 状态分布派生:优先 stats.by_status,否则从当前页 items 估算
  const byStatus = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (stats?.by_status) Object.assign(map, stats.by_status);
    return map;
  }, [stats]);

  // 头部"共 N 条"总数口径:有 stats 用 stats.total_findings(更准),否则用列表 total
  const headerTotal = typeof stats?.total_findings === 'number' ? stats.total_findings : total;

  const confirmedCount = byStatus.confirmed ?? items.filter((f) => f.status === 'confirmed').length;
  const pendingStatusCount = byStatus.pending ?? items.filter((f) => f.status === 'pending').length;

  const hasAnyFilter = !!(severityFilter || statusFilter || appliedQuery);

  // 业界 vuln list 通用做法(Snyk / GitHub Security / SonarCloud / DefectDojo):
  //   把严重度/状态计数做成"KPI + Filter 二合一"的可点击芯片,而不是占大量纵向空间的统计卡。
  //   - "漏洞总数" = reset(清空 severity / status / query)
  //   - 严重度芯片之间互斥(高/中/低 同维度,点同一个再次取消)
  //   - 状态芯片之间互斥(已确认/待确认,同上)
  //   - 严重度 + 状态可叠加(不同维度)
  const FILTER_CHIPS: ReadonlyArray<{
    key: string;
    label: string;
    /** 计数 */
    count: number;
    /** 左侧色点 */
    dotCls: string;
    /** active 时整芯片底色 */
    activeBgCls: string;
    /** 当前是否处于 active */
    active: boolean;
    /** 点击行为 */
    onClick: () => void;
  }> = [
    {
      key: 'all',
      label: '漏洞总数',
      count: headerTotal,
      dotCls: 'bg-brand-primary',
      activeBgCls: 'bg-brand-primary text-white border-brand-primary',
      active: !hasAnyFilter,
      onClick: () => {
        setSeverityFilter('');
        setStatusFilter('');
        setSearchInput('');
        setAppliedQuery('');
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
    {
      key: 'sev-high',
      label: '高危',
      count: bySeverity.high ?? 0,
      dotCls: 'bg-red-500',
      activeBgCls: 'bg-red-500/15 text-red-700 border-red-500/40',
      active: severityFilter === 'high',
      onClick: () => {
        setSeverityFilter((prev) => (prev === 'high' ? '' : 'high'));
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
    {
      key: 'sev-medium',
      label: '中危',
      count: bySeverity.medium ?? 0,
      dotCls: 'bg-amber-500',
      activeBgCls: 'bg-amber-500/15 text-amber-700 border-amber-500/40',
      active: severityFilter === 'medium',
      onClick: () => {
        setSeverityFilter((prev) => (prev === 'medium' ? '' : 'medium'));
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
    {
      key: 'sev-low',
      label: '低危',
      count: bySeverity.low ?? 0,
      dotCls: 'bg-blue-500',
      activeBgCls: 'bg-blue-500/15 text-blue-700 border-blue-500/40',
      active: severityFilter === 'low',
      onClick: () => {
        setSeverityFilter((prev) => (prev === 'low' ? '' : 'low'));
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
    {
      key: 'status-confirmed',
      label: '已确认',
      count: confirmedCount,
      dotCls: 'bg-emerald-500',
      activeBgCls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
      active: statusFilter === 'confirmed',
      onClick: () => {
        setStatusFilter((prev) => (prev === 'confirmed' ? '' : 'confirmed'));
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
    {
      key: 'status-pending',
      label: '待确认',
      count: pendingStatusCount,
      dotCls: 'bg-amber-400',
      activeBgCls: 'bg-amber-400/15 text-amber-700 border-amber-400/40',
      active: statusFilter === 'pending',
      onClick: () => {
        setStatusFilter((prev) => (prev === 'pending' ? '' : 'pending'));
        setPager((prev) => ({ ...prev, page: 1 }));
      },
    },
  ];

  const activeFilterTags: { label: string; cls: string; onClear: () => void }[] = [];
  if (severityFilter) {
    activeFilterTags.push({
      label: SEV_LABEL[severityFilter] || severityFilter,
      cls: SEV_STYLE[severityFilter] || '',
      onClear: () => { setSeverityFilter(''); setPager((prev) => ({ ...prev, page: 1 })); },
    });
  }
  if (statusFilter) {
    activeFilterTags.push({
      label: STATUS_LABEL[statusFilter] || statusFilter,
      cls: STATUS_STYLE[statusFilter] || '',
      onClear: () => { setStatusFilter(''); setPager((prev) => ({ ...prev, page: 1 })); },
    });
  }
  if (appliedQuery) {
    activeFilterTags.push({
      label: `CWE: ${appliedQuery}`,
      cls: 'bg-theme-bg-elevated text-theme-text-secondary',
      onClear: () => { setSearchInput(''); setAppliedQuery(''); setPager((prev) => ({ ...prev, page: 1 })); },
    });
  }

  return (
    <div className="px-6 lg:px-8 xl:px-10 pt-6 pb-12 animate-in fade-in duration-300">
      {/* 页头 — 与"技能进化"/"记忆进化"同款渐变标题 + 副标(搜索框已下移到表格上方) */}
      <div className="pb-5">
        <h1 className="text-2xl font-bold text-theme-text-primary mb-1">
          漏洞
          <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">管理</span>
        </h1>
        <p className="text-sm text-theme-text-secondary">
          Agent 发现的安全漏洞,支持人工审核与反馈 · 共 {headerTotal} 个漏洞
        </p>
      </div>

      {/* KPI + Filter 二合一芯片栏(左) + 搜索框(右,与"漏洞总数"对齐在同一行) */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex flex-wrap gap-2 min-w-0">
          {FILTER_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              count={chip.count}
              dotCls={chip.dotCls}
              activeBgCls={chip.activeBgCls}
              active={chip.active}
              onClick={chip.onClick}
            />
          ))}
        </div>
        <div className="relative shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索 CWE…"
            className="pl-9 pr-3 py-1.5 rounded-lg border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors"
          />
        </div>
      </div>

      {/* 表格上方 toolbar:已应用过滤 tag + 清除筛选;无过滤时整行隐藏 */}
      {hasAnyFilter && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {activeFilterTags.map((tag) => (
            <button
              key={tag.label}
              onClick={tag.onClear}
              className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80 ${tag.cls}`}
              title="移除此筛选"
            >
              <span>{tag.label}</span>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/10 leading-none">×</span>
            </button>
          ))}
          <button
            onClick={() => {
              setSeverityFilter('');
              setStatusFilter('');
              setSearchInput('');
              setAppliedQuery('');
              setPager((prev) => ({ ...prev, page: 1 }));
            }}
            className="ml-1 text-xs text-theme-text-secondary hover:text-brand-primary transition-colors"
          >
            清除筛选
          </button>
        </div>
      )}

      {/* 漏洞表(8 列,与 Overview 任务表同款容器 / hover) */}
      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-theme-bg-elevated/40">
              <tr>
                {['ID', '规则 / CWE', '摘要', '严重度', '位置', '状态', '报告', '更新时间'].map((h, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2 text-xs font-semibold text-theme-text-faint whitespace-nowrap ${
                      i === 3 || i === 5 || i === 6 ? 'text-center' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-theme-text-secondary">加载中…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-theme-text-secondary">
                  {appliedQuery || severityFilter || statusFilter ? '没有找到匹配的漏洞' : '暂无漏洞'}
                </td></tr>
              ) : items.map((f) => (
                <FindingRow key={f.id} f={f} onClick={() => onNavigateDetail(f.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SecOctoPager
        total={total}
        state={pager}
        onChange={(p) => setPager((prev) => ({ ...prev, page: p }))}
        onSizeChange={(s) => {
          setUserPickedSize(true);
          setPager({ page: 1, size: s });
        }}
        sizeOptions={VULNS_PAGE_SIZE_OPTIONS}
      />
    </div>
  );
};

/* ===================== KPI + Filter 二合一芯片 =====================
   设计参考:Snyk Vulnerability、GitHub Security、SonarCloud、DefectDojo —
   将"计数"与"过滤"合二为一,节省纵向空间,且把"看数据"和"筛数据"做成同一个动作。

   视觉:左侧色点表达类别(严重度色 / 状态色),右侧数字 badge;
        active 时整芯片底色变为该类别浅色 + 边框同色;非 active 是普通灰边框。 */

const FilterChip: React.FC<{
  label: string;
  count: number;
  dotCls: string;
  activeBgCls: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, dotCls, activeBgCls, active, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
      active
        ? `${activeBgCls} shadow-sm`
        : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:border-brand-primary/40 hover:bg-theme-bg-elevated/40'
    }`}
  >
    <span className={`w-2 h-2 rounded-full ${dotCls}`} />
    <span>{label}</span>
    <span
      className={`min-w-[1.5rem] px-1.5 py-0.5 inline-flex items-center justify-center rounded-full text-[10px] font-mono font-bold ${
        active ? 'bg-white/25' : 'bg-theme-bg-elevated text-theme-text-faint'
      }`}
    >
      {count}
    </span>
  </button>
);

/* ===================== Finding 行(表格行,样式对齐 Overview TaskRow) ===================== */

const FindingRow: React.FC<{ f: SecOctoVulnFinding; onClick: () => void }> = ({ f, onClick }) => {
  // 位置字符串:file_path:start_line[-end_line] — 与 secocto-ui app.js l.535 一致
  const path = f.file_path || '';
  const start = f.start_line ?? f.line_start;
  const end = f.end_line ?? f.line_end;
  const loc = path
    ? `${path}:${start ?? '?'}${end && end !== start ? `-${end}` : ''}`
    : (f.location || '—');
  const msg = f.message || f.title || f.description || '';
  const sevCls = SEV_STYLE[f.severity || ''] || SEV_STYLE.note;
  const sevLbl = SEV_LABEL[f.severity || ''] || (f.severity || '-');
  const statusCls = STATUS_STYLE[f.status || ''] || '';
  const statusLbl = STATUS_LABEL[f.status || ''] || (f.status || '-');
  const updatedAt = f.updated_at || f.created_at;
  return (
    <tr
      onClick={onClick}
      className="border-b border-theme-border last:border-b-0 hover:bg-brand-soft/30 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2 font-mono text-xs text-theme-text-primary whitespace-nowrap">#{f.id}</td>
      <td className="px-3 py-2 font-mono text-xs text-theme-text-secondary whitespace-nowrap">{f.rule_id || '—'}</td>
      <td className="px-3 py-2 text-theme-text-secondary max-w-xs">
        <div className="truncate" title={msg}>{msg || '—'}</div>
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {f.severity ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sevCls}`}>{sevLbl}</span>
        ) : (
          <span className="text-theme-text-faint">-</span>
        )}
      </td>
      <td className="px-3 py-2 max-w-xs">
        <div className="font-mono text-[11px] text-theme-text-faint truncate" title={loc}>{loc}</div>
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {f.status ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{statusLbl}</span>
        ) : (
          <span className="text-theme-text-faint">-</span>
        )}
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {f.report_id != null ? (
          <span className="font-mono text-xs text-brand-primary">#{f.report_id}</span>
        ) : (
          <span className="text-theme-text-faint">-</span>
        )}
      </td>
      <td className="px-3 py-2 text-theme-text-faint whitespace-nowrap text-xs">{updatedAt ? fmtTimeCompact(updatedAt) : '-'}</td>
    </tr>
  );
};

interface VulnDetailProps {
  findingId: number;
  onBack: () => void;
  onNavigateReport: (id: number) => void;
}

/* ===================== Verdict / 状态变更 select 选项 ===================== */

const VERDICT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'true_positive', label: '确认漏洞 (true_positive)' },
  { value: 'false_positive', label: '误报 (false_positive)' },
  { value: 'disputed', label: '争议 (disputed)' },
  { value: 'needs_info', label: '需补充 (needs_info)' },
  { value: 'comment', label: '评论 (comment)' },
];

const STATUS_CHANGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '不变更' },
  { value: 'confirmed', label: '已确认' },
  { value: 'false_positive', label: '误报' },
  { value: 'disputed', label: '争议' },
  { value: 'pending', label: '待确认' },
];

export const SecOctoVulnDetailPage: React.FC<VulnDetailProps> = ({ findingId, onBack, onNavigateReport }) => {
  const [finding, setFinding] = useState<SecOctoVulnFinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 添加标注表单
  const [verdict, setVerdict] = useState<string>('true_positive');
  const [analysis, setAnalysis] = useState('');
  const [cvssInput, setCvssInput] = useState('');
  const [impactInput, setImpactInput] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // SARIF JSON 展开
  const [showSarifJson, setShowSarifJson] = useState(false);

  // 顶部 toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // 基于选中文本添加评论 — 从 secocto-ui 移植
  // 两阶段交互:选区出 💬 浮动按钮 → 点击展开 popover(ref + textarea + 取消/添加)
  const detailRootRef = useRef<HTMLDivElement | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selBtnPos, setSelBtnPos] = useState<{ top: number; left: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const closeSelectionUI = useCallback(() => {
    setSelBtnPos(null);
    setPopoverPos(null);
  }, []);

  /* ---------- 数据加载 ---------- */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    secoctoClients.vuln
      .findingById(findingId)
      .then((f) => { if (active) setFinding(f); })
      .catch((e: any) => { if (active) setError(e?.message || String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [findingId]);

  /* ---------- Toast ---------- */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  /* ---------- 基于选中文本添加评论 — 选区检测 ---------- */
  // mouseup → 取选区文本 → 校验长度 ≥3 且落在 [data-commentable] 子树 → 计算 💬 按钮位置
  // 与 secocto-ui app.js 同款两步交互:选区出按钮 → 点按钮才展开 popover
  useEffect(() => {
    const root = detailRootRef.current;
    if (!root) return;

    const selectionInsideCommentable = (sel: Selection | null): boolean => {
      if (!sel || sel.rangeCount === 0) return false;
      const range = sel.getRangeAt(0);
      let node: Node | null = range.commonAncestorContainer;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const el = node as Element | null;
      return !!(el && el.closest && el.closest('[data-commentable]'));
    };

    const onMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // 在 💬 / popover / 标注表单内的 mouseup 不触发,避免和它们抢交互
      if (
        target &&
        (target.closest('[data-vl-sel-btn]') ||
          target.closest('[data-vl-comment-popover]') ||
          target.closest('[data-vl-form]'))
      ) {
        return;
      }
      // 等待浏览器把 selection 标记更新完
      window.setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (text.length < 3 || !selectionInsideCommentable(sel)) {
          closeSelectionUI();
          return;
        }
        const rect = sel!.getRangeAt(0).getBoundingClientRect();
        setSelectedText(text);
        // 💬 按钮放在选区正上方:水平居中于选区中点,垂直留 4px 间隙;
        // 视口左右各 16px 安全边距,防止贴边或越界。按钮为胶囊式 ≈ 120×32("💬 添加数据标注")。
        const BTN_W = 120;
        const BTN_H = 32;
        const GAP = 4;
        const PAD = 16;
        const midX = rect.left + rect.width / 2;
        const leftRaw = midX - BTN_W / 2;
        const left = Math.max(
          PAD,
          Math.min(leftRaw, window.innerWidth - BTN_W - PAD),
        );
        setSelBtnPos({
          // 用 viewport 坐标 + position: fixed,Chimera 的 <main> 是局部滚动容器,
          // window.scrollY 在这种结构下不可靠;fixed 直接对齐选区当前可视位置。
          top: rect.top - BTN_H - GAP,
          left,
        });
        setPopoverPos(null);
      }, 0);
    };

    root.addEventListener('mouseup', onMouseUp);
    return () => { root.removeEventListener('mouseup', onMouseUp); };
    // 关键依赖 `finding`:首次渲染时 loading=true、组件提早 return"加载中…",
    // detailRootRef.current 还是 null;数据到位后这个 effect 必须重跑才能挂上监听。
  }, [closeSelectionUI, finding]);

  // outside mousedown → 关闭 💬 / popover;Esc → 关闭 popover
  useEffect(() => {
    if (!selBtnPos && !popoverPos) return;

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-vl-sel-btn]') || t.closest('[data-vl-comment-popover]')) return;
      closeSelectionUI();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSelectionUI();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [selBtnPos, popoverPos, closeSelectionUI]);

  /* ---------- 基于选中文本添加评论 — 操作 ---------- */
  const openCommentPopover = useCallback(() => {
    if (!selBtnPos) return;
    // popover 出现位置:在 💬 下方 6px,左右居中但限制不溢出视口(左右 16px 边距)
    const popLeft = Math.max(
      16,
      Math.min(selBtnPos.left - 100, window.innerWidth - 340 - 16),
    );
    setPopoverPos({
      top: selBtnPos.top + 32 + 6, // 32 = 按钮高(胶囊)
      left: popLeft,
    });
    setSelBtnPos(null);
    setCommentDraft('');
  }, [selBtnPos]);

  const submitComment = useCallback(async () => {
    const comment = commentDraft.trim();
    if (!comment) { showToast('请输入评论'); return; }

    setCommentSubmitting(true);
    const payload: Record<string, any> = {
      annotator: 'current-user',
      verdict: 'comment',
      context_supplement: selectedText ? { ref: selectedText } : null,
      notes: comment,
    };
    try {
      const serverAnnot = await secoctoClients.vuln.createAnnotation(findingId, payload);
      const annot: SecOctoAnnotation = (serverAnnot && typeof serverAnnot === 'object') ? serverAnnot : {
        id: Date.now(),
        annotator: 'current-user',
        verdict: 'comment',
        analysis: undefined,
        context_supplement: payload.context_supplement ?? undefined,
        notes: comment,
        created_at: new Date().toISOString(),
      };
      setFinding((prev) => prev ? {
        ...prev,
        annotations: [...(prev.annotations || []), annot],
      } : prev);
      // 清选区 + 关闭 UI
      if (window.getSelection) window.getSelection()?.removeAllRanges();
      setSelectedText('');
      closeSelectionUI();
      setCommentDraft('');
      showToast('评论已添加');
    } catch (e: any) {
      console.warn('[vulns] comment annotation failed:', e);
      showToast(`评论提交失败:${e?.message || String(e)}`);
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentDraft, selectedText, findingId, showToast, closeSelectionUI]);

  /* ---------- 派生:从 annotations.context_supplement 提取 CVSS / 影响 ---------- */
  // 与 secocto-ui 一致:取第一个有 cvss_estimate / impact 的 annotation
  const derivedCvssImpact = useMemo(() => {
    let cvss = '', impact = '';
    for (const a of finding?.annotations ?? []) {
      const cs = (a.context_supplement || {}) as Record<string, any>;
      if (cs.cvss_estimate != null && !cvss) cvss = String(cs.cvss_estimate);
      if (cs.impact && !impact) impact = String(cs.impact);
      if (cvss && impact) break;
    }
    return { cvss, impact };
  }, [finding]);

  /* ---------- 派生:证据链 flatten + SARIF 三段拆解 ---------- */
  const evidenceSteps = useMemo(
    () => flattenEvidenceChain(finding?.evidence_chain),
    [finding],
  );

  const sarif = (finding?.sarif_result || {}) as Record<string, any>;
  const sarifLocations: any[] = Array.isArray(sarif.locations) ? sarif.locations : [];
  const sarifCodeFlow = useMemo(() => {
    const out: Array<{ thread: number; uri: string; line?: number; endLine?: number; msg: string }> = [];
    const codeFlows: any[] = Array.isArray(sarif.codeFlows) ? sarif.codeFlows : [];
    for (const cf of codeFlows) {
      const threadFlows: any[] = Array.isArray(cf?.threadFlows) ? cf.threadFlows : [];
      threadFlows.forEach((tf, ti) => {
        const locs: any[] = Array.isArray(tf?.locations) ? tf.locations : [];
        for (const loc of locs) {
          const physical = loc?.location?.physicalLocation || {};
          out.push({
            thread: ti + 1,
            uri: physical?.artifactLocation?.uri || '',
            line: physical?.region?.startLine,
            endLine: physical?.region?.endLine,
            msg: loc?.location?.message?.text || '',
          });
        }
      });
    }
    return out;
  }, [sarif]);

  /* ---------- 提交标注 ---------- */
  const handleSubmitAnnotation = useCallback(async () => {
    const analysisTrimmed = analysis.trim();
    if (!analysisTrimmed) { showToast('请输入分析说明'); return; }

    // CVSS 校验:0-10 一位小数
    let cvssVal: number | null = null;
    const cvssRaw = cvssInput.trim();
    if (cvssRaw !== '') {
      if (!/^\d+(\.\d)?$/.test(cvssRaw)) { showToast('CVSS 必须为 0-10 的数值(最多一位小数)'); return; }
      const n = parseFloat(cvssRaw);
      if (isNaN(n) || n < 0 || n > 10) { showToast('CVSS 必须为 0-10 的数值'); return; }
      cvssVal = Math.round(n * 10) / 10;
    }
    const impactRaw = impactInput.trim();
    if (impactRaw.length > 64) { showToast('影响长度不能超过 64 字符'); return; }

    // context_supplement 仅在至少一个字段有值时构造
    let ctx: Record<string, any> | null = null;
    if (cvssVal != null || impactRaw) {
      ctx = {};
      if (cvssVal != null) ctx.cvss_estimate = cvssVal;
      if (impactRaw) ctx.impact = impactRaw;
    }

    setSubmitting(true);
    try {
      // 状态变更优先:状态成功后再创建标注
      if (newStatus) {
        try {
          await secoctoClients.vuln.updateStatus(findingId, newStatus);
          setFinding((prev) => prev ? { ...prev, status: newStatus } : prev);
        } catch (e: any) {
          showToast('状态变更失败:' + (e?.message || String(e)));
          return;
        }
      }

      const annotPayload: Record<string, any> = {
        annotator: 'current-user',
        verdict,
        analysis: analysisTrimmed || null,
        context_supplement: ctx,
      };
      let serverAnnot: SecOctoAnnotation | null = null;
      try {
        serverAnnot = await secoctoClients.vuln.createAnnotation(findingId, annotPayload);
      } catch (e: any) {
        showToast('标注提交失败:' + (e?.message || String(e)));
        return;
      }

      // 后端返回优先;失败时本地构造兜底(与 secocto-ui 行为一致)
      const annot: SecOctoAnnotation = serverAnnot && typeof serverAnnot === 'object' ? serverAnnot : {
        id: Date.now(),
        annotator: 'current-user',
        verdict,
        analysis: analysisTrimmed || undefined,
        context_supplement: ctx ?? undefined,
        created_at: new Date().toISOString(),
      };
      setFinding((prev) => prev ? {
        ...prev,
        annotations: [...(prev.annotations || []), annot],
      } : prev);

      // 清空表单(verdict 保持当前选项)
      setAnalysis('');
      setCvssInput('');
      setImpactInput('');
      setNewStatus('');
      showToast('标注已添加');
    } finally {
      setSubmitting(false);
    }
  }, [verdict, analysis, cvssInput, impactInput, newStatus, findingId, showToast]);

  /* ---------- 渲染 ---------- */
  if (loading) return <div className="px-8 pt-10 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (error || !finding) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">加载失败</h2>
        <p className="text-sm text-theme-text-secondary mb-4">{error || '未找到漏洞'}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-theme-text-inverse">返回漏洞列表</button>
      </div>
    );
  }

  const sevMeta = finding.severity ? findingSeverityBannerMeta(finding.severity) : null;
  const stMeta = findingStatusMeta(finding.status);
  const startLine = finding.start_line ?? finding.line_start;
  const endLine = finding.end_line ?? finding.line_end;
  const locStr = `${finding.file_path || ''}:${startLine ?? '?'}${endLine && endLine !== startLine ? `-${endLine}` : ''}`;
  const annotations = finding.annotations ?? [];

  return (
    <div ref={detailRootRef} className="px-6 lg:px-8 pt-5 pb-12 animate-in fade-in duration-300 max-w-[1100px] mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-theme-text-secondary hover:text-brand-primary mb-4 transition-colors">
        <ArrowLeft size={14} />返回漏洞列表
      </button>

      {/* ===================== Banner ===================== */}
      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-4" data-commentable="1">
        {sevMeta && (
          <div className={`px-5 py-2 flex items-center gap-2 text-sm font-semibold ${sevMeta.cls}`}>
            <span>{sevMeta.label}</span>
            <span className="opacity-60">·</span>
            <span className="font-mono text-xs">{finding.rule_id || '—'}</span>
          </div>
        )}
        <div className="p-5">
          <h1 className="text-lg font-bold text-theme-text-primary mb-2">{finding.message || finding.title || finding.description || `Finding #${finding.id}`}</h1>
          <div className="flex items-center gap-2 text-xs mb-3">
            <FolderOpen size={14} className="text-theme-text-faint shrink-0" />
            <span className="font-mono text-theme-text-secondary break-all">{locStr}</span>
          </div>
          <div className="border-t border-theme-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MetaRow label="状态">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stMeta.cls}`}>{stMeta.label}</span>
            </MetaRow>
            <MetaRow label="报告">
              {finding.report_id != null ? (
                <button
                  onClick={() => onNavigateReport(finding.report_id!)}
                  className="font-mono text-xs text-brand-primary hover:underline"
                >
                  #{finding.report_id}
                </button>
              ) : (
                <span className="text-xs text-theme-text-faint">#?</span>
              )}
            </MetaRow>
            {derivedCvssImpact.cvss && (
              <MetaRow label="CVSS">
                <span className="font-mono text-xs font-semibold text-theme-text-primary">{derivedCvssImpact.cvss}</span>
              </MetaRow>
            )}
            {derivedCvssImpact.impact && (
              <MetaRow label="影响">
                <span className="text-xs text-theme-text-secondary">{derivedCvssImpact.impact}</span>
              </MetaRow>
            )}
          </div>
        </div>
      </div>

      {/* ===================== 证据链 — 扁平索引卡(对齐 secocto-ui .vl-evidence-node) ===================== */}
      <SectionCard title="证据链" count={evidenceSteps.length} countLabel="步" commentable>
        {evidenceSteps.length === 0 ? (
          <p className="text-xs text-theme-text-faint">无证据链数据</p>
        ) : (
          <div className="flex flex-col gap-2">
            {evidenceSteps.map((e, i) => {
              const eStart = e.start_line;
              const eEnd = e.end_line;
              const lineStr = eStart ? `:${eStart}${eEnd && eEnd !== eStart ? `-${eEnd}` : ''}` : '';
              const path = e.file_path || e.title || '—';
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-theme-border bg-theme-surface"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-soft text-brand-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[13px] font-semibold text-theme-text-primary break-all">
                      {path}{lineStr}
                    </div>
                    {(e.message || e.detail) && (
                      <div className="text-[13px] text-theme-text-secondary leading-relaxed mt-1 whitespace-pre-wrap">
                        {e.message || e.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ===================== SARIF Result — Rule / Locations / CodeFlow 分块(对齐 secocto-ui) ===================== */}
      <SectionCard
        title="SARIF Result"
        commentable
        actions={
          <button
            onClick={() => setShowSarifJson((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-theme-text-secondary hover:text-brand-primary px-2 py-1 rounded-md hover:bg-theme-bg-elevated/40 transition-colors"
          >
            {showSarifJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showSarifJson ? '收起 JSON' : '查看 JSON'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Rule 子块 — KV 平铺(ruleId / level / message) */}
          <SarifSubBlock title="Rule">
            <div className="flex flex-col">
              <KvRow
                k="ruleId"
                v={<span className="font-mono text-[13px] text-theme-text-primary">{sarif.ruleId || finding.rule_id || '—'}</span>}
              />
              <KvRow
                k="level"
                v={<span className="text-[13px] text-theme-text-secondary">{sarif.level || '—'}</span>}
              />
              {sarif.message?.text && (
                <KvRow
                  k="message"
                  v={<span className="text-[13px] text-theme-text-secondary whitespace-pre-wrap">{sarif.message.text}</span>}
                />
              )}
            </div>
          </SarifSubBlock>

          {/* Locations 子块 — 单行紧凑卡 */}
          {sarifLocations.length > 0 && (
            <SarifSubBlock title="Locations" count={sarifLocations.length}>
              <div className="flex flex-col gap-1.5">
                {sarifLocations.map((l: any, i: number) => {
                  const physical = l?.physicalLocation || {};
                  const uri = physical?.artifactLocation?.uri || '';
                  const r = physical?.region || {};
                  const lineStr = r.startLine ? ` L${r.startLine}${r.endLine && r.endLine !== r.startLine ? `–${r.endLine}` : ''}` : '';
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-theme-bg-elevated/40 text-[13px]"
                    >
                      <FolderOpen size={14} className="text-theme-text-faint shrink-0" />
                      <span className="font-mono text-theme-text-primary truncate flex-1" title={uri}>
                        {uri || '—'}
                      </span>
                      {lineStr && (
                        <span className="font-mono text-xs text-theme-text-faint shrink-0">{lineStr.trim()}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </SarifSubBlock>
          )}

          {/* Code Flow 子块 — 扁平索引卡 + hover */}
          {sarifCodeFlow.length > 0 && (
            <SarifSubBlock title="Code Flow" count={sarifCodeFlow.length} countLabel="步">
              <div className="flex flex-col gap-1.5">
                {sarifCodeFlow.map((s, i) => {
                  const lineStr = s.line ? `:${s.line}${s.endLine && s.endLine !== s.line ? `-${s.endLine}` : ''}` : '';
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-md bg-theme-bg-elevated/40 border border-transparent hover:border-brand-primary/25 transition-colors"
                    >
                      <div className="w-[1.375rem] h-[1.375rem] rounded-full bg-brand-soft text-brand-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs font-semibold text-theme-text-primary break-all">
                          {s.uri || '—'}{lineStr}
                        </div>
                        {s.msg && (
                          <div className="text-[13px] text-theme-text-secondary leading-relaxed mt-0.5">
                            {s.msg}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SarifSubBlock>
          )}
        </div>

        {/* 整段 JSON 折叠 */}
        {showSarifJson && (
          <pre className="mt-4 p-3 rounded-lg bg-theme-bg-elevated/60 text-xs font-mono text-theme-text-secondary overflow-x-auto max-h-72 whitespace-pre-wrap break-all">
            {JSON.stringify(finding.sarif_result || {}, null, 2)}
          </pre>
        )}
      </SectionCard>

      {/* ===================== 标注历史 ===================== */}
      <SectionCard title="数据标注历史" count={annotations.length} countLabel="条" commentable>
        {annotations.length === 0 ? (
          <p className="text-xs text-theme-text-faint">暂无标注</p>
        ) : (
          <div className="space-y-2">
            {annotations.map((a, i) => <AnnotationRow key={a.id ?? i} a={a} />)}
          </div>
        )}
      </SectionCard>

      {/* ===================== 添加标注 ===================== */}
      <SectionCard title="添加数据标注">
        <div className="grid gap-2" data-vl-form="1">
          <FormRow label="判定">
            <select
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary"
            >
              {VERDICT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </FormRow>
          <FormRow label="CVSS">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={cvssInput}
              onChange={(e) => setCvssInput(e.target.value)}
              placeholder="0.0 ~ 10.0"
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary w-32"
            />
          </FormRow>
          <FormRow label="影响">
            <input
              type="text"
              value={impactInput}
              onChange={(e) => setImpactInput(e.target.value)}
              maxLength={64}
              placeholder="影响描述(≤64 字符)"
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary flex-1 min-w-0"
            />
          </FormRow>
          <FormRow label="分析说明 / 补充上下文" labelClass="self-start mt-1.5">
            <textarea
              value={analysis}
              onChange={(e) => setAnalysis(e.target.value)}
              rows={3}
              placeholder="输入分析说明或补充上下文..."
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary flex-1 min-w-0 resize-y"
            />
          </FormRow>
          <FormRow label="状态变更">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary"
            >
              {STATUS_CHANGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </FormRow>
          <div className="flex justify-end mt-2">
            <button
              disabled={submitting}
              onClick={handleSubmitAnnotation}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? '提交中…' : '提交标注'}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ===================== 选区评论:浮动 💬 按钮 =====================
           portal 到 document.body:详情根 div 因 `animate-in fade-in` 写入了
           transform,会成为 fixed 后代的 containing block,导致 button 的
           position: fixed 实际相对详情容器而不是视口,水平产生偏移。 */}
      {selBtnPos && createPortal(
        <button
          data-vl-sel-btn="1"
          onMouseDown={(e) => e.preventDefault() /* 防止点击时清掉选区 */}
          onClick={openCommentPopover}
          aria-label="基于选中文本添加数据标注"
          title="基于选中文本添加数据标注"
          style={{ position: 'fixed', top: selBtnPos.top, left: selBtnPos.left, zIndex: 1001 }}
          className="group inline-flex items-center gap-1 h-8 pl-2 pr-2.5 rounded-full bg-brand-primary text-white text-xs font-medium shadow-lg ring-2 ring-brand-primary/25 hover:ring-brand-primary/40 hover:shadow-xl hover:-translate-y-px active:translate-y-0 active:scale-[0.97] transition-all whitespace-nowrap"
        >
          <span className="text-sm leading-none">💬</span>
          <span className="leading-none">添加数据标注</span>
        </button>,
        document.body,
      )}

      {/* ===================== 选区评论:popover(同上,portal 到 body) ===================== */}
      {popoverPos && createPortal(
        <div
          data-vl-comment-popover="1"
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 1000 }}
          className="w-[320px] rounded-xl border border-theme-border bg-theme-surface/95 backdrop-blur-md shadow-xl p-3"
        >
          <div
            className="font-mono text-[11px] text-theme-text-faint bg-theme-bg-elevated/60 rounded px-2 py-1 mb-2 truncate"
            title={selectedText}
          >
            {selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText}
          </div>
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="输入评论..."
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter 快速提交
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitComment();
              }
            }}
            className="w-full px-2 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={closeSelectionUI}
              disabled={commentSubmitting}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated disabled:opacity-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={submitComment}
              disabled={commentSubmitting}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-brand-primary text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {commentSubmitting ? '提交中…' : '添加为数据标注'}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* ===================== Toast ===================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm shadow-lg animate-in fade-in duration-200">
          {toast}
        </div>
      )}
    </div>
  );
};

/* ===================== Banner severity meta(色块横条用) ===================== */
// 与 secocto-ui sevTone+sevLbl 等价:横条整段背景+正式中英文标签
const findingSeverityBannerMeta = (sev: string): { label: string; cls: string } => {
  switch (sev) {
    case 'high':
      return { label: '高危 HIGH', cls: 'bg-red-500/20 text-red-700' };
    case 'medium':
      return { label: '中危 MEDIUM', cls: 'bg-amber-500/20 text-amber-700' };
    case 'low':
      return { label: '低危 LOW', cls: 'bg-blue-500/20 text-blue-700' };
    case 'note':
      return { label: '信息 NOTE', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
    default:
      return { label: sev.toUpperCase(), cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/* ===================== 小子组件 ===================== */

/* ===================== SARIF 子块 =====================
   对齐 secocto-ui .vl-sarif-sub-title:全大写小标题 + 左 3px brand 竖条 + 计数 chip。
   被 Rule / Locations / Code Flow 三块复用。 */
const SarifSubBlock: React.FC<{
  title: string;
  count?: number;
  countLabel?: string;
  children: React.ReactNode;
}> = ({ title, count, countLabel, children }) => (
  <div>
    <div className="flex items-center gap-1.5 mb-2 pl-1.5 border-l-[3px] border-brand-primary/55">
      <span className="text-xs font-semibold uppercase tracking-wider text-theme-text-faint">
        {title}
      </span>
      {typeof count === 'number' && (
        <span className="text-[11px] font-medium text-theme-text-faint bg-theme-bg-elevated px-1.5 rounded-full">
          {count}{countLabel ? ` ${countLabel}` : ''}
        </span>
      )}
    </div>
    {children}
  </div>
);

const SectionCard: React.FC<{
  title: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** true 时给 section 加 data-commentable,内部文本可被"基于选中文本添加评论" */
  commentable?: boolean;
}> = ({ title, count, countLabel, actions, children, commentable }) => (
  <section
    className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3"
    {...(commentable ? { 'data-commentable': '1' } : {})}
  >
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-sm font-semibold text-theme-text-primary">
        {title}
        {typeof count === 'number' && (
          <span className="ml-2 text-theme-text-faint font-normal">{count}{countLabel ? ` ${countLabel}` : ''}</span>
        )}
      </h3>
      {actions}
    </div>
    {children}
  </section>
);

const MetaRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="text-theme-text-faint w-16 shrink-0">{label}</span>
    <span className="min-w-0">{children}</span>
  </div>
);

const KvRow: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center gap-2 text-xs leading-relaxed">
    <span className="font-mono text-[10px] text-theme-text-faint w-16 shrink-0">{k}</span>
    <span className="min-w-0 break-all">{v}</span>
  </div>
);

const FormRow: React.FC<{ label: string; labelClass?: string; children: React.ReactNode }> = ({ label, labelClass = 'self-center', children }) => (
  <div className="flex items-center gap-2">
    <span className={`text-xs text-theme-text-faint w-28 shrink-0 ${labelClass}`}>{label}</span>
    {children}
  </div>
);

const AnnotationRow: React.FC<{ a: SecOctoAnnotation }> = ({ a }) => {
  const meta = annotationVerdictMeta(a.verdict);
  const cs = (a.context_supplement || {}) as Record<string, any>;
  const ref = typeof cs.ref === 'string' ? cs.ref : '';
  // 非 ref 的其他 context 字段 — 渲染为 "key=value" 串
  const ctxOther = Object.entries(cs)
    .filter(([k]) => k !== 'ref')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ');
  return (
    <div className="rounded-lg border border-theme-border bg-theme-bg-elevated/30 p-2.5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.cls}`}>{meta.label}</span>
        {(a.annotator || a.created_by) && <span className="text-[11px] text-theme-text-secondary">{a.annotator || a.created_by}</span>}
        <span className="text-[10px] text-theme-text-faint ml-auto">{fmtTimeCompact(a.created_at)}</span>
      </div>
      {a.analysis && <div className="text-xs text-theme-text-secondary whitespace-pre-wrap mb-1">{a.analysis}</div>}
      {a.notes && <div className="text-xs text-theme-text-secondary whitespace-pre-wrap mb-1">{a.notes}</div>}
      {ref && <div className="text-[10px] text-theme-text-faint italic border-l-2 border-theme-border pl-2 mb-1">「{ref}」</div>}
      {ctxOther && <div className="text-[10px] text-theme-text-faint font-mono">{ctxOther}</div>}
    </div>
  );
};

interface ReportDetailProps {
  reportId: number;
  onBack: () => void;
  /** 兼容老 viewRegistry 调用,这里不再消费 */
  onNavigateFinding?: (id: number) => void;
}

/**
 * 报告详情入口 — 业务上的行为是"直接进入对应任务详情":
 *   ① 调 /api/secocto/v1/vulns/reports/{report_id} 拿 report
 *   ② 从 report.task_id 取出关联任务 ID
 *   ③ 直接渲染 <SecOctoTaskDetailPage taskId={task_id} />
 * 这样从漏洞详情点报告 ID → 报告详情 → 任务详情的链路被压缩为单步跳转。
 * 报告无 task_id 时落到错误兜底页;onBack 走上一页(漏洞详情或漏洞列表)。
 */
export const SecOctoReportDetailPage: React.FC<ReportDetailProps> = ({ reportId, onBack }) => {
  const [report, setReport] = useState<SecOctoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    secoctoClients.vuln
      .reportById(reportId)
      .then((r) => { if (active) setReport(r); })
      .catch((e: any) => { if (active) setError(e?.message || String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  if (loading) {
    return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载报告中…</div>;
  }
  if (error || !report) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">报告加载失败</h2>
        <p className="text-sm text-theme-text-secondary mb-4">{error || `未找到报告 #${reportId}`}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-white">返回</button>
      </div>
    );
  }
  if (!report.task_id) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">该报告未关联任务</h2>
        <p className="text-sm text-theme-text-secondary mb-4">报告 #{report.id} 缺少 task_id 字段,无法跳转到任务详情。</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-white">返回</button>
      </div>
    );
  }

  return <SecOctoTaskDetailPage taskId={report.task_id} onBack={onBack} />;
};
