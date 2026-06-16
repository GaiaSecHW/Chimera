
import React from 'react';
import { ClipboardCheck, Play, Settings, History, ShieldAlert, CheckCircle, Activity, ArrowRight } from 'lucide-react';

export const SecurityAssessmentPage: React.FC = () => {
  const assessments = [
    { id: '1', name: '年度 Web 应用漏洞扫描', type: '自动化扫描', status: '进行中', progress: 65, date: '2024-05-10' },
    { id: '2', name: '核心数据库基线检查', type: '合规性检查', status: '已完成', progress: 100, date: '2024-05-08' },
    { id: '3', name: '移动端 API 安全审计', type: '人工+自动', status: '待开始', progress: 0, date: '2024-05-12' }
  ];

  return (
    <div className="p-10 space-y-10 animate-in fade-in duration-500 pb-24">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">安全评估工作流</h2>
          <p className="text-slate-500 mt-1 font-medium">标准化、自动化的安全风险评估与合规审计引擎</p>
        </div>
 <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95">
          <Play size={18} /> 发起新评估
        </button>
      </div>

      {/* Workflow Steps */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { step: '01', title: '资产发现', desc: '确定评估边界' },
          { step: '02', title: '策略配置', desc: '选择扫描模版' },
          { step: '03', title: '执行评估', desc: '自动化/人工注入' },
          { step: '04', title: '报告生成', desc: '风险闭环与建议' }
        ].map((item, idx) => (
          <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 relative group overflow-hidden">
            <div className="text-4xl font-black text-slate-100 absolute right-4 top-4 group-hover:text-blue-50 transition-colors">{item.step}</div>
            <h4 className="font-black text-slate-800 relative z-10">{item.title}</h4>
            <p className="text-xs text-slate-400 mt-1 font-medium relative z-10">{item.desc}</p>
            {idx < 3 && <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-20"><ArrowRight size={16} className="text-slate-200" /></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
 <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <History size={18} className="text-blue-600" /> 近期评估任务
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 border-b border-slate-100">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">评估名称</th>
                    <th className="px-6 py-5">类型</th>
                    <th className="px-6 py-5">进度</th>
                    <th className="px-8 py-5 text-right">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assessments.map(item => (
                    <tr key={item.id} className="hover:bg-slate-100 transition-all cursor-pointer">
                      <td className="px-8 py-5">
                        <p className="text-sm font-black text-slate-700">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.date}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-lg uppercase">{item.type}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-20">
                            <div className="h-full bg-blue-600" style={{ width: `${item.progress}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-slate-400">{item.progress}%</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className={`text-[10px] font-black px-3 py-1.5 rounded-full inline-block ${
                          item.status === '已完成' ? 'bg-green-50 text-green-600' :
                          item.status === '进行中' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'
                        }`}>
                          {item.status}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
 <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 space-y-6 relative overflow-hidden">
            <Activity className="absolute right-[-20px] top-[-20px] w-40 h-40 text-slate-100 opacity-80 rotate-12" />
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">实时评估统计</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase">累计评估</p>
                <p className="text-2xl font-black mt-1 text-slate-900">128</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase">平均得分</p>
                <p className="text-2xl font-black mt-1 text-green-600">82</p>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-500">风险分布</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> 高危</span>
                  <span className="font-black">12%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> 中危</span>
                  <span className="font-black">28%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /> 低危</span>
                  <span className="font-black">60%</span>
                </div>
              </div>
            </div>
          </div>

 <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 flex items-center gap-5 group cursor-pointer hover:border-blue-500 transition-all">
             <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all">
               <Settings size={24} />
             </div>
             <div>
               <h4 className="font-black text-slate-800">评估模版配置</h4>
               <p className="text-xs text-slate-400 font-medium">管理与自定义安全检测规则集</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
