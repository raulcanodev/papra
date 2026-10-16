import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const migrationsTable = pgTable(
  'migrations',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    runAt: timestamp('run_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull().$default(() => new Date()),
  },
  t => [
    index('migrations_name_index').on(t.name),
    index('migrations_run_at_index').on(t.runAt),
  ],
);
