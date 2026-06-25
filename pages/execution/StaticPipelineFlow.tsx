import React from 'react';
import { ArrowRight, GitBranch, ShieldCheck } from 'lucide-react';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

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

const STEP_TONE_STYLES: Record<FlowTone, { border: string; bg: string }> = {
  analysis: { border: LK.info, bg: 'rgba(79, 140, 255, 0.12)' },
  review: { border: LK.warning, bg: 'rgba(213, 161, 58, 0.12)' },
  artifact: { border: LK.success, bg: 'rgba(69, 192, 111, 0.12)' },
  guard: { border: LK.primary, bg: 'rgba(79, 115, 255, 0.12)' },
};

const NOTE_TONE_STYLES: Record<FlowTone, { border: string; bg: string; color: string }> = {
  analysis: { border: LK.info, bg: 'rgba(79, 140, 255, 0.1)', color: LK.info },
  review: { border: LK.warning, bg: 'rgba(213, 161, 58, 0.12)', color: LK.warning },
  artifact: { border: LK.success, bg: 'rgba(69, 192, 111, 0.12)', color: LK.success },
  guard: { border: LK.primary, bg: 'rgba(79, 115, 255, 0.12)', color: LK.primary },
};

const stepStyles = (tone?: FlowTone) => {
  const s = tone ? STEP_TONE_STYLES[tone] : { border: LK.border, bg: LK.surface };
  return { border: s.border, backgroundColor: s.bg };
};

const noteStyles = (tone?: FlowTone) => {
  const s = tone ? NOTE_TONE_STYLES[tone] : { border: LK.border, bg: 'rgba(17, 26, 43, 0.5)', color: LK.ink };
  return { border: s.border, backgroundColor: s.bg, color: s.color };
};

export const StaticPipelineFlow: React.FC<{
  title: string;
  subtitle?: string;
  lanes: FlowLane[];
  notes?: FlowNote[];
  footer?: string;
}> = ({ title, subtitle, lanes, notes = [], footer }) => (
 <section className="rounded-xl border p-5 md:p-6"
    style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.18em]"
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
          <GitBranch size={12} />
          STATIC FLOW
        </div>
        <h2 className="mt-3 text-base font-semibold" style={{ color: LK.ink }}>{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{subtitle}</p>}
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold"
        style={{ backgroundColor: 'rgba(69, 192, 111, 0.15)', borderColor: LK.success, color: LK.success }}>
        <ShieldCheck size={14} />
        静态阶段关系图
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {lanes.map((lane, laneIndex) => (
        <div key={lane.label} className="rounded-xl border p-4"
          style={{ backgroundColor: 'rgba(17, 26, 43, 0.5)', borderColor: LK.border }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.14em]"
              style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
              LANE {laneIndex + 1}
            </span>
            <span className="rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em]"
              style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
              {lane.label}
            </span>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            {lane.steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <article className="min-w-[220px] flex-1 rounded-xl border p-4" style={stepStyles(step.tone)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: LK.muted }}>
                        Step {index + 1}
                      </p>
                      <p className="text-sm font-semibold" style={{ color: LK.ink }}>{step.title}</p>
                      <p className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{step.desc}</p>
                    </div>
                    {step.badge && (
                      <span className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em]"
 style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.muted }}>
                        {step.badge}
                      </span>
                    )}
                  </div>
                </article>
                {index < lane.steps.length - 1 && (
                  <>
                    <div className="hidden items-center justify-center px-1 xl:flex">
                      <ArrowRight size={18} style={{ color: LK.muted }} />
                    </div>
                    <div className="flex w-full items-center justify-center xl:hidden">
                      <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.12em]"
                        style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
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
              <div key={note.title} className="rounded-xl border p-4" style={noteStyles(note.tone)}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ opacity: 0.75 }}>Note</p>
                <p className="mt-1 text-sm font-semibold">{note.title}</p>
                <p className="mt-1 text-xs leading-5" style={{ opacity: 0.9 }}>{note.detail}</p>
              </div>
            ))}
          </div>
        )}
        {footer && <p className="rounded-xl border px-4 py-3 text-xs leading-5"
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.body }}>{footer}</p>}
      </div>
    )}
  </section>
);
