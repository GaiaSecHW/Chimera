
import React from 'react';
import { Briefcase, Monitor, Package, ChevronRight, Layout, Zap } from 'lucide-react';
import { SecurityProject, Agent, StaticPackage, EnvTemplate } from '../types/types';

interface DashboardPageProps {
  projects: SecurityProject[];
  agents: Agent[];
  staticPackages: StaticPackage[];
  templates: EnvTemplate[];
  servicesCount: number;
  setCurrentView: (view: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ 
  projects, 
  agents, 
  staticPackages, 
  templates,
  servicesCount,
  setCurrentView 
}) => {
  // Ensure we are filtering based on the 'online' status string as defined in Agent type
  const onlineAgentsCount = (agents || []).filter(a => a.status === 'online').length;
  
  const stats = [
    { 
      id: 'project-mgmt', 
      label: '活动项目', 
      value: (projects || []).length, 
      icon: <Briefcase size={24} />, 
      bg: 'bg-blue-100', 
      text: 'text-blue-600' 
    },
    { 
      id: 'env-agent', 
      label: '存活 Agent', 
      value: onlineAgentsCount, 
      icon: <Monitor size={24} />, 
      bg: 'bg-indigo-100', 
      text: 'text-indigo-600' 
    },
    { 
      id: 'env-template', 
      label: '环境模板', 
      value: (templates || []).length, 
      icon: <Layout size={24} />, 
      bg: 'bg-amber-100', 
      text: 'text-amber-600' 
    },
    { 
      id: 'env-service', 
      label: '已部署服务', 
      value: servicesCount, 
      icon: <Zap size={24} />, 
      bg: 'bg-green-100', 
      text: 'text-green-600' 
    },
    { 
      id: 'static-packages', 
      label: '受信任软件包', 
      value: (staticPackages || []).length, 
      icon: <Package size={24} />, 
      bg: 'bg-purple-100', 
      text: 'text-purple-600' 
    }
  ];

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-black text-slate-800 tracking-tight">Chimera 控制台</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {stats.map(stat => (
          <div 
            key={stat.id} 
            onClick={() => setCurrentView(stat.id)} 
            className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
          >
            <div className={`w-14 h-14 ${stat.bg} ${stat.text} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
              {stat.icon}
            </div>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">{stat.label}</p>
            <div className="text-4xl font-black mt-2 flex items-center justify-between text-slate-900">
              {stat.value}
              <ChevronRight className="text-slate-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" size={28} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
           <h3 className="text-xl font-black text-slate-800 mb-6">节点态势感知</h3>
           <div className="space-y-6">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm font-bold text-slate-600">在线运行中</span>
                 </div>
                 <span className="text-sm font-black text-slate-800">{onlineAgentsCount}</span>
              </div>
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-sm font-bold text-slate-600">离线/维护</span>
                 </div>
                 <span className="text-sm font-black text-slate-800">{(agents || []).length - onlineAgentsCount}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                 <div 
                   className="h-full bg-indigo-500 transition-all duration-1000" 
                   style={{ width: `${(agents || []).length > 0 ? (onlineAgentsCount / agents.length) * 100 : 0}%` }} 
                 />
              </div>
           </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[3rem] text-white relative overflow-hidden group">
           <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-blue-500 opacity-10 rounded-full blur-[80px]" />
           <h3 className="text-xl font-black mb-6 relative z-10">快速开始安全测试</h3>
           <p className="text-slate-400 text-sm leading-relaxed mb-8 relative z-10">
             欢迎使用 Chimera。请首先在「项目空间」中初始化一个安全测试目标，随后在「环境服务」中编排您的渗透沙箱。
           </p>
           <button 
             onClick={() => setCurrentView('project-mgmt')}
             className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
           >
             初始化第一个项目
           </button>
        </div>
      </div>
    </div>
  );
};
