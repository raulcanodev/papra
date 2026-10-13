import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { appBrand } from '@/modules/config/branding';
import { useConfig } from '@/modules/config/config.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { AppLogo } from '@/modules/ui/components/app-logo';
import { Button } from '@/modules/ui/components/button';

const Feature: Component<{ icon: string; title: string; description: string }> = props => (
  <article class="border-t border-border/80 pt-6">
    <div class="size-10 rounded-xl border border-primary/20 bg-primary/10 text-primary flex items-center justify-center mb-5">
      <div class={`${props.icon} size-5`} />
    </div>
    <h3 class="text-base font-semibold tracking-tight">{props.title}</h3>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">{props.description}</p>
  </article>
);

const ProductPreview: Component = () => {
  const { t } = useI18n();

  const documents = [
    { icon: 'i-tabler-file-invoice', name: t('landing.preview.invoice'), detail: 'PDF · 124 KB', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    { icon: 'i-tabler-file-description', name: t('landing.preview.contract'), detail: 'PDF · 86 KB', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
    { icon: 'i-tabler-receipt', name: t('landing.preview.receipt'), detail: 'JPG · 1.2 MB', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  ];

  return (
    <div class="relative mx-auto w-full max-w-5xl px-4 sm:px-8">
      <div class="absolute inset-x-16 -inset-y-8 bg-primary/20 blur-3xl rounded-full" aria-hidden="true" />
      <div class="relative overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl shadow-foreground/8">
        <div class="h-11 border-b bg-muted/30 flex items-center px-4 gap-1.5">
          <span class="size-2.5 rounded-full bg-foreground/15" />
          <span class="size-2.5 rounded-full bg-foreground/15" />
          <span class="size-2.5 rounded-full bg-foreground/15" />
          <span class="ml-3 text-[11px] text-muted-foreground font-medium">{appBrand.name}</span>
        </div>

        <div class="grid min-h-420px md:grid-cols-[200px_1fr]">
          <aside class="hidden border-r bg-muted/20 p-4 md:block">
            <AppLogo class="mb-8 text-sm" />
            <div class="space-y-1.5 text-xs">
              <div class="rounded-lg bg-primary/12 text-foreground px-3 py-2.5 flex items-center gap-2.5 font-medium">
                <span class="i-tabler-home size-4 text-primary" />
                {t('landing.preview.overview')}
              </div>
              <div class="rounded-lg px-3 py-2.5 flex items-center gap-2.5 text-muted-foreground">
                <span class="i-tabler-files size-4" />
                {t('landing.preview.documents')}
              </div>
              <div class="rounded-lg px-3 py-2.5 flex items-center gap-2.5 text-muted-foreground">
                <span class="i-tabler-receipt-2 size-4" />
                {t('landing.preview.invoices')}
              </div>
              <div class="rounded-lg px-3 py-2.5 flex items-center gap-2.5 text-muted-foreground">
                <span class="i-tabler-chart-donut size-4" />
                {t('landing.preview.finances')}
              </div>
            </div>
          </aside>

          <div class="p-5 sm:p-8">
            <div class="flex items-start justify-between gap-4 mb-8">
              <div>
                <p class="text-xs text-muted-foreground mb-1">{t('landing.preview.greeting')}</p>
                <h2 class="text-xl font-semibold tracking-tight">{t('landing.preview.workspace')}</h2>
              </div>
              <div class="size-9 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold">AZ</div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3 mb-8">
              <div class="rounded-xl border p-4">
                <span class="text-xs text-muted-foreground">{t('landing.preview.stat.documents')}</span>
                <p class="text-2xl font-semibold mt-2">248</p>
                <span class="text-[11px] text-primary">{t('landing.preview.added-this-month')}</span>
              </div>
              <div class="rounded-xl border p-4">
                <span class="text-xs text-muted-foreground">{t('landing.preview.stat.pending')}</span>
                <p class="text-2xl font-semibold mt-2">4</p>
                <span class="text-[11px] text-muted-foreground">{t('landing.preview.to-review')}</span>
              </div>
              <div class="rounded-xl border p-4">
                <span class="text-xs text-muted-foreground">{t('landing.preview.stat.organized')}</span>
                <p class="text-2xl font-semibold mt-2">96%</p>
                <span class="text-[11px] text-muted-foreground">{t('landing.preview.up-to-date')}</span>
              </div>
            </div>

            <div class="rounded-xl border overflow-hidden">
              <div class="px-4 py-3 border-b flex items-center justify-between bg-muted/20">
                <span class="text-xs font-semibold">{t('landing.preview.recent')}</span>
                <span class="text-[11px] text-primary">{t('landing.preview.view-all')}</span>
              </div>
              <For each={documents}>
                {document => (
                  <div class="px-4 py-3 flex items-center gap-3 border-b last:border-b-0">
                    <div class={`size-8 rounded-lg grid place-items-center ${document.color}`}>
                      <span class={`${document.icon} size-4`} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-medium truncate">{document.name}</p>
                      <p class="text-[10px] text-muted-foreground">{document.detail}</p>
                    </div>
                    <span class="i-tabler-dots size-4 text-muted-foreground" />
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LandingPage: Component = () => {
  const { config } = useConfig();
  const { t } = useI18n();

  const features = [
    { icon: 'i-tabler-files', title: t('landing.features.documents.title'), description: t('landing.features.documents.description') },
    { icon: 'i-tabler-wand', title: t('landing.features.automation.title'), description: t('landing.features.automation.description') },
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
      <header class="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div class="mx-auto max-w-6xl h-18 px-5 sm:px-8 flex items-center justify-between">
          <AppLogo as={A} href="/" class="text-base" />
          <nav class="flex items-center gap-2">
            <a href="#features" class="hidden sm:inline-flex px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition">{t('landing.nav.features')}</a>
            <Button as={A} href="/login" variant="ghost" class="rounded-full">{t('landing.nav.login')}</Button>
            <Show when={config.auth.isRegistrationEnabled}>
              <Button as={A} href="/register" class="rounded-full px-4">{t('landing.nav.start')}</Button>
            </Show>
          </nav>
        </div>
      </header>

      <main>
        <section class="relative overflow-hidden pt-20 sm:pt-28">
          <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.17),transparent_42%)]" aria-hidden="true" />
          <div class="mx-auto max-w-4xl px-5 sm:px-8 text-center">
            <div class="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm mb-7">
              <span class="size-1.5 rounded-full bg-primary" />
              {t('landing.eyebrow')}
            </div>
            <h1 class="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.045em] leading-[1.02] text-balance">
              {t('landing.hero.title')}
              <span class="block text-muted-foreground">{t('landing.hero.title-muted')}</span>
            </h1>
            <p class="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-7 text-muted-foreground text-balance">
              {t('landing.hero.description')}
            </p>
            <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <PrimaryCta />
              <Button as="a" href="#product" variant="outline" size="lg" class="rounded-full px-6 bg-background/70">
                {t('landing.cta.explore')}
                <span class="i-tabler-arrow-down size-4" />
              </Button>
            </div>
          </div>

          <div id="product" class="mt-20 sm:mt-24 pb-20 scroll-mt-24">
            <ProductPreview />
          </div>
        </section>

        <section id="features" class="border-y bg-muted/15 py-20 sm:py-28 scroll-mt-20">
          <div class="mx-auto max-w-6xl px-5 sm:px-8">
            <div class="grid gap-10 lg:grid-cols-[0.9fr_1.6fr] lg:gap-20">
              <div>
                <p class="text-xs uppercase tracking-[0.18em] font-semibold text-primary mb-4">{t('landing.features.eyebrow')}</p>
                <h2 class="text-3xl sm:text-4xl font-semibold tracking-[-0.035em] text-balance">{t('landing.features.title')}</h2>
                <p class="mt-4 text-muted-foreground leading-7">{t('landing.features.description')}</p>
              </div>
              <div class="grid gap-8 sm:grid-cols-3">
                <For each={features}>{feature => <Feature {...feature} />}</For>
              </div>
            </div>
          </div>
        </section>

        <section class="py-20 sm:py-28">
          <div class="mx-auto max-w-5xl px-5 sm:px-8">
            <div class="rounded-3xl border bg-foreground text-background px-6 py-14 sm:px-14 sm:py-16 overflow-hidden relative">
              <div class="absolute -right-24 -top-28 size-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
              <div class="relative max-w-2xl">
                <p class="text-xs uppercase tracking-[0.18em] font-semibold text-primary mb-4">{appBrand.name}</p>
                <h2 class="text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-balance">{t('landing.final.title')}</h2>
                <p class="mt-5 text-background/65 leading-7 max-w-xl">{t('landing.final.description')}</p>
                <div class="mt-8"><PrimaryCta /></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="border-t">
        <div class="mx-auto max-w-6xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <AppLogo class="text-sm" />
          <p class="text-xs text-muted-foreground">{t('app.description')}</p>
        </div>
      </footer>
    </div>
  );
};
