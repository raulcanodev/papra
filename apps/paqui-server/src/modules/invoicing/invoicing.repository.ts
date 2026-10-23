/* eslint-disable style/max-statements-per-line */
import type { Database } from '../app/database/database.types';
import type { FiscalProfileInput, InvoiceBrandingInput, InvoiceDraftInput, InvoiceSeriesInput, ProductInput, TaxRateInput } from './invoicing.models';
import { and, asc, desc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { createContactNotFoundError } from '../contacts/contacts.errors';
import { createContactsRepository } from '../contacts/contacts.repository';
import { contactsTable } from '../contacts/contacts.table';
import { deliveryNotesTable } from '../delivery-notes/delivery-notes.tables';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { documentsTable } from '../documents/documents.table';
import { createDueDatesRepository } from '../due-dates/due-dates.repository';
import { createFiscalProfileRequiredError, createInvoiceDeliveryNotesUnavailableError, createInvoiceNotEditableError, createInvoiceNotFoundError, createInvoiceNotIssuableError } from './invoicing.errors';
import { calculateInvoiceTotals, formatInvoiceNumber } from './invoicing.models';
import { invoiceEventsTable, invoiceItemsTable, invoiceSeriesTable, invoicesTable, invoicingBrandingTable, invoicingProductsTable, invoicingProfilesTable, invoicingTaxRatesTable } from './invoicing.tables';

export function createInvoicingRepository({ db }: { db: Database }) {
  return {
    getFiscalProfile: async (args: { organizationId: string }) => getFiscalProfile({ db, ...args }),
    upsertFiscalProfile: async (args: { organizationId: string; profile: FiscalProfileInput }) => upsertFiscalProfile({ db, ...args }),
    listSeries: async (args: { organizationId: string }) => listSeries({ db, ...args }),
    ensureDefaultSeries: async (args: { organizationId: string }) => ensureDefaultSeries({ db, ...args }),
    createSeries: async (args: { organizationId: string; series: InvoiceSeriesInput }) => createSeries({ db, ...args }),
    updateSeries: async (args: { organizationId: string; seriesId: string; series: InvoiceSeriesInput }) => updateSeries({ db, ...args }),
    listProducts: async (args: { organizationId: string; contactId?: string }) => listProducts({ db, ...args }),
    createProduct: async (args: { organizationId: string; product: ProductInput }) => createProduct({ db, ...args }),
    updateProduct: async (args: { organizationId: string; productId: string; product: ProductInput }) => updateProduct({ db, ...args }),
    archiveProduct: async (args: { organizationId: string; productId: string }) => archiveCatalogItem({ db, table: invoicingProductsTable, organizationId: args.organizationId, id: args.productId }),
    archiveTaxRate: async (args: { organizationId: string; taxRateId: string }) => archiveCatalogItem({ db, table: invoicingTaxRatesTable, organizationId: args.organizationId, id: args.taxRateId }),
    listTaxRates: async (args: { organizationId: string }) => listTaxRates({ db, ...args }),
    createTaxRate: async (args: { organizationId: string; taxRate: TaxRateInput }) => createTaxRate({ db, ...args }),
    updateTaxRate: async (args: { organizationId: string; taxRateId: string; taxRate: TaxRateInput }) => updateTaxRate({ db, ...args }),
    getBranding: async (args: { organizationId: string }) => getBranding({ db, ...args }),
    upsertBranding: async (args: { organizationId: string; branding: InvoiceBrandingInput }) => upsertBranding({ db, ...args }),
    listInvoices: async (args: { organizationId: string; status?: string }) => listInvoices({ db, ...args }),
    getInvoice: async (args: { organizationId: string; invoiceId: string }) => getInvoice({ db, ...args }),
    createInvoice: async (args: { organizationId: string; draft: InvoiceDraftInput; userId: string }) => createInvoice({ db, ...args }),
    updateInvoice: async (args: { organizationId: string; invoiceId: string; draft: InvoiceDraftInput; userId: string }) => updateInvoice({ db, ...args }),
    reserveInvoiceNumber: async (args: { organizationId: string; invoiceId: string; userId: string }) => reserveInvoiceNumber({ db, ...args }),
    finalizeInvoice: async (args: { organizationId: string; invoiceId: string; documentId: string; userId: string }) => finalizeInvoice({ db, ...args }),
    markInvoiceSent: async (args: { organizationId: string; invoiceId: string; userId: string; recipient: string }) => markInvoiceSent({ db, ...args }),
    markInvoicePaid: async (args: { organizationId: string; invoiceId: string; userId: string }) => markInvoicePaid({ db, ...args }),
    deleteDraft: async (args: { organizationId: string; invoiceId: string }) => deleteDraft({ db, ...args }),
  };
}

async function getFiscalProfile({ db, organizationId }: { db: Database; organizationId: string }) {
  const [profile] = await db.select().from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1);
  return { profile: profile ?? null };
}

