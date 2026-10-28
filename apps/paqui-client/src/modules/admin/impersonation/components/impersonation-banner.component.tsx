import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { stopImpersonation } from '../impersonation.services';

// How many app shells show the strip right now: the floating fallback only shows on screens without one
const [getMountedStripCount, setMountedStripCount] = createSignal(0);

function useStopImpersonation() {
  const [getIsStopping, setIsStopping] = createSignal(false);

  const stop = async () => {
    setIsStopping(true);
    await stopImpersonation();
  };

  return { stop, getIsStopping };
}

const ImpersonationNotice: Component<{ class?: string }> = (props) => {
  const { t } = useI18n();
  const { getUser, getImpersonation } = useSession();
  const { stop, getIsStopping } = useStopImpersonation();

  return (
    <Show when={getImpersonation()}>
      {impersonation => (
        <div class={cn('flex items-center gap-2 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50', props.class)}>
          <div class="i-tabler-user-shield size-4 shrink-0" />
          <p class="min-w-0 flex-1 truncate text-xs">
            {t('admin.impersonation.banner', {
              name: getUser()?.name || getUser()?.email || '',
              time: impersonation().expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })}
          </p>
          <span
            class={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              impersonation().canWrite ? 'bg-red-600 text-white' : 'bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50',
            )}
          >
            <div class={cn('size-3.5', impersonation().canWrite ? 'i-tabler-pencil' : 'i-tabler-eye')} />
            {impersonation().canWrite ? t('admin.impersonation.mode.can-write') : t('admin.impersonation.mode.read-only')}
          </span>
          <Button size="sm" variant="ghost" class="h-7 shrink-0 px-2 text-xs hover:bg-amber-200/60 dark:hover:bg-amber-800/60" onClick={() => void stop()} isLoading={getIsStopping()}>
            {t('admin.impersonation.stop')}
          </Button>
        </div>
      )}
    </Show>
  );
};

// A slim strip at the top of the app shell, above the header, so it never covers the menus (the tab bar on phones)
export const ImpersonationStrip: Component = () => {
  onMount(() => {
    setMountedStripCount(count => count + 1);
    onCleanup(() => setMountedStripCount(count => count - 1));
  });

  return <ImpersonationNotice class="shrink-0 border-b border-amber-500/40 py-1 pl-3 pr-1" />;
};

// Always running while an admin acts as someone else: brings them back by itself when the hour is over, and
// shows the notice at the top of the few screens that have no app shell (pushing them down), so it is never forgotten
export const ImpersonationBanner: Component = () => {
  const { getImpersonation } = useSession();
  const { stop } = useStopImpersonation();

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
    <Show when={getMountedStripCount() === 0}>
      <ImpersonationNotice class="sticky top-0 z-50 border-b border-amber-500/40 pb-1 pl-3 pr-1 pt-[calc(0.25rem+env(safe-area-inset-top))]" />
    </Show>
  );
};
