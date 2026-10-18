import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { invoicesTable, invoicingProductsTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { DELIVERY_NOTE_ID_PREFIX, DELIVERY_NOTE_ITEM_ID_PREFIX } from './delivery-notes.constants';

// Delivery notes (albaranes) handed to customers with the goods: what and how much, no prices. Not a tax document,
// several of them end up on one invoice, priced then with the customer price list
export const deliveryNotesTable = pgTable('delivery_notes', {
  ...createPrimaryKeyField({ prefix: DELIVERY_NOTE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => contactsTable.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  // The number printed on the pad, when there is one
  number: text('number'),
  date: timestamp('date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  notes: text('notes'),
  // The photo of the paper copy, usually signed by the customer: the proof of delivery
  documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // The invoice it went on; null while pending. Deleting a draft invoice frees its delivery notes
  invoiceId: text('invoice_id').references(() => invoicesTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, table => [
  index('delivery_notes_organization_date_index').on(table.organizationId, table.date),
  index('delivery_notes_customer_id_index').on(table.customerId),
  index('delivery_notes_invoice_id_index').on(table.invoiceId),
]);

export const deliveryNoteItemsTable = pgTable('delivery_note_items', {
  ...createPrimaryKeyField({ prefix: DELIVERY_NOTE_ITEM_ID_PREFIX }),
  ...createTimestampColumns(),
  deliveryNoteId: text('delivery_note_id').notNull().references(() => deliveryNotesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  productId: text('product_id').references(() => invoicingProductsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // What was handwritten on the paper ("3 caj tom pera"): the next readings learn the product it stands for
  writtenText: text('written_text'),
  description: text('description').notNull(),
  quantityMillis: integer('quantity_millis').notNull(),
  position: integer('position').notNull().default(0),
}, table => [
  index('delivery_note_items_delivery_note_id_index').on(table.deliveryNoteId),
  index('delivery_note_items_product_id_index').on(table.productId),
]);
