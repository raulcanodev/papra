import type { Component } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { useTheme } from './theme.provider';

/** One click flips between light and dark, no menu. */
export const ThemeToggleButton: Component<{ class?: string }> = (props) => {
  const { getTheme, setThemePreference } = useTheme();
  const { t } = useI18n();

  return (
    <Button
      variant="outline"
      size="icon"
      class={cn('rounded-full bg-background/70', props.class)}
      aria-label={t('layout.theme-switcher')}
      onClick={() => setThemePreference(getTheme() === 'dark' ? 'light' : 'dark')}
    >
      <div class={cn('size-4.5', getTheme() === 'dark' ? 'i-tabler-moon' : 'i-tabler-sun')} />
    </Button>
  );
};
