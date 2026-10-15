import type { ParentComponent } from 'solid-js';
import { Navigate, useLocation } from '@solidjs/router';
import { Match, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { LandingPage } from '@/modules/shared/pages/landing.page';
import { AppLoader } from '@/modules/ui/components/app-loader';
import { CurrentUserProvider } from '@/modules/users/composables/useCurrentUser';
import { useSession } from '../composables/use-session.composable';
import { readSessionHint } from '../session-hint';

export const AppEntryGate: ParentComponent = (props) => {
  const { t } = useI18n();
  const location = useLocation();
  const { getIsAuthenticated, sessionQuery } = useSession();
  // A visitor on the landing gets it instantly: no session to wait for, nothing to load
  const isVisitorOnLanding = () => location.pathname === '/' && !readSessionHint();

  return (
    <Switch>
      <Match when={sessionQuery.isLoading && !isVisitorOnLanding()}>
        <AppLoader label={t('app.loading')} />
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
