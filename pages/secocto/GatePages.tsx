import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bug, ChevronDown, ChevronUp, Dna, GitFork, ListChecks, Rocket, Search } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoSkill, SecOctoSkillHealth, SecOctoProposal, SecOctoDecision, SecOctoDecisionTimeline, SecOctoVulnFinding, SecOctoPagerState, SecOctoNavKey } from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import { Breadcrumb } from './shared/Breadcrumb';
import { Modal } from './shared/Modal';
import { decisionModeMeta, decisionStatusMeta, riskLevelMeta } from './shared/taskMeta';
import { fmtTimeAgo } from './shared/format';
import { DiffView } from './shared/DiffView';
import {
  getInitialResponsivePageSize,
  useResponsivePageSize,
  type ResponsivePageSizeConfig,
} from './shared/useResponsivePageSize';

// 技能进化页:
//   - 网格断点:笔记本(1024~1919)定为"小屏 = 3 列",仅外接显示器 / 大屏(>=1920)走 4 列
//     之前 lg(1024) 就跳 4 列,导致 1366/1536/1920 的笔记本看着挤;现在把 4 列阈值抬到 1920。
//   - 默认 pageSize 跟网格断点对齐:小屏 12(3 列 × 4 行)、大屏 16(4 列 × 4 行)
//     这样首屏看起来都是整齐的矩形,不会出现尾行只剩 1 张卡的尴尬。
const BROWSE_PAGE_SIZE_OPTIONS = [12, 16, 24, 48];
const BROWSE_PAGE_SIZE_CONFIG: ResponsivePageSizeConfig = {
  breakpoints: [
    // 与下方 grid 的 min-[1920px]:grid-cols-4 完全同断点
    { query: '(min-width: 1920px)', size: 16 },
  ],
  fallback: 12,
};

interface SkillsProps {
  onNavigateSkill: (fullName: string) => void;
  onNavigate: (navKey: SecOctoNavKey) => void;
}

export const SecOctoSkillsPage: React.FC<SkillsProps> = ({ onNavigateSkill, onNavigate }) => {
  const [items, setItems] = useState<SecOctoSkill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [healthTotal, setHealthTotal] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>(() => ({
    page: 1,
    size: getInitialResponsivePageSize(BROWSE_PAGE_SIZE_CONFIG),
  }));
  const [userPickedSize, setUserPickedSize] = useState(false);
  const responsiveSize = useResponsivePageSize(BROWSE_PAGE_SIZE_CONFIG);

  // 视口断点跨越时自动调整 pageSize;用户从下拉手动选过就不再覆盖。
  // 切换 size 时按"原首条仍可见"重算 page,避免每次缩放都跳回第 1 页。
  useEffect(() => {
    if (userPickedSize) return;
    setPager((prev) => {
      if (prev.size === responsiveSize) return prev;
      const firstItemIndex = (prev.page - 1) * prev.size;
      const nextPage = Math.floor(firstItemIndex / responsiveSize) + 1;
      return { page: Math.max(1, nextPage), size: responsiveSize };
    });
  }, [responsiveSize, userPickedSize]);
  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [skillRes, healthRes] = await Promise.all([
        secoctoClients.skills.list({ limit: pager.size, offset: (pager.page - 1) * pager.size }),
        secoctoClients.skills.healthz().catch(() => null as SecOctoSkillHealth | null),
      ]);
      setItems(skillRes.items);
      // total 兜底(对齐 OverviewPages 的策略,修分页"下一页失效"的老毛病):
      //   ① healthz.indexed_skills 权威源
      //   ② skillRes.total 但仅在 > 当前页 length 时采纳(否则可能是 client 把裸数组兜底成 items.length 的假 total)
      //   ③ 满页 → offset + size + 1(让"下一页"可点)
      //   ④ 不满页 → offset + items.length(已知是尾页)
      const offset = (pager.page - 1) * pager.size;
      const items = skillRes.items;
      const authoritative = healthRes?.indexed_skills;
      let computedTotal: number;
      if (typeof authoritative === 'number') {
        computedTotal = authoritative;
      } else if (typeof skillRes.total === 'number' && skillRes.total > items.length) {
        computedTotal = skillRes.total;
      } else if (items.length === pager.size) {
        computedTotal = offset + pager.size + 1;
      } else {
        computedTotal = offset + items.length;
      }
      setTotal(computedTotal);
      setHealthTotal(typeof authoritative === 'number' ? authoritative : null);
    } catch (e: any) {
      console.warn('[browse] load failed:', e);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pager.page, pager.size]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  // 与 secocto-ui 一致:搜索仅在"当前页"内做客户端过滤,不改变分页语义。
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.namespace || '').toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <div className="px-6 lg:px-8 xl:px-10 pt-6 pb-12 animate-in fade-in duration-300">
      {/* 与 secocto-ui 对齐的页头:渐变标题 "进化技能库" + 副标"共 N 个技能" + 搜索框 */}
      <div className="flex items-end justify-between gap-3 flex-wrap pb-5">
        <div>
          <h1 className="text-2xl font-bold text-theme-text-primary mb-1">
            进化
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">技能库</span>
          </h1>
          <p className="text-sm text-theme-text-secondary">
            Agent 进化过程中沉淀的安全技能 · 共 {healthTotal ?? total} 个技能
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索当前页…"
            className="pl-9 pr-3 py-1.5 rounded-lg border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-theme-text-secondary">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-theme-text-secondary">{search ? '没有找到匹配的技能' : '暂无技能'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 min-[1920px]:grid-cols-4 gap-3 lg:gap-4 mb-4 items-stretch">
          {filtered.map((s) => (
            <SkillCard key={s.full_name} skill={s} onClick={() => onNavigateSkill(s.full_name)} />
          ))}
        </div>
      )}

      <SecOctoPager
        total={total}
        state={pager}
        onChange={(p) => { setPager((prev) => ({ ...prev, page: p })); setSearch(''); }}
        onSizeChange={(sz) => {
          setUserPickedSize(true);
          setPager({ page: 1, size: sz });
          setSearch('');
        }}
        sizeOptions={BROWSE_PAGE_SIZE_OPTIONS}
      />
    </div>
  );
};

