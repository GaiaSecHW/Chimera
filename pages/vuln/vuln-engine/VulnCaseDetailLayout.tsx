import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ClipboardCopy,
  FileClock,
  Layers3,
  ListTodo,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

import type {
  VulnCaseDisplaySummary,
  VulnCaseEvidenceSummary,
  VulnCaseReportDocument,
  VulnCaseReportSummary,
  VulnCaseWorkspaceSummary,
  VulnConfirmRecord,
} from '../../../clients/vuln';
import { MarkdownViewer } from '../../../design-system';
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

function MetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.borderSoft }}
    >
      <div className="text-xs" style={{ color: LK.muted }}>{label}</div>
      <div className="mt-1.5 text-sm font-semibold leading-5" style={{ color: LK.ink }}>{value}</div>
      {helper ? <div className="mt-1 text-xs" style={{ color: LK.body }}>{helper}</div> : null}
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
  confirmRecords?: VulnConfirmRecord[];
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
  confirmRecords,
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
    <div className="space-y-4">
      <section
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
      >
        <div className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
              >
                {labelOf(caseDetail?.severity, SEVERITY_LABELS)}
              </span>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
              >
                {labelOf(caseDetail?.current_stage, STAGE_LABELS)}
              </span>
              {caseDetail?.decision_status ? (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}
                >
                  {labelOf(caseDetail?.decision_status, DECISION_LABELS)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-8 tracking-tight" style={{ color: LK.ink }}>
              {displaySummary.title || caseDetail?.title}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6" style={{ color: LK.body }}>
              {displaySummary.subtitle || caseDetail?.summary || '暂无摘要'}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: LK.muted }}>
              <span>案例 ID：<span style={{ fontFamily: MONO, color: LK.body }}>{caseDetail?.id}</span></span>
              {caseDetail?.global_vuln_id ? <span>全局 ID：<span style={{ fontFamily: MONO, color: LK.body }}>{caseDetail.global_vuln_id}</span></span> : null}
              <span>更新时间：{formatTime(caseDetail?.updated_at || caseDetail?.created_at)}</span>
              {displaySummary.current_report_updated_at ? <span>报告更新：{formatTime(displaySummary.current_report_updated_at)}</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {onCreateAutoVerify ? (
              <button
                onClick={onCreateAutoVerify}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
              >
                <ShieldCheck size={14} />
                新建自动化验证任务
              </button>
            ) : null}
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: '1px solid ' + LK.border }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
            >
              <RefreshCw size={14} />
              刷新
            </button>
            {selectedReportMeta?.download_url ? (
              <a
                href={selectedReportMeta.download_url}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: '1px solid ' + LK.border }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
              >
                <ScrollText size={14} />
                下载报告
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 px-4 pb-4">
          <MetricCard label="验证结果" value={labelOf(caseDetail?.validation_result, VALIDATION_RESULT_LABELS) || '-'} helper={caseDetail?.finished_reason ?`结束原因：${labelOf(caseDetail?.finished_reason, FINISHED_REASON_LABELS)}` : undefined} />
          <MetricCard label="主报告" value={displaySummary.current_report_title || selectedReportMeta?.title || '-'} helper={selectedReportMeta?.report_kind || undefined} />
          <MetricCard label="主体对象" value={displaySummary.subject?.locator || caseDetail?.subject?.locator || '-'} helper={displaySummary.subject?.type || caseDetail?.subject?.type || undefined} />
          <MetricCard label="来源任务" value={displaySummary.source_task?.task_id || displaySummary.source_task?.execution_id || '-'} helper={displaySummary.source_task?.service_name || displaySummary.source_task?.service_id || undefined} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <div
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>主报告</div>
              <div className="mt-1 text-base font-semibold leading-6" style={{ color: LK.ink }}>
                {selectedReportMeta?.title || '暂无结构化报告'}
              </div>
            </div>
            {reportItems.length > 0 ? (
              <select
                value={selectedReportId}
                onChange={(event) => onSelectReport(event.target.value)}
                className="rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: '1px solid ' + LK.border }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              >
                {reportItems.map((item) => (
                  <option key={item.report_id} value={item.report_id}>
                    {item.title} · {item.stage}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="max-h-[calc(100vh-22rem)] overflow-auto px-4 py-4">
            {reportLoading ? (
              <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>报告加载中...</div>
            ) : reportError ? (
              <div className="rounded-lg px-4 py-6 text-sm" style={{ backgroundColor: `${LK.error}14`, border: '1px solid ' + LK.error + '40', color: LK.error }}>
                {reportError}
              </div>
            ) : reportDocument?.content ? (
              <MarkdownViewer content={reportDocument.content} />
            ) : (
              <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>
                当前案例暂无结构化 Markdown 报告，请查看"证据"或"原始数据"标签。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>判定依据</div>
            {(confirmRecords || []).length > 0 ? (
              <div className="mt-3 space-y-3">
                {(confirmRecords || []).map((record, index) => (
                  <div
                    key={`${record.engine_name}-${index}`}
                    className="rounded-lg"
                    style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.borderSoft }}
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
                      <span className="text-sm font-semibold" style={{ color: LK.ink }}>
                        {record.engine_name || '未知引擎'}
                      </span>
                      {record.engine_version ? (
                        <span className="text-xs" style={{ color: LK.muted }}>{record.engine_version}</span>
                      ) : null}
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
                      >
                        {record.result === 'yes' ? '判定成立' : record.result === 'no' ? '判定不成立' : (record.result || '-')}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: LK.muted }}>{record.status || ''}</span>
                    </div>
                    <div className="px-3 py-2">
                      <MarkdownViewer content={record.reason} emptyText="暂无判定依据" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg px-3 py-4 text-sm" style={{ color: LK.muted }}>暂无判定依据</div>
            )}
          </section>

          <section
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>关键结论</div>
            <div className="mt-3 space-y-2">
              {(displaySummary.key_points || []).length > 0 ? (
                (displaySummary.key_points || []).map((point, index) => (
                  <div
                    key={`${index}-${point}`}
                    className="rounded-lg px-3 py-3 text-sm"
                    style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.borderSoft, color: LK.body }}
                  >
                    {point}
                  </div>
                ))
              ) : (
                <div className="rounded-lg px-3 py-4 text-sm" style={{ color: LK.muted }}>暂无关键结论摘要</div>
              )}
            </div>
          </section>

          <section
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>工作区概览</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MetricCard label="时间线" value={workspaceSummary.timeline_count ?? timeline.length} />
              <MetricCard label="动作" value={workspaceSummary.action_count ?? actions.length} />
              <MetricCard label="结果" value={workspaceSummary.result_count ?? results.length} />
              <MetricCard label="人工任务" value={workspaceSummary.manual_task_count ?? tasks.length} />
            </div>
          </section>

          {stageActionContent ? (
            <section
              className="rounded-xl px-4 py-4"
              style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>阶段操作</div>
              <div className="mt-3">{stageActionContent}</div>
            </section>
          ) : null}
        </div>
      </section>

      <section
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
      >
        <div className="flex flex-wrap gap-2 px-4 py-3" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
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
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: active ? LK.primaryMuted : LK.surfaceRaised,
                  color: active ? LK.primary : LK.body,
                  borderBottom: active ? '2px solid ' + LK.primary : '2px solid transparent',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = LK.body; }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-4">
          {activeTab === 'report' ? (
            <div className="space-y-3">
              {resultSummary.report_candidates?.length ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {resultSummary.report_candidates.map((item: VulnCaseReportSummary) => (
                    <button
                      key={item.report_id}
                      onClick={() => onSelectReport(item.report_id)}
                      className="rounded-lg px-4 py-3 text-left transition-colors"
                      style={{
                        border: '1px solid ' + (selectedReportId === item.report_id ? LK.primary : LK.border),
                        backgroundColor: selectedReportId === item.report_id ? LK.primaryMuted : LK.surfaceRaised,
                        color: selectedReportId === item.report_id ? LK.primary : LK.body,
                      }}
                      onMouseEnter={(e) => {
                        if (selectedReportId !== item.report_id) {
                          e.currentTarget.style.backgroundColor = LK.surface;
                          e.currentTarget.style.color = LK.inkSoft;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedReportId !== item.report_id) {
                          e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                          e.currentTarget.style.color = LK.body;
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{item.title}</div>
                        <div className="text-xs font-semibold uppercase" style={{ color: selectedReportId === item.report_id ? LK.primary : LK.muted }}>
                          {item.stage}
                        </div>
                      </div>
                      <div className="mt-2 text-xs" style={{ color: selectedReportId === item.report_id ? LK.primarySoft : LK.muted }}>
                        {item.excerpt || '暂无摘要'}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>暂无报告索引</div>
              )}
            </div>
          ) : null}

          {activeTab === 'evidence' ? (
            <div className="space-y-4">
              <div
                className="rounded-xl px-4 py-4"
                style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.borderSoft }}
              >
                <div className="text-sm font-semibold" style={{ color: LK.ink }}>证据摘要</div>
                <div className="mt-2 text-sm leading-6" style={{ color: LK.body }}>
                  {evidenceSummary.summary || '暂无证据摘要'}
                </div>
                {evidenceSummary.reproduction_hint ? (
                  <div className="mt-3 rounded-lg px-3 py-3 text-sm" style={{ backgroundColor: LK.surface, color: LK.body }}>
                    复现提示：{evidenceSummary.reproduction_hint}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
                  <div className="text-sm font-semibold" style={{ color: LK.ink }}>证明项</div>
                  <div className="mt-3 space-y-2">
                    {(evidenceSummary.proof_items || []).length > 0 ? (
                      (evidenceSummary.proof_items || []).map((item, index) => (
                        <div
                          key={`${item.result_id || index}`}
                          className="rounded-lg px-3 py-3 text-sm"
                          style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                        >
                          <div className="font-semibold">{item.result_type || 'result'} / {item.status || '-'}</div>
                          <div className="mt-1 text-xs" style={{ color: LK.muted }}>{item.summary || '暂无摘要'}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg px-3 py-6 text-center text-sm" style={{ color: LK.muted }}>暂无证明项</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
                  <div className="text-sm font-semibold" style={{ color: LK.ink }}>参考与产物</div>
                  <div className="mt-3 space-y-2">
                    {(evidenceSummary.references || []).map((item: any, index) => (
                      <div
                        key={`ref-${index}`}
                        className="rounded-lg px-3 py-3 text-sm"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                      >
                        <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item, null, 2)}</pre>
                      </div>
                    ))}
                    {(evidenceSummary.artifacts || []).map((item: any, index) => (
                      <div
                        key={`artifact-${index}`}
                        className="rounded-lg px-3 py-3 text-sm"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                      >
                        <div className="font-semibold">{item.name || item.path || item.filename || 'artifact'}</div>
                        <div className="mt-1 text-xs" style={{ color: LK.muted }}>{item.path || item.relative_path || item.storage_key || '-'}</div>
                      </div>
                    ))}
                    {(evidenceSummary.references || []).length === 0 && (evidenceSummary.artifacts || []).length === 0 ? (
                      <div className="rounded-lg px-3 py-6 text-center text-sm" style={{ color: LK.muted }}>暂无参考或产物</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'timeline' ? (
            <div className="space-y-3">
              {timeline.length ? timeline.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-1 text-xs font-medium"
                        style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}
                      >
                        {item.item_type}
                      </span>
                      <span className="text-xs" style={{ color: LK.muted }}>{formatTime(item.created_at)}</span>
                    </div>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-xs" style={{ color: LK.body }}>
                    {JSON.stringify(item.payload, null, 2)}
                  </pre>
                </div>
              )) : <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>暂无时间线</div>}
            </div>
          ) : null}

          {activeTab === 'actions' ? (
            <div className="space-y-3">
              {actions.length ? actions.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}
                    >
                      {labelOf(item.action_type, ACTION_TYPE_LABELS)}
                    </span>
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                    >
                      {item.execution_status}
                    </span>
                    {item.target_service_id ? (
                      <span
                        className="rounded-full px-2 py-1 text-xs font-medium"
                        style={{ backgroundColor: `${LK.success}22`, color: LK.success }}
                      >
                        {item.target_service_id}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm font-semibold" style={{ color: LK.ink }}>{item.result_summary || '暂无结果摘要'}</div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs" style={{ color: LK.muted }}>
                    <span>阶段：{labelOf(item.stage, STAGE_LABELS)}</span>
                    <span>派发：{item.dispatch_status || '-'}</span>
                    <span>创建：{formatTime(item.created_at)}</span>
                  </div>
                </div>
              )) : <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>暂无动作</div>}
            </div>
          ) : null}

          {activeTab === 'tasks' ? (
            <div className="space-y-3">
              {tasks.length ? tasks.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}
                    >
                      {labelOf(item.task_type, TASK_TYPE_LABELS)}
                    </span>
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-semibold" style={{ color: LK.ink }}>{item.title}</div>
                  <div className="mt-1 text-sm" style={{ color: LK.body }}>{item.summary || '暂无说明'}</div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs" style={{ color: LK.muted }}>
                    <span>负责人：{item.assignee || '-'}</span>
                    <span>创建：{formatTime(item.created_at)}</span>
                  </div>
                </div>
              )) : <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: LK.muted }}>暂无人工任务</div>}
            </div>
          ) : null}

          {activeTab === 'context' ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
                <div className="text-sm font-semibold" style={{ color: LK.ink }}>来源上下文</div>
                <div className="mt-3 space-y-2 text-sm" style={{ color: LK.body }}>
                  <div>上报方：{displaySummary.reporter?.name || '-'}</div>
                  <div>上报类型：{displaySummary.reporter?.type || '-'}</div>
                  <div>来源报告：{(displaySummary.source_report_ids || []).join(', ') || '-'}</div>
                  <div>主体：{displaySummary.subject?.locator || '-'}</div>
                  <div>发现 ID：{caseDetail?.finding_id || '-'}</div>
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
                <div className="text-sm font-semibold" style={{ color: LK.ink }}>任务与文件</div>
                <div className="mt-3 space-y-2 text-sm" style={{ color: LK.body }}>
                  {(workspaceSummary.related_execution_refs || []).map((item) => (
                    <div key={item.key}>{item.key}: <span style={{ fontFamily: MONO, color: LK.inkSoft }}>{item.value}</span></div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span>文件根：</span>
                    <span style={{ fontFamily: MONO, color: LK.inkSoft }}>{workspaceSummary.files_root_path || '-'}</span>
                    {workspaceSummary.files_root_path ? (
                      <button
                        onClick={() => copyText(workspaceSummary.files_root_path || '')}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: '1px solid ' + LK.border }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                      >
                        <ClipboardCopy size={11} />复制
                      </button>
                    ) : null}
                  </div>
                  {selectedReportMeta?.storage_path ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>报告文件：</span>
                      <span className="break-all" style={{ fontFamily: MONO, color: LK.inkSoft }}>{selectedReportMeta.storage_path}</span>
                      <button
                        onClick={() => copyText(selectedReportMeta.storage_path || '')}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: '1px solid ' + LK.border }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                      >
                        <ClipboardCopy size={11} />复制
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'raw' ? (
            <div className="space-y-4">
              <div
                className="overflow-auto rounded-xl p-4 text-xs"
                style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border, color: LK.ink }}
              >
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(rawPayload, null, 2)}</pre>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};
