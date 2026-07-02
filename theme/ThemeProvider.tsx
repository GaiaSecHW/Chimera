import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  getThemeDefinition,
  isThemeId,
  migrateLegacyThemeId,
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
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredTheme = (): ThemeId => {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const migrated = migrateLegacyThemeId(stored);
  if (migrated) {
    if (migrated !== stored) window.localStorage.setItem(THEME_STORAGE_KEY, migrated);
    return migrated;
  }
  return DEFAULT_THEME_ID;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const migrated = migrateLegacyThemeId(e.newValue);
        if (migrated && isThemeId(migrated)) {
          setThemeState(migrated);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'theme' && e.data.theme) {
        const migrated = migrateLegacyThemeId(e.data.theme);
        if (migrated && isThemeId(migrated)) {
          setThemeState(migrated);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const setTheme = (themeId: ThemeId) => {
    setThemeState(themeId);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeDefinition: getThemeDefinition(theme),
      themes: THEME_DEFINITIONS,
      setTheme,
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
