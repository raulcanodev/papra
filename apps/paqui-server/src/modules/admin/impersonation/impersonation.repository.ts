import type { Database } from '../../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { impersonationsTable } from './impersonation.table';

export type ImpersonationsRepository = ReturnType<typeof createImpersonationsRepository>;
export type ImpersonationRecord = typeof impersonationsTable.$inferInsert;

export function createImpersonationsRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      recordImpersonationStart,
      recordImpersonationEnd,
      listUserImpersonations,
    },
    { db },
  );
}

async function recordImpersonationStart({ db, impersonation }: { db: Database; impersonation: ImpersonationRecord }) {
  await db.insert(impersonationsTable).values(impersonation);
}

async function recordImpersonationEnd({ db, sessionId, endedAt = new Date() }: { db: Database; sessionId: string; endedAt?: Date }) {
  await db
    .update(impersonationsTable)
    .set({ endedAt })
    .where(and(eq(impersonationsTable.sessionId, sessionId), isNull(impersonationsTable.endedAt)));
}

// Both directions: the times this user was impersonated and the times they impersonated someone
async function listUserImpersonations({ db, userId, limit = 50 }: { db: Database; userId: string; limit?: number }) {
  const [asTarget, asAdmin] = await Promise.all([
    db.select().from(impersonationsTable).where(eq(impersonationsTable.targetUserId, userId)).orderBy(desc(impersonationsTable.createdAt)).limit(limit),
    db.select().from(impersonationsTable).where(eq(impersonationsTable.adminUserId, userId)).orderBy(desc(impersonationsTable.createdAt)).limit(limit),
  ]);

  const impersonations = [...asTarget, ...asAdmin]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map(({ sessionId: _sessionId, ...impersonation }) => impersonation);

  return { impersonations };
}
