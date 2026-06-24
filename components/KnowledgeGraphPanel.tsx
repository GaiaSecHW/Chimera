import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, Loader2, Network, RefreshCw, RotateCw, ShieldCheck, Wrench } from 'lucide-react';
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
// 集中到一处,从上到下三块,仿「基础信息」的栅格 + 徽章排版。数据全走 manager:
//  - task 状态(静态分析 / 入口阶段 / 修复进度):本组件自拉 getTaskStatus,props
//    传入的 status 仅作首屏种子(父组件缓存对重跑攻击入口不刷新,见下)。
//  - 入口识别分桶:自拉 GET /uploads/{id}/audit/sources(直连 DozerDB,不起 serve)。
// 失败态智能文案:attack_status=failed 但已识别 N 个入口(用户手动重跑过)时,
// 显示「已识别 N(上次自动识别报错,当前为最新结果)」而非冷冰冰的「失败」。

interface KnowledgeGraphPanelProps {
  uploadId: string;
  status: CodemapTaskStatus | null;
  usable?: boolean;
  // 打开知识图谱(起/复用 per-project serve,新标签页打开)。状态由父组件持有。
  onOpenServe?: () => void;
  openServeLoading?: boolean;
  openServeError?: string | null;
  // 从行内 chip 搬来的恢复动作:重新构建(静态失败)/ 更正代码目录(0 函数)/
  // 重试派发(triggerBuild 失败)。展示时机由 panel 按 effective 状态判断。
  onRebuild?: () => void;
  rebuilding?: boolean;
  onCorrect?: () => void;
  correcting?: boolean;
  onRetryDispatch?: () => void;
  retrying?: boolean;
  dispatchError?: string;
  // 把本组件自拉/乐观更新的权威 task 状态回传父组件,让其 codemapStatusByUpload
  // 缓存与地铁条同步、并触发父组件的 3s 轮询(重跑入口分析后关闭详情页,地铁条仍
  // 需转圈——否则父缓存陈旧,attack.status 永远停在 ok,门槛不触发,见下)。
  onStatusChange?: (status: CodemapTaskStatus) => void;
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

// 三阶段卡片:状态色 Pill(顶) + 主指标大字(中) + 次要指标小字(底),
// 三张等宽并排,卡片间用箭头连接(见 StageArrow)。done 态描边高亮。
const StageCard: React.FC<{
  label: string;
  done?: boolean;
  badge: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}> = ({ label, done, badge, primary, secondary }) => (
  <div
    className={`flex flex-1 flex-col gap-2 rounded-xl border p-3 ${
      done ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-theme-border bg-theme-elevated'
    }`}
  >
    <div className={labelCls}>{label}</div>
    <div className="flex flex-wrap items-center gap-2">{badge}</div>
    {primary ? (
      <div className="text-lg font-semibold leading-tight text-theme-text-primary tabular-nums">
        {primary}
      </div>
    ) : null}
    {secondary ? (
      <div className="text-xs text-theme-text-muted">{secondary}</div>
    ) : null}
  </div>
);

const StageArrow: React.FC = () => (
  <ChevronRight size={16} className="hidden shrink-0 self-center text-theme-text-muted md:block" />
);

export const KnowledgeGraphPanel: React.FC<KnowledgeGraphPanelProps> = ({
  uploadId,
  status,
  usable,
  onOpenServe,
  openServeLoading,
  openServeError,
  onRebuild,
  rebuilding,
  onCorrect,
  correcting,
  onRetryDispatch,
  retrying,
  dispatchError,
  onStatusChange,
}) => {
  const [audit, setAudit] = useState<CodemapAuditSources | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [reidentifying, setReidentifying] = useState(false);
  const [rerepairing, setRerepairing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 本组件自拉的 fresh task(权威源)。父组件传入的 status 仅作首屏种子——它来自
  // TestInputPage 的轮询缓存,而重跑攻击入口只改 attack_status 不动顶层 status,
  // 那个轮询门槛(IN_PROGRESS_STATUSES.has(status))不会触发,父缓存会一直陈旧。
  // 因此每次打开 panel 都自己 getTaskStatus 取真实状态,关闭重开也不丢。
  const [task, setTask] = useState<CodemapTaskStatus | null>(status);
  // 点重跑后的乐观态(后台线程异步,manager 可能还没翻 running)。一旦自拉的 task
  // 确认进入对应进行中态就清掉,改以真实 task 为准。
  const [localStatus, setLocalStatus] = useState<CodemapTaskStatus | null>(null);
  // 父组件每次渲染传入新的 onStatusChange 闭包;若直接进 loadTask 的依赖会让其
  // identity 每帧变化、把 mount/轮询 effect 拖进重建循环。用 ref 固定,loadTask 依赖
  // 保持稳定。
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const effective = localStatus ?? task ?? status;

  const loadTask = useCallback(async () => {
    try {
      const t = await api.codemapManager.getTaskStatus(buildCodemapTaskId(uploadId));
      setTask(t);
      onStatusChangeRef.current?.(t);
      // 后台已进入对应进行中态(攻击面 running / repair building_repair)→ 乐观态
      // 使命完成,撤掉,后续完全以真实 task 为准(含 running→ok/failed 的终态)。
      if (t.status === 'building_repair' || t.attack?.status === 'running') {
        setLocalStatus(null);
      }
      return t;
    } catch (error) {
      if ((error as any)?.status === 404) {
        setTask(null);
      }
      return null;
    }
  }, [uploadId]);

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

  // 打开时各拉一次真实状态(不靠父组件的陈旧 prop)。
  useEffect(() => {
    void loadTask();
    void loadAudit();
  }, [loadTask, loadAudit]);

  // 进行中判定:顶层 status 在进行态,或攻击面子阶段 running(reidentify 不移动
  // 顶层 status,必须单独把它纳入,否则重跑攻击面期间不会轮询)。
  const inProgress = !!effective && (
    IN_PROGRESS_STATUSES.has(effective.status) || effective.attack?.status === 'running'
  );
  useEffect(() => {
    if (!inProgress) return undefined;
    const timer = window.setInterval(() => {
      void loadTask();
      void loadAudit();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [inProgress, loadTask, loadAudit]);

  const handleReidentify = async () => {
    if (reidentifying) return;
    setReidentifying(true);
    setActionError(null);
    try {
      await api.codemapManager.reidentify(uploadId);
      // 乐观:攻击面阶段标 running,跟随轮询;随后 loadTask 拿到真实 running 即接管。
      const base = localStatus ?? task ?? status;
      if (base) {
        const next = { ...base, attack: { status: 'running', entries: base.attack?.entries ?? 0 } };
        setLocalStatus(next);
        onStatusChangeRef.current?.(next);   // 立即同步父缓存 → 地铁条转圈 + 父轮询启动
      }
      void loadTask();
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
      // 乐观:整体状态标 building_repair,跟随轮询;随后 loadTask 接管。
      const base = localStatus ?? task ?? status;
      if (base) {
        const next = { ...base, status: 'building_repair' };
        setLocalStatus(next);
        onStatusChangeRef.current?.(next);   // 立即同步父缓存 → 地铁条转圈 + 父轮询启动
      }
      void loadTask();
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
          {dispatchError
            ? '知识图谱构建派发失败。'
            : usable === false
              ? '上传尚未完成(未达可分析状态),完成后将自动派发知识图谱构建。'
              : '知识图谱任务尚未派发(稍候将自动触发)。'}
        </div>
        {dispatchError && onRetryDispatch ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-theme-border pt-4">
            <button
              type="button"
              onClick={() => onRetryDispatch()}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
              {retrying ? '重试中…' : '重试派发'}
            </button>
            <span className="text-xs font-semibold text-rose-400" title={dispatchError}>{dispatchError}</span>
          </div>
        ) : null}
      </section>
    );
  }

  const s = effective.status;
  const progress = effective.progress;
  const hasRepairProgress = !!progress && progress.total > 0;
  const analysis = audit?.analysis;
  const scale = audit?.scale;

  // ① 静态分析:building_analyze=进行中;到了攻击面/修复/完成都意味着静态已成功;
  //    failed 且无任何 repair 进度=静态分析失败。规模以 scale 为准(真实 Function/
  //    File 数);旧版误用 audit.total(SourcePoint 条数)当函数数,与入口识别的
  //    identified 同源——多数 SP 判为入口时两数相等,故彻底改读 scale.functions。
  const staticDone =
    s === 'building_attack_surface' ||
    s === 'building_repair' ||
    s === 'completed' ||
    hasRepairProgress;
  const staticFailed = s === 'failed' && !hasRepairProgress;
  const funcCount = scale?.functions ?? 0;
  const fileCount = scale?.files ?? 0;

  // ② 入口分析:attack.status 为主,但「已识别数」以图为准(audit.analysis.identified
  //    优先,回退 attack.entries)。failed 但 identified>0 → 友好文案。
  const attackStatus = effective.attack?.status ?? null;
  const identified = analysis?.identified ?? effective.attack?.entries ?? 0;
  const attackRecoverable = attackStatus === 'failed' && identified > 0;

  // ③ 调用链修复:有 progress 即展示进度条。repairedEdges=本次修复 LLM 新建的
  //    CALLS 边数(scale.repaired_edges),与 source 完成度并列展示修复产物。
  const repairTotal = progress?.total ?? 0;
  const repairDone = progress?.completed ?? 0;
  const repairFailed = progress?.failed ?? 0;
  const repairPct = repairTotal > 0 ? Math.round((repairDone / repairTotal) * 100) : 0;
  const repairedEdges = scale?.repaired_edges ?? 0;

  // 重跑按钮在任一构建阶段进行中时禁用(后端也会 409 兜底)。
  const busy = IN_PROGRESS_STATUSES.has(s);
  // 恢复动作展示时机(从行内 chip 搬来):静态失败→重新构建;completed 但 0 函数
  // (silent-success 失败模式)→更正代码目录。
  const showRebuild = s === 'failed' && !hasRepairProgress && !!onRebuild;
  const showCorrect = s === 'completed' && !hasRepairProgress && !!onCorrect;
  const hasDbName = !!effective.db_name;

  return (
    <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
        <Network size={16} /> 知识图谱
      </div>

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-stretch">
        {/* ① 静态分析 */}
        <StageCard
          label="静态分析"
          done={staticDone}
          badge={
            s === 'building_analyze' || s === 'queued' || s === 'accepted' ? (
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
            )
          }
          primary={funcCount > 0 ? `函数 ${funcCount}` : null}
          secondary={funcCount > 0 ? `文件 ${fileCount}` : null}
        />

        <StageArrow />

        {/* ② 入口分析 */}
        <StageCard
          label="入口分析"
          done={attackStatus === 'ok'}
          badge={
            attackStatus === 'running' ? (
              <Pill tone={toneProgress}>
                <Loader2 size={12} className="animate-spin" /> 识别中
              </Pill>
            ) : attackRecoverable ? (
              <Pill tone={toneWarn} title="上次自动识别报错,以下为当前图中最新结果">
                结果可用（上次识别报错）
              </Pill>
            ) : attackStatus === 'failed' ? (
              <Pill tone={toneFail}>识别失败</Pill>
            ) : attackStatus === 'ok' ? (
              <Pill tone={toneSuccess}>识别结束</Pill>
            ) : (
              <Pill tone={toneNeutral}>未开始</Pill>
            )
          }
          primary={
            analysis || identified > 0 ? `已识别 ${analysis?.identified ?? identified}` : null
          }
          secondary={
            analysis ? (
              <>
                待判 {analysis.pending}
                {analysis.confirmed > 0 ? ` · 人工确认 ${analysis.confirmed}` : ''}
                {analysis.rejected > 0 ? ` · 已否决 ${analysis.rejected}` : ''}
              </>
            ) : null
          }
        />

        <StageArrow />

        {/* ③ 调用链修复 */}
        <StageCard
          label="调用链修复"
          done={hasRepairProgress && repairPct === 100}
          badge={
            hasRepairProgress ? (
              <Pill tone={s === 'failed' ? toneWarn : repairPct === 100 ? toneSuccess : toneProgress}>
                {repairPct}%
              </Pill>
            ) : s === 'building_repair' ? (
              <Pill tone={toneProgress}>
                <Loader2 size={12} className="animate-spin" /> 修复启动中
              </Pill>
            ) : (
              <Pill tone={toneNeutral}>暂无进度</Pill>
            )
          }
          primary={hasRepairProgress ? `修复 ${repairDone}/${repairTotal}` : null}
          secondary={
            hasRepairProgress ? (
              <>
                {repairedEdges > 0 ? `已修复 ${repairedEdges} 条边` : '已修复 0 条边'}
                {repairFailed > 0 ? ` · 失败 ${repairFailed}` : ''}
              </>
            ) : null
          }
        />
      </div>

      {/* 调用链修复进度条(有进度时贯穿底部) */}
      {hasRepairProgress ? (
        <div className="mt-3 h-1.5 rounded-full bg-theme-elevated">
          <div
            className={`h-1.5 rounded-full transition-[width] ${
              s === 'failed' ? 'bg-amber-400' : 'bg-sky-400'
            }`}
            style={{ width: `${repairPct}%` }}
          />
        </div>
      ) : null}

      {/* 操作区:打开知识图谱(主) + 两个独立重跑 + 恢复动作(重新构建/更正) */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-theme-border pt-4">
        {onOpenServe ? (
          <button
            type="button"
            onClick={() => onOpenServe()}
            disabled={!hasDbName || openServeLoading}
            title={!hasDbName ? '任务排队中,db_name 未分配' : '在新标签页打开 codemap_lite 知识图谱'}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-theme-border disabled:bg-theme-elevated disabled:text-theme-text-muted"
          >
            {openServeLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            {openServeLoading ? '启动中…' : '打开知识图谱'}
          </button>
        ) : null}
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
        {showRebuild ? (
          <button
            type="button"
            onClick={() => onRebuild?.()}
            disabled={rebuilding}
            title="静态分析失败,删除旧任务后用当前代码目录重新构建"
            className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rebuilding ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            {rebuilding ? '重派中…' : '重新构建'}
          </button>
        ) : null}
        {showCorrect ? (
          <button
            type="button"
            onClick={() => onCorrect?.()}
            disabled={correcting}
            title="图谱为空(0 函数),清掉旧空图后用正确代码目录重建"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {correcting ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            {correcting ? '更正中…' : '更正代码目录'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => { void loadAudit(); void loadTask(); }}
          title="刷新知识图谱状态与入口识别信息"
          className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
        >
          <RefreshCw size={14} />
          刷新
        </button>
        {actionError ? (
          <span className="text-xs font-semibold text-rose-400">{actionError}</span>
        ) : null}
        {openServeError ? (
          <span className="text-xs font-semibold text-rose-400">{openServeError}</span>
        ) : null}
        {auditError ? (
          <span className="text-xs font-semibold text-amber-400">{auditError}</span>
        ) : null}
      </div>
    </section>
  );
};
