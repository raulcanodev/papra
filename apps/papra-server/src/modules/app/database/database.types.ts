import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type Database = PgDatabase<PgQueryResultHKT, Record<string, never>>;
