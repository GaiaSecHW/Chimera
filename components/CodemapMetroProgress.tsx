import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { CodemapTaskStatus } from '../clients/codemapManager';

// 测试对象「代码」行的地铁风格三段进度条:静态分析 → 入口分析 → 调用链修复。
// 每段一个圆点:进行中=蓝圈转圈、完成=绿圈勾、失败=红圈叉、未开始=灰圈;段间连线
// 在前一段完成时变绿。纯展示(操作按钮已收进详情页「知识图谱」框)。
type StageState = 'pending' | 'active' | 'done' | 'failed';

const STAGES = ['静态分析', '入口分析', '调用链修复'] as const;

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
  else if (s === 'building_attack_surface' || attack === 'running') st2 = 'active';
  else if (attack === 'ok') st2 = 'done';
  else if (attack === 'failed') st2 = 'failed';
  else st2 = 'pending';

  let st3: StageState;
  if (st1 !== 'done') st3 = 'pending';
  else if (s === 'building_repair') st3 = 'active';
  else if (s === 'completed' && hasRepair) st3 = 'done';
  else if (s === 'failed' && hasRepair) st3 = 'failed';
  else st3 = 'pending';

  return [st1, st2, st3];
}

const Node: React.FC<{ state: StageState }> = ({ state }) => {
  const base = 'flex h-5 w-5 flex-none items-center justify-center rounded-full border';
  if (state === 'done') {
    return <span className={`${base} border-emerald-400 bg-emerald-500/20 text-emerald-400`}><Check size={12} /></span>;
  }
  if (state === 'active') {
    return <span className={`${base} border-sky-400 bg-sky-500/20 text-sky-400`}><Loader2 size={12} className="animate-spin" /></span>;
  }
  if (state === 'failed') {
    return <span className={`${base} border-rose-400 bg-rose-500/20 text-rose-400`}><X size={12} /></span>;
  }
  return (
    <span className={`${base} border-theme-border bg-theme-elevated`}>
      <span className="h-1.5 w-1.5 rounded-full bg-theme-text-faint" />
    </span>
  );
};

export const CodemapMetroProgress: React.FC<{ status: CodemapTaskStatus | null }> = ({ status }) => {
  const stages = deriveStages(status);
  return (
    <div
      className="flex items-center"
      title="知识图谱构建进度:静态分析 → 入口分析 → 调用链修复"
    >
      {STAGES.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 ? (
            <div className={`mb-4 h-0.5 w-5 flex-none ${stages[i - 1] === 'done' ? 'bg-emerald-400' : 'bg-theme-border'}`} />
          ) : null}
          <div className="flex flex-col items-center gap-1">
            <Node state={stages[i]} />
            <span className="text-[10px] leading-none text-theme-text-muted whitespace-nowrap">{label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
