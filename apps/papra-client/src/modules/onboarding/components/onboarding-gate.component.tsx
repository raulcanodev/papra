import type { ParentComponent } from 'solid-js';
import { Navigate, useLocation } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Match, Switch } from 'solid-js';
import { fetchOnboardingStatus } from '../onboarding.services';

// Pages reachable before finishing onboarding: the onboarding itself and the user's own settings.
const ALLOWED_PATHS = [/^\/onboarding/, /^\/settings/, /^\/admin/];

/** Sends signed-in users who have not finished onboarding to it. */
export const OnboardingGate: ParentComponent = (props) => {
  const location = useLocation();
  const query = useQuery(() => ({
    queryKey: ['onboarding'],
    queryFn: fetchOnboardingStatus,
  }));

  const isAllowedPath = () => ALLOWED_PATHS.some(path => path.test(location.pathname));

  return (
    <Switch fallback={props.children}>
      <Match when={query.isLoading && !isAllowedPath()}>
        <div class="min-h-screen grid place-items-center">
          <div class="size-6 i-tabler-loader-2 animate-spin text-primary" />
        </div>
      </Match>
      <Match when={query.data?.flow && !isAllowedPath()}>
        <Navigate href="/onboarding" />
      </Match>
    </Switch>
  );
};
