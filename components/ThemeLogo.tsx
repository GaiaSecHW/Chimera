import React from 'react';
import { useTheme } from '../theme/ThemeProvider';

interface ThemeLogoProps {
  size?: 'small' | 'medium' | 'large';
  showWordmark?: boolean;
  showBadge?: boolean;
  buildVersion?: string;
  forceDarkWordmark?: boolean;
}

const SIZE_MAP = {
  small: {
    box: 'w-14 h-14 rounded-2xl',
    image: 'w-12 h-12',
    title: 'text-lg',
  },
  medium: {
    box: 'w-16 h-16 rounded-2xl',
    image: 'w-14 h-14',
    title: 'text-xl',
  },
  large: {
    box: 'w-28 h-28 rounded-3xl',
    image: 'w-24 h-24',
    title: 'text-4xl',
  },
} as const;

export const ThemeLogo: React.FC<ThemeLogoProps> = ({
  size = 'medium',
  showWordmark = true,
  showBadge = true,
  buildVersion,
  forceDarkWordmark = false,
}) => {
  const { theme, themeDefinition } = useTheme();
  const sizing = SIZE_MAP[size];
  const wordmarkClass = forceDarkWordmark || theme === 'chimera'
    ? 'text-theme-text-primary'
    : 'text-theme-text-inverse';

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div
        className={`${sizing.box} bg-logo-surface flex items-center justify-center shrink-0 shadow-brand overflow-hidden`}
      >
        <img
          src="/logo.png"
          alt="Chimera"
          className={size === 'large' ? 'w-24 h-24' : sizing.image}
        />
      </div>
      {showWordmark ? (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`block ${sizing.title} font-black ${wordmarkClass} tracking-[0.02em]`}>
              Chimera
            </span>
            {buildVersion ? (
              <span className="text-[10px] font-black text-theme-text-faint uppercase tracking-[0.2em]">
                {buildVersion}
              </span>
            ) : null}
          </div>
          {showBadge ? (
            <span className={`inline-flex mt-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.25em] truncate theme-brand-chip`}>
              {themeDefinition.badgeText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
