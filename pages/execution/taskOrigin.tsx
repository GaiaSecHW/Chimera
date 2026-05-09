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
  dataflow_analysis: '数据流分析',
  vuln_scan: '数据流漏洞挖掘',
};

export function navigateToParentBinarySecurityTask(origin: OriginInfo) {
  navigateBackByTaskOrigin(origin);
}

export const TaskOriginInline: React.FC<{ origin: OriginInfo; compact?: boolean }> = ({ origin, compact = false }) => {
  const isBinarySecurity = String(origin.task_origin_type || '').trim() === 'binary_security';
  const parentTaskId = String(origin.parent_task_id || '').trim();
  const stageLabel = STAGE_LABELS[String(origin.parent_stage_name || '').trim()] || String(origin.parent_stage_name || '').trim();
  const modeInfo = getAnalysisModeInfo(origin);
  if (!isBinarySecurity) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-600">手动任务</span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-bold ${modeInfo.className}`}>{modeInfo.label}</span>
      </span>
    );
  }
  return (
    <div className={`flex ${compact ? 'flex-wrap items-center gap-1.5' : 'flex-col gap-1.5'}`}>
      <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
        总任务关联
      </span>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${modeInfo.className}`}>
        {modeInfo.label}
      </span>
      <div className={`flex ${compact ? 'flex-wrap items-center gap-1.5' : 'flex-wrap items-center gap-2'} text-xs text-slate-600`}>
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

export const TaskOriginCard: React.FC<{ origin: OriginInfo; title?: string }> = ({ origin, title = '来源信息' }) => {
  const isBinarySecurity = String(origin.task_origin_type || '').trim() === 'binary_security';
  const stageLabel = STAGE_LABELS[String(origin.parent_stage_name || '').trim()] || String(origin.parent_stage_name || '').trim();
  const modeInfo = getAnalysisModeInfo(origin);
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${modeInfo.className}`}>{modeInfo.label}</span>
      </div>
      {!isBinarySecurity ? (
        <div className="mt-3 text-sm font-semibold text-slate-700">手动创建</div>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <div className="font-semibold">{String(origin.origin_label || '').trim() || '二进制安全任务'}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">总任务 ID</span>
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
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {origin.parent_task_id || '-'}
            </span>
          </div>
          <div>来源阶段：{stageLabel || '-'}</div>
          <div>阶段子项 ID：{origin.parent_stage_item_id || '-'}</div>
          <div>阶段子项 Key：{origin.parent_stage_item_key || '-'}</div>
        </div>
      )}
    </section>
  );
};
