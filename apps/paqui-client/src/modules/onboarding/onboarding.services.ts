import type { OnboardingFlowId } from './onboarding.steps';
import { apiClient } from '../shared/http/api-client';

export type OnboardingStatus = {
  /** The onboarding the user still has to go through, if any. */
  flow: Exclude<OnboardingFlowId, 'new-organization'> | null;
  user: { completedAt: string | null; step: string | null };
  /** Companies the user owns or administers whose setup is not finished, oldest first. */
  pendingOrganizations: { id: string; name: string; step: string | null }[];
  pendingInvitationsCount: number;
};

export async function fetchOnboardingStatus() {
  return apiClient<OnboardingStatus>({
    path: '/api/onboarding',
    method: 'GET',
  });
}

export async function updateUserOnboarding({ completed, step = null }: { completed: boolean; step?: string | null }) {
  await apiClient({
    path: '/api/onboarding',
    method: 'PUT',
    body: { completed, step },
  });
}

export async function updateOrganizationOnboarding({ organizationId, completed, step = null }: { organizationId: string; completed: boolean; step?: string | null }) {
  await apiClient({
    path: `/api/organizations/${organizationId}/onboarding`,
    method: 'PUT',
    body: { completed, step },
  });
}
