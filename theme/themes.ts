export type ThemeId = 'dark' | 'light';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  badgeText: string;
  logoVariant: 'classic';
}

export const THEME_STORAGE_KEY = 'chimera_theme';
export const DEFAULT_THEME_ID: ThemeId = 'dark';

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'dark',
    label: '深色',
    badgeText: 'Security Platform',
    logoVariant: 'classic',
  },
  {
    id: 'light',
    label: '浅色',
    badgeText: 'Security Platform',
    logoVariant: 'classic',
  },
];

export const isThemeId = (value: string | null | undefined): value is ThemeId =>
  value === 'dark' || value === 'light';

export const migrateLegacyThemeId = (value: string | null | undefined): ThemeId | null => {
  if (value === 'chimera-classic' || value === 'chimera') return 'dark';
  if (isThemeId(value)) return value;
  return null;
};

export const getThemeDefinition = (themeId: ThemeId): ThemeDefinition =>
  THEME_DEFINITIONS.find((item) => item.id === themeId) || THEME_DEFINITIONS[0];
