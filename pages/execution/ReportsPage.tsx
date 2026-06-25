import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Search,
  RefreshCw,
  Filter,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Plus
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../design-system';

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

const RISK_STYLES: Record<string, { bg: string; color: string }> = {
  Critical: { bg: 'rgba(255, 77, 79, 0.15)', color: LK.critical },
  High: { bg: 'rgba(255, 139, 61, 0.15)', color: LK.high },
  Medium: { bg: 'rgba(213, 161, 58, 0.15)', color: LK.medium },
  Low: { bg: 'rgba(73, 197, 255, 0.15)', color: LK.low },
};

export const ReportsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const reports = [
    { id: 'RPT-2024-001', name: 'Q1 Web API Penetration Test', date: '2024-03-15', author: 'AI Agent Fenrir', risk: 'Critical', status: 'Published' },
    { id: 'RPT-2024-002', name: 'Auth-Service Code Review', date: '2024-03-18', author: 'Operator Alpha', risk: 'Medium', status: 'Drafting' },
    { id: 'RPT-2024-003', name: 'Internal Network Audit v2', date: '2024-03-20', author: 'AI Agent Zephyr', risk: 'Low', status: 'Under Review' },
    { id: 'RPT-2024-004', name: 'Kubernetes Hardening Assessment', date: '2024-03-22', author: 'System Admin', risk: 'High', status: 'Published' },
  ];

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      <PageHeader
        title="安全审计报告"
        description="专业化漏洞管理与风险分析中心：支持一键导出与合规性溯源"
        actions={<button className="inline-flex items-center gap-2 btn-primary btn-lg"><Plus size={18} />生成新报告</button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <div className="p-8 rounded-xl border flex flex-col justify-between"
          style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>总计报告</p>
            <FileText size={24} style={{ color: LK.primaryMuted }} />
          </div>
          <h3 className="text-4xl font-semibold mt-4" style={{ color: LK.ink }}>128</h3>
          <p className="text-[10px] font-bold mt-2 uppercase" style={{ color: LK.muted }}>Lifetime Assessments</p>
        </div>
 <div className="p-8 rounded-xl border md:col-span-2 flex flex-col justify-between"
          style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>风险分布态势</p>
            <TrendingUp size={24} style={{ color: LK.error, opacity: 0.3 }} />
          </div>
          <div className="mt-6 flex items-end gap-2 h-16">
            {[60, 40, 90, 30, 70, 45, 80].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-lg relative cursor-pointer overflow-hidden"
                style={{ backgroundColor: LK.surfaceRaised }}>
                <div className="absolute bottom-0 w-full transition-all duration-700"
                  style={{ height: `${h}%`, backgroundColor: LK.primary }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4">
            <span className="text-[9px] font-semibold uppercase" style={{ color: LK.muted }}>Mar 15</span>
            <span className="text-[9px] font-semibold uppercase" style={{ color: LK.muted }}>Today</span>
          </div>
        </div>
 <div className="p-8 rounded-xl flex flex-col justify-between overflow-hidden relative group"
          style={{ backgroundColor: LK.surfaceRaised, color: '#ffffff' }}>
          <ShieldCheck className="absolute right-[-10px] top-[-10px] w-24 h-24 opacity-5 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-semibold uppercase tracking-widest relative z-10" style={{ color: LK.muted }}>关键修复率</p>
          <div className="mt-4 flex items-center gap-4 relative z-10">
            <h3 className="text-4xl font-semibold" style={{ color: LK.success }}>92%</h3>
            <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="h-full" style={{ width: '92%', backgroundColor: LK.success }} />
            </div>
          </div>
          <p className="text-[10px] font-bold mt-2 uppercase relative z-10" style={{ color: LK.muted }}>Target: 100% Compliance</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2" size={20} style={{ color: LK.muted }} />
            <input
              type="text"
              placeholder="搜索报告标题、报告 ID 或 编写人..."
 className="w-full pl-16 pr-8 py-5 rounded-xl text-sm outline-none transition-all font-medium"
              style={{ backgroundColor: LK.surface, borderColor: LK.border, color: LK.ink }}
              onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
 <button className="px-8 py-5 rounded-xl text-[10px] font-semibold uppercase tracking-widest flex items-center gap-2 transition-colors"
            style={{ backgroundColor: LK.surface, borderColor: LK.border, color: LK.muted }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}>
            <Filter size={16} /> Filter
          </button>
        </div>

 <div className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
          <table className="w-full text-left">
            <thead className="border-b"
              style={{ backgroundColor: 'rgba(17, 26, 43, 0.5)', borderColor: LK.borderSoft }}>
              <tr className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>
                <th className="px-8 py-5">报告标识 (ID)</th>
                <th className="px-6 py-5">项目/报告名称</th>
                <th className="px-6 py-5">评估专家 (AI/Human)</th>
                <th className="px-6 py-5">风险等级</th>
                <th className="px-6 py-5">状态</th>
                <th className="px-8 py-5 text-right">导出</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(rpt => (
                <tr key={rpt.id} className="cursor-pointer group transition-colors"
                  style={{ borderBottom:`1px solid ${LK.borderSoft}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(17, 26, 43, 0.8)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                  <td className="px-8 py-6">
                    <span className="text-[11px] font-mono font-semibold" style={{ color: LK.primary }}>{rpt.id}</span>
                  </td>
                  <td className="px-6 py-6">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: LK.ink }}>{rpt.name}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: LK.muted }}>{rpt.date}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-[10px] font-semibold uppercase flex items-center gap-2" style={{ color: LK.muted }}>
                      <StatusBadge status={rpt.author.includes('AI') ? 'AI Agent' : 'Human'} />
                      {rpt.author}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: RISK_STYLES[rpt.risk]?.color || LK.muted }} />
                      <span className="text-[11px] font-semibold uppercase" style={{ color: RISK_STYLES[rpt.risk]?.color || LK.muted }}>
                        {rpt.risk}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <StatusBadge status={rpt.status} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-3 rounded-xl transition-all"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.primary; }}>
                        <Download size={16} />
                      </button>
                      <button className="p-3 rounded-xl transition-all"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.error; }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
