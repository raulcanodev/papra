import type { Database } from '../../app/database/database.types';
import type { DocumentReadingKind, DocumentReadingStatus } from './document-readings.constants';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { documentReadingsTable } from './document-readings.tables';

export type DocumentReading = typeof documentReadingsTable.$inferSelect;
export type DocumentReadingsRepository = ReturnType<typeof createDocumentReadingsRepository>;

export function createDocumentReadingsRepository({ db }: { db: Database }) {
  return {
    enqueueReadings: async (args: { organizationId: string; documentIds: string[]; kind: DocumentReadingKind; force?: boolean }) => enqueueReadings({ db, ...args }),
    getReadings: async (args: { organizationId: string; documentIds: string[]; kind: DocumentReadingKind }) => getReadings({ db, ...args }),
    claimPendingReadings: async (args: { limit: number; now?: Date }) => claimPendingReadings({ db, ...args }),
    finishReading: async (args: { readingId: string; status: DocumentReadingStatus; result?: Record<string, unknown> | null; checks?: unknown[]; errorCode?: string | null; now?: Date }) => finishReading({ db, ...args }),
    requeueStaleReadings: async (args: { staleBefore: Date }) => requeueStaleReadings({ db, ...args }),
    saveReading: async (args: { organizationId: string; documentId: string; kind: DocumentReadingKind; status: DocumentReadingStatus; result: Record<string, unknown>; checks: unknown[]; now?: Date }) => saveReading({ db, ...args }),
  };
}

// Idempotent: a document already read (or being read) is not read again, unless forced; a failed one is retried
async function enqueueReadings({ db, organizationId, documentIds, kind, force = false }: { db: Database; organizationId: string; documentIds: string[]; kind: DocumentReadingKind; force?: boolean }) {
  if (documentIds.length === 0) {
    return { readings: [] };
  }

  const now = new Date();
  const reset = { status: 'pending' as const, attempts: 0, errorCode: null, startedAt: null, finishedAt: null, createdAt: now, updatedAt: now };

  await db
    .insert(documentReadingsTable)
    .values(documentIds.map(documentId => ({ organizationId, documentId, kind })))
    .onConflictDoUpdate({
      target: [documentReadingsTable.documentId, documentReadingsTable.kind],
      set: reset,
      // Never steal a reading the worker is on
      setWhere: force ? sql`${documentReadingsTable.status} <> 'reading'` : sql`${documentReadingsTable.status} = 'failed'`,
    });

  return getReadings({ db, organizationId, documentIds, kind });
}

async function getReadings({ db, organizationId, documentIds, kind }: { db: Database; organizationId: string; documentIds: string[]; kind: DocumentReadingKind }) {
  if (documentIds.length === 0) {
    return { readings: [] };
  }

  const readings = await db
    .select()
    .from(documentReadingsTable)
    .where(and(eq(documentReadingsTable.organizationId, organizationId), eq(documentReadingsTable.kind, kind), inArray(documentReadingsTable.documentId, documentIds)));

  return { readings };
}

// Oldest first, each reading claimed by one worker only, even with several server instances
async function claimPendingReadings({ db, limit, now = new Date() }: { db: Database; limit: number; now?: Date }) {
  if (limit <= 0) {
    return { readings: [] };
  }

  const claimable = db
    .select({ id: documentReadingsTable.id })
    .from(documentReadingsTable)
    .where(eq(documentReadingsTable.status, 'pending'))
    .orderBy(asc(documentReadingsTable.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });

  const readings = await db
    .update(documentReadingsTable)
    .set({ status: 'reading', startedAt: now, updatedAt: now, attempts: sql`${documentReadingsTable.attempts} + 1` })
    .where(inArray(documentReadingsTable.id, claimable))
    .returning();

  return { readings: readings.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) };
}

async function finishReading({ db, readingId, status, result, checks, errorCode = null, now = new Date() }: { db: Database; readingId: string; status: DocumentReadingStatus; result?: Record<string, unknown> | null; checks?: unknown[]; errorCode?: string | null; now?: Date }) {
  const [reading] = await db
    .update(documentReadingsTable)
    .set({
      status,
      errorCode,
      ...(result === undefined ? {} : { result }),
      ...(checks === undefined ? {} : { checks }),
      finishedAt: status === 'pending' ? null : now,
      updatedAt: now,
    })
    .where(eq(documentReadingsTable.id, readingId))
    .returning();

  return { reading };
}

// Readings interrupted by a restart or a crash go back to the queue
async function requeueStaleReadings({ db, staleBefore }: { db: Database; staleBefore: Date }) {
  const readings = await db
    .update(documentReadingsTable)
    .set({ status: 'pending', startedAt: null, updatedAt: new Date() })
    .where(and(eq(documentReadingsTable.status, 'reading'), lt(documentReadingsTable.startedAt, staleBefore)))
    .returning({ id: documentReadingsTable.id });

  return { requeuedCount: readings.length };
}

// A reading done synchronously (the assistant asking for one document) is kept like a queued one
async function saveReading({ db, organizationId, documentId, kind, status, result, checks, now = new Date() }: { db: Database; organizationId: string; documentId: string; kind: DocumentReadingKind; status: DocumentReadingStatus; result: Record<string, unknown>; checks: unknown[]; now?: Date }) {
  const values = { status, result, checks, errorCode: null, attempts: 1, startedAt: now, finishedAt: now, updatedAt: now };

  const [reading] = await db
    .insert(documentReadingsTable)
    .values({ organizationId, documentId, kind, ...values })
    .onConflictDoUpdate({ target: [documentReadingsTable.documentId, documentReadingsTable.kind], set: values })
    .returning();

  return { reading: reading! };
}
