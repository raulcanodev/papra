import type { Database } from '../app/database/database.types';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { contactsTable } from '../contacts/contacts.table';
import { invoiceItemsTable, invoicesTable, invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { purchaseInvoiceItemsTable, purchaseInvoicesTable } from '../purchases/purchases.tables';

// Invoices that count for taxes: a draft is not issued yet, a voided invoice does not count anymore
const TAXABLE_ISSUED_INVOICE_STATUSES = ['issued', 'sent', 'paid'];

export type TaxesRepository = ReturnType<typeof createTaxesRepository>;

export function createTaxesRepository({ db }: { db: Database }) {
  return {
    getTaxProfile: async (args: { organizationId: string }) => getTaxProfile({ db, ...args }),
    getTaxableDocuments: async (args: { organizationId: string; from: Date; to: Date; currency: string }) => getTaxableDocuments({ db, ...args }),
    saveAccountantEmail: async (args: { organizationId: string; accountantEmail: string }) => saveAccountantEmail({ db, ...args }),
  };
}

async function getTaxProfile({ db, organizationId }: { db: Database; organizationId: string }) {
  const [profile] = await db.select().from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1);

  return { profile: profile ?? null };
}

async function saveAccountantEmail({ db, organizationId, accountantEmail }: { db: Database; organizationId: string; accountantEmail: string }) {
  await db.update(invoicingProfilesTable).set({ accountantEmail, updatedAt: new Date() }).where(eq(invoicingProfilesTable.organizationId, organizationId));
}

// Issued and received invoices of a date range with their lines, in the organization currency (amounts in different
// currencies cannot be added up): a few queries whatever the number of invoices, grouped in memory
async function getTaxableDocuments({ db, organizationId, from, to, currency }: { db: Database; organizationId: string; from: Date; to: Date; currency: string }) {
  const [issuedRows, purchaseRows] = await Promise.all([
    db
      .select({ invoice: invoicesTable, customerName: contactsTable.name, customerTaxId: contactsTable.taxId })
      .from(invoicesTable)
      .innerJoin(contactsTable, eq(invoicesTable.customerId, contactsTable.id))
      .where(and(
        eq(invoicesTable.organizationId, organizationId),
        inArray(invoicesTable.status, TAXABLE_ISSUED_INVOICE_STATUSES),
        eq(invoicesTable.currency, currency),
        gte(invoicesTable.issueDate, from),
        lt(invoicesTable.issueDate, to),
      ))
      .orderBy(asc(invoicesTable.issueDate), asc(invoicesTable.number)),
    db
      .select({ purchaseInvoice: purchaseInvoicesTable, supplierName: contactsTable.name, supplierTaxId: contactsTable.taxId })
      .from(purchaseInvoicesTable)
      .innerJoin(contactsTable, eq(purchaseInvoicesTable.supplierId, contactsTable.id))
      .where(and(
        eq(purchaseInvoicesTable.organizationId, organizationId),
        eq(purchaseInvoicesTable.currency, currency),
        gte(purchaseInvoicesTable.issueDate, from),
        lt(purchaseInvoicesTable.issueDate, to),
      ))
      .orderBy(asc(purchaseInvoicesTable.issueDate), asc(purchaseInvoicesTable.number)),
  ]);

  const issuedIds = issuedRows.map(({ invoice }) => invoice.id);
  const purchaseIds = purchaseRows.map(({ purchaseInvoice }) => purchaseInvoice.id);

  const [issuedItems, purchaseItems] = await Promise.all([
    issuedIds.length === 0 ? [] : db.select().from(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, issuedIds)).orderBy(asc(invoiceItemsTable.position)),
    purchaseIds.length === 0 ? [] : db.select().from(purchaseInvoiceItemsTable).where(inArray(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseIds)).orderBy(asc(purchaseInvoiceItemsTable.position)),
  ]);

  const groupBy = <T, K extends keyof T>(rows: T[], key: K) => rows.reduce((groups, row) => groups.set(row[key], [...(groups.get(row[key]) ?? []), row]), new Map<T[K], T[]>());
  const issuedItemsByInvoice = groupBy(issuedItems, 'invoiceId');
  const purchaseItemsByInvoice = groupBy(purchaseItems, 'purchaseInvoiceId');

  return {
    issuedInvoices: issuedRows.map(({ invoice, customerName, customerTaxId }) => ({ ...invoice, customerName, customerTaxId, items: issuedItemsByInvoice.get(invoice.id) ?? [] })),
    purchaseInvoices: purchaseRows.map(({ purchaseInvoice, supplierName, supplierTaxId }) => ({ ...purchaseInvoice, supplierName, supplierTaxId, items: purchaseItemsByInvoice.get(purchaseInvoice.id) ?? [] })),
  };
}
