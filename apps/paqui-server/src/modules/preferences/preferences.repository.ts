import type { Database } from '../app/database/database.types';
import type { MemberPreferences, MemberPreferencesPatch } from './preferences.models';
import { and, eq } from 'drizzle-orm';
import { mergePreferences, parseStoredPreferences } from './preferences.models';
import { memberPreferencesTable } from './preferences.table';

export type PreferencesRepository = ReturnType<typeof createPreferencesRepository>;

export function createPreferencesRepository({ db }: { db: Database }) {
  return {
    getMemberPreferences: async (args: { organizationId: string; userId: string }) => getMemberPreferences({ db, ...args }),
    updateMemberPreferences: async (args: { organizationId: string; userId: string; patch: MemberPreferencesPatch }) => updateMemberPreferences({ db, ...args }),
  };
}

async function getMemberPreferences({ db, organizationId, userId }: { db: Database; organizationId: string; userId: string }) {
  const [row] = await db
    .select({ preferences: memberPreferencesTable.preferences })
    .from(memberPreferencesTable)
    .where(and(eq(memberPreferencesTable.organizationId, organizationId), eq(memberPreferencesTable.userId, userId)))
    .limit(1);

  return { preferences: parseStoredPreferences({ stored: row?.preferences }) };
}

async function updateMemberPreferences({ db, organizationId, userId, patch }: { db: Database; organizationId: string; userId: string; patch: MemberPreferencesPatch }) {
  return db.transaction(async (tx) => {
    const { preferences: current } = await getMemberPreferences({ db: tx, organizationId, userId });
    const preferences: MemberPreferences = mergePreferences({ current, patch });

    await tx
      .insert(memberPreferencesTable)
      .values({ organizationId, userId, preferences })
      .onConflictDoUpdate({
        target: [memberPreferencesTable.organizationId, memberPreferencesTable.userId],
        set: { preferences, updatedAt: new Date() },
      });

    return { preferences };
  });
}
