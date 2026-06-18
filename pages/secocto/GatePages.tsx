import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoSkill, SecOctoSkillHealth, SecOctoProposal, SecOctoDecision, SecOctoPagerState, SecOctoNavKey } from '../../types/secocto';
import { SecOctoPager, PAGE_SIZE_OPTIONS } from './shared/Pager';
import { PageHeader } from '../../design-system';

interface BrowseProps {
  onNavigateSkill: (fullName: string) => void;
  onNavigate: (navKey: SecOctoNavKey) => void;
}

const RISK_CLASS: Record<string, string> = {
  safe: 'bg-emerald-500/15 text-emerald-700',
  low: 'bg-blue-500/15 text-blue-700',
  medium: 'bg-amber-500/15 text-amber-700',
  high: 'bg-orange-500/15 text-orange-700',
  critical: 'bg-red-500/15 text-red-700',
};

export const SecOctoBrowsePage: React.FC<BrowseProps> = ({ onNavigateSkill, onNavigate }) => {
  const [items, setItems] = useState<SecOctoSkill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [healthTotal, setHealthTotal] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [skillRes, healthRes] = await Promise.all([
        secoctoClients.skills.list({ limit: pager.size, offset: (pager.page - 1) * pager.size }),
        secoctoClients.skills.healthz(),
      ]);
      setItems(skillRes.items);
      const resolvedTotal = healthRes.indexed_skills ?? skillRes.total ?? skillRes.items.length;
      setTotal(resolvedTotal);
      setHealthTotal(healthRes.indexed_skills ?? null);
    } catch (e: any) {
      console.warn('[browse] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [pager.page, pager.size]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [items, search]);

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={<>技能<span className="gradient-text bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">进化</span></>}
        description={<>Agent 可调用的安全检测能力 · 共 {healthTotal ?? total} 个技能</>}
        actions={<div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索技能…" className="pl-9 pr-4 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors" />
        </div>}
      />

      {loading ? (
        <div className="py-12 text-center text-theme-text-secondary">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-theme-text-secondary">{search ? '没有匹配的技能' : '暂无技能'}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => (
            <button key={s.full_name} onClick={() => onNavigateSkill(s.full_name)} className="rounded-xl border border-theme-border bg-theme-surface p-4 text-left hover:border-brand-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
              <div className="font-semibold text-theme-text-primary truncate">{s.name || s.slug || s.full_name}</div>
              <div className="text-sm text-theme-text-secondary mt-1 line-clamp-2">{s.short_desc || s.description || ''}</div>
              <div className="flex items-center gap-2 mt-2">
                {s.risk_level && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_CLASS[s.risk_level] || RISK_CLASS.medium}`}>{s.risk_level}</span>}
                {s.stars != null && <span className="text-xs text-theme-text-faint">⭐ {s.stars}</span>}
              </div>
              {s.category && <div className="px-2 py-0.5 rounded-full text-xs bg-theme-elevated text-theme-text-secondary mt-2">{s.category}</div>}
            </button>
          ))}
        </div>
      )}

      <SecOctoPager total={total} state={pager} onChange={(p) => setPager((prev) => ({ ...prev, page: p }))} onSizeChange={(s) => setPager({ page: 1, size: s })} sizeOptions={PAGE_SIZE_OPTIONS} />
    </div>
  );
};

interface SkillDetailProps {
  fullName: string;
  onNavigateEvolve: (fullName: string) => void;
  onBack: () => void;
}

export const SecOctoSkillDetailPage: React.FC<SkillDetailProps> = ({ fullName, onNavigateEvolve, onBack }) => {
  const [skill, setSkill] = useState<SecOctoSkill | null>(null);
  const [proposals, setProposals] = useState<SecOctoProposal[]>([]);
  const [decisions, setDecisions] = useState<SecOctoDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      secoctoClients.skills.list({ limit: 200, offset: 0 }).then((res) => {
        const found = res.items.find((s) => s.full_name === fullName);
        if (found) setSkill(found);
        return found;
      }),
      secoctoClients.skills.proposals(fullName).then(setProposals).catch(() => setProposals([])),
      secoctoClients.skills.decisions(fullName).then(setDecisions).catch(() => setDecisions([])),
    ]).finally(() => setLoading(false));
  }, [fullName]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (!skill) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">未找到技能</div>;

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={skill.name || skill.full_name}
        description={skill.description || skill.short_desc || ''}
        back={{ label: '返回技能列表', onClick: onBack }}
      />

      <div className="flex gap-2">
        {skill.risk_level && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_CLASS[skill.risk_level] || ''}`}>{skill.risk_level}</span>}
        {skill.author && <span className="text-xs text-theme-text-faint">by {skill.author}</span>}
      </div>

      <button onClick={() => onNavigateEvolve(fullName)} className="px-4 py-2 rounded-lg bg-brand-primary text-theme-text-inverse font-medium text-sm hover:opacity-90 mb-6">发起进化合并</button>

      {proposals.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">待处理提案 ({proposals.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-theme-elevated/5"><tr><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">ID</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">状态</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">评分</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">时间</th></tr></thead>
              <tbody>{proposals.map((p) => <tr key={p.id} className="border-b border-theme-border"><td className="px-3 py-2 font-mono text-xs">{p.id}</td><td className="px-3 py-2 text-xs">{p.status || '—'}</td><td className="px-3 py-2 text-xs font-semibold">{p.score ?? '—'}</td><td className="px-3 py-2 text-xs text-theme-text-secondary">{p.created_at || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {decisions.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">决策记录 ({decisions.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-theme-elevated/5"><tr><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">ID</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">模式</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">状态</th><th className="px-3 py-2 text-xs font-semibold text-theme-text-faint">时间</th></tr></thead>
              <tbody>{decisions.map((d) => <tr key={d.id} className="border-b border-theme-border"><td className="px-3 py-2 font-mono text-xs">{d.id}</td><td className="px-3 py-2 text-xs">{d.mode || '—'}</td><td className="px-3 py-2 text-xs">{d.status || '—'}</td><td className="px-3 py-2 text-xs text-theme-text-secondary">{d.created_at || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

interface EvolveProps {
  fullName: string;
  onBack: () => void;
  onNavigateResult: (fullName: string, proposalIds: number[]) => void;
}

export const SecOctoEvolvePage: React.FC<EvolveProps> = ({ fullName, onBack, onNavigateResult }) => {
  const [skill, setSkill] = useState<SecOctoSkill | null>(null);
  const [proposals, setProposals] = useState<SecOctoProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'auto-best' | 'manual-pick'>('auto-best');
  const [pickedIds, setPickedIds] = useState<number[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      secoctoClients.skills.list({ limit: 200, offset: 0 }).then((res) => {
        const found = res.items.find((s) => s.full_name === fullName);
        if (found) setSkill(found);
      }),
      secoctoClients.skills.proposals(fullName).then(setProposals).catch(() => setProposals([])),
    ]).finally(() => setLoading(false));
  }, [fullName]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, any> = { mode, proposal_ids: mode === 'manual-pick' ? pickedIds : proposals.map((p) => p.id) };
      await secoctoClients.skills.evolve(fullName, payload);
      onNavigateResult(fullName, mode === 'manual-pick' ? pickedIds : proposals.map((p) => p.id));
    } catch (e: any) {
      console.warn('[evolve] submit failed:', e);
    } finally {
      setSubmitting(false);
    }
  }, [mode, pickedIds, proposals, fullName, onNavigateResult]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300 max-w-2xl mx-auto">
      <PageHeader
        title={`进化合并 · ${skill?.name || fullName}`}
        back={{ label: '返回技能详情', onClick: onBack }}
      />

      <div className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-3">选择模式</h3>
        <div className="flex gap-2">
          <button onClick={() => setMode('auto-best')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'auto-best' ? 'bg-brand-primary text-theme-text-inverse' : 'border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'}`}>自动最优 (auto-best)</button>
          <button onClick={() => setMode('manual-pick')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'manual-pick' ? 'bg-brand-primary text-theme-text-inverse' : 'border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'}`}>手动挑选 (manual-pick)</button>
        </div>
      </div>

      {proposals.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">可选提案 ({proposals.length})</h3>
          {mode === 'manual-pick' ? (
            <div className="space-y-2">
              {proposals.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-theme-border hover:bg-theme-elevated cursor-pointer">
                  <input type="checkbox" checked={pickedIds.includes(p.id)} onChange={(e) => setPickedIds((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))} className="accent-brand-primary" />
                  <span className="font-mono text-xs">{p.id}</span>
                  <span className="text-xs text-theme-text-secondary">评分 {p.score ?? '—'}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-theme-text-secondary">将自动选择评分最优的提案</p>
          )}
        </div>
      )}

      <button disabled={submitting || (mode === 'manual-pick' && pickedIds.length === 0)} onClick={handleSubmit} className="px-4 py-2 rounded-lg bg-brand-primary text-theme-text-inverse font-medium text-sm hover:opacity-90 disabled:opacity-50">提交进化</button>
    </div>
  );
};

interface ResultProps {
  fullName: string;
  decisionId: number;
  onBack: () => void;
}

export const SecOctoResultPage: React.FC<ResultProps> = ({ fullName, decisionId, onBack }) => {
  const [decision, setDecision] = useState<SecOctoDecision | null>(null);
  const [proposals, setProposals] = useState<SecOctoProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      secoctoClients.skills.decisions(fullName).then((ds) => {
        const d = ds.find((d) => d.id === decisionId);
        setDecision(d || null);
        return d;
      }),
      secoctoClients.skills.proposals(fullName).then(setProposals).catch(() => setProposals([])),
    ]).finally(() => setLoading(false));
  }, [fullName, decisionId]);

  const handleApprove = useCallback(async () => {
    if (!decision) return;
    setApproving(true);
    try { await secoctoClients.skills.approveDecision(decision.id); } catch (e) { console.warn('[result] approve failed:', e); }
    finally { setApproving(false); }
  }, [decision]);

  const handleReject = useCallback(async () => {
    if (!decision) return;
    setApproving(true);
    try { await secoctoClients.skills.rejectDecision(decision.id); } catch (e) { console.warn('[result] reject failed:', e); }
    finally { setApproving(false); }
  }, [decision]);

  if (loading) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">加载中…</div>;
  if (!decision) return <div className="px-8 pt-8 pb-12 text-center text-theme-text-secondary">未找到决策</div>;

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={`进化结果 · 决策 #${decision.id}`}
        back={{ label: '返回', onClick: onBack }}
      />

      <div className="flex gap-2 mb-4">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-soft text-brand-primary">{decision.mode || '—'}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${decision.status === 'approved' ? 'bg-emerald-500/15 text-emerald-700' : decision.status === 'rejected' ? 'bg-red-500/15 text-red-700' : 'bg-amber-500/15 text-amber-700'}`}>{decision.status || '—'}</span>
      </div>

      {proposals.length > 0 && (
        <section className="rounded-xl border border-theme-border bg-theme-surface p-4 mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">涉及提案</h3>
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="px-3 py-2 rounded-lg border border-theme-border text-xs">
                <span className="font-mono font-semibold">{p.id}</span> — 评分 {p.score ?? '—'} — {p.status || '—'}
              </div>
            ))}
          </div>
        </section>
      )}

      {decision.status === 'pending' && (
        <div className="flex gap-3">
          <button disabled={approving} onClick={handleApprove} className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-medium text-sm hover:opacity-90 disabled:opacity-50">批准</button>
          <button disabled={approving} onClick={handleReject} className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium text-sm hover:opacity-90 disabled:opacity-50">拒绝</button>
        </div>
      )}
    </div>
  );
};