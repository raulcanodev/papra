import type { Database } from '../app/database/database.types';
import type { SearchHit } from './search.models';
import { and, desc, eq, exists, ilike, isNull, or } from 'drizzle-orm';
import { contactsTable } from '../contacts/contacts.table';
import { invoiceItemsTable, invoicesTable, invoicingProductsTable } from '../invoicing/invoicing.tables';
import { purchaseInvoiceItemsTable, purchaseInvoicesTable } from '../purchases/purchases.tables';
import { buildContainsPattern, findMatchedField } from './search.models';

type SearchArgs = { db: Database; organizationId: string; query: string; limit: number };

export function createSearchRepository({ db }: { db: Database }) {
  return {
    searchContacts: async (args: Omit<SearchArgs, 'db'>) => searchContacts({ db, ...args }),
    searchInvoices: async (args: Omit<SearchArgs, 'db'>) => searchInvoices({ db, ...args }),
    searchPurchaseInvoices: async (args: Omit<SearchArgs, 'db'>) => searchPurchaseInvoices({ db, ...args }),
    searchProducts: async (args: Omit<SearchArgs, 'db'>) => searchProducts({ db, ...args }),
  };
}

async function searchContacts({ db, organizationId, query, limit }: SearchArgs): Promise<SearchHit[]> {
  const pattern = buildContainsPattern({ query });

  const contacts = await db
    .select()
    .from(contactsTable)
    .where(and(
      eq(contactsTable.organizationId, organizationId),
      isNull(contactsTable.archivedAt),
      or(
        ilike(contactsTable.name, pattern),
        ilike(contactsTable.taxId, pattern),
        ilike(contactsTable.email, pattern),
        ilike(contactsTable.phone, pattern),
        ilike(contactsTable.city, pattern),
        ilike(contactsTable.notes, pattern),
      ),
    ))
    .orderBy(contactsTable.name)
    .limit(limit);

  return contacts.map(contact => ({
    kind: 'contact',
    id: contact.id,
    title: contact.name,
    subtitle: [
      [contact.isCustomer && 'customer', contact.isSupplier && 'supplier', contact.isSalesRepresentative && 'sales representative'].filter(Boolean).join(', '),
      contact.taxId,
      contact.email,
    ].filter(Boolean).join(' · ') || null,
    matchedOn: findMatchedField({ query, fields: { name: contact.name, taxId: contact.taxId, email: contact.email, phone: contact.phone, city: contact.city, notes: contact.notes } }) ?? 'name',
  }));
}

async function searchInvoices({ db, organizationId, query, limit }: SearchArgs): Promise<SearchHit[]> {
  const pattern = buildContainsPattern({ query });

  const rows = await db
    .select({ invoice: invoicesTable, customerName: contactsTable.name, customerTaxId: contactsTable.taxId })
    .from(invoicesTable)
    .innerJoin(contactsTable, eq(invoicesTable.customerId, contactsTable.id))
    .where(and(
      eq(invoicesTable.organizationId, organizationId),
      or(
        ilike(invoicesTable.number, pattern),
        ilike(invoicesTable.notes, pattern),
        ilike(contactsTable.name, pattern),
        ilike(contactsTable.taxId, pattern),
        exists(db.select({ id: invoiceItemsTable.id }).from(invoiceItemsTable).where(and(eq(invoiceItemsTable.invoiceId, invoicesTable.id), ilike(invoiceItemsTable.description, pattern)))),
      ),
    ))
    .orderBy(desc(invoicesTable.issueDate))
    .limit(limit);

  return rows.map(({ invoice, customerName, customerTaxId }) => ({
    kind: 'invoice',
    id: invoice.id,
    title: invoice.number ?? 'Draft invoice',
    subtitle: `${customerName} · ${invoice.status} · ${(invoice.totalMinor / 100).toFixed(2)} ${invoice.currency}`,
    matchedOn: findMatchedField({ query, fields: { number: invoice.number, customer: customerName, customerTaxId, notes: invoice.notes } }) ?? 'line item',
  }));
}

async function searchPurchaseInvoices({ db, organizationId, query, limit }: SearchArgs): Promise<SearchHit[]> {
  const pattern = buildContainsPattern({ query });

  const rows = await db
    .select({ purchaseInvoice: purchaseInvoicesTable, supplierName: contactsTable.name, supplierTaxId: contactsTable.taxId })
    .from(purchaseInvoicesTable)
    .innerJoin(contactsTable, eq(purchaseInvoicesTable.supplierId, contactsTable.id))
    .where(and(
      eq(purchaseInvoicesTable.organizationId, organizationId),
      or(
        ilike(purchaseInvoicesTable.number, pattern),
        ilike(purchaseInvoicesTable.notes, pattern),
        ilike(contactsTable.name, pattern),
        ilike(contactsTable.taxId, pattern),
        exists(db.select({ id: purchaseInvoiceItemsTable.id }).from(purchaseInvoiceItemsTable).where(and(eq(purchaseInvoiceItemsTable.purchaseInvoiceId, purchaseInvoicesTable.id), ilike(purchaseInvoiceItemsTable.description, pattern)))),
      ),
    ))
    .orderBy(desc(purchaseInvoicesTable.issueDate))
    .limit(limit);

  return rows.map(({ purchaseInvoice, supplierName, supplierTaxId }) => ({
    kind: 'purchase_invoice',
    id: purchaseInvoice.id,
    title: purchaseInvoice.number,
    subtitle: `${supplierName} · ${purchaseInvoice.status} · ${(purchaseInvoice.totalMinor / 100).toFixed(2)} ${purchaseInvoice.currency}`,
    matchedOn: findMatchedField({ query, fields: { number: purchaseInvoice.number, supplier: supplierName, supplierTaxId, notes: purchaseInvoice.notes } }) ?? 'line item',
  }));
}

async function searchProducts({ db, organizationId, query, limit }: SearchArgs): Promise<SearchHit[]> {
  const pattern = buildContainsPattern({ query });

  const products = await db
    .select()
    .from(invoicingProductsTable)
    .where(and(
      eq(invoicingProductsTable.organizationId, organizationId),
      isNull(invoicingProductsTable.archivedAt),
      or(ilike(invoicingProductsTable.name, pattern), ilike(invoicingProductsTable.description, pattern)),
    ))
    .orderBy(invoicingProductsTable.name)
    .limit(limit);

  return products.map(product => ({
    kind: 'product',
    id: product.id,
    title: product.name,
    subtitle: `${(product.unitPriceMinor / 100).toFixed(2)} ${product.currency} / ${product.unit}`,
    matchedOn: findMatchedField({ query, fields: { name: product.name, description: product.description } }) ?? 'name',
  }));
}