async function upsertFiscalProfile({ db, organizationId, profile }: { db: Database; organizationId: string; profile: FiscalProfileInput }) {
  const [saved] = await db.insert(invoicingProfilesTable)
    .values({ organizationId, ...profile })
    .onConflictDoUpdate({ target: invoicingProfilesTable.organizationId, set: { ...profile, updatedAt: new Date() } })
    .returning();
  return { profile: saved! };
}

async function listSeries({ db, organizationId }: { db: Database; organizationId: string }) {
  const series = await db.select().from(invoiceSeriesTable).where(and(eq(invoiceSeriesTable.organizationId, organizationId), isNull(invoiceSeriesTable.archivedAt))).orderBy(desc(invoiceSeriesTable.isDefault), asc(invoiceSeriesTable.name));
  return { series };
}

async function createSeries({ db, organizationId, series }: { db: Database; organizationId: string; series: InvoiceSeriesInput }) {
  const saved = await db.transaction(async (tx) => {
    if (series.isDefault) {
      await tx.update(invoiceSeriesTable).set({ isDefault: false }).where(eq(invoiceSeriesTable.organizationId, organizationId));
    }
    const [row] = await tx.insert(invoiceSeriesTable).values({ organizationId, ...series }).returning();
    return row!;
  });
  return { series: saved };
}

async function updateSeries({ db, organizationId, seriesId, series }: { db: Database; organizationId: string; seriesId: string; series: InvoiceSeriesInput }) {
  const saved = await db.transaction(async (tx) => {
    if (series.isDefault) {
      await tx.update(invoiceSeriesTable).set({ isDefault: false }).where(eq(invoiceSeriesTable.organizationId, organizationId));
    }
    const [row] = await tx.update(invoiceSeriesTable).set({ ...series, updatedAt: new Date() }).where(and(eq(invoiceSeriesTable.id, seriesId), eq(invoiceSeriesTable.organizationId, organizationId))).returning();
    return row;
  });
  if (!saved) {
    throw createInvoiceNotFoundError();
  }
  return { series: saved };
}

// With the name of the contact it belongs to, so a table can show whose product it is without another request
async function listProducts({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId?: string }) {
  const rows = await db
    .select({ product: invoicingProductsTable, contactName: contactsTable.name })
    .from(invoicingProductsTable)
    .leftJoin(contactsTable, eq(invoicingProductsTable.contactId, contactsTable.id))
    .where(and(
      eq(invoicingProductsTable.organizationId, organizationId),
      isNull(invoicingProductsTable.archivedAt),
      contactId === undefined ? undefined : eq(invoicingProductsTable.contactId, contactId),
    ))
    .orderBy(asc(invoicingProductsTable.name));

  return { products: rows.map(({ product, contactName }) => ({ ...product, contactName })) };
}

