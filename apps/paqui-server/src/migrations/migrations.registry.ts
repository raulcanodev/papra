import type { Migration } from './migrations.types';

import { postgresInitialSchemaMigration } from './list/0001-postgres-initial-schema.migration';
import { entityCustomPropertiesMigration } from './list/0002-entity-custom-properties.migration';
import { contactsMigration } from './list/0003-contacts.migration';
import { invoiceWithholdingMigration } from './list/0004-invoice-withholding.migration';
import { purchaseInvoicesMigration } from './list/0005-purchase-invoices.migration';
import { taxProfileMigration } from './list/0006-tax-profile.migration';
import { memberPreferencesMigration } from './list/0007-member-preferences.migration';
import { entityAppearanceMigration } from './list/0008-entity-appearance.migration';
import { productContactMigration } from './list/0009-product-contact.migration';
import { purchaseDocumentKindMigration } from './list/0010-purchase-document-kind.migration';
import { captureSessionsMigration } from './list/0011-capture-sessions.migration';
import { documentAiDataMigration } from './list/0012-document-ai-data.migration';
import { userPhoneMigration } from './list/0013-user-phone.migration';
import { captureOpenedAtMigration } from './list/0014-capture-opened-at.migration';
import { documentReadingsMigration } from './list/0015-document-readings.migration';
import { gestoriasMigration } from './list/0016-gestorias.migration';
import { gestoriaInvitationsMigration } from './list/0017-gestoria-invitations.migration';
import { pricingMigration } from './list/0018-pricing.migration';
import { dueDatesMigration } from './list/0019-due-dates.migration';
import { aiUsageMigration } from './list/0020-ai-usage.migration';
import { priceListAdjustmentsMigration } from './list/0021-price-list-adjustments.migration';
import { hideDocumentsNavigationMigration } from './list/0022-hide-documents-navigation.migration';
import { deliveryNotesMigration } from './list/0023-delivery-notes.migration';
import { intakeEmailAliasesMigration } from './list/0024-intake-email-aliases.migration';
import { adminImpersonationsMigration } from './list/0025-admin-impersonations.migration';
import { equivalenceSurchargeMigration } from './list/0026-equivalence-surcharge.migration';
import { optionalPaymentTermsMigration } from './list/0027-optional-payment-terms.migration';
import { invoiceItemFixedDiscountMigration } from './list/0028-invoice-item-fixed-discount.migration';
import { optionalDefaultPaymentTermsMigration } from './list/0029-optional-default-payment-terms.migration';
import { contactBankAccountMigration } from './list/0030-contact-bank-account.migration';
import { importedIssuedInvoicesMigration } from './list/0031-imported-issued-invoices.migration';
import { readOnlyImpersonationsMigration } from './list/0032-read-only-impersonations.migration';
import { purchaseItemPreciseUnitPriceMigration } from './list/0033-purchase-item-precise-unit-price.migration';

export const migrations: Migration[] = [
  postgresInitialSchemaMigration,
  entityCustomPropertiesMigration,
  contactsMigration,
  invoiceWithholdingMigration,
  purchaseInvoicesMigration,
  taxProfileMigration,
  memberPreferencesMigration,
  entityAppearanceMigration,
  productContactMigration,
  purchaseDocumentKindMigration,
  captureSessionsMigration,
  documentAiDataMigration,
  userPhoneMigration,
  captureOpenedAtMigration,
  documentReadingsMigration,
  gestoriasMigration,
  gestoriaInvitationsMigration,
  pricingMigration,
  dueDatesMigration,
  aiUsageMigration,
  priceListAdjustmentsMigration,
  hideDocumentsNavigationMigration,
  deliveryNotesMigration,
  intakeEmailAliasesMigration,
  adminImpersonationsMigration,
  equivalenceSurchargeMigration,
  optionalPaymentTermsMigration,
  invoiceItemFixedDiscountMigration,
  optionalDefaultPaymentTermsMigration,
  contactBankAccountMigration,
  importedIssuedInvoicesMigration,
  readOnlyImpersonationsMigration,
  purchaseItemPreciseUnitPriceMigration,
];
