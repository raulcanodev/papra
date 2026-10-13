import type { Database } from '../database/database.types';
import { safely } from '@corentinth/chisels';
import { sql } from 'drizzle-orm';
import { getRawQueryRows } from '../database/database.usecases';

export async function isDatabaseHealthy({ db }: { db: Database }) {
  const [result, error] = await safely(db.execute(sql`SELECT 1 AS ok`));

  return error === null && Number(getRawQueryRows<{ ok: number }>(result)[0]?.ok) === 1;
}
