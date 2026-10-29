import type { PurchaseMetadataEntry } from './purchases.schemas';
import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { PAYMENT_METHODS } from '../due-dates/due-dates.constants';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { EXPENSE_CATEGORIES, PURCHASE_DOCUMENT_KINDS, PURCHASE_INVOICE_ID_PREFIX, PURCHASE_INVOICE_ITEM_ID_PREFIX, PURCHASE_INVOICE_STATUSES } from './purchases.constants';

// Invoices received from suppliers: the expenses side of the books (deductible VAT, income tax expenses)
export const purchaseInvoicesTable = pgTable('purchase_invoices', {
  ...createPrimaryKeyField({ prefix: PURCHASE_INVOICE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  supplierId: text('supplier_id').notNull().references(() => contactsTable.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  // The supplier own invoice number, as printed on the invoice
  number: text('number').notNull(),
  kind: text('kind', { enum: PURCHASE_DOCUMENT_KINDS }).notNull().default('invoice'),
  issueDate: timestamp('issue_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  dueDate: timestamp('due_date', { mode: 'date', withTimezone: true, precision: 3 }),
  currency: text('currency').notNull().default('EUR'),
  category: text('category', { enum: EXPENSE_CATEGORIES }).notNull().default('other'),
  status: text('status', { enum: PURCHASE_INVOICE_STATUSES }).notNull().default('pending'),
  subtotalMinor: integer('subtotal_minor').notNull().default(0),
  taxMinor: integer('tax_minor').notNull().default(0),
  // Part of the VAT that can be deducted (a car used half privately only deducts 50%...)
  deductibleTaxMinor: integer('deductible_tax_minor').notNull().default(0),
  totalMinor: integer('total_minor').notNull().default(0),
  withholdingRateBps: integer('withholding_rate_bps').notNull().default(0),
  withholdingMinor: integer('withholding_minor').notNull().default(0),
  notes: text('notes'),
  // Everything printed on the paper that has no column of its own, as read by the AI or typed by the user
  metadata: jsonb('metadata').notNull().$type<PurchaseMetadataEntry[]>().default([]),
  // The invoice file, archived in the supplier folder
  documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  paidAt: timestamp('paid_at', { mode: 'date', withTimezone: true, precision: 3 }),
  // How the supplier is paid; the due dates themselves are in payment_instalments
  paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
}, table => [
  index('purchase_invoices_organization_issue_date_index').on(table.organizationId, table.issueDate),
  index('purchase_invoices_supplier_id_index').on(table.supplierId),
  index('purchase_invoices_document_id_index').on(table.documentId),
  // The same supplier invoice cannot be registered twice
  unique('purchase_invoices_organization_supplier_number_unique').on(table.organizationId, table.supplierId, table.number),
  check('purchase_invoices_status_check', sql.raw(`"status" IN (${PURCHASE_INVOICE_STATUSES.map(status => `'${status}'`).join(', ')})`)),
  check('purchase_invoices_kind_check', sql.raw(`"kind" IN (${PURCHASE_DOCUMENT_KINDS.map(kind => `'${kind}'`).join(', ')})`)),
  check('purchase_invoices_category_check', sql.raw(`"category" IN (${EXPENSE_CATEGORIES.map(category => `'${category}'`).join(', ')})`)),
]);

export const purchaseInvoiceItemsTable = pgTable('purchase_invoice_items', {
  ...createPrimaryKeyField({ prefix: PURCHASE_INVOICE_ITEM_ID_PREFIX }),
  ...createTimestampColumns(),
  purchaseInvoiceId: text('purchase_invoice_id').notNull().references(() => purchaseInvoicesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  description: text('description').notNull(),
  quantityMillis: integer('quantity_millis').notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  // The exact unit price in millionths when the paper prints it beyond the cent (0,365 €): the line amount is computed
  // from it. Null when the price is a whole number of cents, unitPriceMinor is then exact
  unitPriceMicros: bigint('unit_price_micros', { mode: 'number' }),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  discountRateBps: integer('discount_rate_bps').notNull().default(0),
  deductibleRateBps: integer('deductible_rate_bps').notNull().default(10_000),
  position: integer('position').notNull().default(0),
}, table => [
  index('purchase_invoice_items_purchase_invoice_id_index').on(table.purchaseInvoiceId),
]);
