import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  AlertTriangle,
  ClipboardCopy,
  FileClock,
  FolderOpen,
  Layers3,
  ListTodo,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import type {
  VulnCaseDisplaySummary,
  VulnCaseEvidenceSummary,
  VulnCaseReportDocument,
  VulnCaseReportSummary,
  VulnCaseWorkspaceSummary,
} from '../../../clients/vuln';
import {
  ACTION_TYPE_LABELS,
  DECISION_LABELS,
  FINISHED_REASON_LABELS,
  SEVERITY_LABELS,
  STAGE_LABELS,
  TASK_TYPE_LABELS,
  VALIDATION_RESULT_LABELS,
  formatTime,
  labelOf,
  severityTone,
  toneOf,
} from './shared';

type DetailTab = 'report' | 'evidence' | 'timeline' | 'actions' | 'tasks' | 'context' | 'raw';

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words leading-7 text-sm text-slate-700">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: React.ReactNode }) {
  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function copyText(value: string) {
  if (!value) return;
  navigator.clipboard?.writeText(value).catch(() => undefined);
}

export const VulnCaseDetailLayout: React.FC<{
  projectId: string;
  caseDetail: any;
  timeline: any[];
  actions: any[];
  results: any[];
  tasks: any[];
  recommendedActions: any[];
  reportItems: VulnCaseReportSummary[];
  reportDocument: VulnCaseReportDocument | null;
  reportLoading: boolean;
  reportError: string | null;
  selectedReportId: string;
  onSelectReport: (reportId: string) => void;
  onRefresh: () => void;
  onCreateAutoVerify?: () => void;
  stageActionContent?: React.ReactNode;
}> = ({
  projectId,
  caseDetail,
  timeline,
  actions,
  results,
  tasks,
  recommendedActions,
  reportItems,
  reportDocument,
  reportLoading,
  reportError,
  selectedReportId,
  onSelectReport,
  onRefresh,
  onCreateAutoVerify,
  stageActionContent,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('report');
  const displaySummary = (caseDetail?.display_summary || {}) as VulnCaseDisplaySummary;
  const reportSummary = caseDetail?.report_summary as VulnCaseReportSummary | undefined;
  const evidenceSummary = (caseDetail?.evidence_summary || {}) as VulnCaseEvidenceSummary;
  const workspaceSummary = (caseDetail?.workspace_summary || {}) as VulnCaseWorkspaceSummary;
  const resultSummary = caseDetail?.result_summary || {};
  const selectedReportMeta = useMemo(
    () => reportItems.find((item) => item.report_id === selectedReportId) || reportSummary || reportDocument || null,
    [reportDocument, reportItems, reportSummary, selectedReportId],
  );
  const rawPayload = useMemo(
    () => ({
      case: {
        id: caseDetail?.id,
        title: caseDetail?.title,
        current_stage: caseDetail?.current_stage,
        current_status: caseDetail?.current_status,
        decision_status: caseDetail?.decision_status,
      },
      display_summary: caseDetail?.display_summary,
      evidence_summary: caseDetail?.evidence_summary,
      result_summary: caseDetail?.result_summary,
      workflow_run: caseDetail?.workflow_run,
      latest_results: results.slice(0, 3),
    }),
    [caseDetail, results],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneOf(caseDetail?.severity, severityTone)}`}>
                {labelOf(caseDetail?.severity, SEVERITY_LABELS)}
              </span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                {labelOf(caseDetail?.current_stage, STAGE_LABELS)}
              </span>
              {caseDetail?.decision_status ? (
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
                  {labelOf(caseDetail?.decision_status, DECISION_LABELS)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">{displaySummary.title || caseDetail?.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">{displaySummary.subtitle || caseDetail?.summary || '暂无摘要'}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>案例 ID：<span className="font-mono text-slate-700">{caseDetail?.id}</span></span>
              {caseDetail?.global_vuln_id ? <span>全局 ID：<span className="font-mono text-slate-700">{caseDetail.global_vuln_id}</span></span> : null}
              <span>更新时间：{formatTime(caseDetail?.updated_at || caseDetail?.created_at)}</span>
              {displaySummary.current_report_updated_at ? <span>报告更新：{formatTime(displaySummary.current_report_updated_at)}</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {onCreateAutoVerify ? (
              <button onClick={onCreateAutoVerify} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700">
                <ShieldCheck size={14} />
                新建自动化验证任务
              </button>
            ) : null}
            <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">
              <RefreshCw size={14} />
              刷新
            </button>
            {selectedReportMeta?.download_url ? (
              <a href={selectedReportMeta.download_url} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">
                <ScrollText size={14} />
                下载报告
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="验证结果" value={labelOf(caseDetail?.validation_result, VALIDATION_RESULT_LABELS) || '-'} helper={caseDetail?.finished_reason ? `结束原因：${labelOf(caseDetail?.finished_reason, FINISHED_REASON_LABELS)}` : undefined} />
          <MetricCard label="主报告" value={displaySummary.current_report_title || selectedReportMeta?.title || '-'} helper={selectedReportMeta?.report_kind || undefined} />
          <MetricCard label="主体对象" value={displaySummary.subject?.locator || caseDetail?.subject?.locator || '-'} helper={displaySummary.subject?.type || caseDetail?.subject?.type || undefined} />
          <MetricCard label="来源任务" value={displaySummary.source_task?.task_id || displaySummary.source_task?.execution_id || '-'} helper={displaySummary.source_task?.service_name || displaySummary.source_task?.service_id || undefined} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">主报告</div>
                <div className="mt-1 text-lg font-black text-slate-900">{selectedReportMeta?.title || '暂无结构化报告'}</div>
              </div>
              {reportItems.length > 0 ? (
                <select
                  value={selectedReportId}
                  onChange={(event) => onSelectReport(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  {reportItems.map((item) => (
                    <option key={item.report_id} value={item.report_id}>
                      {item.title} · {item.stage}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
          <div className="max-h-[calc(100vh-22rem)] overflow-auto px-6 py-6">
            {reportLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">报告加载中...</div>
            ) : reportError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-sm text-rose-700">{reportError}</div>
            ) : reportDocument?.content ? (
              <MarkdownContent content={reportDocument.content} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">
                当前案例暂无结构化 Markdown 报告，请查看“证据”或“原始数据”标签。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">关键结论</div>
            <div className="mt-4 space-y-3">
              {(displaySummary.key_points || []).length > 0 ? (
                (displaySummary.key_points || []).map((point, index) => (
                  <div key={`${index}-${point}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    {point}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400">暂无关键结论摘要</div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">工作区概览</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MetricCard label="时间线" value={workspaceSummary.timeline_count ?? timeline.length} />
              <MetricCard label="动作" value={workspaceSummary.action_count ?? actions.length} />
              <MetricCard label="结果" value={workspaceSummary.result_count ?? results.length} />
              <MetricCard label="人工任务" value={workspaceSummary.manual_task_count ?? tasks.length} />
            </div>
          </section>

          {stageActionContent ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段操作</div>
              <div className="mt-4">{stageActionContent}</div>
            </section>
          ) : null}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'report', label: '报告', icon: ScrollText },
              { key: 'evidence', label: '证据', icon: AlertTriangle },
              { key: 'timeline', label: '时间线', icon: FileClock },
              { key: 'actions', label: '动作', icon: Sparkles },
              { key: 'tasks', label: '人工任务', icon: ListTodo },
              { key: 'context', label: '关联上下文', icon: Layers3 },
              { key: 'raw', label: '原始数据', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as DetailTab)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-5">
          {activeTab === 'report' ? (
            <div className="space-y-4">
              {resultSummary.report_candidates?.length ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {resultSummary.report_candidates.map((item: VulnCaseReportSummary) => (
                    <button key={item.report_id} onClick={() => onSelectReport(item.report_id)} className={`rounded-[1.3rem] border px-4 py-4 text-left ${selectedReportId === item.report_id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black">{item.title}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest">{item.stage}</div>
                      </div>
                      <div className={`mt-2 text-xs ${selectedReportId === item.report_id ? 'text-slate-300' : 'text-slate-500'}`}>{item.excerpt || '暂无摘要'}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">暂无报告索引</div>
              )}
            </div>
          ) : null}

          {activeTab === 'evidence' ? (
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-sm font-black text-slate-900">证据摘要</div>
                <div className="mt-2 text-sm leading-7 text-slate-600">{evidenceSummary.summary || '暂无证据摘要'}</div>
                {evidenceSummary.reproduction_hint ? <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm text-slate-700">复现提示：{evidenceSummary.reproduction_hint}</div> : null}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">证明项</div>
                  <div className="mt-3 space-y-3">
                    {(evidenceSummary.proof_items || []).length > 0 ? (evidenceSummary.proof_items || []).map((item, index) => (
                      <div key={`${item.result_id || index}`} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        <div className="font-black">{item.result_type || 'result'} / {item.status || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.summary || '暂无摘要'}</div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400">暂无证明项</div>}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">参考与产物</div>
                  <div className="mt-3 space-y-3">
                    {(evidenceSummary.references || []).map((item: any, index) => (
                      <div key={`ref-${index}`} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item, null, 2)}</pre>
                      </div>
                    ))}
                    {(evidenceSummary.artifacts || []).map((item: any, index) => (
                      <div key={`artifact-${index}`} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        <div className="font-black">{item.name || item.path || item.filename || 'artifact'}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.path || item.relative_path || item.storage_key || '-'}</div>
                      </div>
                    ))}
                    {(evidenceSummary.references || []).length === 0 && (evidenceSummary.artifacts || []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400">暂无参考或产物</div> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'timeline' ? (
            <div className="space-y-3">
              {timeline.length ? timeline.map((item: any) => (
                <div key={item.id} className="rounded-[1.3rem] border border-slate-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-blue-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">{item.item_type}</span>
                      <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
                    </div>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-600">{JSON.stringify(item.payload, null, 2)}</pre>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-400">暂无时间线</div>}
            </div>
          ) : null}

          {activeTab === 'actions' ? (
            <div className="space-y-3">
              {actions.length ? actions.map((item: any) => (
                <div key={item.id} className="rounded-[1.3rem] border border-slate-200 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-blue-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">{labelOf(item.action_type, ACTION_TYPE_LABELS)}</span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">{item.execution_status}</span>
                    {item.target_service_id ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">{item.target_service_id}</span> : null}
                  </div>
                  <div className="mt-3 text-sm font-black text-slate-900">{item.result_summary || '暂无结果摘要'}</div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>阶段：{labelOf(item.stage, STAGE_LABELS)}</span>
                    <span>派发：{item.dispatch_status || '-'}</span>
                    <span>创建：{formatTime(item.created_at)}</span>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-400">暂无动作</div>}
            </div>
          ) : null}

          {activeTab === 'tasks' ? (
            <div className="space-y-3">
              {tasks.length ? tasks.map((item: any) => (
                <div key={item.id} className="rounded-[1.3rem] border border-slate-200 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">{labelOf(item.task_type, TASK_TYPE_LABELS)}</span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">{item.status}</span>
                  </div>
                  <div className="mt-3 text-sm font-black text-slate-900">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{item.summary || '暂无说明'}</div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>负责人：{item.assignee || '-'}</span>
                    <span>创建：{formatTime(item.created_at)}</span>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-400">暂无人工任务</div>}
            </div>
          ) : null}

          {activeTab === 'context' ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.5rem] border border-slate-200 p-4">
                <div className="text-sm font-black text-slate-900">来源上下文</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div>上报方：{displaySummary.reporter?.name || '-'}</div>
                  <div>上报类型：{displaySummary.reporter?.type || '-'}</div>
                  <div>来源报告：{(displaySummary.source_report_ids || []).join(', ') || '-'}</div>
                  <div>主体：{displaySummary.subject?.locator || '-'}</div>
                  <div>发现 ID：{caseDetail?.finding_id || '-'}</div>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 p-4">
                <div className="text-sm font-black text-slate-900">任务与文件</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {(workspaceSummary.related_execution_refs || []).map((item) => (
                    <div key={item.key}>{item.key}: <span className="font-mono text-slate-700">{item.value}</span></div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span>文件根：</span>
                    <span className="font-mono text-slate-700">{workspaceSummary.files_root_path || '-'}</span>
                    {workspaceSummary.files_root_path ? <button onClick={() => copyText(workspaceSummary.files_root_path || '')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-600"><ClipboardCopy size={11} />复制</button> : null}
                  </div>
                  {selectedReportMeta?.storage_path ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>报告文件：</span>
                      <span className="font-mono text-slate-700 break-all">{selectedReportMeta.storage_path}</span>
                      <button onClick={() => copyText(selectedReportMeta.storage_path || '')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-600"><ClipboardCopy size={11} />复制</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'raw' ? (
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100 overflow-auto">
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(rawPayload, null, 2)}</pre>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};
