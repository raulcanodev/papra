import type { Migration } from './migrations.types';

import { postgresInitialSchemaMigration } from './list/0001-postgres-initial-schema.migration';
import { entityCustomPropertiesMigration } from './list/0002-entity-custom-properties.migration';
import { contactsMigration } from './list/0003-contacts.migration';
import { invoiceWithholdingMigration } from './list/0004-invoice-withholding.migration';
import { purchaseInvoicesMigration } from './list/0005-purchase-invoices.migration';
import { taxProfileMigration } from './list/0006-tax-profile.migration';

export const migrations: Migration[] = [
  postgresInitialSchemaMigration,
  entityCustomPropertiesMigration,
  contactsMigration,
  invoiceWithholdingMigration,
  purchaseInvoicesMigration,
  taxProfileMigration,
];
