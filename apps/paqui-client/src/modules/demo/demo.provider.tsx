import type { Component } from 'solid-js';
import { createSignal, Match, Switch } from 'solid-js';
import { Portal } from 'solid-js/web';
import { buildTimeConfig } from '../config/config';
import { useI18n } from '../i18n/i18n.provider';
import { Button } from '../ui/components/button';
import { useDemoEmbedSync } from './demo-embed-sync';
import { clearDemoStorage } from './demo.storage';

export const DemoIndicator: Component = () => {
  const [getPopupState, setPopupState] = createSignal<'minified' | 'expanded' | 'hidden'>('minified');
  const { t } = useI18n();

  useDemoEmbedSync();

  const clearDemo = async () => {
    await clearDemoStorage();
    // Navigate to / forcing a full reload
    window.location.href = '/';
  };

  const switchToStateUnlessCtrl = (state: 'minified' | 'expanded') => (e: MouseEvent) => {
    if (e.ctrlKey) {
      setPopupState('hidden');
      return;
    }

    setPopupState(state);
  };

  return (
    <Portal>
      <Switch>
        <Match when={getPopupState() === 'minified'}>
          <div class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 md:bottom-4 -translate-x-1/2 rounded-xl max-w-280px">
            <Button onClick={switchToStateUnlessCtrl('expanded')} size="icon">
              <div class="i-tabler-info-circle size-5.5" />
            </Button>
          </div>
        </Match>

        <Match when={getPopupState() === 'expanded'}>
          <div class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 md:bottom-4 border bg-popover text-popover-foreground p-5 py-4 rounded-xl shadow-lg shadow-black/10 max-w-300px">
            <p class="text-sm">
              {t('demo.popup.description')}
            </p>
            <div class="flex flex-wrap justify-end mt-4 gap-2">
              <Button variant="ghost" onClick={clearDemo} size="sm">
                {t('demo.popup.reset')}
              </Button>

              <Button onClick={switchToStateUnlessCtrl('minified')} variant="outline" size="sm">
                {t('demo.popup.hide')}
              </Button>

              <Button as="a" href={buildTimeConfig.demo.signupUrl} target="_top" size="sm">
                {t('demo.popup.cta')}
              </Button>
            </div>
          </div>
        </Match>
      </Switch>
    </Portal>
  );
};
