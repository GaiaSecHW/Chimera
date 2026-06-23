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
// - 静态分析:到了攻击面/修复/完成都意味着已成功;queued/accepted/building_analyze
//   进行中;failed 且无攻击面、无修复进度=静态失败。
// - 入口分析:building_attack_surface 或 attack.status=running 进行中;ok 完成;
//   failed 失败;静态未完成时不亮。
// - 调用链修复:building_repair 进行中;completed+有修复进度 完成;failed+有修复
//   进度 失败(部分成功)。
function deriveStages(status: CodemapTaskStatus | null): StageState[] {
  if (!status) return ['pending', 'pending', 'pending'];
  const s = status.status;
  const hasRepair = !!status.progress && status.progress.total > 0;
  const attack = status.attack?.status ?? null;

  let st1: StageState;
  if (s === 'queued' || s === 'accepted' || s === 'building_analyze') st1 = 'active';
  else if (s === 'failed' && !hasRepair && !attack) st1 = 'failed';
  else st1 = 'done';

  let st2: StageState;
  if (st1 !== 'done') st2 = 'pending';
  // attack.status 是入口分析的权威信号(重跑入口分析只动 attack.status,不动顶层
  // status),优先信任它——与详情页 KnowledgeGraphPanel 同口径,两处统一。仅当还没有
  // attack 结果时才回退到 building_attack_surface 顶层 status,避免顶层 status 滞留在
  // building_attack_surface(重跑后没人推回)时在已完成的入口分析上仍转圈。
  else if (attack === 'ok') st2 = 'done';
  else if (attack === 'failed') st2 = 'failed';
  else if (s === 'building_attack_surface' || attack === 'running') st2 = 'active';
  else st2 = 'pending';

  let st3: StageState;
  if (st1 !== 'done') st3 = 'pending';
  else if (s === 'completed' && hasRepair) st3 = 'done';
  else if (s === 'failed' && hasRepair) st3 = 'failed';
  else if (s === 'building_repair') st3 = 'active';
  // 顶层 status 滞留在 repair 之前(同上一类陈旧 status)但 repair 已产出进度:计数是
  // 真实的,按 done/failed 显示而非未开始。
  else if (hasRepair) st3 = s === 'failed' ? 'failed' : 'done';
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
  const tip = `知识图谱构建进度 — ${STAGES.map((l, i) => `${l}:${STATE_TEXT[stages[i]]}`).join(' · ')}`;
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
