import { createNoopLogger } from '@crowlog/logger';
import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { setupInMemoryDatabase } from '../../modules/app/database/database.test-utils';
import { getRawQueryRows } from '../../modules/app/database/database.usecases';
import { organizationsTable } from '../../modules/organizations/organizations.table';
import { runMigrations } from '../migrations.usecases';
import { postgresInitialSchemaMigration } from './0001-postgres-initial-schema.migration';
import { entityCustomPropertiesMigration } from './0002-entity-custom-properties.migration';
import { contactsMigration } from './0003-contacts.migration';

const ORG_ID = 'org_111111111111111111111111';

async function seedBeforeContacts() {
  const { db, client } = setupInMemoryDatabase();
  await runMigrations({ db, migrations: [postgresInitialSchemaMigration, entityCustomPropertiesMigration], logger: createNoopLogger() });

  await db.insert(organizationsTable).values({ id: ORG_ID, name: 'Org' });

  for (const statement of [
    `INSERT INTO "invoicing_customers" ("id", "created_at", "updated_at", "organization_id", "name", "email", "tax_id") VALUES ('cus_1', now(), now(), '${ORG_ID}', 'Acme SL', 'billing@acme.test', 'B12345678')`,
    `INSERT INTO "invoicing_sales_representatives" ("id", "created_at", "updated_at", "organization_id", "name", "email", "phone") VALUES ('rep_1', now(), now(), '${ORG_ID}', 'Laura', 'laura@org.test', '+34 600 000 001')`,
    `INSERT INTO "invoices" ("id", "created_at", "updated_at", "organization_id", "customer_id", "sales_representative_id", "issue_date", "due_date") VALUES ('inv_1', now(), now(), '${ORG_ID}', 'cus_1', 'rep_1', now(), now())`,
    `INSERT INTO "document_folders" ("id", "created_at", "updated_at", "organization_id", "customer_id", "name", "kind") VALUES ('fld_1', now(), now(), '${ORG_ID}', 'cus_1', 'Acme SL', 'customer')`,
  ]) {
    await db.execute(sql.raw(statement));
  }

  return { db, client };
}

describe('0003 contacts migration', () => {
  test('customers and sales representatives become contacts with their roles and ids, invoices and folders follow', async () => {
    const { db, client } = await seedBeforeContacts();

    await runMigrations({ db, migrations: [postgresInitialSchemaMigration, entityCustomPropertiesMigration, contactsMigration], logger: createNoopLogger() });

    const contacts = getRawQueryRows<{ id: string; name: string; kind: string; phone: string | null; is_customer: boolean; is_supplier: boolean; is_sales_representative: boolean }>(
      await db.execute(sql`SELECT "id", "name", "kind", "phone", "is_customer", "is_supplier", "is_sales_representative" FROM "contacts" ORDER BY "id"`),
    );

    expect(contacts).to.eql([
      { id: 'cus_1', name: 'Acme SL', kind: 'company', phone: null, is_customer: true, is_supplier: false, is_sales_representative: false },
      { id: 'rep_1', name: 'Laura', kind: 'person', phone: '+34 600 000 001', is_customer: false, is_supplier: false, is_sales_representative: true },
    ]);

    const [invoice] = getRawQueryRows<{ customer_id: string; sales_representative_id: string }>(await db.execute(sql`SELECT "customer_id", "sales_representative_id" FROM "invoices"`));
    expect(invoice).to.eql({ customer_id: 'cus_1', sales_representative_id: 'rep_1' });

    const [folder] = getRawQueryRows<{ contact_id: string; kind: string }>(await db.execute(sql`SELECT "contact_id", "kind" FROM "document_folders"`));
    expect(folder).to.eql({ contact_id: 'cus_1', kind: 'contact' });

    // The sales representative foreign key now targets the contacts
    await expect(db.execute(sql`UPDATE "invoices" SET "sales_representative_id" = 'missing'`)).rejects.toThrow();

    await client.close();
  });

  test('rolling back restores the customers and sales representatives tables', async () => {
    const { db, client } = await seedBeforeContacts();

    await contactsMigration.up({ db });
    await contactsMigration.down({ db });

    const customers = getRawQueryRows<{ id: string }>(await db.execute(sql`SELECT "id" FROM "invoicing_customers"`));
    const representatives = getRawQueryRows<{ id: string; phone: string }>(await db.execute(sql`SELECT "id", "phone" FROM "invoicing_sales_representatives"`));
    const [folder] = getRawQueryRows<{ customer_id: string; kind: string }>(await db.execute(sql`SELECT "customer_id", "kind" FROM "document_folders"`));

    expect(customers).to.eql([{ id: 'cus_1' }]);
    expect(representatives).to.eql([{ id: 'rep_1', phone: '+34 600 000 001' }]);
    expect(folder).to.eql({ customer_id: 'cus_1', kind: 'customer' });

    await client.close();
  });
});
