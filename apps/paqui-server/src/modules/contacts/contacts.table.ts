import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { ENTITY_ICON_COLORS } from '../shared/appearance/appearance.constants';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { CONTACT_ID_PREFIX, CONTACT_KINDS } from './contacts.constants';

// The organization address book: one row per person or company, whatever the roles it plays.
// Former customers kept their `cus_` ids and former sales representatives their `rep_` ids when merged in here.
export const contactsTable = pgTable('contacts', {
  ...createPrimaryKeyField({ prefix: CONTACT_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  kind: text('kind', { enum: CONTACT_KINDS }).notNull().default('company'),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  taxId: text('tax_id'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  postalCode: text('postal_code'),
  city: text('city'),
  region: text('region'),
  country: text('country'),
  // IBAN or any other account number the transfers to or from the contact go through
  bankAccount: text('bank_account'),
  currency: text('currency').notNull().default('EUR'),
  paymentTermsDays: integer('payment_terms_days'),
  notes: text('notes'),
  icon: text('icon'),
  iconColor: text('icon_color', { enum: ENTITY_ICON_COLORS }),
  isCustomer: boolean('is_customer').notNull().default(false),
  isSupplier: boolean('is_supplier').notNull().default(false),
  isSalesRepresentative: boolean('is_sales_representative').notNull().default(false),
  // A retailer under the equivalence surcharge: its invoices carry the surcharge on top of the VAT
  equivalenceSurcharge: boolean('equivalence_surcharge').notNull().default(false),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('contacts_organization_id_index').on(table.organizationId),
  // Duplicate detection when creating or importing contacts goes through the tax id
  index('contacts_organization_id_tax_id_index').on(table.organizationId, table.taxId),
  check('contacts_kind_check', sql`${table.kind} IN ('company', 'person')`),
]);
