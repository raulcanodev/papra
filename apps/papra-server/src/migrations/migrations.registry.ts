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
];
