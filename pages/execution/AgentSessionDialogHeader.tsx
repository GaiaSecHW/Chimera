import React from 'react';

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

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
  roleToneClass = '',
  eventCount = 0,
  live = false,
  onClose,
}) => (
  <div className="flex items-start justify-between gap-4 px-6 py-5"
    style={{ borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>Agent Session</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: LK.ink }}>{title}</div>
      <div className="mt-2 text-sm" style={{ color: LK.body }}>{subtitle}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border px-3 py-1 font-semibold"
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
          阶段 {stage || '-'}
        </span>
        <span className={`rounded-full border px-3 py-1 font-semibold ${roleToneClass || ''}`}
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
          {roleLabel || 'Agent'}
        </span>
        <span className="rounded-full border px-3 py-1 font-semibold"
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.mutedSoft }}>
          事件 {eventCount ?? 0}
        </span>
        <span className={`rounded-full border px-3 py-1 font-semibold`}
          style={{
            backgroundColor: live ? 'rgba(69, 192, 111, 0.15)' : LK.surfaceRaised,
            borderColor: live ? LK.success : LK.borderSoft,
            color: live ? LK.success : LK.mutedSoft
          }}>
          {live ? '实时更新中' : '历史快照'}
        </span>
      </div>
    </div>
    <button
      type="button"
      onClick={onClose}
      className="rounded-xl border px-4 py-2 text-sm font-semibold transition-colors"
      style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.body }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = LK.primary;
        e.currentTarget.style.color = LK.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = LK.border;
        e.currentTarget.style.color = LK.body;
      }}
    >
      关闭
    </button>
  </div>
);
