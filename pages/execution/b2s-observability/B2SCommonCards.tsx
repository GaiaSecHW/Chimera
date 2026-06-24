import React from 'react';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

export type B2SCardTone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export const tileTone = (tone: B2SCardTone = 'slate'): { bg: string; color: string; border: string } => {
  const map: Record<B2SCardTone, { bg: string; color: string; border: string }> = {
    slate: { bg: LK.surfaceRaised, color: LK.ink, border: LK.border },
    blue: { bg: LK.info + '14', color: LK.info, border: LK.info + '40' },
    emerald: { bg: LK.success + '14', color: LK.success, border: LK.success + '40' },
    rose: { bg: LK.error + '14', color: LK.error, border: LK.error + '40' },
    amber: { bg: LK.warning + '14', color: LK.warning, border: LK.warning + '40' },
    violet: { bg: LK.primarySoft + '14', color: LK.primarySoft, border: LK.primarySoft + '40' },
  };
  return map[tone];
};

export const MetricTile: React.FC<{
  label: string;
  value: string | number | React.ReactNode;
  hint?: string;
  tone?: B2SCardTone;
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'slate', icon }) => {
  const colors = tileTone(tone);
  return (
    <div className="min-w-0 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.6 }}>{label}</div>
          <div className="mt-0.5 break-words text-xl font-semibold tracking-tight">{value}</div>
        </div>
        {icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: LK.surface, color: colors.color }}>
            {icon}
          </div>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-1 truncate text-[11px] font-semibold" style={{ opacity: 0.7 }} title={hint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
};

export const SectionCard: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, description, children, right }) => (
  <section
    className="rounded-xl p-4"
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
  >
    <div className="flex flex-col gap-1.5 pb-3 md:flex-row md:items-end md:justify-between" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
      <div>
        <h2 className="text-base font-semibold" style={{ color: LK.ink }}>{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[11px]" style={{ color: LK.muted }}>{description}</p>
        ) : null}
      </div>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);
