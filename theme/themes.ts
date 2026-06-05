export type ThemeId = 'secflow-classic' | 'chimera';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  badgeText: string;
  logoVariant: 'classic' | 'chimera';
}

export const THEME_STORAGE_KEY = 'secflow_theme';
export const DEFAULT_THEME_ID: ThemeId = 'secflow-classic';

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'secflow-classic',
    label: 'SecFlow Classic',
    badgeText: 'Security Platform',
    logoVariant: 'classic',
  },
  {
    id: 'chimera',
    label: 'Chimera',
    badgeText: 'Vintage Engraving',
    logoVariant: 'chimera',
  },
];

export const isThemeId = (value: string | null | undefined): value is ThemeId =>
  value === 'secflow-classic' || value === 'chimera';

export const getThemeDefinition = (themeId: ThemeId): ThemeDefinition =>
  THEME_DEFINITIONS.find((item) => item.id === themeId) || THEME_DEFINITIONS[0];
