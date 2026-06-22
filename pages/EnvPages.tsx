
import React from 'react';
import { Loader2, Box } from 'lucide-react';
import { Agent, EnvTemplate, AsyncTask } from '../types/types';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../design-system';

export const EnvAgentPage: React.FC<{ agents: Agent[]; isLoading: boolean }> = ({ agents, isLoading }) => (
  <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-300">
    <PageHeader title="Agent 管理" />
 <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-100/50 border-b border-theme-border"><tr className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest"><th className="px-8 py-6">主机名</th><th className="px-8 py-6">IP 地址</th><th className="px-8 py-6">负载</th><th className="px-8 py-6">状态</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {isLoading ? <tr><td colSpan={4} className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></td></tr> : agents.map(a => (
            <tr key={a.key} className="hover:bg-theme-elevated transition-all">
              <td className="px-8 py-6 font-semibold text-theme-text-secondary">{a.hostname}</td>
              <td className="px-8 py-6 font-mono text-xs">{a.ip_address}</td>
                            <td className="px-8 py-6 text-xs text-theme-text-muted">CPU: {a.system_info?.cpu.logical_cores} | Mem: {a.system_info?.formatted.memory.total}</td>
              <td className="px-8 py-6"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const EnvTemplatePage: React.FC<{ templates: EnvTemplate[]; isLoading: boolean }> = ({ templates, isLoading }) => (
  <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-300">
    <PageHeader title="环境模板管理" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {isLoading ? <Loader2 className="animate-spin text-blue-400" /> : templates.map(t => (
 <div key={t.name} className="bg-theme-surface p-8 rounded-xl border border-theme-border transition-all group">
          <div className="w-14 h-14 bg-theme-bg-app text-theme-text-muted rounded-lg flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all"><Box size={24} /></div>
          <h4 className="text-xl font-semibold text-theme-text-primary">{t.name}</h4>
          <p className="text-theme-text-muted text-sm mt-2 line-clamp-2">{t.description}</p>
          <div className="mt-8 pt-6 border-t border-theme-border flex items-center justify-between"><StatusBadge status={t.type} /><span className="text-[10px] font-medium text-theme-text-faint uppercase">{t.updated_at?.split('T')[0]}</span></div>
        </div>
      ))}
    </div>
  </div>
);

export const EnvTasksPage: React.FC<{ tasks: AsyncTask[]; isLoading: boolean }> = ({ tasks, isLoading }) => (
  <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-300">
    <PageHeader title="环境模板部署/卸载任务管理" />
 <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-100/50 border-b border-theme-border"><tr className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest"><th className="px-8 py-6">任务 ID</th><th className="px-8 py-6">类型</th><th className="px-8 py-6">进度</th><th className="px-8 py-6">状态</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {isLoading ? <tr><td colSpan={4} className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></td></tr> : tasks.map(t => (
            <tr key={t.id} className="hover:bg-theme-elevated transition-all">
              <td className="px-8 py-6 font-mono text-xs">{t.id}</td>
                            <td className="px-8 py-6 font-semibold text-sm">{t.type}</td>
              <td className="px-8 py-6"><div className="flex items-center gap-3"><div className="flex-1 h-2 bg-theme-elevated rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${t.progress}%` }} /></div><span className="text-[10px] font-medium text-theme-text-muted">{t.progress}%</span></div></td>
              <td className="px-8 py-6"><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);