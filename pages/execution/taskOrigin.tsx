import React from 'react';
import { navigateBackByTaskOrigin } from '../../utils/executionReturnContext';

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

type OriginInfo = {
  analysis_mode?: string | null;
  analysis_mode_label?: string | null;
  task_origin_type?: string | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
};

export function getAnalysisModeInfo(origin: OriginInfo): { mode: 'binary' | 'source'; label: string; className: string } {
  const mode = String(origin.analysis_mode || '').trim() === 'source' ? 'source' : 'binary';
  return {
    mode,
    label: String(origin.analysis_mode_label || '').trim() || (mode === 'source' ? '源码模式' : '二进制模式'),
    className: mode === 'source'
      ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
      : 'border-sky-500/20 bg-sky-500/15 text-sky-400',
  };
}

const STAGE_LABELS: Record<string, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_vuln_scan: '数据流漏洞挖掘',
};

export function navigateToParentBinarySecurityTask(origin: OriginInfo) {
  navigateBackByTaskOrigin(origin);
}

export const TaskOriginInline: React.FC<{ origin: OriginInfo; compact?: boolean }> = ({ origin, compact = false }) => {
  const isBinarySecurity = String(origin.task_origin_type || '').trim() === 'binary_security';
  const parentTaskId = String(origin.parent_task_id || '').trim();
  const stageLabel = STAGE_LABELS[String(origin.parent_stage_name || '').trim()] || String(origin.parent_stage_name || '').trim();
  const modeInfo = getAnalysisModeInfo(origin);
  const pillClassName = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold';
  if (!isBinarySecurity) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <span className={pillClassName}
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.mutedSoft }}>手动任务</span>
        <span className={pillClassName}
          style={{ backgroundColor: modeInfo.mode === 'source' ? 'rgba(69, 192, 111, 0.15)' : 'rgba(79, 140, 255, 0.15)', borderColor: modeInfo.mode === 'source' ? LK.success : LK.info, color: modeInfo.mode === 'source' ? LK.success : LK.info }}>{modeInfo.label}</span>
      </span>
    );
  }
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={pillClassName}
          style={{ backgroundColor: 'rgba(6, 182, 212, 0.15)', borderColor: LK.info, color: LK.info }}>
          总任务关联
        </span>
        <span className={pillClassName}
          style={{ backgroundColor: modeInfo.mode === 'source' ? 'rgba(69, 192, 111, 0.15)' : 'rgba(79, 140, 255, 0.15)', borderColor: modeInfo.mode === 'source' ? LK.success : LK.info, color: modeInfo.mode === 'source' ? LK.success : LK.info }}>
          {modeInfo.label}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            navigateToParentBinarySecurityTask(origin);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              navigateToParentBinarySecurityTask(origin);
            }
          }}
          className={`${pillClassName} cursor-pointer font-mono`}
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.inkSoft }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
          title={parentTaskId || '-'}
        >
          {parentTaskId || '-'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className={pillClassName}
        style={{ backgroundColor: 'rgba(6, 182, 212, 0.15)', borderColor: LK.info, color: LK.info }}>
        总任务关联
      </span>
      <span className={pillClassName}
        style={{ backgroundColor: modeInfo.mode === 'source' ? 'rgba(69, 192, 111, 0.15)' : 'rgba(79, 140, 255, 0.15)', borderColor: modeInfo.mode === 'source' ? LK.success : LK.info, color: modeInfo.mode === 'source' ? LK.success : LK.info }}>
        {modeInfo.label}
      </span>
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: LK.body }}>
        <span>{String(origin.origin_label || '').trim() || '二进制安全任务'}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            navigateToParentBinarySecurityTask(origin);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              navigateToParentBinarySecurityTask(origin);
            }
          }}
          className="rounded-md border px-2 py-0.5 font-mono font-semibold cursor-pointer"
          style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.inkSoft }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
        >
          {parentTaskId || '-'}
        </span>
        <span>来源阶段：{stageLabel || '-'}</span>
      </div>
    </div>
  );
};

export const TaskOriginCard: React.FC<{ origin: OriginInfo; title?: string; actions?: React.ReactNode }> = ({
  origin,
  title = '来源信息',
  actions,
}) => {
  const isBinarySecurity = String(origin.task_origin_type || '').trim() === 'binary_security';
  const stageLabel = STAGE_LABELS[String(origin.parent_stage_name || '').trim()] || String(origin.parent_stage_name || '').trim();
  const modeInfo = getAnalysisModeInfo(origin);
  const originLabel = String(origin.origin_label || '').trim() || '二进制安全任务';
  return (
    <section className="min-w-0 rounded-xl border p-3"
      style={{ backgroundColor: 'rgba(17, 26, 43, 0.6)', borderColor: LK.border }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>{title}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-2.5 space-y-2.5">
        <div className="min-w-0 rounded-xl border px-3 py-2.5"
          style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold`}
              style={{ backgroundColor: modeInfo.mode === 'source' ? 'rgba(69, 192, 111, 0.15)' : 'rgba(79, 140, 255, 0.15)', borderColor: modeInfo.mode === 'source' ? LK.success : LK.info, color: modeInfo.mode === 'source' ? LK.success : LK.info }}>{modeInfo.label}</span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold`}
              style={{
                backgroundColor: isBinarySecurity ? 'rgba(6, 182, 212, 0.15)' : LK.surfaceRaised,
                borderColor: isBinarySecurity ? LK.info : LK.borderSoft,
                color: isBinarySecurity ? LK.info : LK.mutedSoft
              }}>
              {isBinarySecurity ? '总任务关联' : '手动创建'}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>
            {isBinarySecurity ? originLabel : '当前任务为独立创建任务'}
          </div>
        </div>
        <div className={`grid gap-2.5 ${isBinarySecurity ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {isBinarySecurity ? (
            <>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>总任务 ID</div>
                <div className="mt-2">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateToParentBinarySecurityTask(origin)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigateToParentBinarySecurityTask(origin);
                      }
                    }}
                    className="inline-flex max-w-full cursor-pointer rounded-md border px-2 py-1 font-mono text-xs font-semibold"
                    style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.inkSoft }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                  >
                    <span className="truncate">{origin.parent_task_id || '-'}</span>
                  </span>
                </div>
              </div>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>来源阶段</div>
                <div className="mt-2 break-words text-sm font-semibold" style={{ color: LK.ink }}>{stageLabel || '-'}</div>
              </div>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>阶段子项 ID</div>
                <div className="mt-2 truncate font-mono text-xs font-semibold" style={{ color: LK.inkSoft }} title={origin.parent_stage_item_id || '-'}>
                  {origin.parent_stage_item_id || '-'}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>阶段子项 Key</div>
                <div className="mt-2 truncate font-mono text-xs font-semibold" style={{ color: LK.inkSoft }} title={origin.parent_stage_item_key || '-'}>
                  {origin.parent_stage_item_key || '-'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>任务来源</div>
                <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>手动创建</div>
              </div>
              <div className="min-w-0 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: LK.surface, borderColor: LK.borderSoft }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LK.muted }}>上游关联</div>
                <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>无</div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
