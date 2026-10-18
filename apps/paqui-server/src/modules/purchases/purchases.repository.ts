import type { Database } from '../app/database/database.types';
import type { PurchaseInvoiceStatus } from './purchases.constants';
import type { PurchaseInvoiceDraftInput } from './purchases.models';
import { safely } from '@corentinth/chisels';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { createContactsRepository } from '../contacts/contacts.repository';
import { contactsTable } from '../contacts/contacts.table';
import { createDocumentFoldersRepository } from '../documents/document-folders.repository';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { documentsTable } from '../documents/documents.table';
import { computeInstalments } from '../due-dates/due-dates.models';
import { createDueDatesRepository } from '../due-dates/due-dates.repository';
import { isUniqueConstraintError } from '../shared/db/constraints.models';
import { createPurchaseInvoiceAlreadyExistsError, createPurchaseInvoiceNotFoundError } from './purchases.errors';
import { calculatePurchaseInvoiceTotals } from './purchases.models';
import { purchaseInvoiceItemsTable, purchaseInvoicesTable } from './purchases.tables';

export type PurchasesRepository = ReturnType<typeof createPurchasesRepository>;

export function createPurchasesRepository({ db }: { db: Database }) {
  return {
    listPurchaseInvoices: async (args: { organizationId: string; status?: PurchaseInvoiceStatus; from?: Date; to?: Date }) => listPurchaseInvoices({ db, ...args }),
    getPurchaseInvoice: async (args: { organizationId: string; purchaseInvoiceId: string }) => getPurchaseInvoice({ db, ...args }),
    createPurchaseInvoice: async (args: { organizationId: string; draft: PurchaseInvoiceDraftInput }) => createPurchaseInvoice({ db, ...args }),
    updatePurchaseInvoice: async (args: { organizationId: string; purchaseInvoiceId: string; draft: PurchaseInvoiceDraftInput }) => updatePurchaseInvoice({ db, ...args }),
    setPurchaseInvoiceStatus: async (args: { organizationId: string; purchaseInvoiceId: string; status: PurchaseInvoiceStatus; now?: Date }) => setPurchaseInvoiceStatus({ db, ...args }),
    deletePurchaseInvoice: async (args: { organizationId: string; purchaseInvoiceId: string }) => deletePurchaseInvoice({ db, ...args }),
  };
}

async function listPurchaseInvoices({ db, organizationId, status, from, to }: { db: Database; organizationId: string; status?: PurchaseInvoiceStatus; from?: Date; to?: Date }) {
  const rows = await db
    .select({ purchaseInvoice: purchaseInvoicesTable, supplierName: contactsTable.name, supplierTaxId: contactsTable.taxId, supplierIcon: contactsTable.icon, supplierIconColor: contactsTable.iconColor })
    .from(purchaseInvoicesTable)
    .innerJoin(contactsTable, eq(purchaseInvoicesTable.supplierId, contactsTable.id))
    .where(and(
      eq(purchaseInvoicesTable.organizationId, organizationId),
      status === undefined ? undefined : eq(purchaseInvoicesTable.status, status),
      from === undefined ? undefined : gte(purchaseInvoicesTable.issueDate, from),
      to === undefined ? undefined : lt(purchaseInvoicesTable.issueDate, to),
    ))
    .orderBy(desc(purchaseInvoicesTable.issueDate), desc(purchaseInvoicesTable.createdAt));

  return { purchaseInvoices: rows.map(({ purchaseInvoice, ...supplier }) => ({ ...purchaseInvoice, ...supplier })) };
}

async function getPurchaseInvoice({ db, organizationId, purchaseInvoiceId }: { db: Database; organizationId: string; purchaseInvoiceId: string }) {
  const [purchaseInvoice] = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.id, purchaseInvoiceId), eq(purchaseInvoicesTable.organizationId, organizationId)))
    .limit(1);

  if (!purchaseInvoice) {
    return { purchaseInvoice: null };
  }

  const [items, { contact: supplier }, { instalments }] = await Promise.all([
    db.select().from(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoiceId)).orderBy(asc(purchaseInvoiceItemsTable.position)),
    createContactsRepository({ db }).getContact({ organizationId, contactId: purchaseInvoice.supplierId }),
    createDueDatesRepository({ db }).listInstalments({ organizationId, source: { direction: 'payable', purchaseInvoiceId } }),
  ]);

  return { purchaseInvoice: { ...purchaseInvoice, items, supplier, instalments: instalments.toSorted((a, b) => a.position - b.position) } };
}

