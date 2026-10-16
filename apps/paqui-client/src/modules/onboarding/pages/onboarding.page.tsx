import type { Component } from 'solid-js';
import type { OnboardingStatus } from '../onboarding.services';
import { Navigate, useParams, useSearchParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, Match, Switch } from 'solid-js';
import { OnboardingFlow } from '../components/onboarding-flow.component';
import { fetchOnboardingStatus } from '../onboarding.services';
import { isOnboardingFlow } from '../onboarding.steps';

const Loading: Component = () => (
  <div class="min-h-screen grid place-items-center">
    <div class="size-6 i-tabler-loader-2 animate-spin text-primary" />
  </div>
);

/** The onboarding status when the page opened: later refetches must not restart or close a flow in progress. */
function useInitialOnboardingStatus({ enabled = () => true }: { enabled?: () => boolean } = {}) {
  const query = useQuery(() => ({
    queryKey: ['onboarding'],
    queryFn: fetchOnboardingStatus,
    enabled: enabled(),
  }));
  const [getStatus, setStatus] = createSignal<OnboardingStatus>();

  createEffect(() => {
    if (query.data && !getStatus()) {
      setStatus(query.data);
    }
  });

  return { getStatus };
}

/** First-run onboarding: setting up the user's company, or joining the one they were invited to. */
export const OnboardingPage: Component = () => {
  const { getStatus } = useInitialOnboardingStatus();
  const [searchParams] = useSearchParams();
  // Local development only: `?flow=invited-user` previews a flow the account would not get (see dev tools).
  const getPreviewFlow = () => (import.meta.env.DEV && isOnboardingFlow(searchParams.flow) ? searchParams.flow : null);
  const getFlow = () => getPreviewFlow() ?? getStatus()?.flow;

  return (
    <Switch fallback={<Loading />}>
      <Match when={getStatus() && !getFlow()}>
        <Navigate href="/" />
      </Match>
      <Match when={getFlow() === 'new-organization'}>
        <OnboardingFlow flow="new-organization" />
      </Match>
      <Match when={getFlow() === 'invited-user' && getStatus()}>
        {status => <OnboardingFlow flow="invited-user" initialStep={status().user.step} />}
      </Match>
      <Match when={getFlow() === 'new-user' && getStatus()}>
        {status => (
          <OnboardingFlow
            flow="new-user"
            initialStep={status().user.step}
            initialOrganizationId={status().pendingOrganizations[0]?.id ?? null}
          />
        )}
      </Match>
    </Switch>
  );
};

/** Setting up another company: `/organizations/create`, or resuming one at `/organizations/:organizationId/setup`. */
export const OrganizationSetupPage: Component = () => {
  const params = useParams();
  const { getStatus } = useInitialOnboardingStatus({ enabled: () => Boolean(params.organizationId) });
  const getPending = () => getStatus()?.pendingOrganizations.find(organization => organization.id === params.organizationId);

  return (
    <Switch fallback={<Loading />}>
      <Match when={!params.organizationId}>
        <OnboardingFlow flow="new-organization" />
      </Match>
      <Match when={getPending()}>
        {pending => <OnboardingFlow flow="new-organization" initialOrganizationId={pending().id} initialStep={pending().step} />}
      </Match>
      {/* Already set up, or not theirs to set up */}
      <Match when={getStatus()}>
        <Navigate href={`/organizations/${params.organizationId}`} />
      </Match>
    </Switch>
  );
};
