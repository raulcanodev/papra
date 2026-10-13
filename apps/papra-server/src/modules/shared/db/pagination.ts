import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgSelect } from 'drizzle-orm/pg-core';

export function withPagination<T extends PgSelect>(query: T, {
  orderByColumn,
  pageIndex,
  pageSize,
}: {
  orderByColumn: PgColumn | SQL;
  pageIndex: number;
  pageSize: number;
}) {
  return query
    .orderBy(orderByColumn)
    .limit(pageSize)
    .offset(pageIndex * pageSize);
}
