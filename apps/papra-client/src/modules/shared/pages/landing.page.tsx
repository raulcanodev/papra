import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { createEffect, For, Show, untrack } from 'solid-js';
import { appAgency, appBrand } from '@/modules/config/branding';
import { buildTimeConfig } from '@/modules/config/config';
import { useConfig } from '@/modules/config/config.provider';
import { DEMO_PREFERENCES_MESSAGE_SOURCE } from '@/modules/demo/demo.constants';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { LanguageToggleButton } from '@/modules/i18n/language-toggle-button.component';
import { createVitrineUrl } from '@/modules/shared/utils/urls';
import { useForcedLightTheme } from '@/modules/theme/force-light-theme';
import { AppLogo } from '@/modules/ui/components/app-logo';
import { Button } from '@/modules/ui/components/button';
import { ShaderGradient } from '@/modules/ui/components/shader-gradient';

const SHOW_LANDING_FEATURES = false;

const DemoFrame: Component<{ url: string }> = (props) => {
  const { t, getLocale } = useI18n();
  let frame: HTMLIFrameElement | undefined;

  // The first load carries the preferences in the URL; later changes are pushed without reloading the frame
  const initialUrl = untrack(() => {
    const url = new URL(props.url);
    url.searchParams.set('theme', 'light');
    url.searchParams.set('lang', getLocale());
    return url.toString();
  });

  const sendPreferences = () => {
    frame?.contentWindow?.postMessage({ source: DEMO_PREFERENCES_MESSAGE_SOURCE, theme: 'light', locale: getLocale() }, new URL(props.url).origin);
  };

  createEffect(sendPreferences);

  return (
    <div id="demo" class="mx-auto w-full max-w-[1500px] scroll-mt-24 px-3 sm:px-6">
      <div class="overflow-hidden rounded-2xl bg-card shadow-2xl shadow-black/15 ring-1 ring-black/5 dark:ring-white/10">
        <div class="flex items-center gap-3 bg-muted/60 px-4 py-2.5">
          <div class="flex gap-1.5" aria-hidden="true">
            <span class="size-2.5 rounded-full bg-muted-foreground/25" />
            <span class="size-2.5 rounded-full bg-muted-foreground/25" />
            <span class="size-2.5 rounded-full bg-muted-foreground/25" />
          </div>
          <p class="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">{t('landing.demo.title')}</p>
          <a href={props.url} target="_blank" rel="noopener noreferrer" class="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground" aria-label={t('landing.demo.open')}>
            <span class="hidden sm:inline">{t('landing.demo.open')}</span>
            <span class="i-tabler-arrow-up-right size-3.5" />
          </a>
        </div>
        <iframe ref={frame} src={initialUrl} onLoad={sendPreferences} title={t('landing.cta.demo')} loading="lazy" class="block h-[560px] w-full bg-background sm:aspect-video sm:h-auto" />
      </div>
    </div>
  );
};

