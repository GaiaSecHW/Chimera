import React from 'react';
import { Shield } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

interface ThemeLogoProps {
  size?: 'small' | 'medium' | 'large';
  showWordmark?: boolean;
  showBadge?: boolean;
  buildVersion?: string;
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
}) => {
  const { themeDefinition } = useTheme();
  const sizing = SIZE_MAP[size];
  const isClassic = themeDefinition.logoVariant === 'classic';

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className={`${sizing.box} bg-logo-surface flex items-center justify-center shrink-0 shadow-brand`}>
        {isClassic ? (
          <Shield className="text-theme-text-inverse" size={sizing.icon} />
        ) : (
          <img
            src={size === 'large' ? '/chimera-logo-full.svg' : size === 'small' ? '/chimera-logo-small.svg' : '/chimera-logo-medium.svg'}
            alt="Chimera"
            className={sizing.image}
          />
        )}
      </div>
      {showWordmark ? (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`block ${sizing.title} font-black text-theme-text-inverse tracking-tighter`}>
              {isClassic ? 'SecFlow' : 'Chimera'}
            </span>
            {buildVersion ? (
              <span className="text-[10px] font-black text-theme-text-faint uppercase tracking-[0.2em]">
                {buildVersion}
              </span>
            ) : null}
          </div>
          {showBadge ? (
            <span className="block text-[10px] font-black text-brand-primary uppercase tracking-[0.25em] truncate">
              {themeDefinition.badgeText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
