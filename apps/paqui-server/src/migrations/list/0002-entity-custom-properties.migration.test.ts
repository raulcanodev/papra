import { createNoopLogger } from '@crowlog/logger';
import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { setupInMemoryDatabase } from '../../modules/app/database/database.test-utils';
import { getRawQueryRows } from '../../modules/app/database/database.usecases';
import { documentsTable } from '../../modules/documents/documents.table';
import { bankConnectionsTable, transactionsTable } from '../../modules/finances/finances.table';
import { organizationsTable } from '../../modules/organizations/organizations.table';
import { runMigrations } from '../migrations.usecases';
import { postgresInitialSchemaMigration } from './0001-postgres-initial-schema.migration';
import { entityCustomPropertiesMigration } from './0002-entity-custom-properties.migration';

const ORG_ID = 'org_111111111111111111111111';

describe('0002 entity custom properties migration', () => {
  test('definitions only used by transactions become transaction ones, shared definitions are duplicated for transactions with their options', async () => {
    const { db, client } = setupInMemoryDatabase();
    await runMigrations({ db, migrations: [postgresInitialSchemaMigration], logger: createNoopLogger() });

    const now = new Date();
    await db.insert(organizationsTable).values({ id: ORG_ID, name: 'Org' });
    await db.insert(bankConnectionsTable).values({ id: 'bc_1', organizationId: ORG_ID, provider: 'mercury', name: 'Bank', apiKey: 'key' });
    await db.insert(transactionsTable).values({ id: 'tx_1', organizationId: ORG_ID, bankConnectionId: 'bc_1', externalId: 'ext_1', date: now, description: 'Coffee', amount: -3, provider: 'mercury' });
    await db.insert(documentsTable).values({ id: 'doc_1', organizationId: ORG_ID, name: 'File', originalName: 'file.pdf', mimeType: 'application/pdf', originalStorageKey: 'key', originalSha256Hash: 'hash' });

    for (const statement of [
      `INSERT INTO "custom_property_definitions" ("id", "created_at", "updated_at", "organization_id", "name", "key", "type") VALUES
        ('cpd_doc', now(), now(), '${ORG_ID}', 'Doc only', 'doc-only', 'text'),
        ('cpd_tx', now(), now(), '${ORG_ID}', 'Tx only', 'tx-only', 'text'),
        ('cpd_shared', now(), now(), '${ORG_ID}', 'Category', 'category', 'select'),
        ('cpd_unused', now(), now(), '${ORG_ID}', 'Unused', 'unused', 'number')`,
      `INSERT INTO "custom_property_select_options" ("id", "created_at", "updated_at", "property_definition_id", "name", "key") VALUES
        ('cpso_a', now(), now(), 'cpd_shared', 'A', 'a'),
        ('cpso_b', now(), now(), 'cpd_shared', 'B', 'b')`,
      `INSERT INTO "document_custom_property_values" ("id", "created_at", "updated_at", "document_id", "property_definition_id", "text_value", "select_option_id") VALUES
        ('dcpv_1', now(), now(), 'doc_1', 'cpd_doc', 'hello', NULL),
        ('dcpv_2', now(), now(), 'doc_1', 'cpd_shared', NULL, 'cpso_a')`,
      `INSERT INTO "transaction_custom_property_values" ("id", "created_at", "updated_at", "transaction_id", "property_definition_id", "text_value", "select_option_id") VALUES
        ('tcpv_1', now(), now(), 'tx_1', 'cpd_tx', 'world', NULL),
        ('tcpv_2', now(), now(), 'tx_1', 'cpd_shared', NULL, 'cpso_b')`,
    ]) {
      await db.execute(sql.raw(statement));
    }

    await runMigrations({ db, migrations: [postgresInitialSchemaMigration, entityCustomPropertiesMigration], logger: createNoopLogger() });

    const definitions = getRawQueryRows<{ id: string; name: string; entity_type: string }>(
      await db.execute(sql`SELECT "id", "name", "entity_type" FROM "custom_property_definitions" ORDER BY "name", "entity_type"`),
    );

    expect(definitions.map(({ name, entity_type }) => ({ name, entity_type }))).to.eql([
      { name: 'Category', entity_type: 'document' },
      { name: 'Category', entity_type: 'transaction' },
      { name: 'Doc only', entity_type: 'document' },
      { name: 'Tx only', entity_type: 'transaction' },
      { name: 'Unused', entity_type: 'document' },
    ]);

    const transactionCategoryId = definitions.find(({ name, entity_type }) => name === 'Category' && entity_type === 'transaction')!.id;
    expect(transactionCategoryId).not.to.eql('cpd_shared');

    // The transaction value now points to the duplicated definition and to its own copy of the option
    const [transactionValue] = getRawQueryRows<{ property_definition_id: string; option_name: string; option_definition_id: string }>(await db.execute(sql`
      SELECT v."property_definition_id", o."name" AS "option_name", o."property_definition_id" AS "option_definition_id"
      FROM "transaction_custom_property_values" v JOIN "custom_property_select_options" o ON o."id" = v."select_option_id"
      WHERE v."id" = 'tcpv_2'
    `));

    expect(transactionValue).to.eql({ property_definition_id: transactionCategoryId, option_name: 'B', option_definition_id: transactionCategoryId });

    // The document side is untouched
    const documentValues = getRawQueryRows<{ property_definition_id: string; select_option_id: string | null }>(
      await db.execute(sql`SELECT "property_definition_id", "select_option_id" FROM "document_custom_property_values" ORDER BY "id"`),
    );

    expect(documentValues).to.eql([
      { property_definition_id: 'cpd_doc', select_option_id: null },
      { property_definition_id: 'cpd_shared', select_option_id: 'cpso_a' },
    ]);

    await client.close();
  });

  test('a value cannot reference a definition of another organization or another entity type, nor an option of another definition', async () => {
    const { db, client } = setupInMemoryDatabase();
    await runMigrations({ db, migrations: [postgresInitialSchemaMigration, entityCustomPropertiesMigration], logger: createNoopLogger() });

    await db.insert(organizationsTable).values([{ id: ORG_ID, name: 'Org' }, { id: 'org_2', name: 'Other' }]);
    for (const statement of [
      `INSERT INTO "custom_property_definitions" ("id", "created_at", "updated_at", "organization_id", "name", "key", "type", "entity_type") VALUES
        ('cpd_customer', now(), now(), '${ORG_ID}', 'Segment', 'segment', 'select', 'customer'),
        ('cpd_other', now(), now(), '${ORG_ID}', 'Tier', 'tier', 'select', 'customer')`,
      `INSERT INTO "custom_property_select_options" ("id", "created_at", "updated_at", "property_definition_id", "name", "key") VALUES
        ('cpso_other', now(), now(), 'cpd_other', 'Gold', 'gold')`,
    ]) {
      await db.execute(sql.raw(statement));
    }

    const insertValue = async ({ organizationId, entityType, selectOptionId = null }: { organizationId: string; entityType: string; selectOptionId?: string | null }) => db.execute(sql`
      INSERT INTO "entity_custom_property_values" ("id", "created_at", "updated_at", "organization_id", "entity_type", "entity_id", "property_definition_id", "select_option_id")
      VALUES (${`ecpv_${Math.random()}`}, now(), now(), ${organizationId}, ${entityType}, 'cus_1', 'cpd_customer', ${selectOptionId})
    `);

    await expect(insertValue({ organizationId: 'org_2', entityType: 'customer' })).rejects.toThrow();
    await expect(insertValue({ organizationId: ORG_ID, entityType: 'product' })).rejects.toThrow();
    await expect(insertValue({ organizationId: ORG_ID, entityType: 'customer', selectOptionId: 'cpso_other' })).rejects.toThrow();
    await expect(insertValue({ organizationId: ORG_ID, entityType: 'customer' })).resolves.toBeDefined();

    await client.close();
  });
});
