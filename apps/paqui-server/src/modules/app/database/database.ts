import type { ShutdownServices } from '../graceful-shutdown/graceful-shutdown.services';
import type { Database } from './database.types';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export { setupDatabase };

// Transaction-mode poolers (pgbouncer, Supabase pooler on port 6543) do not support prepared statements
function isTransactionPoolerUrl({ url }: { url: string }) {
  const { port, searchParams } = new URL(url);

  return port === '6543' || searchParams.get('pgbouncer') === 'true';
}

function setupDatabase({
  url,
  poolMaxConnections = 10,
  shutdownServices,
}: {
  url: string;
  poolMaxConnections?: number;
  shutdownServices?: ShutdownServices;
}) {
  const client = postgres(url, {
    max: poolMaxConnections,
    prepare: !isTransactionPoolerUrl({ url }),
    // Silence "NOTICE" messages (e.g. "relation already exists, skipping")
    onnotice: () => {},
  });

  const db: Database = drizzle(client);

  shutdownServices?.registerShutdownHandler({
    id: 'database-client-close',
    handler: async () => client.end({ timeout: 5 }),
  });

  return {
    db,
    client,
  };
}
