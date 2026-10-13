/// <reference types="vite/client" />
import type { Table } from 'drizzle-orm';
import { createNoopLogger } from '@crowlog/logger';
import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { setupInMemoryDatabase } from '../modules/app/database/database.test-utils';
import { getRawQueryRows } from '../modules/app/database/database.usecases';
import { migrations } from './migrations.registry';
import { runMigrations } from './migrations.usecases';

const tableModules = import.meta.glob<Record<string, unknown>>(['../modules/**/*.table.ts', '../modules/**/*.tables.ts'], { eager: true });

function getDrizzleTables() {
  return Object.values(tableModules)
    .flatMap(module => Object.values(module))
    .filter((value): value is Table => is(value, PgTable));
}

describe('migrations registry', () => {
  describe('migrations', () => {
    test('each migration should have a unique name', () => {
      const migrationNames = migrations.map(m => m.name);
      const duplicateMigrationNames = migrationNames.filter(name => migrationNames.filter(n => n === name).length > 1);

      expect(duplicateMigrationNames).to.eql([], 'Each migration should have a unique name');
    });

    test('each migration should have a non empty name', () => {
      const migrationNames = migrations.map(m => m.name);
      const emptyMigrationNames = migrationNames.filter(name => name === '');

      expect(emptyMigrationNames).to.eql([], 'Each migration should have a non empty name');
    });

    test('we can stop to any migration and still have a consistent database state', async () => {
      // Given like 3 migrations [A,B,C], creates [[A], [A,B], [A,B,C]]
      const migrationCombinations = migrations.map((m, i) => migrations.slice(0, i + 1));

      for (const migrationCombination of migrationCombinations) {
        const { db, client } = setupInMemoryDatabase();
        await runMigrations({ db, migrations: migrationCombination, logger: createNoopLogger() });
        await client.close();
      }
    });

    test('after running all migrations, every table and column declared in the drizzle schema exists in the database', async () => {
      const { db, client } = setupInMemoryDatabase();
      await runMigrations({ db, migrations, logger: createNoopLogger() });

      const result = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
      const existingColumns = new Set(getRawQueryRows<{ table_name: string; column_name: string }>(result).map(({ table_name, column_name }) => `${table_name}.${column_name}`));

      const drizzleTables = getDrizzleTables();
      const missingColumns = drizzleTables
        .flatMap(table => Object.values(getTableColumns(table)).map(column => `${getTableName(table)}.${column.name}`))
        .filter(column => !existingColumns.has(column));

      expect(drizzleTables.length).toBeGreaterThan(40);
      expect(missingColumns).to.eql([]);

      await client.close();
    });
  });
});
