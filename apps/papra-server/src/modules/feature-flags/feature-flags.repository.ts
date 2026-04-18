import type { Database } from '../app/database/database.types';
import { and, eq } from 'drizzle-orm';
import { featureFlagsTable } from './feature-flags.table';

export function createFeatureFlagsRepository({ db }: { db: Database }) {
  return {
    async getFeatureFlagsForUser({ userEmail }: { userEmail: string }): Promise<string[]> {
      const rows = await db
        .select({ flagId: featureFlagsTable.flagId })
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.userEmail, userEmail));

      return rows.map(r => r.flagId);
    },

    async hasFeatureFlag({ flagId, userEmail }: { flagId: string; userEmail: string }): Promise<boolean> {
      const rows = await db
        .select({ id: featureFlagsTable.id })
        .from(featureFlagsTable)
        .where(and(eq(featureFlagsTable.flagId, flagId), eq(featureFlagsTable.userEmail, userEmail)))
        .limit(1);

      return rows.length > 0;
    },

    async listAllEntries() {
      return db
        .select()
        .from(featureFlagsTable)
        .orderBy(featureFlagsTable.flagId, featureFlagsTable.userEmail);
    },

    async addEntry({ flagId, userEmail }: { flagId: string; userEmail: string }) {
      await db
        .insert(featureFlagsTable)
        .values({ flagId, userEmail })
        .onConflictDoNothing();
    },

    async removeEntry({ entryId }: { entryId: string }) {
      await db
        .delete(featureFlagsTable)
        .where(eq(featureFlagsTable.id, entryId));
    },

    async removeEntriesByFlag({ flagId }: { flagId: string }) {
      await db
        .delete(featureFlagsTable)
        .where(eq(featureFlagsTable.flagId, flagId));
    },
  };
}

export type FeatureFlagsRepository = ReturnType<typeof createFeatureFlagsRepository>;
