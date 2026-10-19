import type { Database } from '../app/database/database.types';
import type { DeliveryNoteStatus } from './delivery-notes.constants';
import type { DeliveryNoteDraft } from './delivery-notes.schemas';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { createContactsRepository } from '../contacts/contacts.repository';
import { contactsTable } from '../contacts/contacts.table';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { documentsTable } from '../documents/documents.table';
import { invoicesTable, invoicingProductsTable } from '../invoicing/invoicing.tables';
import { createDeliveryNoteInvoicedError, createDeliveryNoteNotFoundError, createDeliveryNoteProductNotFoundError } from './delivery-notes.errors';
import { formatNextDeliveryNoteNumber, getDeliveryNoteStatus } from './delivery-notes.models';
import { deliveryNoteItemsTable, deliveryNotesTable } from './delivery-notes.tables';

export type DeliveryNotesRepository = ReturnType<typeof createDeliveryNotesRepository>;

export function createDeliveryNotesRepository({ db }: { db: Database }) {
  return {
    listDeliveryNotes: async (args: { organizationId: string; status?: DeliveryNoteStatus; customerId?: string }) => listDeliveryNotes({ db, ...args }),
    getDeliveryNote: async (args: { organizationId: string; deliveryNoteId: string }) => getDeliveryNote({ db, ...args }),
    getDeliveryNotesWithItems: async (args: { organizationId: string; deliveryNoteIds: string[] }) => getDeliveryNotesWithItems({ db, ...args }),
    createDeliveryNote: async (args: { organizationId: string; draft: DeliveryNoteDraft }) => createDeliveryNote({ db, ...args }),
    updateDeliveryNote: async (args: { organizationId: string; deliveryNoteId: string; draft: DeliveryNoteDraft }) => updateDeliveryNote({ db, ...args }),
    deleteDeliveryNote: async (args: { organizationId: string; deliveryNoteId: string }) => deleteDeliveryNote({ db, ...args }),
    listWrittenTextItems: async (args: { organizationId: string; limit: number }) => listWrittenTextItems({ db, ...args }),
    getProductUsage: async (args: { organizationId: string }) => getProductUsage({ db, ...args }),
    findByNumber: async (args: { organizationId: string; number: string }) => findByNumber({ db, ...args }),
  };
}

const listColumns = {
  deliveryNote: deliveryNotesTable,
  customerName: contactsTable.name,
  customerIcon: contactsTable.icon,
  customerIconColor: contactsTable.iconColor,
  invoiceNumber: invoicesTable.number,
  invoiceStatus: invoicesTable.status,
};

function formatDeliveryNote<T extends { deliveryNote: typeof deliveryNotesTable.$inferSelect }>({ deliveryNote, ...rest }: T) {
  return { ...deliveryNote, ...rest, status: getDeliveryNoteStatus(deliveryNote) };
}

// With the customer, the invoice it went on and how many lines it has, so the list needs no other request
async function listDeliveryNotes({ db, organizationId, status, customerId }: { db: Database; organizationId: string; status?: DeliveryNoteStatus; customerId?: string }) {
  const rows = await db
    .select({ ...listColumns, itemCount: count(deliveryNoteItemsTable.id) })
    .from(deliveryNotesTable)
    .innerJoin(contactsTable, eq(deliveryNotesTable.customerId, contactsTable.id))
    .leftJoin(invoicesTable, eq(deliveryNotesTable.invoiceId, invoicesTable.id))
    .leftJoin(deliveryNoteItemsTable, eq(deliveryNoteItemsTable.deliveryNoteId, deliveryNotesTable.id))
    .where(and(
      eq(deliveryNotesTable.organizationId, organizationId),
      status === undefined ? undefined : status === 'pending' ? isNull(deliveryNotesTable.invoiceId) : isNotNull(deliveryNotesTable.invoiceId),
      customerId === undefined ? undefined : eq(deliveryNotesTable.customerId, customerId),
    ))
    .groupBy(deliveryNotesTable.id, contactsTable.id, invoicesTable.id)
    .orderBy(desc(deliveryNotesTable.date), desc(deliveryNotesTable.createdAt));

  return { deliveryNotes: rows.map(formatDeliveryNote) };
}

