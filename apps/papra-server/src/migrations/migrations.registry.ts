import type { Migration } from './migrations.types';

import { postgresInitialSchemaMigration } from './list/0001-postgres-initial-schema.migration';
import { entityCustomPropertiesMigration } from './list/0002-entity-custom-properties.migration';
import { contactsMigration } from './list/0003-contacts.migration';

export const migrations: Migration[] = [
  postgresInitialSchemaMigration,
  entityCustomPropertiesMigration,
  contactsMigration,
];
