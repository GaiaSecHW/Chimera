export type ThemeId = 'chimera-classic' | 'chimera';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  badgeText: string;
  logoVariant: 'classic' | 'chimera';
}

export const THEME_STORAGE_KEY = 'chimera_theme';
export const DEFAULT_THEME_ID: ThemeId = 'chimera-classic';

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'chimera-classic',
    label: 'Chimera Classic',
    badgeText: 'Security Platform',
    logoVariant: 'classic',
  },
  {
    id: 'chimera',
    label: 'Chimera Light',
    badgeText: 'Warm Light',
    logoVariant: 'chimera',
  },
];

export const isThemeId = (value: string | null | undefined): value is ThemeId =>
  value === 'chimera-classic' || value === 'chimera';

export const getThemeDefinition = (themeId: ThemeId): ThemeDefinition =>
  THEME_DEFINITIONS.find((item) => item.id === themeId) || THEME_DEFINITIONS[0];
