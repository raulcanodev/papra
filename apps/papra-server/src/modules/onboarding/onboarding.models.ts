import type { OrganizationRole } from '../organizations/organizations.types';
import { ORGANIZATION_ROLES } from '../organizations/organizations.constants';

export type OnboardingFlow = 'new-user' | 'invited-user';

/**
 * Which onboarding a user who has not finished it gets:
 * - invited-user: someone who joined (or was invited to) an existing organization; only sets up their profile.
 * - new-user: someone who signed up on their own; sets up their profile and their company.
 */
export function getUserOnboardingFlow({
  onboardingCompletedAt,
  memberships,
  pendingInvitationsCount,
}: {
  onboardingCompletedAt: Date | null;
  memberships: { role: OrganizationRole }[];
  pendingInvitationsCount: number;
}): OnboardingFlow | null {
  if (onboardingCompletedAt) {
    return null;
  }

  const ownsAnOrganization = memberships.some(({ role }) => role === ORGANIZATION_ROLES.OWNER);
  const joinedAnOrganization = memberships.some(({ role }) => role !== ORGANIZATION_ROLES.OWNER);

  if (!ownsAnOrganization && (joinedAnOrganization || pendingInvitationsCount > 0)) {
    return 'invited-user';
  }

  return 'new-user';
}

/** Owners and admins set up the company; members never see the organization onboarding. */
export function canManageOrganizationOnboarding({ role }: { role: OrganizationRole }) {
  return role === ORGANIZATION_ROLES.OWNER || role === ORGANIZATION_ROLES.ADMIN;
}
