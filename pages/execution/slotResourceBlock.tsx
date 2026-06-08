import React from 'react';

import { formatResourceBytes, formatResourceCpu, formatResourceRatio, formatResourceUsage } from './slotResourcePresentation';

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
    <div className={`rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-600 ${className}`}>
      <div>CPU：{cpuLine}{cpuRatio !== '-' ? ` · ${cpuRatio}` : ''}</div>
      <div className="mt-1">内存：{memoryLine}{memoryRatio !== '-' ? ` · ${memoryRatio}` : ''}</div>
      {(cpuRequest != null || memoryRequest != null) ? (
        <div className="mt-1 text-slate-400">
          Request：CPU {formatResourceCpu(cpuRequest)} · 内存 {formatResourceBytes(memoryRequest)}
        </div>
      ) : null}
      <div className="mt-1 text-slate-400">采样：{formatDateTime(metricsAt)}</div>
    </div>
  );
};
