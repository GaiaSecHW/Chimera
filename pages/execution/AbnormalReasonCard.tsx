import React from 'react';

import { AlertTriangle, History } from 'lucide-react';

import { ExecutionAbnormalReason, ExecutionAbnormalReasonEventSummary } from '../../types/types';

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

function toneStyles(category?: string | null): { border: string; bg: string; color: string } {
  switch (category) {
    case 'cancel':
      return { border: LK.high, bg: 'rgba(213, 161, 58, 0.12)', color: LK.high };
    case 'runtime':
      return { border: LK.warning, bg: 'rgba(213, 161, 58, 0.12)', color: LK.warning };
    case 'downstream':
      return { border: LK.error, bg: 'rgba(241, 93, 93, 0.12)', color: LK.error };
    default:
      return { border: LK.critical, bg: 'rgba(255, 77, 79, 0.12)', color: LK.critical };
  }
}

export function AbnormalReasonCard({
  reason,
  history,
}: {
  reason: ExecutionAbnormalReason;
  history?: ExecutionAbnormalReasonEventSummary[] | null;
}) {
  const tones = toneStyles(reason.category);
  const evidence = Array.isArray(reason.evidence) ? reason.evidence.slice(0, 4) : [];
  const recentHistory = Array.isArray(history) ? history.slice(0, 3) : [];
  return (
 <section className="rounded-xl border p-5"
      style={{ backgroundColor: LK.surface, borderColor: tones.border }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: tones.color }}>
            <AlertTriangle size={15} />
            异常原因
          </div>
          <h2 className="mt-3 text-lg font-semibold" style={{ color: LK.ink }}>{reason.title || '任务异常结束'}</h2>
          <p className="mt-2 text-sm leading-6" style={{ opacity: 0.9, color: LK.inkSoft }}>{reason.message || '任务以非正常状态结束。'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {reason.code ? <span className="rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.14em]"
            style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.08)', color: tones.color }}>{reason.code}</span> : null}
          {reason.status ? <span className="rounded-full border px-3 py-1 font-semibold"
            style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.08)', color: tones.color }}>{reason.status}</span> : null}
        </div>
      </div>
      {evidence.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {evidence.map((item, index) => (
            <div key={`${item.key || item.label || 'evidence'}-${index}`} className="rounded-xl border px-4 py-3"
              style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.06)', color: LK.inkSoft }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ opacity: 0.7 }}>{item.label || item.key || '证据'}</div>
              <div className="mt-2 break-all text-sm font-medium">{item.value || '-'}</div>
            </div>
          ))}
        </div>
      ) : null}
      {reason.recommended_action ? (
        <div className="mt-4 rounded-xl border px-4 py-3 text-sm leading-6"
          style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.06)', color: LK.inkSoft }}>
          <span className="font-semibold">建议处理：</span>
          {reason.recommended_action}
        </div>
      ) : null}
      {recentHistory.length > 0 ? (
        <div className="mt-4 rounded-xl border px-4 py-3"
          style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.06)', color: LK.inkSoft }}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ opacity: 0.7 }}>
            <History size={13} />
            最近异常历史
          </div>
          <div className="mt-3 space-y-2">
            {recentHistory.map((item, index) => (
              <div key={`${item.event_id || 'history'}-${index}`} className="rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: 'currentColor', backgroundColor: 'rgba(255,255,255,0.08)', color: LK.inkSoft }}>
                <div className="font-semibold">{item.reason?.title || '异常事件'}</div>
                <div className="mt-1" style={{ opacity: 0.75 }}>{item.created_at || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
