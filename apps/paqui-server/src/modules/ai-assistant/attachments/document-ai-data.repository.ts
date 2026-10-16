import type { Database } from '../../app/database/database.types';
import { and, desc, eq } from 'drizzle-orm';
import { documentAiDataTable } from './document-ai-data.table';

export type DocumentAiDataRepository = ReturnType<typeof createDocumentAiDataRepository>;

export function createDocumentAiDataRepository({ db }: { db: Database }) {
  return {
    saveDocumentAiData: async (args: { organizationId: string; documentId: string; documentType: string; summary: string; data: unknown }) => saveDocumentAiData({ db, ...args }),
    getDocumentAiData: async (args: { organizationId: string; documentId: string }) => getDocumentAiData({ db, ...args }),
    listDocumentAiData: async (args: { organizationId: string; documentType?: string }) => listDocumentAiData({ db, ...args }),
  };
}

// One interpretation per document: reading it again replaces the previous one
async function saveDocumentAiData({ db, organizationId, documentId, documentType, summary, data }: { db: Database; organizationId: string; documentId: string; documentType: string; summary: string; data: unknown }) {
  const now = new Date();
  const [saved] = await db
    .insert(documentAiDataTable)
    .values({ organizationId, documentId, documentType, summary, data })
    .onConflictDoUpdate({ target: documentAiDataTable.documentId, set: { documentType, summary, data, updatedAt: now } })
    .returning();

  return { documentAiData: saved! };
}

async function getDocumentAiData({ db, organizationId, documentId }: { db: Database; organizationId: string; documentId: string }) {
  const [documentAiData] = await db
    .select()
    .from(documentAiDataTable)
    .where(and(eq(documentAiDataTable.documentId, documentId), eq(documentAiDataTable.organizationId, organizationId)))
    .limit(1);

  return { documentAiData };
}

// Without the data itself: a list to find which documents hold what
async function listDocumentAiData({ db, organizationId, documentType }: { db: Database; organizationId: string; documentType?: string }) {
  const documentAiData = await db
    .select({ documentId: documentAiDataTable.documentId, documentType: documentAiDataTable.documentType, summary: documentAiDataTable.summary, updatedAt: documentAiDataTable.updatedAt })
    .from(documentAiDataTable)
    .where(and(eq(documentAiDataTable.organizationId, organizationId), documentType === undefined ? undefined : eq(documentAiDataTable.documentType, documentType)))
    .orderBy(desc(documentAiDataTable.updatedAt))
    .limit(100);

  return { documentAiData };
}