// The supplier must be a contact of the organization with the supplier role, the attached document one of its documents
async function ensurePurchaseInvoiceReferences({ db, organizationId, draft }: { db: Database; organizationId: string; draft: PurchaseInvoiceDraftInput }) {
  const { contact: supplier } = await createContactsRepository({ db }).getContactWithRole({ organizationId, contactId: draft.supplierId, role: 'supplier' });

  if (draft.documentId === undefined || draft.documentId === null) {
    return { supplier };
  }

  const [document] = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(eq(documentsTable.id, draft.documentId), eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false)))
    .limit(1);

  if (!document) {
    throw createDocumentNotFoundError();
  }

  return { supplier };
}

// The due dates as reviewed by the user, or a single one on the printed due date or after the supplier usual payment
// terms. A delivery note is not paid by itself: the invoice covering it is.
function getPurchaseInstalments({ draft, supplierTermsDays }: { draft: PurchaseInvoiceDraftInput; supplierTermsDays: number }) {
  if (draft.kind === 'delivery_note') {
    return [];
  }

  if (draft.instalments !== undefined && draft.instalments.length > 0) {
    return draft.instalments;
  }

  const { totalMinor, withholdingMinor } = calculatePurchaseInvoiceTotals(draft);

  return computeInstalments({ issueDate: draft.issueDate, payableMinor: totalMinor - withholdingMinor, dueDate: draft.dueDate ?? null, contactTermsDays: supplierTermsDays }).instalments;
}

async function savePurchaseInstalments({ db, organizationId, purchaseInvoiceId, draft, instalments }: { db: Database; organizationId: string; purchaseInvoiceId: string; draft: PurchaseInvoiceDraftInput; instalments: ReturnType<typeof getPurchaseInstalments> }) {
  await createDueDatesRepository({ db }).saveSourceInstalments({
    organizationId,
    source: { direction: 'payable', purchaseInvoiceId },
    contactId: draft.supplierId,
    currency: draft.currency,
    paymentMethod: draft.paymentMethod ?? null,
    instalments,
  });
}

// The invoice file is archived in the supplier documents folder, next to its other invoices
async function archiveDocumentInSupplierFolder({ db, organizationId, draft }: { db: Database; organizationId: string; draft: PurchaseInvoiceDraftInput }) {
  if (draft.documentId === undefined || draft.documentId === null) {
    return;
  }

  const { contact: supplier } = await createContactsRepository({ db }).getContactWithRole({ organizationId, contactId: draft.supplierId, role: 'supplier' });
  const foldersRepository = createDocumentFoldersRepository({ db });
  const { folder } = await foldersRepository.ensureContactFolder({ organizationId, contactId: supplier.id, contactName: supplier.name });

  await foldersRepository.assignDocument({ organizationId, documentId: draft.documentId, folderId: folder.id });
}

function toItemRows({ purchaseInvoiceId, draft }: { purchaseInvoiceId: string; draft: PurchaseInvoiceDraftInput }) {
  return draft.items.map((item, position) => ({ purchaseInvoiceId, ...item, position }));
}

function toInvoiceValues({ draft, instalments }: { draft: PurchaseInvoiceDraftInput; instalments: ReturnType<typeof getPurchaseInstalments> }) {
  const { items: _items, instalments: _instalments, ...fields } = draft;
  // The invoice due date is its first one, so the lists and the taxes keep reading a single date
  const [firstDueDate] = instalments.map(({ dueDate }) => dueDate).toSorted((a, b) => a.getTime() - b.getTime());

  return {
    ...fields,
    paymentMethod: draft.paymentMethod ?? null,
    dueDate: firstDueDate ?? draft.dueDate ?? null,
    documentId: draft.documentId ?? null,
    notes: draft.notes ?? null,
    ...calculatePurchaseInvoiceTotals(draft),
  };
}

