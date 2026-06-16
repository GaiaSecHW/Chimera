import React from 'react';
import { ThemeLogo } from '../components/ThemeLogo';

interface HomePageProps {
  setCurrentView: (view: string) => void;
}

const LK = {
  primary: '#4f73ff',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  border: '#26324a',
  ink: '#f5f7ff',
  muted: '#72809a',
} as const;

export const HomePage: React.FC<HomePageProps> = ({ setCurrentView }) => {
  return (
    <div
      className="flex h-full items-center justify-center p-10"
      style={{ backgroundColor: LK.canvas }}
    >
      <div
        className="flex flex-col items-center gap-8 rounded-3xl px-16 py-14"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <ThemeLogo size="large" showBadge />
        <h1
          className="text-2xl font-black tracking-wide"
          style={{ color: LK.ink }}
        >
          欢迎使用 Chimera 系统
        </h1>
        <button
          onClick={() => setCurrentView('project-mgmt')}
          className="rounded-2xl px-8 py-3 text-sm font-black text-white transition-all hover:brightness-110 active:scale-95"
          style={{ backgroundColor: LK.primary }}
        >
          开始使用
        </button>
      </div>
    </div>
  );
};
