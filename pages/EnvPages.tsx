
import React from 'react';
import { Loader2, Box } from 'lucide-react';
import { Agent, EnvTemplate, AsyncTask } from '../types/types';
import { StatusBadge } from '../components/StatusBadge';

export const EnvAgentPage: React.FC<{ agents: Agent[]; isLoading: boolean }> = ({ agents, isLoading }) => (
  <div className="p-10 space-y-8 animate-in fade-in duration-300">
    <h2 className="text-3xl font-black text-slate-800 tracking-tight">Agent 管理</h2>
 <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-100/50 border-b border-slate-100"><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6">主机名</th><th className="px-8 py-6">IP 地址</th><th className="px-8 py-6">负载</th><th className="px-8 py-6">状态</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {isLoading ? <tr><td colSpan={4} className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr> : agents.map(a => (
            <tr key={a.key} className="hover:bg-slate-100 transition-all">
              <td className="px-8 py-6 font-black text-slate-700">{a.hostname}</td>
              <td className="px-8 py-6 font-mono text-xs">{a.ip_address}</td>
                            <td className="px-8 py-6 text-xs text-slate-400">CPU: {a.system_info?.cpu.logical_cores} | Mem: {a.system_info?.formatted.memory.total}</td>
              <td className="px-8 py-6"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const EnvTemplatePage: React.FC<{ templates: EnvTemplate[]; isLoading: boolean }> = ({ templates, isLoading }) => (
  <div className="p-10 space-y-8 animate-in fade-in duration-300">
    <h2 className="text-3xl font-black text-slate-800 tracking-tight">环境模板管理</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {isLoading ? <Loader2 className="animate-spin text-blue-600" /> : templates.map(t => (
 <div key={t.name} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 transition-all group">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all"><Box size={24} /></div>
          <h4 className="text-xl font-black text-slate-800">{t.name}</h4>
          <p className="text-slate-400 text-sm mt-2 line-clamp-2">{t.description}</p>
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between"><StatusBadge status={t.type} /><span className="text-[10px] font-black text-slate-300 uppercase">{t.updated_at?.split('T')[0]}</span></div>
        </div>
      ))}
    </div>
  </div>
);

export const EnvTasksPage: React.FC<{ tasks: AsyncTask[]; isLoading: boolean }> = ({ tasks, isLoading }) => (
  <div className="p-10 space-y-8 animate-in fade-in duration-300">
    <h2 className="text-3xl font-black text-slate-800 tracking-tight">环境模板部署/卸载任务管理</h2>
 <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-100/50 border-b border-slate-100"><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6">任务 ID</th><th className="px-8 py-6">类型</th><th className="px-8 py-6">进度</th><th className="px-8 py-6">状态</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {isLoading ? <tr><td colSpan={4} className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr> : tasks.map(t => (
            <tr key={t.id} className="hover:bg-slate-100 transition-all">
              <td className="px-8 py-6 font-mono text-xs">{t.id}</td>
                            <td className="px-8 py-6 font-black text-sm">{t.type}</td>
              <td className="px-8 py-6"><div className="flex items-center gap-3"><div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${t.progress}%` }} /></div><span className="text-[10px] font-black text-slate-400">{t.progress}%</span></div></td>
              <td className="px-8 py-6"><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
