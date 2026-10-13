import type { Migration } from './migrations.types';

import { postgresInitialSchemaMigration } from './list/0001-postgres-initial-schema.migration';

export const migrations: Migration[] = [
  postgresInitialSchemaMigration,
];