// A product can only belong to a contact of the same organization
async function ensureProductContact({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId: string | null | undefined }) {
  if (contactId === null || contactId === undefined) {
    return;
  }

  const { contact } = await createContactsRepository({ db }).getContact({ organizationId, contactId });

  if (!contact) {
    throw createContactNotFoundError();
  }
}

// The photo must be a document of the same organization
async function ensureProductImage({ db, organizationId, imageDocumentId }: { db: Database; organizationId: string; imageDocumentId: string | null | undefined }) {
  if (imageDocumentId === null || imageDocumentId === undefined) {
    return;
  }

  const [document] = await db.select({ id: documentsTable.id }).from(documentsTable).where(and(eq(documentsTable.id, imageDocumentId), eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false))).limit(1);

  if (!document) {
    throw createDocumentNotFoundError();
  }
}

async function createProduct({ db, organizationId, product }: { db: Database; organizationId: string; product: ProductInput }) {
  await ensureProductContact({ db, organizationId, contactId: product.contactId });
  await ensureProductImage({ db, organizationId, imageDocumentId: product.imageDocumentId });
  const [saved] = await db.insert(invoicingProductsTable).values({ organizationId, ...product }).returning(); return { product: saved! };
}
async function updateProduct({ db, organizationId, productId, product }: { db: Database; organizationId: string; productId: string; product: ProductInput }) {
  await ensureProductContact({ db, organizationId, contactId: product.contactId });
  await ensureProductImage({ db, organizationId, imageDocumentId: product.imageDocumentId });
  const [saved] = await db.update(invoicingProductsTable).set({ ...product, updatedAt: new Date() }).where(and(eq(invoicingProductsTable.id, productId), eq(invoicingProductsTable.organizationId, organizationId))).returning();
  if (!saved) {
    throw createInvoiceNotFoundError();
  } return { product: saved };
}

async function listTaxRates({ db, organizationId }: { db: Database; organizationId: string }) {
  return { taxRates: await db.select().from(invoicingTaxRatesTable).where(and(eq(invoicingTaxRatesTable.organizationId, organizationId), isNull(invoicingTaxRatesTable.archivedAt))).orderBy(desc(invoicingTaxRatesTable.isDefault), asc(invoicingTaxRatesTable.rateBps)) };
}
async function createTaxRate({ db, organizationId, taxRate }: { db: Database; organizationId: string; taxRate: TaxRateInput }) {
  const saved = await db.transaction(async (tx) => {
    if (taxRate.isDefault) {
      await tx.update(invoicingTaxRatesTable).set({ isDefault: false }).where(eq(invoicingTaxRatesTable.organizationId, organizationId));
    } const [row] = await tx.insert(invoicingTaxRatesTable).values({ organizationId, ...taxRate }).returning(); return row!;
  });
  return { taxRate: saved };
}
async function updateTaxRate({ db, organizationId, taxRateId, taxRate }: { db: Database; organizationId: string; taxRateId: string; taxRate: TaxRateInput }) {
  const saved = await db.transaction(async (tx) => {
    if (taxRate.isDefault) {
      await tx.update(invoicingTaxRatesTable).set({ isDefault: false }).where(eq(invoicingTaxRatesTable.organizationId, organizationId));
    } const [row] = await tx.update(invoicingTaxRatesTable).set({ ...taxRate, updatedAt: new Date() }).where(and(eq(invoicingTaxRatesTable.id, taxRateId), eq(invoicingTaxRatesTable.organizationId, organizationId))).returning(); return row;
  });
  if (!saved) {
    throw createInvoiceNotFoundError();
  } return { taxRate: saved };
}

async function getBranding({ db, organizationId }: { db: Database; organizationId: string }) {
  const [branding] = await db.select().from(invoicingBrandingTable).where(eq(invoicingBrandingTable.organizationId, organizationId)).limit(1); return { branding: branding ?? null };
}
async function upsertBranding({ db, organizationId, branding }: { db: Database; organizationId: string; branding: InvoiceBrandingInput }) {
  const [saved] = await db.insert(invoicingBrandingTable).values({ organizationId, ...branding }).onConflictDoUpdate({ target: invoicingBrandingTable.organizationId, set: { ...branding, updatedAt: new Date() } }).returning(); return { branding: saved! };
}

