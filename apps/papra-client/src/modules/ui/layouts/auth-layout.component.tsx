import type { JSX, ParentComponent } from 'solid-js';
import { A } from '@solidjs/router';
import { LanguageToggleButton } from '@/modules/i18n/language-toggle-button.component';
import { useForcedLightTheme } from '@/modules/theme/force-light-theme';
import { AppLogo } from '../components/app-logo';

export const AuthLayout: ParentComponent<{ background?: JSX.Element }> = (props) => {
  useForcedLightTheme();

  return (
    <div class="min-h-screen w-full flex flex-col bg-muted/15 relative overflow-hidden">
      {props.background
        ? <div class="pointer-events-none absolute inset-0" aria-hidden="true">{props.background}</div>
        : <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.12),transparent_35%)]" aria-hidden="true" />}
      <header class="relative z-10 w-full max-w-7xl mx-auto px-5 py-5 sm:px-8 flex justify-between items-center gap-2">
        <AppLogo as={A} href="/" class="text-base" />

        <div class="flex gap-2">
          <LanguageToggleButton />
        </div>
      </header>

      <div class="relative z-1 flex-1">
        {props.children}
      </div>
    </div>
  );
};
