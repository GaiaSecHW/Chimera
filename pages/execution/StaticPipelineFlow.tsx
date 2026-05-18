import React from 'react';
import { ArrowRight, GitBranch, ShieldCheck } from 'lucide-react';

type FlowTone = 'analysis' | 'review' | 'artifact' | 'guard';

type FlowStep = {
  id: string;
  title: string;
  desc: string;
  badge?: string;
  tone?: FlowTone;
};

type FlowLane = {
  label: string;
  steps: FlowStep[];
};

type FlowNote = {
  title: string;
  detail: string;
  tone?: FlowTone;
};

const STEP_TONE_CLASS: Record<FlowTone, string> = {
  analysis: 'border-cyan-200 bg-cyan-50/80',
  review: 'border-amber-200 bg-amber-50/90',
  artifact: 'border-emerald-200 bg-emerald-50/85',
  guard: 'border-violet-200 bg-violet-50/85',
};

const NOTE_TONE_CLASS: Record<FlowTone, string> = {
  analysis: 'border-cyan-100 bg-cyan-50/70 text-cyan-900',
  review: 'border-amber-100 bg-amber-50/80 text-amber-900',
  artifact: 'border-emerald-100 bg-emerald-50/80 text-emerald-900',
  guard: 'border-violet-100 bg-violet-50/80 text-violet-900',
};

const toneClass = (tone?: FlowTone) => tone ? STEP_TONE_CLASS[tone] : 'border-slate-200 bg-white';
const noteClass = (tone?: FlowTone) => tone ? NOTE_TONE_CLASS[tone] : 'border-slate-200 bg-slate-50/80 text-slate-800';

export const StaticPipelineFlow: React.FC<{
  title: string;
  subtitle?: string;
  lanes: FlowLane[];
  notes?: FlowNote[];
  footer?: string;
}> = ({ title, subtitle, lanes, notes = [], footer }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-slate-600">
          <GitBranch size={12} />
          STATIC FLOW
        </div>
        <h2 className="mt-3 text-base font-black text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
        <ShieldCheck size={14} />
        静态阶段关系图
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {lanes.map((lane, laneIndex) => (
        <div key={lane.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black tracking-[0.14em] text-slate-600">
              LANE {laneIndex + 1}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black tracking-[0.12em] text-slate-600">
              {lane.label}
            </span>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            {lane.steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <article className={`min-w-[220px] flex-1 rounded-2xl border p-4 ${toneClass(step.tone)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Step {index + 1}
                      </p>
                      <p className="text-sm font-black text-slate-900">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{step.desc}</p>
                    </div>
                    {step.badge && (
                      <span className="shrink-0 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-slate-600">
                        {step.badge}
                      </span>
                    )}
                  </div>
                </article>
                {index < lane.steps.length - 1 && (
                  <>
                    <div className="hidden items-center justify-center px-1 text-slate-300 xl:flex">
                      <ArrowRight size={18} />
                    </div>
                    <div className="flex w-full items-center justify-center text-slate-300 xl:hidden">
                      <div className="flex items-center gap-2 rounded-full border border-dashed border-slate-200 bg-white px-3 py-1 text-[10px] font-black tracking-[0.12em] text-slate-400">
                        <ArrowRight size={12} />
                        NEXT
                      </div>
                    </div>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>

    {(notes.length > 0 || footer) && (
      <div className="mt-5 space-y-3">
        {notes.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            {notes.map((note) => (
              <div key={note.title} className={`rounded-2xl border p-4 ${noteClass(note.tone)}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">Note</p>
                <p className="mt-1 text-sm font-bold">{note.title}</p>
                <p className="mt-1 text-xs leading-5 opacity-90">{note.detail}</p>
              </div>
            ))}
          </div>
        )}
        {footer && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">{footer}</p>}
      </div>
    )}
  </section>
);