async function ensureDefaultSeries({ db, organizationId }: { db: Database; organizationId: string }) {
  const [existing] = await db.select().from(invoiceSeriesTable).where(and(eq(invoiceSeriesTable.organizationId, organizationId), eq(invoiceSeriesTable.isDefault, true))).limit(1);
  if (existing) {
    return { series: existing };
  }
  await db.insert(invoiceSeriesTable).values({ organizationId, name: 'General', prefix: 'INV-', nextNumber: 1, padding: 4, isDefault: true }).onConflictDoNothing();
  const [created] = await db.select().from(invoiceSeriesTable).where(and(eq(invoiceSeriesTable.organizationId, organizationId), eq(invoiceSeriesTable.name, 'General'))).limit(1);
  return { series: created! };
}

async function listInvoices({ db, organizationId, status }: { db: Database; organizationId: string; status?: string }) {
  const invoices = await db.select({ invoice: invoicesTable, customerName: contactsTable.name, customerEmail: contactsTable.email, customerIcon: contactsTable.icon, customerIconColor: contactsTable.iconColor })
    .from(invoicesTable)
    .innerJoin(contactsTable, eq(invoicesTable.customerId, contactsTable.id))
    .where(and(eq(invoicesTable.organizationId, organizationId), status !== undefined && status !== '' ? eq(invoicesTable.status, status) : undefined))
    .orderBy(desc(invoicesTable.issueDate), desc(invoicesTable.createdAt));
  return { invoices: invoices.map(({ invoice, ...customer }) => ({ ...invoice, ...customer })) };
}

async function getInvoice({ db, organizationId, invoiceId }: { db: Database; organizationId: string; invoiceId: string }) {
  const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId))).limit(1);
  if (!invoice) {
    return { invoice: null };
  }
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId)).orderBy(asc(invoiceItemsTable.position));
  const { contact: customer } = await createContactsRepository({ db }).getContact({ organizationId, contactId: invoice.customerId });
  // The delivery notes it covers, so the editor can show them and keep them on the next save
  const deliveryNotes = await db
    .select({ id: deliveryNotesTable.id, number: deliveryNotesTable.number, date: deliveryNotesTable.date })
    .from(deliveryNotesTable)
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), eq(deliveryNotesTable.invoiceId, invoiceId)))
    .orderBy(asc(deliveryNotesTable.date));
  return { invoice: { ...invoice, items, customer, deliveryNotes } };
}

// The customer and the sales representative must be contacts of the organization with the matching role
async function ensureInvoiceContacts({ db, organizationId, draft }: { db: Database; organizationId: string; draft: InvoiceDraftInput }) {
  const contactsRepository = createContactsRepository({ db });

  const { contact: customer } = await contactsRepository.getContactWithRole({ organizationId, contactId: draft.customerId, role: 'customer' });

  if (draft.salesRepresentativeId !== undefined && draft.salesRepresentativeId !== null) {
    await contactsRepository.getContactWithRole({ organizationId, contactId: draft.salesRepresentativeId, role: 'sales_representative' });
  }

  return { customer };
}

// The due dates to collect: those typed by the user, or the whole amount on the due date
async function saveInvoiceInstalments({ db, organizationId, invoiceId, draft, payableMinor }: { db: Database; organizationId: string; invoiceId: string; draft: InvoiceDraftInput; payableMinor: number }) {
  await createDueDatesRepository({ db }).saveSourceInstalments({
    organizationId,
    source: { direction: 'receivable', invoiceId },
    contactId: draft.customerId,
    currency: draft.currency,
    paymentMethod: draft.paymentMethod ?? null,
    instalments: draft.instalments !== undefined && draft.instalments.length > 0 ? draft.instalments : [{ dueDate: draft.dueDate, amountMinor: payableMinor }],
  });
}

