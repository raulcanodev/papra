import type { ConfigDefinition } from 'figue';
import { urlSchema } from '../../config/config.schemas';
import { coercedPositiveIntegerSchema } from '../../shared/schemas/number.schemas';

export const databaseConfig = {
  url: {
    doc: 'The PostgreSQL connection URL of the database (e.g. `postgresql://user:password@host:5432/dbname`). When using Supabase, use the session pooler connection string (port 5432), or the transaction pooler one (port 6543).',
    schema: urlSchema,
    default: 'postgresql://postgres:postgres@localhost:5432/papra',
    env: 'DATABASE_URL',
  },
  poolMaxConnections: {
    doc: 'The maximum number of connections in the database connection pool',
    schema: coercedPositiveIntegerSchema,
    default: 10,
    env: 'DATABASE_POOL_MAX_CONNECTIONS',
  },
} as const satisfies ConfigDefinition;
