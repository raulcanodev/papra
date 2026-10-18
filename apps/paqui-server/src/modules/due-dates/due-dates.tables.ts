import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { invoicesTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { purchaseInvoicesTable } from '../purchases/purchases.tables';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { DEFAULT_REMINDER_DAYS_BEFORE, DUE_DATE_DIRECTIONS, INSTALMENT_STATUSES, PAYMENT_INSTALMENT_ID_PREFIX, PAYMENT_METHODS } from './due-dates.constants';

// One due date of an invoice: a single one for most invoices, several when it is paid in instalments (30/60/90 days...).
// Either a received invoice (to pay) or an issued one (to collect)
export const paymentInstalmentsTable = pgTable('payment_instalments', {
  ...createPrimaryKeyField({ prefix: PAYMENT_INSTALMENT_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  direction: text('direction', { enum: DUE_DATE_DIRECTIONS }).notNull(),
  purchaseInvoiceId: text('purchase_invoice_id').references(() => purchaseInvoicesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  invoiceId: text('invoice_id').references(() => invoicesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // The supplier or the customer, kept here so the due dates can be listed and filtered without going through each invoice
  contactId: text('contact_id').notNull().references(() => contactsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  dueDate: timestamp('due_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull().default('EUR'),
  paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
  status: text('status', { enum: INSTALMENT_STATUSES }).notNull().default('pending'),
  paidAt: timestamp('paid_at', { mode: 'date', withTimezone: true, precision: 3 }),
  returnedAt: timestamp('returned_at', { mode: 'date', withTimezone: true, precision: 3 }),
  position: integer('position').notNull().default(0),
}, table => [
  index('payment_instalments_organization_due_date_index').on(table.organizationId, table.dueDate),
  index('payment_instalments_purchase_invoice_id_index').on(table.purchaseInvoiceId),
  index('payment_instalments_invoice_id_index').on(table.invoiceId),
  check('payment_instalments_status_check', sql.raw(`"status" IN (${INSTALMENT_STATUSES.map(status => `'${status}'`).join(', ')})`)),
  check('payment_instalments_direction_check', sql.raw(`"direction" IN (${DUE_DATE_DIRECTIONS.map(direction => `'${direction}'`).join(', ')})`)),
  // Exactly one source document, matching the direction
  check('payment_instalments_source_check', sql.raw(`("direction" = 'payable' AND "purchase_invoice_id" IS NOT NULL AND "invoice_id" IS NULL) OR ("direction" = 'receivable' AND "invoice_id" IS NOT NULL AND "purchase_invoice_id" IS NULL)`)),
]);

// What each organization wants to be told about its due dates
export const dueDateSettingsTable = pgTable('due_date_settings', {
  organizationId: text('organization_id').primaryKey().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  // The reminders are always kept (and shown in the app), they are only emailed when this is on
  emailRemindersEnabled: boolean('email_reminders_enabled').notNull().default(false),
  // Where the reminders are emailed, the organization owner when empty
  reminderEmail: text('reminder_email'),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(DEFAULT_REMINDER_DAYS_BEFORE),
  // Documents received on an intake email are read as invoices to pay, like an upload on the purchases page
  readIntakeEmailAttachments: boolean('read_intake_email_attachments').notNull().default(true),
});
