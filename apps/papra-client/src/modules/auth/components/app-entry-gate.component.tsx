import type { ParentComponent } from 'solid-js';
import { Navigate, useLocation } from '@solidjs/router';
import { Match, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { LandingPage } from '@/modules/shared/pages/landing.page';
import { CurrentUserProvider } from '@/modules/users/composables/useCurrentUser';
import { useSession } from '../composables/use-session.composable';

export const AppEntryGate: ParentComponent = (props) => {
  const { t } = useI18n();
  const location = useLocation();
  const { getIsAuthenticated, sessionQuery } = useSession();

  return (
    <Switch>
      <Match when={sessionQuery.isLoading}>
        <div class="min-h-screen grid place-items-center" aria-label={t('app.loading')}>
          <div class="size-6 i-tabler-loader-2 animate-spin text-primary" />
        </div>
      </Match>
      <Match when={getIsAuthenticated()}>
        <CurrentUserProvider>{props.children}</CurrentUserProvider>
      </Match>
      <Match when={location.pathname === '/'}>
        <LandingPage />
      </Match>
      <Match when={!getIsAuthenticated()}>
        <Navigate href="/login" />
      </Match>
    </Switch>
  );
};
