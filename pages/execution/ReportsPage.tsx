
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
  AlertTriangle, 
  ChevronRight,
  Plus
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';

export const ReportsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const reports = [
    { id: 'RPT-2024-001', name: 'Q1 Web API Penetration Test', date: '2024-03-15', author: 'AI Agent Fenrir', risk: 'Critical', status: 'Published' },
    { id: 'RPT-2024-002', name: 'Auth-Service Code Review', date: '2024-03-18', author: 'Operator Alpha', risk: 'Medium', status: 'Drafting' },
    { id: 'RPT-2024-003', name: 'Internal Network Audit v2', date: '2024-03-20', author: 'AI Agent Zephyr', risk: 'Low', status: 'Under Review' },
    { id: 'RPT-2024-004', name: 'Kubernetes Hardening Assessment', date: '2024-03-22', author: 'System Admin', risk: 'High', status: 'Published' },
  ];

  return (
    <div className="p-10 space-y-10 animate-in fade-in duration-500 pb-24">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">安全审计报告</h2>
          <p className="text-slate-500 mt-1 font-medium">专业化漏洞管理与风险分析中心：支持一键导出与合规性溯源</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95">
            <Plus size={18} /> 生成新报告
          </button>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between">
           <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">总计报告</p>
              <FileText className="text-blue-100" size={24} />
           </div>
           <h3 className="text-4xl font-black text-slate-800 mt-4">128</h3>
           <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">Lifetime Assessments</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm md:col-span-2 flex flex-col justify-between">
           <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">风险分布态势</p>
              <TrendingUp className="text-red-100" size={24} />
           </div>
           <div className="mt-6 flex items-end gap-2 h-16">
              {[60, 40, 90, 30, 70, 45, 80].map((h, i) => (
                <div key={i} className="flex-1 bg-slate-100 rounded-t-lg group relative cursor-pointer overflow-hidden">
                   <div className="absolute bottom-0 w-full bg-blue-500 transition-all duration-700" style={{ height: `${h}%` }} />
                </div>
              ))}
           </div>
           <div className="flex justify-between mt-4">
              <span className="text-[9px] font-black text-slate-400 uppercase">Mar 15</span>
              <span className="text-[9px] font-black text-slate-400 uppercase">Today</span>
           </div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between shadow-xl shadow-slate-900/10 overflow-hidden relative group">
           <ShieldCheck className="absolute right-[-10px] top-[-10px] w-24 h-24 opacity-5 group-hover:scale-110 transition-transform" />
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest relative z-10">关键修复率</p>
           <div className="mt-4 flex items-center gap-4 relative z-10">
              <h3 className="text-4xl font-black text-green-400">92%</h3>
              <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-green-500" style={{ width: '92%' }} />
              </div>
           </div>
           <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase relative z-10">Target: 100% Compliance</p>
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-4">
        <div className="flex gap-4">
           <div className="flex-1 relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input 
                type="text" 
                placeholder="搜索报告标题、报告 ID 或 编写人..." 
                className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <button className="px-8 py-5 bg-white border border-slate-200 rounded-[2rem] text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
             <Filter size={16} /> Filter
           </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-5">报告标识 (ID)</th>
                <th className="px-6 py-5">项目/报告名称</th>
                <th className="px-6 py-5">评估专家 (AI/Human)</th>
                <th className="px-6 py-5">风险等级</th>
                <th className="px-6 py-5">状态</th>
                <th className="px-8 py-5 text-right">导出</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map(rpt => (
                <tr key={rpt.id} className="hover:bg-slate-50 transition-all cursor-pointer group">
                  <td className="px-8 py-6">
                    <span className="text-[11px] font-mono font-black text-blue-600">{rpt.id}</span>
                  </td>
                  <td className="px-6 py-6">
                    <div>
                       <p className="text-sm font-black text-slate-800">{rpt.name}</p>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{rpt.date}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                       <StatusBadge status={rpt.author.includes('AI') ? 'AI Agent' : 'Human'} />
                       {rpt.author}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${
                         rpt.risk === 'Critical' ? 'bg-red-500' : 
                         rpt.risk === 'High' ? 'bg-orange-500' : 
                         rpt.risk === 'Medium' ? 'bg-amber-500' : 'bg-green-500'
                       }`} />
                       <span className={`text-[11px] font-black uppercase ${
                         rpt.risk === 'Critical' ? 'text-red-600' : 
                         rpt.risk === 'High' ? 'text-orange-600' : 'text-slate-600'
                       }`}>{rpt.risk}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <StatusBadge status={rpt.status} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button className="p-3 bg-slate-100 text-slate-400 hover:text-blue-600 rounded-xl transition-all">
                          <Download size={16} />
                       </button>
                       <button className="p-3 bg-slate-100 text-slate-400 hover:text-red-600 rounded-xl transition-all">
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
