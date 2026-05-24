import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

import { B2SBatchObservabilityRow } from '../../../clients/binaryToSource';
import { formatBytes, formatDateTime } from '../b2sPresentation';

const statusTone = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (normalized === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'pending') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (normalized === 'not_started') return 'border-slate-200 bg-white text-slate-500';
  return 'border-slate-200 bg-white text-slate-500';
};

const verdictTone = (verdict?: string | null) => {
  const normalized = String(verdict || '').toUpperCase();
  if (normalized === 'PASS') return 'text-emerald-700';
  if (normalized === 'FAIL') return 'text-rose-700';
  return 'text-slate-400';
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs == null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = durationMs / 1000;
  const precision = Number.isInteger(seconds) ? 0 : seconds >= 10 ? 1 : 2;
  return `${seconds.toFixed(precision)} 秒`;
};

export interface B2SBatchTableRowAction {
  type: 'select-item' | 'open-advanced' | 'open-session';
  row: B2SBatchObservabilityRow;
}

interface Props {
  rows: B2SBatchObservabilityRow[];
  showItemColumn?: boolean;
  showArtifactColumn?: boolean;
  emptyText: string;
  onRowAction?: (action: B2SBatchTableRowAction) => void;
}

export const B2SBatchObservabilityTable: React.FC<Props> = ({
  rows,
  showItemColumn = false,
  showArtifactColumn = false,
  emptyText,
  onRowAction,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  const toggleRow = (key: string) => {
    setExpandedKeys((current) => (
      current.includes(key) ? current.filter((entry) => entry !== key) : current.concat(key)
    ));
  };

  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">详情</th>
              {showItemColumn ? <th className="px-3 py-3 text-left">ELF Item</th> : null}
              <th className="px-3 py-3 text-left">Batch</th>
              <th className="px-3 py-3 text-left">函数体阶段状态</th>
              <th className="px-3 py-3 text-left">当前 Attempt</th>
              <th className="px-3 py-3 text-left">函数数</th>
              <th className="px-3 py-3 text-left">代码字节</th>
              <th className="px-3 py-3 text-left">当前函数</th>
              <th className="px-3 py-3 text-left">Review</th>
              <th className="px-3 py-3 text-left">Session</th>
              <th className="px-3 py-3 text-left">结果</th>
              <th className="px-3 py-3 text-left">函数体耗时</th>
              <th className="px-3 py-3 text-left">最近更新</th>
              {showArtifactColumn ? <th className="px-3 py-3 text-left">产物</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => {
              const key = `${row.item_id}:${row.batch_no}`;
              const expanded = expandedSet.has(key);
              return (
                <React.Fragment key={key}>
                  <tr className={row.status === 'running' ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-3 align-top">
                      <button type="button" onClick={() => toggleRow(key)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        展开
                      </button>
                    </td>
                    {showItemColumn ? (
                      <td className="px-3 py-3 align-top">
                        <button type="button" onClick={() => onRowAction?.({ type: 'select-item', row })} className="text-left font-semibold text-slate-700 hover:text-slate-950">
                          #{row.sequence_no} {row.item_name}
                        </button>
                      </td>
                    ) : null}
                    <td className="px-3 py-3 align-top font-mono text-slate-700">{row.batch_no}</td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusTone(row.status)}`}>{row.status_label}</span>
                    </td>
                    <td className="px-3 py-3 align-top">{row.current_attempt_no ?? row.attempt_count ?? '-'}</td>
                    <td className="px-3 py-3 align-top">{row.function_count || '-'}</td>
                    <td className="px-3 py-3 align-top">{row.total_size_bytes ? formatBytes(row.total_size_bytes) : '-'}</td>
                    <td className="px-3 py-3 align-top">
                      <span className={row.status === 'running' ? 'font-black text-blue-700' : 'text-slate-600'}>{row.current_function || '-'}</span>
                    </td>
                    <td className="px-3 py-3 align-top">{row.review_count}</td>
                    <td className="px-3 py-3 align-top">{row.session_count}</td>
                    <td className={`px-3 py-3 align-top font-black ${verdictTone(row.latest_verdict)}`}>{row.latest_verdict || '-'}</td>
                    <td className="px-3 py-3 align-top">{formatDurationMs(row.duration_ms)}</td>
                    <td className="px-3 py-3 align-top text-slate-600">{row.last_event_at ? formatDateTime(row.last_event_at) : '-'}</td>
                    {showArtifactColumn ? (
                      <td className="px-3 py-3 align-top text-xs text-slate-600">
                        <div>{row.has_source_output ? '源码输出' : '无源码'}</div>
                        <div>{row.has_disasm_context ? '有反编译上下文' : '无上下文'}</div>
                      </td>
                    ) : null}
                  </tr>
                  {expanded ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={showItemColumn && showArtifactColumn ? 14 : showItemColumn || showArtifactColumn ? 13 : 12} className="px-4 py-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                          <div className="space-y-2">
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">函数体阶段细节</div>
                              <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                                <div>最新 Verdict：<span className="font-bold text-slate-900">{row.latest_verdict_label || row.latest_verdict || '-'}</span></div>
                                <div>函数体开始：<span className="font-bold text-slate-900">{row.started_at ? formatDateTime(row.started_at) : '-'}</span></div>
                                <div>函数体结束：<span className="font-bold text-slate-900">{row.finished_at ? formatDateTime(row.finished_at) : '-'}</span></div>
                                <div>Attempt 总数：<span className="font-bold text-slate-900">{row.attempt_count}</span></div>
                              </div>
                              <div className="mt-2 text-xs text-slate-500">该记录表示 batch 在函数体还原阶段的执行与结束状态。</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Warnings</div>
                              <div className="mt-2 text-xs text-slate-600">
                                {row.warnings.length ? row.warnings.join('；') : '无额外告警'}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">导航</div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button type="button" onClick={() => onRowAction?.({ type: 'select-item', row })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                                切到 Item
                              </button>
                              <button type="button" onClick={() => onRowAction?.({ type: 'open-session', row })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                                <ExternalLink size={13} />
                                会话页
                              </button>
                              <button type="button" onClick={() => onRowAction?.({ type: 'open-advanced', row })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                                <ExternalLink size={13} />
                                Advanced
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
