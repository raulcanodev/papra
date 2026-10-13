import type { Database } from '../app/database/database.types';
import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { documentFoldersTable, documentsFoldersTable } from './document-folders.table';
import { documentsTable } from './documents.table';

export function createDocumentFoldersRepository({ db }: { db: Database }) {
  return {
    createFolder: async (args: { organizationId: string; name: string; parentFolderId?: string | null }) => createFolder({ db, ...args }),
    ensureCustomerFolder: async (args: { organizationId: string; customerId: string; customerName: string }) => ensureCustomerFolder({ db, ...args }),
    renameCustomerFolder: async (args: { organizationId: string; customerId: string; customerName: string }) => renameCustomerFolder({ db, ...args }),
    assignDocument: async (args: { organizationId: string; documentId: string; folderId: string }) => assignDocument({ db, ...args }),
    removeDocumentFromFolder: async (args: { organizationId: string; documentId: string }) => removeDocumentFromFolder({ db, ...args }),
    listFolders: async (args: { organizationId: string }) => listFolders({ db, ...args }),
    listFolderDocuments: async (args: { organizationId: string; folderId: string; pageIndex: number; pageSize: number; searchQuery?: string }) => listFolderDocuments({ db, ...args }),
    getDocumentFolders: async (args: { organizationId: string; documentIds: string[] }) => getDocumentFolders({ db, ...args }),
  };
}

async function createFolder({ db, organizationId, name, parentFolderId = null }: { db: Database; organizationId: string; name: string; parentFolderId?: string | null }) {
  if (parentFolderId !== null) {
    const [parent] = await db.select({ id: documentFoldersTable.id }).from(documentFoldersTable).where(and(eq(documentFoldersTable.id, parentFolderId), eq(documentFoldersTable.organizationId, organizationId))).limit(1);
    if (!parent) {
      throw new Error('Parent folder not found');
    }
  }
  const [folder] = await db.insert(documentFoldersTable).values({ organizationId, name: name.trim(), parentFolderId, kind: 'manual' }).returning();
  return { folder: folder! };
}

async function ensureCustomerFolder({ db, organizationId, customerId, customerName }: { db: Database; organizationId: string; customerId: string; customerName: string }) {
  await db.insert(documentFoldersTable).values({ organizationId, customerId, name: customerName.trim(), kind: 'customer' }).onConflictDoNothing();
  const [folder] = await db.select().from(documentFoldersTable).where(and(eq(documentFoldersTable.organizationId, organizationId), eq(documentFoldersTable.customerId, customerId))).limit(1);
  if (!folder) {
    throw new Error('Unable to create customer folder');
  }
  return { folder };
}

async function renameCustomerFolder({ db, organizationId, customerId, customerName }: { db: Database; organizationId: string; customerId: string; customerName: string }) {
  await db.update(documentFoldersTable).set({ name: customerName.trim(), updatedAt: new Date() }).where(and(eq(documentFoldersTable.organizationId, organizationId), eq(documentFoldersTable.customerId, customerId), eq(documentFoldersTable.kind, 'customer')));
}

async function assignDocument({ db, organizationId, documentId, folderId }: { db: Database; organizationId: string; documentId: string; folderId: string }) {
  const [[document], [folder]] = await Promise.all([
    db.select({ id: documentsTable.id }).from(documentsTable).where(and(eq(documentsTable.id, documentId), eq(documentsTable.organizationId, organizationId))).limit(1),
    db.select({ id: documentFoldersTable.id }).from(documentFoldersTable).where(and(eq(documentFoldersTable.id, folderId), eq(documentFoldersTable.organizationId, organizationId))).limit(1),
  ]);
  if (!document || !folder) {
    throw new Error('Document or folder not found');
  }
  await db.insert(documentsFoldersTable).values({ organizationId, documentId, folderId }).onConflictDoUpdate({ target: documentsFoldersTable.documentId, set: { folderId, organizationId } });
}

async function removeDocumentFromFolder({ db, organizationId, documentId }: { db: Database; organizationId: string; documentId: string }) {
  await db.delete(documentsFoldersTable).where(and(eq(documentsFoldersTable.organizationId, organizationId), eq(documentsFoldersTable.documentId, documentId)));
}

async function listFolders({ db, organizationId }: { db: Database; organizationId: string }) {
  const rows = await db.select({ folder: documentFoldersTable, documentsCount: count(documentsFoldersTable.documentId) })
    .from(documentFoldersTable)
    .leftJoin(documentsFoldersTable, and(eq(documentsFoldersTable.folderId, documentFoldersTable.id), eq(documentsFoldersTable.organizationId, organizationId)))
    .where(eq(documentFoldersTable.organizationId, organizationId))
    .groupBy(documentFoldersTable.id)
    .orderBy(asc(documentFoldersTable.name));
  return { folders: rows.map(({ folder, documentsCount }) => ({ ...folder, documentsCount })) };
}

async function listFolderDocuments({ db, organizationId, folderId, pageIndex, pageSize, searchQuery = '' }: { db: Database; organizationId: string; folderId: string; pageIndex: number; pageSize: number; searchQuery?: string }) {
  const filter = and(
    eq(documentsFoldersTable.organizationId, organizationId),
    eq(documentsFoldersTable.folderId, folderId),
    eq(documentsTable.organizationId, organizationId),
    eq(documentsTable.isDeleted, false),
    searchQuery === '' ? undefined : or(ilike(documentsTable.name, `%${searchQuery}%`), ilike(documentsTable.content, `%${searchQuery}%`)),
  );
  const [documents, countRows] = await Promise.all([
    db.select({ document: documentsTable }).from(documentsFoldersTable).innerJoin(documentsTable, eq(documentsFoldersTable.documentId, documentsTable.id)).where(filter).orderBy(desc(documentsTable.createdAt)).limit(pageSize).offset(pageIndex * pageSize),
    db.select({ value: count() }).from(documentsFoldersTable).innerJoin(documentsTable, eq(documentsFoldersTable.documentId, documentsTable.id)).where(filter),
  ]);
  const documentsCount = countRows[0]?.value ?? 0;
  return { documents: documents.map(row => row.document), documentsCount };
}

async function getDocumentFolders({ db, organizationId, documentIds }: { db: Database; organizationId: string; documentIds: string[] }) {
  if (documentIds.length === 0) {
    return { documentFolders: new Map<string, typeof documentFoldersTable.$inferSelect>() };
  }
  const rows = await db.select({ documentId: documentsFoldersTable.documentId, folder: documentFoldersTable })
    .from(documentsFoldersTable)
    .innerJoin(documentFoldersTable, eq(documentsFoldersTable.folderId, documentFoldersTable.id))
    .where(and(eq(documentsFoldersTable.organizationId, organizationId), or(...documentIds.map(id => eq(documentsFoldersTable.documentId, id)))));
  return { documentFolders: new Map(rows.map(row => [row.documentId, row.folder])) };
}
