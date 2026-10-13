import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { organizationMembersTable, organizationsTable } from '../organizations/organizations.table';
import { usersTable } from '../users/users.table';

export type OnboardingRepository = ReturnType<typeof createOnboardingRepository>;

export function createOnboardingRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      getUserOnboarding,
      getUserMemberships,
      setUserOnboarding,
      setOrganizationOnboarding,
    },
    { db },
  );
}

async function getUserOnboarding({ userId, db }: { userId: string; db: Database }) {
  const [onboarding] = await db
    .select({ completedAt: usersTable.onboardingCompletedAt, step: usersTable.onboardingStep })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  return { onboarding: onboarding ?? null };
}

/** The organizations the user belongs to, oldest first, with their onboarding state. */
async function getUserMemberships({ userId, db }: { userId: string; db: Database }) {
  const memberships = await db
    .select({
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      role: organizationMembersTable.role,
      onboardingCompletedAt: organizationsTable.onboardingCompletedAt,
      onboardingStep: organizationsTable.onboardingStep,
    })
    .from(organizationMembersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembersTable.organizationId))
    .where(and(
      eq(organizationMembersTable.userId, userId),
      isNull(organizationsTable.deletedAt),
    ))
    .orderBy(asc(organizationMembersTable.createdAt));

  return { memberships };
}

async function setUserOnboarding({ userId, completed, step, db, now = new Date() }: { userId: string; completed: boolean; step: string | null; db: Database; now?: Date }) {
  await db
    .update(usersTable)
    .set(completed ? { onboardingCompletedAt: now, onboardingStep: null } : { onboardingCompletedAt: null, onboardingStep: step })
    .where(eq(usersTable.id, userId));
}

async function setOrganizationOnboarding({ organizationId, completed, step, db, now = new Date() }: { organizationId: string; completed: boolean; step: string | null; db: Database; now?: Date }) {
  await db
    .update(organizationsTable)
    .set(completed ? { onboardingCompletedAt: now, onboardingStep: null } : { onboardingCompletedAt: null, onboardingStep: step })
    .where(eq(organizationsTable.id, organizationId));
}
