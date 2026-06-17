export type ThemeId = 'chimera-classic';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  badgeText: string;
  logoVariant: 'classic';
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
];

export const isThemeId = (value: string | null | undefined): value is ThemeId =>
  value === 'chimera-classic';

export const getThemeDefinition = (themeId: ThemeId): ThemeDefinition =>
  THEME_DEFINITIONS.find((item) => item.id === themeId) || THEME_DEFINITIONS[0];
