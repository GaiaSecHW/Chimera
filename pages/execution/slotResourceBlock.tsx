import React from 'react';

import { formatResourceBytes, formatResourceCpu, formatResourceRatio, formatResourceUsage } from './slotResourcePresentation';

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

type SlotResourceBlockProps = {
  cpuUsage?: number | null;
  cpuLimit?: number | null;
  cpuRequest?: number | null;
  memoryUsage?: number | null;
  memoryLimit?: number | null;
  memoryRequest?: number | null;
  metricsAt?: string | null;
  className?: string;
  formatDateTime: (value?: string | null) => string;
};

export const SlotResourceBlock: React.FC<SlotResourceBlockProps> = ({
  cpuUsage,
  cpuLimit,
  cpuRequest,
  memoryUsage,
  memoryLimit,
  memoryRequest,
  metricsAt,
  className = '',
  formatDateTime,
}) => {
  const cpuLine = formatResourceUsage(cpuUsage, cpuLimit, formatResourceCpu);
  const memoryLine = formatResourceUsage(memoryUsage, memoryLimit, formatResourceBytes);
  const cpuRatio = formatResourceRatio(cpuUsage, cpuLimit);
  const memoryRatio = formatResourceRatio(memoryUsage, memoryLimit);
  return (
    <div className={`rounded-xl border px-3 py-2 text-[11px] ${className}`}
      style={{ backgroundColor: 'rgba(17, 26, 43, 0.6)', borderColor: LK.borderSoft, color: LK.body }}>
      <div>CPU：{cpuLine}{cpuRatio !== '-' ?` · ${cpuRatio}` : ''}</div>
      <div className="mt-1">内存：{memoryLine}{memoryRatio !== '-' ?` · ${memoryRatio}` : ''}</div>
      {(cpuRequest != null || memoryRequest != null) ? (
        <div className="mt-1" style={{ color: LK.muted }}>
          Request：CPU {formatResourceCpu(cpuRequest)} · 内存 {formatResourceBytes(memoryRequest)}
        </div>
      ) : null}
      <div className="mt-1" style={{ color: LK.muted }}>采样：{formatDateTime(metricsAt)}</div>
    </div>
  );
};
