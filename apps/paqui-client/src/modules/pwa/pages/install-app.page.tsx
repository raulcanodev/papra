import type { Component } from 'solid-js';
import { For, Match, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { QrCode } from '@/modules/ui/components/qr-code';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { usePwaInstall } from '../pwa.install';

export const InstallAppPage: Component = () => {
  const { t } = useI18n();
  const { isInstalled, canPromptInstall, isIos, promptInstall } = usePwaInstall();

  const install = async () => {
    const { isAccepted } = await promptInstall();

    if (isAccepted) {
      createToast({ type: 'success', message: t('pwa.install.accepted') });
    }
  };

  const benefits = () => [
    { icon: 'i-tabler-device-mobile', label: t('pwa.install.benefits.home-screen') },
    { icon: 'i-tabler-arrows-maximize', label: t('pwa.install.benefits.full-screen') },
    { icon: 'i-tabler-camera', label: t('pwa.install.benefits.camera') },
  ];

  return (
    <div class="page-narrow">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('pwa.install.page.title')}</h1>
          <p class="page-description">{t('pwa.install.page.description')}</p>
        </div>
      </div>

      <SettingsSections>
        <SettingsSection title={t('pwa.install.section.title')} description={t('pwa.install.section.description')}>
          <ul class="grid gap-2">
            <For each={benefits()}>
              {benefit => (
                <li class="flex items-center gap-2 text-sm">
                  <div class={`${benefit.icon} size-4 shrink-0 text-muted-foreground`} />
                  {benefit.label}
                </li>
              )}
            </For>
          </ul>

          <Switch>
            <Match when={isInstalled()}>
              <div class="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm">
                <div class="i-tabler-circle-check size-4 shrink-0 text-primary" />
                {t('pwa.install.installed')}
              </div>
            </Match>

            <Match when={canPromptInstall()}>
              <div>
                <Button onClick={install}>
                  <div class="i-tabler-download size-4 mr-2" />
                  {t('pwa.install.button')}
                </Button>
              </div>
            </Match>

            <Match when={isIos()}>
              <div>
                <h3 class="text-sm font-medium">{t('pwa.install.ios.title')}</h3>
                <ol class="mt-3 grid gap-2.5 text-sm">
                  <li class="flex items-center gap-2.5">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
                    <span class="flex-1">{t('pwa.install.ios.step-1')}</span>
                    <div class="i-tabler-share-2 size-4 shrink-0 text-muted-foreground" />
                  </li>
                  <li class="flex items-center gap-2.5">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                    <span class="flex-1">{t('pwa.install.ios.step-2')}</span>
                    <div class="i-tabler-square-plus size-4 shrink-0 text-muted-foreground" />
                  </li>
                  <li class="flex items-center gap-2.5">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
                    <span class="flex-1">{t('pwa.install.ios.step-3')}</span>
                  </li>
                </ol>
              </div>
            </Match>

            <Match when={true}>
              <div>
                <h3 class="text-sm font-medium">{t('pwa.install.manual.title')}</h3>
                <p class="mt-1 text-sm text-muted-foreground">{t('pwa.install.manual.description')}</p>
              </div>
            </Match>
          </Switch>
        </SettingsSection>

        {/* On a computer, the phone opens this same page from the QR code to install it there too */}
        <Show when={!isIos() && window.matchMedia('(pointer: fine)').matches}>
          <SettingsSection title={t('pwa.install.other-device.title')} description={t('pwa.install.other-device.description')}>
            <QrCode value={window.location.href} class="size-36 rounded-lg border bg-white p-2 [&>svg]:size-full" />
          </SettingsSection>
        </Show>
      </SettingsSections>
    </div>
  );
};
