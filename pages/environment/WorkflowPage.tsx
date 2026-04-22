
import React, { useState } from 'react';
import { 
  Workflow, 
  Plus, 
  Play, 
  Settings, 
  History, 
  ShieldCheck, 
  Activity, 
  ChevronRight, 
  Search,
  Filter,
  Zap,
  Layers,
  CheckCircle2,
  Clock,
  MoreVertical,
  Bot,
  AlertCircle
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';

export const WorkflowPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const workflows = [
    { 
      id: 'WF-001', 
      name: 'Web 业务系统全量扫描', 
      description: '执行包含指纹识别、漏洞探测与敏感目录枚举的标准化 Web 审计流。',
      status: 'Running', 
      lastRun: '2024-05-10 14:20', 
      progress: 65,
      type: 'Automation',
      steps: ['Assets', 'Identify', 'Exploit', 'Report']
    },
    { 
      id: 'WF-002', 
      name: '容器镜像合规性审计', 
      description: '对 K8S Namespace 下所有活跃 Pod 镜像执行基线漏洞与配置合规性检查。',
      status: 'Completed', 
      lastRun: '2024-05-08 09:15', 
      progress: 100,
      type: 'Compliance',
      steps: ['Discovery', 'Pull', 'Scan', 'Verify']
    },
    { 
      id: 'WF-003', 
      name: '移动端 API 深度威胁分析', 
      description: '模拟移动端交互流，对后端接口执行参数级模糊测试与逻辑越权探测。',
      status: 'Pending', 
      lastRun: '2024-05-12 11:00', 
      progress: 0,
      type: 'Dynamic',
      steps: ['Proxy', 'Traffic', 'Fuzz', 'Report']
    }
  ];

  return (
    <div className="p-10 space-y-10 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-blue-600 text-white rounded-[1.25rem] shadow-xl shadow-blue-500/20">
               <Workflow size={28} />
             </div>
             <div>
               <h2 className="text-3xl font-black text-slate-800 tracking-tight">安全测试工作流</h2>
               <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Orchestration & Automated Testing Pipelines</p>
             </div>
          </div>
        </div>
        <div className="flex gap-4">
          {!projectId && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 text-[10px] font-black uppercase">
              <AlertCircle size={14} /> Please select a project
            </div>
          )}
          <button className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95">
            <Plus size={18} /> 设计新工作流
          </button>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900 p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative shadow-2xl min-h-[180px]">
           <Zap className="absolute right-[-10px] top-[-10px] w-32 h-32 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
           <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest relative z-10">当前活跃实例</p>
           <h3 className="text-6xl font-black mt-4 relative z-10">4</h3>
           <div className="mt-4 flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-widest relative z-10">
             <Activity size={12} className="animate-pulse" /> Nodes Executing
           </div>
        </div>
        
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col justify-between">
           <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">任务平均耗时</p>
           <h3 className="text-4xl font-black mt-4 text-slate-800">12m 45s</h3>
           <p className="text-slate-400 text-[10px] font-bold mt-2 uppercase">System Efficiency: 94%</p>
        </div>

        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm col-span-2 flex items-center gap-10">
           <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center shrink-0 shadow-inner">
             <Bot size={40} />
           </div>
           <div className="space-y-4">
             <div>
                <h4 className="text-lg font-black text-slate-800 tracking-tight">AI 辅助测试编排已开启</h4>
                <p className="text-sm text-slate-400 mt-1 font-medium leading-relaxed max-w-2xl">
                   SecFlow 工作流支持基于 LLM 的意图识别。您可以直接描述测试目标，系统将自动从「环境服务」与「脚本库」中提取最匹配的资产进行编排。
                </p>
             </div>
             <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase">
                   <ShieldCheck size={14} className="text-green-500" /> Policy Verified
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase">
                   <Layers size={14} className="text-blue-500" /> Auto-Scaling Ready
                </div>
             </div>
           </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center px-2">
           <div className="relative flex-1 w-full max-w-md group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="搜索工作流模版或运行实例..." 
                className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <div className="flex gap-3">
              <button className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                <Filter size={14} /> Type
              </button>
              <button className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                <History size={14} /> Execution Logs
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
           {workflows.filter(wf => wf.name.includes(searchTerm)).map((wf) => (
             <div key={wf.id} className="bg-white rounded-[2.5rem] border border-slate-200 p-8 flex flex-col md:flex-row items-center gap-10 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 transition-all group relative overflow-hidden">
                {/* Visual Indicator of Progress */}
                {wf.status === 'Running' && (
                  <div className="absolute top-0 left-0 h-1 bg-blue-600 animate-pulse" style={{ width: `${wf.progress}%` }} />
                )}
                
                <div className={`w-20 h-20 rounded-[2.25rem] flex items-center justify-center shrink-0 shadow-inner transition-all group-hover:scale-105 ${wf.status === 'Running' ? 'bg-blue-50 text-blue-600' : wf.status === 'Completed' ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'}`}>
                   <Workflow size={40} />
                </div>

                <div className="flex-1 min-w-0 space-y-4">
                   <div className="flex items-center gap-4 flex-wrap">
                      <h5 className="text-2xl font-black text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">{wf.name}</h5>
                      <StatusBadge status={wf.status} />
                      <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg uppercase border border-slate-200">{wf.type}</span>
                   </div>
                   
                   <p className="text-sm text-slate-500 font-medium line-clamp-1 italic max-w-2xl">"{wf.description}"</p>
                   
                   <div className="flex flex-wrap gap-3 items-center">
                      {wf.steps.map((step, idx) => (
                        <React.Fragment key={step}>
                           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase border ${
                             idx < (wf.progress / 25) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-300 border-slate-100'
                           }`}>
                              {idx + 1}. {step}
                           </div>
                           {idx < wf.steps.length - 1 && <ChevronRight size={12} className="text-slate-200" />}
                        </React.Fragment>
                      ))}
                   </div>
                </div>

                <div className="flex flex-col gap-2 items-end shrink-0">
                   <div className="flex items-center gap-2 mb-2">
                      <Clock size={12} className="text-slate-300" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Last Run: {wf.lastRun}</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <button className="p-3.5 bg-slate-50 text-slate-400 hover:text-blue-600 border border-slate-100 rounded-2xl transition-all shadow-sm">
                        <Settings size={18} />
                      </button>
                      <button className={`px-8 py-3.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl transition-all active:scale-95 ${
                        wf.status === 'Running' 
                        ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' 
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                      }`}>
                         {wf.status === 'Running' ? <><Activity size={16} /> MONITORING</> : <><Play size={16} /> EXECUTE FLOW</>}
                      </button>
                      <button className="p-3.5 text-slate-300 hover:text-slate-600 transition-colors">
                        <MoreVertical size={20} />
                      </button>
                   </div>
                </div>
             </div>
           ))}
        </div>

        {/* Empty State */}
        {workflows.length === 0 && (
          <div className="bg-white rounded-[3rem] border-2 border-dashed border-slate-100 p-32 text-center flex flex-col items-center gap-6">
             <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <Workflow size={48} />
             </div>
             <div className="space-y-1">
                <p className="text-xl font-black text-slate-400">未检索到工作流模版</p>
                <p className="text-sm text-slate-300 font-medium">点击右上角按钮开始设计您的第一个自动化安全测试工作流</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
