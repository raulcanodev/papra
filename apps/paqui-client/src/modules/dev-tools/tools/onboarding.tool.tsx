import type { Component } from 'solid-js';
import type { OnboardingFlowId } from '@/modules/onboarding/onboarding.steps';
import { useLocation, useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { fetchOnboardingStatus, updateOrganizationOnboarding, updateUserOnboarding } from '@/modules/onboarding/onboarding.services';
import { getFlowSteps, isOnboardingFlow, ONBOARDING_FLOWS, ONBOARDING_STEPS } from '@/modules/onboarding/onboarding.steps';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';

export function getOrganizationIdFromPath(pathname: string) {
  return pathname.match(/^\/organizations\/(org_[a-zA-Z0-9]+)/)?.[1] ?? null;
}

/** Sends the signed-in user back into onboarding at any step, or marks it as done. */
export const OnboardingTool: Component = () => {
  const { getIsAuthenticated, sessionQuery } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useQuery(() => ({
    queryKey: ['onboarding'],
    queryFn: fetchOnboardingStatus,
    enabled: getIsAuthenticated(),
  }));
  const [flow, setFlow] = createSignal<OnboardingFlowId>('new-user');
  const [step, setStep] = createSignal<string>(ONBOARDING_FLOWS['new-user'][0]);
  const [isPending, setIsPending] = createSignal(false);

  const organizationId = () => getOrganizationIdFromPath(location.pathname) ?? query.data?.pendingOrganizations[0]?.id ?? null;

  async function run(action: () => Promise<string>) {
    setIsPending(true);
    try {
      const destination = await action();
      await queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      // An open onboarding keeps the state it started with: reload it to apply the new one.
      if (location.pathname === '/onboarding' || location.pathname.endsWith('/setup')) {
        window.location.href = destination;
        return;
      }
      navigate(destination);
    } finally {
      setIsPending(false);
    }
  }

  const force = () => run(async () => {
    const id = organizationId();
    const isCompanyStep = ONBOARDING_STEPS[step() as keyof typeof ONBOARDING_STEPS]?.scope === 'organization';

    if (flow() === 'new-organization') {
      if (!id) {
        return '/organizations/create';
      }
      await updateOrganizationOnboarding({ organizationId: id, completed: false, step: step() });
      return `/organizations/${id}/setup`;
    }

    await updateUserOnboarding({ completed: false, step: step() });
    if (id && isCompanyStep) {
      await updateOrganizationOnboarding({ organizationId: id, completed: false, step: step() });
    }
    // The server picks the flow from the account; the query parameter previews another one.
    return flow() === query.data?.flow ? '/onboarding' : `/onboarding?flow=${flow()}`;
  });

  const complete = () => run(async () => {
    const id = organizationId();
    await updateUserOnboarding({ completed: true });
    if (id) {
      await updateOrganizationOnboarding({ organizationId: id, completed: true });
    }
    return id ? `/organizations/${id}` : '/';
  });

  return (
    <Show when={!sessionQuery.isLoading} fallback={<p class="text-xs text-muted-foreground">Loading…</p>}>
      <Show when={getIsAuthenticated()} fallback={<p class="text-xs text-muted-foreground">Sign in to use this tool.</p>}>
        <div class="grid gap-3">
          <div class="grid gap-0.5 text-xs text-muted-foreground">
            <span>
              {'User: '}
              {query.data?.user.completedAt ? 'completed' : `in progress · ${query.data?.user.step ?? 'start'}`}
              {query.data?.flow ? ` (${query.data.flow})` : ''}
            </span>
            <For each={query.data?.pendingOrganizations ?? []}>
              {organization => <span class="truncate">{`Pending company: ${organization.name} · ${organization.step ?? 'start'}`}</span>}
            </For>
            <Show when={organizationId()}>
              <span class="truncate">{`Target company: ${organizationId()}`}</span>
            </Show>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="grid gap-1 text-xs">
              <span class="text-muted-foreground">Flow</span>
              <SimpleSelect
                triggerClass="h-8 px-2"
                value={flow()}
                disabled={isPending()}
                onChange={(value) => {
                  if (isOnboardingFlow(value)) {
                    setFlow(value);
                    setStep(ONBOARDING_FLOWS[value][0]);
                  }
                }}
                options={Object.keys(ONBOARDING_FLOWS).map(id => ({ value: id, label: id }))}
              />
            </label>
            <label class="grid gap-1 text-xs">
              <span class="text-muted-foreground">Step</span>
              <SimpleSelect
                triggerClass="h-8 px-2"
                value={step()}
                disabled={isPending()}
                onChange={setStep}
                options={getFlowSteps(flow()).map((item, index) => ({ value: item.id, label: `${index + 1}. ${item.id}` }))}
              />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Button size="sm" variant="primary" class="min-w-0" disabled={isPending()} onClick={force}>Force</Button>
            <Button size="sm" variant="outline" class="min-w-0" disabled={isPending()} onClick={complete}>Complete</Button>
          </div>
        </div>
      </Show>
    </Show>
  );
};
