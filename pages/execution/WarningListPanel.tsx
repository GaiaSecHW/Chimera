import React from 'react';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: '#1b2438',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-primary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

export const WarningListPanel: React.FC<{
  title: string;
  items: string[];
  className?: string;
}> = ({ title, items, className = '' }) => {
  if (!items.length) return null;

  return (
 <section className={`rounded-xl border px-4 py-4 text-sm ${className}`.trim()}
      style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.inkSoft }}>
      <div className="font-semibold">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs" style={{ color: LK.body }}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
};
