import React from 'react';

export const AgentSessionDialogHeader: React.FC<{
  title: string;
  subtitle: string;
  stage?: string | null;
  roleLabel?: string | null;
  roleToneClass?: string;
  eventCount?: number | null;
  live?: boolean;
  onClose: () => void;
}> = ({
  title,
  subtitle,
  stage,
  roleLabel,
  roleToneClass = 'border-slate-200 bg-slate-50 text-slate-600',
  eventCount = 0,
  live = false,
  onClose,
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
    <div>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Agent Session</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-500">{subtitle}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">
          阶段 {stage || '-'}
        </span>
        <span className={`rounded-full border px-3 py-1 font-bold ${roleToneClass}`}>
          {roleLabel || 'Agent'}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">
          事件 {eventCount ?? 0}
        </span>
        <span className={`rounded-full border px-3 py-1 font-bold ${live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {live ? '实时更新中' : '历史快照'}
        </span>
      </div>
    </div>
    <button
      type="button"
      onClick={onClose}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
    >
      关闭
    </button>
  </div>
);
