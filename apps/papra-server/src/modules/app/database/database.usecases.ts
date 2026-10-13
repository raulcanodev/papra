import type { PgSelect } from 'drizzle-orm/pg-core';
import type { ArrayElement } from '../../shared/types';

export function createIterator<T extends PgSelect>({
  query,
  batchSize = 100,
}: { query: T; batchSize?: number }): AsyncGenerator<ArrayElement<T['_']['result']>> {
  return createBatchedIterator({
    getBatch: async ({ offset, limit }) => await query.limit(limit).offset(offset) as ArrayElement<T['_']['result']>[],
    batchSize,
  });
}

export async function* createBatchedIterator<T>({
  getBatch,
  batchSize = 100,
}: {
  getBatch: (args: { offset: number; limit: number }) => Promise<T[]>;
  batchSize?: number;
}): AsyncGenerator<T> {
  let offset = 0;

  while (true) {
    const results = await getBatch({ offset, limit: batchSize });
    if (results.length === 0) {
      break;
    }

    for (const result of results) {
      yield result;
    }

    if (results.length < batchSize) {
      break;
    }

    offset += batchSize;
  }
}

// The result of a raw `db.execute` query depends on the driver: an array of rows for postgres-js, a `{ rows }` object for pglite (used in tests)
export function getRawQueryRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }

  return [];
}
