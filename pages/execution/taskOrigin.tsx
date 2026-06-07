import React from 'react';
import { navigateBackByTaskOrigin } from '../../utils/executionReturnContext';

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
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-sky-200 bg-sky-50 text-sky-700',
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
  const pillClassName = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold';
  if (!isBinarySecurity) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <span className={`${pillClassName} border-slate-200 bg-slate-50 text-slate-600`}>手动任务</span>
        <span className={`${pillClassName} ${modeInfo.className}`}>{modeInfo.label}</span>
      </span>
    );
  }
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`${pillClassName} border-cyan-200 bg-cyan-50 text-cyan-700`}>
          总任务关联
        </span>
        <span className={`${pillClassName} ${modeInfo.className}`}>
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
          className={`${pillClassName} cursor-pointer border-slate-200 bg-white font-mono text-slate-700 hover:bg-slate-50`}
          title={parentTaskId || '-'}
        >
          {parentTaskId || '-'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`${pillClassName} border-cyan-200 bg-cyan-50 text-cyan-700`}>
        总任务关联
      </span>
      <span className={`${pillClassName} ${modeInfo.className}`}>
        {modeInfo.label}
      </span>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
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
          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono font-semibold text-slate-700 hover:bg-slate-50"
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
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-2.5 space-y-2.5">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${modeInfo.className}`}>{modeInfo.label}</span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
              isBinarySecurity
                ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              {isBinarySecurity ? '总任务关联' : '手动创建'}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {isBinarySecurity ? originLabel : '当前任务为独立创建任务'}
          </div>
        </div>
        <div className={`grid gap-2.5 ${isBinarySecurity ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {isBinarySecurity ? (
            <>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">总任务 ID</div>
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
                    className="inline-flex max-w-full cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <span className="truncate">{origin.parent_task_id || '-'}</span>
                  </span>
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">来源阶段</div>
                <div className="mt-2 break-words text-sm font-semibold text-slate-800">{stageLabel || '-'}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">阶段子项 ID</div>
                <div className="mt-2 truncate font-mono text-xs font-semibold text-slate-700" title={origin.parent_stage_item_id || '-'}>
                  {origin.parent_stage_item_id || '-'}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">阶段子项 Key</div>
                <div className="mt-2 truncate font-mono text-xs font-semibold text-slate-700" title={origin.parent_stage_item_key || '-'}>
                  {origin.parent_stage_item_key || '-'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">任务来源</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">手动创建</div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">上游关联</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">无</div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