export const LandingPage: Component = () => {
  useForcedLightTheme();

  const { t } = useI18n();
  const { config } = useConfig();

  const features = [
    { icon: 'i-tabler-file-invoice', title: t('landing.features.invoices.title'), description: t('landing.features.invoices.description') },
    { icon: 'i-tabler-files', title: t('landing.features.documents.title'), description: t('landing.features.documents.description') },
    { icon: 'i-tabler-sparkles', title: t('landing.features.ai.title'), description: t('landing.features.ai.description') },
  ];

  const PrimaryCta: Component = () => config.auth.isRegistrationEnabled
    ? (
        <Button as={A} href="/register" size="lg" class="rounded-full px-6">
          {t('landing.cta.start')}
          <span class="i-tabler-arrow-up-right size-4" />
        </Button>
      )
    : (
        <Button as={A} href="/login" size="lg" class="rounded-full px-6">
          {t('landing.cta.login')}
          <span class="i-tabler-arrow-right size-4" />
        </Button>
      );

  return (
    <div class="min-h-screen bg-background text-foreground selection:bg-primary/25">
      <section class="relative overflow-hidden">
        <div class="pointer-events-none absolute inset-0" aria-hidden="true">
          <ShaderGradient />
          <div class="absolute inset-0 bg-background/0 dark:bg-background/55" />
        </div>

        <header class="relative z-10 mx-auto flex h-18 max-w-6xl items-center justify-between px-5 sm:px-8">
          <AppLogo as={A} href="/" class="text-base" />
          <nav class="flex items-center gap-2">
            <LanguageToggleButton />
            <Button as={A} href="/login" variant="ghost" class="rounded-full">{t('landing.nav.login')}</Button>
            <Show when={config.auth.isRegistrationEnabled}>
              <Button as={A} href="/register" variant="outline" class="rounded-full bg-background/70 px-4">{t('landing.nav.start')}</Button>
            </Show>
          </nav>
        </header>

        <div class="relative z-10 mx-auto max-w-4xl px-5 pt-10 text-center sm:px-8 sm:pt-14">
          <h1 class="text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl">
            {t('landing.hero.title')}
            {' '}
            <span class="text-foreground/55">{t('landing.hero.title-muted')}</span>
          </h1>
          <p class="mx-auto mt-5 max-w-xl text-balance text-base leading-7 text-foreground/65 sm:text-lg">
            {t('landing.hero.description')}
          </p>
          <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta />
            <Button as="a" href="#demo" variant="outline" size="lg" class="rounded-full bg-background/70 px-6">
              {t('landing.cta.demo')}
              <span class="i-tabler-arrow-down size-4" />
            </Button>
          </div>
        </div>

        <div class="relative z-10 mt-10 pb-12 sm:mt-12 sm:pb-20">
          <DemoFrame url={buildTimeConfig.demo.url} />
        </div>
      </section>

      <Show when={SHOW_LANDING_FEATURES}>
        <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div class="grid gap-10 sm:grid-cols-3 sm:gap-8">
            <For each={features}>
              {feature => (
                <article>
                  <div class={`${feature.icon} mb-4 size-5 text-foreground/70`} />
                  <h2 class="text-base font-semibold tracking-tight">{feature.title}</h2>
                  <p class="mt-1.5 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </article>
              )}
            </For>
          </div>
        </section>
      </Show>

      <footer class="border-t">
        <div class="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-8">
          <div class="max-w-xs">
            <AppLogo class="text-sm" />
            <p class="mt-3 text-sm leading-6 text-muted-foreground">{t('app.description')}</p>
          </div>

          <nav aria-label={t('landing.footer.product')}>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('landing.footer.product')}</h3>
            <ul class="space-y-2 text-sm">
              <li><a href="#demo" class="text-foreground/80 transition hover:text-foreground">{t('landing.cta.demo')}</a></li>
              <li><A href="/login" class="text-foreground/80 transition hover:text-foreground">{t('landing.nav.login')}</A></li>
              <Show when={config.auth.isRegistrationEnabled}>
                <li><A href="/register" class="text-foreground/80 transition hover:text-foreground">{t('landing.nav.start')}</A></li>
              </Show>
            </ul>
          </nav>

          <nav aria-label={t('landing.footer.legal')}>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('landing.footer.legal')}</h3>
            <ul class="space-y-2 text-sm">
              <li><A href={createVitrineUrl({ path: 'terms-of-service' })} class="text-foreground/80 transition hover:text-foreground">{t('auth.legal-links.terms')}</A></li>
              <li><A href={createVitrineUrl({ path: 'privacy' })} class="text-foreground/80 transition hover:text-foreground">{t('auth.legal-links.privacy')}</A></li>
            </ul>
          </nav>
        </div>

        <div class="border-t">
          <div class="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>{t('landing.footer.rights', { year: new Date().getFullYear(), name: appBrand.name })}</p>
            <p>
              {t('landing.footer.by')}
              {' '}
              <a href={appAgency.url} target="_blank" rel="noopener noreferrer" class="font-medium text-foreground/80 underline-offset-4 transition hover:text-foreground hover:underline">{appAgency.name}</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
