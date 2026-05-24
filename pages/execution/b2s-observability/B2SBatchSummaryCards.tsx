import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Layers3, RotateCcw, XCircle } from 'lucide-react';

type Tone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export interface B2SBatchSummaryValue {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}

const tileTone = (tone: Tone = 'slate') => {
  const map = {
    slate: 'border-slate-200 bg-slate-50/90 text-slate-900',
    blue: 'border-blue-100 bg-blue-50/90 text-blue-900',
    emerald: 'border-emerald-100 bg-emerald-50/90 text-emerald-900',
    rose: 'border-rose-100 bg-rose-50/90 text-rose-900',
    amber: 'border-amber-100 bg-amber-50/90 text-amber-900',
    violet: 'border-violet-100 bg-violet-50/90 text-violet-900',
  } as const;
  return map[tone];
};

export const buildBatchSummaryCardItems = (summary: {
  total_batches: number;
  planned_total_batches?: number;
  materialized_total_batches?: number;
  running_batches: number;
  passed_batches: number;
  failed_batches: number;
  partial_batches: number;
  avg_attempts_per_batch: number;
  total_review_rounds?: number;
}): B2SBatchSummaryValue[] => ([
  {
    label: '计划 Batch',
    value: summary.planned_total_batches ?? summary.total_batches,
    hint: `已物化 ${summary.materialized_total_batches ?? summary.total_batches}`,
    tone: 'violet',
    icon: <Layers3 size={18} />,
  },
  { label: '运行中', value: summary.running_batches, tone: 'blue', icon: <Activity size={18} /> },
  { label: '已通过', value: summary.passed_batches, tone: 'emerald', icon: <CheckCircle2 size={18} /> },
  { label: '失败', value: summary.failed_batches, tone: 'rose', icon: <XCircle size={18} /> },
  { label: '部分完成', value: summary.partial_batches, tone: 'amber', icon: <AlertTriangle size={18} /> },
  { label: '平均 Attempt', value: summary.avg_attempts_per_batch || 0, hint: summary.total_review_rounds != null ? `Review ${summary.total_review_rounds}` : undefined, tone: 'slate', icon: <RotateCcw size={18} /> },
]);

export const B2SBatchSummaryCards: React.FC<{ items: B2SBatchSummaryValue[] }> = ({ items }) => (
  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
    {items.map((item) => (
      <div key={item.label} className={`min-w-0 rounded-xl border px-3 py-2.5 ${tileTone(item.tone)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{item.label}</div>
            <div className="mt-0.5 break-words text-xl font-black tracking-tight">{item.value}</div>
          </div>
          {item.icon ? <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">{item.icon}</div> : null}
        </div>
        {item.hint ? <div className="mt-1 truncate text-[11px] font-semibold opacity-70" title={item.hint}>{item.hint}</div> : null}
      </div>
    ))}
  </div>
);
