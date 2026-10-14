import type { ParentComponent } from 'solid-js';
import { appBrand } from '@/modules/config/branding';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { ShaderGradient } from '@/modules/ui/components/shader-gradient';
import { AuthLayout } from '../../ui/layouts/auth-layout.component';

export const AuthBackgroundLayout: ParentComponent = (props) => {
  return (
    <AuthLayout
      background={(
        <>
          <ShaderGradient />
          <div class="absolute inset-0 bg-background/0 dark:bg-background/55" />
        </>
      )}
    >
      {props.children}
    </AuthLayout>
  );
};

export const AuthCard: ParentComponent = (props) => {
  const { t } = useI18n();

  return (
    <div class="flex items-center justify-center min-h-[calc(100vh-84px)] px-4 py-8 sm:px-8 sm:py-12">
      <div class="w-full max-w-5xl overflow-hidden rounded-2xl bg-background shadow-xl shadow-foreground/5 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div class="px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
          {props.children}
        </div>

        <aside class="hidden lg:flex bg-foreground text-background p-10 xl:p-12 flex-col justify-between relative overflow-hidden min-h-620px">
          <div class="absolute -top-20 -right-20 size-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
          <div class="relative">
            <div class="inline-flex items-center gap-2 rounded-full border border-background/15 px-3 py-1.5 text-xs text-background/65">
              <span class="size-1.5 rounded-full bg-primary" />
              {appBrand.name}
            </div>
            <h2 class="text-3xl xl:text-4xl font-semibold tracking-[-0.04em] leading-tight mt-7 text-balance">
              {t('auth.login.panel.title')}
            </h2>
            <p class="mt-4 text-sm leading-6 text-background/60 max-w-sm">{t('auth.login.panel.description')}</p>
          </div>

          <div class="relative rounded-2xl border border-background/12 bg-background/6 p-4 backdrop-blur">
            <div class="flex items-center justify-between mb-4">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-background/45">{t('auth.login.panel.workspace')}</p>
                <p class="text-sm font-medium mt-1">{t('auth.login.panel.activity')}</p>
              </div>
              <div class="size-8 rounded-lg bg-primary/18 text-primary grid place-items-center">
                <span class="i-tabler-sparkles size-4" />
              </div>
            </div>
            <div class="space-y-2">
              <div class="rounded-xl bg-background/8 p-3 flex items-center gap-3">
                <span class="i-tabler-file-invoice size-4 text-primary" />
                <div class="flex-1">
                  <div class="h-1.5 w-28 rounded-full bg-background/45" />
                  <div class="h-1 w-18 rounded-full bg-background/15 mt-2" />
                </div>
                <span class="i-tabler-check size-4 text-primary" />
              </div>
              <div class="rounded-xl bg-background/8 p-3 flex items-center gap-3">
                <span class="i-tabler-receipt size-4 text-primary" />
                <div class="flex-1">
                  <div class="h-1.5 w-36 rounded-full bg-background/45" />
                  <div class="h-1 w-22 rounded-full bg-background/15 mt-2" />
                </div>
                <span class="text-[10px] text-background/40">PDF</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