async function getDeliveryNote({ db, organizationId, deliveryNoteId }: { db: Database; organizationId: string; deliveryNoteId: string }) {
  const [row] = await db
    .select(listColumns)
    .from(deliveryNotesTable)
    .innerJoin(contactsTable, eq(deliveryNotesTable.customerId, contactsTable.id))
    .leftJoin(invoicesTable, eq(deliveryNotesTable.invoiceId, invoicesTable.id))
    .where(and(eq(deliveryNotesTable.id, deliveryNoteId), eq(deliveryNotesTable.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return { deliveryNote: null };
  }

  const items = await db.select().from(deliveryNoteItemsTable).where(eq(deliveryNoteItemsTable.deliveryNoteId, deliveryNoteId)).orderBy(asc(deliveryNoteItemsTable.position));

  return { deliveryNote: { ...formatDeliveryNote(row), items } };
}

async function getDeliveryNotesWithItems({ db, organizationId, deliveryNoteIds }: { db: Database; organizationId: string; deliveryNoteIds: string[] }) {
  const deliveryNotes = await db.select().from(deliveryNotesTable).where(and(eq(deliveryNotesTable.organizationId, organizationId), inArray(deliveryNotesTable.id, deliveryNoteIds)));
  const items = deliveryNotes.length === 0 ? [] : await db.select().from(deliveryNoteItemsTable).where(inArray(deliveryNoteItemsTable.deliveryNoteId, deliveryNotes.map(({ id }) => id))).orderBy(asc(deliveryNoteItemsTable.position));

  return { deliveryNotes: deliveryNotes.map(deliveryNote => ({ ...deliveryNote, items: items.filter(item => item.deliveryNoteId === deliveryNote.id) })) };
}

// The customer, the photo and the products must all belong to the organization
async function ensureDraftReferences({ db, organizationId, draft }: { db: Database; organizationId: string; draft: DeliveryNoteDraft }) {
  await createContactsRepository({ db }).getContactWithRole({ organizationId, contactId: draft.customerId, role: 'customer' });

  if (draft.documentId !== undefined && draft.documentId !== null) {
    const [document] = await db.select({ id: documentsTable.id }).from(documentsTable).where(and(eq(documentsTable.id, draft.documentId), eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false))).limit(1);

    if (!document) {
      throw createDocumentNotFoundError();
    }
  }

  const productIds = [...new Set(draft.items.map(({ productId }) => productId).filter((id): id is string => id !== undefined && id !== null))];

  if (productIds.length > 0) {
    const products = await db.select({ id: invoicingProductsTable.id }).from(invoicingProductsTable).where(and(eq(invoicingProductsTable.organizationId, organizationId), inArray(invoicingProductsTable.id, productIds)));

    if (products.length !== productIds.length) {
      throw createDeliveryNoteProductNotFoundError();
    }
  }
}

function toRows({ draft }: { draft: DeliveryNoteDraft }) {
  const { items, ...fields } = draft;

  return {
    deliveryNote: { ...fields, notes: fields.notes ?? null, documentId: fields.documentId ?? null },
    items: items.map((item, position) => ({ ...item, productId: item.productId ?? null, writtenText: item.writtenText ?? null, position })),
  };
}

async function createDeliveryNote({ db, organizationId, draft }: { db: Database; organizationId: string; draft: DeliveryNoteDraft }) {
  await ensureDraftReferences({ db, organizationId, draft });
  const rows = toRows({ draft });

  const deliveryNoteId = await db.transaction(async (tx) => {
    const number = rows.deliveryNote.number ?? await getNextNumber({ db: tx as unknown as Database, organizationId });
    const [deliveryNote] = await tx.insert(deliveryNotesTable).values({ organizationId, ...rows.deliveryNote, number }).returning({ id: deliveryNotesTable.id });
    await tx.insert(deliveryNoteItemsTable).values(rows.items.map(item => ({ ...item, deliveryNoteId: deliveryNote!.id })));

    return deliveryNote!.id;
  });

  return getDeliveryNote({ db, organizationId, deliveryNoteId });
}

// Without a number (typed by hand), a delivery note takes the next one. Within the transaction, one numbering at a time
// per organization: two delivery notes saved together never get the same number
async function getNextNumber({ db, organizationId }: { db: Database; organizationId: string }) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-notes:${organizationId}`}))`);

  const [row] = await db
    .select({ highest: sql<number>`COALESCE(MAX(CAST(${deliveryNotesTable.number} AS integer)), 0)` })
    .from(deliveryNotesTable)
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), sql`${deliveryNotesTable.number} ~ '^[0-9]{1,9}$'`));

  return formatNextDeliveryNoteNumber({ highestNumber: Number(row?.highest ?? 0) });
}

