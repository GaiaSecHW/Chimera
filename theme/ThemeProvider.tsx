import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  getThemeDefinition,
  isThemeId,
  THEME_DEFINITIONS,
  THEME_STORAGE_KEY,
  ThemeDefinition,
  ThemeId,
} from './themes';

interface ThemeContextValue {
  theme: ThemeId;
  themeDefinition: ThemeDefinition;
  themes: ThemeDefinition[];
  setTheme: (themeId: ThemeId) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredTheme = (): ThemeId => {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (themeId: ThemeId) => {
    setThemeState(themeId);
  };

  const toggleTheme = () => {
    setThemeState((current) => (current === 'chimera-classic' ? 'chimera' : 'chimera-classic'));
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeDefinition: getThemeDefinition(theme),
      themes: THEME_DEFINITIONS,
      setTheme,
      toggleTheme,
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
