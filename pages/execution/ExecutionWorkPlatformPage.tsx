import React from 'react';
import {
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface ExecutionWorkPlatformPageProps {
  projectId: string;
}

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

export const ExecutionWorkPlatformPage: React.FC<ExecutionWorkPlatformPageProps> = ({ projectId }) => {
  const token = localStorage.getItem('chimera_token') || '';
  const targetUrl =`https://chimera.ai.icsl.huawei.com/gaiasec/?project_id=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`;

  return (
    <div className="h-full w-full flex flex-col animate-in fade-in duration-500 overflow-hidden relative"
      style={{ backgroundColor: LK.canvas }}>
      <div className="flex-1 w-full h-full relative">
         <div className="w-full h-full overflow-hidden relative" style={{ backgroundColor: LK.surfaceRaised }}>
            <iframe
               src={targetUrl}
               className="w-full h-full border-none"
               title="知微工作平台"
               sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
            />
            <div className="absolute top-0 left-0 right-0 h-0.5 opacity-40 z-10"
              style={{ background: `linear-gradient(to right, ${LK.primary}, ${LK.info}, ${LK.primary})` }} />
         </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
        <div className="px-3 py-1.5 rounded-full flex items-center gap-3 text-[8px] font-semibold uppercase tracking-widest"
          style={{ backgroundColor: 'rgba(17, 26, 43, 0.3)', backdropFilter: 'blur(8px)', color: LK.muted }}>
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: LK.success }} />
              SOC PLATFORM ACTIVE
           </div>
           <div className="w-px h-2" style={{ backgroundColor: 'rgba(114, 128, 154, 0.3)' }} />
           <span className="font-mono" style={{ color: LK.primary, opacity: 0.6 }}>PID: {projectId.slice(0, 8)}</span>
           <div className="w-px h-2" style={{ backgroundColor: 'rgba(114, 128, 154, 0.3)' }} />
           <span>ai.icsl.huawei.com</span>
        </div>
      </div>
    </div>
  );
};
