import { boolean, index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProductsTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { COST_CONCEPT_ID_PREFIX, PRICE_LIST_ADJUSTMENT_ID_PREFIX, PRICE_LIST_ID_PREFIX, PRICE_LIST_ITEM_ID_PREFIX, PRODUCT_COST_LINE_ID_PREFIX, SHIPPING_RATE_ID_PREFIX } from './pricing.constants';

// The names of the lines of a cost breakdown, defined by each organization (materials, labour, packaging...)
export const costConceptsTable = pgTable('cost_concepts', {
  ...createPrimaryKeyField({ prefix: COST_CONCEPT_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
}, table => [
  unique('cost_concepts_organization_name_unique').on(table.organizationId, table.name),
]);

// The cost breakdown of a product: what making or buying one unit costs, the same whoever it is sold to
export const productCostLinesTable = pgTable('product_cost_lines', {
  ...createPrimaryKeyField({ prefix: PRODUCT_COST_LINE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoicingProductsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  conceptId: text('concept_id').notNull().references(() => costConceptsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  amountMinor: integer('amount_minor').notNull(),
  position: integer('position').notNull().default(0),
}, table => [
  index('product_cost_lines_product_id_index').on(table.productId),
  index('product_cost_lines_organization_id_index').on(table.organizationId),
]);

// A saved shipping cost per unit, with the carrier doing it: a price list or one of its products points to one
export const shippingRatesTable = pgTable('shipping_rates', {
  ...createPrimaryKeyField({ prefix: SHIPPING_RATE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  carrierContactId: text('carrier_contact_id').references(() => contactsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  amountMinor: integer('amount_minor').notNull(),
  notes: text('notes'),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('shipping_rates_organization_id_index').on(table.organizationId),
]);

// The prices of some products for the contacts assigned to it; the default one applies to the contacts without any
export const priceListsTable = pgTable('price_lists', {
  ...createPrimaryKeyField({ prefix: PRICE_LIST_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  // Applied on every line of the invoices of its contacts
  discountRateBps: integer('discount_rate_bps').notNull().default(0),
  defaultShippingRateId: text('default_shipping_rate_id').references(() => shippingRatesTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  isDefault: boolean('is_default').notNull().default(false),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('price_lists_organization_id_index').on(table.organizationId),
]);

export const priceListItemsTable = pgTable('price_list_items', {
  ...createPrimaryKeyField({ prefix: PRICE_LIST_ITEM_ID_PREFIX }),
  ...createTimestampColumns(),
  priceListId: text('price_list_id').notNull().references(() => priceListsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoicingProductsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Selling price of one unit, taxes excluded
  priceMinor: integer('price_minor').notNull(),
  // false: the shipping of the price list; true: `shippingRateId`, null meaning no shipping
  overridesShipping: boolean('overrides_shipping').notNull().default(false),
  shippingRateId: text('shipping_rate_id').references(() => shippingRatesTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  position: integer('position').notNull().default(0),
}, table => [
  unique('price_list_items_price_list_product_unique').on(table.priceListId, table.productId),
]);

// A contact (customer or supplier) has at most one price list, a price list serves any number of contacts
export const priceListContactsTable = pgTable('price_list_contacts', {
  contactId: text('contact_id').primaryKey().references(() => contactsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  priceListId: text('price_list_id').notNull().references(() => priceListsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
}, table => [
  index('price_list_contacts_price_list_id_index').on(table.priceListId),
]);

// Every raise or cut of all the prices of a price list, so its history can be read on the price list
export const priceListAdjustmentsTable = pgTable('price_list_adjustments', {
  ...createPrimaryKeyField({ prefix: PRICE_LIST_ADJUSTMENT_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  priceListId: text('price_list_id').notNull().references(() => priceListsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // Positive for a raise, negative for a cut, in hundredths of a percent
  rateBps: integer('rate_bps').notNull(),
  productCount: integer('product_count').notNull(),
}, table => [
  index('price_list_adjustments_price_list_id_index').on(table.priceListId, table.createdAt),
]);
