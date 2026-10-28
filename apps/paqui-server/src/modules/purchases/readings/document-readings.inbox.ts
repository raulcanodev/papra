import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { TaskServices } from '../../tasks/tasks.services';
import { and, desc, eq, notExists } from 'drizzle-orm';
import { documentsTable } from '../../documents/documents.table';
import { createDueDatesRepository } from '../../due-dates/due-dates.repository';
import { invoicesTable } from '../../invoicing/invoicing.tables';
import { EXTRACTABLE_DOCUMENT_MIME_TYPES, MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES } from '../purchases.constants';
import { purchaseInvoicesTable } from '../purchases.tables';
import { createDocumentReadingsRepository } from './document-readings.repository';
import { documentReadingsTable } from './document-readings.tables';
import { wakeDocumentReadings } from './document-readings.task';
import { formatReadingsForApi } from './document-readings.usecases';

const MAX_INBOX_READINGS = 50;

// The documents read as invoices that are not registered yet (as a purchase, or as a sale when they are our own): forwarded by email, or uploaded and left
// unreviewed. The purchases page offers to review them one after the other.
export async function listPurchaseInbox({ db, organizationId }: { db: Database; organizationId: string }) {
  const rows = await db
    .select({ reading: documentReadingsTable, documentName: documentsTable.name })
    .from(documentReadingsTable)
    .innerJoin(documentsTable, eq(documentReadingsTable.documentId, documentsTable.id))
    .where(and(
      eq(documentReadingsTable.organizationId, organizationId),
      eq(documentReadingsTable.kind, 'purchase'),
      eq(documentsTable.isDeleted, false),
      notExists(db.select({ id: purchaseInvoicesTable.id }).from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.documentId, documentReadingsTable.documentId))),
      // An own invoice registered as a sale has left the inbox too
      notExists(db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.documentId, documentReadingsTable.documentId))),
    ))
    .orderBy(desc(documentReadingsTable.createdAt))
    .limit(MAX_INBOX_READINGS);

  const { readings } = await formatReadingsForApi({ db, organizationId, readings: rows.map(({ reading }) => reading) });
  const names = new Map(rows.map(({ reading, documentName }) => [reading.documentId, documentName]));

  return { readings: readings.map(reading => ({ ...reading, documentName: names.get(reading.documentId) ?? null })) };
}

// "Not an invoice": the document stays archived, it just leaves the inbox
export async function dismissPurchaseInboxDocument({ db, organizationId, documentId }: { db: Database; organizationId: string; documentId: string }) {
  await db.delete(documentReadingsTable).where(and(eq(documentReadingsTable.organizationId, organizationId), eq(documentReadingsTable.documentId, documentId), eq(documentReadingsTable.kind, 'purchase')));
}

// A document received on an intake email follows the same flow as an upload on the purchases page: read in the
// background, then waiting in the inbox for review. Only readable files, and only if the organization wants it.
export async function queueIntakeDocumentReading({ db, config, documentsStorageService, taskServices, organizationId, document }: { db: Database; config: Config; documentsStorageService: DocumentStorageService; taskServices: TaskServices; organizationId: string; document: { id: string; mimeType: string; originalSize: number } }) {
  const isReadable = (EXTRACTABLE_DOCUMENT_MIME_TYPES as readonly string[]).includes(document.mimeType) && document.originalSize <= MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES;

  if (!isReadable) {
    return { isQueued: false };
  }

  const { settings } = await createDueDatesRepository({ db }).getSettings({ organizationId });

  if (!settings.readIntakeEmailAttachments) {
    return { isQueued: false };
  }

  await createDocumentReadingsRepository({ db }).enqueueReadings({ organizationId, documentIds: [document.id], kind: 'purchase' });
  await wakeDocumentReadings({ taskServices, db, config, documentsStorageService });

  return { isQueued: true };
}
