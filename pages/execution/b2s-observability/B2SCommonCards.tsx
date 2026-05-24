import React from 'react';

export type B2SCardTone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export const tileTone = (tone: B2SCardTone = 'slate') => {
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

export const MetricTile: React.FC<{
  label: string;
  value: string | number | React.ReactNode;
  hint?: string;
  tone?: B2SCardTone;
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'slate', icon }) => (
  <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${tileTone(tone)}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{label}</div>
        <div className="mt-0.5 break-words text-xl font-black tracking-tight">{value}</div>
      </div>
      {icon ? <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">{icon}</div> : null}
    </div>
    {hint ? <div className="mt-1 truncate text-[11px] font-semibold opacity-70" title={hint}>{hint}</div> : null}
  </div>
);

export const SectionCard: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, description, children, right }) => (
  <section className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[11px] text-slate-500">{description}</p> : null}
      </div>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);
