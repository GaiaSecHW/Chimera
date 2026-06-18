import { DEFAULT_THEME_ID, THEME_STORAGE_KEY, isThemeId } from '../theme/themes.ts';

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
  const theme = isThemeId(stored) ? stored : DEFAULT_THEME_ID;
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
assert(initialTheme === 'chimera-classic', 'default theme should be chimera-classic');
assert(documentElement.dataset.theme === 'chimera-classic', 'dataset should use default theme');
assert(localStorage.getItem(THEME_STORAGE_KEY) === 'chimera-classic', 'storage should persist default theme');

console.log('themeProvider.smoke.ts passed');
