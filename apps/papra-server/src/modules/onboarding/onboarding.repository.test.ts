import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createOnboardingRepository } from './onboarding.repository';

describe('onboarding repository', () => {
  describe('setUserOnboarding', () => {
    test('saves the step while in progress, and clears it once completed', async () => {
      const { db } = await createInMemoryDatabase({
        users: [{ id: 'usr_1', email: 'jane@example.com' }],
      });
      const repository = createOnboardingRepository({ db });

      await repository.setUserOnboarding({ userId: 'usr_1', completed: false, step: 'fiscal' });
      expect((await repository.getUserOnboarding({ userId: 'usr_1' })).onboarding).to.eql({ completedAt: null, step: 'fiscal' });

      const now = new Date('2026-10-13T10:00:00.000Z');
      await repository.setUserOnboarding({ userId: 'usr_1', completed: true, step: 'fiscal', now });
      expect((await repository.getUserOnboarding({ userId: 'usr_1' })).onboarding).to.eql({ completedAt: now, step: null });
    });
  });

  describe('getUserMemberships', () => {
    test('lists the organizations of the user with their role and onboarding state, ignoring deleted ones', async () => {
      const { db } = await createInMemoryDatabase({
        users: [{ id: 'usr_1', email: 'jane@example.com' }],
        organizations: [
          { id: 'org_1', name: 'Acme' },
          { id: 'org_2', name: 'Globex', deletedAt: new Date('2026-10-01T00:00:00.000Z') },
        ],
        organizationMembers: [
          { organizationId: 'org_1', userId: 'usr_1', role: 'owner' },
          { organizationId: 'org_2', userId: 'usr_1', role: 'member' },
        ],
      });
      const repository = createOnboardingRepository({ db });

      await repository.setOrganizationOnboarding({ organizationId: 'org_1', completed: false, step: 'taxes' });

      const { memberships } = await repository.getUserMemberships({ userId: 'usr_1' });

      expect(memberships).to.eql([
        { organizationId: 'org_1', organizationName: 'Acme', role: 'owner', onboardingCompletedAt: null, onboardingStep: 'taxes' },
      ]);
    });
  });
});