async function createInvoice({ db, organizationId, draft, userId }: { db: Database; organizationId: string; draft: InvoiceDraftInput; userId: string }) {
  const { customer } = await ensureInvoiceContacts({ db, organizationId, draft });
  const { profile } = await getFiscalProfile({ db, organizationId });
  const effectiveDraft = {
    ...draft,
    equivalenceSurcharge: draft.equivalenceSurcharge ?? customer.equivalenceSurcharge,
    notes: draft.notes ?? profile?.defaultNotes ?? null,
    terms: draft.terms ?? profile?.defaultTerms ?? null,
  };
  const totals = calculateInvoiceTotals(effectiveDraft);
  const { items: invoiceItems, instalments: _instalments, deliveryNoteIds, ...invoiceDraft } = effectiveDraft;
  const invoiceId = await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoicesTable).values({ organizationId, ...invoiceDraft, ...totals, paymentMethod: draft.paymentMethod ?? null, seriesId: draft.seriesId ?? null, salesRepresentativeId: draft.salesRepresentativeId ?? null }).returning();
    await tx.insert(invoiceItemsTable).values(invoiceItems.map((item, position) => ({ invoiceId: invoice!.id, ...item, position })));
    await saveInvoiceInstalments({ db: tx as unknown as Database, organizationId, invoiceId: invoice!.id, draft, payableMinor: totals.totalMinor - totals.withholdingMinor });
    if (deliveryNoteIds !== undefined) {
      await setInvoiceDeliveryNotes({ db: tx as unknown as Database, organizationId, invoiceId: invoice!.id, customerId: draft.customerId, deliveryNoteIds });
    }
    await tx.insert(invoiceEventsTable).values({ invoiceId: invoice!.id, organizationId, userId, type: 'created', createdAt: new Date() });
    return invoice!.id;
  });
  return getInvoice({ db, organizationId, invoiceId });
}

async function updateInvoice({ db, organizationId, invoiceId, draft, userId }: { db: Database; organizationId: string; invoiceId: string; draft: InvoiceDraftInput; userId: string }) {
  const { invoice: existing } = await getInvoice({ db, organizationId, invoiceId });
  if (!existing) {
    throw createInvoiceNotFoundError();
  }
  if (existing.status !== 'draft') {
    throw createInvoiceNotEditableError();
  }
  await ensureInvoiceContacts({ db, organizationId, draft });
  const effectiveDraft = { ...draft, equivalenceSurcharge: draft.equivalenceSurcharge ?? existing.equivalenceSurcharge };
  const totals = calculateInvoiceTotals(effectiveDraft);
  const { items: invoiceItems, instalments: _instalments, deliveryNoteIds, ...invoiceDraft } = effectiveDraft;
  await db.transaction(async (tx) => {
    await saveInvoiceInstalments({ db: tx as unknown as Database, organizationId, invoiceId, draft, payableMinor: totals.totalMinor - totals.withholdingMinor });
    await tx.update(invoicesTable).set({ ...invoiceDraft, ...totals, paymentMethod: draft.paymentMethod ?? null, seriesId: draft.seriesId ?? null, salesRepresentativeId: draft.salesRepresentativeId ?? null, updatedAt: new Date() }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId)));
    await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    await tx.insert(invoiceItemsTable).values(invoiceItems.map((item, position) => ({ invoiceId, ...item, position })));
    if (deliveryNoteIds !== undefined) {
      await setInvoiceDeliveryNotes({ db: tx as unknown as Database, organizationId, invoiceId, customerId: draft.customerId, deliveryNoteIds });
    }
    await tx.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'updated', createdAt: new Date() });
  });
  return getInvoice({ db, organizationId, invoiceId });
}

