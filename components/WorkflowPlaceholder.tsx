
import React from 'react';
import { Activity, FileBox } from 'lucide-react';

interface WorkflowPlaceholderProps {
  title: string;
  icon: React.ReactNode;
}

export const WorkflowPlaceholder: React.FC<WorkflowPlaceholderProps> = ({ title, icon }) => {
  return (
    <div className="p-10 h-full flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-24 h-24 bg-brand-soft text-brand-primary rounded-[2.5rem] flex items-center justify-center shadow-brand mb-8">
         {React.cloneElement(icon as React.ReactElement<any>, { size: 48 })}
      </div>
      <h2 className="text-3xl font-semibold text-theme-text-primary tracking-tight mb-2">{title}</h2>
      <p className="text-theme-text-faint font-medium max-w-md">当前模块已自动对接 K8S Namespace 安全上下文。请确认测试目标已在「项目空间」完成初始化编排。</p>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl text-left">
         <div className="p-6 bg-theme-surface border border-theme-border rounded-3xl shadow-panel flex gap-4 items-start">
            <div className="w-10 h-10 bg-theme-elevated rounded-xl flex items-center justify-center shrink-0"><Activity size={20} className="text-theme-text-faint" /></div>
            <div><p className="text-sm font-medium text-theme-text-secondary">自动化引擎</p><p className="text-xs text-theme-text-faint mt-1">基于镜像的持续模糊测试与动态分析</p></div>
         </div>
         <div className="p-6 bg-theme-surface border border-theme-border rounded-3xl shadow-panel flex gap-4 items-start">
            <div className="w-10 h-10 bg-theme-elevated rounded-xl flex items-center justify-center shrink-0"><FileBox size={20} className="text-theme-text-faint" /></div>
            <div><p className="text-sm font-medium text-theme-text-secondary">专家审计</p><p className="text-xs text-theme-text-faint mt-1">集成化的源码分析与专家级渗透套件</p></div>
         </div>
      </div>
    </div>
  );
};
