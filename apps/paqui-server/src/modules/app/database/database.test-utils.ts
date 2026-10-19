import type { Database } from './database.types';
import { createNoopLogger } from '@crowlog/logger';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { onTestFinished } from 'vitest';
import { runMigrations } from '../../../migrations/migrations.usecases';
import { apiKeyOrganizationsTable, apiKeysTable } from '../../api-keys/api-keys.tables';
import { customPropertyDefinitionsTable, documentCustomPropertyValuesTable } from '../../custom-properties/custom-properties.table';
import { customPropertySelectOptionsTable } from '../../custom-properties/options/custom-properties-options.table';
import { documentsTable } from '../../documents/documents.table';
import { intakeEmailDeliveriesTable, intakeEmailsTable } from '../../intake-emails/intake-emails.tables';
import { organizationInvitationsTable, organizationMembersTable, organizationsTable } from '../../organizations/organizations.table';
import { userRolesTable } from '../../roles/roles.table';
import { organizationSubscriptionsTable } from '../../subscriptions/subscriptions.tables';
import { taggingRuleActionsTable, taggingRuleConditionsTable, taggingRulesTable } from '../../tagging-rules/tagging-rules.tables';
import { documentsTagsTable, tagsTable } from '../../tags/tags.table';
import { usersTable } from '../../users/users.table';
import { webhookDeliveriesTable, webhookEventsTable, webhooksTable } from '../../webhooks/webhooks.tables';

export { createInMemoryDatabase, seedDatabase, setupInMemoryDatabase };

// In-memory PostgreSQL (PGlite, wasm) used for tests
function setupInMemoryDatabase({ loadDataDir }: { loadDataDir?: Blob | File } = {}) {
  const client = new PGlite({ loadDataDir });
  const db: Database = drizzle(client);

  return { db, client };
}

// Running the migrations on each new database is slow, so we migrate a template database once
// and clone its data directory for each new in-memory database
let migratedDataDirPromise: Promise<Blob | File> | undefined;

async function getMigratedDataDir() {
  migratedDataDirPromise ??= (async () => {
    const { db, client } = setupInMemoryDatabase();

    await runMigrations({
      db,
      // In memory logger to avoid polluting the console with migrations logs
      logger: createNoopLogger(),
    });

    const dataDir = await client.dumpDataDir('none');
    await client.close();

    return dataDir;
  })();

  return migratedDataDirPromise;
}

async function createInMemoryDatabase(seedOptions: Omit<Parameters<typeof seedDatabase>[0], 'db'> | undefined = {}) {
  const { db, client } = setupInMemoryDatabase({ loadDataDir: await getMigratedDataDir() });

  // Free the wasm memory once the test is done, when created within a test (not possible when created in a describe block)
  try {
    onTestFinished(async () => {
      if (!client.closed) {
        await client.close();
      }
    });
  } catch {}

  await seedDatabase({ db, ...seedOptions });

  return {
    db,
    client,
  };
}

const seedTables = {
  users: usersTable,
  organizations: organizationsTable,
  organizationMembers: organizationMembersTable,
  documents: documentsTable,
  tags: tagsTable,
  documentsTags: documentsTagsTable,
  intakeEmails: intakeEmailsTable,
  intakeEmailDeliveries: intakeEmailDeliveriesTable,
  organizationSubscriptions: organizationSubscriptionsTable,
  taggingRules: taggingRulesTable,
  taggingRuleConditions: taggingRuleConditionsTable,
  taggingRuleActions: taggingRuleActionsTable,
  apiKeys: apiKeysTable,
  apiKeyOrganizations: apiKeyOrganizationsTable,
  webhooks: webhooksTable,
  webhookEvents: webhookEventsTable,
  webhookDeliveries: webhookDeliveriesTable,
  organizationInvitations: organizationInvitationsTable,
  userRoles: userRolesTable,
  customPropertyDefinitions: customPropertyDefinitionsTable,
  customPropertySelectOptions: customPropertySelectOptionsTable,
  documentCustomPropertyValues: documentCustomPropertyValuesTable,
} as const;

type SeedTablesRows = {
  [K in keyof typeof seedTables]?: typeof seedTables[K] extends { $inferInsert: infer T } ? T[] : never;
};

async function seedDatabase({ db, ...seedRows }: { db: Database } & SeedTablesRows) {
  // Inserted sequentially, following the seedTables order, so foreign keys are satisfied
  for (const [table, schema] of Object.entries(seedTables)) {
    const rows = seedRows[table as keyof typeof seedTables];

    if (rows === undefined || rows.length === 0) {
      continue;
    }

    await db.insert(schema).values(rows as never[]).execute();
  }
}