// The delivery notes a draft covers: the given ones go on it, the ones taken out are pending again. Only pending
// delivery notes of the same customer (or already on this invoice): one invoiced elsewhere in the meantime fails the save
async function setInvoiceDeliveryNotes({ db, organizationId, invoiceId, customerId, deliveryNoteIds }: { db: Database; organizationId: string; invoiceId: string; customerId: string; deliveryNoteIds: string[] }) {
  const ids = [...new Set(deliveryNoteIds)];
  const now = new Date();

  await db.update(deliveryNotesTable)
    .set({ invoiceId: null, updatedAt: now })
    .where(and(eq(deliveryNotesTable.organizationId, organizationId), eq(deliveryNotesTable.invoiceId, invoiceId), ids.length > 0 ? notInArray(deliveryNotesTable.id, ids) : undefined));

  if (ids.length === 0) {
    return;
  }

  const linked = await db.update(deliveryNotesTable)
    .set({ invoiceId, updatedAt: now })
    .where(and(
      eq(deliveryNotesTable.organizationId, organizationId),
      eq(deliveryNotesTable.customerId, customerId),
      inArray(deliveryNotesTable.id, ids),
      or(isNull(deliveryNotesTable.invoiceId), eq(deliveryNotesTable.invoiceId, invoiceId)),
    ))
    .returning({ id: deliveryNotesTable.id });

  if (linked.length !== ids.length) {
    throw createInvoiceDeliveryNotesUnavailableError();
  }
}

async function reserveInvoiceNumber({ db, organizationId, invoiceId, userId }: { db: Database; organizationId: string; invoiceId: string; userId: string }) {
  const { invoice } = await getInvoice({ db, organizationId, invoiceId });
  if (!invoice) {
    throw createInvoiceNotFoundError();
  }
  if (invoice.status === 'issuing') {
    return { invoice };
  }
  if (invoice.status !== 'draft') {
    throw createInvoiceNotIssuableError();
  }
  const { profile } = await getFiscalProfile({ db, organizationId });
  if (!profile) {
    throw createFiscalProfileRequiredError();
  }
  const { series: defaultSeries } = invoice.seriesId !== null ? { series: null } : await ensureDefaultSeries({ db, organizationId });
  const seriesId = invoice.seriesId ?? defaultSeries!.id;
  const { branding } = await getBranding({ db, organizationId });
  const [salesRepresentative] = invoice.salesRepresentativeId !== null ? await db.select().from(contactsTable).where(and(eq(contactsTable.id, invoice.salesRepresentativeId), eq(contactsTable.organizationId, organizationId))).limit(1) : [];

  await db.transaction(async (tx) => {
    const [currentInvoice] = await tx.select({ status: invoicesTable.status }).from(invoicesTable).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId))).limit(1);
    if (!currentInvoice) {
      throw createInvoiceNotFoundError();
    }
    if (currentInvoice.status === 'issuing') {
      return;
    }
    if (currentInvoice.status !== 'draft') {
      throw createInvoiceNotIssuableError();
    }

    const [series] = await tx.select().from(invoiceSeriesTable).where(and(eq(invoiceSeriesTable.id, seriesId), eq(invoiceSeriesTable.organizationId, organizationId))).limit(1);
    if (!series) {
      throw createInvoiceNotIssuableError();
    }
    const number = formatInvoiceNumber(series);
    const [reserved] = await tx.update(invoicesTable).set({
      seriesId: series.id,
      number,
      status: 'issuing',
      sellerSnapshot: JSON.stringify(profile),
      customerSnapshot: JSON.stringify(invoice.customer),
      salesRepresentativeSnapshot: salesRepresentative ? JSON.stringify(salesRepresentative) : null,
      brandingSnapshot: branding ? JSON.stringify(branding) : null,
      updatedAt: new Date(),
    }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId), eq(invoicesTable.status, 'draft'))).returning({ id: invoicesTable.id });
    if (!reserved) {
      return;
    }
    await tx.update(invoiceSeriesTable).set({ nextNumber: series.nextNumber + 1, updatedAt: new Date() }).where(eq(invoiceSeriesTable.id, series.id));
    await tx.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'number_reserved', metadata: JSON.stringify({ number }), createdAt: new Date() });
  });
  return getInvoice({ db, organizationId, invoiceId });
}

