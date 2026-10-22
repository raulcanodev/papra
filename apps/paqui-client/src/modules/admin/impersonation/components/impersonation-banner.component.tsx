import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { stopImpersonation } from '../impersonation.services';

// Always on screen while an admin acts as someone else, so it is never forgotten, with the way back
export const ImpersonationBanner: Component = () => {
  const { t } = useI18n();
  const { getUser, getImpersonation } = useSession();
  const [getIsStopping, setIsStopping] = createSignal(false);

  const stop = async () => {
    setIsStopping(true);
    await stopImpersonation();
  };

  // Back to the admin account by itself when the hour is over, instead of landing on the login page
  createEffect(() => {
    const impersonation = getImpersonation();

    if (!impersonation) {
      return;
    }

    const timeout = setTimeout(() => void stop(), Math.max(0, impersonation.expiresAt.getTime() - Date.now()));
    onCleanup(() => clearTimeout(timeout));
  });

  return (
    <Show when={getImpersonation()}>
      {impersonation => (
        <div class="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-amber-950 shadow-lg dark:bg-amber-950 dark:text-amber-50">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <div class="i-tabler-user-shield size-5 shrink-0" />
              <p class="text-sm">
                {t('admin.impersonation.banner', {
                  name: getUser()?.name || getUser()?.email || '',
                  time: impersonation().expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                })}
              </p>
            </div>
            <Button size="sm" onClick={() => void stop()} isLoading={getIsStopping()}>
              {t('admin.impersonation.stop')}
            </Button>
          </div>
        </div>
      )}
    </Show>
  );
};