async function createPurchaseInvoice({ db, organizationId, draft }: { db: Database; organizationId: string; draft: PurchaseInvoiceDraftInput }) {
  const { supplier } = await ensurePurchaseInvoiceReferences({ db, organizationId, draft });
  const instalments = getPurchaseInstalments({ draft, supplierTermsDays: supplier.paymentTermsDays });

  const [purchaseInvoiceId, error] = await safely(db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const [purchaseInvoice] = await tx.insert(purchaseInvoicesTable).values({ organizationId, ...toInvoiceValues({ draft, instalments }) }).returning({ id: purchaseInvoicesTable.id });
    await tx.insert(purchaseInvoiceItemsTable).values(toItemRows({ purchaseInvoiceId: purchaseInvoice!.id, draft }));
    await savePurchaseInstalments({ db: tx, organizationId, purchaseInvoiceId: purchaseInvoice!.id, draft, instalments });
    await archiveDocumentInSupplierFolder({ db: tx, organizationId, draft });

    return purchaseInvoice!.id;
  }));

  if (isUniqueConstraintError({ error })) {
    throw createPurchaseInvoiceAlreadyExistsError();
  }

  if (error) {
    throw error;
  }

  return getPurchaseInvoice({ db, organizationId, purchaseInvoiceId });
}

async function updatePurchaseInvoice({ db, organizationId, purchaseInvoiceId, draft }: { db: Database; organizationId: string; purchaseInvoiceId: string; draft: PurchaseInvoiceDraftInput }) {
  const { supplier } = await ensurePurchaseInvoiceReferences({ db, organizationId, draft });
  const instalments = getPurchaseInstalments({ draft, supplierTermsDays: supplier.paymentTermsDays });

  const [updated, error] = await safely(db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const [purchaseInvoice] = await tx
      .update(purchaseInvoicesTable)
      .set({ ...toInvoiceValues({ draft, instalments }), updatedAt: new Date() })
      .where(and(eq(purchaseInvoicesTable.id, purchaseInvoiceId), eq(purchaseInvoicesTable.organizationId, organizationId)))
      .returning({ id: purchaseInvoicesTable.id });

    if (!purchaseInvoice) {
      return false;
    }

    await tx.delete(purchaseInvoiceItemsTable).where(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoiceId));
    await tx.insert(purchaseInvoiceItemsTable).values(toItemRows({ purchaseInvoiceId, draft }));
    await savePurchaseInstalments({ db: tx, organizationId, purchaseInvoiceId, draft, instalments });
    await archiveDocumentInSupplierFolder({ db: tx, organizationId, draft });

    return true;
  }));

  if (isUniqueConstraintError({ error })) {
    throw createPurchaseInvoiceAlreadyExistsError();
  }

  if (error) {
    throw error;
  }

  if (!updated) {
    throw createPurchaseInvoiceNotFoundError();
  }

  return getPurchaseInvoice({ db, organizationId, purchaseInvoiceId });
}

async function setPurchaseInvoiceStatus({ db, organizationId, purchaseInvoiceId, status, now = new Date() }: { db: Database; organizationId: string; purchaseInvoiceId: string; status: PurchaseInvoiceStatus; now?: Date }) {
  const [updated] = await db
    .update(purchaseInvoicesTable)
    .set({ status, paidAt: status === 'paid' ? now : null, updatedAt: now })
    .where(and(eq(purchaseInvoicesTable.id, purchaseInvoiceId), eq(purchaseInvoicesTable.organizationId, organizationId)))
    .returning({ id: purchaseInvoicesTable.id });

  if (!updated) {
    throw createPurchaseInvoiceNotFoundError();
  }

  // Marking the whole invoice paid pays every due date of it
  await createDueDatesRepository({ db }).setSourceInstalmentsStatus({ organizationId, source: { direction: 'payable', purchaseInvoiceId }, status, now });

  return getPurchaseInvoice({ db, organizationId, purchaseInvoiceId });
}

async function deletePurchaseInvoice({ db, organizationId, purchaseInvoiceId }: { db: Database; organizationId: string; purchaseInvoiceId: string }) {
  const [deleted] = await db
    .delete(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.id, purchaseInvoiceId), eq(purchaseInvoicesTable.organizationId, organizationId)))
    .returning({ id: purchaseInvoicesTable.id });

  if (!deleted) {
    throw createPurchaseInvoiceNotFoundError();
  }
}
