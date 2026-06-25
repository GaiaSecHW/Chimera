import { DEFAULT_THEME_ID, THEME_STORAGE_KEY, isThemeId, migrateLegacyThemeId } from '../theme/themes.ts';

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const localStorage = new LocalStorageMock();
const documentElement = {
  dataset: {} as Record<string, string>,
};

const bootTheme = () => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const migrated = migrateLegacyThemeId(stored);
  const theme = migrated || DEFAULT_THEME_ID;
  documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  return theme;
};

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const initialTheme = bootTheme();
assert(initialTheme === 'dark', 'default theme should be dark');
assert(documentElement.dataset.theme === 'dark', 'dataset should use dark theme');
assert(localStorage.getItem(THEME_STORAGE_KEY) === 'dark', 'storage should persist dark theme');

assert(isThemeId('dark') === true, 'dark should be valid ThemeId');
assert(isThemeId('light') === true, 'light should be valid ThemeId');
assert(isThemeId('chimera-classic') === false, 'chimera-classic should no longer be valid');
assert(migrateLegacyThemeId('chimera-classic') === 'dark', 'chimera-classic should migrate to dark');
assert(migrateLegacyThemeId('chimera') === 'dark', 'chimera should migrate to dark');

console.log('themeProvider.smoke.ts passed');
