import type { JSX, ParentComponent } from 'solid-js';
import { A } from '@solidjs/router';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { ThemeSwitcher } from '@/modules/theme/theme-switcher.component';
import { useTheme } from '@/modules/theme/theme.provider';
import { AppLogo } from '../components/app-logo';
import { Button } from '../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../components/dropdown-menu';
import { LanguageSwitcher } from './sidenav.layout';

export const AuthLayout: ParentComponent<{ background?: JSX.Element }> = (props) => {
  const { t } = useI18n();
  const { getTheme } = useTheme();

  return (
    <div class="min-h-screen w-full flex flex-col bg-muted/15 relative overflow-hidden">
      {props.background
        ? <div class="pointer-events-none absolute inset-0" aria-hidden="true">{props.background}</div>
        : <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.12),transparent_35%)]" aria-hidden="true" />}
      <header class="relative z-10 w-full max-w-7xl mx-auto px-5 py-5 sm:px-8 flex justify-between items-center gap-2">
        <AppLogo as={A} href="/" class="text-base" />

        <div class="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline" size="icon" class="rounded-full bg-background/70" aria-label={t('layout.theme-switcher')}>
              <div class={cn('size-4.5', { 'i-tabler-moon': getTheme() === 'dark', 'i-tabler-sun': getTheme() === 'light' })} />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-42">
              <ThemeSwitcher />
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline" size="icon" class="rounded-full bg-background/70" aria-label={t('layout.language-switcher')}>
              <div class="i-tabler-language size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-42">
              <LanguageSwitcher />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div class="relative z-1 flex-1">
        {props.children}
      </div>
    </div>
  );
};
