import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { CodemapTaskStatus } from '../clients/codemapManager';

// 测试对象「代码」行的地铁风格三段进度条:静态分析 → 入口分析 → 调用链修复。
// 居中放进一个带「知识图谱构建进度」标题的小框里。每段一个圆点:进行中=蓝圈
// 转圈、完成=绿圈勾、失败=红圈叉、未开始=灰圈;段间连线在前一段完成时变绿。
// 纯展示(操作按钮已收进详情页「知识图谱」框)。
type StageState = 'pending' | 'active' | 'done' | 'failed';

const STAGES = ['静态分析', '入口分析', '调用链修复'] as const;

const STATE_TEXT: Record<StageState, string> = {
  pending: '未开始',
  active: '进行中',
  done: '已完成',
  failed: '失败',
};

// 从 manager task 状态派生三段进度。
// 关键:manager 用单个顶层 status 表示"当前在跑哪个阶段",但 attack / repair 可被
// 独立重跑(两个独立按钮)。重跑入口分析会把顶层 status 抢成 building_attack_surface,
// 因此 attack 段与 repair 段都不能依赖顶层 status 判断对方,各自只看自己的权威信号:
// - 静态分析:到了攻击面/修复/完成都意味着已成功;queued/accepted/building_analyze
//   进行中;failed 且无攻击面、无修复进度=静态失败。
// - 入口分析:看 attack.status(权威,重跑只动它);running/building_attack_surface
//   进行中,ok 完成,failed 失败。
// - 调用链修复:看 progress 计数(权威),不看顶层 status——否则重跑入口把 status 抢走
//   时会被误判。building_repair 进行中;有进度时按 completed===total 判 done,
//   否则若 status 显式 failed 则 failed,其余视为仍在修复(active)。
function deriveStages(status: CodemapTaskStatus | null): StageState[] {
  if (!status) return ['pending', 'pending', 'pending'];
  // SS4: 顶层阶段信号读 overall(aggregate_overall);回退 status 兼容旧后端。
  // attack/repair 仍各看自己的权威信号(重跑只动子阶段,不动 overall 主线)。
  const s = status.overall ?? status.status;
  const prog = status.progress;
  const hasRepair = !!prog && prog.total > 0;
  const repairAllProcessed = hasRepair && (prog!.completed + prog!.failed) >= prog!.total;
  const attack = status.attack?.status ?? null;
  // repair 失败信号:后端把 repair 退出失败记到 task.error("repair failed")。repair
  // 进程异常退出(被杀/崩溃)时 progress 计数填不满(completed+failed<total),不能据
  // 此判"仍在修复",必须结合 error / 是否已离开 repair 阶段判终态。
  const repairErrored = /repair/i.test(status.error || '');

  let st1: StageState;
  if (s === 'queued' || s === 'accepted' || s === 'building_analyze') st1 = 'active';
  else if (s === 'failed' && !hasRepair && !attack) st1 = 'failed';
  else st1 = 'done';

  let st2: StageState;
  if (st1 !== 'done') st2 = 'pending';
  // attack.status 是入口分析的权威信号(重跑入口分析只动 attack.status,顶层 status
  // 会被抢成 building_attack_surface)。优先信任它,与详情页 KnowledgeGraphPanel 同口径。
  // SS3: ok→done 改名,两者都认(过渡兼容)。
  else if (attack === 'done' || attack === 'ok') st2 = 'done';
  // 部分识别完成:attack 报失败但图中已有入口(entries>0)。结果可用 → 视觉判完成,
  // 后端仍 failed(reconciler 据此自动重跑),仅 tooltip 文案区分(见组件 stageLabel)。
  else if (attack === 'failed' && (status.attack?.entries ?? 0) > 0) st2 = 'done';
  else if (attack === 'failed') st2 = 'failed';
  else if (attack === 'running' || s === 'building_attack_surface') st2 = 'active';
  else st2 = 'pending';

  let st3: StageState;
  if (st1 !== 'done') st3 = 'pending';
  // repair 进程只在 building_repair 态运行;一旦顶层 status 离开该态,repair 就已停止
  // (正常结束 / 失败退出 / 被入口重跑抢走 status),绝不能再显示 active 转圈。
  else if (s === 'building_repair') st3 = 'active';
  // 部分修复完成:repair 已停且后端报失败,但已成功修复 >1 个函数(progress.completed)。
  // 结果可用 → 视觉判完成,后端仍 failed(reconciler 据此自动重派),仅 tooltip 文案区分
  // (见组件 stageLabel)。先于下面的失败判定,否则 error/failed 计数会把它压成红叉。
  else if (hasRepair && (prog!.completed ?? 0) > 1) st3 = 'done';
  // 已离开 building_repair:repair 不在跑了,按终态判。
  // - error 标记 repair 失败(异常退出,计数可能没填满)→ 失败
  // - 有失败计数 → 部分失败
  // - 进度全部处理完且无失败 → 完成
  // - completed 态(空图等无进度场景)→ 完成
  else if (repairErrored) st3 = 'failed';
  else if (hasRepair && prog!.failed > 0) st3 = 'failed';
  else if (repairAllProcessed) st3 = 'done';
  else if (s === 'completed') st3 = 'done';
  else if (s === 'failed') st3 = 'failed';
  // 尚无任何修复信号(static/attack 刚完成、repair 还没起)→ 未开始。
  else st3 = 'pending';

  return [st1, st2, st3];
}