async function finalizeInvoice({ db, organizationId, invoiceId, documentId, userId }: { db: Database; organizationId: string; invoiceId: string; documentId: string; userId: string }) {
  const now = new Date();
  const finalized = await db.transaction(async (tx) => {
    const [invoice] = await tx.update(invoicesTable).set({ status: 'issued', documentId, issuedAt: now, updatedAt: now }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId), eq(invoicesTable.status, 'issuing'))).returning();
    if (!invoice) {
      return false;
    }
    await tx.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'issued', metadata: JSON.stringify({ documentId }), createdAt: now });
    return true;
  });
  if (!finalized) {
    const { invoice } = await getInvoice({ db, organizationId, invoiceId });
    if (!invoice || !['issued', 'sent', 'paid'].includes(invoice.status) || invoice.documentId !== documentId) {
      throw createInvoiceNotIssuableError();
    }
  }
  // Issued, the invoice is owed: its due dates get their reminders
  await createDueDatesRepository({ db }).syncSourceReminders({ organizationId, source: { direction: 'receivable', invoiceId } });
  return getInvoice({ db, organizationId, invoiceId });
}

async function markInvoiceSent({ db, organizationId, invoiceId, userId, recipient }: { db: Database; organizationId: string; invoiceId: string; userId: string; recipient: string }) {
  const now = new Date();
  const { invoice: existing } = await getInvoice({ db, organizationId, invoiceId });
  if (!existing) {
    throw createInvoiceNotFoundError();
  }
  if (!['issued', 'sent', 'paid'].includes(existing.status)) {
    throw createInvoiceNotIssuableError();
  }
  const [invoice] = await db.update(invoicesTable).set({ status: existing.status === 'paid' ? 'paid' : 'sent', sentAt: now, updatedAt: now }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId))).returning();
  if (!invoice) {
    throw createInvoiceNotFoundError();
  }
  await db.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'sent', metadata: JSON.stringify({ recipient }), createdAt: now });
  return getInvoice({ db, organizationId, invoiceId });
}

async function markInvoicePaid({ db, organizationId, invoiceId, userId }: { db: Database; organizationId: string; invoiceId: string; userId: string }) {
  const now = new Date();
  const { invoice: existing } = await getInvoice({ db, organizationId, invoiceId });
  if (!existing) {
    throw createInvoiceNotFoundError();
  }
  if (!['issued', 'sent', 'paid'].includes(existing.status)) {
    throw createInvoiceNotIssuableError();
  }
  const [invoice] = await db.update(invoicesTable).set({ status: 'paid', paidAt: now, updatedAt: now }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId))).returning();
  if (!invoice) {
    throw createInvoiceNotFoundError();
  }
  await db.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'paid', createdAt: now });
  await createDueDatesRepository({ db }).setSourceInstalmentsStatus({ organizationId, source: { direction: 'receivable', invoiceId }, status: 'paid', now });
  return getInvoice({ db, organizationId, invoiceId });
}

async function deleteDraft({ db, organizationId, invoiceId }: { db: Database; organizationId: string; invoiceId: string }) {
  const [deleted] = await db.delete(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId), eq(invoicesTable.status, 'draft')))
    .returning();
  if (!deleted) {
    throw createInvoiceNotEditableError();
  }
}

// Catalog entries (products, tax rates) are archived: the invoices already written keep their own copy of the values
async function archiveCatalogItem({ db, table, organizationId, id }: { db: Database; table: typeof invoicingProductsTable | typeof invoicingTaxRatesTable; organizationId: string; id: string }) {
  const [archived] = await db
    .update(table)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId), isNull(table.archivedAt)))
    .returning({ id: table.id });

  if (!archived) {
    throw createInvoiceNotFoundError();
  }
}
