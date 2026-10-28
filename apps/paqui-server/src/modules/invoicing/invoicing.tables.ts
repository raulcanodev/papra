import { boolean, index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { PAYMENT_METHODS } from '../due-dates/due-dates.constants';
import { organizationsTable } from '../organizations/organizations.table';
import { ENTITY_ICON_COLORS } from '../shared/appearance/appearance.constants';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { INCOME_TAX_METHODS, LEGAL_FORMS, VAT_REGIMES } from '../taxes/taxes.constants';
import { usersTable } from '../users/users.table';
import { INVOICE_EVENT_ID_PREFIX, INVOICE_ID_PREFIX, INVOICE_ITEM_ID_PREFIX, INVOICE_SERIES_ID_PREFIX, PRODUCT_ID_PREFIX, TAX_RATE_ID_PREFIX, VERIFACTU_ATTEMPT_ID_PREFIX, VERIFACTU_RECORD_ID_PREFIX } from './invoicing.constants';

export const invoicingProfilesTable = pgTable('invoicing_profiles', {
  organizationId: text('organization_id').primaryKey().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  legalName: text('legal_name').notNull(),
  taxId: text('tax_id'),
  email: text('email'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  postalCode: text('postal_code'),
  city: text('city'),
  region: text('region'),
  country: text('country'),
  currency: text('currency').notNull().default('EUR'),
  locale: text('locale').notNull().default('es-ES'),
  paymentTermsDays: integer('payment_terms_days'),
  defaultNotes: text('default_notes'),
  defaultTerms: text('default_terms'),
  templateId: text('template_id').notNull().default('minimal'),
  // IRPF withholding applied by default on new invoices (15% for professionals, 7% the first years, 0 otherwise)
  defaultWithholdingRateBps: integer('default_withholding_rate_bps').notNull().default(0),
  // Tax profile used by the quarterly taxes estimation (null until the organization fills it in)
  legalForm: text('legal_form', { enum: LEGAL_FORMS }),
  vatRegime: text('vat_regime', { enum: VAT_REGIMES }).notNull().default('general'),
  incomeTaxMethod: text('income_tax_method', { enum: INCOME_TAX_METHODS }).notNull().default('direct_simplified'),
  // Companies: the corporate tax quota of the last closed year, base of the model 202 instalments
  lastCorporateTaxQuotaMinor: integer('last_corporate_tax_quota_minor'),
  // Where the quarterly documents for the accountant are sent
  accountantEmail: text('accountant_email'),
});

export const invoiceSeriesTable = pgTable('invoice_series', {
  ...createPrimaryKeyField({ prefix: INVOICE_SERIES_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull().default('INV-'),
  nextNumber: integer('next_number').notNull().default(1),
  padding: integer('padding').notNull().default(4),
  isDefault: boolean('is_default').notNull().default(false),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('invoice_series_organization_id_index').on(table.organizationId),
  unique('invoice_series_organization_name_unique').on(table.organizationId, table.name),
]);

export const invoicingProductsTable = pgTable('invoicing_products', {
  ...createPrimaryKeyField({ prefix: PRODUCT_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit').notNull().default('unit'),
  unitPriceMinor: integer('unit_price_minor').notNull().default(0),
  currency: text('currency').notNull().default('EUR'),
  taxRateBps: integer('tax_rate_bps').notNull().default(2100),
  icon: text('icon'),
  iconColor: text('icon_color', { enum: ENTITY_ICON_COLORS }),
  // The contact it belongs to: a supplier's product we buy, or a customer's own product; null is our own catalog
  contactId: text('contact_id').references(() => contactsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // Its photo, a document of the organization (taken with the phone or uploaded)
  imageDocumentId: text('image_document_id').references(() => documentsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('invoicing_products_organization_id_index').on(table.organizationId),
  index('invoicing_products_organization_id_contact_id_index').on(table.organizationId, table.contactId),
]);

export const invoicingTaxRatesTable = pgTable('invoicing_tax_rates', {
  ...createPrimaryKeyField({ prefix: TAX_RATE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  rateBps: integer('rate_bps').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  archivedAt: timestamp('archived_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [index('invoicing_tax_rates_organization_id_index').on(table.organizationId), unique('invoicing_tax_rates_organization_name_unique').on(table.organizationId, table.name)]);

export const invoicingBrandingTable = pgTable('invoicing_branding', {
  organizationId: text('organization_id').primaryKey().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  accentColor: text('accent_color').notNull().default('#111827'),
  footerText: text('footer_text'),
  paymentDetails: text('payment_details'),
});

export const invoicesTable = pgTable('invoices', {
  ...createPrimaryKeyField({ prefix: INVOICE_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => contactsTable.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  seriesId: text('series_id').references(() => invoiceSeriesTable.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  salesRepresentativeId: text('sales_representative_id').references(() => contactsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  status: text('status').notNull().default('draft'),
  number: text('number'),
  issueDate: timestamp('issue_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  dueDate: timestamp('due_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  currency: text('currency').notNull().default('EUR'),
  customerSnapshot: text('customer_snapshot'),
  sellerSnapshot: text('seller_snapshot'),
  salesRepresentativeSnapshot: text('sales_representative_snapshot'),
  brandingSnapshot: text('branding_snapshot'),
  subtotalMinor: integer('subtotal_minor').notNull().default(0),
  taxMinor: integer('tax_minor').notNull().default(0),
  // Equivalence surcharge charged to a retailer customer, on top of the VAT of each line
  equivalenceSurcharge: boolean('equivalence_surcharge').notNull().default(false),
  equivalenceSurchargeMinor: integer('equivalence_surcharge_minor').notNull().default(0),
  // Invoice total, taxes and surcharge included: the amount declared to VERI*FACTU, the withholding is not subtracted from it
  totalMinor: integer('total_minor').notNull().default(0),
  // IRPF withholding the customer pays to the tax agency on behalf of the issuer, computed on the subtotal
  withholdingRateBps: integer('withholding_rate_bps').notNull().default(0),
  withholdingMinor: integer('withholding_minor').notNull().default(0),
  notes: text('notes'),
  terms: text('terms'),
  templateId: text('template_id').notNull().default('minimal'),
  issuedAt: timestamp('issued_at', { mode: 'date', withTimezone: true, precision: 3 }),
  sentAt: timestamp('sent_at', { mode: 'date', withTimezone: true, precision: 3 }),
  paidAt: timestamp('paid_at', { mode: 'date', withTimezone: true, precision: 3 }),
  voidedAt: timestamp('voided_at', { mode: 'date', withTimezone: true, precision: 3 }),
  // Issued outside the app (its paper uploaded afterwards): its document is the original, it is never regenerated
  // nor sent to VERI*FACTU, and its number is the printed one, outside the series
  importedAt: timestamp('imported_at', { mode: 'date', withTimezone: true, precision: 3 }),
  // How the customer pays; the due dates themselves are in payment_instalments
  paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
}, table => [
  index('invoices_organization_id_index').on(table.organizationId),
  index('invoices_customer_id_index').on(table.customerId),
  unique('invoices_organization_number_unique').on(table.organizationId, table.number),
]);

export const invoiceItemsTable = pgTable('invoice_items', {
  ...createPrimaryKeyField({ prefix: INVOICE_ITEM_ID_PREFIX }),
  ...createTimestampColumns(),
  invoiceId: text('invoice_id').notNull().references(() => invoicesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  productId: text('product_id').references(() => invoicingProductsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  description: text('description').notNull(),
  quantityMillis: integer('quantity_millis').notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  discountRateBps: integer('discount_rate_bps').notNull().default(0),
  discountMinor: integer('discount_minor').notNull().default(0),
  position: integer('position').notNull().default(0),
}, table => [
  index('invoice_items_invoice_id_index').on(table.invoiceId),
]);

export const invoiceEventsTable = pgTable('invoice_events', {
  ...createPrimaryKeyField({ prefix: INVOICE_EVENT_ID_PREFIX }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  invoiceId: text('invoice_id').notNull().references(() => invoicesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  type: text('type').notNull(),
  metadata: text('metadata'),
}, table => [
  index('invoice_events_invoice_id_index').on(table.invoiceId),
]);

export const verifactuConfigurationsTable = pgTable('verifactu_configurations', {
  organizationId: text('organization_id').primaryKey().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  mode: text('mode').notNull().default('disabled'),
  applicabilityReason: text('applicability_reason'),
  legalName: text('legal_name'),
  taxId: text('tax_id'),
  certificateConfigured: boolean('certificate_configured').notNull().default(false),
  aeatValidationPassedAt: timestamp('aeat_validation_passed_at', { mode: 'date', withTimezone: true, precision: 3 }),
  responsibleDeclarationAcceptedAt: timestamp('responsible_declaration_accepted_at', { mode: 'date', withTimezone: true, precision: 3 }),
  activatedAt: timestamp('activated_at', { mode: 'date', withTimezone: true, precision: 3 }),
  lockedUntil: timestamp('locked_until', { mode: 'date', withTimezone: true, precision: 3 }),
  transmissionsPaused: boolean('transmissions_paused').notNull().default(false),
  pauseReason: text('pause_reason'),
});

export const verifactuRecordsTable = pgTable('verifactu_records', {
  ...createPrimaryKeyField({ prefix: VERIFACTU_RECORD_ID_PREFIX }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  invoiceId: text('invoice_id').notNull().references(() => invoicesTable.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  recordType: text('record_type').notNull().default('alta'),
  invoiceType: text('invoice_type').notNull().default('F1'),
  status: text('status').notNull().default('pending'),
  previousRecordId: text('previous_record_id'),
  previousHash: text('previous_hash'),
  hash: text('hash').notNull(),
  generatedAt: timestamp('generated_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  payload: text('payload').notNull(),
  xmlPayload: text('xml_payload').notNull(),
  qrUrl: text('qr_url').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date', withTimezone: true, precision: 3 }),
  lastAttemptAt: timestamp('last_attempt_at', { mode: 'date', withTimezone: true, precision: 3 }),
  acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true, precision: 3 }),
  aeatCsv: text('aeat_csv'),
  aeatErrorCode: text('aeat_error_code'),
  aeatErrorDescription: text('aeat_error_description'),
  aeatResponse: text('aeat_response'),
}, table => [
  unique('verifactu_records_idempotency_key_unique').on(table.idempotencyKey),
  index('verifactu_records_invoice_id_index').on(table.invoiceId),
  index('verifactu_records_organization_created_at_index').on(table.organizationId, table.createdAt),
  index('verifactu_records_status_next_attempt_index').on(table.status, table.nextAttemptAt),
]);

export const verifactuAttemptsTable = pgTable('verifactu_attempts', {
  ...createPrimaryKeyField({ prefix: VERIFACTU_ATTEMPT_ID_PREFIX }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  recordId: text('record_id').notNull().references(() => verifactuRecordsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  environment: text('environment').notNull(),
  outcome: text('outcome').notNull(),
  httpStatus: integer('http_status'),
  response: text('response'),
  error: text('error'),
}, table => [index('verifactu_attempts_record_id_index').on(table.recordId)]);

export const verifactuSystemStateTable = pgTable('verifactu_system_state', {
  id: text('id').primaryKey(),
  ...createTimestampColumns(),
  dispatchPaused: boolean('dispatch_paused').notNull().default(false),
  reason: text('reason'),
});
