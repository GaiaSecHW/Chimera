import React from 'react';
import { Shield } from 'lucide-react';
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
    box: 'w-10 h-10 rounded-2xl',
    icon: 20,
    image: 'w-8 h-8',
    title: 'text-lg',
  },
  medium: {
    box: 'w-11 h-11 rounded-2xl',
    icon: 24,
    image: 'w-9 h-9',
    title: 'text-xl',
  },
  large: {
    box: 'w-20 h-20 rounded-3xl',
    icon: 40,
    image: 'w-16 h-16',
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
  const { themeDefinition } = useTheme();
  const sizing = SIZE_MAP[size];
  const isClassic = themeDefinition.logoVariant === 'classic';
  const wordmarkClass = forceDarkWordmark ? 'text-theme-text-primary' : 'text-theme-text-inverse';

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div
        className={`${sizing.box} bg-logo-surface flex items-center justify-center shrink-0 shadow-brand overflow-hidden`}
        style={!isClassic ? { border: '1px solid color-mix(in srgb, var(--brand-primary) 44%, rgba(255,255,255,0.1))' } : undefined}
      >
        {isClassic ? (
          <Shield className="text-theme-text-inverse" size={sizing.icon} />
        ) : (
          <img
            src={size === 'large' ? '/chimera-logo-full.svg' : size === 'small' ? '/chimera-logo-small.svg' : '/chimera-logo-medium.svg'}
            alt="Chimera"
            className={size === 'large' ? 'w-[4.5rem] h-[4.5rem]' : sizing.image}
          />
        )}
      </div>
      {showWordmark ? (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`block ${sizing.title} font-black ${wordmarkClass} tracking-[0.02em]`}>
              {isClassic ? 'SecFlow' : 'Chimera'}
            </span>
            {buildVersion ? (
              <span className="text-[10px] font-black text-theme-text-faint uppercase tracking-[0.2em]">
                {buildVersion}
              </span>
            ) : null}
          </div>
          {showBadge ? (
            <span className={`inline-flex mt-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.25em] truncate ${isClassic ? 'text-brand-primary' : 'theme-brand-chip'}`}>
              {themeDefinition.badgeText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
