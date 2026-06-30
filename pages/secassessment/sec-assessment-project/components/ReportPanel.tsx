import React from 'react';
import { Download, Printer, Info, FileText } from 'lucide-react';
import type { ProjectDetail } from '../types';
import { PROJECT_STATUS_MAP, fmtTime, fmtPercent } from '../constants';

interface ReportPanelProps {
  detail: ProjectDetail;
}

export const ReportPanel: React.FC<ReportPanelProps> = ({ detail }) => {
  const rate = detail.compliance_rate != null ? Number(detail.compliance_rate) : null;
  const total = detail.total_items ?? 0;
  const finish = detail.finish_count ?? 0;
  const unfinished = Math.max(0, total - finish);
  const env = detail.chimera_env || {};
  const snapshot = detail.config_snapshot || {};

  const conclusion = (() => {
    if (rate == null) return '评估进行中,暂无合规率。';
    if (rate >= 80) return `合规率 ${rate.toFixed(2)}%,整体合规情况良好。建议持续关注 FAIL/PARTIAL 项的改进。`;
    if (rate >= 60) return `合规率 ${rate.toFixed(2)}%,合规情况需改进。建议优先处理 FAIL 项并制定改进计划。`;
    return `合规率 ${rate.toFixed(2)}%,合规情况不理想。建议立即排查 FAIL 项并启动专项整改。`;
  })();

  const handleExportHTML = () => {
    const html = buildReportHTML(detail, conclusion);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `评估报告_${detail.project_name}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <button className="btn btn-secondary" onClick={handleExportHTML}><Download size={14} /> 导出 HTML</button>
        <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={14} /> 打印</button>
      </div>

      <div className="rounded-xl border border-theme-border bg-theme-surface p-6 space-y-6 print:bg-white print:text-black print:border-0">
        <style>{`@media print { body * { visibility: hidden; } .print-report, .print-report * { visibility: visible; } .print-report { position: absolute; left: 0; top: 0; width: 100%; } .print\\:hidden { display: none !important; } }`}</style>

        <div className="print-report space-y-6">
          {/* 标题 */}
          <div className="text-center border-b border-theme-border pb-4 print:border-black">
            <h2 className="text-xl font-bold text-theme-text-primary print:text-black">安全评估报告</h2>
            <div className="text-sm text-theme-text-muted mt-1 print:text-black">{detail.project_name}</div>
            <div className="text-xs text-theme-text-faint mt-1 font-mono print:text-black">{detail.chimera_need_taskId}</div>
          </div>

          {/* 章节1 评估对象 */}
          <Section title="一、评估对象">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <InfoRow label="项目名称" value={detail.project_name} />
              <InfoRow label="Chimera 项目" value={env.project_id || '—'} />
              <InfoRow label="基线" value={`${detail.baseline_name || '—'}`} />
              <InfoRow label="基线编码" value={env.baseline_id ? String(env.baseline_id) : '—'} mono />
              <InfoRow label="目标环境" value={detail.environment || '—'} />
              <InfoRow label="负责人" value={detail.executor || '—'} />
              <InfoRow label="requestId" value={env.requestId || '—'} mono />
              <InfoRow label="taskId" value={detail.chimera_need_taskId} mono />
              <InfoRow label="评估状态" value={PROJECT_STATUS_MAP[detail.project_status]?.label || detail.project_status} />
              <InfoRow label="创建时间" value={fmtTime(detail.create_time)} mono />
              <InfoRow label="Worker" value={detail.worker_name || '—'} />
              <InfoRow label="重试次数" value={`${detail.retry_count}/${snapshot.max_retry ?? '—'}`} />
            </div>
          </Section>

          {/* 章节2 执行统计 */}
          <Section title="二、执行统计信息">
            <div className="grid grid-cols-4 gap-3">
              <StatBox label="总检查项" value={total} />
              <StatBox label="已完成" value={finish} tone="text-emerald-400" />
              <StatBox label="未完成" value={unfinished} tone={unfinished ? 'text-amber-400' : ''} />
              <StatBox label="合规率" value={rate != null ? `${rate.toFixed(2)}%` : '—'} tone="text-brand-primary" />
            </div>
            <div className="text-xs text-theme-text-faint mt-2">
              合规率 = (PASS + PARTIAL×0.5) / 总项 × 100%(由后端统计重算,已完成项的均值)
            </div>
          </Section>

          {/* 章节3 图表 */}
          <Section title="三、图表">
            <div className="flex items-center justify-around py-4">
              <ComplianceGauge rate={rate} />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 mt-2">
              <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <span className="text-xs text-theme-text-secondary">
                结论分布环形图与按一级维度分组堆叠图需逐项 execution 数据(后端待补充 GET /api/projects/{detail.id}/executions 端点)。
              </span>
            </div>
          </Section>

          {/* 章节4 基线项执行详情 */}
          <Section title="四、基线项执行详情">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <FileText size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <span className="text-xs text-theme-text-secondary">
                逐项评估结果(结论/置信/摘要/证据/反证/差距)需后端补充 GET /api/projects/{detail.id}/executions 端点后展示。
              </span>
            </div>
          </Section>

          {/* 章节5 总体结论 */}
          <Section title="五、总体结论与改进建议">
            <div className="text-sm text-theme-text-secondary leading-relaxed">{conclusion}</div>
            {rate != null && rate < 80 && (
              <div className="mt-3 text-xs text-theme-text-muted">
                改进建议:FAIL/PARTIAL 项的 recommendation 详情需逐项 execution 数据,待后端补端点后补充编号清单。
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-sm font-semibold text-theme-text-primary mb-2 border-l-2 border-brand-primary pl-2 print:text-black">{title}</h3>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <div className="text-xs text-theme-text-faint print:text-gray-600">{label}</div>
    <div className={`text-sm text-theme-text-secondary print:text-black ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

const StatBox: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-center print:border-gray-300 print:bg-gray-50">
    <div className={`text-lg font-bold tabular-nums ${tone || 'text-theme-text-primary'}`}>{value}</div>
    <div className="text-xs text-theme-text-faint mt-0.5 print:text-gray-600">{label}</div>
  </div>
);

const ComplianceGauge: React.FC<{ rate: number | null }> = ({ rate }) => {
  if (rate == null) return <div className="text-sm text-theme-text-faint">暂无合规率数据</div>;
  const pct = Math.min(100, Math.max(0, rate));
  const color = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#fb7185';
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        <path d={`M 20 90 A 60 60 0 0 1 140 90`} fill="none" stroke="var(--color-elevated, #2a2f3a)" strokeWidth="10" strokeLinecap="round" />
        <path d={`M 20 90 A 60 60 0 0 1 140 90`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        <text x="80" y="80" textAnchor="middle" className="fill-theme-text-primary" style={{ fontSize: 22, fontWeight: 700 }}>{pct.toFixed(1)}%</text>
      </svg>
      <div className="text-xs text-theme-text-faint mt-1">合规率</div>
    </div>
  );
};

function buildReportHTML(detail: ProjectDetail, conclusion: string): string {
  const rate = detail.compliance_rate != null ? Number(detail.compliance_rate).toFixed(2) : '—';
  const total = detail.total_items ?? 0;
  const finish = detail.finish_count ?? 0;
  const env = detail.chimera_env || {};
  const rows = [
    ['项目名称', detail.project_name], ['Chimera 项目', env.project_id || '—'],
    ['基线', detail.baseline_name || '—'], ['目标环境', detail.environment || '—'],
    ['负责人', detail.executor || '—'], ['taskId', detail.chimera_need_taskId],
    ['评估状态', detail.project_status], ['创建时间', detail.create_time || '—'],
    ['Worker', detail.worker_name || '—'], ['重试次数', `${detail.retry_count}`],
    ['总检查项', String(total)], ['已完成', String(finish)],
    ['合规率', `${rate}%`],
  ];
  const tableRows = rows.map(([k, v]) => `<tr><td style="padding:4px 12px;border:1px solid #ddd;background:#f5f5f5;width:140px">${k}</td><td style="padding:4px 12px;border:1px solid #ddd">${v}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>评估报告_${detail.project_name}</title></head><body style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#222">
<h2 style="text-align:center;border-bottom:2px solid #6366f1;padding-bottom:12px">安全评估报告</h2>
<p style="text-align:center;color:#666">${detail.project_name}</p>
<h3 style="border-left:4px solid #6366f1;padding-left:8px;margin-top:24px">一、评估对象</h3>
<table style="border-collapse:collapse;width:100%;font-size:14px">${tableRows}</table>
<h3 style="border-left:4px solid #6366f1;padding-left:8px;margin-top:24px">二、执行统计</h3>
<p>总检查项 <b>${total}</b> · 已完成 <b style="color:#34d399">${finish}</b> · 合规率 <b style="color:#6366f1">${rate}%</b></p>
<h3 style="border-left:4px solid #6366f1;padding-left:8px;margin-top:24px">三、总体结论</h3>
<p>${conclusion}</p>
<h3 style="border-left:4px solid #6366f1;padding-left:8px;margin-top:24px">四、基线项执行详情</h3>
<p style="color:#999;font-size:12px">逐项评估结果需后端补充 GET /api/projects/${detail.id}/executions 端点后展示。</p>
</body></html>`;
}

export default ReportPanel;
