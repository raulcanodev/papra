/* eslint-disable style/max-statements-per-line */
import type { Database } from '../app/database/database.types';
import type { FiscalProfileInput, InvoiceBrandingInput, InvoiceDraftInput, InvoiceSeriesInput, ProductInput, TaxRateInput } from './invoicing.models';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { createContactsRepository } from '../contacts/contacts.repository';
import { contactsTable } from '../contacts/contacts.table';
import { createFiscalProfileRequiredError, createInvoiceNotEditableError, createInvoiceNotFoundError, createInvoiceNotIssuableError } from './invoicing.errors';
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
    listProducts: async (args: { organizationId: string }) => listProducts({ db, ...args }),
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

async function listProducts({ db, organizationId }: { db: Database; organizationId: string }) {
  return { products: await db.select().from(invoicingProductsTable).where(and(eq(invoicingProductsTable.organizationId, organizationId), isNull(invoicingProductsTable.archivedAt))).orderBy(asc(invoicingProductsTable.name)) };
}
async function createProduct({ db, organizationId, product }: { db: Database; organizationId: string; product: ProductInput }) {
  const [saved] = await db.insert(invoicingProductsTable).values({ organizationId, ...product }).returning(); return { product: saved! };
}
async function updateProduct({ db, organizationId, productId, product }: { db: Database; organizationId: string; productId: string; product: ProductInput }) {
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
  const invoices = await db.select({ invoice: invoicesTable, customerName: contactsTable.name, customerEmail: contactsTable.email })
    .from(invoicesTable)
    .innerJoin(contactsTable, eq(invoicesTable.customerId, contactsTable.id))
    .where(and(eq(invoicesTable.organizationId, organizationId), status !== undefined && status !== '' ? eq(invoicesTable.status, status) : undefined))
    .orderBy(desc(invoicesTable.issueDate), desc(invoicesTable.createdAt));
  return { invoices: invoices.map(({ invoice, customerName, customerEmail }) => ({ ...invoice, customerName, customerEmail })) };
}

async function getInvoice({ db, organizationId, invoiceId }: { db: Database; organizationId: string; invoiceId: string }) {
  const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId))).limit(1);
  if (!invoice) {
    return { invoice: null };
  }
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId)).orderBy(asc(invoiceItemsTable.position));
  const { contact: customer } = await createContactsRepository({ db }).getContact({ organizationId, contactId: invoice.customerId });
  return { invoice: { ...invoice, items, customer } };
}

// The customer and the sales representative must be contacts of the organization with the matching role
async function ensureInvoiceContacts({ db, organizationId, draft }: { db: Database; organizationId: string; draft: InvoiceDraftInput }) {
  const contactsRepository = createContactsRepository({ db });

  await contactsRepository.getContactWithRole({ organizationId, contactId: draft.customerId, role: 'customer' });

  if (draft.salesRepresentativeId !== undefined && draft.salesRepresentativeId !== null) {
    await contactsRepository.getContactWithRole({ organizationId, contactId: draft.salesRepresentativeId, role: 'sales_representative' });
  }
}

async function createInvoice({ db, organizationId, draft, userId }: { db: Database; organizationId: string; draft: InvoiceDraftInput; userId: string }) {
  await ensureInvoiceContacts({ db, organizationId, draft });
  const { profile } = await getFiscalProfile({ db, organizationId });
  const effectiveDraft = {
    ...draft,
    notes: draft.notes ?? profile?.defaultNotes ?? null,
    terms: draft.terms ?? profile?.defaultTerms ?? null,
  };
  const totals = calculateInvoiceTotals(effectiveDraft);
  const { items: invoiceItems, ...invoiceDraft } = effectiveDraft;
  const invoiceId = await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoicesTable).values({ organizationId, ...invoiceDraft, ...totals, seriesId: draft.seriesId ?? null, salesRepresentativeId: draft.salesRepresentativeId ?? null }).returning();
    await tx.insert(invoiceItemsTable).values(invoiceItems.map((item, position) => ({ invoiceId: invoice!.id, ...item, position })));
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
  const totals = calculateInvoiceTotals(draft);
  const { items: invoiceItems, ...invoiceDraft } = draft;
  await db.transaction(async (tx) => {
    await tx.update(invoicesTable).set({ ...invoiceDraft, ...totals, seriesId: draft.seriesId ?? null, salesRepresentativeId: draft.salesRepresentativeId ?? null, updatedAt: new Date() }).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.organizationId, organizationId)));
    await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    await tx.insert(invoiceItemsTable).values(invoiceItems.map((item, position) => ({ invoiceId, ...item, position })));
    await tx.insert(invoiceEventsTable).values({ invoiceId, organizationId, userId, type: 'updated', createdAt: new Date() });
  });
  return getInvoice({ db, organizationId, invoiceId });
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
