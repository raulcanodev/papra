import type { Database } from '../app/database/database.types';
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { verifactuAttemptsTable, verifactuConfigurationsTable, verifactuRecordsTable, verifactuSystemStateTable } from './invoicing.tables';

export type VerifactuTransportResult = {
  outcome: 'accepted' | 'accepted_with_errors' | 'rejected';
  httpStatus: number;
  response: string;
  csv?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
};

export type VerifactuTransport = {
  send: (request: { environment: 'test' | 'production'; xmlPayload: string; organizationId: string; recordId: string }) => Promise<VerifactuTransportResult>;
};

export async function dispatchPendingVerifactuRecords({ db, transport, now = new Date(), limit = 50 }: { db: Database; transport: VerifactuTransport; now?: Date; limit?: number }) {
  const [systemState] = await db.select().from(verifactuSystemStateTable).where(eq(verifactuSystemStateTable.id, 'global')).limit(1);
  if (systemState?.dispatchPaused === true) {
    return { processed: 0, paused: true };
  }

  const records = await db.select({ record: verifactuRecordsTable, configuration: verifactuConfigurationsTable })
    .from(verifactuRecordsTable)
    .innerJoin(verifactuConfigurationsTable, eq(verifactuConfigurationsTable.organizationId, verifactuRecordsTable.organizationId))
    .where(and(
      inArray(verifactuRecordsTable.status, ['pending', 'retrying']),
      or(isNull(verifactuRecordsTable.nextAttemptAt), lte(verifactuRecordsTable.nextAttemptAt, now)),
      eq(verifactuConfigurationsTable.transmissionsPaused, false),
      inArray(verifactuConfigurationsTable.mode, ['test', 'production']),
    ))
    .limit(limit);

  let processed = 0;
  for (const { record, configuration } of records) {
    const claimed = await db.update(verifactuRecordsTable)
      .set({ status: 'sending', lastAttemptAt: now, attemptCount: record.attemptCount + 1 })
      .where(and(eq(verifactuRecordsTable.id, record.id), inArray(verifactuRecordsTable.status, ['pending', 'retrying'])))
      .returning({ id: verifactuRecordsTable.id });
    if (claimed.length === 0) {
      continue;
    }
    const environment = configuration.mode === 'production' ? 'production' : 'test';
    try {
      const result = await transport.send({ environment, xmlPayload: record.xmlPayload, organizationId: record.organizationId, recordId: record.id });
      await db.insert(verifactuAttemptsTable).values({ createdAt: now, recordId: record.id, environment, outcome: result.outcome, httpStatus: result.httpStatus, response: result.response });
      await db.update(verifactuRecordsTable).set({
        status: result.outcome,
        acceptedAt: result.outcome === 'rejected' ? null : now,
        aeatCsv: result.csv ?? null,
        aeatErrorCode: result.errorCode ?? null,
        aeatErrorDescription: result.errorDescription ?? null,
        aeatResponse: result.response,
        nextAttemptAt: null,
      }).where(eq(verifactuRecordsTable.id, record.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown VERI*FACTU transport error';
      await db.insert(verifactuAttemptsTable).values({ createdAt: now, recordId: record.id, environment, outcome: 'transport_error', error: message });
      await db.update(verifactuRecordsTable).set({
        status: 'retrying',
        aeatErrorDescription: message,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(record.attemptCount + 1)),
      }).where(eq(verifactuRecordsTable.id, record.id));
    }
    processed += 1;
  }
  return { processed, paused: false };
}

function retryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1_000, 30 * 1_000 * 2 ** Math.min(attempt - 1, 7));
}
