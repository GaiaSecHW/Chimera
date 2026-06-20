import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Wrench } from 'lucide-react';
import { secoctoClients } from '../../clients/secocto';
import type {
  SecOctoTask,
  SecOctoVulnFinding,
  SecOctoAnnotation,
  SecOctoTaskWikiCard,
  SecOctoSkillUsage,
  SecOctoProposal,
  SecOctoTaskFeedback,
} from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import { RadarChart } from './shared/RadarChart';
import { fmtCount, fmtDuration, fmtTimeCompact } from './shared/format';
import {
  SCORE_DIMS,
  annotationVerdictMeta,
  findingStatusMeta,
  flattenEvidenceChain,
  formatLocation,
  proposalStatusMeta,
  scoreClass,
  scoreVerdict,
  severityMeta,
  statusMeta,
} from './shared/taskMeta';

/* ===================== 常量 ===================== */

const FINDING_PAGE_SIZE = 10;
const SKILL_PAGE_SIZE = 5;
const PROPOSAL_PAGE_SIZE = 5;

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

/* ===================== 主组件 ===================== */

export const SecOctoTaskDetailPage: React.FC<TaskDetailProps> = ({ taskId, onBack }) => {
  const [task, setTask] = useState<SecOctoTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [findings, setFindings] = useState<SecOctoVulnFinding[]>([]);
  const [findingCount, setFindingCount] = useState<number>(0);
  const [wikiCards, setWikiCards] = useState<SecOctoTaskWikiCard[]>([]);
  const [skillsDetailed, setSkillsDetailed] = useState<SecOctoSkillUsage[]>([]);

  // 客户端分页 / 过滤 / 展开状态
  const [findingPage, setFindingPage] = useState(1);
  const [skillPage, setSkillPage] = useState(1);
  const [proposalPage, setProposalPage] = useState(1);
  const [sevFilter, setSevFilter] = useState<string>('');
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());

  // 反馈表单
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // 跳转锚点
  const refs = {
    finding: useRef<HTMLDivElement | null>(null),
    skill: useRef<HTMLDivElement | null>(null),
    card: useRef<HTMLDivElement | null>(null),
    score: useRef<HTMLDivElement | null>(null),
  };

  /* ===================== 数据加载 ===================== */

  // 第 1 步:拉 task 本体
  useEffect(() => {
    let active = true;
    setTaskLoading(true);
    setTaskError(null);
    secoctoClients.tasks
      .byId(taskId)
      .then((t) => { if (active) setTask(t); })
      .catch((e: any) => { if (active) setTaskError(e?.message || String(e)); })
      .finally(() => { if (active) setTaskLoading(false); });
    return () => { active = false; };
  }, [taskId]);

  // 第 2 步:task 就绪后并发拉 3 路附属(findings via report / wiki cards / skills detail)
  // 各自独立兜底,任一失败不影响其他;失败仅 console 警告。
  useEffect(() => {
    if (!task) return;
    let active = true;

    (async () => {
      const reportP = (async () => {
        try {
          const reports = await secoctoClients.vuln.reportsByTaskId(taskId);
          if (!reports.length) return null;
          const rid = (reports[0] as any).id ?? (reports[0] as any).report_id;
          if (rid == null) return null;
          return await secoctoClients.vuln.reportById(rid);
        } catch (e) {
          console.warn('[secocto-task-detail] reports lookup failed:', e);
          return null;
        }
      })();

      const wikiP = (async () => {
        const names = Array.isArray(task.wiki_used) ? task.wiki_used : [];
        if (!names.length) return [];
        try {
          return await secoctoClients.memories.findCardsByNames(names);
        } catch (e) {
          console.warn('[secocto-task-detail] wiki cards lookup failed:', e);
          return [];
        }
      })();

      const skillsP = (async () => {
        const usages = task.skills_used ?? [];
        if (!usages.length) return [];
        // 已经有 version 就不补拉,否则按 name(原 slug)调 skills.bySlug 拿 latest_version
        if (usages.every((u) => !!u.version)) return usages;
        const results = await Promise.all(
          usages.map(async (u): Promise<SecOctoSkillUsage> => {
            try {
              const detail = await secoctoClients.skills.bySlug(u.name);
              return {
                name: detail.name || detail.full_name || u.name,
                version: detail.latest_version || detail.version || u.version || '',
              };
            } catch (e) {
              console.warn('[secocto-task-detail] skills.bySlug failed for', u.name, e);
              return { name: u.name, version: u.version || '' };
            }
          }),
        );
        return results;
      })();

      const [report, cards, skills] = await Promise.all([reportP, wikiP, skillsP]);
      if (!active) return;

      if (report) {
        const items = Array.isArray(report.findings) ? report.findings : [];
        setFindings(items);
        setFindingCount(typeof report.finding_count === 'number' ? report.finding_count : items.length);
      }
      setWikiCards(cards);
      setSkillsDetailed(skills);
    })();

    return () => { active = false; };
  }, [task, taskId]);

  /* ===================== 派生数据 ===================== */

  const filteredFindings = useMemo(
    () => (sevFilter ? findings.filter((f) => f.severity === sevFilter) : findings),
    [findings, sevFilter],
  );

  const sevCounts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, note: 0 };
    for (const f of findings) {
      const s = f.severity as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [findings]);

  const confirmedCount = useMemo(() => findings.filter((f) => f.status === 'confirmed').length, [findings]);
  const pendingCount = useMemo(() => findings.filter((f) => f.status === 'pending').length, [findings]);

  const proposals: SecOctoProposal[] = task?.proposals ?? [];
  const feedbacks: SecOctoTaskFeedback[] = task?.feedbacks ?? [];
  const mergedProposals = useMemo(() => proposals.filter((p) => p.status === 'merged').length, [proposals]);

  const filteredTags = useMemo(() => {
    if (!task?.tags) return [] as string[];
    return task.tags.filter((t) => t !== task.platform_name && t !== task.platform && t !== task.agent_type);
  }, [task]);

  const duration = fmtDuration(task?.created_at, task?.updated_at);
  const radarValues = useMemo(() => {
    const raw = task?.score_vector ?? [];
    const arr = raw.slice(0, SCORE_DIMS.length);
    while (arr.length < SCORE_DIMS.length) arr.push(0);
    return arr;
  }, [task]);

  // 雷达图坐标轴最大值:取 5 个维度的最大值,向上 ceil 到 10 的倍数,且不小于 10。
  // 例:32 → 40,38 → 40,7 → 10,0/空 → 10。这样小分值的差异在图上更明显。
  const radarMax = useMemo(() => {
    const peak = radarValues.reduce((m, v) => (v > m ? v : m), 0);
    return Math.max(10, Math.ceil(peak / 10) * 10);
  }, [radarValues]);

  const pagedFindings = useMemo(() => {
    const start = (findingPage - 1) * FINDING_PAGE_SIZE;
    return filteredFindings.slice(start, start + FINDING_PAGE_SIZE);
  }, [filteredFindings, findingPage]);

  const pagedSkills = useMemo(() => {
    const start = (skillPage - 1) * SKILL_PAGE_SIZE;
    return skillsDetailed.slice(start, start + SKILL_PAGE_SIZE);
  }, [skillsDetailed, skillPage]);

  const pagedProposals = useMemo(() => {
    const start = (proposalPage - 1) * PROPOSAL_PAGE_SIZE;
    return proposals.slice(start, start + PROPOSAL_PAGE_SIZE);
  }, [proposals, proposalPage]);

  /* ===================== 交互 ===================== */

  const toggleExpanded = (id: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const scrollTo = (k: keyof typeof refs) => {
    refs[k].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitFeedback = useCallback(async () => {
    const content = feedbackContent.trim();
    if (!content) { setFeedbackError('请输入反馈内容'); return; }
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    try {
      await secoctoClients.tasks.submitFeedback(taskId, { source: 'human', content, annotations: null });
      // 提交后以后端为准:重拉 task,只刷 feedbacks(其他字段也顺带带上)
      try {
        const fresh = await secoctoClients.tasks.byId(taskId);
        setTask(fresh);
      } catch (e) {
        console.warn('[secocto-task-detail] refetch task after feedback failed:', e);
      }
      setFeedbackContent('');
    } catch (e: any) {
      setFeedbackError(e?.message || '反馈提交失败');
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [feedbackContent, taskId]);

  /* ===================== Loading / Error ===================== */

  if (taskLoading) {
    return <div className="px-8 pt-10 pb-12 text-center text-theme-text-secondary">加载任务详情中…</div>;
  }
  if (taskError || !task) {
    return (
      <div className="px-8 pt-10 pb-12 text-center">
        <h2 className="text-xl font-bold text-theme-text-primary mb-2">未找到任务</h2>
        <p className="text-sm text-theme-text-secondary mb-4">{taskError || '后端未返回该任务'}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm bg-brand-primary text-theme-text-inverse">返回总览</button>
      </div>
    );
  }

  /* ===================== 渲染 ===================== */

  const status = statusMeta(task.status);
  const scoreCls = scoreClass(task.score);

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-theme-text-secondary hover:text-brand-primary mb-4 transition-colors"
      >
        <ArrowLeft size={14} />返回总览
      </button>

      {/* ===================== Banner ===================== */}
      <div className="rounded-xl border border-theme-border bg-theme-surface p-5 mb-4">
        <div className="text-base text-theme-text-primary font-bold mb-3">{task.summary || '暂无摘要'}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="min-w-0 space-y-2">
            <div className="font-mono text-base font-bold text-theme-text-primary break-all">{task.task_id}</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>{status.label}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-sm font-bold ${scoreCls}`}>
                {task.score != null ? `${task.score}/100` : '—'}
              </span>
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5 text-sm">
            <BannerAttr k="平台" v={task.platform_name || task.platform || '—'} />
            <BannerAttr k="智能体" v={task.agent_type || '—'} />
            <BannerAttr
              k="更新"
              v={`${fmtTimeCompact(task.updated_at)}${duration !== '—' ? ` (耗时 ${duration})` : ''}`}
            />
            {task.task_ref && <BannerAttr k="引用" v={task.task_ref} />}
            {filteredTags.length > 0 && (
              <BannerAttr k="标签" v={filteredTags.map((t) => `#${t}`).join(' ')} />
            )}
          </div>
        </div>
      </div>

      {/* ===================== Stats bar (点击 scroll 到 quadrant) ===================== */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <StatJump
          label="漏洞" num={findingCount || findings.length}
          sub={`高 ${sevCounts.high} 中 ${sevCounts.medium} 低 ${sevCounts.low}`}
          onClick={() => scrollTo('finding')}
        />
        <StatJump
          label="知识卡片" num={wikiCards.length}
          sub={wikiCards.length ? '已沉淀' : '—'}
          onClick={() => scrollTo('card')}
        />
        <StatJump
          label="Skill 提案" num={proposals.length}
          sub={`${mergedProposals} 已合并`}
          onClick={() => scrollTo('skill')}
        />
        <StatJump
          label="反馈" num={feedbacks.length}
          sub={feedbacks.length ? '可参考' : '—'}
          onClick={() => scrollTo('card')}
        />
        <StatJump
          label="得分" num={task.score == null ? '-' : task.score}
          sub={scoreVerdict(task.score)}
          scoreCls={scoreCls}
          onClick={() => scrollTo('score')}
        />
      </div>

      {/* ===================== 4 象限 ===================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FindingsQuadrant
          containerRef={refs.finding}
          findings={pagedFindings}
          total={filteredFindings.length}
          findingCount={findingCount}
          sevCounts={sevCounts}
          confirmedCount={confirmedCount}
          pendingCount={pendingCount}
          sevFilter={sevFilter}
          onSevFilterChange={(s) => { setSevFilter(s); setFindingPage(1); }}
          page={findingPage}
          onPageChange={setFindingPage}
          expanded={expandedFindings}
          onToggleExpand={toggleExpanded}
        />
        <SkillQuadrant
          containerRef={refs.skill}
          skills={skillsDetailed}
          pagedSkills={pagedSkills}
          skillPage={skillPage}
          onSkillPageChange={setSkillPage}
          proposals={proposals}
          pagedProposals={pagedProposals}
          proposalPage={proposalPage}
          onProposalPageChange={setProposalPage}
        />
        <KnowledgeFeedbackQuadrant
          containerRef={refs.card}
          cards={wikiCards}
          feedbacks={feedbacks}
          feedbackContent={feedbackContent}
          onFeedbackContentChange={setFeedbackContent}
          submitting={feedbackSubmitting}
          error={feedbackError}
          onSubmit={submitFeedback}
        />
        <ScoreQuadrant
          containerRef={refs.score}
          score={task.score}
          scoreCls={scoreCls}
          radarValues={radarValues}
          radarMax={radarMax}
          reasoning={task.score_reasoning}
          createdAt={task.created_at}
          duration={duration}
          traceUrl={task.trace_url}
          bundleUrl={task.bundle_url}
        />
      </div>
    </div>
  );
};

/* ===================== Banner sub ===================== */

const BannerAttr: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-start gap-2 text-sm">
    <span className="text-xs font-semibold text-theme-text-faint min-w-[3rem]">{k}</span>
    <span className="text-theme-text-secondary break-all">{v}</span>
  </div>
);

/* ===================== Stats jump card ===================== */

const StatJump: React.FC<{
  label: string;
  num: React.ReactNode;
  sub: string;
  scoreCls?: string;
  onClick: () => void;
}> = ({ label, num, sub, scoreCls, onClick }) => (
  <button
    onClick={onClick}
    className="rounded-xl border border-theme-border bg-theme-surface p-3 text-center hover:border-brand-primary/40 transition-colors"
  >
    <div className={`text-xl font-bold inline-block ${scoreCls ? `px-2 py-0.5 rounded-lg ${scoreCls}` : 'text-theme-text-primary'}`}>{num}</div>
    <div className="text-xs text-theme-text-faint mt-0.5">{label}</div>
    <div className="text-[10px] text-theme-text-faint mt-0.5 truncate">{sub}</div>
  </button>
);

/* ===================== Quadrant 1: Findings ===================== */

const FindingsQuadrant: React.FC<{
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  findings: SecOctoVulnFinding[];
  total: number;
  findingCount: number;
  sevCounts: { high: number; medium: number; low: number; note: number };
  confirmedCount: number;
  pendingCount: number;
  sevFilter: string;
  onSevFilterChange: (s: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
}> = (p) => {
  const sevPills = [
    { k: '', label: '全部', n: p.findingCount || (p.sevCounts.high + p.sevCounts.medium + p.sevCounts.low + p.sevCounts.note) },
    { k: 'high', label: '高', n: p.sevCounts.high },
    { k: 'medium', label: '中', n: p.sevCounts.medium },
    { k: 'low', label: '低', n: p.sevCounts.low },
  ];
  return (
    <section ref={p.containerRef} className="rounded-xl border border-theme-border bg-theme-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-theme-text-primary">
          漏洞发现 <span className="ml-1 text-theme-text-faint font-normal">{p.findingCount || p.total}</span>
        </h3>
        <div className="text-xs text-theme-text-faint">{p.confirmedCount} 已确认 · {p.pendingCount} 待确认</div>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {sevPills.map((sp) => (
          <button
            key={sp.k}
            onClick={() => p.onSevFilterChange(sp.k)}
            className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
              p.sevFilter === sp.k
                ? 'bg-brand-primary text-theme-text-inverse'
                : 'border border-theme-border text-theme-text-secondary hover:bg-theme-bg-elevated'
            }`}
          >
            {sp.label} {sp.n}
          </button>
        ))}
      </div>
      {p.findings.length === 0 ? (
        <div className="py-8 text-center text-theme-text-faint text-sm">暂无漏洞发现</div>
      ) : (
        <div className="space-y-1.5">
          {p.findings.map((f) => (
            <FindingRow key={f.id} f={f} expanded={p.expanded.has(f.id)} onToggle={() => p.onToggleExpand(f.id)} />
          ))}
        </div>
      )}
      {p.total > FINDING_PAGE_SIZE && (
        <div className="mt-3">
          <SecOctoPager
            total={p.total}
            state={{ page: p.page, size: FINDING_PAGE_SIZE }}
            onChange={p.onPageChange}
            onSizeChange={() => { /* size 固定不暴露 */ }}
            sizeOptions={[FINDING_PAGE_SIZE]}
          />
        </div>
      )}
    </section>
  );
};

const FindingRow: React.FC<{ f: SecOctoVulnFinding; expanded: boolean; onToggle: () => void }> = ({ f, expanded, onToggle }) => {
  const sev = severityMeta(f.severity);
  const st = findingStatusMeta(f.status);
  const loc = formatLocation({
    file_path: f.file_path,
    start_line: f.start_line ?? f.line_start,
    end_line: f.end_line ?? f.line_end,
  });
  const annotations = (f.annotations ?? []) as SecOctoAnnotation[];
  const evidenceSteps = expanded ? flattenEvidenceChain(f.evidence_chain) : [];
  const msg = f.message || f.title || f.description || '';

  return (
    <div className="rounded-lg border border-theme-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-theme-bg-elevated/50 transition-colors text-left"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sev.cls}`}>{sev.label}</span>
        <span className="font-mono text-xs text-theme-text-primary whitespace-nowrap">{f.rule_id || '—'}</span>
        <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-theme-text-secondary" title={loc}>{loc}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${st.cls}`}>{st.label}</span>
        <span className="text-theme-text-faint text-xs">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-theme-bg-elevated/30 border-t border-theme-border space-y-2">
          {msg && <div className="text-xs text-theme-text-secondary whitespace-pre-wrap">{msg}</div>}
          {evidenceSteps.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-theme-text-faint">证据链 ({evidenceSteps.length})</div>
              {evidenceSteps.map((e, i) => {
                const path = e.file_path || e.title || '';
                const lineStr = e.start_line ? `:${e.start_line}${e.end_line && e.end_line !== e.start_line ? `-${e.end_line}` : ''}` : '';
                return (
                  <div key={i} className="text-[11px]">
                    <span className="font-mono text-theme-text-primary">{path}{lineStr}</span>
                    {(e.message || e.detail) && <span className="ml-2 text-theme-text-secondary">{e.message || e.detail}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {annotations.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-theme-text-faint">标注 ({annotations.length})</div>
              {annotations.map((a, i) => {
                const v = annotationVerdictMeta(a.verdict);
                return (
                  <div key={a.id ?? i} className="text-[11px] border-l-2 border-theme-border pl-2 py-0.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`px-1 py-px rounded text-[10px] ${v.cls}`}>{v.label}</span>
                      <span className="text-theme-text-secondary">{a.annotator || a.created_by || '—'}</span>
                      <span className="text-theme-text-faint">{fmtTimeCompact(a.created_at)}</span>
                    </div>
                    {a.analysis && <div className="text-theme-text-secondary">{a.analysis}</div>}
                    {a.notes && <div className="text-theme-text-faint mt-0.5">{a.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ===================== Quadrant 2: Skill ===================== */

const SkillQuadrant: React.FC<{
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  skills: SecOctoSkillUsage[];
  pagedSkills: SecOctoSkillUsage[];
  skillPage: number;
  onSkillPageChange: (p: number) => void;
  proposals: SecOctoProposal[];
  pagedProposals: SecOctoProposal[];
  proposalPage: number;
  onProposalPageChange: (p: number) => void;
}> = (p) => (
  <section ref={p.containerRef} className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <h3 className="text-sm font-semibold text-theme-text-primary mb-3">
      Skill <span className="ml-1 text-theme-text-faint font-normal">{p.skills.length} 用 / {p.proposals.length} 提</span>
    </h3>

    <div className="text-[11px] font-semibold text-theme-text-faint mb-2">本次使用</div>
    {p.pagedSkills.length === 0 ? (
      <div className="py-4 text-center text-theme-text-faint text-xs mb-3">本次未调用 skill</div>
    ) : (
      <div className="space-y-1 mb-3">
        {p.pagedSkills.map((s) => (
          <div key={s.name} className="flex items-center gap-2 px-2 py-1 rounded-md border border-theme-border">
            <Wrench size={12} className="text-brand-primary" />
            <span className="text-xs text-theme-text-primary truncate flex-1" title={s.name}>{s.name}</span>
            {s.version && <span className="text-[10px] text-theme-text-faint font-mono">{s.version}</span>}
          </div>
        ))}
      </div>
    )}
    {p.skills.length > SKILL_PAGE_SIZE && (
      <SecOctoPager
        total={p.skills.length}
        state={{ page: p.skillPage, size: SKILL_PAGE_SIZE }}
        onChange={p.onSkillPageChange}
        onSizeChange={() => { /* size 固定 */ }}
        sizeOptions={[SKILL_PAGE_SIZE]}
      />
    )}

    <div className="border-t border-theme-border my-3"></div>

    <div className="text-[11px] font-semibold text-theme-text-faint mb-2">产出 Proposal</div>
    {p.pagedProposals.length === 0 ? (
      <div className="py-4 text-center text-theme-text-faint text-xs">暂无进化提案</div>
    ) : (
      <div className="space-y-1">
        {p.pagedProposals.map((pr) => {
          const meta = proposalStatusMeta(pr.status);
          return (
            <div key={pr.id} className="flex items-center gap-2 px-2 py-1 rounded-md border border-theme-border">
              <span className="text-brand-primary">🔀</span>
              <span className="text-xs text-theme-text-primary truncate flex-1" title={pr.skill_name || pr.skill_full_name || pr.full_name || ''}>
                {pr.skill_name || pr.skill_full_name || pr.full_name || '—'}
              </span>
              {pr.branch && <span className="text-[10px] text-theme-text-faint font-mono">{pr.branch}</span>}
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${meta.cls}`}>{meta.label}</span>
              <span className="text-[10px] text-theme-text-faint">{fmtTimeCompact(pr.created_at)}</span>
            </div>
          );
        })}
      </div>
    )}
    {p.proposals.length > PROPOSAL_PAGE_SIZE && (
      <div className="mt-2">
        <SecOctoPager
          total={p.proposals.length}
          state={{ page: p.proposalPage, size: PROPOSAL_PAGE_SIZE }}
          onChange={p.onProposalPageChange}
          onSizeChange={() => { /* size 固定 */ }}
          sizeOptions={[PROPOSAL_PAGE_SIZE]}
        />
      </div>
    )}
  </section>
);

/* ===================== Quadrant 3: Knowledge & Feedback ===================== */

const KnowledgeFeedbackQuadrant: React.FC<{
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  cards: SecOctoTaskWikiCard[];
  feedbacks: SecOctoTaskFeedback[];
  feedbackContent: string;
  onFeedbackContentChange: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}> = (p) => (
  <section ref={p.containerRef} className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <h3 className="text-sm font-semibold text-theme-text-primary mb-3">
      知识与反馈 <span className="ml-1 text-theme-text-faint font-normal">{p.cards.length} 卡 / {p.feedbacks.length} 反馈</span>
    </h3>

    <div className="text-[11px] font-semibold text-theme-text-faint mb-2">关联卡片</div>
    {p.cards.length === 0 ? (
      <div className="py-3 text-center text-theme-text-faint text-xs mb-3">暂无关联卡片</div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {p.cards.map((c) => (
          <div key={c.id} className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-bg-elevated/40">
            <div className="text-xs font-semibold text-theme-text-primary truncate" title={c.title}>{c.title}</div>
            {c.tags && c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {c.tags.slice(0, 4).map((t) => (
                  <span key={t} className="px-1 py-px text-[9px] rounded bg-brand-soft text-brand-primary">{t}</span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-theme-text-faint mt-0.5">{fmtTimeCompact(c.created_at)}</div>
          </div>
        ))}
      </div>
    )}

    <div className="border-t border-theme-border my-3"></div>

    <div className="text-[11px] font-semibold text-theme-text-faint mb-2">反馈记录</div>
    {p.feedbacks.length === 0 ? (
      <div className="py-3 text-center text-theme-text-faint text-xs mb-3">暂无反馈记录</div>
    ) : (
      <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
        {p.feedbacks.map((fb, i) => {
          const isHuman = fb.source === 'human';
          return (
            <div key={fb.id ?? i} className="px-2 py-1.5 rounded-md border border-theme-border text-xs">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${isHuman ? 'bg-blue-500/15 text-blue-700' : 'bg-theme-bg-elevated text-theme-text-secondary'}`}>
                  {isHuman ? '👤 人工反馈' : '🤖 系统反馈'}
                </span>
                <span className="text-[10px] text-theme-text-faint">{fmtTimeCompact(fb.created_at)}</span>
              </div>
              <div className="text-theme-text-secondary whitespace-pre-wrap break-words">{fb.content || fb.notes || ''}</div>
              {fb.annotations && Object.keys(fb.annotations).length > 0 && (
                <div className="text-[10px] text-theme-text-faint mt-1">
                  {Object.entries(fb.annotations).map(([k, v]) => `${k}=${v}`).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}

    <div className="border-t border-theme-border my-3"></div>

    <div className="text-[11px] font-semibold text-theme-text-faint mb-2">提交反馈</div>
    <textarea
      value={p.feedbackContent}
      onChange={(e) => p.onFeedbackContentChange(e.target.value)}
      placeholder="输入反馈内容..."
      rows={3}
      className="w-full px-2.5 py-1.5 rounded-md text-xs border border-theme-border bg-theme-bg-elevated text-theme-text-primary placeholder-theme-text-faint focus:outline-none focus:border-brand-primary resize-none"
    />
    {p.error && <div className="text-[11px] text-red-600 mt-1">{p.error}</div>}
    <button
      disabled={p.submitting}
      onClick={p.onSubmit}
      className="mt-2 px-3 py-1 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse disabled:opacity-50 transition-colors"
    >
      {p.submitting ? '提交中…' : '提交反馈'}
    </button>
  </section>
);

/* ===================== Quadrant 4: Score Radar ===================== */

const ScoreQuadrant: React.FC<{
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  score: number | null | undefined;
  scoreCls: string;
  radarValues: number[];
  radarMax: number;
  reasoning?: string;
  createdAt?: string;
  duration: string;
  traceUrl?: string;
  bundleUrl?: string;
}> = (p) => (
  <section ref={p.containerRef} className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-theme-text-primary">评分维度</h3>
      <span className="text-xs text-theme-text-faint">
        <span className={`px-2 py-0.5 rounded-md text-sm font-bold ${p.scoreCls}`}>{p.score == null ? '-' : p.score}</span>
        <span className="ml-1">/100</span>
      </span>
    </div>
    <div className="flex justify-center my-2">
      <RadarChart values={p.radarValues} labels={SCORE_DIMS} max={p.radarMax} />
    </div>
    {p.reasoning && (
      <div className="px-3 py-2 rounded-md bg-theme-bg-elevated/40 text-xs text-theme-text-secondary mb-2 whitespace-pre-wrap">
        {p.reasoning}
      </div>
    )}
    <div className="text-[11px] text-theme-text-faint space-y-1">
      <div>创建 {fmtTimeCompact(p.createdAt)} · 耗时 {p.duration}</div>
      <div>
        {p.traceUrl && p.traceUrl !== '#' ? (
          <a href={p.traceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-primary hover:underline">
            查看执行日志 <ExternalLink size={10} />
          </a>
        ) : (
          <span>执行日志暂未关联</span>
        )}
      </div>
      <div>
        {p.bundleUrl && p.bundleUrl !== '#' ? (
          <a href={p.bundleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-primary hover:underline">
            查看任务上下文 <ExternalLink size={10} />
          </a>
        ) : (
          <span>任务上下文暂未关联</span>
        )}
      </div>
    </div>
  </section>
);

// fmtCount 在 stats jump 上没用到,但保留 import 避免后续动这个 quadrant 时再加;若 lint
// 严格 no-unused-imports 可移除
void fmtCount;
