import type { ParentComponent } from 'solid-js';
import { Navigate, useLocation } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Match, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { AppLoader } from '@/modules/ui/components/app-loader';
import { fetchOnboardingStatus } from '../onboarding.services';

// Pages reachable before finishing onboarding: the onboarding itself, the user's own settings and the gestoría
// workspace (its members have no onboarding, the server never asks them for one).
const ALLOWED_PATHS = [/^\/onboarding/, /^\/settings/, /^\/admin/, /^\/gestoria\//];

/** Sends signed-in users who have not finished onboarding to it. */
export const OnboardingGate: ParentComponent = (props) => {
  const location = useLocation();
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ['onboarding'],
    queryFn: fetchOnboardingStatus,
  }));

  const isAllowedPath = () => ALLOWED_PATHS.some(path => path.test(location.pathname));

  return (
    <Switch fallback={props.children}>
      <Match when={query.isLoading && !isAllowedPath()}>
        {/* The same loader as the boot: one continuous loading, not a logo followed by a spinner */}
        <AppLoader label={t('app.loading')} />
      </Match>
      <Match when={query.data?.flow && !isAllowedPath()}>
        <Navigate href="/onboarding" />
      </Match>
    </Switch>
  );
};