/* ===================== Skill Card ===================== */

const SkillCard: React.FC<{ skill: SecOctoSkill; onClick: () => void }> = ({ skill, onClick }) => {
  const risk = skill.risk_level ? riskLevelMeta(skill.risk_level) : null;
  const tags = (skill.tags || []).slice(0, 4);
  const pending = skill.pending_proposal_count ?? 0;
  const desc = skill.description || skill.short_desc || '';

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-theme-border bg-theme-surface p-4 lg:p-5 xl:p-6 hover:border-brand-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col min-h-[170px] lg:min-h-[200px] xl:min-h-[220px] w-full h-full"
    >
      {/* Header: 🧬 icon + name + version + namespace */}
      <div className="flex items-start gap-3 lg:gap-4 mb-2 lg:mb-3">
        <div className="w-9 h-9 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-lg bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
          <Dna size={18} className="lg:hidden" />
          <Dna size={22} className="hidden lg:block xl:hidden" />
          <Dna size={24} className="hidden xl:block" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="font-semibold text-theme-text-primary text-sm lg:text-base xl:text-lg truncate" title={skill.name || skill.full_name}>
              {skill.name || skill.slug || skill.full_name}
            </span>
            {skill.latest_version && (
              <span className="px-1.5 py-0.5 rounded text-[10px] lg:text-xs font-mono bg-theme-bg-elevated text-theme-text-secondary whitespace-nowrap">
                {skill.latest_version}
              </span>
            )}
          </div>
          {skill.namespace && (
            <div className="text-xs lg:text-sm text-theme-text-faint truncate" title={skill.namespace}>
              {skill.namespace}
            </div>
          )}
        </div>
      </div>

      {/* Description: 2 行截断 */}
      <p className="text-xs lg:text-sm text-theme-text-secondary line-clamp-2 lg:line-clamp-3 mb-2 lg:mb-3 flex-1">{desc}</p>

      {/* Footer: tags chips + pending proposals 状态 */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-wrap gap-1 lg:gap-1.5 min-w-0">
          {tags.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] lg:text-xs bg-brand-soft text-brand-primary whitespace-nowrap">
              #{t}
            </span>
          ))}
          {risk && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] lg:text-xs font-medium ${risk.cls}`}>
              {risk.label}
            </span>
          )}
        </div>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] lg:text-xs whitespace-nowrap shrink-0 ${
            pending > 0 ? 'bg-amber-500/15 text-amber-700' : 'bg-theme-bg-elevated text-theme-text-faint'
          }`}
        >
          {pending > 0 ? `${pending} pending` : 'no proposals'}
        </span>
      </div>
    </button>
  );
};

interface SkillDetailProps {
  fullName: string;
  onNavigateEvolve: (fullName: string) => void;
  /**
   * 决策行点击触发 — 由 viewRegistry 把 fullName(+ 可选 proposalIds)encode 后
   * 拼成 view string,避免 URL 把 `/` 切段;支持两种调用形态:
   *   1) onNavigateDecision('demo/07-ssrf')                — 无 proposalIds
   *   2) onNavigateDecision({fullName, proposalIds: [24]}) — 带 ?proposals=24
   */
  onNavigateDecision?: (args: string | { fullName: string; proposalIds?: number[] }) => void;
  onBack: () => void;
}

