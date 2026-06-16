import React from 'react';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
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
