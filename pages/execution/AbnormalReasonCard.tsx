import React from 'react';

import { AlertTriangle, History } from 'lucide-react';

import { ExecutionAbnormalReason, ExecutionAbnormalReasonEventSummary } from '../../types/types';

function toneClasses(category?: string | null): string {
  switch (category) {
    case 'cancel':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'runtime':
      return 'border-orange-200 bg-orange-50 text-orange-900';
    case 'downstream':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    default:
      return 'border-red-200 bg-red-50 text-red-900';
  }
}

export function AbnormalReasonCard({
  reason,
  history,
}: {
  reason: ExecutionAbnormalReason;
  history?: ExecutionAbnormalReasonEventSummary[] | null;
}) {
  const evidence = Array.isArray(reason.evidence) ? reason.evidence.slice(0, 4) : [];
  const recentHistory = Array.isArray(history) ? history.slice(0, 3) : [];
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClasses(reason.category)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em]">
            <AlertTriangle size={15} />
            异常原因
          </div>
          <h2 className="mt-3 text-lg font-black">{reason.title || '任务异常结束'}</h2>
          <p className="mt-2 text-sm leading-6 opacity-90">{reason.message || '任务以非正常状态结束。'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {reason.code ? <span className="rounded-full border border-current/15 bg-white/70 px-3 py-1 font-black uppercase tracking-[0.14em]">{reason.code}</span> : null}
          {reason.status ? <span className="rounded-full border border-current/15 bg-white/70 px-3 py-1 font-bold">{reason.status}</span> : null}
        </div>
      </div>
      {evidence.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {evidence.map((item, index) => (
            <div key={`${item.key || item.label || 'evidence'}-${index}`} className="rounded-xl border border-current/10 bg-white/70 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">{item.label || item.key || '证据'}</div>
              <div className="mt-2 break-all text-sm font-medium">{item.value || '-'}</div>
            </div>
          ))}
        </div>
      ) : null}
      {reason.recommended_action ? (
        <div className="mt-4 rounded-xl border border-current/10 bg-white/70 px-4 py-3 text-sm leading-6">
          <span className="font-black">建议处理：</span>
          {reason.recommended_action}
        </div>
      ) : null}
      {recentHistory.length > 0 ? (
        <div className="mt-4 rounded-xl border border-current/10 bg-white/70 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] opacity-70">
            <History size={13} />
            最近异常历史
          </div>
          <div className="mt-3 space-y-2">
            {recentHistory.map((item, index) => (
              <div key={`${item.event_id || 'history'}-${index}`} className="rounded-lg border border-current/10 bg-white/80 px-3 py-2 text-xs">
                <div className="font-bold">{item.reason?.title || '异常事件'}</div>
                <div className="mt-1 opacity-75">{item.created_at || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
