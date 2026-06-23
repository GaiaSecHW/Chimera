import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Network, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { api } from '../clients/api';
import {
  IN_PROGRESS_STATUSES,
  buildCodemapTaskId,
} from '../clients/codemapManager';
import type {
  CodemapAuditSources,
  CodemapTaskStatus,
} from '../clients/codemapManager';

// 详情对话框里的「知识图谱」框:把静态分析 / 入口分析 / 调用链修复的进展与信息
// 集中到一处,从上到下三块,仿「基础信息」的栅格 + 徽章排版。数据走 manager:
//  - 静态分析 / 修复进度 / 入口数:复用调用方已有的 task status(props.status)。
//  - 入口识别分桶:本组件自拉 GET /uploads/{id}/audit/sources(直连 DozerDB,不起 serve)。
// 失败态智能文案:attack_status=failed 但已识别 N 个入口(用户手动重跑过)时,
// 显示「已识别 N(上次自动识别报错,当前为最新结果)」而非冷冰冰的「失败」。

interface KnowledgeGraphPanelProps {
  uploadId: string;
  status: CodemapTaskStatus | null;
}

const pillBase =
  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium';
const toneSuccess = 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
const toneProgress = 'border-sky-500/20 bg-sky-500/15 text-sky-400';
const toneWarn = 'border-amber-500/20 bg-amber-500/15 text-amber-400';
const toneFail = 'border-rose-500/20 bg-rose-500/15 text-rose-400';
const toneNeutral = 'border-theme-border bg-theme-elevated text-theme-text-muted';
const labelCls =
  'text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted';

const Pill: React.FC<{ tone: string; children: React.ReactNode; title?: string }> = ({
  tone,
  children,
  title,
}) => (
  <span title={title} className={`${pillBase} ${tone}`}>
    {children}
  </span>
);

