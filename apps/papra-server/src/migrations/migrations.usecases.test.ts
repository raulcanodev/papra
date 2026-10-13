import type { Database } from '../modules/app/database/database.types';
import type { Migration } from './migrations.types';
import { createNoopLogger } from '@crowlog/logger';
import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { setupInMemoryDatabase } from '../modules/app/database/database.test-utils';
import { getRawQueryRows } from '../modules/app/database/database.usecases';
import { migrationsTable } from './migration.tables';
import { rollbackLastAppliedMigration, runMigrations } from './migrations.usecases';

const createTableUserMigration: Migration = {
  name: 'create-table-user',
  up: async ({ db }) => {
    await db.execute(sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`);
  },
  down: async ({ db }) => {
    await db.execute(sql`DROP TABLE users`);
  },
};

const createTableOrganizationMigration: Migration = {
  name: 'create-table-organization',
  up: async ({ db }) => {
    await db.execute(sql`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`);
    await db.execute(sql`CREATE TABLE organization_members (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`);
  },
  down: async ({ db }) => {
    await db.execute(sql`DROP TABLE organizations`);
    await db.execute(sql`DROP TABLE organization_members`);
  },
};

const createTableDocumentMigration: Migration = {
  name: 'create-table-document',
  up: async ({ db }) => {
    await db.execute(sql`CREATE TABLE documents (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`);
  },
  down: async ({ db }) => {
    await db.execute(sql`DROP TABLE documents`);
  },
};

async function getPublicRelationNames({ db }: { db: Database }) {
  const result = await db.execute(sql`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'i') ORDER BY c.relname`);

  return getRawQueryRows<{ name: string }>(result).map(({ name }) => name);
}

describe('migrations usecases', () => {
  describe('runMigrations', () => {
    test('should run all migrations that are not already applied', async () => {
      const { db } = setupInMemoryDatabase();

      const migrations = [createTableUserMigration, createTableOrganizationMigration];

      await runMigrations({ db, migrations, logger: createNoopLogger() });

      const migrationsInDb = await db.select().from(migrationsTable);

      expect(migrationsInDb.map(({ id, name }) => ({ id, name }))).to.eql([
        { id: 1, name: 'create-table-user' },
        { id: 2, name: 'create-table-organization' },
      ]);

      migrations.push(createTableDocumentMigration);

      await runMigrations({ db, migrations, logger: createNoopLogger() });

      const migrationsInDb2 = await db.select().from(migrationsTable);

      expect(migrationsInDb2.map(({ id, name }) => ({ id, name }))).to.eql([
        { id: 1, name: 'create-table-user' },
        { id: 2, name: 'create-table-organization' },
        { id: 3, name: 'create-table-document' },
      ]);

      // Ensure all tables and indexes are created
      expect(await getPublicRelationNames({ db })).to.eql([
        'documents',
        'documents_pkey',
        'migrations',
        'migrations_name_index',
        'migrations_pkey',
        'migrations_run_at_index',
        'organization_members',
        'organization_members_pkey',
        'organizations',
        'organizations_pkey',
        'users',
        'users_pkey',
      ]);
    });
  });

  describe('rollbackLastAppliedMigration', () => {
    test('the last migration down is called', async () => {
      const { db } = setupInMemoryDatabase();

      const migrations = [createTableUserMigration, createTableDocumentMigration];

      await runMigrations({ db, migrations, logger: createNoopLogger() });

      const initialMigrations = await db.select().from(migrationsTable);

      expect(initialMigrations.map(({ id, name }) => ({ id, name }))).to.eql([
        { id: 1, name: 'create-table-user' },
        { id: 2, name: 'create-table-document' },
      ]);

      // Ensure the tables exists, no error is thrown
      await db.execute(sql`SELECT * FROM users`);
      await db.execute(sql`SELECT * FROM documents`);

      await rollbackLastAppliedMigration({ db, migrations });

      const migrationsInDb = await db.select().from(migrationsTable);

      expect(migrationsInDb.map(({ id, name }) => ({ id, name }))).to.eql([
        { id: 1, name: 'create-table-user' },
      ]);

      // Ensure the table document is dropped
      await db.execute(sql`SELECT * FROM users`);
      await expect(db.execute(sql`SELECT * FROM documents`)).rejects.toThrow();
    });

    test('when their is no migration to rollback, nothing is done', async () => {
      const { db } = setupInMemoryDatabase();

      await rollbackLastAppliedMigration({ db });

      const migrationsInDb = await db.select().from(migrationsTable);

      expect(migrationsInDb).to.eql([]);
    });

    test('when the last migration in the database does not exist in the migrations list, an error is thrown', async () => {
      const { db } = setupInMemoryDatabase();

      await runMigrations({ db, migrations: [createTableUserMigration], logger: createNoopLogger() });

      await expect(
        rollbackLastAppliedMigration({ db, migrations: [] }),
      ).rejects.toThrow('Migration create-table-user not found');
    });
  });
});
