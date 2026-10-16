export const THEME_PREFERENCES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export const THEME_STORAGE_KEY = 'paqui_color_mode';
export const DEFAULT_THEME_PREFERENCE = THEME_PREFERENCES.SYSTEM;
export const THEME_ATTRIBUTE = 'data-kb-theme';
