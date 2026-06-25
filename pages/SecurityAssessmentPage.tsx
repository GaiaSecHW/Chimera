
import React from 'react';
import { ClipboardCheck, Play, Settings, History, ShieldAlert, CheckCircle, Activity, ArrowRight } from 'lucide-react';
import { PageHeader } from '../design-system';

export const SecurityAssessmentPage: React.FC = () => {
  const assessments = [
    { id: '1', name: '年度 Web 应用漏洞扫描', type: '自动化扫描', status: '进行中', progress: 65, date: '2024-05-10' },
    { id: '2', name: '核心数据库基线检查', type: '合规性检查', status: '已完成', progress: 100, date: '2024-05-08' },
    { id: '3', name: '移动端 API 安全审计', type: '人工+自动', status: '待开始', progress: 0, date: '2024-05-12' }
  ];

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24">
      <PageHeader
        title="安全评估工作流"
        description="标准化、自动化的安全风险评估与合规审计引擎"
        actions={<button className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95"><Play size={18} /> 发起新评估</button>}
      />

      {/* Workflow Steps */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { step: '01', title: '资产发现', desc: '确定评估边界' },
          { step: '02', title: '策略配置', desc: '选择扫描模版' },
          { step: '03', title: '执行评估', desc: '自动化/人工注入' },
          { step: '04', title: '报告生成', desc: '风险闭环与建议' }
        ].map((item, idx) => (
          <div key={idx} className="bg-theme-surface p-6 rounded-xl border border-theme-border relative group overflow-hidden">
            <div className="text-4xl font-semibold text-white/60 absolute right-4 top-4 group-hover:text-blue-50 transition-colors">{item.step}</div>
            <h4 className="font-semibold text-theme-text-primary relative z-10">{item.title}</h4>
            <p className="text-xs text-theme-text-muted mt-1 font-medium relative z-10">{item.desc}</p>
            {idx < 3 && <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-20"><ArrowRight size={16} className="text-theme-text-secondary" /></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
 <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden">
            <div className="px-8 py-6 border-b border-theme-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-theme-text-primary flex items-center gap-2">
                <History size={18} className="text-blue-400" /> 近期评估任务
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 border-b border-theme-border">
                  <tr className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
                    <th className="px-8 py-5 text-theme-text-primary font-semibold">评估名称</th>
                    <th className="px-6 py-5 text-theme-text-primary font-semibold">类型</th>
                    <th className="px-6 py-5 text-theme-text-primary font-semibold">进度</th>
                    <th className="px-8 py-5 text-theme-text-primary font-semibold text-right">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assessments.map(item => (
                    <tr key={item.id} className="hover:bg-theme-elevated transition-all cursor-pointer">
                      <td className="px-8 py-5">
                        <p className="text-sm font-semibold text-theme-text-secondary">{item.name}</p>
                        <p className="text-[10px] text-theme-text-muted font-medium mt-0.5">{item.date}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-medium text-theme-text-muted bg-theme-elevated px-2 py-1 rounded-lg uppercase">{item.type}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-theme-elevated rounded-full overflow-hidden w-20">
                            <div className="h-full bg-blue-600" style={{ width: `${item.progress}%` }} />
                          </div>
                          <span className="text-[10px] font-medium text-theme-text-muted">{item.progress}%</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className={`text-[10px] font-medium px-3 py-1.5 rounded-full inline-block ${
                          item.status === '已完成' ? 'bg-green-500/15 text-green-400' :
                          item.status === '进行中' ? 'bg-blue-500/15 text-blue-400' : 'bg-theme-elevated text-theme-text-muted'
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
 <div className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-4 relative overflow-hidden">
            <Activity className="absolute right-[-20px] top-[-20px] w-40 h-40 text-white/60 opacity-80 rotate-12" />
            <h4 className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">实时评估统计</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-theme-surface p-4 rounded-xl border border-theme-border">
                <p className="text-[10px] font-medium text-theme-text-muted uppercase">累计评估</p>
                <p className="text-2xl font-bold mt-1 text-theme-text-primary">128</p>
              </div>
              <div className="bg-theme-surface p-4 rounded-xl border border-theme-border">
                <p className="text-[10px] font-medium text-theme-text-muted uppercase">平均得分</p>
                <p className="text-2xl font-bold mt-1 text-green-400">82</p>
              </div>
            </div>
            <div className="pt-6 border-t border-theme-border">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-theme-text-muted">风险分布</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> 高危</span>
                  <span className="font-semibold">12%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> 中危</span>
                  <span className="font-semibold">28%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /> 低危</span>
                  <span className="font-semibold">60%</span>
                </div>
              </div>
            </div>
          </div>

 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border flex items-center gap-5 group cursor-pointer hover:border-blue-500 transition-all">
             <div className="w-14 h-14 bg-blue-500/15 text-blue-400 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all">
               <Settings size={24} />
             </div>
             <div>
               <h4 className="font-semibold text-theme-text-primary">评估模版配置</h4>
               <p className="text-xs text-theme-text-muted font-medium">管理与自定义安全检测规则集</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};