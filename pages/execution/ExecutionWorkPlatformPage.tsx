import React from 'react';
import { 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface ExecutionWorkPlatformPageProps {
  projectId: string;
}

export const ExecutionWorkPlatformPage: React.FC<ExecutionWorkPlatformPageProps> = ({ projectId }) => {
  const token = localStorage.getItem('chimera_token') || '';
  // 动态构建带有 project_id 和 token 的 URL
  const targetUrl = `https://chimera.ai.icsl.huawei.com/gaiasec/?project_id=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`;

  return (
    <div className="h-full w-full flex flex-col animate-in fade-in duration-500 bg-white overflow-hidden relative">
      {/* 核心内容区：保持满屏布局 */}
      <div className="flex-1 w-full h-full relative">
         <div className="w-full h-full bg-white overflow-hidden relative">
            <iframe 
               src={targetUrl}
               className="w-full h-full border-none"
               title="知微工作平台"
               sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
            />
            
            {/* 顶部的极细装饰条 */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 opacity-40 z-10" />
         </div>
      </div>
      
      {/* 底部信息悬浮窗 */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
        <div className="px-3 py-1.5 bg-slate-900/10 backdrop-blur-sm rounded-full flex items-center gap-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              SOC PLATFORM ACTIVE
           </div>
           <div className="w-px h-2 bg-slate-400/30" />
           <span className="font-mono text-blue-600/60">PID: {projectId.slice(0, 8)}</span>
           <div className="w-px h-2 bg-slate-400/30" />
           <span>ai.icsl.huawei.com</span>
        </div>
      </div>
    </div>
  );
};