export const SecOctoSkillDetailPage: React.FC<SkillDetailProps> = ({ fullName, onNavigateEvolve, onNavigateDecision, onBack }) => {
  const [skill, setSkill] = useState<SecOctoSkill | null>(null);
  // null = 加载中(对齐 secocto-ui pendingTitle 不显示数字);[] = 加载失败或空
  const [proposals, setProposals] = useState<SecOctoProposal[] | null>(null);
  const [decisions, setDecisions] = useState<SecOctoDecision[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      // skills 列表里找当前 skill。后端不支持单 skill 直查,用 limit=200 兜底
      // 与 secocto-ui _ensureSkillByName 思路一致(但 secocto-ui 还会带 namespace 二次拉)
      secoctoClients.skills.list({ limit: 200, offset: 0 }).then((res) => {
        if (!active) return;
        const found = res.items.find((s) => s.full_name === fullName);
        if (found) setSkill(found);
      }).catch(() => { /* skill 找不到时下方会显示未找到 */ }),
      secoctoClients.skills.proposals(fullName)
        .then((ps) => { if (active) setProposals(ps); })
        .catch(() => { if (active) setProposals([]); }),
      secoctoClients.skills.decisions(fullName)
        .then((ds) => { if (active) setDecisions(ds); })
        .catch(() => { if (active) setDecisions([]); }),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fullName]);

  // 仅过滤 pending 提案(与 secocto-ui renderProposalsBlock 一致)
  const pendingProposals = useMemo(
    () => (proposals ?? []).filter((p) => p.status === 'pending'),
    [proposals],
  );
  const pendingCount = pendingProposals.length;
  // proposals 还在加载时按钮禁用,加载完且 pending=0 也禁用
  const evolveBtnDisabled = proposals === null || pendingCount === 0;
  const pendingTitle = proposals === null ? '待处理提案' : `待处理提案 (${pendingCount})`;

  if (loading && !skill) {
    return <div className="px-8 pt-10 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  }
  if (!skill) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">未找到技能</h2>
        <p className="text-sm text-theme-text-secondary mb-4">{fullName}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-theme-text-inverse">返回技能列表</button>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-8 pt-5 pb-12 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      <Breadcrumb
        items={[
          { label: '技能进化', onClick: onBack },
          { label: skill.name || skill.full_name },
        ]}
      />

      {/* ===================== Banner ===================== */}
      <div className="rounded-xl border border-theme-border bg-theme-surface p-5 mb-4">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
            <Dna size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-theme-text-primary truncate" title={skill.name || skill.full_name}>
                {skill.name || skill.full_name}
              </h1>
              {skill.latest_version && (
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-theme-bg-elevated text-theme-text-secondary whitespace-nowrap">
                  {skill.latest_version}
                </span>
              )}
              {skill.risk_level && (() => {
                const r = riskLevelMeta(skill.risk_level);
                return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.cls}`}>{r.label}</span>;
              })()}
            </div>
            {skill.namespace && (
              <div className="text-xs text-theme-text-faint font-mono">{skill.namespace}</div>
            )}
          </div>
        </div>

        {(skill.description || skill.short_desc) && (
          <p className="text-sm text-theme-text-secondary mb-3">{skill.description || skill.short_desc}</p>
        )}

        {/* 全部 tags chip */}
        {skill.tags && skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {skill.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-soft text-brand-primary whitespace-nowrap">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* taxonomy: Role / Stage / Product / Attack */}
        <TaxonomyRow taxonomy={skill.taxonomy} />

        {/* fork 信息 */}
        {skill.forked_from_skill && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-theme-bg-elevated text-xs text-theme-text-secondary">
            <GitFork size={12} className="text-theme-text-faint" />
            <span>Fork from</span>
            <span className="font-mono font-semibold text-theme-text-primary">{skill.forked_from_skill}</span>
            {skill.forked_from_version && (
              <>
                <span>@</span>
                <span className="font-mono">{skill.forked_from_version}</span>
              </>
            )}
          </div>
        )}

        {skill.author && (
          <div className="mt-2 text-xs text-theme-text-faint">by {skill.author}</div>
        )}
      </div>

      {/* ===================== 待处理提案 ===================== */}
      <div className="flex items-center justify-between gap-3 mb-2 mt-5">
        <h2 className="text-base font-semibold text-theme-text-primary">{pendingTitle}</h2>
        <button
          disabled={evolveBtnDisabled}
          onClick={() => onNavigateEvolve(fullName)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Dna size={14} />
          发起进化合并
        </button>
      </div>

      <PendingProposalsTable proposals={proposals} pending={pendingProposals} />

      {/* ===================== 决策列表 ===================== */}
      <h2 className="text-base font-semibold text-theme-text-primary mb-2 mt-6">决策列表</h2>
      <DecisionsTable decisions={decisions} onNavigateDecision={onNavigateDecision} />
    </div>
  );
};

/* ===================== Banner: Taxonomy 行 ===================== */

const TAX_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'role', label: 'Role' },
  { key: 'workflow_stage', label: 'Stage' },
  { key: 'product', label: 'Product' },
  { key: 'attack_pattern', label: 'Attack' },
];

const TaxonomyRow: React.FC<{ taxonomy?: Record<string, string | string[]> }> = ({ taxonomy }) => {
  if (!taxonomy) return null;
  const items = TAX_LABELS.filter(({ key }) => taxonomy[key] != null && taxonomy[key] !== '');
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ key, label }) => {
        const v = taxonomy[key];
        const text = Array.isArray(v) ? v.join(', ') : v;
        return (
          <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-theme-bg-elevated">
            <span className="text-theme-text-faint font-semibold">{label}</span>
            <span className="text-theme-text-secondary">{text}</span>
          </span>
        );
      })}
    </div>
  );
};

/* ===================== 待处理提案表 ===================== */

const PendingProposalsTable: React.FC<{
  proposals: SecOctoProposal[] | null;
  pending: SecOctoProposal[];
}> = ({ proposals, pending }) => {
  if (proposals === null) {
    return <div className="rounded-xl border border-theme-border bg-theme-surface p-6 text-center text-sm text-theme-text-secondary">加载提案中…</div>;
  }
  if (pending.length === 0) {
    return <div className="rounded-xl border border-theme-border bg-theme-surface p-6 text-center text-sm text-theme-text-faint">暂无待处理提案</div>;
  }
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-theme-bg-elevated/40">
            <tr>
              {['ID', '分支', '版本', '提交者', '摘要', '时间'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id} className="border-t border-theme-border hover:bg-theme-bg-elevated/30 transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-theme-text-primary whitespace-nowrap">#{p.id}</td>
                <td className="px-3 py-2 font-mono text-xs text-theme-text-secondary">
                  {p.branch ? <code className="px-1 py-0.5 rounded bg-theme-bg-elevated">{p.branch}</code> : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-theme-text-secondary whitespace-nowrap">
                  {(p.base_version || '—')} → {(p.proposed_version || '—')}
                </td>
                <td className="px-3 py-2 text-xs text-theme-text-secondary">{p.created_by || '—'}</td>
                <td className="px-3 py-2 text-xs text-theme-text-secondary max-w-xs">
                  <div className="truncate" title={p.summary || ''}>{p.summary || '—'}</div>
                </td>
                <td className="px-3 py-2 text-xs text-theme-text-faint whitespace-nowrap">{fmtTimeAgo(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ===================== 决策列表表 ===================== */

const DecisionsTable: React.FC<{
  decisions: SecOctoDecision[] | null;
  onNavigateDecision?: (args: string | { fullName: string; proposalIds?: number[] }) => void;
}> = ({ decisions, onNavigateDecision }) => {
  if (decisions === null) {
    return <div className="rounded-xl border border-theme-border bg-theme-surface p-6 text-center text-sm text-theme-text-secondary">加载决策列表中…</div>;
  }
  if (decisions.length === 0) {
    return <div className="rounded-xl border border-theme-border bg-theme-surface p-6 text-center text-sm text-theme-text-faint">暂无决策</div>;
  }
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-theme-bg-elevated/40">
            <tr>
              {['ID', '合并模式', '提交者', '状态', '提交时间', '完成时间'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => {
              const mode = decisionModeMeta(d.mode);
              const st = decisionStatusMeta(d.status);
              // 决策行点击 → result 子页;把 d.proposal_ids 一起传给 viewRegistry,
              // 由它拼成 view string secocto-result-{encode(fullName?proposals=24,25)}
              const fn = d.full_name || '';
              const clickable = !!fn && !!onNavigateDecision;
              return (
                <tr
                  key={d.id}
                  onClick={() => {
                    if (!clickable) return;
                    const proposalIds = Array.isArray(d.proposal_ids) ? d.proposal_ids : undefined;
                    onNavigateDecision!({ fullName: fn, proposalIds });
                  }}
                  className={`border-t border-theme-border transition-colors ${clickable ? 'cursor-pointer hover:bg-theme-bg-elevated/30' : ''}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-theme-text-primary whitespace-nowrap">#{d.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${mode.cls}`}>{mode.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-theme-text-secondary">{d.triggered_by || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-theme-text-faint whitespace-nowrap">{fmtTimeAgo(d.triggered_at || d.created_at)}</td>
                  <td className="px-3 py-2 text-xs text-theme-text-faint whitespace-nowrap">{d.finished_at != null ? fmtTimeAgo(d.finished_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ===================== Evolve(进化合并)子页 ===================== */

type EvolveMode = 'manual-pick' | 'llm-merge' | 'llm-merge-eval';

const EVOLVE_MODES: ReadonlyArray<{ value: EvolveMode; label: string; desc: string }> = [
  { value: 'manual-pick', label: 'manual-pick', desc: '人工选择单个 PR 作为 winner' },
  { value: 'llm-merge', label: 'llm-merge', desc: 'LLM 合成所有 PR,直接合并' },
  { value: 'llm-merge-eval', label: 'llm-merge-eval', desc: 'LLM 合成 + 自动评测门控' },
];

interface EvalTaskSelection {
  id: string;
  name: string;
  weight: number;
}

interface VulnSelection {
  id: number;
  label: string;
}

interface EvolveProps {
  fullName: string;
  onBack: () => void;
  /** 保留 prop 兼容;secocto-ui 对齐后提交成功不跳转,这里不主动调用 */
  onNavigateResult?: (fullName: string, proposalIds: number[]) => void;
}

export const SecOctoEvolvePage: React.FC<EvolveProps> = ({ fullName, onBack }) => {
  const [skill, setSkill] = useState<SecOctoSkill | null>(null);
  const [proposals, setProposals] = useState<SecOctoProposal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // 默认 llm-merge(对齐 secocto-ui radio checked)
  const [mode, setMode] = useState<EvolveMode>('llm-merge');
  const [winnerId, setWinnerId] = useState<number | null>(null);
  // 提案 card 展开状态:proposalId → 是否展开
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 评测配置:任务 / 关联漏洞 selections + 各自 modal 打开状态
  const [selectedTasks, setSelectedTasks] = useState<EvalTaskSelection[]>([]);
  const [selectedVulns, setSelectedVulns] = useState<VulnSelection[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [vulnModalOpen, setVulnModalOpen] = useState(false);

  // 顶部 toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  /* ---------- 初次加载:skill + proposals ---------- */
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      secoctoClients.skills.list({ limit: 200, offset: 0 }).then((res) => {
        if (!active) return;
        const found = res.items.find((s) => s.full_name === fullName);
        if (found) setSkill(found);
      }).catch(() => { /* skill 找不到下方有兜底 */ }),
      secoctoClients.skills.proposals(fullName)
        .then((ps) => { if (active) setProposals(ps); })
        .catch(() => { if (active) setProposals([]); }),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fullName]);

  /* ---------- Toast 自动消失 ---------- */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  /* ---------- 派生 ---------- */
  const pendingProposals = useMemo(
    () => (proposals ?? []).filter((p) => p.status === 'pending'),
    [proposals],
  );
  const pendingCount = pendingProposals.length;

  /* ---------- 提案展开 + 拉 diff ---------- */
  const toggleExpand = useCallback(async (p: SecOctoProposal) => {
    const next = new Set(expanded);
    if (next.has(p.id)) {
      next.delete(p.id);
      setExpanded(next);
      return;
    }
    next.add(p.id);
    setExpanded(next);

    if (p.diff != null) return; // 已缓存
    const fn = p.full_name || fullName;
    if (!fn || p.pr_number == null) {
      // 缺 PR 信息,占位 — UI 在渲染时处理
      return;
    }
    try {
      const text = await secoctoClients.gitea.fetchDiff(fn, p.pr_number);
      // 写回 proposals 状态,触发重渲(直接 mutate p.diff 也行,但走 setState 更"React way")
      setProposals((prev) => (prev ?? []).map((x) => x.id === p.id ? { ...x, diff: text } : x));
    } catch (e: any) {
      console.warn('[evolve] fetch diff failed:', e);
      setProposals((prev) => (prev ?? []).map((x) => x.id === p.id ? { ...x, diff: `加载文件变动失败:${e?.message || String(e)}` } : x));
    }
  }, [expanded, fullName]);

  /* ---------- 提交进化请求 ---------- */
  const handleSubmit = useCallback(async () => {
    if (pendingCount === 0) { showToast('没有可参与合并的提案'); return; }

    let proposalIds: number[];
    if (mode === 'manual-pick') {
      if (winnerId == null) { showToast('请选择一个 winner proposal'); return; }
      proposalIds = [winnerId];
    } else {
      proposalIds = pendingProposals.map((p) => p.id);
    }

    if (mode === 'llm-merge-eval' && selectedTasks.length === 0) {
      showToast('请至少选择一个评测任务');
      return;
    }

    setSubmitting(true);
    try {
      // payload 字段对齐 secocto-ui decisionsEvolve:
      //   tasks 暂为 null(secocto-ui 注释:按 Boss 要求 tasks 暂为 null)
      const payload = {
        mode,
        proposal_ids: proposalIds,
        triggered_by: 'current-user',
        tasks: null,
      };
      const decision = await secoctoClients.skills.evolve(fullName, payload);

      // manual-pick 模式额外调 pickDecision
      if (mode === 'manual-pick') {
        const did = decision?.id;
        if (did == null) throw new Error('decisions 返回缺少 id');
        await secoctoClients.skills.pickDecision(did, {
          proposal_id: proposalIds[0],
          actor: 'current-user',
        });
      }
      showToast('已提交进化请求');
      // 与 secocto-ui 一致:不跳转,留在当前页;用户回 SkillDetail 在决策列表里看进度
    } catch (e: any) {
      console.warn('[evolve] submit failed:', e);
      showToast(`提交失败:${e?.message || String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }, [mode, winnerId, pendingProposals, pendingCount, selectedTasks, fullName, showToast]);

  /* ---------- 渲染 ---------- */
  if (loading && !skill) {
    return <div className="px-8 pt-10 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  }

  return (
    <div className="px-6 lg:px-8 pt-5 pb-12 animate-in fade-in duration-300 max-w-[1200px] mx-auto">
      <Breadcrumb
        items={[
          { label: '技能进化', onClick: onBack /* 返回 SkillDetail,SkillDetail 的 onBack 再退到 browse */ },
          { label: skill?.name || fullName, onClick: onBack },
          { label: '进化合并' },
        ]}
      />

      <h1 className="text-xl font-bold text-theme-text-primary mb-4">进化合并</h1>

      {/* ===================== 模式选择 ===================== */}
      <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
        <h2 className="text-sm font-semibold text-theme-text-primary mb-3">选择模式</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {EVOLVE_MODES.map((m) => {
            const active = mode === m.value;
            return (
              <label
                key={m.value}
                className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                  active
                    ? 'border-brand-primary/50 bg-brand-soft/30'
                    : 'border-theme-border hover:bg-theme-bg-elevated/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="evolve-mode"
                    value={m.value}
                    checked={active}
                    onChange={() => setMode(m.value)}
                    className="accent-brand-primary"
                  />
                  <span className="font-mono text-xs font-semibold text-theme-text-primary">{m.label}</span>
                </div>
                <span className="text-xs text-theme-text-secondary pl-5">{m.desc}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* ===================== 参与合并的提案 ===================== */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold text-theme-text-primary">
          参与合并的提案 <span className="text-theme-text-faint font-normal">({pendingCount})</span>
        </h2>
      </div>

      {pendingCount === 0 ? (
        <div className="rounded-xl border border-theme-border bg-theme-surface p-6 text-center text-sm text-theme-text-faint mb-4">
          {proposals === null ? '加载提案中…' : '暂无待处理提案'}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {pendingProposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              expanded={expanded.has(p.id)}
              onToggle={() => toggleExpand(p)}
              showWinnerRadio={mode === 'manual-pick'}
              isWinner={winnerId === p.id}
              onPickWinner={() => setWinnerId(p.id)}
            />
          ))}
        </div>
      )}

      {/* ===================== 评测配置(仅 llm-merge-eval) ===================== */}
      {mode === 'llm-merge-eval' && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h2 className="text-sm font-semibold text-theme-text-primary mb-3">评测配置</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated transition-colors"
            >
              <ListChecks size={14} />选择评测任务
            </button>
            <button
              onClick={() => setVulnModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated transition-colors"
            >
              <Bug size={14} />选择关联漏洞
            </button>
          </div>
          {selectedTasks.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-theme-text-faint mb-1">已选评测任务 ({selectedTasks.length})</div>
              <div className="flex flex-wrap gap-1">
                {selectedTasks.map((t) => (
                  <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-soft text-brand-primary">✓ {t.name}</span>
                ))}
              </div>
            </div>
          )}
          {selectedVulns.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-theme-text-faint mb-1">已选关联漏洞 ({selectedVulns.length})</div>
              <div className="flex flex-wrap gap-1">
                {selectedVulns.map((v) => (
                  <span key={v.id} className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-700">🐛 {v.label}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===================== 底部操作栏 ===================== */}
      <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-theme-border">
        <button
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated disabled:opacity-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || pendingCount === 0}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Rocket size={14} />
          {submitting ? '提交中…' : '提交进化请求'}
        </button>
      </div>

      {/* ===================== Toast ===================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm shadow-lg animate-in fade-in duration-200">
          {toast}
        </div>
      )}

      {/* ===================== 评测任务 Modal ===================== */}
      <EvalTaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onConfirm={(tasks) => { setSelectedTasks(tasks); setTaskModalOpen(false); }}
        currentSelection={selectedTasks}
      />

      {/* ===================== 关联漏洞 Modal ===================== */}
      <VulnSelectModal
        open={vulnModalOpen}
        onClose={() => setVulnModalOpen(false)}
        onConfirm={(vs) => { setSelectedVulns(vs); setVulnModalOpen(false); }}
        currentSelection={selectedVulns}
      />
    </div>
  );
};

/* ===================== 提案 card ===================== */

const ProposalCard: React.FC<{
  proposal: SecOctoProposal;
  expanded: boolean;
  onToggle: () => void;
  showWinnerRadio: boolean;
  isWinner: boolean;
  onPickWinner: () => void;
}> = ({ proposal, expanded, onToggle, showWinnerRadio, isWinner, onPickWinner }) => {
  return (
    <div className={`rounded-lg border bg-theme-surface overflow-hidden transition-colors ${
      isWinner ? 'border-brand-primary/60 ring-1 ring-brand-primary/30' : 'border-theme-border'
    }`}>
      <div className="flex items-center gap-3 px-3 py-2">
        {showWinnerRadio && (
          <input
            type="radio"
            name="evolve-winner"
            checked={isWinner}
            onChange={onPickWinner}
            className="accent-brand-primary shrink-0"
            aria-label={`选择提案 #${proposal.id} 为 winner`}
          />
        )}
        <span className="font-mono text-xs font-semibold text-theme-text-primary whitespace-nowrap">#{proposal.id}</span>
        {proposal.branch && (
          <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-theme-bg-elevated text-theme-text-secondary truncate">
            {proposal.branch}
          </code>
        )}
        <span className="text-[11px] text-theme-text-faint whitespace-nowrap">by {proposal.created_by || '—'}</span>
        <span className="text-[11px] text-theme-text-faint whitespace-nowrap ml-auto">{fmtTimeAgo(proposal.created_at)}</span>
        <button
          onClick={onToggle}
          className="p-1 rounded-md text-theme-text-faint hover:text-theme-text-primary hover:bg-theme-bg-elevated transition-colors shrink-0"
          aria-label={expanded ? '收起 diff' : '展开 diff'}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {proposal.summary && (
        <div className="px-3 pb-2 text-xs text-theme-text-secondary">{proposal.summary}</div>
      )}
      {expanded && (
        <div className="border-t border-theme-border bg-theme-bg-elevated/40">
          <ProposalDiff proposal={proposal} />
        </div>
      )}
    </div>
  );
};

const ProposalDiff: React.FC<{ proposal: SecOctoProposal }> = ({ proposal }) => {
  if (proposal.full_name == null || proposal.pr_number == null) {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">该提案缺少 PR 信息(full_name / pr_number)</p>;
  }
  if (proposal.diff == null) {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">加载文件变动中…</p>;
  }
  if (proposal.diff === '') {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">该提案未提供 diff</p>;
  }
  // 加载失败的占位文案直接走 <pre>(parser 会把它当成空 diff,这里显式判断)
  if (proposal.diff.startsWith('加载文件变动失败')) {
    return <p className="px-3 py-3 text-xs text-red-700 whitespace-pre-wrap">{proposal.diff}</p>;
  }
  return (
    <div className="p-2">
      <DiffView raw={proposal.diff} />
    </div>
  );
};

/* ===================== 评测任务 Modal ===================== */
// secocto-ui demo 后端 GATE_EVAL_TASKS 永远是空(没接口源),保留空状态 + 说明。
// 后续接通真实任务来源时,把数据加载逻辑塞这里即可。

const EvalTaskModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (tasks: EvalTaskSelection[]) => void;
  currentSelection: EvalTaskSelection[];
}> = ({ open, onClose, onConfirm, currentSelection }) => {
  const [tasks] = useState<EvalTaskSelection[]>([]); // 占位:demo 无来源
  const [checked, setChecked] = useState<Set<string>>(new Set(currentSelection.map((t) => t.id)));
  useEffect(() => {
    if (open) setChecked(new Set(currentSelection.map((t) => t.id)));
  }, [open, currentSelection]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择评测任务"
      maxWidth="max-w-xl"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated transition-colors">取消</button>
          <button
            onClick={() => onConfirm(tasks.filter((t) => checked.has(t.id)))}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 transition-opacity"
          >确认选择</button>
        </>
      }
    >
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-theme-text-faint">该技能暂未配置评测任务</p>
      ) : (
        <div className="space-y-1">
          {tasks.map((t) => (
            <label key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-theme-bg-elevated cursor-pointer">
              <input
                type="checkbox"
                checked={checked.has(t.id)}
                onChange={(e) => setChecked((prev) => {
                  const n = new Set(prev);
                  if (e.target.checked) n.add(t.id); else n.delete(t.id);
                  return n;
                })}
                className="accent-brand-primary mt-0.5"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-theme-text-primary">{t.name}</div>
                <div className="text-[10px] text-theme-text-faint">weight: {t.weight}</div>
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
};

/* ===================== 关联漏洞 Modal ===================== */
// 拉 vuln.findings 前 50 条作为可选列表(对齐 secocto-ui /api/secocto/v1/vulns/findings 调用,
// 无 limit 时后端默认 100 条左右;这里收紧到 50 避免过长)。

const VulnSelectModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (vulns: VulnSelection[]) => void;
  currentSelection: VulnSelection[];
}> = ({ open, onClose, onConfirm, currentSelection }) => {
  const [findings, setFindings] = useState<SecOctoVulnFinding[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set(currentSelection.map((v) => v.id)));

  useEffect(() => {
    if (!open) return;
    setChecked(new Set(currentSelection.map((v) => v.id)));
    // 仅在 modal 第一次打开时拉
    if (findings != null) return;
    secoctoClients.vuln.findings({ limit: 50, offset: 0 })
      .then((res) => setFindings(res.items))
      .catch(() => setFindings([]));
  }, [open, currentSelection, findings]);

  const items = findings ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择关联漏洞"
      maxWidth="max-w-xl"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated transition-colors">取消</button>
          <button
            onClick={() => {
              const selected: VulnSelection[] = items
                .filter((f) => checked.has(f.id))
                .map((f) => ({ id: f.id, label: f.rule_id || `finding-${f.id}` }));
              onConfirm(selected);
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 transition-opacity"
          >确认选择</button>
        </>
      }
    >
      {findings === null ? (
        <p className="py-6 text-center text-xs text-theme-text-faint">加载漏洞中…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-xs text-theme-text-faint">暂无漏洞数据</p>
      ) : (
        <div className="space-y-1">
          {items.map((f) => {
            const label = f.rule_id || `finding-${f.id}`;
            const sevCls = f.severity === 'high' ? 'bg-red-500/15 text-red-700'
              : f.severity === 'medium' ? 'bg-amber-500/15 text-amber-700'
              : 'bg-blue-500/15 text-blue-700';
            return (
              <label key={f.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-theme-bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(f.id)}
                  onChange={(e) => setChecked((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(f.id); else n.delete(f.id);
                    return n;
                  })}
                  className="accent-brand-primary mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-theme-text-primary truncate">{label}</span>
                    {f.severity && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${sevCls}`}>{f.severity}</span>}
                  </div>
                  {(f.message || f.title) && (
                    <div className="text-[11px] text-theme-text-faint truncate">{f.message || f.title}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

/* ===================== Result(进化结果)子页 ===================== */

interface ResultProps {
  fullName: string;
  /** 已弃用 — 现在通过 ?proposals=24,25 query 在 view string 里携带,viewRegistry 解析后传 proposalIds */
  decisionId?: number;
  /** URL ?proposals=24,25 解析出来的 id 列表,用于 _matchDecision + 过滤 proposals 区 */
  proposalIds?: number[];
  /** 面包屑 "技能进化" 项点击 — 回 SkillsPage(技能列表) */
  onNavigateSkills?: () => void;
  /** 返回按钮 + 面包屑 "{skill name}" 项点击 — 回 SkillDetail */
  onBack: () => void;
}

const RESULT_STATUS_META = (status: string | undefined): { label: string; cls: string } => {
  switch (status) {
    case 'merged':
      return { label: '已合并', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'awaiting_approval':
      return { label: '等待审批', cls: 'bg-amber-500/15 text-amber-700' };
    case 'approved':
      return { label: '已批准', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'failed':
      return { label: '失败', cls: 'bg-red-500/15 text-red-700' };
    case 'rejected':
      return { label: '已拒绝', cls: 'bg-red-500/15 text-red-700' };
    case 'picked':
    case 'pending':
      return { label: status === 'picked' ? '已挑选' : '待处理', cls: 'bg-blue-500/15 text-blue-700' };
    default:
      return { label: status || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

// 与 secocto-ui _gateFormatTime 等价 — 完整时间格式 YYYY-MM-DD HH:mm:ss
const fmtResultTime = (at: string | number | null | undefined): string => {
  if (at == null || at === '') return '—';
  let ms: number;
  if (typeof at === 'number') {
    ms = at < 1e12 ? at * 1000 : at;
  } else {
    ms = Date.parse(at);
  }
  if (!ms || isNaN(ms)) return String(at);
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

// 与 secocto-ui _matchDecision 等价:proposalIds 按 sorted 相等 → 匹配;
// 缺省时取 triggered_at(或 created_at)最新一条
const matchDecision = (decisions: SecOctoDecision[], proposalIds?: number[]): SecOctoDecision | null => {
  if (!Array.isArray(decisions) || decisions.length === 0) return null;
  if (!proposalIds || proposalIds.length === 0) {
    return decisions.slice().sort((a, b) => {
      const ta = Date.parse(a.triggered_at || a.created_at || '') || 0;
      const tb = Date.parse(b.triggered_at || b.created_at || '') || 0;
      return tb - ta;
    })[0];
  }
  const want = proposalIds.slice().sort((a, b) => a - b).join(',');
  for (const d of decisions) {
    const got = (Array.isArray(d.proposal_ids) ? d.proposal_ids : [])
      .slice().sort((a, b) => a - b).join(',');
    if (got === want) return d;
  }
  return null;
};

export const SecOctoResultPage: React.FC<ResultProps> = ({ fullName, proposalIds, onBack, onNavigateSkills }) => {
  const [skill, setSkill] = useState<SecOctoSkill | null>(null);
  const [decision, setDecision] = useState<SecOctoDecision | null>(null);
  const [timeline, setTimeline] = useState<SecOctoDecisionTimeline[]>([]);
  const [proposals, setProposals] = useState<SecOctoProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 操作状态(批准/拒绝)
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  /* ---------- 数据加载 ---------- */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // 并发拉 skill / decisions / proposals
        const [skillFromList, decisions, props] = await Promise.all([
          secoctoClients.skills.list({ limit: 200, offset: 0 })
            .then((res) => res.items.find((s) => s.full_name === fullName) || null)
            .catch(() => null),
          secoctoClients.skills.decisions(fullName).catch(() => [] as SecOctoDecision[]),
          secoctoClients.skills.proposals(fullName).catch(() => [] as SecOctoProposal[]),
        ]);
        if (!active) return;

        setSkill(skillFromList);

        // 匹配决策
        const matched = matchDecision(decisions, proposalIds);
        setDecision(matched);

        // 按 proposalIds 过滤提案
        let displayProps = props;
        if (proposalIds && proposalIds.length) {
          const picked = new Set(proposalIds);
          displayProps = props.filter((p) => picked.has(p.id));
        }
        setProposals(displayProps);

        // 拉 timeline(decision id 已知)
        if (matched && matched.id != null) {
          try {
            const tl = await secoctoClients.skills.decisionTimeline(matched.id);
            if (active) setTimeline(tl);
          } catch (e) {
            console.warn('[result] fetch decision timeline failed:', e);
          }
        }
      } catch (e: any) {
        if (active) setError(e?.message || String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fullName, proposalIds]);

  /* ---------- 拉每个 proposal 的 diff ---------- */
  // 与 EvolvePage 一样:gitea.fetchDiff 取 unified diff,缓存到 proposal.diff,UI 用 <pre> 渲染
  useEffect(() => {
    let active = true;
    proposals.forEach(async (p) => {
      if (p.diff != null) return; // 已缓存
      const fn = p.full_name || fullName;
      if (!fn || p.pr_number == null) return;
      try {
        const text = await secoctoClients.gitea.fetchDiff(fn, p.pr_number);
        if (!active) return;
        setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, diff: text } : x));
      } catch (e: any) {
        if (!active) return;
        setProposals((prev) => prev.map((x) => x.id === p.id
          ? { ...x, diff: `加载文件变动失败:${e?.message || String(e)}` }
          : x));
      }
    });
    return () => { active = false; };
  }, [proposals.length, fullName]);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  // ↑ 只依赖 proposals.length 触发,proposal.id 列表变化时重拉;diff 缓存检查在内部完成

  /* ---------- 批准 / 拒绝 ---------- */
  const handleApprove = useCallback(async () => {
    if (!decision) { showToast('当前页面未关联决策,无法批准'); return; }
    setActing('approve');
    try {
      await secoctoClients.skills.approveDecision(decision.id, {
        actor: 'current-user',
        comment: reason.trim() || null,
      });
      // 本地反映
      setDecision((prev) => prev ? { ...prev, status: 'approved' } : prev);
      showToast('已批准合并');
    } catch (e: any) {
      console.warn('[result] approve failed:', e);
      showToast(`批准失败:${e?.message || String(e)}`);
    } finally {
      setActing(null);
    }
  }, [decision, reason, showToast]);

  const handleReject = useCallback(async () => {
    if (!decision) { showToast('当前页面未关联决策,无法拒绝'); return; }
    setActing('reject');
    try {
      await secoctoClients.skills.rejectDecision(decision.id, {
        actor: 'current-user',
        reason: reason.trim() || null,
      });
      setDecision((prev) => prev ? { ...prev, status: 'rejected' } : prev);
      showToast('已拒绝');
    } catch (e: any) {
      console.warn('[result] reject failed:', e);
      showToast(`拒绝失败:${e?.message || String(e)}`);
    } finally {
      setActing(null);
    }
  }, [decision, reason, showToast]);

  /* ---------- 派生:eval_runs / associated_vulns / status ---------- */
  const evalRuns = decision?.eval_runs ?? [];
  const evalScore = decision?.eval_score;
  const associatedVulns = decision?.associated_vulns ?? [];
  const statusMeta = RESULT_STATUS_META(decision?.status);
  const skillDisplayName = skill?.name || skill?.slug || fullName;

  /* ---------- 渲染 ---------- */
  if (loading) {
    return <div className="px-8 pt-10 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  }
  if (error) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">加载失败</h2>
        <p className="text-sm text-theme-text-secondary mb-4">{error}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-theme-text-inverse">返回</button>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-8 pt-5 pb-12 animate-in fade-in duration-300 max-w-[1200px] mx-auto">
      <Breadcrumb
        items={[
          { label: '技能进化', onClick: onNavigateSkills },
          { label: skillDisplayName, onClick: onBack },
          { label: '进化结果' },
        ]}
      />

      {/* ===================== Header + status badge ===================== */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="text-xl font-bold text-theme-text-primary">进化结果</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusMeta.cls}`}>{statusMeta.label}</span>
      </div>

      {/* ===================== Meta 行 ===================== */}
      <div className="text-xs text-theme-text-secondary mb-4">
        <span>Decision #{decision?.id ?? '—'}</span>
        <span className="mx-1.5 text-theme-text-faint">·</span>
        <span>mode: <span className="font-mono">{decision?.mode || '—'}</span></span>
        <span className="mx-1.5 text-theme-text-faint">·</span>
        <span>score: {evalScore != null ? <span className="font-mono">{evalScore}/100</span> : '—'}</span>
      </div>

      {/* ===================== Timeline ===================== */}
      <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3">
        <h2 className="text-sm font-semibold text-theme-text-primary mb-3">时间线</h2>
        {timeline.length === 0 ? (
          <p className="text-xs text-theme-text-faint">暂无时间线事件</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((t, i) => {
              const isCurrent = i === timeline.length - 1;
              const eventLabel = t.event_type || t.event || t.phase || '';
              const actorLabel = t.actor || '';
              const timeRaw = t.created_at ?? t.at ?? t.started_at ?? t.finished_at;
              return (
                <div key={t.id ?? i} className="flex items-start gap-3">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                    isCurrent ? 'bg-brand-primary ring-2 ring-brand-primary/30' : 'bg-theme-bg-elevated border border-theme-border'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs ${isCurrent ? 'font-semibold text-theme-text-primary' : 'text-theme-text-secondary'}`}>
                        {eventLabel}
                      </span>
                      {actorLabel && (
                        <span className="text-[11px] text-theme-text-faint">{actorLabel}</span>
                      )}
                      <span className="text-[10px] text-theme-text-faint ml-auto">{fmtResultTime(timeRaw)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================== 评测结果(可选) ===================== */}
      {evalRuns.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3">
          <h2 className="text-sm font-semibold text-theme-text-primary mb-3">评测结果</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-theme-bg-elevated/40">
                <tr>
                  {['Task', 'Score', 'Status', 'Weight'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evalRuns.map((r, i) => {
                  const scoreCls = (r.score ?? 0) >= 90 ? 'text-emerald-700'
                    : (r.score ?? 0) >= 70 ? 'text-amber-700'
                    : 'text-red-700';
                  return (
                    <tr key={i} className="border-t border-theme-border">
                      <td className="px-3 py-2 text-xs text-theme-text-primary">{r.task_name || '—'}</td>
                      <td className={`px-3 py-2 text-xs font-mono font-semibold ${scoreCls}`}>{r.score ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-theme-text-secondary">{r.status || '—'}</td>
                      <td className="px-3 py-2 text-xs text-theme-text-secondary">{r.weight ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {evalScore != null && (
            <div className="mt-3 text-xs text-theme-text-secondary">
              综合评分:<strong className="text-theme-text-primary font-mono ml-1">{evalScore}</strong> <span className="text-theme-text-faint">(加权平均)</span>
            </div>
          )}
        </section>
      )}

      {/* ===================== 提案文件变动 ===================== */}
      {proposals.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3">
          <h2 className="text-sm font-semibold text-theme-text-primary mb-3">
            提案文件变动 <span className="text-theme-text-faint font-normal">({proposals.length})</span>
          </h2>
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="rounded-lg border border-theme-border overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 bg-theme-bg-elevated/30">
                  <span className="font-mono text-xs font-semibold text-theme-text-primary">#{p.id}</span>
                  {p.branch && (
                    <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-theme-bg-elevated text-theme-text-secondary truncate">
                      {p.branch}
                    </code>
                  )}
                  <span className="text-[11px] text-theme-text-faint">by {p.created_by || '—'}</span>
                </div>
                <ResultProposalDiff proposal={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===================== 关联漏洞(可选) ===================== */}
      {associatedVulns.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3">
          <h2 className="text-sm font-semibold text-theme-text-primary mb-2">关联漏洞</h2>
          <div className="flex flex-wrap gap-1.5">
            {associatedVulns.map((v) => (
              <span key={v} className="px-2 py-0.5 rounded-md text-[11px] bg-amber-500/15 text-amber-700">
                🐛 {v}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ===================== 原因 + 操作按钮 ===================== */}
      <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-3">
        <label className="block text-sm font-semibold text-theme-text-primary mb-2">原因</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="可选,填写原因或备注..."
          className="w-full px-3 py-2 rounded-md border border-theme-border bg-theme-bg-elevated text-xs text-theme-text-primary outline-none focus:border-brand-primary resize-y"
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={handleReject}
            disabled={!decision || acting !== null}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ❌ {acting === 'reject' ? '拒绝中…' : '拒绝'}
          </button>
          <button
            onClick={handleApprove}
            disabled={!decision || acting !== null}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            ✅ {acting === 'approve' ? '批准中…' : '批准合并'}
          </button>
        </div>
      </section>

      {/* ===================== Toast ===================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm shadow-lg animate-in fade-in duration-200">
          {toast}
        </div>
      )}
    </div>
  );
};

/* ===================== Result 页 — 单个 proposal 的 diff 渲染 ===================== */

const ResultProposalDiff: React.FC<{ proposal: SecOctoProposal }> = ({ proposal }) => {
  if (proposal.full_name == null || proposal.pr_number == null) {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">该提案缺少 PR 信息(full_name / pr_number)</p>;
  }
  if (proposal.diff == null) {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">加载文件变动中…</p>;
  }
  if (proposal.diff === '') {
    return <p className="px-3 py-3 text-xs text-theme-text-faint">该提案未提供 diff</p>;
  }
  if (proposal.diff.startsWith('加载文件变动失败')) {
    return <p className="px-3 py-3 text-xs text-red-700 whitespace-pre-wrap">{proposal.diff}</p>;
  }
  return (
    <div className="p-2">
      <DiffView raw={proposal.diff} />
    </div>
  );
};