const NODE_CLS: Record<StageState, string> = {
  done: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-400',
  active: 'border-sky-400/70 bg-sky-500/15 text-sky-400 ring-2 ring-sky-400/20',
  failed: 'border-rose-400/70 bg-rose-500/15 text-rose-400',
  pending: 'border-theme-border bg-theme-surface text-theme-text-faint',
};

const LABEL_CLS: Record<StageState, string> = {
  done: 'text-emerald-400',
  active: 'text-sky-400',
  failed: 'text-rose-400',
  pending: 'text-theme-text-muted',
};

const Node: React.FC<{ state: StageState }> = ({ state }) => {
  const base = `flex h-6 w-6 flex-none items-center justify-center rounded-full border transition-colors ${NODE_CLS[state]}`;
  if (state === 'done') return <span className={base}><Check size={13} strokeWidth={2.5} /></span>;
  if (state === 'active') return <span className={base}><Loader2 size={13} className="animate-spin" /></span>;
  if (state === 'failed') return <span className={base}><X size={13} strokeWidth={2.5} /></span>;
  return <span className={base}><span className="h-1.5 w-1.5 rounded-full bg-theme-text-faint" /></span>;
};

export const CodemapMetroProgress: React.FC<{ status: CodemapTaskStatus | null }> = ({ status }) => {
  const stages = deriveStages(status);
  // 入口段「部分识别完成」:attack 报失败但图中已有入口。st2 已判 done(绿勾),这里
  // 让 tooltip 文案如实区分,不写成纯「已完成」。
  const attackPartial =
    status?.attack?.status === 'failed' && (status?.attack?.entries ?? 0) > 0;
  // 修复段「部分修复完成」:repair 已停且有失败信号(error含repair / failed计数 /
  // overall=failed),但已成功修复 >1 个函数。st3 已判 done,tooltip 文案区分。
  const _s = status?.overall ?? status?.status;
  const _prog = status?.progress;
  const repairFailSignal =
    /repair/i.test(status?.error || '') || (_prog?.failed ?? 0) > 0 || _s === 'failed';
  const repairPartial =
    _s !== 'building_repair' && !!_prog && _prog.total > 0 &&
    (_prog.completed ?? 0) > 1 && repairFailSignal;
  const stageLabel = (i: number): string => {
    if (i === 1 && attackPartial && stages[1] === 'done') return '部分识别完成';
    if (i === 2 && repairPartial && stages[2] === 'done') return '部分修复完成';
    return STATE_TEXT[stages[i]];
  };
  const tip = `知识图谱构建进度 — ${STAGES.map((l, i) => `${l}:${stageLabel(i)}`).join(' · ')}`;
  const lineCls = (done: boolean) =>
    `h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-400/70' : 'bg-theme-border'}`;
  // 每段一等宽列:圆点与标签各自在列内居中 → 上下必然左右对齐。连线拆成左右两
  // 半段拼接,首列左半 / 末列右半 invisible 占位,保证圆点恒在列中心。
  return (
    <div className="mx-auto grid w-48 grid-cols-3" title={tip}>
      {STAGES.map((label, i) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div className={i === 0 ? 'flex-1 invisible' : lineCls(stages[i - 1] === 'done')} />
            <Node state={stages[i]} />
            <div className={i === 2 ? 'flex-1 invisible' : lineCls(stages[i] === 'done')} />
          </div>
          <span className={`text-center text-[10px] font-medium leading-none whitespace-nowrap ${LABEL_CLS[stages[i]]}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
};
