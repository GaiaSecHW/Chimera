import React from 'react';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

export const AgentSessionWarningPanel: React.FC<{
  warnings: string[];
  title?: string;
  className?: string;
}> = ({ warnings, title = '会话文件存在部分异常行，已跳过不可解析内容', className = '' }) => {
  if (!warnings.length) return null;

  return (
 <section className={`rounded-xl border px-4 py-4 text-sm ${className}`.trim()}
      style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.inkSoft }}>
      <div className="font-semibold">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs" style={{ color: LK.body }}>
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`}>{warning}</li>
        ))}
      </ul>
    </section>
  );
};
