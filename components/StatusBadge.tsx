
import React from 'react';

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status?.toLowerCase();
  const isActive = ['active', 'valid', 'running', 'bound', 'owner', 'healthy', 'success', 'ready'].includes(s);
  const isInvalid = ['invalid', 'failed', 'offline', 'error'].includes(s);
  const isPending = ['pending', 'checking', 'admin'].includes(s);
  const isUnready = ['unready', 'not_ready'].includes(s);

  let colorClass = 'bg-theme-elevated text-theme-text-muted border-theme-border';
  if (isActive) colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (isInvalid) colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/20';
  if (isPending) colorClass = 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  if (isUnready) colorClass = 'bg-orange-500/15 text-orange-400 border-orange-500/20';

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0 ${colorClass}`}>
      {status || 'Unknown'}
    </span>
  );
};