export const KnowledgeGraphPanel: React.FC<KnowledgeGraphPanelProps> = ({
  uploadId,
  status,
}) => {
  const [audit, setAudit] = useState<CodemapAuditSources | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [reidentifying, setReidentifying] = useState(false);
  const [rerepairing, setRerepairing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 本地乐观态:点重跑后立刻把对应子阶段标成进行中,直到下一次 task 轮询覆盖。
  const [localStatus, setLocalStatus] = useState<CodemapTaskStatus | null>(null);

  const effective = localStatus ?? status;

  const loadAudit = useCallback(async () => {
    try {
      const a = await api.codemapManager.getAuditSources(uploadId);
      setAudit(a);
      setAuditError(null);
    } catch (error) {
      // 图还没建好(404 / graph 不可读)时 audit 拿不到,不算硬错误,留空即可。
      if ((error as any)?.status === 404) {
        setAudit(null);
        return;
      }
      setAuditError((error as any)?.message || '加载入口识别信息失败');
    }
  }, [uploadId]);

  // 打开时拉一次;task 处于进行中状态则跟随 3s 轮询刷新规模与分桶。
  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const inProgress = effective ? IN_PROGRESS_STATUSES.has(effective.status) : false;
  useEffect(() => {
    if (!inProgress) return undefined;
    const timer = window.setInterval(() => {
      void loadAudit();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [inProgress, loadAudit]);

  // status prop 变化(外层轮询拿到新 task)时,清掉乐观态以外层为准。
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      setLocalStatus(null);
    }
  }, [status]);

  const handleReidentify = async () => {
    if (reidentifying) return;
    setReidentifying(true);
    setActionError(null);
    try {
      await api.codemapManager.reidentify(uploadId);
      // 乐观:攻击面阶段标 running,跟随轮询。
      setLocalStatus((cur) => {
        const base = cur ?? status;
        if (!base) return base ?? null;
        return { ...base, attack: { status: 'running', entries: base.attack?.entries ?? 0 } };
      });
    } catch (error) {
      setActionError((error as any)?.message || '触发重跑攻击入口分析失败');
    } finally {
      setReidentifying(false);
    }
  };

  const handleRerepair = async () => {
    if (rerepairing) return;
    setRerepairing(true);
    setActionError(null);
    try {
      await api.codemapManager.rerepair(uploadId);
      // 乐观:整体状态标 building_repair,跟随轮询。
      setLocalStatus((cur) => {
        const base = cur ?? status;
        if (!base) return base ?? null;
        return { ...base, status: 'building_repair' };
      });
    } catch (error) {
      setActionError((error as any)?.message || '触发重跑 repair 失败');
    } finally {
      setRerepairing(false);
    }
  };

  if (!effective) {
    return (
      <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Network size={16} /> 知识图谱
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-center text-sm text-theme-text-muted">
          知识图谱任务尚未派发。
        </div>
      </section>
    );
  }

  const s = effective.status;
  const progress = effective.progress;
  const hasRepairProgress = !!progress && progress.total > 0;
  const analysis = audit?.analysis;

  // ① 静态分析:building_analyze=进行中;到了攻击面/修复/完成都意味着静态已成功;
  //    failed 且无任何 repair 进度=静态分析失败。
  const staticDone =
    s === 'building_attack_surface' ||
    s === 'building_repair' ||
    s === 'completed' ||
    hasRepairProgress;
  const staticFailed = s === 'failed' && !hasRepairProgress;
  const funcCount = audit?.total ?? 0;

  // ② 入口分析:attack.status 为主,但「已识别数」以图为准(audit.analysis.identified
  //    优先,回退 attack.entries)。failed 但 identified>0 → 友好文案。
  const attackStatus = effective.attack?.status ?? null;
  const identified = analysis?.identified ?? effective.attack?.entries ?? 0;
  const attackRecoverable = attackStatus === 'failed' && identified > 0;

  // ③ 调用链修复:有 progress 即展示进度条。
  const repairTotal = progress?.total ?? 0;
  const repairDone = progress?.completed ?? 0;
  const repairFailed = progress?.failed ?? 0;
  const repairPct = repairTotal > 0 ? Math.round((repairDone / repairTotal) * 100) : 0;

  // 重跑按钮在任一构建阶段进行中时禁用(后端也会 409 兜底)。
  const busy = IN_PROGRESS_STATUSES.has(s);

  return (
    <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
        <Network size={16} /> 知识图谱
      </div>

      <div className="mt-4 space-y-4">
        {/* ① 静态分析 */}
        <div className="grid gap-2 md:grid-cols-[8rem_1fr] md:items-center">
          <div className={labelCls}>静态分析</div>
          <div className="flex flex-wrap items-center gap-3">
            {s === 'building_analyze' || s === 'queued' || s === 'accepted' ? (
              <Pill tone={toneProgress}>
                <Loader2 size={12} className="animate-spin" /> 分析中
              </Pill>
            ) : staticFailed ? (
              <Pill tone={toneFail} title={effective.error || undefined}>
                失败
              </Pill>
            ) : staticDone ? (
              <Pill tone={toneSuccess}>成功</Pill>
            ) : (
              <Pill tone={toneNeutral}>{s}</Pill>
            )}
            {funcCount > 0 ? (
              <span className="text-sm font-semibold text-theme-text-secondary">
                函数 {funcCount}
              </span>
            ) : null}
          </div>
        </div>

        {/* ② 入口分析 */}
        <div className="grid gap-2 md:grid-cols-[8rem_1fr] md:items-center">
          <div className={labelCls}>入口分析</div>
          <div className="flex flex-wrap items-center gap-3">
            {attackStatus === 'running' ? (
              <Pill tone={toneProgress}>
                <Loader2 size={12} className="animate-spin" /> 识别中
              </Pill>
            ) : attackRecoverable ? (
              <Pill
                tone={toneWarn}
                title="上次自动识别报错,以下为当前图中最新结果"
              >
                已识别 {identified}（上次识别报错）
              </Pill>
            ) : attackStatus === 'failed' ? (
              <Pill tone={toneFail}>识别失败</Pill>
            ) : attackStatus === 'ok' ? (
              <Pill tone={toneSuccess}>识别结束</Pill>
            ) : (
              <Pill tone={toneNeutral}>未开始</Pill>
            )}
            {analysis ? (
              <span className="text-sm font-semibold text-theme-text-secondary">
                已识别 {analysis.identified} · 待判 {analysis.pending}
                {analysis.confirmed > 0 ? ` · 人工确认 ${analysis.confirmed}` : ''}
                {analysis.rejected > 0 ? ` · 已否决 ${analysis.rejected}` : ''}
              </span>
            ) : identified > 0 ? (
              <span className="text-sm font-semibold text-theme-text-secondary">
                已识别 {identified}
              </span>
            ) : null}
          </div>
        </div>

        {/* ③ 调用链修复 */}
        <div className="grid gap-2 md:grid-cols-[8rem_1fr] md:items-start">
          <div className={`${labelCls} md:pt-1.5`}>调用链修复</div>
          <div>
            {hasRepairProgress ? (
              <>
                <div className="flex items-center justify-between text-sm font-semibold text-theme-text-secondary">
                  <span>
                    修复 {repairDone}/{repairTotal}
                    {repairFailed > 0 ? ` · 失败 ${repairFailed}` : ''}
                  </span>
                  <span className="text-theme-text-muted">{repairPct}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-theme-elevated">
                  <div
                    className={`h-2 rounded-full ${
                      s === 'failed' ? 'bg-amber-400' : 'bg-sky-400'
                    }`}
                    style={{ width: `${repairPct}%` }}
                  />
                </div>
              </>
            ) : s === 'building_repair' ? (
              <Pill tone={toneProgress}>
                <Loader2 size={12} className="animate-spin" /> 修复启动中
              </Pill>
            ) : (
              <span className="text-sm text-theme-text-muted">暂无修复进度</span>
            )}
          </div>
        </div>
      </div>

      {/* 重跑按钮:两个独立动作 */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-theme-border pt-4">
        <button
          type="button"
          onClick={() => { void handleReidentify(); }}
          disabled={reidentifying || busy}
          title={busy ? '构建进行中,暂不可重跑' : '只重跑攻击入口识别,不影响调用链修复'}
          className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reidentifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {reidentifying ? '触发中…' : '重跑攻击入口分析'}
        </button>
        <button
          type="button"
          onClick={() => { void handleRerepair(); }}
          disabled={rerepairing || busy}
          title={busy ? '构建进行中,暂不可重跑' : '只重跑调用链修复,跳过静态分析,已修复的跳过'}
          className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rerepairing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
          {rerepairing ? '触发中…' : '重跑 repair'}
        </button>
        <button
          type="button"
          onClick={() => { void loadAudit(); }}
          title="刷新入口识别信息"
          className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
        >
          <RefreshCw size={14} />
          刷新
        </button>
        {actionError ? (
          <span className="text-xs font-semibold text-rose-400">{actionError}</span>
        ) : null}
        {auditError ? (
          <span className="text-xs font-semibold text-amber-400">{auditError}</span>
        ) : null}
      </div>
    </section>
  );
};
