import type { Database } from '../app/database/database.types';
import type { CapturePurpose } from './captures.constants';
import { and, eq, sql } from 'drizzle-orm';
import { captureSessionsTable } from './captures.tables';

export type CapturesRepository = ReturnType<typeof createCapturesRepository>;

export function createCapturesRepository({ db }: { db: Database }) {
  return {
    createCaptureSession: async (args: { organizationId: string; userId: string; purpose: CapturePurpose; tokenHash: string; expiresAt: Date }) => createCaptureSession({ db, ...args }),
    getUserCaptureSession: async (args: { organizationId: string; userId: string; captureSessionId: string }) => getUserCaptureSession({ db, ...args }),
    getCaptureSessionByTokenHash: async (args: { tokenHash: string }) => getCaptureSessionByTokenHash({ db, ...args }),
    appendDocumentToCaptureSession: async (args: { captureSessionId: string; documentId: string }) => appendDocumentToCaptureSession({ db, ...args }),
    completeCaptureSession: async (args: { captureSessionId: string; now?: Date }) => completeCaptureSession({ db, ...args }),
  };
}

async function createCaptureSession({ db, ...values }: { db: Database; organizationId: string; userId: string; purpose: CapturePurpose; tokenHash: string; expiresAt: Date }) {
  const [captureSession] = await db.insert(captureSessionsTable).values(values).returning();

  return { captureSession: captureSession! };
}

async function getUserCaptureSession({ db, organizationId, userId, captureSessionId }: { db: Database; organizationId: string; userId: string; captureSessionId: string }) {
  const [captureSession] = await db
    .select()
    .from(captureSessionsTable)
    .where(and(eq(captureSessionsTable.id, captureSessionId), eq(captureSessionsTable.organizationId, organizationId), eq(captureSessionsTable.userId, userId)))
    .limit(1);

  return { captureSession };
}

async function getCaptureSessionByTokenHash({ db, tokenHash }: { db: Database; tokenHash: string }) {
  const [captureSession] = await db.select().from(captureSessionsTable).where(eq(captureSessionsTable.tokenHash, tokenHash)).limit(1);

  return { captureSession };
}

// Appended in the database itself: two photos uploaded at the same time must both be kept
async function appendDocumentToCaptureSession({ db, captureSessionId, documentId }: { db: Database; captureSessionId: string; documentId: string }) {
  const [captureSession] = await db
    .update(captureSessionsTable)
    .set({ documentIds: sql`${captureSessionsTable.documentIds} || ${JSON.stringify([documentId])}::jsonb`, updatedAt: new Date() })
    .where(eq(captureSessionsTable.id, captureSessionId))
    .returning();

  return { captureSession: captureSession! };
}

async function completeCaptureSession({ db, captureSessionId, now = new Date() }: { db: Database; captureSessionId: string; now?: Date }) {
  const [captureSession] = await db
    .update(captureSessionsTable)
    .set({ completedAt: sql`coalesce(${captureSessionsTable.completedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now })
    .where(eq(captureSessionsTable.id, captureSessionId))
    .returning();

  return { captureSession: captureSession! };
}
