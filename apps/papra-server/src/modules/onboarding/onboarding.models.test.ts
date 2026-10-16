import { describe, expect, test } from 'vitest';
import { canManageOrganizationOnboarding, getUserOnboardingFlow } from './onboarding.models';

describe('onboarding models', () => {
  describe('getUserOnboardingFlow', () => {
    test('a user who finished onboarding has no flow', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: new Date(), memberships: [], pendingInvitationsCount: 3 })).to.eql(null);
    });

    test('a user without organizations nor invitations sets up their company', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [], pendingInvitationsCount: 0 })).to.eql('new-user');
    });

    test('a user with pending invitations and no organization of their own gets the invited flow', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [], pendingInvitationsCount: 1 })).to.eql('invited-user');
    });

    test('a user who already joined an organization as member or admin gets the invited flow', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [{ role: 'member' }], pendingInvitationsCount: 0 })).to.eql('invited-user');
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [{ role: 'admin' }], pendingInvitationsCount: 0 })).to.eql('invited-user');
    });

    test('a user who owns an organization keeps setting up their company, even with invitations', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [{ role: 'owner' }, { role: 'member' }], pendingInvitationsCount: 2 })).to.eql('new-user');
    });

    test('someone working at a gestoría has no onboarding, an admin already set up their access', () => {
      expect(getUserOnboardingFlow({ onboardingCompletedAt: null, memberships: [], pendingInvitationsCount: 0, isGestoriaMember: true })).to.eql(null);
    });
  });

  describe('canManageOrganizationOnboarding', () => {
    test('owners and admins can, members cannot', () => {
      expect(canManageOrganizationOnboarding({ role: 'owner' })).to.eql(true);
      expect(canManageOrganizationOnboarding({ role: 'admin' })).to.eql(true);
      expect(canManageOrganizationOnboarding({ role: 'member' })).to.eql(false);
    });
  });
});