async function getEditableDeliveryNote({ db, organizationId, deliveryNoteId }: { db: Database; organizationId: string; deliveryNoteId: string }) {
  const [existing] = await db.select({ invoiceId: deliveryNotesTable.invoiceId }).from(deliveryNotesTable).where(and(eq(deliveryNotesTable.id, deliveryNoteId), eq(deliveryNotesTable.organizationId, organizationId))).limit(1);

  if (!existing) {
    throw createDeliveryNoteNotFoundError();
  }

  if (existing.invoiceId !== null) {
    throw createDeliveryNoteInvoicedError();
  }
}

async function updateDeliveryNote({ db, organizationId, deliveryNoteId, draft }: { db: Database; organizationId: string; deliveryNoteId: string; draft: DeliveryNoteDraft }) {
  await getEditableDeliveryNote({ db, organizationId, deliveryNoteId });
  await ensureDraftReferences({ db, organizationId, draft });
  const rows = toRows({ draft });

  await db.transaction(async (tx) => {
    // Only while still pending: an invoice made in the meantime wins
    const [updated] = await tx.update(deliveryNotesTable)
      // The number given when it was created stays when the draft does not bring one
      .set({ ...rows.deliveryNote, number: rows.deliveryNote.number ?? undefined, updatedAt: new Date() })
      .where(and(eq(deliveryNotesTable.id, deliveryNoteId), eq(deliveryNotesTable.organizationId, organizationId), isNull(deliveryNotesTable.invoiceId)))
      .returning({ id: deliveryNotesTable.id });

    if (!updated) {
      throw createDeliveryNoteInvoicedError();
    }

    await tx.delete(deliveryNoteItemsTable).where(eq(deliveryNoteItemsTable.deliveryNoteId, deliveryNoteId));
    await tx.insert(deliveryNoteItemsTable).values(rows.items.map(item => ({ ...item, deliveryNoteId })));
  });

  return getDeliveryNote({ db, organizationId, deliveryNoteId });
}

async function deleteDeliveryNote({ db, organizationId, deliveryNoteId }: { db: Database; organizationId: string; deliveryNoteId: string }) {
  await getEditableDeliveryNote({ db, organizationId, deliveryNoteId });

  const [deleted] = await db.delete(deliveryNotesTable)
    .where(and(eq(deliveryNotesTable.id, deliveryNoteId), eq(deliveryNotesTable.organizationId, organizationId), isNull(deliveryNotesTable.invoiceId)))
    .returning({ id: deliveryNotesTable.id });

  if (!deleted) {
    throw createDeliveryNoteInvoicedError();
  }
}

// The lines typed or confirmed by the user for a handwritten text, the most recent first
async function listWrittenTextItems({ db, organizationId, limit }: { db: Database; organizationId: string; limit: number }) {
  const items = await db
    .select({ writtenText: deliveryNoteItemsTable.writtenText, productId: deliveryNoteItemsTable.productId })
    .from(deliveryNoteItemsTable)
    .innerJoin(deliveryNotesTable, eq(deliveryNoteItemsTable.deliveryNoteId, deliveryNotesTable.id))
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), isNotNull(deliveryNoteItemsTable.writtenText), isNotNull(deliveryNoteItemsTable.productId)))
    .orderBy(desc(deliveryNoteItemsTable.createdAt))
    .limit(limit);

  return { items };
}

// How many delivery note lines each product has: the reader sees the usual products first
async function getProductUsage({ db, organizationId }: { db: Database; organizationId: string }) {
  const rows = await db
    .select({ productId: deliveryNoteItemsTable.productId, uses: count(deliveryNoteItemsTable.id) })
    .from(deliveryNoteItemsTable)
    .innerJoin(deliveryNotesTable, eq(deliveryNoteItemsTable.deliveryNoteId, deliveryNotesTable.id))
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), isNotNull(deliveryNoteItemsTable.productId)))
    .groupBy(deliveryNoteItemsTable.productId);

  return { usage: new Map(rows.map(({ productId, uses }) => [productId!, uses])) };
}

// A pad number already registered: the photo was probably sent twice
async function findByNumber({ db, organizationId, number }: { db: Database; organizationId: string; number: string }) {
  const [deliveryNote] = await db
    .select({ id: deliveryNotesTable.id, number: deliveryNotesTable.number, customerId: deliveryNotesTable.customerId })
    .from(deliveryNotesTable)
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), eq(deliveryNotesTable.number, number)))
    .limit(1);

  return { deliveryNote: deliveryNote ?? null };
}
