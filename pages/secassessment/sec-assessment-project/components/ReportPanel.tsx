import React from 'react';
import { Download, Printer } from 'lucide-react';
import type { ProjectDetail, ExecutionResult, BaselineTreeResponse } from '../types';
import {
  PROJECT_STATUS_MAP, fmtTime, fmtPercent, countByResult, buildItemTree, findItemNode,
  ExecResultBadge,
} from '../constants';

interface ReportPanelProps {
  detail: ProjectDetail;
  executions: ExecutionResult[];
  tree: BaselineTreeResponse | null;
}

export const ReportPanel: React.FC<ReportPanelProps> = ({ detail, executions, tree }) => {
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
            <div className="flex items-start justify-around py-4 gap-4 flex-wrap">
              <ComplianceGauge rate={rate} />
              {executions.length > 0 && <ResultDonut counts={countByResult(executions)} total={executions.length} />}
            </div>
          </Section>

          {/* 章节4 基线项执行详情 */}
          <Section title="四、基线项执行详情">
            {executions.length === 0 ? (
              <div className="text-sm text-theme-text-faint">暂无评估结果数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-theme-border">
                  <thead>
                    <tr className="bg-theme-elevated text-theme-text-faint">
                      <th className="px-2 py-1.5 text-left border-b border-theme-border">编码</th>
                      <th className="px-2 py-1.5 text-left border-b border-theme-border">名称</th>
                      <th className="px-2 py-1.5 text-left border-b border-theme-border">结论</th>
                      <th className="px-2 py-1.5 text-left border-b border-theme-border">置信</th>
                      <th className="px-2 py-1.5 text-left border-b border-theme-border">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((e) => {
                      const node = tree ? findItemNode(buildItemTree(tree.nodes), e.item_node_id) : null;
                      return (
                        <tr key={e.id} className="border-b border-theme-border-subtle">
                          <td className="px-2 py-1.5 font-mono text-theme-text-faint">{e.item_code || '—'}</td>
                          <td className="px-2 py-1.5 text-theme-text-primary">{node?.name || '—'}</td>
                          <td className="px-2 py-1.5"><ExecResultBadge result={e.execute_result as any} /></td>
                          <td className="px-2 py-1.5 text-theme-text-secondary">{e.confidence || '—'}</td>
                          <td className="px-2 py-1.5 text-theme-text-secondary max-w-xs truncate">{e.summary || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 章节5 总体结论 */}
          <Section title="五、总体结论与改进建议">
            <div className="text-sm text-theme-text-secondary leading-relaxed">{conclusion}</div>
            {executions.length > 0 && (() => {
              const failItems = executions.filter((e) => e.execute_result === 'FAIL' || e.execute_result === 'PARTIAL');
              if (failItems.length === 0) return null;
              return (
                <div className="mt-3">
                  <div className="text-xs font-medium text-theme-text-primary mb-1">改进建议清单({failItems.length} 项 FAIL/PARTIAL):</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    {failItems.map((e, i) => (
                      <li key={e.id} className="text-xs text-theme-text-secondary">
                        <span className="font-mono text-theme-text-faint">[{e.item_code || e.item_node_id}]</span>{' '}
                        {e.recommendation || e.summary || '—'}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}
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

export const ResultDonut: React.FC<{ counts: Record<string, number>; total: number }> = ({ counts, total }) => {
  const segments = [
    { key: 'PASS', color: '#34d399' },
    { key: 'PARTIAL', color: '#fbbf24' },
    { key: 'FAIL', color: '#fb7185' },
    { key: 'N_A', color: '#38bdf8' },
    { key: 'MANUAL_REVIEW', color: '#a78bfa' },
  ];
  const r = 50;
  const cx = 60;
  const cy = 60;
  let acc = 0;
  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-elevated, #2a2f3a)" strokeWidth="14" />
        {total > 0 && segments.map((s) => {
          const val = counts[s.key] || 0;
          if (val === 0) return null;
          const frac = val / total;
          const dash = frac * 2 * Math.PI * r;
          const seg = (
            <circle
              key={s.key}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${2 * Math.PI * r - dash}`}
              strokeDashoffset={-acc * 2 * Math.PI * r}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          acc += frac;
          return seg;
        })}
        <text x={cx} y={cy + 5} textAnchor="middle" className="fill-theme-text-primary" style={{ fontSize: 18, fontWeight: 700 }}>{total}</text>
      </svg>
      <div className="text-xs text-theme-text-faint mt-1">结论分布</div>
      <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-theme-text-muted">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.key} {counts[s.key] || 0}
          </span>
        ))}
      </div>
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
